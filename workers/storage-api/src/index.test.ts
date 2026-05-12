import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from './index';

type TestHandler = {
    fetch(request: Request, env: Env): Promise<Response>;
};

async function importHandler(): Promise<TestHandler> {
    const mod = await import('./index');
    return mod.default as TestHandler;
}

function createEnv(overrides?: Partial<Env>): Env {
    return {
        ALLOWED_ORIGINS: 'https://youtick.net,http://localhost:3000,http://localhost:3001',
        STORAGE_PROVIDER: 'lighthouse',
        LIGHTHOUSE_API_BASE: 'https://api.lighthouse.storage',
        ...overrides,
    };
}

function createMemoryKv(): KVNamespace {
    const store = new Map<string, string>();
    return {
        get: vi.fn(async (key: string) => store.get(key) ?? null),
        put: vi.fn(async (key: string, value: string) => {
            store.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
            store.delete(key);
        }),
    } as unknown as KVNamespace;
}

function createGuardedEnv(overrides?: Partial<Env>): Env {
    return createEnv({
        LIGHTHOUSE_API_KEY: 'secret-value',
        ENABLE_LIGHTHOUSE_UPLOADS: 'true',
        UPLOAD_INTENT_SECRET: 'intent-secret',
        UPLOAD_GUARD: createMemoryKv(),
        ...overrides,
    });
}

async function seedUploadAuthToken(env: Env, accountId = 'creator.testnet'): Promise<string> {
    const token = `auth-token-${crypto.randomUUID()}`;
    await env.UPLOAD_GUARD?.put(`auth:token:${token}`, JSON.stringify({
        accountId,
        publicKey: 'ed25519:test-public-key',
        expiresAt: Date.now() + 10 * 60 * 1000,
    }));
    return token;
}

async function issueUploadIntent(
    handler: TestHandler,
    env: Env,
    body: Record<string, unknown>,
): Promise<string> {
    const authToken = await seedUploadAuthToken(env);
    const response = await handler.fetch(
        new Request('https://storage.youtick.net/uploads/intent', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ...body,
            }),
        }),
        env,
    );

    expect(response.status).toBe(200);
    const parsed = await response.json() as {
        workerProxy?: {
            intentToken?: string;
        };
    };
    expect(typeof parsed.workerProxy?.intentToken).toBe('string');
    return parsed.workerProxy?.intentToken || '';
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes: Uint8Array): string {
    if (bytes.length === 0) {
        return '';
    }

    const digits: number[] = [0];
    for (const byte of bytes) {
        let carry = byte;
        for (let index = 0; index < digits.length; index += 1) {
            carry += digits[index] << 8;
            digits[index] = carry % 58;
            carry = (carry / 58) | 0;
        }
        while (carry > 0) {
            digits.push(carry % 58);
            carry = (carry / 58) | 0;
        }
    }

    let leading = 0;
    while (leading < bytes.length && bytes[leading] === 0) {
        leading += 1;
    }

    return '1'.repeat(leading) + digits.reverse().map((digit) => BASE58_ALPHABET[digit]).join('');
}

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

function encodeU32LE(value: number): Uint8Array {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value, true);
    return out;
}

