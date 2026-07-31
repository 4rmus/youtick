import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    PAID_SOURCE_MAX_BYTES,
    R2_UPLOAD_PART_BYTES,
    R2IngestSession,
    expectedPartBytes,
    getR2IngestReadiness,
    validateProviderParts,
    type R2IngestEnv,
} from './r2-ingest';

const ORIGIN = 'https://youtick.net';
const JOB_ID = 'job-r2-test';
const CREATOR = 'creator.testnet';

type TestState = {
    state: DurableObjectState;
    values: Map<string, unknown>;
    getAlarm: () => number | null;
};

function createState(): TestState {
    const values = new Map<string, unknown>();
    let alarm: number | null = null;
    const storage = {
        get: vi.fn(async (key: string) => values.get(key)),
        put: vi.fn(async (key: string, value: unknown) => {
            values.set(key, structuredClone(value));
        }),
        setAlarm: vi.fn(async (value: number) => {
            alarm = value;
        }),
        deleteAlarm: vi.fn(async () => {
            alarm = null;
        }),
        transaction: vi.fn(async (
            callback: (transaction: {
                get(key: string): Promise<unknown>;
                put(key: string, value: unknown): Promise<void>;
            }) => Promise<unknown>,
        ) => callback({
            get: async (key: string) => values.get(key),
            put: async (key: string, value: unknown) => {
                values.set(key, structuredClone(value));
            },
        })),
    };
    return {
        state: { storage } as unknown as DurableObjectState,
        values,
        getAlarm: () => alarm,
    };
}

function createBucket() {
    let objectSize: number | null = null;
    const upload = {
        key: `raw/jobs/${JOB_ID}/1/source`,
        uploadId: 'upload-123456789',
        abort: vi.fn(async () => undefined),
        complete: vi.fn(async (parts: R2UploadedPart[]) => {
            objectSize = parts.length === 2 ? R2_UPLOAD_PART_BYTES + 7 : 0;
            return { size: objectSize } as R2Object;
        }),
    };
    const bucket = {
        createMultipartUpload: vi.fn(async () => upload),
        resumeMultipartUpload: vi.fn(() => upload),
        head: vi.fn(async () => objectSize === null ? null : ({ size: objectSize } as R2Object)),
        delete: vi.fn(async () => {
            objectSize = null;
        }),
    };
    return { bucket: bucket as unknown as R2Bucket, upload };
}

function createEnv(bucket: R2Bucket, overrides?: Partial<R2IngestEnv>): R2IngestEnv {
    return {
        ALLOWED_ORIGINS: ORIGIN,
        R2_INGEST_ENABLED: 'true',
        R2_ACCOUNT_ID: 'a'.repeat(32),
        R2_JURISDICTION: 'eu',
        R2_RAW_BUCKET_NAME: 'youtick-raw',
        R2_ACCESS_KEY_ID: 'access-key',
        R2_SECRET_ACCESS_KEY: 'secret-key',
        R2_INGEST_SESSIONS: {} as DurableObjectNamespace,
        RAW_MEDIA_BUCKET: bucket,
        NEAR_RPC_URL: 'https://rpc.testnet.near.org',
        MARKET_CONTRACT_ID: 'market.testnet',
        ...overrides,
    };
}

async function createDevice() {
    const pair = await crypto.subtle.generateKey(
        'Ed25519',
        true,
        ['sign', 'verify'],
    ) as CryptoKeyPair;
    const raw = new Uint8Array(
        await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer,
    );
    return {
        privateKey: pair.privateKey,
        publicKey: `ed25519:${base58Encode(raw)}`,
    };
}

async function signedRequest(input: {
    method: string;
    path: string;
    privateKey: CryptoKey;
    publicKey: string;
    body?: Record<string, unknown>;
    origin?: string;
    nonce?: string;
}): Promise<Request> {
    const body = input.body ? JSON.stringify(input.body) : '';
    const timestamp = Date.now();
    const nonce = input.nonce || crypto.randomUUID();
    const digest = new Uint8Array(await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(body),
    ));
    const canonical = [
        input.method,
        input.path,
        String(timestamp),
        nonce,
        toHex(digest),
    ].join('\n');
    const signature = new Uint8Array(await crypto.subtle.sign(
        'Ed25519',
        input.privateKey,
        new TextEncoder().encode(canonical),
    ));
    return new Request(`https://storage.youtick.net${input.path}`, {
        method: input.method,
        headers: {
            'Content-Type': 'application/json',
            'Origin': input.origin || ORIGIN,
            'X-Youtick-Public-Key': input.publicKey,
            'X-Youtick-Timestamp': String(timestamp),
            'X-Youtick-Nonce': nonce,
            'X-Youtick-Signature': toBase64(signature),
        },
        ...(body ? { body } : {}),
    });
}

