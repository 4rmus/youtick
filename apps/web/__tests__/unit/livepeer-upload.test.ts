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
        livepeerTusChunkBytes: 32 * 1024 * 1024,
    },
    GAS_CONSTANTS: { mediumGas: 100_000_000_000_000n },
    NEAR_CONFIG: {
        networkId: 'testnet',
        marketContractId: 'paid-media-livepeer-v1.testnet',
        usdcContractId: 'usdc.testnet',
    },
}));

import {
    authorizeLivepeerPaidJob,
    clearLivepeerUploadDraft,
    parseLivepeerPriceUsdc,
    livepeerSessionKeyAllowanceYocto,
    livepeerUploadFeeUsdc,
    requestLivepeerUploadIntent,
    readLivepeerUploadDraft,
    uploadLivepeerSource,
    validateLivepeerSourceFile,
    writeLivepeerUploadDraft,
    type LivepeerUploadIntent,
} from '@/lib/livepeer-upload';

const SOURCE_BYTES = 20 * 1024 * 1024;
const INTENT: LivepeerUploadIntent = {
    schema: 'youtick.livepeer-upload-intent.v1',
    job_id: 'job-001',
    generation: 1,
    expected_source_bytes: String(SOURCE_BYTES),
    chunk_bytes: 32 * 1024 * 1024,
    tus_endpoint: 'https://origin.livepeer.com/api/asset/upload/tus/upload-123',
    created: true,
};

function createWallet() {
    return {
        signAndSendTransactions: vi.fn<(params: {
            transactions: Array<{ receiverId: string; actions: unknown[] }>;
        }) => Promise<unknown[]>>().mockResolvedValue([]),
        signAndSendTransaction: vi.fn<(params: {
            receiverId: string;
            actions: unknown[];
        }) => Promise<object>>().mockResolvedValue({}),
    };
}

async function provisionJobSession(
    wallet: ReturnType<typeof createWallet>,
    jobId = 'job-001',
    expectedSourceBytes = SOURCE_BYTES,
) {
    return authorizeLivepeerPaidJob(wallet as never, {
        accountId: 'creator.testnet',
        jobId,
        title: 'Paid video',
        priceUsdc: '2000001',
        expectedSourceBytes,
    });
}

