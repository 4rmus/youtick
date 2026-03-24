'use client';

import React, { useState, useReducer } from 'react';
import Image from 'next/image';
import { useWallet } from '@/components/providers/WalletProvider';
import { uploadToCrust } from '@/lib/crust';
import { CidCollector } from '@/lib/crust/cid-collector';
import type { UploadedAssetType } from '@/lib/crust/cid-collector';
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
import {
    generateVideoThumbnail,
    generateVideoThumbnailVariant,
    POSTER_THUMBNAIL_HEIGHT,
    POSTER_THUMBNAIL_QUALITY,
    POSTER_THUMBNAIL_WIDTH,
} from '@/lib/video-utils';
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Loader2, Upload, AlertCircle, CheckCircle2 } from "lucide-react"
import { CostReceipt } from './CostReceipt';
import { useLanguage } from '@/components/providers/LanguageContext';
import { NEAR_CONFIG } from '@/lib/constants';
import { nearAmountToYocto } from '@/lib/near-amount';
import { getNearPrice, usdToNear } from '@/lib/price';
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

// File size limits (KMS-based flow)
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB for paid
const MAX_FREE_FILE_SIZE = 100 * 1024 * 1024; // 100MB for free
const STRICT_SEGMENTED_DELIVERY = true;

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
        case 'RESET':
            return initialUploadState;
        default:
            return state;
    }
}