function encodeStringBorsh(value: string): Uint8Array {
    const bytes = new TextEncoder().encode(value);
    const out = new Uint8Array(4 + bytes.length);
    out.set(encodeU32LE(bytes.length), 0);
    out.set(bytes, 4);
    return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

async function serializeNep413Hash(payload: {
    message: string;
    nonce: Uint8Array;
    recipient: string;
}): Promise<Uint8Array> {
    const serialized = concatBytes(
        encodeU32LE(2147484061),
        encodeStringBorsh(payload.message),
        payload.nonce,
        encodeStringBorsh(payload.recipient),
        new Uint8Array([0]),
    );
    const digest = await crypto.subtle.digest('SHA-256', serialized);
    return new Uint8Array(digest);
}

describe('storage-api', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns service health without exposing secrets', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/__health', {
                headers: { Origin: 'https://youtick.net' },
            }),
            createEnv({ LIGHTHOUSE_API_KEY: 'secret-value' }),
        );

        expect(response.status).toBe(200);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://youtick.net');
        expect(response.headers.get('Cache-Control')).toBe('no-store');

        const body = await response.json() as Record<string, unknown>;
        expect(body.status).toBe('ok');
        expect(body.service).toBe('storage-api');
        expect(body.provider).toBe('lighthouse');
        expect(JSON.stringify(body)).not.toContain('secret-value');
    });

    it('reports provider not ready when the Lighthouse secret is missing', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/provider-health'),
            createEnv(),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            provider: 'lighthouse',
            ready: false,
            reason: 'lighthouse_api_key_missing',
            apiBase: 'https://api.lighthouse.storage',
        });
    });

    it('reports provider ready when the Lighthouse secret is configured', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/provider-health'),
            createEnv({ LIGHTHOUSE_API_KEY: 'secret-value' }),
        );

        expect(await response.json()).toEqual({
            provider: 'lighthouse',
            ready: true,
            apiBase: 'https://api.lighthouse.storage',
            uploadsEnabled: false,
            uploadGuardReady: false,
            uploadBase: 'https://upload.lighthouse.storage',
            maxUploadBytes: 104857600,
        });
    });

    it('pins an existing CID through Lighthouse without exposing the API key', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const env = createGuardedEnv({ LIGHTHOUSE_API_KEY: '"secret-value"' });
        const token = await issueUploadIntent(handler, env, {
            uploadKind: 'pin',
            fileName: 'manifest-root',
            sizeBytes: 1,
            contentType: 'application/ipfs-cid',
            cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
        });
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/pins', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
                    fileName: 'manifest-root',
                }),
            }),
            env,
        );

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.lighthouse.storage/api/lighthouse/pin',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer secret-value',
                    'Content-Type': 'application/json',
                }) as HeadersInit,
            }),
        );

        const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
        const upstreamRequest = calls[0][1];
        const upstreamBody = JSON.parse(upstreamRequest.body as string);
        expect(upstreamBody).toEqual({
            cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            fileName: 'manifest-root',
        });

        const body = await response.json() as Record<string, unknown>;
        expect(body.pinned).toBe(true);
        expect(JSON.stringify(body)).not.toContain('secret-value');
    });

    it('rejects pin requests when provider secret is missing', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/pins', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja' }),
            }),
            createEnv(),
        );

        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({
            error: 'provider_not_configured',
            reason: 'lighthouse_api_key_missing',
        });
    });

    it('rejects invalid CIDs before calling Lighthouse', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/pins', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cid: 'not-a-cid' }),
            }),
            createEnv({ LIGHTHOUSE_API_KEY: 'secret-value' }),
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'invalid_cid' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reads Lighthouse file info for pin status', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({
            data: {
                cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
                fileSizeInBytes: '1234',
                fileName: 'manifest-root',
                mimeType: 'application/octet-stream',
                encryption: false,
                txHash: '',
            },
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/pins/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja/status'),
            createEnv({ LIGHTHOUSE_API_KEY: '"secret-value"' }),
        );

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.lighthouse.storage/api/lighthouse/file_info?cid=bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            expect.objectContaining({
                method: 'GET',
                headers: expect.any(Headers) as Headers,
            }),
        );
        const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
        expect((calls[0][1].headers as Headers).get('Authorization')).toBe('Bearer secret-value');

        const body = await response.json() as Record<string, unknown>;
        expect(body).toMatchObject({
            provider: 'lighthouse',
            cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            found: true,
            upstreamCid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            fileName: 'manifest-root',
            fileSizeInBytes: '1234',
            mimeType: 'application/octet-stream',
            encryption: false,
            txHash: '',
            upstreamStatus: 200,
        });
        expect(typeof body.checkedAt).toBe('string');
    });

    it('normalizes Lighthouse upload-style fields during status checks', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            data: {
                Hash: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
                Size: '5678',
                Name: 'delivery-root',
            },
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })));

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/pins/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja/status'),
            createEnv(),
        );

        const body = await response.json() as Record<string, unknown>;
        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            provider: 'lighthouse',
            cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            found: true,
            upstreamCid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            fileName: 'delivery-root',
            fileSizeInBytes: '5678',
            upstreamStatus: 200,
        });
        expect(typeof body.checkedAt).toBe('string');
    });

    it('reads top-level Lighthouse file info for pin status', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            fileSizeInBytes: 421,
            fileName: 'storage-api-smoke.txt',
            mimeType: 'text/plain',
            encryption: false,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })));

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/pins/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja/status'),
            createEnv(),
        );

        const body = await response.json() as Record<string, unknown>;
        expect(response.status).toBe(200);
        expect(body).toMatchObject({
            provider: 'lighthouse',
            cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            found: true,
            upstreamCid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            fileName: 'storage-api-smoke.txt',
            fileSizeInBytes: 421,
            mimeType: 'text/plain',
            encryption: false,
            upstreamStatus: 200,
        });
        expect(typeof body.checkedAt).toBe('string');
    });

    it('normalizes missing Lighthouse file info as found false', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            error: { code: 404, message: 'Not Found' },
        }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
        })));

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/pins/bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja/status'),
            createEnv(),
        );

        expect(response.status).toBe(200);
        const body = await response.json() as Record<string, unknown>;
        expect(body).toMatchObject({
            provider: 'lighthouse',
            cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            found: false,
            upstreamStatus: 404,
        });
        expect(typeof body.checkedAt).toBe('string');
    });

    it('returns a large-video upload intent without exposing provider secrets', async () => {
        const handler = await importHandler();
        const env = createGuardedEnv({
            MAX_UPLOAD_BYTES: String(100 * 1024 * 1024),
        });
        const authToken = await seedUploadAuthToken(env, 'creator.testnet');
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/uploads/intent', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    fileName: 'concert.mov',
                    sizeBytes: 20 * 1024 * 1024 * 1024,
                    contentType: 'video/quicktime',
                    accountId: 'attacker.testnet',
                    uploadKind: 'file',
                }),
            }),
            env,
        );

        expect(response.status).toBe(200);
        const body = await response.json() as Record<string, unknown>;
        expect(body).toMatchObject({
            provider: 'lighthouse',
            fileName: 'concert.mov',
            sizeBytes: 20 * 1024 * 1024 * 1024,
            contentType: 'video/quicktime',
            accountId: 'creator.testnet',
            uploadKind: 'file',
            uploadsEnabled: true,
            providerReady: true,
            directUpload: {
                available: false,
                reason: 'scoped_direct_upload_token_unavailable',
            },
            workerProxy: {
                available: true,
                uploadUrl: '/uploads/file',
                maxPartBytes: 100 * 1024 * 1024,
                recommendedPartBytes: 4 * 1024 * 1024,
                requiresChunking: true,
                intentToken: expect.any(String),
                idempotencyKey: expect.any(String),
                expiresAt: expect.any(String),
            },
        });
        expect(JSON.stringify(body)).not.toContain('secret-value');
    });

    it('rejects upload intents without Authorization', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/uploads/intent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: 'concert.mov',
                    sizeBytes: 1024,
                    accountId: 'creator.testnet',
                    uploadKind: 'file',
                }),
            }),
            createGuardedEnv(),
        );

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'Unauthorized' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('issues upload auth tokens from a valid NEP-413 challenge', async () => {
        const keyPair = await crypto.subtle.generateKey(
            { name: 'Ed25519' },
            true,
            ['sign', 'verify'],
        ) as CryptoKeyPair;
        const rawPublicKey = await crypto.subtle.exportKey('raw', keyPair.publicKey) as ArrayBuffer;
        const publicKey = `ed25519:${base58Encode(new Uint8Array(rawPublicKey))}`;
        vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
            result: { nonce: 1, permission: 'FullAccess' },
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        })));

        const handler = await importHandler();
        const env = createGuardedEnv({ NEAR_NETWORK: 'testnet' });
        const challengeResponse = await handler.fetch(
            new Request('https://storage.youtick.net/uploads/auth/challenge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: 'creator.testnet' }),
            }),
            env,
        );
        expect(challengeResponse.status).toBe(200);
        const challenge = await challengeResponse.json() as {
            challengeId: string;
            message: string;
            recipient: string;
            nonce: string;
        };
        const payloadHash = await serializeNep413Hash({
            message: challenge.message,
            nonce: base64ToBytes(challenge.nonce),
            recipient: challenge.recipient,
        });
        const signature = bytesToBase64(new Uint8Array(await crypto.subtle.sign(
            { name: 'Ed25519' },
            keyPair.privateKey,
            payloadHash,
        )));

        const verifyResponse = await handler.fetch(
            new Request('https://storage.youtick.net/uploads/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    challengeId: challenge.challengeId,
                    accountId: 'creator.testnet',
                    publicKey,
                    signature,
                }),
            }),
            env,
        );

        expect(verifyResponse.status).toBe(200);
        expect(await verifyResponse.json()).toMatchObject({
            token: expect.any(String),
            accountId: 'creator.testnet',
            expiresAt: expect.any(Number),
        });
    });

    it('accepts an active upload session function-call key for upload auth', async () => {
        const keyPair = await crypto.subtle.generateKey(
            { name: 'Ed25519' },
            true,
            ['sign', 'verify'],
        ) as CryptoKeyPair;
        const rawPublicKey = await crypto.subtle.exportKey('raw', keyPair.publicKey) as ArrayBuffer;
        const publicKey = `ed25519:${base58Encode(new Uint8Array(rawPublicKey))}`;
        const activeSession = new TextEncoder().encode(JSON.stringify({
            owner_id: 'creator.testnet',
            remaining_budget: '100000000000000000000000',
            remaining_calls: 2,
            expires_at_ms: Date.now() + 300_000,
            status: 'AwaitingMint',
        }));
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body || '{}')) as {
                params?: { request_type?: string };
            };
            if (body.params?.request_type === 'view_access_key') {
                return new Response(JSON.stringify({
                    result: {
                        nonce: 1,
                        permission: {
                            FunctionCall: {
                                allowance: '150000000000000000000000',
                                receiver_id: 'youtick.near',
                                method_names: ['nft_mint_prepaid', 'create_event_prepaid'],
                            },
                        },
                    },
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            return new Response(JSON.stringify({
                result: { result: Array.from(activeSession) },
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }));

        const handler = await importHandler();
        const env = createGuardedEnv({ NEAR_NETWORK: 'testnet' });
        const challengeResponse = await handler.fetch(
            new Request('https://storage.youtick.net/uploads/auth/challenge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: 'creator.testnet' }),
            }),
            env,
        );
        const challenge = await challengeResponse.json() as {
            challengeId: string;
            message: string;
            recipient: string;
            nonce: string;
        };
        const payloadHash = await serializeNep413Hash({
            message: challenge.message,
            nonce: base64ToBytes(challenge.nonce),
            recipient: challenge.recipient,
        });
        const signature = bytesToBase64(new Uint8Array(await crypto.subtle.sign(
            { name: 'Ed25519' },
            keyPair.privateKey,
            payloadHash,
        )));

        const verifyResponse = await handler.fetch(
            new Request('https://storage.youtick.net/uploads/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    challengeId: challenge.challengeId,
                    accountId: 'creator.testnet',
                    publicKey,
                    signature,
                }),
            }),
            env,
        );

        expect(verifyResponse.status).toBe(200);
        expect(await verifyResponse.json()).toMatchObject({
            token: expect.any(String),
            accountId: 'creator.testnet',
        });
    });

    it('keeps upload intent available as guidance when uploads are disabled', async () => {
        const handler = await importHandler();
        const env = createEnv({
            LIGHTHOUSE_API_KEY: 'secret-value',
            UPLOAD_GUARD: createMemoryKv(),
        });
        const authToken = await seedUploadAuthToken(env);
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/uploads/intent', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    fileName: 'film.mp4',
                    sizeBytes: 1024,
                    uploadKind: 'file',
                }),
            }),
            env,
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            provider: 'lighthouse',
            fileName: 'film.mp4',
            contentType: 'application/octet-stream',
            accountId: 'creator.testnet',
            uploadKind: 'file',
            uploadsEnabled: false,
            providerReady: true,
            workerProxy: {
                available: false,
                requiresChunking: false,
            },
        });
    });

    it('rejects invalid upload intent requests before provider calls', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const env = createGuardedEnv();
        const authToken = await seedUploadAuthToken(env);
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/uploads/intent', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    uploadKind: 'file',
                    fileName: '../bad.mp4',
                    sizeBytes: 0,
                }),
            }),
            env,
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'invalid_file_name' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('uploads a directory through Lighthouse when primary uploads are explicitly enabled', async () => {
        const fetchMock = vi.fn(async () => new Response([
            '{"Name":"manifest.json","Hash":"bafyManifest","Size":"64"}',
            '{"Name":"segments/000000.m4s","Hash":"bafySegment","Size":"8"}',
            '{"Name":"segments","Hash":"bafySegmentsDir","Size":"72"}',
            '{"Name":"","Hash":"bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja","Size":"180"}',
        ].join('\n'), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);

        const formData = new FormData();
        formData.append('file', new File(['{}'], 'manifest.json', { type: 'application/json' }));
        formData.append('file', new File(['segment'], 'segments/000000.m4s'));

        const handler = await importHandler();
        const env = createGuardedEnv({
            LIGHTHOUSE_API_KEY: '"secret-value"',
        });
        const token = await issueUploadIntent(handler, env, {
            uploadKind: 'directory',
            fileName: 'directory',
            sizeBytes: 9,
            contentType: 'multipart/form-data',
        });
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/uploads/directory', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            }),
            env,
        );

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://upload.lighthouse.storage/api/v0/add?wrap-with-directory=true&cid-version=1',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer secret-value',
                    Accept: 'application/json',
                }) as HeadersInit,
                body: expect.any(FormData) as FormData,
            }),
        );

        const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
        const upstreamForm = calls[0][1].body as FormData;
        expect(Array.from(upstreamForm.entries()).map(([, value]) => (value as unknown as File).name)).toEqual([
            'manifest.json',
            'segments/000000.m4s',
        ]);

        expect(await response.json()).toMatchObject({
            provider: 'lighthouse',
            cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            size: 9,
            entries: [
                { path: 'manifest.json', cid: 'bafyManifest', size: 64 },
                { path: 'segments/000000.m4s', cid: 'bafySegment', size: 8 },
                { path: 'segments', cid: 'bafySegmentsDir', size: 72 },
                { path: '', cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja', size: 180 },
            ],
        });
    });

    it('uploads a single file through Lighthouse when primary uploads are explicitly enabled', async () => {
        const fetchMock = vi.fn(async () => new Response(
            '{"Name":"segments/000000.m4s.part00000","Hash":"bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja","Size":"7"}',
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            },
        ));
        vi.stubGlobal('fetch', fetchMock);

        const formData = new FormData();
        formData.append('file', new File(['segment'], 'segments/000000.m4s.part00000'));

        const handler = await importHandler();
        const env = createGuardedEnv();
        const token = await issueUploadIntent(handler, env, {
            uploadKind: 'file',
            fileName: 'segments/000000.m4s.part00000',
            sizeBytes: 7,
            contentType: 'application/octet-stream',
        });
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/uploads/file', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            }),
            env,
        );

        expect(response.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(
            'https://upload.lighthouse.storage/api/v0/add?cid-version=1',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer secret-value',
                    Accept: 'application/json',
                }) as HeadersInit,
                body: expect.any(FormData) as FormData,
            }),
        );
        const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
        const upstreamForm = calls[0][1].body as FormData;
        expect(Array.from(upstreamForm.entries()).map(([, value]) => (value as unknown as File).name)).toEqual([
            '000000.m4s.part00000',
        ]);

        expect(await response.json()).toMatchObject({
            provider: 'lighthouse',
            cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja',
            path: 'segments/000000.m4s.part00000',
            size: 7,
        });
    });

    it('rejects Lighthouse uploads without a signed upload intent', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const formData = new FormData();
        formData.append('file', new File(['segment'], 'segments/000000.m4s.part00000'));

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/uploads/file', {
                method: 'POST',
                body: formData,
            }),
            createGuardedEnv(),
        );

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'upload_intent_required' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns the cached upload result when the same signed intent is retried', async () => {
        const fetchMock = vi.fn(async () => new Response(
            '{"Name":"segments/000000.m4s.part00000","Hash":"bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja","Size":"7"}',
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            },
        ));
        vi.stubGlobal('fetch', fetchMock);

        const handler = await importHandler();
        const env = createGuardedEnv();
        const token = await issueUploadIntent(handler, env, {
            uploadKind: 'file',
            fileName: 'segments/000000.m4s.part00000',
            sizeBytes: 7,
            contentType: 'application/octet-stream',
        });

        const sendUpload = () => {
            const formData = new FormData();
            formData.append('file', new File(['segment'], 'segments/000000.m4s.part00000'));
            return handler.fetch(
                new Request('https://storage.youtick.net/uploads/file', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData,
                }),
                env,
            );
        };

        const first = await sendUpload();
        const second = await sendUpload();

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(await first.json()).toMatchObject({ cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja' });
        expect(await second.json()).toMatchObject({ cid: 'bafybeiewdtjpoddsgwauzzdczd6ccxtsyr65mcyo7si7u2uqiqnwj57eja' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('rate limits repeated upload intent requests per account and IP bucket', async () => {
        const handler = await importHandler();
        const env = createGuardedEnv({
            UPLOAD_RATE_LIMIT_MAX: '1',
            UPLOAD_RATE_LIMIT_WINDOW_SECONDS: '60',
        });
        const authToken = await seedUploadAuthToken(env);
        const requestBody = {
            uploadKind: 'file',
            fileName: 'manifest.json',
            sizeBytes: 2,
            contentType: 'application/json',
        };

        const makeRequest = () => handler.fetch(
            new Request('https://storage.youtick.net/uploads/intent', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'CF-Connecting-IP': '203.0.113.10',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            }),
            env,
        );

        const first = await makeRequest();
        const second = await makeRequest();

        expect(first.status).toBe(200);
        expect(second.status).toBe(429);
        expect(await second.json()).toEqual({
            error: 'rate_limited',
            retryAfterSeconds: 60,
        });
    });

    it('keeps Lighthouse primary uploads disabled unless explicitly enabled', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const formData = new FormData();
        formData.append('file', new File(['{}'], 'manifest.json'));

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/uploads/directory', {
                method: 'POST',
                body: formData,
            }),
            createEnv({ LIGHTHOUSE_API_KEY: 'secret-value' }),
        );

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({
            error: 'uploads_disabled',
            reason: 'enable_lighthouse_uploads_required',
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects Lighthouse primary uploads above the configured worker cap', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const formData = new FormData();
        formData.append('file', new File(['too-large'], 'manifest.json'));

        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/uploads/directory', {
                method: 'POST',
                body: formData,
            }),
            createEnv({
                LIGHTHOUSE_API_KEY: 'secret-value',
                ENABLE_LIGHTHOUSE_UPLOADS: 'true',
                MAX_UPLOAD_BYTES: '4',
            }),
        );

        expect(response.status).toBe(413);
        expect(await response.json()).toEqual({
            error: 'upload_too_large',
            maxUploadBytes: 4,
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('handles CORS preflight for allowed origins', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/provider-health', {
                method: 'OPTIONS',
                headers: { Origin: 'http://localhost:3000' },
            }),
            createEnv(),
        );

        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
        expect(response.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS');
    });

    it('allows the secondary local dev port used for parallel smoke tests', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/pins', {
                method: 'OPTIONS',
                headers: { Origin: 'http://localhost:3001' },
            }),
            createEnv(),
        );

        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3001');
    });

    it('does not allow localhost from production defaults', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/provider-health', {
                method: 'OPTIONS',
                headers: { Origin: 'http://localhost:3000' },
            }),
            createEnv({ ALLOWED_ORIGINS: undefined }),
        );

        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('does not reflect disallowed origins', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/__health', {
                headers: { Origin: 'https://example.com' },
            }),
            createEnv(),
        );

        expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('returns JSON 404 for unknown routes', async () => {
        const handler = await importHandler();
        const response = await handler.fetch(
            new Request('https://storage.youtick.net/unknown'),
            createEnv(),
        );

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({
            error: 'not_found',
            endpoints: ['/__health', '/provider-health', '/pins', '/pins/:cid/status', '/uploads/auth/challenge', '/uploads/auth/verify', '/uploads/intent', '/uploads/file', '/uploads/directory'],
        });
    });
});
