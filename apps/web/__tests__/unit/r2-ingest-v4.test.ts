import { indexedDB as fakeIndexedDb } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    authorizePaidUpload,
    createPaidUploadDraft,
    parsePriceUsdc,
    uploadPaidSource,
    validateMissingParts,
    validatePaidSourceFile,
} from '@/lib/storage/r2-ingest';

vi.mock('@/lib/constants', () => ({
    APP_CONFIG: {
        storageApiUrl: 'https://storage.example',
    },
    GAS_CONSTANTS: {
        mediumGas: 100_000_000_000_000n,
    },
    MEDIA_UPLOAD_POLICY: {
        paidSourceMaxBytes: 20_000_000_000,
        r2PartBytes: 64 * 1024 * 1024,
    },
    NEAR_CONFIG: {
        marketContractId: 'market.testnet',
    },
}));

Object.defineProperty(globalThis, 'indexedDB', {
    value: fakeIndexedDb,
    configurable: true,
});

describe('paid-media v4 browser ingest', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        await new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase('youtick-paid-media-v4');
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
            request.onblocked = () => resolve();
        });
    });

    it('accepts exactly 20 GB and rejects one byte more before wallet use', () => {
        expect(validatePaidSourceFile({
            size: 20_000_000_000,
            type: 'video/mp4',
        })).toEqual({ ok: true });
        expect(validatePaidSourceFile({
            size: 20_000_000_001,
            type: 'video/mp4',
        })).toEqual({ ok: false, error: 'source_limit_exceeded' });
        expect(parsePriceUsdc('2.00')).toBe('2000000');
    });

    it('uses one wallet transaction and no wallet signMessage prompt', async () => {
        const file = new File(['paid source'], 'source.mp4', {
            type: 'video/mp4',
            lastModified: 1_000,
        });
        const draft = await createPaidUploadDraft({
            accountId: 'creator.testnet',
            title: 'Paid video',
            price: '2.00',
            file,
        });
        const wallet = {
            signAndSendTransaction: vi.fn(async () => ({})),
            signAndSendTransactions: vi.fn(),
            signMessage: vi.fn(),
            getAccounts: vi.fn(),
        };

        await authorizePaidUpload(wallet, draft);

        expect(wallet.signAndSendTransaction).toHaveBeenCalledOnce();
        expect(wallet.signMessage).not.toHaveBeenCalled();
        expect(wallet.signAndSendTransactions).not.toHaveBeenCalled();
        expect(wallet.signAndSendTransaction).toHaveBeenCalledWith(
            expect.objectContaining({ receiverId: 'market.testnet' }),
        );
    });

    it('resumes 30% and 70% checkpoints with only missing part numbers', () => {
        expect(validateMissingParts(10, [4, 5, 6, 7, 8, 9, 10]))
            .toEqual([4, 5, 6, 7, 8, 9, 10]);
        expect(validateMissingParts(10, [8, 9, 10])).toEqual([8, 9, 10]);
    });

    it('sends media bytes only to the scoped R2 URL', async () => {
        const file = new File(['paid source'], 'source.mp4', {
            type: 'video/mp4',
            lastModified: 1_000,
        });
        const draft = await createPaidUploadDraft({
            accountId: 'creator.testnet',
            title: 'Paid video',
            price: '2.00',
            file,
        });
        const basePath = `/media-jobs/${draft.jobId}/generations/1/uploads`;
        let listCount = 0;
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === 'string'
                ? input
                : input instanceof URL
                    ? input.href
                    : input.url;
            if (url === `https://storage.example${basePath}`) {
                expect(typeof init?.body).toBe('string');
                return Response.json({
                    schema: 'youtick.r2-ingest-session.v1',
                    jobId: draft.jobId,
                    generation: 1,
                    sourceBytes: file.size,
                    partBytes: 64 * 1024 * 1024,
                    partCount: 1,
                    providerKey: `raw/jobs/${draft.jobId}/1/source`,
                    state: 'UPLOADING',
                });
            }
            if (url === `https://storage.example${basePath}/parts`) {
                listCount += 1;
                return Response.json({
                    schema: 'youtick.r2-ingest-session.v1',
                    jobId: draft.jobId,
                    generation: 1,
                    sourceBytes: file.size,
                    partBytes: 64 * 1024 * 1024,
                    partCount: 1,
                    providerKey: `raw/jobs/${draft.jobId}/1/source`,
                    state: 'UPLOADING',
                    parts: listCount === 1 ? [] : [{
                        partNumber: 1,
                        etag: 'a'.repeat(32),
                        size: file.size,
                    }],
                    missingParts: listCount === 1 ? [1] : [],
                });
            }
            if (url === `https://storage.example${basePath}/parts/1/grant`) {
                expect(init?.body).toBeUndefined();
                return Response.json({
                    schema: 'youtick.r2-upload-part-grant.v1',
                    jobId: draft.jobId,
                    generation: 1,
                    partNumber: 1,
                    expectedBytes: file.size,
                    url: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com/`
                        + `youtick-raw/raw/jobs/${draft.jobId}/1/source`
                        + '?partNumber=1&uploadId=upload-1',
                    headers: { 'Content-Type': 'application/octet-stream' },
                    expiresAtMs: Date.now() + 60_000,
                });
            }
            if (url.endsWith('.r2.cloudflarestorage.com/'
                + `youtick-raw/raw/jobs/${draft.jobId}/1/source`
                + '?partNumber=1&uploadId=upload-1')) {
                expect(init?.body).toBeInstanceOf(Blob);
                return new Response(null, {
                    status: 200,
                    headers: { ETag: `"${'a'.repeat(32)}"` },
                });
            }
            if (url === `https://storage.example${basePath}/complete`) {
                expect(init?.body).toBeUndefined();
                return Response.json({
                    schema: 'youtick.r2-ingest-session.v1',
                    jobId: draft.jobId,
                    generation: 1,
                    sourceBytes: file.size,
                    partBytes: 64 * 1024 * 1024,
                    partCount: 1,
                    providerKey: `raw/jobs/${draft.jobId}/1/source`,
                    state: 'SOURCE_UPLOADED',
                });
            }
            return Response.json({ error: `unexpected_url:${url}` }, { status: 500 });
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(uploadPaidSource(file, draft)).resolves.toMatchObject({
            state: 'SOURCE_UPLOADED',
        });
        const mediaCalls = fetchMock.mock.calls.filter(([, init]) => init?.body instanceof Blob);
        expect(mediaCalls).toHaveLength(1);
        expect(String(mediaCalls[0][0])).toContain('.r2.cloudflarestorage.com/');
    });
});
