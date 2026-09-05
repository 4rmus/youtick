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
    enableSponsoredLivepeerUploads: false,
    publicTestnetBeta: false,
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
    advanceLivepeerUploadDraftStage,
    authorizeLivepeerPaidJob,
    cancelLivepeerUpload,
    clearLivepeerJobSessionKey,
    clearLivepeerUploadDraft,
    configuredCreatorFeeGasReserveYocto,
    fingerprintLivepeerSource,
    heartbeatLivepeerUploadLease,
    parseLivepeerPriceUsdc,
    preflightLivepeerUpload,
    prepareCreatorFeePaymentOptions,
    livepeerUploadFeeUsdc,
    requestLivepeerUploadIntent,
    requestNearCreatorFeeQuote,
    readLivepeerUploadDraft,
    sponsoredUploadPaymentOptionsChanged,
    uploadLivepeerSource,
    validateLivepeerSourceFile,
    writeLivepeerUploadDraft,
    selectCreatorFeeAsset,
    type LivepeerUploadIntent,
} from '@/lib/livepeer-upload';

const SOURCE_BYTES = 20 * 1024 * 1024;
const SOURCE_FINGERPRINT = 'a'.repeat(64);
const INTENT: LivepeerUploadIntent = {
    schema: 'youtick.livepeer-upload-intent.v2',
    job_id: 'job-001',
    generation: 1,
    expected_source_bytes: String(SOURCE_BYTES),
    source_type: 'mp4',
    chunk_bytes: 32 * 1024 * 1024,
    tus_endpoint: 'https://origin.livepeer.com/api/asset/upload/tus/upload-123',
    lease_id: '00000000-0000-4000-8000-000000000001',
    lease_expires_at_ms: '999999999999999',
    heartbeat_interval_ms: 5 * 60 * 1000,
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

function createSponsoredWallet() {
    return {
        ...createWallet(),
        signDelegateActions: vi.fn().mockResolvedValue({
            signedDelegateActions: ['A'.repeat(64)],
        }),
    };
}

async function sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sponsoredQuoteResponse(
    request: Record<string, string>,
    overrides: Partial<Record<string, string>> = {},
): Promise<Response> {
    const quoteWithoutId = {
        domain: 'youtick.sponsored-upload-quote',
        version: '1',
        network: 'testnet',
        contract_id: 'paid-media-livepeer-v1.testnet',
        creator_id: request.creator_id,
        job_id: request.job_id,
        request_sha256: await sha256(JSON.stringify(request)),
        expected_source_bytes: request.expected_source_bytes,
        upload_fee_usdc: '500000',
        sponsor_fee_usdc: '100000',
        total_fee_usdc: '600000',
        delegate_receiver_id: 'usdc.testnet',
        delegate_method: 'ft_transfer_call',
        delegate_gas: '100000000000000',
        delegate_deposit_yocto: '1',
        issued_at_ms: '1785589300000',
        quote_block_height: '1000',
        max_delegate_block_height: '1200',
        expires_at_ms: '1785589420000',
        quote_key_version: 1,
        ...overrides,
    };
    const canonical = [
        'domain', 'version', 'network', 'contract_id', 'creator_id', 'job_id',
        'request_sha256', 'expected_source_bytes', 'upload_fee_usdc',
        'sponsor_fee_usdc', 'total_fee_usdc', 'delegate_receiver_id',
        'delegate_method', 'delegate_gas', 'delegate_deposit_yocto',
        'issued_at_ms', 'quote_block_height', 'max_delegate_block_height',
        'expires_at_ms', 'quote_key_version',
    ].map((field) => String(quoteWithoutId[field as keyof typeof quoteWithoutId])).join('\n');
    return Response.json({
        request,
        quote: { ...quoteWithoutId, quote_id: await sha256(canonical) },
        signature: btoa('\0'.repeat(64)),
        public_key_version: 1,
    });
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
        featureFlags.enableSponsoredLivepeerUploads = false;
        featureFlags.publicTestnetBeta = false;
        near.viewContract.mockReset().mockResolvedValue(null);
        sessionStorage.clear();
        delete process.env.NEXT_PUBLIC_LIVEPEER_CREATOR_FEE_GAS_RESERVE_YOCTO;
        delete process.env.NEXT_PUBLIC_PAYMENT_GAS_RESERVE_YOCTO;
    });

    it('signs the locked upload-intent envelope and retains its session key for heartbeats', async () => {
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
            sourceFingerprintSha256: SOURCE_FINGERPRINT,
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
        expect(request.body.source_fingerprint_sha256).toBe(SOURCE_FINGERPRINT);
        expect(request.body.source_type).toBe('mp4');
        expect(request.body.profile_config_sha256)
            .toBe('96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77');
        expect(request.envelope).toMatchObject({
            version: '3',
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
            sourceFingerprintSha256: SOURCE_FINGERPRINT,
            sourceType: 'mp4',
        })).resolves.toEqual(INTENT);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('reads only bounded status for the same signed job without wallet or payment calls', async () => {
        const wallet = createWallet();
        await provisionJobSession(wallet);
        wallet.signAndSendTransaction.mockClear();
        const status = { job_id: 'job-001', generation: 1, state: 'PROVIDER_FAILED' };
        const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(status))
            .mockResolvedValueOnce(Response.json({ ...status, job_id: 'other-job' }));
        vi.stubGlobal('fetch', fetchMock);
        const input = {
            accountId: 'creator.testnet', jobId: 'job-001', generation: 1,
            expectedSourceBytes: SOURCE_BYTES, sourceFingerprintSha256: SOURCE_FINGERPRINT,
            sourceType: 'mp4' as const, recovery: 'reconcile' as const,
        };
        await expect(requestLivepeerUploadIntent(input)).resolves.toEqual(status);
        await expect(requestLivepeerUploadIntent(input)).rejects.toThrow('livepeer_upload_status_unavailable');
        expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).body.recovery).toBe('reconcile');
        expect(wallet.signAndSendTransaction).not.toHaveBeenCalled();
    });

    it('signs a lease heartbeat with the same session-only upload key', async () => {
        const wallet = createWallet();
        await provisionJobSession(wallet);
        const fetchMock = vi.fn().mockResolvedValue(Response.json({
            schema: 'youtick.livepeer-upload-lease.v1',
            job_id: INTENT.job_id,
            generation: INTENT.generation,
            lease_id: INTENT.lease_id,
            expires_at_ms: '999999999999999',
            heartbeat_interval_ms: INTENT.heartbeat_interval_ms,
        }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(heartbeatLivepeerUploadLease({
            accountId: 'creator.testnet',
            intent: INTENT,
        })).resolves.toBe('999999999999999');
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://bridge.youtick.net/v1/upload-heartbeats');
        const request = JSON.parse(String(init.body));
        expect(request.body).toEqual({
            job_id: INTENT.job_id,
            generation: INTENT.generation,
            lease_id: INTENT.lease_id,
        });
        expect(request.envelope).toMatchObject({
            route: '/v1/upload-heartbeats',
            resource: 'job:job-001:1',
        });
    });

    it('signs a non-refundable pre-provider cancellation with the job session key', async () => {
        const wallet = createWallet();
        const publicKey = await provisionJobSession(wallet);
        const fetchMock = vi.fn().mockResolvedValue(Response.json({
            cancelled: true,
            duplicate: false,
            refundable: false,
        }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(cancelLivepeerUpload({
            accountId: 'creator.testnet',
            jobId: 'job-001',
            generation: 1,
        })).resolves.toBeUndefined();

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://bridge.youtick.net/v1/upload-cancellations');
        expect((init.headers as Record<string, string>)['X-Youtick-Signature'])
            .toMatch(/^[A-Za-z0-9+/]+=*$/);
        const request = JSON.parse(String(init.body));
        expect(request.body).toEqual({ job_id: 'job-001', generation: 1 });
        expect(request.envelope).toMatchObject({
            version: '2',
            route: '/v1/upload-cancellations',
            resource: 'job:job-001:1',
            session_public_key: publicKey,
        });
    });

    it.each(['http://localhost:3000', 'http://127.0.0.1:3000'])(
        'signs the exact local origin %s used by the configured runtime',
        async (origin) => {
            const originalWindow = globalThis.window;
            globalThis.window = { location: { origin } } as Window & typeof globalThis;
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
                    sourceFingerprintSha256: SOURCE_FINGERPRINT,
                    sourceType: 'mp4',
                });

                const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
                expect(request.envelope.origin).toBe(origin);
            } finally {
                globalThis.window = originalWindow;
                vi.unstubAllGlobals();
            }
        },
    );

    it('checks upload admission without creating a reservation', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(Response.json({ available: true }))
            .mockResolvedValueOnce(Response.json({ error: 'admission_closed' }, { status: 503 }));
        vi.stubGlobal('fetch', fetchMock);
        const input = {
            accountId: 'creator.testnet',
            jobId: 'job-preflight',
            generation: 1,
            expectedSourceBytes: SOURCE_BYTES,
        };

        await expect(preflightLivepeerUpload(input)).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'https://bridge.youtick.net/v1/upload-preflight',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    creator_id: 'creator.testnet',
                    job_id: 'job-preflight',
                    generation: 1,
                    expected_source_bytes: String(SOURCE_BYTES),
                }),
            }),
        );
        await expect(preflightLivepeerUpload(input)).rejects.toThrow('admission_closed');
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
            sourceFingerprintSha256: SOURCE_FINGERPRINT,
            sourceType: 'mp4',
        })).resolves.toEqual(exactIntent);
        await expect(requestLivepeerUploadIntent({
            accountId: 'creator.testnet',
            jobId: 'job-too-large',
            generation: 1,
            expectedSourceBytes: 20_000_000_001,
            sourceFingerprintSha256: SOURCE_FINGERPRINT,
            sourceType: 'mp4',
        })).rejects.toThrow('source_limit_exceeded');
        await expect(requestLivepeerUploadIntent({
            accountId: 'creator.testnet',
            jobId: 'job-max',
            generation: 1,
            expectedSourceBytes: 20_000_000_000,
            sourceFingerprintSha256: 'not-a-fingerprint',
            sourceType: 'mp4',
        })).rejects.toThrow('invalid_source_fingerprint');
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

    it('restores only the same fingerprinted file and job after a wallet redirect', async () => {
        const file = new File(['video'], 'video.mp4', { type: 'video/mp4', lastModified: 123 });
        const draft = {
            schema: 'youtick.livepeer-ui-draft.v2' as const,
            stage: 'payment_pending' as const,
            jobId: 'job-001',
            title: 'Paid video',
            price: '2.00',
            sourceBytes: file.size,
            sourceName: file.name,
            sourceLastModified: file.lastModified,
            sourceFingerprintSha256: await fingerprintLivepeerSource(file),
        };
        writeLivepeerUploadDraft('creator.testnet', draft);

        await expect(readLivepeerUploadDraft('creator.testnet', file)).resolves.toEqual(draft);
        advanceLivepeerUploadDraftStage('creator.testnet', 'job-001', 'upload_ready');
        advanceLivepeerUploadDraftStage('creator.testnet', 'job-001', 'authorized');
        await expect(readLivepeerUploadDraft('creator.testnet', file)).resolves.toEqual({
            ...draft,
            stage: 'upload_ready',
        });
        writeLivepeerUploadDraft('creator.testnet', draft);
        await expect(readLivepeerUploadDraft('creator.testnet', file)).resolves.toEqual({
            ...draft,
            stage: 'upload_ready',
        });
        await expect(readLivepeerUploadDraft(
            'creator.testnet',
            new File(['other'], 'other.mp4', { type: 'video/mp4', lastModified: 456 }),
        )).resolves.toBeNull();
        await expect(readLivepeerUploadDraft(
            'creator.testnet',
            new File(['other'], 'video.mp4', { type: 'video/mp4', lastModified: 123 }),
        )).resolves.toBeNull();
        clearLivepeerUploadDraft('creator.testnet');
        await expect(readLivepeerUploadDraft('creator.testnet', file)).resolves.toBeNull();
    });

    it('uses one sequential 32 MiB TUS stream and does not retry an offset conflict', async () => {
        const sourceBytes = 80 * 1024 * 1024;
        const file = new File([new Uint8Array(sourceBytes)], 'video.mp4', { type: 'video/mp4' });
        const onProgress = vi.fn();

        await uploadLivepeerSource(file, {
            ...INTENT,
            expected_source_bytes: String(sourceBytes),
        }, { onProgress });

        const instance = tus.instances[0];
        expect(instance.started).toBe(true);
        expect(instance.options.uploadUrl).toBe(INTENT.tus_endpoint);
        expect(instance.options.endpoint).toBeUndefined();
        expect(instance.options.storeFingerprintForResuming).toBe(false);
        expect(instance.options.chunkSize).toBe(32 * 1024 * 1024);
        expect(instance.options.parallelUploads).toBe(1);
        expect(file.size % Number(instance.options.chunkSize)).toBe(16 * 1024 * 1024);
        (instance.options.onProgress as (uploaded: number, total: number) => void)(12, 34);
        expect(onProgress).toHaveBeenCalledWith(12, 34);
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
        expect(livepeerUploadFeeUsdc(83_886_080)).toBe('500000');
        expect(livepeerUploadFeeUsdc(1_000_000_000)).toBe('500000');
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
                amount: '500000',
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

    it('shows one exact sponsor quote and sends one delegate instead of a wallet transaction', async () => {
        featureFlags.enableSponsoredLivepeerUploads = true;
        vi.spyOn(Date, 'now').mockReturnValue(1_785_589_300_000);
        const wallet = createSponsoredWallet();
        const onSponsoredQuote = vi.fn();
        const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url.endsWith('/v1/sponsored-upload-relays')) {
                expect(JSON.parse(String(init?.body))).toEqual({
                    signed_delegate_base64: 'A'.repeat(64),
                });
                return Response.json({
                    accepted: true,
                    relayed: false,
                    job_id: 'job-sponsored',
                    tx_hash: 'relay-transaction',
                }, { status: 202 });
            }
            expect(url).toBe('https://bridge.youtick.net/v1/sponsored-upload-quotes');
            const { request } = JSON.parse(String(init?.body)) as {
                request: Record<string, string>;
            };
            return sponsoredQuoteResponse(request);
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(authorizeLivepeerPaidJob(wallet as never, {
            accountId: 'creator.testnet',
            jobId: 'job-sponsored',
            title: 'Paid video',
            priceUsdc: '2000001',
            expectedSourceBytes: 83_886_080,
            onSponsoredQuote,
        })).resolves.toMatch(/^ed25519:/);

        expect(onSponsoredQuote).toHaveBeenCalledWith({
            uploadFeeUsdc: '500000',
            sponsorFeeUsdc: '100000',
            totalFeeUsdc: '600000',
        });
        expect(wallet.signAndSendTransaction).not.toHaveBeenCalled();
        expect(wallet.signAndSendTransactions).not.toHaveBeenCalled();
        expect(wallet.signDelegateActions).toHaveBeenCalledOnce();
        expect(wallet.signDelegateActions.mock.calls[0][0].blockHeightTtl).toBe(200);
        const delegate = wallet.signDelegateActions.mock.calls[0][0].delegateActions[0];
        expect(delegate.receiverId).toBe('usdc.testnet');
        const action = delegate.actions[0] as {
            methodName: string;
            gas: bigint;
            deposit: bigint;
            args: { receiver_id: string; amount: string; msg: string };
        };
        expect(action).toMatchObject({
            methodName: 'ft_transfer_call',
            gas: 100_000_000_000_000n,
            deposit: 1n,
            args: {
                receiver_id: 'paid-media-livepeer-v1.testnet',
                amount: '600000',
                msg: expect.any(String),
            },
        });
        expect(JSON.parse(action.args.msg)).toMatchObject({
            action: 'create_paid_job',
            job_id: 'job-sponsored',
            sponsor_quote: { total_fee_usdc: '600000' },
            sponsor_quote_signature: btoa('\0'.repeat(64)),
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);

        await expect(authorizeLivepeerPaidJob(wallet as never, {
            accountId: 'creator.testnet',
            jobId: 'job-sponsored',
            title: 'Paid video',
            priceUsdc: '2000001',
            expectedSourceBytes: 83_886_080,
            onSponsoredQuote,
        })).resolves.toMatch(/^ed25519:/);
        expect(wallet.signDelegateActions).toHaveBeenCalledOnce();
        expect(onSponsoredQuote).toHaveBeenCalledOnce();
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('propagates only allowlisted sponsor relay rejection reasons', async () => {
        featureFlags.enableSponsoredLivepeerUploads = true;
        vi.spyOn(Date, 'now').mockReturnValue(1_785_589_300_000);
        const wallet = createSponsoredWallet();
        let reason = 'access_key';
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).endsWith('/v1/sponsored-upload-relays')) {
                return Response.json({ error: 'invalid_sponsored_upload_relay', reason }, { status: 400 });
            }
            const { request } = JSON.parse(String(init?.body)) as {
                request: Record<string, string>;
            };
            return sponsoredQuoteResponse(request);
        }));

        await expect(authorizeLivepeerPaidJob(wallet as never, {
            accountId: 'creator.testnet',
            jobId: 'job-sponsored-rejected',
            title: 'Paid video',
            priceUsdc: '2000001',
            expectedSourceBytes: SOURCE_BYTES,
        })).rejects.toThrow('invalid_sponsored_upload_relay:access_key');

        reason = 'secret_payload';
        await expect(authorizeLivepeerPaidJob(wallet as never, {
            accountId: 'creator.testnet',
            jobId: 'job-sponsored-redacted',
            title: 'Paid video',
            priceUsdc: '2000001',
            expectedSourceBytes: SOURCE_BYTES,
        })).rejects.toThrow(/^invalid_sponsored_upload_relay$/);
    });

    it('falls back to the existing USDC transaction when delegate signing is unavailable', async () => {
        featureFlags.enableSponsoredLivepeerUploads = true;
        const wallet = createWallet();
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await provisionJobSession(wallet);

        expect(wallet.signAndSendTransaction).toHaveBeenCalledOnce();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects a mismatched sponsor quote before opening the wallet', async () => {
        featureFlags.enableSponsoredLivepeerUploads = true;
        const wallet = createSponsoredWallet();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
            request: {},
            quote: {},
            signature: 'invalid',
            public_key_version: 1,
        })));

        await expect(authorizeLivepeerPaidJob(wallet as never, {
            accountId: 'creator.testnet',
            jobId: 'job-invalid-sponsor',
            title: 'Paid video',
            priceUsdc: '2000001',
            expectedSourceBytes: SOURCE_BYTES,
        })).rejects.toThrow('invalid_sponsored_upload_quote');
        expect(wallet.signDelegateActions).not.toHaveBeenCalled();
        expect(wallet.signAndSendTransaction).not.toHaveBeenCalled();
    });

    it('rejects a non-fixed sponsor fee before opening the wallet', async () => {
        featureFlags.enableSponsoredLivepeerUploads = true;
        vi.spyOn(Date, 'now').mockReturnValue(1_785_589_300_000);
        const wallet = createSponsoredWallet();
        vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            const { request } = JSON.parse(String(init?.body)) as {
                request: Record<string, string>;
            };
            return sponsoredQuoteResponse(request, {
                sponsor_fee_usdc: '99999',
                total_fee_usdc: '599999',
            });
        }));

        await expect(authorizeLivepeerPaidJob(wallet as never, {
            accountId: 'creator.testnet',
            jobId: 'job-invalid-sponsor-fee',
            title: 'Paid video',
            priceUsdc: '2000001',
            expectedSourceBytes: SOURCE_BYTES,
        })).rejects.toThrow('invalid_sponsored_upload_quote');
        expect(wallet.signDelegateActions).not.toHaveBeenCalled();
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
        near.viewContract.mockResolvedValue({ ...request, fee_asset: 'USDC', status: 'Authorized' });

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

    it('blocks public-beta key replacement before wallet approval or a second payment', async () => {
        const wallet = createWallet();
        await provisionJobSession(wallet);
        const request = JSON.parse((wallet.signAndSendTransaction.mock.calls[0][0].actions[0] as { args: { msg: string } }).args.msg);
        near.viewContract.mockResolvedValue({ ...request, fee_asset: 'USDC', status: 'Authorized' });
        clearLivepeerJobSessionKey('creator.testnet', 'job-001');
        wallet.signAndSendTransaction.mockClear();
        featureFlags.publicTestnetBeta = true;
        await expect(provisionJobSession(wallet)).rejects.toThrow('livepeer_upload_key_recovery_unavailable');
        expect(wallet.signAndSendTransaction).not.toHaveBeenCalled();
        expect(sessionStorage.length).toBe(0);
    });

    it('replaces only the missing upload key for the matching on-chain job', async () => {
        near.viewContract.mockResolvedValue({
            job_id: 'job-001',
            creator_id: 'creator.testnet',
            title: 'Paid video',
            price_usdc: '2000001',
            expected_source_bytes: String(SOURCE_BYTES),
            profile_id: 'paid-media-livepeer-v1',
            profile_config_sha256: '96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77',
            upload_public_key: 'ed25519:lost-browser-key',
            upload_key_expires_at_ms: '1785675700000',
            fee_asset: 'USDC',
            status: 'Authorized',
        });
        const wallet = createWallet();

        await expect(provisionJobSession(wallet)).resolves.toMatch(/^ed25519:/);
        expect(wallet.signAndSendTransaction).toHaveBeenCalledOnce();
        expect(wallet.signAndSendTransactions).not.toHaveBeenCalled();
        expect(wallet.signAndSendTransaction.mock.calls[0][0]).toMatchObject({
            receiverId: 'paid-media-livepeer-v1.testnet',
            actions: [{
                methodName: 'replace_upload_key',
                args: expect.objectContaining({
                    job_id: 'job-001',
                    new_public_key: expect.stringMatching(/^ed25519:/),
                }),
                deposit: 0n,
            }],
        });
        expect(sessionStorage.length).toBe(1);
    });

    it('clears only the selected local key after upload completion', async () => {
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
            sourceFingerprintSha256: SOURCE_FINGERPRINT,
            sourceType: 'mp4' as const,
        };
        await expect(requestLivepeerUploadIntent(request)).resolves.toEqual(INTENT);
        clearLivepeerJobSessionKey(request.accountId, request.jobId);
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
        expect(selectCreatorFeeAsset({
            usdcBalance: '300000', nearBalanceYocto: '0', usdcFee: '300000',
            gasReserveYocto: '100', gasSponsoredUsdc: true,
        })).toEqual({ selected: 'USDC', usable: ['USDC'] });
    });

    it('includes the fixed sponsor fee in the USDC balance preflight', async () => {
        featureFlags.enableLivepeerNearCreatorFee = false;
        near.query.mockResolvedValue({ amount: '0' });
        near.viewContract.mockResolvedValueOnce('599999').mockResolvedValueOnce('600000');

        await expect(prepareCreatorFeePaymentOptions({
            accountId: 'creator.testnet',
            jobId: 'job-sponsored-balance-low',
            expectedSourceBytes: 1_000_000_000,
            gasReserveYocto: '100',
            gasSponsoredUsdc: true,
        })).resolves.toMatchObject({ selected: null, usable: [], usdcFee: '500000' });
        await expect(prepareCreatorFeePaymentOptions({
            accountId: 'creator.testnet',
            jobId: 'job-sponsored-balance-exact',
            expectedSourceBytes: 1_000_000_000,
            gasReserveYocto: '100',
            gasSponsoredUsdc: true,
        })).resolves.toMatchObject({ selected: 'USDC', usable: ['USDC'], usdcFee: '500000' });
    });

    it('requires a new preflight when a checkout appears after sponsor selection', () => {
        expect(sponsoredUploadPaymentOptionsChanged(true, true)).toBe(true);
        expect(sponsoredUploadPaymentOptionsChanged(true, false)).toBe(false);
        expect(sponsoredUploadPaymentOptionsChanged(false, true)).toBe(false);
    });

    it('uses the shared payment gas reserve when the legacy upload value is absent', () => {
        process.env.NEXT_PUBLIC_PAYMENT_GAS_RESERVE_YOCTO = '123';
        expect(configuredCreatorFeeGasReserveYocto()).toBe('123');
        process.env.NEXT_PUBLIC_LIVEPEER_CREATOR_FEE_GAS_RESERVE_YOCTO = '456';
        expect(configuredCreatorFeeGasReserveYocto()).toBe('456');
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
            fee_usd_micro: '500000',
            near_usd_micro: '5000000',
            fee_near_yocto: '100000000000000000000000',
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
                fee_usd_micro: '500000',
                near_usd_micro: '5000000',
                fee_near_yocto: '100000000000000000000000',
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
        near.viewContract.mockResolvedValue('500000');
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
            usdcFee: '500000',
            nearQuote: undefined,
        });
    });

    it('keeps the NEAR creator-fee rail disabled without requesting a quote', async () => {
        featureFlags.enableLivepeerNearCreatorFee = false;
        near.viewContract.mockResolvedValue('500000');
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
            usdcFee: '500000',
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
                    fee_usd_micro: '500000',
                    near_usd_micro: '5000000',
                    fee_near_yocto: '100000000000000000000000',
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
                    deposit: 100_000_000_000_000_000_000_000n,
                args: {
                    quote: expect.objectContaining({
                        fee_near_yocto: '100000000000000000000000',
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