describe('Livepeer browser upload', () => {
    beforeEach(() => {
        tus.instances.length = 0;
        vi.restoreAllMocks();
        sessionStorage.clear();
    });

    it('signs the locked upload-intent envelope and removes the single-job key', async () => {
        const wallet = createWallet();
        const publicKey = await provisionJobSession(wallet);
        const fetchMock = vi.fn<(
            input: RequestInfo | URL,
            init?: RequestInit,
        ) => Promise<Response>>().mockImplementation(async () => Response.json(INTENT, { status: 201 }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(requestLivepeerUploadIntent({
            wallet: wallet as never,
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
            session_public_key: publicKey,
            origin: 'https://app.youtick.net',
        });
        expect(request.envelope.device_nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(request.envelope.body_sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(wallet.signAndSendTransaction).toHaveBeenCalledWith({
            receiverId: 'creator.testnet',
            actions: [expect.objectContaining({ type: 'DeleteKey' })],
        });
        await expect(requestLivepeerUploadIntent({
            wallet: wallet as never,
            accountId: 'creator.testnet',
            jobId: 'job-001',
            generation: 1,
            expectedSourceBytes: SOURCE_BYTES,
        })).rejects.toThrow('livepeer_session_key_missing');
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('signs the exact localhost origin used by the configured local runtime', async () => {
        const originalWindow = globalThis.window;
        globalThis.window = { location: { origin: 'http://localhost:3000' } } as Window & typeof globalThis;
        try {
            const wallet = createWallet();
            await provisionJobSession(wallet);
            const fetchMock = vi.fn().mockResolvedValue(Response.json(INTENT, { status: 201 }));
            vi.stubGlobal('fetch', fetchMock);

            await requestLivepeerUploadIntent({
                wallet: wallet as never,
                accountId: 'creator.testnet',
                jobId: 'job-001',
                generation: 1,
                expectedSourceBytes: SOURCE_BYTES,
            });

            const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
            expect(request.envelope.origin).toBe('http://localhost:3000');
        } finally {
            globalThis.window = originalWindow;
            vi.unstubAllGlobals();
        }
    });

    it('accepts exact 20 GB and rejects one byte more before bridge use', async () => {
        const wallet = createWallet();
        await provisionJobSession(wallet, 'job-max', 20_000_000_000);
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
            wallet: wallet as never,
            accountId: 'creator.testnet',
            jobId: 'job-max',
            generation: 1,
            expectedSourceBytes: 20_000_000_000,
        })).resolves.toEqual(exactIntent);
        await expect(requestLivepeerUploadIntent({
            wallet: wallet as never,
            accountId: 'creator.testnet',
            jobId: 'job-too-large',
            generation: 1,
            expectedSourceBytes: 20_000_000_001,
        })).rejects.toThrow('source_limit_exceeded');
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('accepts only bounded MP4 input and exact micro-USDC prices', () => {
        expect(validateLivepeerSourceFile({ size: 1, type: 'video/mp4' })).toEqual({ ok: true });
        expect(validateLivepeerSourceFile({ size: 0, type: 'video/mp4' }))
            .toEqual({ ok: false, error: 'empty_file' });
        expect(validateLivepeerSourceFile({ size: 20_000_000_001, type: 'video/mp4' }))
            .toEqual({ ok: false, error: 'source_limit_exceeded' });
        expect(validateLivepeerSourceFile({ size: 1, type: 'video/quicktime' }))
            .toEqual({ ok: false, error: 'unsupported_video_type' });
        expect(parseLivepeerPriceUsdc('2')).toBe('2000000');
        expect(parseLivepeerPriceUsdc('2.000001')).toBe('2000001');
        expect(() => parseLivepeerPriceUsdc('1.999999')).toThrow('invalid_ticket_price');
        expect(() => parseLivepeerPriceUsdc('2.0000001')).toThrow('invalid_ticket_price');
    });

    it('restores only the same selected file and job after a wallet redirect', () => {
        const file = new File(['video'], 'video.mp4', { type: 'video/mp4', lastModified: 123 });
        const draft = {
            jobId: 'job-001',
            title: 'Paid video',
            price: '2.00',
            sourceBytes: file.size,
            sourceName: file.name,
            sourceLastModified: file.lastModified,
        };
        writeLivepeerUploadDraft('creator.testnet', draft);

        expect(readLivepeerUploadDraft('creator.testnet', file)).toEqual(draft);
        expect(readLivepeerUploadDraft(
            'creator.testnet',
            new File(['other'], 'other.mp4', { type: 'video/mp4', lastModified: 456 }),
        )).toBeNull();
        clearLivepeerUploadDraft('creator.testnet');
        expect(readLivepeerUploadDraft('creator.testnet', file)).toBeNull();
    });

    it('uses one sequential 32 MiB TUS stream and does not retry an offset conflict', async () => {
        const sourceBytes = 80 * 1024 * 1024;
        const file = new File([new Uint8Array(sourceBytes)], 'video.mp4', { type: 'video/mp4' });

        await uploadLivepeerSource(file, {
            ...INTENT,
            expected_source_bytes: String(sourceBytes),
        });

        const instance = tus.instances[0];
        expect(instance.started).toBe(true);
        expect(instance.options.uploadUrl).toBe(INTENT.tus_endpoint);
        expect(instance.options.endpoint).toBeUndefined();
        expect(instance.options.storeFingerprintForResuming).toBe(false);
        expect(instance.options.chunkSize).toBe(32 * 1024 * 1024);
        expect(instance.options.parallelUploads).toBe(1);
        expect(file.size % Number(instance.options.chunkSize)).toBe(16 * 1024 * 1024);
        const shouldRetry = instance.options.onShouldRetry as (error: unknown) => boolean;
        const error = (status: number) => ({
            originalResponse: { getStatus: () => status },
        });
        expect(shouldRetry(error(409))).toBe(false);
        expect(shouldRetry(error(503))).toBe(true);
    });

    it('provisions the exact testnet key and creates one USDC-paid job transaction', async () => {
        expect(livepeerUploadFeeUsdc(83_886_080)).toBe('25166');
        expect(livepeerUploadFeeUsdc(1_000_000_000)).toBe('300000');
        expect(livepeerUploadFeeUsdc(5_000_000_000)).toBe('1500000');
        expect(livepeerUploadFeeUsdc(10_000_000_000)).toBe('3000000');
        expect(livepeerUploadFeeUsdc(20_000_000_000)).toBe('6000000');
        expect(() => livepeerUploadFeeUsdc(20_000_000_001)).toThrow('source_limit_exceeded');
        expect(livepeerSessionKeyAllowanceYocto('testnet'))
            .toBe(8_000_000_000_000_000_000_000n);
        expect(() => livepeerSessionKeyAllowanceYocto('mainnet'))
            .toThrow('livepeer_session_key_budget_unset');

        type Transaction = {
            receiverId: string;
            actions: Array<{
                type?: string;
                methodName?: string;
                receiverId?: string;
                methodNames?: string[];
                allowance?: bigint;
                args?: { receiver_id: string; amount: string; msg: string };
                deposit?: bigint;
            }>;
        };
        const wallet = createWallet();
        await authorizeLivepeerPaidJob(wallet as never, {
            accountId: 'creator.testnet',
            jobId: 'job-001',
            title: ' Paid video ',
            priceUsdc: '2000001',
            expectedSourceBytes: 83_886_080,
        });
        const { transactions } = wallet.signAndSendTransactions.mock.calls[0][0] as {
            transactions: Transaction[];
        };
        expect(transactions).toHaveLength(2);
        expect(transactions[0]).toMatchObject({
            receiverId: 'creator.testnet',
            actions: [{
                type: 'AddKey',
                receiverId: 'paid-media-livepeer-v1.testnet',
                methodNames: ['create_paid_job'],
                allowance: 8_000_000_000_000_000_000_000n,
            }],
        });
        const payment = transactions[1]!;
        expect(payment.receiverId).toBe('usdc.testnet');
        expect(payment.actions[0]).toMatchObject({
            methodName: 'ft_transfer_call',
            args: expect.objectContaining({
                receiver_id: 'paid-media-livepeer-v1.testnet',
                amount: '25166',
            }),
            deposit: 1n,
        });
        const message = JSON.parse(payment.actions[0].args!.msg);
        expect(message).toMatchObject({
            action: 'create_paid_job',
            price_usdc: '2000001',
            expected_source_bytes: '83886080',
        });

        await expect(authorizeLivepeerPaidJob(wallet as never, {
            accountId: 'creator.testnet',
            jobId: 'job-cheap',
            title: 'Paid video',
            priceUsdc: '1999999',
            expectedSourceBytes: 1_000_000,
        })).rejects.toThrow('invalid_ticket_price');
        expect(wallet.signAndSendTransactions).toHaveBeenCalledOnce();
    });

    it('reuses the same job key without adding a second access key', async () => {
        const wallet = createWallet();
        const firstPublicKey = await provisionJobSession(wallet);
        const secondPublicKey = await provisionJobSession(wallet);

        expect(secondPublicKey).toBe(firstPublicKey);
        const secondCall = wallet.signAndSendTransactions.mock.calls[1][0];
        expect(secondCall.transactions).toHaveLength(1);
        expect(secondCall.transactions[0].receiverId).toBe('usdc.testnet');
    });

    it('drops a newly prepared key when wallet authorization fails', async () => {
        const wallet = createWallet();
        wallet.signAndSendTransactions.mockRejectedValueOnce(new Error('wallet rejected authorization'));

        await expect(provisionJobSession(wallet)).rejects.toThrow('wallet rejected authorization');
        await expect(requestLivepeerUploadIntent({
            wallet: wallet as never,
            accountId: 'creator.testnet',
            jobId: 'job-001',
            generation: 1,
            expectedSourceBytes: SOURCE_BYTES,
        })).rejects.toThrow('livepeer_session_key_missing');
    });

    it('keeps the job key available when on-chain removal fails', async () => {
        const wallet = createWallet();
        await provisionJobSession(wallet);
        wallet.signAndSendTransaction.mockRejectedValueOnce(new Error('wallet rejected delete'));
        const fetchMock = vi.fn<(
            input: RequestInfo | URL,
            init?: RequestInit,
        ) => Promise<Response>>().mockImplementation(async () => Response.json(INTENT, { status: 201 }));
        vi.stubGlobal('fetch', fetchMock);

        const request = {
            wallet: wallet as never,
            accountId: 'creator.testnet',
            jobId: 'job-001',
            generation: 1,
            expectedSourceBytes: SOURCE_BYTES,
        };
        await expect(requestLivepeerUploadIntent(request)).rejects.toThrow('wallet rejected delete');
        await expect(requestLivepeerUploadIntent(request)).resolves.toEqual(INTENT);
        expect(wallet.signAndSendTransaction).toHaveBeenCalledTimes(2);
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