export function UploadForm() {
    const { t } = useLanguage();
    const { accountId, getWallet } = useWallet();

    // Form fields
    const [file, setFile] = useState<File | null>(null);
    const [thumbnail, setThumbnail] = useState<Blob | null>(null);
    const [posterThumbnail, setPosterThumbnail] = useState<Blob | null>(null);
    const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priceUsd, setPriceUsd] = useState(''); // USD amount (e.g. "5.00"), empty = free
    const [nearPrice, setNearPrice] = useState<number>(0); // NEAR/USD rate
    const [fileSizeError, setFileSizeError] = useState<string | null>(null);
    const [publicFreeEnabled, setPublicFreeEnabled] = useState(true);

    // Derived NEAR price from USD input
    const priceUsdNum = parseFloat(priceUsd) || 0;
    const priceNearDerived = nearPrice > 0 ? usdToNear(priceUsdNum, nearPrice) : 0;
    // Keep 'price' as NEAR string for backward compat with CostReceipt etc.
    const price = priceUsdNum > 0 ? priceNearDerived.toFixed(6) : '0';
    const accessMode: 'paid' | 'free_collectible' | 'public_free' = priceUsdNum > 0
        ? 'paid'
        : (publicFreeEnabled ? 'public_free' : 'free_collectible');

    // Fetch NEAR/USD price on mount
    React.useEffect(() => {
        getNearPrice().then(setNearPrice);
    }, []);

    // Dynamic file size validation — re-checks when file or price changes
    React.useEffect(() => {
        if (!file) {
            setFileSizeError(null);
            return;
        }
        const isFree = priceUsdNum === 0;
        const limit = isFree ? MAX_FREE_FILE_SIZE : MAX_FILE_SIZE;
        if (file.size > limit) {
            setFileSizeError(isFree ? t.upload_page.file_too_large_free : t.upload_page.file_too_large_paid);
        } else {
            setFileSizeError(null);
        }
    }, [file, priceUsdNum, t]);

    // Upload state (consolidated)
    const [us, dispatch] = useReducer(uploadReducer, initialUploadState);

    // Convenience aliases for template readability
    const uploading = us.uploading;
    const status = us.status;
    const uploadSteps = us.steps;
    const retryStep = us.retryStep;
    const estimatedStorageFee = us.estimatedStorageFee;
    const payAmount = us.payAmount;
    const verifiedStorageFee = us.verifiedStorageFee;
    const uploadStepsRef = React.useRef(uploadSteps);

    React.useEffect(() => {
        uploadStepsRef.current = uploadSteps;
    }, [uploadSteps]);

    // Helper functions that dispatch to reducer
    const updateStep = (stepId: string, stepStatus: StepStatus) => {
        dispatch({ type: 'UPDATE_STEP', payload: { id: stepId, status: stepStatus } });
    };
    const setStatus = (msg: string) => dispatch({ type: 'SET_STATUS', payload: msg });
    const setUploading = (val: boolean) => dispatch({ type: 'SET_UPLOADING', payload: val });

    const getErrorText = (error: unknown): string => {
        if (error instanceof Error) {
            return error.message;
        }

        if (typeof error === 'string') {
            return error;
        }

        try {
            return JSON.stringify(error);
        } catch {
            return String(error);
        }
    };

    const extractIpfsCid = (ref: string | null | undefined): string | null => {
        if (!ref) {
            return null;
        }

        if (ref.startsWith('ipfs://')) {
            return ref.slice('ipfs://'.length);
        }

        const match = ref.match(/\/ipfs\/([^/?#]+)/);
        return match?.[1] ?? null;
    };

    const toBlobPart = (bytes: Uint8Array): ArrayBuffer => {
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    };

    const runWithConcurrency = async <T, R>(
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
    };

    const uploadSegmentedDeliveryAsset = async (params: {
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

        let posterCid: string | undefined;
        if (posterBlob) {
            try {
                setStatus('Uploading poster image...');
                const posterResult = await uploadToCrust(posterBlob, uploaderAccountId);
                posterCid = posterResult.cid;
                collector.add(posterResult.cid, posterResult.size, 'poster');
            } catch (posterError) {
                console.warn('[UploadForm] Poster upload failed, continuing without poster:', posterError);
            }
        }

        setStatus('Uploading initialization segment...');
        const initBytes = new Uint8Array(packagedAsset.initSegment);
        let initCounterB64: string | undefined;
        let initUploadBlob: Blob;

        if (encrypted) {
            const encryptedInit = await encryptBufferWithCounter(initBytes, aesKeyB64!);
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
                    const encryptedPayload = await encryptBufferWithCounter(payloadBytes, aesKeyB64!);
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
    };

    // Track thumbnail preview for cleanup
    const thumbnailPreviewRef = React.useRef<string | null>(null);
    const fileSelectionVersionRef = React.useRef(0);

    const revokeThumbnailPreview = () => {
        if (thumbnailPreviewRef.current) {
            URL.revokeObjectURL(thumbnailPreviewRef.current);
            thumbnailPreviewRef.current = null;
        }
    };

    const updateThumbnailPreview = (blob: Blob) => {
        revokeThumbnailPreview();
        const previewUrl = URL.createObjectURL(blob);
        thumbnailPreviewRef.current = previewUrl;
        setThumbnailPreview(previewUrl);
    };

    // Cleanup thumbnail preview URL on unmount
    React.useEffect(() => {
        return () => {
            revokeThumbnailPreview();
        };
    }, []);

    // Recalculate pay amount when storage fee changes
    React.useEffect(() => {
        const fee = parseFloat(estimatedStorageFee) || 0;
        // Exact prepaid costs: NFT mint (0.1) + Event (0.1)
        const totalNeeded = fee + 0.20;
        dispatch({ type: 'SET_PAY_AMOUNT', payload: totalNeeded > 0 ? totalNeeded.toFixed(4) : '0' });
    }, [estimatedStorageFee, price]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const selectedFile = e.target.files[0];
            const selectionVersion = fileSelectionVersionRef.current + 1;
            fileSelectionVersionRef.current = selectionVersion;

            setFile(selectedFile);
            setThumbnail(null);
            setPosterThumbnail(null);
            revokeThumbnailPreview();
            setThumbnailPreview(null);

            // Calculate storage fee
            void (async () => {
                try {
                    const { getNearPrice, calculateStorageFee } = await import('@/lib/price');
                    const nearPrice = await getNearPrice();
                    const fee = calculateStorageFee(selectedFile.size, nearPrice);

                    if (fileSelectionVersionRef.current !== selectionVersion) {
                        return;
                    }

                    dispatch({ type: 'SET_ESTIMATED_STORAGE_FEE', payload: fee });
                } catch (err) {
                    console.error('[UploadForm] Error calculating storage fee:', err);
                }
            })();

            // Generate thumbnail
            if (selectedFile.type.startsWith('video/')) {
                try {
                    setStatus('Generating thumbnail...');

                    const cardThumbBlob = await generateVideoThumbnail(selectedFile);
                    if (fileSelectionVersionRef.current !== selectionVersion) {
                        return;
                    }

                    setThumbnail(cardThumbBlob);
                    updateThumbnailPreview(cardThumbBlob);
                    setStatus('');

                    void generateVideoThumbnailVariant(selectedFile, {
                            maxWidth: POSTER_THUMBNAIL_WIDTH,
                            maxHeight: POSTER_THUMBNAIL_HEIGHT,
                            quality: POSTER_THUMBNAIL_QUALITY,
                        })
                        .then((posterThumbBlob) => {
                            if (fileSelectionVersionRef.current !== selectionVersion) {
                                return;
                            }

                            setPosterThumbnail(posterThumbBlob);
                        })
                        .catch((error) => {
                            if (fileSelectionVersionRef.current !== selectionVersion) {
                                return;
                            }

                            console.warn('Poster thumbnail generation failed:', error);
                        });
                } catch (error) {
                    if (fileSelectionVersionRef.current !== selectionVersion) {
                        return;
                    }

                    console.error('Thumbnail generation failed:', error);
                    setThumbnail(null);
                    setPosterThumbnail(null);
                    setStatus('⚠️ Could not generate thumbnail');
                }
            } else {
                setThumbnail(null);
                setPosterThumbnail(null);
                setStatus('');
            }
        }
    };

    // Main upload function using KMS + Crust
    const processSignatureAndUpload = async (
        storageFee: string,
        wallet: Awaited<ReturnType<typeof getWallet>>,
        sessionManager: SignlessUploadManager,
    ) => {
        if (!file || !accountId) {
            throw new Error("Missing file, accountId, or selector for upload process.");
        }

        try {
            const collector = new CidCollector();

            console.log('[DECENTRALIZATION_METRIC] upload_process_start', {
                accountId,
                storage: 'kms_aes_ctr_encryption'
            });

            // 0. Upload Thumbnail (Public) directly to Crust
            let thumbnailUrl: string | null = null;
            if (thumbnail) {
                updateStep('thumbnail', 'loading');
                setStatus('Uploading cover image...');

                try {
                    const thumbResult = await uploadToCrust(
                        thumbnail,
                        accountId
                    );
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

            const isPublicFreeVideo = accessMode === 'public_free';
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
                console.error('[UploadForm] Segmented packaging failed for supported video type:', {
                    fileName: file.name,
                    fileType: file.type,
                    fileSize: file.size,
                    error: packagingError,
                });

                if (STRICT_SEGMENTED_DELIVERY) {
                    throw new Error(
                        `Segmented delivery packaging failed for ${file.type}. Upload was stopped.`,
                    );
                }
            }

            if (!packagedDeliveryAsset) {
                throw new Error(
                    `Segmented delivery packaging did not produce an asset for ${file.type}. Upload was stopped.`,
                );
            }

            let manifestCid: string;
            const videoUuid = crypto.randomUUID();
            const detectedDurationSeconds = Math.max(1, Math.round(packagedDeliveryAsset.durationMs / 1000));

            if (isPublicFreeVideo) {
                updateStep('encrypt', 'complete');
                updateStep('upload', 'loading');
                updateStep('kms', 'complete');
                const deliveryUpload = await uploadSegmentedDeliveryAsset({
                    packagedAsset: packagedDeliveryAsset,
                    accountId,
                    encrypted: false,
                    thumbnailRef: thumbnailUrl,
                    posterBlob: posterThumbnail,
                    collector,
                });
                manifestCid = deliveryUpload.manifestCid;

                updateStep('upload', 'complete');
            } else {
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
                manifestCid = deliveryUpload.manifestCid;

                updateStep('upload', 'complete');

                updateStep('kms', 'loading');
                setStatus('Storing encryption key on KMS...');

                await storeEncryptionKey(
                    videoUuid,
                    aesKeyB64,
                    accountId,
                    wallet
                );
                updateStep('kms', 'complete');
            }

            // 6. Mint Ticket + Create Event (BATCH - Signless!)
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

                const videoMetadata = {
                    receiver_id: accountId,
                    token_metadata: {
                        title: eventTitle,
                        description: description || 'Uploaded via Youtick',
                        media: mediaUrl,
                        copies: 1
                    },
                    video_metadata: {
                        encrypted_cid: videoUuid,
                        duration_seconds: detectedDurationSeconds,
                        content_type: 'Exclusive',
                        storage_type: 'Kms' as const
                    }
                };

                const priceUsdCents = priceUsdNum > 0 ? Math.round(priceUsdNum * 100) : null;

                const eventMetadata = {
                    encrypted_cid: videoUuid,
                    title: eventTitle,
                    description: description || 'No description provided',
                    price: priceYocto.toString(),
                    price_usd: priceUsdCents,
                    access_mode: accessMode,
                };

                setStatus('Minting NFT ticket & publishing event...');

                await batchUploadActionsSignless(
                    sessionManager,
                    videoMetadata,
                    eventMetadata
                );

                blockchainPublishSucceeded = true;
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

            // Place storage orders for ALL uploaded CIDs (not just manifest)
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

                    // Verify orders that were successfully placed
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

            // Clear form
            setFile(null);
            setTitle('');
            setDescription('');
            setPriceUsd('');
            setPublicFreeEnabled(true);
            setThumbnail(null);
            setPosterThumbnail(null);
            setThumbnailPreview(null);

        } catch (error: unknown) {
            console.error('Upload failed:', error);
            const currentStep = uploadStepsRef.current.find(s => s.status === 'loading');
            if (currentStep) {
                updateStep(currentStep.id, 'error');
            }
            setStatus(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
            setUploading(false);
        }
    };

    const authorizeUpload = async (
        wallet: Awaited<ReturnType<typeof getWallet>>,
    ): Promise<{ sessionManager: SignlessUploadManager; cleanup: () => void }> => {
        const sessionManager = new UploadSessionManager(accountId!);

        setStatus('Authorizing upload session...');
        await sessionManager.createSession(wallet);
        return {
            sessionManager,
            cleanup: () => sessionManager.clearSession(),
        };
    };

    // Retry handler
    const handleRetrySign = async () => {
        let cleanup: () => void = () => {};

        try {
            dispatch({ type: 'SET_RETRY_STEP', payload: 'none' });
            setStatus('Retrying upload...');

            const wallet = await getWallet();
            const authorization = await authorizeUpload(wallet);
            cleanup = authorization.cleanup;
            await processSignatureAndUpload(
                verifiedStorageFee,
                wallet,
                authorization.sessionManager,
            );
        } catch (error: unknown) {
            console.error('Retry failed:', error);
            setStatus(`Retry failed: ${getErrorText(error)}`);
        } finally {
            cleanup();
        }
    };



    const handleUpload = async () => {
        if (!file || !accountId) return;
        if (fileSizeError) return;
        if (!title || !description) {
            setStatus('Please enter a title and description');
            return;
        }

        // Input validation
        if (title.length > 200) {
            setStatus('Title must be 200 characters or less');
            return;
        }
        if (description.length > 2000) {
            setStatus('Description must be 2000 characters or less');
            return;
        }
        if (priceUsdNum < 0) {
            setStatus('Price cannot be negative');
            return;
        }
        if (priceUsdNum > 50000) {
            setStatus('Price cannot exceed $50,000');
            return;
        }

        setUploading(true);
        setStatus('Checking wallet & balance...');
        // Reset all steps to pending
        dispatch({ type: 'RESET_STEPS' });
        let cleanup: () => void = () => {};

        try {
            const wallet = await getWallet();
            const storageFee = estimatedStorageFee;
            dispatch({ type: 'SET_VERIFIED_STORAGE_FEE', payload: storageFee });

            updateStep('session', 'loading');
            const authorization = await authorizeUpload(wallet);
            cleanup = authorization.cleanup;

            setStatus('Wallet ready');
            updateStep('session', 'complete');

            // --- KMS Upload (AES-CTR encryption) ---
            await processSignatureAndUpload(
                storageFee,
                wallet,
                authorization.sessionManager,
            );

        } catch (error: unknown) {
            console.error('Upload failed:', error);
            const msg = error
                ? getErrorText(error)
                : 'Transaction cancelled or wallet returned no result.';
            setStatus(`Upload failed: ${msg}`);
            setUploading(false);
        } finally {
            cleanup();
        }
    };

    return (
        <div className="w-full max-w-7xl mx-auto p-4 space-y-4">
            {/* Header Row: Same grid as content for alignment */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Title - Same width as form (3/5) */}
                <div className="lg:col-span-3">
                    <h1 className="text-2xl font-bold tracking-tight">{t.upload_page.title}</h1>
                    <p className="text-muted-foreground text-sm">{t.upload_page.description}</p>
                </div>
                {/* Verified Badge - Same width as preview (2/5) */}
                <div className="lg:col-span-2 px-4 py-2 rounded-xl border flex items-center gap-3 bg-blue-500/10 border-blue-500/30">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-500/20 border border-blue-500/50">
                        <CheckCircle2 className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-blue-300">Ephemeral Upload Session</p>
                        <p className="text-[10px] text-zinc-500 truncate">
                            Upload authorization is created per upload and stays only in memory.
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Content Grid - Same height columns */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">

                {/* LEFT COLUMN: FORM INPUTS */}
                <Card className="lg:col-span-3 order-2 lg:order-1">
                    <CardHeader>
                        <CardTitle>{t.upload_page.form_title}</CardTitle>
                        <CardDescription>{t.upload_page.form_desc}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {!accountId && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Wallet Not Connected</AlertTitle>
                                <AlertDescription>
                                    Please connect your NEAR wallet to upload videos.
                                </AlertDescription>
                            </Alert>
                        )}



                        <div className="space-y-2">
                            <label htmlFor="video-title" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                {t.upload_page.video_title}
                            </label>
                            <Input
                                id="video-title"
                                type="text"
                                placeholder={t.upload_page.video_title}
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                disabled={uploading || !accountId}
                                maxLength={200}
                                aria-required="true"
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="video-description" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                {t.upload_page.video_desc}
                            </label>
                            <Textarea
                                id="video-description"
                                placeholder={t.upload_page.video_desc}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                disabled={uploading || !accountId}
                                className="min-h-[60px] resize-none"
                                maxLength={2000}
                                aria-required="true"
                            />
                        </div>

                        {/* Price and File in same row */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label htmlFor="ticket-price" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    Price (USD)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">$</span>
                                    <Input
                                        id="ticket-price"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        max="50000"
                                        placeholder="0.00"
                                        value={priceUsd}
                                        onChange={(e) => setPriceUsd(e.target.value)}
                                        disabled={uploading || !accountId}
                                        aria-label="Ticket price in USD"
                                        className="pl-7"
                                    />
                                </div>
                                {priceUsdNum > 0 && nearPrice > 0 && (
                                    <p className="text-[11px] text-zinc-500">
                                        ≈ {priceNearDerived.toFixed(2)} NEAR
                                    </p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="video-file" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    {t.upload_page.file}
                                </label>
                                <Input
                                    id="video-file"
                                    type="file"
                                    accept="video/mp4,video/quicktime,.mp4,.mov"
                                    onChange={handleFileChange}
                                    disabled={uploading || !accountId}
                                    className="cursor-pointer"
                                />
                            </div>
                        </div>

                        {priceUsdNum === 0 && (
                            <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={publicFreeEnabled}
                                    onChange={(event) => setPublicFreeEnabled(event.target.checked)}
                                    disabled={uploading || !accountId}
                                    className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 text-near-green"
                                />
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-white">Herkes izleyebilsin</p>
                                    <p className="text-xs text-zinc-400">
                                        Açıkken video anonim olarak oynar. Kapalıysa video ücretsiz olur ama izlemek için önce hesaba eklenir.
                                    </p>
                                </div>
                            </label>
                        )}

                        {file && (
                            <p className="text-xs text-muted-foreground">
                                {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                            </p>
                        )}

                        {fileSizeError && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{fileSizeError}</AlertDescription>
                            </Alert>
                        )}

                        {/* Progress bar removed - step indicators provide upload feedback */}

                        {status && (
                            <Alert variant={status.includes('failed') ? "destructive" : "default"}>
                                {status.includes('failed') ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                                <AlertTitle>{status.includes('failed') ? "Error" : "Status"}</AlertTitle>
                                <AlertDescription>
                                    {status}
                                </AlertDescription>
                            </Alert>
                        )}

                        {retryStep === 'sign_auth' && (
                            <Alert className="border-yellow-500/50 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Action Required</AlertTitle>
                                <AlertDescription className="flex flex-col gap-2">
                                    <p>The browser blocked the second signature popup.</p>
                                    <Button
                                        onClick={handleRetrySign}
                                        variant="outline"
                                        className="w-full border-yellow-500/50 hover:bg-yellow-500/20"
                                    >
                                        Continue Signing & Upload
                                    </Button>
                                </AlertDescription>
                            </Alert>
                        )}

                    </CardContent>

                    {/* Cost Receipt Section - shown when file is selected */}
                    {file && (
                        <div className="px-6 pb-2">
                            <CostReceipt
                                storageFee={estimatedStorageFee}
                                storageOrderStatus={us.storageOrderStatus}
                            />
                        </div>
                    )}


                    <CardFooter>
                        <Button
                            onClick={handleUpload}
                            disabled={uploading || !file || !title || !description || !accountId || !!fileSizeError}
                            className="w-full"
                        >
                            {uploading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {t.upload_page.processing}
                                </>
                            ) : (
                                <>
                                    <Upload className="mr-2 h-4 w-4" />
                                    {parseFloat(payAmount) > 0 ? t.upload_page.pay_and_upload : t.upload_page.upload_btn}
                                </>
                            )}
                        </Button>

                        {/* Manual Refund Button for Success State */}

                    </CardFooter>
                </Card>

                {/* RIGHT COLUMN: TICKET PREVIEW + UPLOAD STEPS (Vertical) */}
                <div className="lg:col-span-2 space-y-4 order-1 lg:order-2">
                    {/* Modern Ticket Preview Card */}
                    <div className="sticky top-20">
                        <div className="relative group overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-white/10 shadow-2xl shadow-black/50">
                            {/* Decorative Corner Glow */}
                            <div className="absolute -top-20 -right-20 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700" />
                            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl opacity-50 group-hover:opacity-80 transition-opacity duration-700" />

                            {/* Image Container */}
                            <div className="aspect-video relative overflow-hidden">
                                {thumbnailPreview ? (
                                    <Image
                                        src={thumbnailPreview}
                                        alt="Ticket Preview"
                                        fill
                                        sizes="(max-width: 1024px) 100vw, 66vw"
                                        unoptimized
                                        className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700 ease-out"
                                    />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800/50 to-zinc-900/50 backdrop-blur-sm">
                                        <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center mb-3">
                                            <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                        </div>
                                        <span className="text-zinc-600 text-xs font-medium">{t.upload_page.no_media}</span>
                                    </div>
                                )}

                                {/* Gradient Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/20 to-transparent" />

                                {/* Play Button */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="opacity-0 group-hover:opacity-100 transform scale-90 group-hover:scale-100 transition-all duration-300">
                                        <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-2xl">
                                            <div className="w-0 h-0 border-l-[14px] border-l-white border-y-[9px] border-y-transparent ml-1.5" />
                                        </div>
                                    </div>
                                </div>

                                {/* Top Badges Row */}
                                <div className="absolute top-3 left-3 right-3 flex items-center justify-end">
                                    {/* Price Badge */}
                                    <div className={`px-3 py-1.5 rounded-lg backdrop-blur-sm border shadow-lg ${priceUsdNum === 0
                                        ? 'bg-emerald-500/90 border-emerald-400/30'
                                        : 'bg-black/60 border-white/10'
                                        }`}>
                                        {priceUsdNum === 0 ? (
                                            <span className="text-[10px] font-bold text-white tracking-wider uppercase">✨ Free Ticket</span>
                                        ) : (
                                            <span className="text-[10px] font-bold text-white tracking-wider">${parseFloat(priceUsd).toFixed(2)}</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Content Section */}
                            <div className="p-5 relative">
                                {/* Title */}
                                <h4 className="font-bold text-white text-lg leading-tight line-clamp-1 mb-1.5 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-purple-200 transition-all duration-300">
                                    {title || t.upload_page.untitled}
                                </h4>

                                {/* Description */}
                                <p className="text-sm text-zinc-400 line-clamp-2 mb-4 leading-relaxed">
                                    {description || t.upload_page.no_desc}
                                </p>

                                {/* Divider with Gradient */}
                                <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-4" />

                                {/* Creator Row */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        {/* Avatar with Ring */}
                                        <div className="relative">
                                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 via-blue-500 to-cyan-500 p-0.5">
                                                <div className="w-full h-full rounded-[10px] bg-zinc-900 flex items-center justify-center">
                                                    <span className="text-xs font-bold text-white">
                                                        {accountId ? accountId.substring(0, 2).toUpperCase() : "??"}
                                                    </span>
                                                </div>
                                            </div>
                                            {/* Online Indicator */}
                                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-zinc-900" />
                                        </div>

                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">Creator</span>
                                            <span className="text-xs text-zinc-300 font-medium truncate max-w-[120px]">
                                                {accountId || t.upload_page.connect_wallet}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Ticket Type Indicator */}
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                                        <div className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 animate-pulse" />
                                        <span className="text-[10px] text-zinc-400 font-medium">NFT Ticket</span>
                                    </div>
                                </div>
                            </div>

                            {/* Bottom Shine Effect */}
                            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        </div>

                        {/* Upload Progress Steps - Vertical Layout Below Preview */}
                        <div className="mt-4 p-5 bg-gradient-to-br from-zinc-900/90 to-zinc-950/90 rounded-2xl border border-white/[0.08] backdrop-blur-sm shadow-xl">
                            {/* Header with step counter */}
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-xs font-bold tracking-wide uppercase text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                                    {t.upload_page.progress_title}
                                </h3>
                                {uploading && (
                                    <span className="text-[10px] font-mono text-zinc-500 tabular-nums">
                                        {uploadSteps.filter(s => s.status === 'complete').length}/{uploadSteps.length}
                                    </span>
                                )}
                            </div>

                            {/* Overall progress bar */}
                            {uploading && (() => {
                                const completed = uploadSteps.filter(s => s.status === 'complete').length;
                                const loading = uploadSteps.filter(s => s.status === 'loading').length;
                                const pct = Math.round(((completed + loading * 0.5) / uploadSteps.length) * 100);
                                return (
                                    <div className="mb-5">
                                        <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500 transition-all duration-700 ease-out"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Vertical Progress Steps */}
                            <div className="relative">
                                {/* Continuous vertical track */}
                                <div className="absolute left-[13px] top-3 bottom-3 w-[2px] bg-zinc-800 rounded-full" />

                                <div className="space-y-1">
                                    {uploadSteps.map((step, index) => {
                                        const isActive = step.status === 'loading';
                                        const isDone = step.status === 'complete';
                                        const isError = step.status === 'error';

                                        return (
                                            <div key={step.id} className="relative">
                                                {/* Filled track segment */}
                                                {index > 0 && (
                                                    <div
                                                        className={`absolute left-[13px] -top-1 w-[2px] h-[calc(50%+4px)] rounded-full transition-all duration-500 ${isDone || isActive || isError ? 'bg-gradient-to-b from-emerald-500 to-emerald-500/80' : 'bg-transparent'
                                                            }`}
                                                    />
                                                )}

                                                <div className={`flex items-center gap-3 px-2 py-2.5 rounded-xl transition-all duration-300 ${isActive ? 'bg-blue-500/[0.08] border border-blue-500/20' :
                                                    isError ? 'bg-red-500/[0.06] border border-red-500/15' :
                                                        'border border-transparent'
                                                    }`}>
                                                    {/* Step indicator */}
                                                    <div className="relative z-10 flex-shrink-0">
                                                        {step.status === 'pending' && (
                                                            <div className="w-7 h-7 rounded-full bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center">
                                                                <span className="text-[9px] font-bold text-zinc-600">{index + 1}</span>
                                                            </div>
                                                        )}
                                                        {step.status === 'loading' && (
                                                            <div className="w-7 h-7 rounded-full bg-blue-500/20 border-2 border-blue-400 flex items-center justify-center shadow-lg shadow-blue-500/25">
                                                                <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                                                            </div>
                                                        )}
                                                        {step.status === 'complete' && (
                                                            <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                                                                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                                                            </div>
                                                        )}
                                                        {step.status === 'error' && (
                                                            <div className="w-7 h-7 rounded-full bg-red-500/20 border-2 border-red-400 flex items-center justify-center shadow-lg shadow-red-500/25">
                                                                <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Step content */}
                                                    <div className="flex-1 min-w-0">
                                                        <span className={`text-xs font-medium block transition-colors duration-300 ${isDone ? 'text-emerald-400' :
                                                            isActive ? 'text-blue-300' :
                                                                isError ? 'text-red-400' :
                                                                    'text-zinc-500'
                                                            }`}>
                                                            {(t.upload_page.steps as Record<string, string>)[step.id] || step.label}
                                                        </span>
                                                        {isActive && (
                                                            <span className="text-[10px] text-blue-400/60 mt-0.5 block animate-pulse">
                                                                {t.upload_page.processing}...
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Status indicator */}
                                                    {isDone && (
                                                        <span className="text-[9px] font-medium text-emerald-500/60 uppercase tracking-wider flex-shrink-0">
                                                            OK
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* All done message */}
                            {uploadSteps.every(s => s.status === 'complete') && (
                                <div className="mt-4 pt-4 border-t border-emerald-500/10">
                                    <div className="flex items-center gap-2 text-emerald-400">
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span className="text-xs font-semibold">
                                            {status.includes('Success') ? status : 'Upload Complete!'}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div >
    );
}
