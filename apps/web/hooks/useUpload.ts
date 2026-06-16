'use client';

import { useReducer, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/components/providers/WalletProvider';
import { isLighthouseUploadProviderActive, uploadDirectoryToStorage } from '@/lib/storage/provider';
import { getCidPinStatusFromStorageApi, isLighthousePersistencePilotEnabled, pinCidWithStorageApi, uploadFileWithStorageApi } from '@/lib/storage/storage-api';
import { CidCollector } from '@/lib/storage/cid-collector';
import {
    encryptBufferWithCounter,
    generateAESKey,
} from '@/lib/kms/encryption';
import { retrieveEncryptionKey, storeEncryptionKey } from '@/lib/kms/client';
import { UploadSessionManager } from '@/lib/upload-session-manager';
import {
    batchUploadActionsSignless,
    type SignlessUploadManager,
} from '@/lib/batch-transactions';
import { nearAmountToYocto } from '@/lib/near-amount';
import type { DeliverySegmentPayload } from '@/lib/types';
import type { PackagedDeliveryAsset } from '@/lib/video-delivery';

const LIGHTHOUSE_PAYLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

// ── Upload state reducer ──

import type { UploadStep } from '@/lib/types';

type StepStatus = UploadStep['status'];

const INITIAL_STEPS: UploadStep[] = [
    { id: 'session', label: 'Wallet & Balance', status: 'pending' },
    { id: 'thumbnail', label: 'Cover Image', status: 'pending' },
    { id: 'encrypt', label: 'Encrypting Video', status: 'pending' },
    { id: 'upload', label: 'Uploading to IPFS', status: 'pending' },
    { id: 'kms', label: 'Storing Encryption Key', status: 'pending' },
    { id: 'mint', label: 'Minting NFT Ticket', status: 'pending' },
    { id: 'storage', label: 'Persistent Storage Order', status: 'pending' },
    { id: 'verify', label: 'Verifying Storage', status: 'pending' },
];

interface UploadState {
    uploading: boolean;
    status: string;
    progress: number;
    steps: UploadStep[];
    retryStep: 'none' | 'sign_auth';
    verifiedStorageFee: string;
    estimatedStorageFee: string;
    payAmount: string;
    storageOrderStatus: 'pending' | 'success' | 'partial' | 'failed' | null;
    publishedCid: string | null;
}

const initialUploadState: UploadState = {
    uploading: false,
    status: '',
    progress: 0,
    steps: INITIAL_STEPS,
    retryStep: 'none',
    verifiedStorageFee: '0',
    estimatedStorageFee: '0',
    payAmount: '0',
    storageOrderStatus: null,
    publishedCid: null,
};

type UploadAction =
    | { type: 'SET_UPLOADING'; payload: boolean }
    | { type: 'SET_STATUS'; payload: string }
    | { type: 'SET_PROGRESS'; payload: number }
    | { type: 'UPDATE_STEP'; payload: { id: string; status: StepStatus } }
    | { type: 'RESET_STEPS' }
    | { type: 'SET_RETRY_STEP'; payload: 'none' | 'sign_auth' }
    | { type: 'SET_VERIFIED_STORAGE_FEE'; payload: string }
    | { type: 'SET_ESTIMATED_STORAGE_FEE'; payload: string }
    | { type: 'SET_PAY_AMOUNT'; payload: string }
    | { type: 'SET_STORAGE_ORDER_STATUS'; payload: UploadState['storageOrderStatus'] }
    | { type: 'SET_PUBLISHED_CID'; payload: string | null }
    | { type: 'RESET' };

function uploadReducer(state: UploadState, action: UploadAction): UploadState {
    switch (action.type) {
        case 'SET_UPLOADING':
            return { ...state, uploading: action.payload };
        case 'SET_STATUS':
            return { ...state, status: action.payload };
        case 'SET_PROGRESS':
            return { ...state, progress: action.payload };
        case 'UPDATE_STEP':
            return {
                ...state,
                steps: state.steps.map(step =>
                    step.id === action.payload.id ? { ...step, status: action.payload.status } : step
                ),
            };
        case 'RESET_STEPS':
            return { ...state, steps: INITIAL_STEPS.map(s => ({ ...s })) };
        case 'SET_RETRY_STEP':
            return { ...state, retryStep: action.payload };
        case 'SET_VERIFIED_STORAGE_FEE':
            return { ...state, verifiedStorageFee: action.payload };
        case 'SET_ESTIMATED_STORAGE_FEE':
            return { ...state, estimatedStorageFee: action.payload };
        case 'SET_PAY_AMOUNT':
            return { ...state, payAmount: action.payload };
        case 'SET_STORAGE_ORDER_STATUS':
            return { ...state, storageOrderStatus: action.payload };
        case 'SET_PUBLISHED_CID':
            return { ...state, publishedCid: action.payload };
        case 'RESET':
            return initialUploadState;
        default:
            return state;
    }
}

const STRICT_SEGMENTED_DELIVERY = true;

interface UploadParams {
    file: File;
    thumbnail: Blob | null;
    posterThumbnail: Blob | null;
    title: string;
    description: string;
    price: string;
    priceUsdNum: number;
    accessMode: 'paid' | 'free_collectible';
    contentType: string;
    estimatedStorageFee: string;
}

export function useUpload() {
    const { accountId, getWallet } = useWallet();
    const queryClient = useQueryClient();
    const [state, dispatch] = useReducer(uploadReducer, initialUploadState);
    const uploadStepsRef = useRef(state.steps);

    uploadStepsRef.current = state.steps;

    const updateStep = useCallback((stepId: string, stepStatus: StepStatus) => {
        dispatch({ type: 'UPDATE_STEP', payload: { id: stepId, status: stepStatus } });
    }, []);

    const setStatus = useCallback((msg: string) => dispatch({ type: 'SET_STATUS', payload: msg }), []);
    const setUploading = useCallback((val: boolean) => dispatch({ type: 'SET_UPLOADING', payload: val }), []);

    const getErrorText = useCallback((error: unknown): string => {
        if (error instanceof Error) return error.message;
        if (typeof error === 'string') return error;
        try { return JSON.stringify(error); } catch { return String(error); }
    }, []);

    const toBlobPart = useCallback((bytes: Uint8Array): ArrayBuffer => {
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    }, []);

    const runWithConcurrency = useCallback(async <T, R>(
        values: T[],
        limit: number,
        handler: (value: T, index: number) => Promise<R>,
    ): Promise<R[]> => {
        const results: R[] = new Array(values.length);
        let nextIndex = 0;
        const workers = Array.from({ length: Math.max(1, Math.min(limit, values.length || 1)) }, async () => {
            while (nextIndex < values.length) {
                const current = nextIndex;
                nextIndex += 1;
                results[current] = await handler(values[current], current);
            }
        });
        await Promise.all(workers);
        return results;
    }, []);

    const uploadSegmentedDeliveryAsset = useCallback(async (params: {
        packagedAsset: PackagedDeliveryAsset;
        accountId: string;
        authSigner: SignlessUploadManager;
        encrypted: boolean;
        aesKeyB64?: string;
        thumbnailBlob?: Blob | null;
        posterBlob?: Blob | null;
        collector: CidCollector;
    }): Promise<{ manifestCid: string; thumbnailRef: string | null }> => {
        const {
            packagedAsset,
            accountId: uploaderAccountId,
            authSigner,
            encrypted,
            aesKeyB64,
            thumbnailBlob,
            posterBlob,
            collector,
        } = params;
        const {
            combinePackagedSegmentPayloads,
            createDeliverySegment,
            fetchDeliveryManifest,
            isDeliveryManifestV2,
            toDeliveryManifestV2,
            warmupGatewayCids,
            DELIVERY_UPLOAD_CONCURRENCY,
        } = await import('@/lib/video-delivery');

        if (encrypted && !aesKeyB64) {
            throw new Error('Segmented encrypted delivery requires an AES key');
        }
        const encryptionKey = aesKeyB64;

        const files: Array<{ path: string; file: Blob }> = [];
        const thumbnailPath = thumbnailBlob ? 'thumbnail.jpg' : undefined;
        const posterPath = posterBlob ? 'poster.jpg' : undefined;

        if (thumbnailBlob && thumbnailPath) {
            files.push({ path: thumbnailPath, file: thumbnailBlob });
        }

        if (posterBlob && posterPath) {
            files.push({ path: posterPath, file: posterBlob });
        }

        setStatus('Preparing initialization segment...');
        const initBytes = new Uint8Array(packagedAsset.initSegment);
        let initCounterB64: string | undefined;
        let initUploadBlob: Blob;
        const initPath = 'init.mp4';

        if (encrypted) {
            const encryptedInit = await encryptBufferWithCounter(initBytes, encryptionKey as string);
            initCounterB64 = encryptedInit.counterB64;
            initUploadBlob = new Blob([toBlobPart(encryptedInit.ciphertext)], { type: 'application/octet-stream' });
        } else {
            initUploadBlob = new Blob([initBytes], { type: 'video/mp4' });
        }

        files.push({ path: initPath, file: initUploadBlob });

        let preparedSegmentCount = 0;
        const preparedSegments = await runWithConcurrency(
            packagedAsset.segments,
            DELIVERY_UPLOAD_CONCURRENCY,
            async (segment) => {
                const payload = combinePackagedSegmentPayloads(segment.payloads);
                const payloadBytes = new Uint8Array(payload.buffer);
                let payloadCounterB64: string | undefined;
                let payloadBlob: Blob;

                if (encrypted) {
                    const encryptedPayload = await encryptBufferWithCounter(payloadBytes, encryptionKey as string);
                    payloadCounterB64 = encryptedPayload.counterB64;
                    payloadBlob = new Blob([toBlobPart(encryptedPayload.ciphertext)], { type: 'application/octet-stream' });
                } else {
                    payloadBlob = new Blob([payloadBytes], { type: 'video/mp4' });
                }

                const segmentPath = `segments/${String(segment.seq).padStart(6, '0')}.m4s`;
                const uploadedPayloads: DeliverySegmentPayload[] = [{
                    cid: segmentPath,
                    trackId: payload.trackId,
                    kind: payload.kind,
                    byteLength: payload.byteLength,
                    startMs: payload.startMs,
                    endMs: payload.endMs,
                    counterB64: payloadCounterB64,
                }];

                preparedSegmentCount += 1;
                const progress = Math.round((preparedSegmentCount / packagedAsset.segments.length) * 100);
                dispatch({ type: 'SET_PROGRESS', payload: progress });
                setStatus(`Preparing delivery segments... ${progress}%`);

                return {
                    file: { path: segmentPath, file: payloadBlob },
                    segment: createDeliverySegment(segment.seq, uploadedPayloads),
                };
            },
        );
        const uploadedSegments = preparedSegments.map((entry) => entry.segment);
        files.push(...preparedSegments.map((entry) => entry.file));

        if (isLighthouseUploadProviderActive()) {
            let completedBytes = 0;
            const uploadedCids: Array<{ cid: string; kind: 'image' | 'segment' }> = [];
            const uploadTotalBytes = [
                thumbnailBlob,
                posterBlob,
                initUploadBlob,
                ...preparedSegments.map((entry) => entry.file.file),
            ].reduce((sum, blob) => sum + (blob?.size ?? 0), 0);

            const uploadOne = async (
                path: string,
                blob: Blob,
                type: 'thumbnail' | 'poster' | 'init-segment' | 'media-segment' | 'manifest',
            ) => {
                const result = await uploadFileWithStorageApi(path, blob, uploaderAccountId, authSigner);
                completedBytes += blob.size;
                const progress = uploadTotalBytes > 0
                    ? Math.min(99, Math.round((completedBytes / uploadTotalBytes) * 100))
                    : 0;
                dispatch({ type: 'SET_PROGRESS', payload: progress });
                setStatus(`Uploading to Lighthouse... ${progress}%`);
                collector.add(result.cid, result.size, type);
                if (type !== 'manifest') {
                    uploadedCids.push({ cid: result.cid, kind: type === 'thumbnail' || type === 'poster' ? 'image' : 'segment' });
                }
                return result;
            };

            const uploadChunked = async (
                path: string,
                blob: Blob,
                type: 'init-segment' | 'media-segment',
            ) => {
                if (blob.size <= LIGHTHOUSE_PAYLOAD_CHUNK_BYTES) {
                    const result = await uploadOne(path, blob, type);
                    return {
                        cid: result.cid,
                        chunks: undefined,
                    };
                }

                const parts = [];
                for (let offset = 0, index = 0; offset < blob.size; offset += LIGHTHOUSE_PAYLOAD_CHUNK_BYTES, index += 1) {
                    const end = Math.min(offset + LIGHTHOUSE_PAYLOAD_CHUNK_BYTES, blob.size);
                    parts.push({
                        index,
                        blob: blob.slice(offset, end),
                        path: `${path}.part${String(index).padStart(5, '0')}`,
                    });
                }

                const uploadedParts = await runWithConcurrency(
                    parts,
                    DELIVERY_UPLOAD_CONCURRENCY,
                    async (part) => {
                        const result = await uploadOne(part.path, part.blob, type);
                        return {
                            cid: result.cid,
                            byteLength: part.blob.size,
                        };
                    },
                );

                return {
                    cid: uploadedParts[0]?.cid ?? '',
                    chunks: uploadedParts,
                };
            };

            setStatus('Uploading encrypted delivery assets to Lighthouse...');
            const thumbnailCid = thumbnailBlob && thumbnailPath
                ? (await uploadOne(thumbnailPath, thumbnailBlob, 'thumbnail')).cid
                : null;
            const posterCid = posterBlob && posterPath
                ? (await uploadOne(posterPath, posterBlob, 'poster')).cid
                : null;
            const initUpload = await uploadChunked(initPath, initUploadBlob, 'init-segment');
            const lighthouseSegments = await runWithConcurrency(
                preparedSegments,
                DELIVERY_UPLOAD_CONCURRENCY,
                async (entry) => {
                    const result = await uploadChunked(entry.file.path, entry.file.file, 'media-segment');
                    return {
                        ...entry.segment,
                        payloads: entry.segment.payloads.map((payload) => ({
                            ...payload,
                            cid: result.cid,
                            chunks: result.chunks,
                        })),
                    };
                },
            );

            setStatus('Uploading Lighthouse delivery manifest...');
            const manifest = toDeliveryManifestV2(
                packagedAsset,
                initUpload.cid,
                packagedAsset.tracks,
                lighthouseSegments,
                {
                    encrypted,
                    posterCid: posterCid ?? undefined,
                    initSegmentCounterB64: initCounterB64,
                    initSegmentChunks: initUpload.chunks,
                },
            );
            if (!isDeliveryManifestV2(manifest)) {
                throw new Error('Delivery manifest is invalid. Upload was stopped before publishing.');
            }

            const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
            const manifestUpload = await uploadOne('manifest.json', manifestBlob, 'manifest');
            const manifestCid = manifestUpload.cid;
            setStatus('Verifying Lighthouse delivery manifest...');
            const uploadedManifest = await fetchDeliveryManifest(manifestCid, { timeout: 15_000 });
            if (!isDeliveryManifestV2(uploadedManifest)) {
                throw new Error('Delivery manifest could not be verified after Lighthouse upload. Upload was stopped before publishing.');
            }

            void warmupGatewayCids(uploadedCids.slice(0, 8));
            return {
                manifestCid,
                thumbnailRef: thumbnailCid ? `ipfs://${thumbnailCid}` : null,
            };
        }

        setStatus('Uploading delivery manifest...');
        const manifest = toDeliveryManifestV2(
            packagedAsset,
            initPath,
            packagedAsset.tracks,
            uploadedSegments,
            {
                encrypted,
                posterCid: posterPath,
                initSegmentCounterB64: initCounterB64,
            },
        );

        const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
        const manifestPath = 'manifest.json';
        files.push({ path: manifestPath, file: manifestBlob });

        setStatus('Uploading delivery bundle...');
        const directoryUpload = await uploadDirectoryToStorage(files, uploaderAccountId, {
            authSigner,
            onProgress: (progress) => {
                dispatch({ type: 'SET_PROGRESS', payload: progress.percentage });
                setStatus(`Uploading delivery bundle... ${progress.percentage}%`);
            },
        });
        collector.add(directoryUpload.cid, directoryUpload.size, 'delivery-root');
        if (isLighthousePersistencePilotEnabled()) {
            void pinCidWithStorageApi({
                cid: directoryUpload.cid,
                fileName: 'delivery-root',
                accountId: uploaderAccountId,
                authSigner,
            }).then(async (result) => {
                if (result.status === 'pinned') {
                    console.log('[Storage API] Lighthouse persistence pilot pinned delivery root', {
                        cid: result.cid,
                        provider: result.provider,
                    });
                    const status = await getCidPinStatusFromStorageApi(result.cid);
                    if (status.status === 'found') {
                        console.log('[Storage API] Lighthouse persistence pilot verified delivery root', {
                            cid: status.cid,
                            provider: status.provider,
                            fileName: status.fileName,
                            fileSizeInBytes: status.fileSizeInBytes,
                            checkedAt: status.checkedAt,
                        });
                    } else if (status.status === 'missing') {
                        console.warn('[Storage API] Lighthouse persistence pilot status missing after pin', {
                            cid: status.cid,
                            provider: status.provider,
                            checkedAt: status.checkedAt,
                        });
                    } else if (status.status === 'failed') {
                        console.warn('[Storage API] Lighthouse persistence pilot status check failed (non-blocking)', {
                            cid: status.cid,
                            reason: status.reason,
                            httpStatus: status.httpStatus,
                        });
                    }
                } else if (result.status === 'failed') {
                    console.warn('[Storage API] Lighthouse persistence pilot failed (non-blocking)', {
                        cid: result.cid,
                        reason: result.reason,
                        httpStatus: result.httpStatus,
                    });
                }
            });
        }
        const manifestCid = `${directoryUpload.cid}/${manifestPath}`;
        setStatus('Verifying delivery manifest...');
        const uploadedManifest = await fetchDeliveryManifest(manifestCid, { timeout: 15_000 });
        if (!isDeliveryManifestV2(uploadedManifest)) {
            throw new Error('Delivery manifest could not be verified after upload. Upload was stopped before publishing.');
        }

        const thumbnailRef = thumbnailPath ? `ipfs://${directoryUpload.cid}/${thumbnailPath}` : null;

        const warmupItems = [
            thumbnailPath ? { cid: `${directoryUpload.cid}/${thumbnailPath}`, kind: 'image' as const } : null,
            posterPath ? { cid: `${directoryUpload.cid}/${posterPath}`, kind: 'image' as const } : null,
            { cid: `${directoryUpload.cid}/${initPath}`, kind: 'segment' as const },
            ...(uploadedSegments[0]?.payloads.map((payload) => ({ cid: `${directoryUpload.cid}/${payload.cid}`, kind: 'segment' as const })) ?? []),
        ].filter(Boolean) as Array<{ cid: string; kind: 'image' | 'segment' }>;

        void warmupGatewayCids(warmupItems);

        return { manifestCid, thumbnailRef };
    }, [dispatch, runWithConcurrency, setStatus, toBlobPart]);

    const authorizeUpload = useCallback(async (
        wallet: Awaited<ReturnType<typeof getWallet>>,
    ): Promise<{ sessionManager: SignlessUploadManager; cleanup: () => void }> => {
        const sessionManager = new UploadSessionManager(accountId!);
        setStatus('Authorizing upload session...');
        await sessionManager.createSession(wallet);
        return {
            sessionManager,
            cleanup: () => sessionManager.clearSession(),
        };
    }, [accountId, setStatus]);

    const processSignatureAndUpload = useCallback(async (
        params: UploadParams,
        wallet: Awaited<ReturnType<typeof getWallet>>,
        sessionManager: SignlessUploadManager,
    ): Promise<void> => {
        const { file, thumbnail, posterThumbnail, title, description, price, priceUsdNum, accessMode } = params;

        if (!file || !accountId) {
            throw new Error('Missing file, accountId, or selector for upload process.');
        }

        try {
            const collector = new CidCollector();
            console.log('[DECENTRALIZATION_METRIC] upload_process_start', { accountId, storage: 'kms_aes_ctr_encryption' });

            let thumbnailUrl: string | null = null;
            updateStep('thumbnail', 'complete');

            const {
                buildSegmentedEventTitle,
                packageVideoForDelivery,
                shouldUseSegmentedDelivery,
            } = await import('@/lib/video-delivery');
            const canUseSegmentedDelivery = shouldUseSegmentedDelivery(file.type);
            if (!canUseSegmentedDelivery) {
                throw new Error('Only MP4 and MOV uploads are supported in the new playback flow.');
            }

            let packagedDeliveryAsset: PackagedDeliveryAsset | null = null;
            setStatus('Packaging video for segmented playback...');
            try {
                packagedDeliveryAsset = await packageVideoForDelivery(file);
            } catch (packagingError) {
                console.error('[useUpload] Segmented packaging failed for supported video type:', {
                    fileName: file.name, fileType: file.type, fileSize: file.size, error: packagingError,
                });
                if (STRICT_SEGMENTED_DELIVERY) {
                    throw new Error(`Segmented delivery packaging failed for ${file.type}. Upload was stopped.`);
                }
            }

            if (!packagedDeliveryAsset) {
                throw new Error(`Segmented delivery packaging did not produce an asset for ${file.type}. Upload was stopped.`);
            }

            const videoUuid = crypto.randomUUID();
            const detectedDurationSeconds = Math.max(1, Math.round(packagedDeliveryAsset.durationMs / 1000));

            updateStep('encrypt', 'loading');
            setStatus('Generating encryption key...');
            const aesKeyB64 = await generateAESKey();
            updateStep('encrypt', 'complete');

            updateStep('upload', 'loading');
            setStatus('Uploading encrypted delivery segments...');
            const deliveryUpload = await uploadSegmentedDeliveryAsset({
                packagedAsset: packagedDeliveryAsset,
                accountId,
                authSigner: sessionManager,
                encrypted: true,
                aesKeyB64,
                thumbnailBlob: thumbnail,
                posterBlob: posterThumbnail,
                collector,
            });
            const manifestCid = deliveryUpload.manifestCid;
            thumbnailUrl = deliveryUpload.thumbnailRef;
            updateStep('upload', 'complete');

            updateStep('kms', 'loading');
            setStatus('Storing encryption key on KMS...');
            await storeEncryptionKey(videoUuid, aesKeyB64, accountId, wallet);
            setStatus('Verifying encryption key on KMS...');
            const verifiedAesKeyB64 = await retrieveEncryptionKey(videoUuid, accountId, wallet, {
                authMode: 'upload-session',
            });
            if (verifiedAesKeyB64 !== aesKeyB64) {
                throw new Error('KMS verification failed. Upload was stopped before publishing.');
            }
            updateStep('kms', 'complete');

            updateStep('mint', 'loading');
            setStatus('Minting NFT ticket on NEAR...');
            try {
                const eventTitle = buildSegmentedEventTitle(
                    thumbnailUrl || undefined,
                    manifestCid,
                    title || file.name,
                );
                const mediaUrl = thumbnailUrl || '';
                const priceYocto = nearAmountToYocto(price || '0').toString();
                const priceUsdCents = priceUsdNum > 0 ? Math.round(priceUsdNum * 100) : null;
                const priceUsdcUnits = priceUsdNum > 0 ? Math.round(priceUsdNum * 1_000_000).toString() : null;

                const videoMetadata = {
                    receiver_id: accountId,
                    token_metadata: {
                        title: eventTitle,
                        description: description || 'Uploaded via Youtick',
                        media: mediaUrl,
                        copies: 1,
                    },
                    video_metadata: {
                        encrypted_cid: videoUuid,
                        duration_seconds: detectedDurationSeconds,
                        content_type: params.contentType,
                        storage_type: 'Kms' as const,
                    },
                };

                const eventMetadata = {
                    encrypted_cid: videoUuid,
                    title: eventTitle,
                    description: description || 'No description provided',
                    price: priceYocto.toString(),
                    price_usd: priceUsdCents,
                    price_usdc: priceUsdcUnits,
                    access_mode: accessMode,
                    content_type: params.contentType,
                };

                setStatus('Minting NFT ticket & publishing event...');
                await batchUploadActionsSignless(sessionManager, videoMetadata, eventMetadata);
                dispatch({ type: 'SET_PUBLISHED_CID', payload: videoUuid });
                void queryClient.invalidateQueries({ queryKey: ['createdEvents', accountId] });
                void queryClient.invalidateQueries({ queryKey: ['allVideos'] });
                void queryClient.invalidateQueries({ queryKey: ['event', videoUuid] });
                updateStep('mint', 'complete');
            } catch (mintError: unknown) {
                console.error('Minting/Event failed:', mintError);
                const mintErrorMessage = mintError instanceof Error ? mintError.message : String(mintError);
                updateStep('mint', 'error');
                setStatus(`Video uploaded but blockchain actions failed: ${mintErrorMessage}`);
                throw new Error(`Blockchain actions failed: ${mintErrorMessage}`);
            }

            const collectedAssets = collector.getAll();
            let storagePersistenceStatus: 'success' | 'partial' | 'failed' = 'success';
            if (collectedAssets.length > 0) {
                updateStep('storage', 'loading');
                setStatus('Checking persistent storage status...');
                try {
                    const { placeStorageOrders, verifyStorageOrders } = await import('@/lib/storage/provider');
                    const batchResult = await placeStorageOrders(collectedAssets, accountId);

                    if (batchResult.succeeded === 0) {
                        updateStep('storage', 'error');
                        dispatch({ type: 'SET_STORAGE_ORDER_STATUS', payload: 'failed' });
                        storagePersistenceStatus = 'failed';
                        setStatus('Storage persistence failed — video is accessible but long-term persistence is not guaranteed.');
                    } else if (batchResult.failed > 0) {
                        updateStep('storage', 'complete');
                        dispatch({ type: 'SET_STORAGE_ORDER_STATUS', payload: 'partial' });
                        storagePersistenceStatus = 'partial';
                        setStatus(`Storage persistence: ${batchResult.succeeded}/${batchResult.total} assets tracked.`);
                    } else {
                        updateStep('storage', 'complete');
                        dispatch({ type: 'SET_STORAGE_ORDER_STATUS', payload: 'success' });
                    }

                    const verifiable = batchResult.results.filter((r) => r.status !== 'failed' && r.status !== 'rate_limited');
                    if (verifiable.length > 0) {
                        updateStep('verify', 'loading');
                        setStatus('Verifying storage status...');
                        const verifyResult = await verifyStorageOrders(verifiable, accountId);
                        if (verifyResult.verified === verifiable.length) {
                            updateStep('verify', 'complete');
                        } else if (verifyResult.verified > 0 || verifyResult.pending > 0) {
                            updateStep('verify', 'complete');
                            if (storagePersistenceStatus === 'success') {
                                storagePersistenceStatus = 'partial';
                            }
                            setStatus('Storage is being processed — your video is safe.');
                        } else {
                            updateStep('verify', 'error');
                            storagePersistenceStatus = 'failed';
                            setStatus('Storage verification failed — video is accessible but long-term persistence is not guaranteed.');
                        }
                    } else {
                        updateStep('verify', 'complete');
                    }
                } catch (storageError) {
                    console.error('[Storage Order] Batch failed:', storageError);
                    updateStep('storage', 'error');
                    updateStep('verify', 'complete');
                    dispatch({ type: 'SET_STORAGE_ORDER_STATUS', payload: 'failed' });
                    storagePersistenceStatus = 'failed';
                    setStatus('Storage persistence failed — video is accessible but long-term persistence is not guaranteed.');
                }
            } else {
                updateStep('storage', 'complete');
                updateStep('verify', 'complete');
            }

            if (storagePersistenceStatus === 'failed') {
                setStatus('Video published, but storage verification failed — long-term persistence is not guaranteed.');
            } else if (storagePersistenceStatus === 'partial') {
                setStatus('Video published; storage is still being verified.');
            } else {
                setStatus('Success! Video uploaded & ticket sales started!');
            }
            setUploading(false);
        } catch (error: unknown) {
            console.error('Upload failed:', error);
            const currentStep = uploadStepsRef.current.find(s => s.status === 'loading');
            if (currentStep) {
                updateStep(currentStep.id, 'error');
            }
            setStatus(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
            setUploading(false);
            throw error;
        }
    }, [accountId, dispatch, queryClient, setStatus, setUploading, updateStep, uploadSegmentedDeliveryAsset]);

    const handleUpload = useCallback(async (params: UploadParams): Promise<boolean> => {
        if (!params.file || !accountId) return false;

        setUploading(true);
        setStatus('Checking wallet & balance...');
        dispatch({ type: 'SET_PUBLISHED_CID', payload: null });
        dispatch({ type: 'RESET_STEPS' });
        let cleanup: () => void = () => {};

        try {
            const wallet = await getWallet();
            const storageFee = params.estimatedStorageFee;
            dispatch({ type: 'SET_VERIFIED_STORAGE_FEE', payload: storageFee });

            updateStep('session', 'loading');
            const authorization = await authorizeUpload(wallet);
            cleanup = authorization.cleanup;

            setStatus('Wallet ready');
            updateStep('session', 'complete');

            await processSignatureAndUpload(params, wallet, authorization.sessionManager);
            return true;
        } catch (error: unknown) {
            console.error('Upload failed:', error);
            const msg = error ? getErrorText(error) : 'Transaction cancelled or wallet returned no result.';
            setStatus(`Upload failed: ${msg}`);
            setUploading(false);
            return false;
        } finally {
            cleanup();
        }
    }, [accountId, authorizeUpload, getErrorText, getWallet, processSignatureAndUpload, setStatus, setUploading, updateStep]);

    const handleRetrySign = useCallback(async (params: UploadParams): Promise<boolean> => {
        let cleanup: () => void = () => {};
        try {
            dispatch({ type: 'SET_RETRY_STEP', payload: 'none' });
            setStatus('Retrying upload...');
            const wallet = await getWallet();
            const authorization = await authorizeUpload(wallet);
            cleanup = authorization.cleanup;
            await processSignatureAndUpload(params, wallet, authorization.sessionManager);
            return true;
        } catch (error: unknown) {
            console.error('Retry failed:', error);
            setStatus(`Retry failed: ${getErrorText(error)}`);
            return false;
        } finally {
            cleanup();
        }
    }, [authorizeUpload, getErrorText, getWallet, processSignatureAndUpload, setStatus]);

    return {
        state,
        dispatch,
        handleUpload,
        handleRetrySign,
    };
}
