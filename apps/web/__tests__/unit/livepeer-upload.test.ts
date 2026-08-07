import { beforeEach, describe, expect, it, vi } from 'vitest';

const tus = vi.hoisted(() => ({
    instances: [] as Array<{
        options: Record<string, unknown>;
        started: boolean;
    }>,
}));
const near = vi.hoisted(() => ({
    viewContract: vi.fn(),
    query: vi.fn(),
}));
const featureFlags = vi.hoisted(() => ({
    enablePaidMediaLivepeerV1: true,
    enableLivepeerNearCreatorFee: true,
}));

vi.mock('@/lib/near', () => ({
    getProvider: () => ({ query: near.query }),
    viewContract: near.viewContract,
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
    FEATURE_FLAGS: featureFlags,
    MEDIA_UPLOAD_POLICY: {
        paidSourceMaxBytes: 20_000_000_000,
        livepeerTusChunkBytes: 32 * 1024 * 1024,
    },
    GAS_CONSTANTS: { mediumGas: 100_000_000_000_000n },
    NEAR_CONFIG: {
        marketContractId: 'paid-media-livepeer-v1.testnet',
        usdcContractId: 'usdc.testnet',
    },
    NEAR_NETWORK: 'testnet',
}));

import {
    authorizeLivepeerPaidJob,
    clearLivepeerUploadDraft,
    parseLivepeerPriceUsdc,
    prepareCreatorFeePaymentOptions,
    livepeerUploadFeeUsdc,
    requestLivepeerUploadIntent,
    requestNearCreatorFeeQuote,
    readLivepeerUploadDraft,
    uploadLivepeerSource,
    validateLivepeerSourceFile,
    writeLivepeerUploadDraft,
    selectCreatorFeeAsset,
    type LivepeerUploadIntent,
} from '@/lib/livepeer-upload';

