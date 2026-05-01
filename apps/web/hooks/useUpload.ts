'use client';

import { useReducer, useRef, useCallback } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { uploadToCrust } from '@/lib/crust';
import { CidCollector } from '@/lib/crust/cid-collector';
import {
    encryptBufferWithCounter,
    generateAESKey,
} from '@/lib/kms/encryption';
import { storeEncryptionKey } from '@/lib/kms/client';
import { UploadSessionManager } from '@/lib/upload-session-manager';
import {
    batchUploadActionsSignless,
    type SignlessUploadManager,
} from '@/lib/batch-transactions';
import { nearAmountToYocto } from '@/lib/near-amount';
import type { DeliverySegmentPayload } from '@/lib/types';
import type { PackagedDeliveryAsset } from '@/lib/video-delivery';

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

    const extractIpfsCid = useCallback((ref: string | null | undefined): string | null => {
        if (!ref) return null;
        if (ref.startsWith('ipfs://')) return ref.slice('ipfs://'.length);
        const match = ref.match(/\/ipfs\/([^/?#]+)/);
        return match?.[1] ?? null;
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
        encrypted: boolean;
        aesKeyB64?: string;
        thumbnailRef?: string | null;
        posterBlob?: Blob | null;
        collector: CidCollector;
    }): Promise<{ manifestCid: string }> => {
        const {
            packagedAsset,
            accountId: uploaderAccountId,
            encrypted,
            aesKeyB64,
            thumbnailRef,
            posterBlob,
            collector,
        } = params;
        const {
            combinePackagedSegmentPayloads,
            createDeliverySegment,
            toDeliveryManifestV2,
            warmupGatewayCids,
            DELIVERY_UPLOAD_CONCURRENCY,
        } = await import('@/lib/video-delivery');

        if (encrypted && !aesKeyB64) {
            throw new Error('Segmented encrypted delivery requires an AES key');
        }
        const encryptionKey = aesKeyB64;

        let posterCid: string | undefined;
        if (posterBlob) {
            try {
                setStatus('Uploading poster image...');
                const posterResult = await uploadToCrust(posterBlob, uploaderAccountId);
                posterCid = posterResult.cid;
                collector.add(posterResult.cid, posterResult.size, 'poster');
            } catch (posterError) {
                console.warn('[useUpload] Poster upload failed, continuing without poster:', posterError);
            }
        }

        setStatus('Uploading initialization segment...');
        const initBytes = new Uint8Array(packagedAsset.initSegment);
        let initCounterB64: string | undefined;
        let initUploadBlob: Blob;

        if (encrypted) {
            const encryptedInit = await encryptBufferWithCounter(initBytes, encryptionKey as string);
            initCounterB64 = encryptedInit.counterB64;
            initUploadBlob = new Blob([toBlobPart(encryptedInit.ciphertext)], { type: 'application/octet-stream' });
        } else {
            initUploadBlob = new Blob([initBytes], { type: 'video/mp4' });
        }

        const initUpload = await uploadToCrust(initUploadBlob, uploaderAccountId);
        collector.add(initUpload.cid, initUpload.size, 'init-segment');

        let uploadedSegmentCount = 0;
        const uploadedSegments = await runWithConcurrency(
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

                const uploadResult = await uploadToCrust(payloadBlob, uploaderAccountId);
                collector.add(uploadResult.cid, uploadResult.size, 'media-segment');
                const uploadedPayloads: DeliverySegmentPayload[] = [{
                    cid: uploadResult.cid,
                    trackId: payload.trackId,
                    kind: payload.kind,
                    byteLength: payload.byteLength,
                    startMs: payload.startMs,
                    endMs: payload.endMs,
                    counterB64: payloadCounterB64,
                }];

                uploadedSegmentCount += 1;
                const progress = Math.round((uploadedSegmentCount / packagedAsset.segments.length) * 100);
                dispatch({ type: 'SET_PROGRESS', payload: progress });
                setStatus(`Uploading delivery segments... ${progress}%`);

                return createDeliverySegment(segment.seq, uploadedPayloads);
            },
        );

        setStatus('Uploading delivery manifest...');
        const manifest = toDeliveryManifestV2(
            packagedAsset,
            initUpload.cid,
            packagedAsset.tracks,
            uploadedSegments,
            {
                encrypted,
                posterCid,
                initSegmentCounterB64: initCounterB64,
            },
        );

        const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
        const manifestResult = await uploadToCrust(manifestBlob, uploaderAccountId);
        collector.add(manifestResult.cid, manifestResult.size, 'manifest');

        const warmupItems = [
            extractIpfsCid(thumbnailRef) ? { cid: extractIpfsCid(thumbnailRef)!, kind: 'image' as const } : null,
            posterCid ? { cid: posterCid, kind: 'image' as const } : null,
            { cid: initUpload.cid, kind: 'segment' as const },
            ...(uploadedSegments[0]?.payloads.map((payload) => ({ cid: payload.cid, kind: 'segment' as const })) ?? []),
        ].filter(Boolean) as Array<{ cid: string; kind: 'image' | 'segment' }>;

        void warmupGatewayCids(warmupItems);

        return { manifestCid: manifestResult.cid };
    }, [dispatch, extractIpfsCid, runWithConcurrency, setStatus, toBlobPart]);

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
            if (thumbnail) {
                updateStep('thumbnail', 'loading');
                setStatus('Uploading cover image...');
                try {
                    const thumbResult = await uploadToCrust(thumbnail, accountId);
                    thumbnailUrl = `ipfs://${thumbResult.cid}`;
                    collector.add(thumbResult.cid, thumbResult.size, 'thumbnail');
                    updateStep('thumbnail', 'complete');
                } catch (thumbError) {
                    console.error('[Thumbnail] Upload failed:', thumbError);
                    updateStep('thumbnail', 'complete');
                }
            } else {
                updateStep('thumbnail', 'complete');
            }

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
                encrypted: true,
                aesKeyB64,
                thumbnailRef: thumbnailUrl,
                posterBlob: posterThumbnail,
                collector,
            });
            const manifestCid = deliveryUpload.manifestCid;
            updateStep('upload', 'complete');

            updateStep('kms', 'loading');
            setStatus('Storing encryption key on KMS...');
            await storeEncryptionKey(videoUuid, aesKeyB64, accountId, wallet);
            updateStep('kms', 'complete');

            let blockchainPublishSucceeded = false;
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
                blockchainPublishSucceeded = true;
                dispatch({ type: 'SET_PUBLISHED_CID', payload: videoUuid });
                updateStep('mint', 'complete');
            } catch (mintError: unknown) {
                console.error('Minting/Event failed:', mintError);
                updateStep('mint', 'error');
                setStatus(`Video uploaded but blockchain actions failed: ${mintError instanceof Error ? mintError.message : String(mintError)}`);
            }

            if (!blockchainPublishSucceeded) {
                setUploading(false);
                return;
            }

            const collectedAssets = collector.getAll();
            if (collectedAssets.length > 0) {
                updateStep('storage', 'loading');
                setStatus('Placing persistent storage orders...');
                try {
                    const { placeStorageOrders, verifyStorageOrders } = await import('@/lib/crust/storage-order');
                    const batchResult = await placeStorageOrders(collectedAssets, accountId);

                    if (batchResult.succeeded === 0) {
                        updateStep('storage', 'error');
                        dispatch({ type: 'SET_STORAGE_ORDER_STATUS', payload: 'failed' });
                        setStatus('Storage orders failed — video is accessible but long-term persistence is not guaranteed.');
                    } else if (batchResult.failed > 0) {
                        updateStep('storage', 'complete');
                        dispatch({ type: 'SET_STORAGE_ORDER_STATUS', payload: 'partial' });
                        setStatus(`Storage orders: ${batchResult.succeeded}/${batchResult.total} placed.`);
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
                            setStatus('Storage is being processed — your video is safe.');
                        } else {
                            updateStep('verify', 'error');
                        }
                    } else {
                        updateStep('verify', 'complete');
                    }
                } catch (storageError) {
                    console.error('[Storage Order] Batch failed:', storageError);
                    updateStep('storage', 'error');
                    updateStep('verify', 'complete');
                    dispatch({ type: 'SET_STORAGE_ORDER_STATUS', payload: 'failed' });
                    setStatus('Storage order failed — video is accessible but long-term persistence is not guaranteed.');
                }
            } else {
                updateStep('storage', 'complete');
                updateStep('verify', 'complete');
            }

            setStatus('Success! Video uploaded & ticket sales started!');
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
    }, [accountId, dispatch, setStatus, setUploading, updateStep, uploadSegmentedDeliveryAsset]);

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
