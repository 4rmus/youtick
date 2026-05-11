import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    batchUploadActionsSignless: vi.fn(),
    createSession: vi.fn(),
    clearSession: vi.fn(),
    dispatch: vi.fn(),
    encryptBufferWithCounter: vi.fn(),
    fetchDeliveryManifest: vi.fn(),
    getWallet: vi.fn(),
    invalidateQueries: vi.fn(),
    isDeliveryManifestV2: vi.fn(),
    isLighthouseUploadProviderActive: vi.fn(),
    packageVideoForDelivery: vi.fn(),
    placeStorageOrders: vi.fn(),
    retrieveEncryptionKey: vi.fn(),
    storeEncryptionKey: vi.fn(),
    uploadDirectoryToStorage: vi.fn(),
    uploadFileWithStorageApi: vi.fn(),
    verifyStorageOrders: vi.fn(),
}));

vi.mock('react', () => ({
    useCallback: (fn: unknown) => fn,
    useReducer: (_reducer: unknown, initialState: unknown) => [initialState, mocks.dispatch],
    useRef: (initialValue: unknown) => ({ current: initialValue }),
}));

vi.mock('@tanstack/react-query', () => ({
    useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('@/components/providers/WalletProvider', () => ({
    useWallet: () => ({
        accountId: 'creator.testnet',
        getWallet: mocks.getWallet,
    }),
}));

vi.mock('@/lib/storage/provider', () => ({
    isLighthouseUploadProviderActive: mocks.isLighthouseUploadProviderActive,
    placeStorageOrders: mocks.placeStorageOrders,
    uploadDirectoryToStorage: mocks.uploadDirectoryToStorage,
    verifyStorageOrders: mocks.verifyStorageOrders,
}));

vi.mock('@/lib/storage/storage-api', () => ({
    getCidPinStatusFromStorageApi: vi.fn(),
    isLighthousePersistencePilotEnabled: () => false,
    pinCidWithStorageApi: vi.fn(),
    uploadFileWithStorageApi: mocks.uploadFileWithStorageApi,
}));

vi.mock('@/lib/kms/encryption', () => ({
    encryptBufferWithCounter: mocks.encryptBufferWithCounter,
    generateAESKey: vi.fn(async () => 'test-key'),
}));

vi.mock('@/lib/kms/client', () => ({
    retrieveEncryptionKey: mocks.retrieveEncryptionKey,
    storeEncryptionKey: mocks.storeEncryptionKey,
}));

vi.mock('@/lib/upload-session-manager', () => ({
    UploadSessionManager: class {
        async createSession(wallet: unknown) {
            return mocks.createSession(wallet);
        }

        clearSession() {
            return mocks.clearSession();
        }
    },
}));

vi.mock('@/lib/batch-transactions', () => ({
    batchUploadActionsSignless: mocks.batchUploadActionsSignless,
}));

vi.mock('@/lib/video-delivery', () => ({
    DELIVERY_UPLOAD_CONCURRENCY: 1,
    buildSegmentedEventTitle: (_thumbnailUrl: string | undefined, _manifestCid: string, title: string) => title,
    combinePackagedSegmentPayloads: (payloads: Array<{ buffer: ArrayBuffer }>) => payloads[0],
    createDeliverySegment: (seq: number, payloads: unknown[]) => ({ seq, payloads }),
    fetchDeliveryManifest: mocks.fetchDeliveryManifest,
    isDeliveryManifestV2: mocks.isDeliveryManifestV2,
    packageVideoForDelivery: mocks.packageVideoForDelivery,
    shouldUseSegmentedDelivery: () => true,
    toDeliveryManifestV2: () => ({ version: 2 }),
    warmupGatewayCids: vi.fn(),
}));

describe('useUpload', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);

        mocks.batchUploadActionsSignless.mockRejectedValue(new Error('contract failed'));
        mocks.createSession.mockResolvedValue(undefined);
        mocks.encryptBufferWithCounter.mockImplementation(async (bytes: Uint8Array) => ({
            ciphertext: bytes,
            counterB64: 'counter',
        }));
        mocks.fetchDeliveryManifest.mockResolvedValue({ version: 2 });
        mocks.getWallet.mockResolvedValue({ wallet: true });
        mocks.isDeliveryManifestV2.mockReturnValue(true);
        mocks.isLighthouseUploadProviderActive.mockReturnValue(false);
        mocks.packageVideoForDelivery.mockResolvedValue({
            durationMs: 1000,
            initSegment: new Uint8Array([1]).buffer,
            tracks: [{ id: 1, kind: 'video' }],
            segments: [{
                seq: 0,
                payloads: [{
                    buffer: new Uint8Array([2]).buffer,
                    trackId: 1,
                    kind: 'video',
                    byteLength: 1,
                    startMs: 0,
                    endMs: 1000,
                }],
            }],
        });
        mocks.retrieveEncryptionKey.mockResolvedValue('test-key');
        mocks.storeEncryptionKey.mockResolvedValue(undefined);
        mocks.uploadDirectoryToStorage.mockResolvedValue({ cid: 'QmDeliveryRoot', size: 1 });
        mocks.uploadFileWithStorageApi.mockImplementation(async (path: string, blob: Blob) => ({
            cid: path === 'manifest.json' ? 'QmManifestCid' : `QmAsset-${path}`,
            path,
            size: blob.size,
        }));
        mocks.placeStorageOrders.mockResolvedValue({
            total: 1,
            succeeded: 1,
            failed: 0,
            results: [{ requestId: '', status: 'queued', cid: 'QmDeliveryRoot', createdAt: 1 }],
        });
        mocks.verifyStorageOrders.mockResolvedValue({ verified: 1, pending: 0, failed: 0 });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns false when blockchain publish fails after delivery upload', async () => {
        const { useUpload } = await import('@/hooks/useUpload');
        const { handleUpload } = useUpload();

        const result = await handleUpload({
            file: new File([new Uint8Array([1])], 'video.mp4', { type: 'video/mp4' }),
            thumbnail: null,
            posterThumbnail: null,
            title: 'Test video',
            description: 'Test description',
            price: '0',
            priceUsdNum: 0,
            accessMode: 'free_collectible',
            contentType: 'film',
            estimatedStorageFee: '0',
        });

        const actions = mocks.dispatch.mock.calls.map(([action]) => action);
        const statusMessages = actions
            .filter((action) => action.type === 'SET_STATUS')
            .map((action) => action.payload);
        const publishedCidActions = actions
            .filter((action) => action.type === 'SET_PUBLISHED_CID' && action.payload);

        expect(result).toBe(false);
        expect(mocks.batchUploadActionsSignless).toHaveBeenCalledOnce();
        expect(actions).toContainEqual({ type: 'UPDATE_STEP', payload: { id: 'mint', status: 'error' } });
        expect(publishedCidActions).toHaveLength(0);
        expect(mocks.placeStorageOrders).not.toHaveBeenCalled();
        expect(mocks.invalidateQueries).not.toHaveBeenCalled();
        expect(statusMessages).toContain('Video uploaded but blockchain actions failed: contract failed');
        expect(statusMessages).not.toContain('Success! Video uploaded & ticket sales started!');
    });

    it('stops before blockchain publish when Lighthouse manifest readback fails', async () => {
        mocks.isLighthouseUploadProviderActive.mockReturnValue(true);
        mocks.isDeliveryManifestV2
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(false);

        const { useUpload } = await import('@/hooks/useUpload');
        const { handleUpload } = useUpload();

        const result = await handleUpload({
            file: new File([new Uint8Array([1])], 'video.mp4', { type: 'video/mp4' }),
            thumbnail: null,
            posterThumbnail: null,
            title: 'Test video',
            description: 'Test description',
            price: '0',
            priceUsdNum: 0,
            accessMode: 'free_collectible',
            contentType: 'film',
            estimatedStorageFee: '0',
        });

        const actions = mocks.dispatch.mock.calls.map(([action]) => action);
        const statusMessages = actions
            .filter((action) => action.type === 'SET_STATUS')
            .map((action) => action.payload);

        expect(result).toBe(false);
        expect(mocks.fetchDeliveryManifest).toHaveBeenCalledWith('QmManifestCid', { timeout: 15_000 });
        expect(mocks.batchUploadActionsSignless).not.toHaveBeenCalled();
        expect(statusMessages).toContain('Upload failed: Delivery manifest could not be verified after Lighthouse upload. Upload was stopped before publishing.');
    });

    it('does not overwrite failed storage verification with a success message', async () => {
        mocks.batchUploadActionsSignless.mockResolvedValue({ ok: true });
        mocks.verifyStorageOrders.mockResolvedValue({ verified: 0, pending: 0, failed: 1 });

        const { useUpload } = await import('@/hooks/useUpload');
        const { handleUpload } = useUpload();

        const result = await handleUpload({
            file: new File([new Uint8Array([1])], 'video.mp4', { type: 'video/mp4' }),
            thumbnail: null,
            posterThumbnail: null,
            title: 'Test video',
            description: 'Test description',
            price: '0',
            priceUsdNum: 0,
            accessMode: 'free_collectible',
            contentType: 'film',
            estimatedStorageFee: '0',
        });

        const actions = mocks.dispatch.mock.calls.map(([action]) => action);
        const statusMessages = actions
            .filter((action) => action.type === 'SET_STATUS')
            .map((action) => action.payload);

        expect(result).toBe(true);
        expect(mocks.placeStorageOrders).toHaveBeenCalledOnce();
        expect(mocks.verifyStorageOrders).toHaveBeenCalledOnce();
        expect(statusMessages).toContain('Video published, but storage verification failed — long-term persistence is not guaranteed.');
        expect(statusMessages).not.toContain('Success! Video uploaded & ticket sales started!');
    });
});