const SOURCE_BYTES = 20 * 1024 * 1024;
const INTENT: LivepeerUploadIntent = {
    schema: 'youtick.livepeer-upload-intent.v1',
    job_id: 'job-001',
    generation: 1,
    expected_source_bytes: String(SOURCE_BYTES),
    source_type: 'mp4',
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
        featureFlags.enableLivepeerNearCreatorFee = true;
        near.viewContract.mockReset().mockResolvedValue(null);
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
            accountId: 'creator.testnet',
            jobId: 'job-001',
            generation: 1,
            expectedSourceBytes: SOURCE_BYTES,
            sourceType: 'mp4',
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
        expect(request.body.source_type).toBe('mp4');
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
        expect(wallet.signAndSendTransaction).toHaveBeenCalledOnce();
        await expect(requestLivepeerUploadIntent({
            accountId: 'creator.testnet',
            jobId: 'job-001',
            generation: 1,
            expectedSourceBytes: SOURCE_BYTES,
            sourceType: 'mp4',
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
                accountId: 'creator.testnet',
                jobId: 'job-001',
                generation: 1,
                expectedSourceBytes: SOURCE_BYTES,
                sourceType: 'mp4',
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
            accountId: 'creator.testnet',
            jobId: 'job-max',
            generation: 1,
            expectedSourceBytes: 20_000_000_000,
            sourceType: 'mp4',
        })).resolves.toEqual(exactIntent);
        await expect(requestLivepeerUploadIntent({
            accountId: 'creator.testnet',
            jobId: 'job-too-large',
            generation: 1,
            expectedSourceBytes: 20_000_000_001,
            sourceType: 'mp4',
        })).rejects.toThrow('source_limit_exceeded');
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('accepts the bounded Livepeer source formats and exact micro-USDC prices', () => {
        const formats = [
            ['video.mp4', 'video/mp4', 'mp4'],
            ['video.mov', 'video/quicktime', 'mov'],
            ['video.avi', 'video/x-msvideo', 'avi'],
            ['video.webm', 'video/webm', 'webm'],
            ['video.wmv', 'video/x-ms-wmv', 'wmv'],
            ['video.mkv', 'video/x-matroska', 'mkv'],
            ['video.flv', 'video/x-flv', 'flv'],
        ] as const;
        for (const [name, type, sourceType] of formats) {
            expect(validateLivepeerSourceFile({ name, size: 1, type })).toEqual({ ok: true, sourceType });
        }
        expect(validateLivepeerSourceFile({ size: 0, type: 'video/mp4' }))
            .toEqual({ ok: false, error: 'empty_file' });
        expect(validateLivepeerSourceFile({ size: 20_000_000_001, type: 'video/mp4' }))
            .toEqual({ ok: false, error: 'source_limit_exceeded' });
        expect(validateLivepeerSourceFile({ name: 'video.mp4', size: 1, type: 'video/quicktime' }))
            .toEqual({ ok: false, error: 'unsupported_video_type' });
        expect(validateLivepeerSourceFile({ name: 'video.mpeg', size: 1, type: 'video/mpeg' }))
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

        await expect(uploadLivepeerSource(
            new File(['video'], 'video.mov', { type: 'video/quicktime' }),
            { ...INTENT, expected_source_bytes: '5' },
        )).rejects.toThrow('invalid_livepeer_upload');
    });

    it('creates one USDC-paid job transaction without adding an access key', async () => {
        expect(livepeerUploadFeeUsdc(83_886_080)).toBe('25166');
        expect(livepeerUploadFeeUsdc(1_000_000_000)).toBe('300000');
        expect(livepeerUploadFeeUsdc(5_000_000_000)).toBe('1500000');
        expect(livepeerUploadFeeUsdc(10_000_000_000)).toBe('3000000');
        expect(livepeerUploadFeeUsdc(20_000_000_000)).toBe('6000000');
        expect(() => livepeerUploadFeeUsdc(20_000_000_001)).toThrow('source_limit_exceeded');

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
        const payment = wallet.signAndSendTransaction.mock.calls[0][0] as Transaction;
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
            upload_public_key: expect.stringMatching(/^ed25519:/),
            upload_key_expires_at_ms: expect.stringMatching(/^[1-9][0-9]+$/),
        });

        await expect(authorizeLivepeerPaidJob(wallet as never, {
            accountId: 'creator.testnet',
            jobId: 'job-cheap',
            title: 'Paid video',
            priceUsdc: '1999999',
            expectedSourceBytes: 1_000_000,
        })).rejects.toThrow('invalid_ticket_price');
        expect(wallet.signAndSendTransaction).toHaveBeenCalledOnce();
        expect(wallet.signAndSendTransactions).not.toHaveBeenCalled();
    });

    it('reuses the same job key with one transaction per retry', async () => {
        const wallet = createWallet();
        const firstPublicKey = await provisionJobSession(wallet);
        const secondPublicKey = await provisionJobSession(wallet);

        expect(secondPublicKey).toBe(firstPublicKey);
        expect(wallet.signAndSendTransaction).toHaveBeenCalledTimes(2);
        expect(wallet.signAndSendTransactions).not.toHaveBeenCalled();
    });

    it('reconciles the exact existing job before opening the wallet again', async () => {
        const wallet = createWallet();
        const publicKey = await provisionJobSession(wallet);
        const request = JSON.parse(
            (wallet.signAndSendTransaction.mock.calls[0][0].actions[0] as { args: { msg: string } })
                .args.msg,
        );
        near.viewContract.mockResolvedValue({ ...request, fee_asset: 'USDC' });

        await expect(provisionJobSession(wallet)).resolves.toBe(publicKey);
        expect(wallet.signAndSendTransaction).toHaveBeenCalledOnce();
    });

    it('keeps the same local key after an ambiguous wallet failure', async () => {
        vi.spyOn(Date, 'now')
            .mockReturnValueOnce(1_785_589_300_000)
            .mockReturnValueOnce(1_785_589_301_000);
        const wallet = createWallet();
        wallet.signAndSendTransaction.mockRejectedValueOnce(new Error('wallet rejected authorization'));

        await expect(provisionJobSession(wallet)).rejects.toThrow('wallet rejected authorization');
        await expect(provisionJobSession(wallet)).resolves.toMatch(/^ed25519:/);
        const messages = wallet.signAndSendTransaction.mock.calls.map(([transaction]) => JSON.parse(
            ((transaction.actions[0] as { args: { msg: string } }).args.msg),
        ));
        expect(messages[0].upload_public_key).toBe(messages[1].upload_public_key);
        expect(messages[0].upload_key_expires_at_ms).toBe(messages[1].upload_key_expires_at_ms);
    });

    it('requires explicit recovery when the on-chain job exists but the local key is missing', async () => {
        near.viewContract.mockResolvedValue({ job_id: 'job-001' });
        const wallet = createWallet();

        await expect(provisionJobSession(wallet))
            .rejects.toThrow('livepeer_upload_key_recovery_required');
        expect(wallet.signAndSendTransaction).not.toHaveBeenCalled();
        expect(wallet.signAndSendTransactions).not.toHaveBeenCalled();
        expect(sessionStorage.length).toBe(0);
    });

    it('clears only the local key after an accepted intent', async () => {
        const wallet = createWallet();
        await provisionJobSession(wallet);
        const fetchMock = vi.fn<(
            input: RequestInfo | URL,
            init?: RequestInit,
        ) => Promise<Response>>().mockImplementation(async () => Response.json(INTENT, { status: 201 }));
        vi.stubGlobal('fetch', fetchMock);

        const request = {
            accountId: 'creator.testnet',
            jobId: 'job-001',
            generation: 1,
            expectedSourceBytes: SOURCE_BYTES,
            sourceType: 'mp4' as const,
        };
        await expect(requestLivepeerUploadIntent(request)).resolves.toEqual(INTENT);
        await expect(requestLivepeerUploadIntent(request)).rejects.toThrow('livepeer_session_key_missing');
        expect(wallet.signAndSendTransaction).toHaveBeenCalledOnce();
    });

    it('defaults to USDC and requires gas reserve for both rails', () => {
        expect(selectCreatorFeeAsset({
            usdcBalance: '300000', nearBalanceYocto: '200', usdcFee: '300000',
            nearFeeYocto: '50', gasReserveYocto: '100',
        })).toEqual({ selected: 'USDC', usable: ['USDC', 'NEAR'] });
        expect(selectCreatorFeeAsset({
            usdcBalance: '300000', nearBalanceYocto: '99', usdcFee: '300000',
            nearFeeYocto: '50', gasReserveYocto: '100',
        })).toEqual({ selected: null, usable: [] });
        expect(selectCreatorFeeAsset({
            usdcBalance: '0', nearBalanceYocto: '200', usdcFee: '300000',
            nearFeeYocto: '50', gasReserveYocto: '100',
        })).toEqual({ selected: 'NEAR', usable: ['NEAR'] });
        expect(selectCreatorFeeAsset({
            usdcBalance: '300000', nearBalanceYocto: '100', usdcFee: '300000',
            gasReserveYocto: '100',
        })).toEqual({ selected: 'USDC', usable: ['USDC'] });
    });

    it('requests and validates the exact server-signed NEAR creator-fee quote', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1_785_589_310_000);
        const signature = btoa('s'.repeat(64));
        const quoteWithoutId = {
            domain: 'youtick.creator-fee-quote',
            version: '1',
            network: 'testnet',
            contract_id: 'paid-media-livepeer-v1.testnet',
            creator_id: 'creator.testnet',
            job_id: 'job-near',
            expected_source_bytes: '1000000000',
            fee_usd_micro: '300000',
            near_usd_micro: '5000000',
            fee_near_yocto: '60000000000000000000000',
            rate_source: 'outlayer-price-oracle-wrap-near-v1',
            rate_timestamp_ms: '1785589300000',
            expires_at_ms: '1785589420000',
            quote_key_version: 1,
        };
        const canonicalMessage = [
            'domain', 'version', 'network', 'contract_id', 'creator_id', 'job_id',
            'expected_source_bytes', 'fee_usd_micro', 'near_usd_micro', 'fee_near_yocto',
            'rate_source', 'rate_timestamp_ms', 'expires_at_ms', 'quote_key_version',
        ].map((field) => String(quoteWithoutId[field as keyof typeof quoteWithoutId])).join('\n');
        const quote = {
            ...quoteWithoutId,
            quote_id: Array.from(new Uint8Array(await crypto.subtle.digest(
                'SHA-256', new TextEncoder().encode(canonicalMessage),
            )), (byte) => byte.toString(16).padStart(2, '0')).join(''),
        };
        const fetchMock = vi.fn().mockResolvedValue(Response.json({
            quote,
            signature,
            public_key_version: 1,
        }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(requestNearCreatorFeeQuote({
            accountId: 'creator.testnet',
            jobId: 'job-near',
            expectedSourceBytes: 1_000_000_000,
        })).resolves.toEqual({ quote, signature });
        expect(fetchMock).toHaveBeenCalledWith(
            'https://bridge.youtick.net/v1/creator-fee-quotes/near',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    creator_id: 'creator.testnet',
                    job_id: 'job-near',
                    expected_source_bytes: '1000000000',
                }),
            }),
        );
    });

    it('rejects a mismatched or expired NEAR quote before wallet use', async () => {
        vi.spyOn(Date, 'now').mockReturnValue(1_785_589_430_000);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
            quote: {
                domain: 'youtick.creator-fee-quote',
                version: '1',
                network: 'testnet',
                contract_id: 'paid-media-livepeer-v1.testnet',
                creator_id: 'other.testnet',
                job_id: 'job-near',
                expected_source_bytes: '1000000000',
                fee_usd_micro: '300000',
                near_usd_micro: '5000000',
                fee_near_yocto: '60000000000000000000000',
                rate_source: 'outlayer-price-oracle-wrap-near-v1',
                rate_timestamp_ms: '1785589300000',
                expires_at_ms: '1785589420000',
                quote_key_version: 1,
                quote_id: 'a'.repeat(64),
            },
            signature: btoa('s'.repeat(64)),
            public_key_version: 1,
        })));

        await expect(requestNearCreatorFeeQuote({
            accountId: 'creator.testnet',
            jobId: 'job-near',
            expectedSourceBytes: 1_000_000_000,
        })).rejects.toThrow('invalid_near_creator_fee_quote');
    });

    it('keeps USDC usable when the NEAR rate source is unavailable', async () => {
        near.viewContract.mockResolvedValue('300000');
        near.query.mockResolvedValue({ amount: '100' });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(
            { error: 'rate_source_unavailable' }, { status: 503 },
        )));

        await expect(prepareCreatorFeePaymentOptions({
            accountId: 'creator.testnet',
            jobId: 'job-near',
            expectedSourceBytes: 1_000_000_000,
            gasReserveYocto: '100',
        })).resolves.toEqual({
            selected: 'USDC',
            usable: ['USDC'],
            usdcFee: '300000',
            nearQuote: undefined,
        });
    });

    it('keeps the NEAR creator-fee rail disabled without requesting a quote', async () => {
        featureFlags.enableLivepeerNearCreatorFee = false;
        near.viewContract.mockResolvedValue('300000');
        near.query.mockResolvedValue({ amount: '100' });
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(prepareCreatorFeePaymentOptions({
            accountId: 'creator.testnet',
            jobId: 'job-usdc-only',
            expectedSourceBytes: 1_000_000_000,
            gasReserveYocto: '100',
        })).resolves.toEqual({
            selected: 'USDC',
            usable: ['USDC'],
            usdcFee: '300000',
            nearQuote: undefined,
        });
        await expect(requestNearCreatorFeeQuote({
            accountId: 'creator.testnet',
            jobId: 'job-near',
            expectedSourceBytes: 1_000_000_000,
        })).rejects.toThrow('near_creator_fee_disabled');
        const wallet = createWallet();
        await expect(authorizeLivepeerPaidJob(wallet as never, {
            accountId: 'creator.testnet',
            jobId: 'job-near',
            title: 'Paid video',
            priceUsdc: '2000000',
            expectedSourceBytes: 1_000_000_000,
            asset: 'NEAR',
        })).rejects.toThrow('near_creator_fee_disabled');
        expect(wallet.signAndSendTransaction).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('creates one native NEAR payment transaction from an approved quote', async () => {
        const wallet = createWallet();
        await authorizeLivepeerPaidJob(wallet as never, {
            accountId: 'creator.testnet',
            jobId: 'job-near',
            title: 'Paid video',
            priceUsdc: '2000000',
            expectedSourceBytes: 1_000_000_000,
            asset: 'NEAR',
            nearQuote: {
                quote: {
                    domain: 'youtick.creator-fee-quote',
                    version: '1',
                    network: 'testnet',
                    contract_id: 'paid-media-livepeer-v1.testnet',
                    creator_id: 'creator.testnet',
                    job_id: 'job-near',
                    expected_source_bytes: '1000000000',
                    fee_usd_micro: '300000',
                    near_usd_micro: '5000000',
                    fee_near_yocto: '60000000000000000000000',
                    rate_source: 'outlayer-price-oracle-wrap-near-v1',
                    rate_timestamp_ms: '1785589300000',
                    expires_at_ms: '1785589420000',
                    quote_key_version: 1,
                    quote_id: 'a'.repeat(64),
                },
                signature: 'signed-quote',
            },
        });
        expect(wallet.signAndSendTransaction).toHaveBeenCalledOnce();
        expect(wallet.signAndSendTransactions).not.toHaveBeenCalled();
        expect(wallet.signAndSendTransaction.mock.calls[0][0]).toMatchObject({
            receiverId: 'paid-media-livepeer-v1.testnet',
            actions: [{
                type: 'FunctionCall',
                methodName: 'create_paid_job_near',
                deposit: 60_000_000_000_000_000_000_000n,
                args: {
                    quote: expect.objectContaining({
                        fee_near_yocto: '60000000000000000000000',
                    }),
                    quote_signature: 'signed-quote',
                    request: expect.objectContaining({
                        upload_public_key: expect.stringMatching(/^ed25519:/),
                    }),
                },
            }],
        });
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