function listPartsXml(parts: Array<{ partNumber: number; etag: string; size: number }>): string {
    return `<ListPartsResult>${parts.map((part) => (
        `<Part><PartNumber>${part.partNumber}</PartNumber>`
        + `<ETag>"${part.etag}"</ETag><Size>${part.size}</Size></Part>`
    )).join('')}</ListPartsResult>`;
}

describe('R2 ingest control', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('accepts exactly 20 GB and enforces the exact final part', () => {
        const session = {
            sourceBytes: PAID_SOURCE_MAX_BYTES,
            partBytes: R2_UPLOAD_PART_BYTES,
            partCount: Math.ceil(PAID_SOURCE_MAX_BYTES / R2_UPLOAD_PART_BYTES),
        };
        expect(session.partCount).toBe(299);
        expect(expectedPartBytes(session, 299)).toBe(1_558_528);
        expect(() => validateProviderParts(
            { sourceBytes: R2_UPLOAD_PART_BYTES + 7, partBytes: R2_UPLOAD_PART_BYTES, partCount: 2 },
            [
                { partNumber: 1, etag: 'a'.repeat(32), size: R2_UPLOAD_PART_BYTES },
                { partNumber: 2, etag: 'b'.repeat(32), size: 8 },
            ],
            true,
        )).toThrow('provider_inventory_mismatch');
    });

    it('stays fail-closed until every runtime dependency exists', () => {
        const { bucket } = createBucket();
        expect(getR2IngestReadiness(createEnv(bucket)).ready).toBe(true);
        expect(getR2IngestReadiness(createEnv(bucket, {
            R2_INGEST_ENABLED: 'false',
        })).ready).toBe(false);
    });

    it('persists Create, grants only the bound part and denies replay or wrong origin', async () => {
        const { bucket } = createBucket();
        const env = createEnv(bucket);
        const state = createState();
        const device = await createDevice();
        const sourceBytes = R2_UPLOAD_PART_BYTES + 7;
        const rpcJob = {
            job_id: JOB_ID,
            creator_id: CREATOR,
            profile: 'paid-media-v4',
            generation: 1,
            status: 'Authorized',
            source_bytes: String(sourceBytes),
            ingest_public_key: device.publicKey,
        };
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            if (url.startsWith('https://rpc.')) {
                return Response.json({
                    result: {
                        result: Array.from(new TextEncoder().encode(JSON.stringify(rpcJob))),
                    },
                });
            }
            return new Response(listPartsXml([]), { status: 200 });
        });
        vi.stubGlobal('fetch', fetchMock);
        const session = new R2IngestSession(state.state, env);
        const createPath = `/media-jobs/${JOB_ID}/generations/1/uploads`;
        const createRequest = await signedRequest({
            method: 'POST',
            path: createPath,
            privateKey: device.privateKey,
            publicKey: device.publicKey,
            body: { creator: CREATOR, sourceBytes },
            nonce: 'same-request-nonce',
        });

        const created = await session.fetch(createRequest.clone());
        expect(created.status).toBe(200);
        expect(await created.json()).toMatchObject({
            state: 'UPLOADING',
            providerKey: `raw/jobs/${JOB_ID}/1/source`,
            partCount: 2,
        });
        expect(state.values.has('session')).toBe(true);
        expect(state.getAlarm()).not.toBeNull();

        const replay = await session.fetch(createRequest);
        expect(replay.status).toBe(409);
        expect(await replay.json()).toEqual({ error: 'authorization_replay' });

        const wrongOrigin = await session.fetch(await signedRequest({
            method: 'GET',
            path: `${createPath}/parts`,
            privateKey: device.privateKey,
            publicKey: device.publicKey,
            origin: 'https://evil.example',
        }));
        expect(wrongOrigin.status).toBe(403);

        const grant = await session.fetch(await signedRequest({
            method: 'POST',
            path: `${createPath}/parts/2/grant`,
            privateKey: device.privateKey,
            publicKey: device.publicKey,
        }));
        expect(grant.status).toBe(200);
        const grantBody = await grant.json() as {
            expectedBytes: number;
            url: string;
        };
        expect(grantBody.expectedBytes).toBe(7);
        const grantUrl = new URL(grantBody.url);
        expect(grantUrl.hostname).toBe(`${'a'.repeat(32)}.eu.r2.cloudflarestorage.com`);
        expect(grantUrl.pathname).toBe(`/youtick-raw/raw/jobs/${JOB_ID}/1/source`);
        expect(grantUrl.searchParams.get('partNumber')).toBe('2');
        expect(grantUrl.searchParams.get('X-Amz-SignedHeaders'))
            .toBe('content-length;content-type;host;origin');
        expect(JSON.stringify(grantBody)).not.toContain('secret-key');

        const wrongPart = await session.fetch(await signedRequest({
            method: 'POST',
            path: `${createPath}/parts/3/grant`,
            privateKey: device.privateKey,
            publicKey: device.publicKey,
        }));
        expect(wrongPart.status).toBe(400);
        expect(await wrongPart.json()).toEqual({ error: 'invalid_part_number' });

        const wrongGeneration = await session.fetch(await signedRequest({
            method: 'GET',
            path: `/media-jobs/${JOB_ID}/generations/2/uploads/parts`,
            privateKey: device.privateKey,
            publicKey: device.publicKey,
        }));
        expect(wrongGeneration.status).toBe(404);
    });

    it('lists provider truth, completes exact inventory and aborts idempotently', async () => {
        const { bucket, upload } = createBucket();
        const env = createEnv(bucket);
        const state = createState();
        const device = await createDevice();
        const sourceBytes = R2_UPLOAD_PART_BYTES + 7;
        const providerParts = [
            { partNumber: 1, etag: 'a'.repeat(32), size: R2_UPLOAD_PART_BYTES },
            { partNumber: 2, etag: 'b'.repeat(32), size: 7 },
        ];
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            if (url.startsWith('https://rpc.')) {
                const job = {
                    job_id: JOB_ID,
                    creator_id: CREATOR,
                    profile: 'paid-media-v4',
                    generation: 1,
                    status: 'Authorized',
                    source_bytes: String(sourceBytes),
                    ingest_public_key: device.publicKey,
                };
                return Response.json({
                    result: { result: Array.from(new TextEncoder().encode(JSON.stringify(job))) },
                });
            }
            return new Response(listPartsXml(providerParts), { status: 200 });
        }));
        const session = new R2IngestSession(state.state, env);
        const basePath = `/media-jobs/${JOB_ID}/generations/1/uploads`;
        await session.fetch(await signedRequest({
            method: 'POST',
            path: basePath,
            privateKey: device.privateKey,
            publicKey: device.publicKey,
            body: { creator: CREATOR, sourceBytes },
        }));

        const listed = await session.fetch(await signedRequest({
            method: 'GET',
            path: `${basePath}/parts`,
            privateKey: device.privateKey,
            publicKey: device.publicKey,
        }));
        expect(await listed.json()).toMatchObject({
            missingParts: [],
            parts: providerParts,
        });

        const completed = await session.fetch(await signedRequest({
            method: 'POST',
            path: `${basePath}/complete`,
            privateKey: device.privateKey,
            publicKey: device.publicKey,
        }));
        expect(completed.status).toBe(200);
        expect(await completed.json()).toMatchObject({ state: 'SOURCE_UPLOADED' });
        expect(upload.complete).toHaveBeenCalledWith([
            { partNumber: 1, etag: 'a'.repeat(32) },
            { partNumber: 2, etag: 'b'.repeat(32) },
        ]);

        const aborted = await session.fetch(await signedRequest({
            method: 'DELETE',
            path: basePath,
            privateKey: device.privateKey,
            publicKey: device.publicKey,
        }));
        expect(await aborted.json()).toMatchObject({ state: 'ABORTED' });
    });

    it('actively reaps multipart and raw state at the 24-hour deadline', async () => {
        const { bucket, upload } = createBucket();
        const env = createEnv(bucket);
        const state = createState();
        const device = await createDevice();
        vi.stubGlobal('fetch', vi.fn(async () => {
            const job = {
                job_id: JOB_ID,
                creator_id: CREATOR,
                profile: 'paid-media-v4',
                generation: 1,
                status: 'Authorized',
                source_bytes: '7',
                ingest_public_key: device.publicKey,
            };
            return Response.json({
                result: { result: Array.from(new TextEncoder().encode(JSON.stringify(job))) },
            });
        }));
        const session = new R2IngestSession(state.state, env);
        const basePath = `/media-jobs/${JOB_ID}/generations/1/uploads`;
        await session.fetch(await signedRequest({
            method: 'POST',
            path: basePath,
            privateKey: device.privateKey,
            publicKey: device.publicKey,
            body: { creator: CREATOR, sourceBytes: 7 },
        }));
        const stored = state.values.get('session') as { retentionDeadlineMs: number };
        stored.retentionDeadlineMs = Date.now() - 1;
        state.values.set('session', stored);

        await session.alarm();

        expect(upload.abort).toHaveBeenCalledOnce();
        expect(bucket.delete).toHaveBeenCalledWith(`raw/jobs/${JOB_ID}/1/source`);
        expect(state.values.get('session')).toMatchObject({ state: 'EXPIRED' });
    });
});

function toHex(value: Uint8Array): string {
    return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toBase64(value: Uint8Array): string {
    let binary = '';
    for (const byte of value) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function base58Encode(value: Uint8Array): string {
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let number = BigInt(`0x${toHex(value)}`);
    let encoded = '';
    while (number > 0n) {
        encoded = alphabet[Number(number % 58n)] + encoded;
        number /= 58n;
    }
    for (const byte of value) {
        if (byte !== 0) break;
        encoded = `1${encoded}`;
    }
    return encoded;
}
