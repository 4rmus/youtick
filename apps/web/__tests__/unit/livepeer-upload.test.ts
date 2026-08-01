import { beforeEach, describe, expect, it, vi } from 'vitest';

const tus = vi.hoisted(() => ({
    instances: [] as Array<{
        options: Record<string, unknown>;
        started: boolean;
    }>,
}));

vi.mock('tus-js-client', () => ({
    Upload: class {
        options: Record<string, unknown>;
        started = false;

        constructor(_file: File, options: Record<string, unknown>) {
            this.options = options;
            tus.instances.push(this);
        }

        start() {
            this.started = true;
            (this.options.onSuccess as (() => void) | undefined)?.();
        }

        async abort() {}
    },
}));

vi.mock('@/lib/constants', () => ({
    APP_CONFIG: {
        publicAppUrl: 'https://app.youtick.net',
        livepeerBridgeUrl: 'https://bridge.youtick.net',
    },
    FEATURE_FLAGS: { enablePaidMediaLivepeerV1: true },
    MEDIA_UPLOAD_POLICY: {
        paidSourceMaxBytes: 20_000_000_000,
        livepeerTusChunkBytes: 8 * 1024 * 1024,
    },
    NEAR_CONFIG: {
        networkId: 'testnet',
        marketContractId: 'paid-media-livepeer-v1.testnet',
    },
}));

vi.mock('@/lib/upload-session-manager', () => ({
    getActiveUploadSessionKey: () => ({
        getPublicKey: () => ({
            toString: () => 'ed25519:4nSjNY5gSbA4AExMyWg2ErPAwn2X4Vdo4nBNmxyZ9kzF',
        }),
        sign: () => ({ signature: new Uint8Array(64).fill(7) }),
    }),
}));

import {
    requestLivepeerUploadIntent,
    uploadLivepeerSource,
    type LivepeerUploadIntent,
} from '@/lib/livepeer-upload';

const SOURCE_BYTES = 20 * 1024 * 1024;
const INTENT: LivepeerUploadIntent = {
    schema: 'youtick.livepeer-upload-intent.v1',
    job_id: 'job-001',
    generation: 1,
    expected_source_bytes: String(SOURCE_BYTES),
    chunk_bytes: 8 * 1024 * 1024,
    tus_endpoint: 'https://origin.livepeer.com/api/asset/upload/tus/upload-123',
    created: true,
};

describe('Livepeer browser upload', () => {
    beforeEach(() => {
        tus.instances.length = 0;
        vi.restoreAllMocks();
    });

    it('signs the locked upload-intent envelope', async () => {
        const fetchMock = vi.fn<(
            input: RequestInfo | URL,
            init?: RequestInit,
        ) => Promise<Response>>().mockResolvedValue(Response.json(INTENT, { status: 201 }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(requestLivepeerUploadIntent({
            accountId: 'creator.testnet',
            jobId: 'job-001',
            generation: 1,
            expectedSourceBytes: SOURCE_BYTES,
        })).resolves.toEqual(INTENT);

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://bridge.youtick.net/v1/upload-intents');
        const headers = init?.headers as Record<string, string>;
        expect(headers['X-Youtick-Signature']).toMatch(/^[A-Za-z0-9+/]+=*$/);
        const request = JSON.parse(String(init?.body)) as {
            body: Record<string, unknown>;
            envelope: Record<string, unknown>;
        };
        expect(request.body.expected_source_bytes).toBe(String(SOURCE_BYTES));
        expect(request.body.profile_config_sha256)
            .toBe('96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77');
        expect(request.envelope).toMatchObject({
            account_id: 'creator.testnet',
            resource: 'job:job-001:1',
            session_public_key: 'ed25519:4nSjNY5gSbA4AExMyWg2ErPAwn2X4Vdo4nBNmxyZ9kzF',
            origin: 'https://app.youtick.net',
        });
        expect(request.envelope.device_nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(request.envelope.body_sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('accepts exact 20 GB and rejects one byte more before bridge use', async () => {
        const exactIntent = {
            ...INTENT,
            job_id: 'job-max',
            expected_source_bytes: '20000000000',
        };
        const fetchMock = vi.fn<(
            input: RequestInfo | URL,
            init?: RequestInit,
        ) => Promise<Response>>().mockResolvedValue(Response.json(exactIntent, { status: 201 }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(requestLivepeerUploadIntent({
            accountId: 'creator.testnet',
            jobId: 'job-max',
            generation: 1,
            expectedSourceBytes: 20_000_000_000,
        })).resolves.toEqual(exactIntent);
        await expect(requestLivepeerUploadIntent({
            accountId: 'creator.testnet',
            jobId: 'job-too-large',
            generation: 1,
            expectedSourceBytes: 20_000_000_001,
        })).rejects.toThrow('source_limit_exceeded');
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('resumes the fixed resource with 8 MiB chunks and does not retry an offset conflict', async () => {
        const file = new File([new Uint8Array(SOURCE_BYTES)], 'video.mp4', { type: 'video/mp4' });

        await uploadLivepeerSource(file, INTENT);

        const instance = tus.instances[0];
        expect(instance.started).toBe(true);
        expect(instance.options.uploadUrl).toBe(INTENT.tus_endpoint);
        expect(instance.options.endpoint).toBeUndefined();
        expect(instance.options.storeFingerprintForResuming).toBe(false);
        expect(instance.options.chunkSize).toBe(8 * 1024 * 1024);
        expect(file.size % Number(instance.options.chunkSize)).toBe(4 * 1024 * 1024);
        const shouldRetry = instance.options.onShouldRetry as (error: unknown) => boolean;
        const error = (status: number) => ({
            originalResponse: { getStatus: () => status },
        });
        expect(shouldRetry(error(409))).toBe(false);
        expect(shouldRetry(error(503))).toBe(true);
    });

    it('rejects a file that does not match the provider-bound length', async () => {
        const file = new File([new Uint8Array(SOURCE_BYTES)], 'video.mp4', { type: 'video/mp4' });

        await expect(uploadLivepeerSource(file, {
            ...INTENT,
            expected_source_bytes: String(SOURCE_BYTES + 1),
        })).rejects.toThrow('invalid_livepeer_upload');
        expect(tus.instances).toHaveLength(0);
    });
});
