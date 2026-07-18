import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../src/index';
import { createAtomicNamespace } from '../../shared/test/atomic-namespace';

class MemoryKV {
    private readonly values = new Map<string, string>();

    async get(key: string): Promise<string | null> {
        return this.values.get(key) ?? null;
    }

    async put(key: string, value: string): Promise<void> {
        this.values.set(key, value);
    }

    async delete(key: string): Promise<void> {
        this.values.delete(key);
    }
}

class FailingAccessCacheKV extends MemoryKV {
    async put(key: string, value: string): Promise<void> {
        if (key.includes(':access:') || key.startsWith('access:')) {
            throw new Error('KV PUT failed: expiration_ttl too low');
        }

        return super.put(key, value);
    }
}

function encodeRpcResult(value: unknown): number[] {
    return Array.from(new TextEncoder().encode(JSON.stringify(value)));
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function shareDigest(
    videoId: string,
    shareId: number,
    shareB64: string,
    totalShares: number,
    requiredShares: number,
): Promise<string> {
    const payload = [
        'youtick-kms-share-digest-v1',
        videoId,
        'shamir-v1',
        String(totalShares),
        String(requiredShares),
        String(shareId),
        shareB64,
    ].join(':');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
    return bytesToHex(new Uint8Array(digest));
}

function makeEnv(): Env {
    return {
        VIDEO_KEYS: new MemoryKV() as unknown as Env['VIDEO_KEYS'],
        RATE_LIMIT: new MemoryKV() as unknown as Env['RATE_LIMIT'],
        ACCESS_CACHE: new MemoryKV() as unknown as Env['ACCESS_CACHE'],
        ATOMIC_STATE: createAtomicNamespace(),
        ALLOWED_ORIGINS: 'https://kms.test',
        NEAR_CONTRACT_ID: 'youtick.testnet',
        NEAR_ACCESS_CONTRACT_ID: 'access.youtick.testnet',
        NEAR_REGISTRY_CONTRACT_ID: '',
        NEAR_NETWORK: 'testnet',
        OPERATOR_SHARE_SECRET: 's'.repeat(48),
        REGISTRY_OPERATOR_ACCOUNT_ID: 'kms-a.youtick.testnet',
    };
}

function makeMainnetEnv(): Env {
    return {
        ...makeEnv(),
        ALLOWED_ORIGINS: 'https://kms.test',
        NEAR_CONTRACT_ID: 'youtick.near',
        NEAR_ACCESS_CONTRACT_ID: 'access.youtick.near',
        NEAR_REGISTRY_CONTRACT_ID: 'registry.youtick.near',
        NEAR_NETWORK: 'mainnet',
        REGISTRY_OPERATOR_ACCOUNT_ID: 'kms-a.youtick.near',
    };
}

function makeMainnetEnvWithFailingAccessCache(): Env {
    return {
        ...makeMainnetEnv(),
        ACCESS_CACHE: new FailingAccessCacheKV() as unknown as Env['ACCESS_CACHE'],
    };
}

async function seedAuthToken(
    env: Env,
    token: string,
    action: 'store' | 'retrieve',
    accountId = 'alice.testnet',
    videoId = 'video-1',
): Promise<void> {
    await env.ACCESS_CACHE.put(`auth:token:${token}`, JSON.stringify({
        accountId,
        action,
        videoId,
        publicKey: 'ed25519:test',
        expiresAt: Date.now() + 60_000,
    }));
}

describe('KMS retrieve', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        global.fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body || '{}')) as {
                params?: { method_name?: string };
            };
            const methodName = body.params?.method_name;
            let value: unknown = null;
            if (methodName === 'get_playback_access_decision') {
                value = {
                    event_exists: false,
                    banned: false,
                    has_ticket: false,
                    is_creator: false,
                    allowed: false,
                };
            }

            return new Response(JSON.stringify({
                jsonrpc: '2.0',
                id: 'test',
                result: { result: encodeRpcResult(value) },
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }) as unknown as typeof fetch;
    });

    it('lets the recorded KMS owner verify a stored share before the event exists', async () => {
        const env = makeEnv();
        await seedAuthToken(env, 'store-token', 'store');
        await seedAuthToken(env, 'retrieve-token', 'retrieve');
        const digest = await shareDigest('video-1', 1, 'c2hhcmUtMQ==', 3, 2);
        const shareCommitments = [{ shareId: 1, digest }];

        const storeResponse = await worker.fetch(new Request('https://kms.test/store', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer store-token',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                videoId: 'video-1',
                shareB64: 'c2hhcmUtMQ==',
                shareId: 1,
                totalShares: 3,
                requiredShares: 2,
                scheme: 'shamir-v1',
                shareCommitments,
            }),
        }), env);

        expect(storeResponse.status).toBe(200);

        const retrieveResponse = await worker.fetch(new Request('https://kms.test/retrieve', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer retrieve-token',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ videoId: 'video-1' }),
        }), env);

        expect(retrieveResponse.status).toBe(200);
        await expect(retrieveResponse.json()).resolves.toMatchObject({
            ok: true,
            data: {
                shareB64: 'c2hhcmUtMQ==',
                shareId: 1,
                totalShares: 3,
                requiredShares: 2,
                scheme: 'shamir-v1',
                shareCommitments,
                operatorAccountId: 'kms-a.youtick.testnet',
            },
        });
    });

    it('rejects share stores when the provided commitment does not match the share', async () => {
        const env = makeEnv();
        await seedAuthToken(env, 'store-token', 'store');

        const storeResponse = await worker.fetch(new Request('https://kms.test/store', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer store-token',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                videoId: 'video-1',
                shareB64: 'c2hhcmUtMQ==',
                shareId: 1,
                totalShares: 3,
                requiredShares: 2,
                scheme: 'shamir-v1',
                shareCommitments: [{ shareId: 1, digest: '0'.repeat(64) }],
            }),
        }), env);

        expect(storeResponse.status).toBe(400);
        await expect(storeResponse.json()).resolves.toEqual({
            ok: false,
            error: 'Share commitment mismatch',
        });
    });

    it('returns 400 for invalid JSON request bodies', async () => {
        const env = makeEnv();
        await seedAuthToken(env, 'store-token', 'store');
        await seedAuthToken(env, 'retrieve-token', 'retrieve');

        const cases = [
            { path: '/auth/challenge', token: null },
            { path: '/auth/verify', token: null },
            { path: '/store', token: 'store-token' },
            { path: '/retrieve', token: 'retrieve-token' },
        ];

        for (const testCase of cases) {
            const response = await worker.fetch(new Request(`https://kms.test${testCase.path}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(testCase.token ? { Authorization: `Bearer ${testCase.token}` } : {}),
                },
                body: '{',
            }), env);

            expect(response.status).toBe(400);
            await expect(response.json()).resolves.toEqual({
                ok: false,
                error: 'Invalid JSON',
            });
        }
    });

    it('denies the recorded KMS owner when the event is banned', async () => {
        const env = makeEnv();
        await seedAuthToken(env, 'store-token', 'store');
        await seedAuthToken(env, 'retrieve-token', 'retrieve');

        global.fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body || '{}')) as {
                params?: { method_name?: string };
            };
            const methodName = body.params?.method_name;
            let value: unknown = null;
            if (methodName === 'get_playback_access_decision') {
                value = {
                    event_exists: true,
                    banned: true,
                    has_ticket: false,
                    is_creator: true,
                    allowed: false,
                };
            }

            return new Response(JSON.stringify({
                jsonrpc: '2.0',
                id: 'test',
                result: { result: encodeRpcResult(value) },
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }) as unknown as typeof fetch;

        const storeResponse = await worker.fetch(new Request('https://kms.test/store', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer store-token',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                videoId: 'video-1',
                shareB64: 'c2hhcmUtMQ==',
                shareId: 1,
                totalShares: 3,
                requiredShares: 2,
                scheme: 'shamir-v1',
            }),
        }), env);

        expect(storeResponse.status).toBe(200);

        const retrieveResponse = await worker.fetch(new Request('https://kms.test/retrieve', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer retrieve-token',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ videoId: 'video-1' }),
        }), env);

        expect(retrieveResponse.status).toBe(404);
        await expect(retrieveResponse.json()).resolves.toEqual({
            ok: false,
            error: 'Not found or unauthorized',
        });
    });

    it('accepts ticket access when one mainnet RPC still returns a stale false', async () => {
        const env = makeMainnetEnv();
        await seedAuthToken(env, 'store-token', 'store', 'alice.near');
        await seedAuthToken(env, 'retrieve-token', 'retrieve', 'alice.near');

        global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
            const rpcUrl = String(input);
            const body = JSON.parse(String(init?.body || '{}')) as {
                params?: { method_name?: string };
            };
            const methodName = body.params?.method_name;
            let value: unknown = null;

            if (methodName === 'get_decryption_operator') {
                value = {
                    account_id: 'kms-a.youtick.near',
                    endpoint: 'https://kms.test',
                    transport_public_key: 'cf-worker:mainnet:youtick-kms-a',
                    kind: 'DecryptionOperator',
                    active: true,
                };
            } else if (methodName === 'get_playback_access_decision') {
                const allowed = !rpcUrl.includes('rpc.mainnet.fastnear.com');
                value = {
                    event_exists: true,
                    banned: false,
                    has_ticket: allowed,
                    is_creator: true,
                    allowed,
                };
            }

            return new Response(JSON.stringify({
                jsonrpc: '2.0',
                id: 'test',
                result: { result: encodeRpcResult(value) },
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }) as unknown as typeof fetch;

        const storeResponse = await worker.fetch(new Request('https://kms.test/store', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer store-token',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                videoId: 'video-1',
                shareB64: 'c2hhcmUtMQ==',
                shareId: 1,
                totalShares: 3,
                requiredShares: 2,
                scheme: 'shamir-v1',
            }),
        }), env);

        expect(storeResponse.status).toBe(200);

        const retrieveResponse = await worker.fetch(new Request('https://kms.test/retrieve', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer retrieve-token',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ videoId: 'video-1' }),
        }), env);

        expect(retrieveResponse.status).toBe(200);
        await expect(retrieveResponse.json()).resolves.toMatchObject({
            ok: true,
            data: {
                shareB64: 'c2hhcmUtMQ==',
            },
        });
    });

    it('does not deny a valid ticket when positive access cache write fails', async () => {
        const env = makeMainnetEnvWithFailingAccessCache();
        await seedAuthToken(env, 'store-token', 'store', 'alice.near');
        await seedAuthToken(env, 'retrieve-token', 'retrieve', 'alice.near');

        global.fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body || '{}')) as {
                params?: { method_name?: string };
            };
            const methodName = body.params?.method_name;
            let value: unknown = null;

            if (methodName === 'get_decryption_operator') {
                value = {
                    account_id: 'kms-a.youtick.near',
                    endpoint: 'https://kms.test',
                    transport_public_key: 'cf-worker:mainnet:youtick-kms-a',
                    kind: 'DecryptionOperator',
                    active: true,
                };
            } else if (methodName === 'get_playback_access_decision') {
                value = {
                    event_exists: true,
                    banned: false,
                    has_ticket: true,
                    is_creator: true,
                    allowed: true,
                };
            }

            return new Response(JSON.stringify({
                jsonrpc: '2.0',
                id: 'test',
                result: { result: encodeRpcResult(value) },
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }) as unknown as typeof fetch;

        const storeResponse = await worker.fetch(new Request('https://kms.test/store', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer store-token',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                videoId: 'video-1',
                shareB64: 'c2hhcmUtMQ==',
                shareId: 1,
                totalShares: 3,
                requiredShares: 2,
                scheme: 'shamir-v1',
            }),
        }), env);

        expect(storeResponse.status).toBe(200);

        const retrieveResponse = await worker.fetch(new Request('https://kms.test/retrieve', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer retrieve-token',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ videoId: 'video-1' }),
        }), env);

        expect(retrieveResponse.status).toBe(200);
        await expect(retrieveResponse.json()).resolves.toMatchObject({
            ok: true,
            data: {
                shareB64: 'c2hhcmUtMQ==',
            },
        });
    });
});
