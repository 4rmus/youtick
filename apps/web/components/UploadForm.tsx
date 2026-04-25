'use client';

import React, { useState } from 'react';
import Image from 'next/image';
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
import { Loader2, Upload, AlertCircle, CheckCircle2, Film, LockKeyhole, Play, ShieldCheck, Ticket } from "lucide-react"
import { CostReceipt } from './CostReceipt';
import { useLanguage } from '@/components/providers/LanguageContext';
import { nearAmountToYocto } from '@/lib/near-amount';
import { getNearPrice, usdToNear } from '@/lib/price';
import type { DeliverySegmentPayload } from '@/lib/types';
import type { PackagedDeliveryAsset } from '@/lib/video-delivery';
import { useUpload } from '@/hooks/useUpload';

// ── Upload state reducer ──

import type { UploadStep } from '@/lib/types';

type StepStatus = UploadStep['status'];

// File size limits (KMS-based flow)
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB for paid
const MAX_FREE_FILE_SIZE = 100 * 1024 * 1024; // 100MB for free
const STRICT_SEGMENTED_DELIVERY = true;

const creatorStepLabels: Record<string, string> = {
    session: 'Yayın izni hazırlanıyor',
    thumbnail: 'Kapak hazırlanıyor',
    encrypt: 'Güvenli erişim kuruluyor',
    upload: 'Video hazırlanıyor',
    kms: 'Güvenli erişim kaydediliyor',
    mint: 'Dijital bilet oluşturuluyor',
    storage: 'Yayın kaydediliyor',
    verify: 'Yayın kontrol ediliyor',
};

const getFriendlyStatus = (rawStatus: string): string => {
    if (!rawStatus) return '';

    const status = rawStatus.toLowerCase();

    if (status.includes('please enter')) return 'Eser adı ve açıklaması gerekli.';
    if (status.includes('title must')) return 'Eser adı en fazla 200 karakter olabilir.';
    if (status.includes('description must')) return 'Eser açıklaması en fazla 2000 karakter olabilir.';
    if (status.includes('price cannot be negative')) return 'Fiyat negatif olamaz.';
    if (status.includes('price cannot exceed')) return 'Fiyat 50.000 USD değerini aşamaz.';
    if (status.includes('could not generate thumbnail')) return 'Kapak görseli hazırlanamadı. Yine de devam edebilirsin.';
    if (status.includes('uploading cover') || status.includes('uploading poster') || status.includes('generating thumbnail') || status.includes('cover image') || status.includes('poster image')) return 'Kapak hazırlanıyor.';
    if (status.includes('authorizing') || status.includes('upload session') || status.includes('wallet ready') || status.includes('checking wallet')) return 'Tek kullanımlık güvenli yayın izni hazırlanıyor.';
    if (status.includes('packaging') || status.includes('segment') || status.includes('manifest') || status.includes('delivery') || status.includes('uploading initialization') || status.includes('uploading delivery') || status.includes('uploading encrypted')) return 'Video yayına hazırlanıyor.';
    if (status.includes('encryption') || status.includes('encrypt') || status.includes('kms') || status.includes('key') || status.includes('storing encryption')) return 'Güvenli erişim kuruluyor.';
    if (status.includes('mint') || status.includes('blockchain') || status.includes('ticket') || status.includes('nft')) return 'Dijital bilet oluşturuluyor.';
    if (status.includes('storage orders') || status.includes('persistent storage') || status.includes('verifying storage') || status.includes('verifying status')) return 'Yayın kaydı korunuyor.';
    if (status.includes('storage order failed')) return 'Eser yayında; uzun süreli saklama onayı tamamlanamadı.';
    if (status.includes('success') || status.includes('complete') || status.includes('uploaded')) return 'Eser yayına alındı. Dijital bilet hazır.';
    if (status.includes('failed') || status.includes('error') || status.includes('cancel') || status.includes('upload failed')) return 'Yayına alma tamamlanamadı. Lütfen bağlantını ve cüzdanını kontrol edip tekrar dene.';

    return rawStatus;
};

const isStatusError = (rawStatus: string): boolean => {
    const status = rawStatus.toLowerCase();
    return status.includes('failed') || status.includes('error') || status.includes('cancel') || status.includes('cannot');
};

export function UploadForm() {
    const { t } = useLanguage();
    const { accountId, getWallet } = useWallet();
    const uploadLogic = useUpload();

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
    const [contentType, setContentType] = useState('Exclusive');

    // Derived NEAR price from USD input
    const priceUsdNum = parseFloat(priceUsd) || 0;
    const priceNearDerived = nearPrice > 0 ? usdToNear(priceUsdNum, nearPrice) : 0;
    // Keep 'price' as NEAR string for backward compat with CostReceipt etc.
    const price = priceUsdNum > 0 ? priceNearDerived.toFixed(6) : '0';
    const accessMode: 'paid' | 'free_collectible' = priceUsdNum > 0 ? 'paid' : 'free_collectible';

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

    // Upload state from hook
    const uploading = uploadLogic.state.uploading;
    const status = uploadLogic.state.status;
    const uploadSteps = uploadLogic.state.steps;
    const retryStep = uploadLogic.state.retryStep;
    const estimatedStorageFee = uploadLogic.state.estimatedStorageFee;
    const payAmount = uploadLogic.state.payAmount;
    const verifiedStorageFee = uploadLogic.state.verifiedStorageFee;
    const storageOrderStatus = uploadLogic.state.storageOrderStatus;
    const uploadStepsRef = React.useRef(uploadSteps);

    React.useEffect(() => {
        uploadStepsRef.current = uploadSteps;
    }, [uploadSteps]);

    const dispatch = uploadLogic.dispatch;
    const setStatus = (msg: string) => dispatch({ type: 'SET_STATUS', payload: msg });
    const setUploading = (val: boolean) => dispatch({ type: 'SET_UPLOADING', payload: val });
    const updateStep = (stepId: string, stepStatus: StepStatus) => {
        dispatch({ type: 'UPDATE_STEP', payload: { id: stepId, status: stepStatus } });
    };

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
        const encryptionKey = aesKeyB64;

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

            await storeEncryptionKey(
                videoUuid,
                aesKeyB64,
                accountId,
                wallet
            );
            updateStep('kms', 'complete');

            // 6. Mint Ticket + Create Event (BATCH - Signless!)
            let blockchainPublishSucceeded = false;
            updateStep('mint', 'loading');
            setStatus('Dijital bilet oluşturuluyor...');
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

                setStatus('Dijital bilet oluşturuluyor ve yayın kaydediliyor...');

                await batchUploadActionsSignless(
                    sessionManager,
                    videoMetadata,
                    eventMetadata
                );

                blockchainPublishSucceeded = true;
                updateStep('mint', 'complete');

            } catch (mintError: unknown) {
                console.error('Digital ticket publish failed:', mintError);
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
        const success = await uploadLogic.handleRetrySign({
            file: file!,
            thumbnail,
            posterThumbnail,
            title,
            description,
            price,
            priceUsdNum,
            accessMode,
            contentType,
            estimatedStorageFee: verifiedStorageFee,
        });
        if (success) {
            setFile(null);
            setTitle('');
            setDescription('');
            setPriceUsd('');
            setThumbnail(null);
            setPosterThumbnail(null);
            setThumbnailPreview(null);
        }
    };

    const handleUpload = async () => {
        if (!file || !accountId) return;
        if (fileSizeError) return;
        if (!title || !description) {
            setStatus('Please enter a title and description');
            return;
        }
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

        const success = await uploadLogic.handleUpload({
            file,
            thumbnail,
            posterThumbnail,
            title,
            description,
            price,
            priceUsdNum,
            accessMode,
            contentType,
            estimatedStorageFee,
        });

        if (success) {
            setFile(null);
            setTitle('');
            setDescription('');
            setPriceUsd('');
            setThumbnail(null);
            setPosterThumbnail(null);
            setThumbnailPreview(null);
        }
    };

    const visibleStatus = getFriendlyStatus(status);
    const statusHasError = isStatusError(status);
    const priceLabel = priceUsdNum === 0 ? 'Ücretsiz' : `$${priceUsdNum.toFixed(2)}`;
    const accessLabel = priceUsdNum > 0
        ? 'Ücretli dijital bilet'
        : 'Ücretsiz dijital bilet';
    const ctaLabel = parseFloat(payAmount) > 0 ? 'Öde ve yayına al' : 'Yayına al';

    return (
        <div className="w-full max-w-7xl mx-auto p-4 space-y-5">
            {/* Header Row: Same grid as content for alignment */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Title - Same width as form (3/5) */}
                <div className="lg:col-span-3 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">Yaratıcı paneli</p>
                    <h1 className="text-3xl font-bold tracking-tight text-white">Eserini Yayına Al</h1>
                    <p className="text-muted-foreground text-sm">
                        Videonu ekle, erişimi seç ve izleyicilerin için dijital bileti hazırla.
                    </p>
                </div>
                {/* Verified Badge - Same width as preview (2/5) */}
                <div className="lg:col-span-2 px-4 py-3 rounded-lg border flex items-start gap-3 bg-emerald-500/10 border-emerald-500/25">
                    <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 bg-emerald-500/15 border border-emerald-500/30">
                        <ShieldCheck className="w-4 h-4 text-emerald-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-emerald-200">Tek kullanımlık güvenli yayın izni</p>
                        <p className="text-xs text-zinc-400">
                            Her yayına alma için ayrı izin hazırlanır ve işlem bitince kapanır.
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Content Grid - Same height columns */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">

                {/* LEFT COLUMN: FORM INPUTS */}
                <Card className="lg:col-span-3 order-2 lg:order-1 rounded-lg">
                    <CardHeader>
                        <CardTitle>Yayın bilgileri</CardTitle>
                        <CardDescription>İzleyicinin keşif ekranında göreceği bilgileri gir.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        {!accountId && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Cüzdan bağlı değil</AlertTitle>
                                <AlertDescription>
                                    Eserini yayına almak için NEAR cüzdanını bağla.
                                </AlertDescription>
                            </Alert>
                        )}



                        <section className="space-y-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                            <div className="flex items-center gap-2">
                                <Film className="h-4 w-4 text-emerald-300" />
                                <h2 className="text-sm font-semibold text-white">Eser bilgileri</h2>
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="video-title" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    Eser adı
                                </label>
                                <Input
                                    id="video-title"
                                    type="text"
                                    placeholder="Eser adını yaz"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    disabled={uploading || !accountId}
                                    maxLength={200}
                                    aria-required="true"
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="video-description" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    Eser açıklaması
                                </label>
                                <Textarea
                                    id="video-description"
                                    placeholder="İzleyiciye eserin ne anlattığını kısaca söyle"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    disabled={uploading || !accountId}
                                    className="min-h-[96px] resize-none"
                                    maxLength={2000}
                                    aria-required="true"
                                />
                                <div className="flex flex-wrap gap-2">
                                    {[t.upload_page?.desc_hint1, t.upload_page?.desc_hint2, t.upload_page?.desc_hint3, t.upload_page?.desc_hint4].filter(Boolean).map((hint) => (
                                        <button
                                            key={hint}
                                            type="button"
                                            onClick={() => setDescription((prev) => prev ? prev + ' ' + hint : hint)}
                                            className="text-[11px] text-zinc-500 bg-zinc-950/50 border border-white/10 px-2 py-1 rounded-full hover:text-zinc-300 hover:border-zinc-600 transition-colors"
                                        >
                                            {hint}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="content-type" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    {t.upload_page?.content_type || 'Eser türü'}
                                </label>
                                <select
                                    id="content-type"
                                    value={contentType}
                                    onChange={(e) => setContentType(e.target.value)}
                                    disabled={uploading || !accountId}
                                    className="w-full rounded-md border border-white/10 bg-zinc-950/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-near-green"
                                >
                                    <option value="Cinema">{t.upload_page?.content_type_film || 'Film'}</option>
                                    <option value="Concert">{t.upload_page?.content_type_concert || 'Konser Kaydı'}</option>
                                    <option value="Documentary">{t.upload_page?.content_type_documentary || 'Belgesel'}</option>
                                    <option value="ShortFilm">{t.upload_page?.content_type_shortfilm || 'Kısa Film'}</option>
                                    <option value="FestivalSelection">{t.upload_page?.content_type_festival || 'Festival Seçkisi'}</option>
                                    <option value="Exclusive">{t.upload_page?.content_type_exclusive || 'Özel İçerik'}</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label htmlFor="video-file" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                        Dosya
                                    </label>
                                    <Input
                                        id="video-file"
                                        type="file"
                                        accept="video/mp4,video/quicktime,.mp4,.mov"
                                        onChange={handleFileChange}
                                        disabled={uploading || !accountId}
                                        className="cursor-pointer"
                                    />
                                    <p className="text-[11px] text-zinc-500">MP4 veya MOV dosyası seç.</p>
                                </div>

                                <div className="space-y-2 rounded-md border border-white/10 bg-zinc-950/30 p-3">
                                    <p className="text-sm font-medium text-white">Kapak görseli</p>
                                    <p className="text-xs text-zinc-400">
                                        Video seçildiğinde kapak otomatik hazırlanır.
                                    </p>
                                </div>
                            </div>
                        </section>

                        <section className="space-y-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                            <div className="flex items-center gap-2">
                                <Ticket className="h-4 w-4 text-sky-300" />
                                <h2 className="text-sm font-semibold text-white">Bilet ve erişim</h2>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className={`rounded-md border p-3 ${accessMode === 'free_collectible' ? 'border-sky-400/60 bg-sky-500/10' : 'border-white/10 bg-zinc-950/30'}`}>
                                    <Ticket className="h-4 w-4 text-sky-300 mb-2" />
                                    <span className="block text-sm font-medium text-white">Ücretsiz dijital bilet</span>
                                    <span className="mt-1 block text-xs text-zinc-400">İzlemek için hesaba eklenir.</span>
                                </div>
                                <div className={`rounded-md border p-3 ${accessMode === 'paid' ? 'border-violet-400/60 bg-violet-500/10' : 'border-white/10 bg-zinc-950/30'}`}>
                                    <LockKeyhole className="h-4 w-4 text-violet-300 mb-2" />
                                    <span className="block text-sm font-medium text-white">Ücretli dijital bilet</span>
                                    <span className="mt-1 block text-xs text-zinc-400">Fiyat girince açılır.</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="ticket-price" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    Dijital bilet fiyatı
                                </label>
                                <div className="relative max-w-xs">
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
                                        aria-label="Dijital bilet fiyatı, USD"
                                        className="pl-7"
                                    />
                                </div>
                                <p className="text-xs text-zinc-500">
                                    Boş bırakırsan eser ücretsiz olur.
                                    {priceUsdNum > 0 && nearPrice > 0 && ` Yaklaşık ${priceNearDerived.toFixed(2)} NEAR.`}
                                </p>
                            </div>
                        </section>

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
                            <Alert variant={statusHasError ? "destructive" : "default"}>
                                {statusHasError ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                                <AlertTitle>{statusHasError ? "Dikkat" : "Yayına alma durumu"}</AlertTitle>
                                <AlertDescription>
                                    {visibleStatus}
                                </AlertDescription>
                            </Alert>
                        )}

                        {retryStep === 'sign_auth' && (
                            <Alert className="border-yellow-500/50 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>İşleme devam et</AlertTitle>
                                <AlertDescription className="flex flex-col gap-2">
                                    <p>Cüzdan onayı tamamlanamadı. Devam etmek için tekrar onay ver.</p>
                                    <Button
                                        onClick={handleRetrySign}
                                        variant="outline"
                                        className="w-full border-yellow-500/50 hover:bg-yellow-500/20"
                                    >
                                        Onayla ve yayına al
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
                                storageOrderStatus={storageOrderStatus}
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
                                    Yayına alınıyor
                                </>
                            ) : (
                                <>
                                    <Upload className="mr-2 h-4 w-4" />
                                    {ctaLabel}
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
                        <div className="relative group overflow-hidden rounded-lg bg-zinc-950 border border-white/10 shadow-xl shadow-black/40 transition-all duration-300 hover:border-white/20">
                            {/* Image Container */}
                            <div className="aspect-video relative overflow-hidden">
                                {thumbnailPreview ? (
                                    <Image
                                        src={thumbnailPreview}
                                        alt="Yayın önizlemesi"
                                        fill
                                        sizes="(max-width: 1024px) 100vw, 40vw"
                                        unoptimized
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900">
                                        <div className="w-14 h-14 rounded-lg bg-zinc-800/70 border border-zinc-700/60 flex items-center justify-center mb-3">
                                            <Film className="w-7 h-7 text-zinc-500" />
                                        </div>
                                        <span className="text-zinc-500 text-xs font-medium">Kapak bekleniyor</span>
                                    </div>
                                )}

                                {/* Gradient Overlay */}
                                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/20 to-transparent" />

                                {/* Play Button */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="opacity-0 group-hover:opacity-100 transform scale-90 group-hover:scale-100 transition-all duration-300">
                                        <div className="w-12 h-12 rounded-full bg-black/45 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-2xl">
                                            <Play className="w-5 h-5 text-white fill-current ml-0.5" />
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
                                        <span className="text-[10px] font-bold text-white tracking-wider uppercase">{priceLabel}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Content Section */}
                            <div className="p-5 relative">
                                {/* Title */}
                                <h4 className="font-bold text-white text-lg leading-tight line-clamp-1 mb-1.5 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-purple-200 transition-all duration-300">
                                    {title || 'Başlıksız eser'}
                                </h4>

                                {/* Description */}
                                <p className="text-sm text-zinc-400 line-clamp-2 mb-4 leading-relaxed">
                                    {description || 'Eser açıklaması burada görünür.'}
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
                                            <span className="text-[10px] text-zinc-500 font-medium">Yaratıcı</span>
                                            <span className="text-xs text-zinc-300 font-medium truncate max-w-[120px]">
                                                {accountId || 'Cüzdan bağla'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Ticket Type Indicator */}
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                                        <div className="w-2 h-2 rounded-full bg-sky-400" />
                                        <span className="text-[10px] text-zinc-400 font-medium">{accessLabel}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Bottom Shine Effect */}
                            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        </div>

                        {/* Upload Progress Steps - Vertical Layout Below Preview */}
                        <div className="mt-4 p-5 bg-zinc-950 rounded-lg border border-white/[0.08] shadow-lg">
                            {/* Header with step counter */}
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-xs font-bold tracking-wide uppercase text-zinc-300">
                                    Yayına alma durumu
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
                                                className="h-full rounded-full bg-emerald-400 transition-all duration-700 ease-out"
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
                                                        className={`absolute left-[13px] -top-1 w-[2px] h-[calc(50%+4px)] rounded-full transition-all duration-500 ${isDone || isActive || isError ? 'bg-emerald-500/80' : 'bg-transparent'
                                                            }`}
                                                    />
                                                )}

                                                <div className={`flex items-center gap-3 px-2 py-2.5 rounded-md transition-all duration-300 ${isActive ? 'bg-emerald-500/[0.08] border border-emerald-500/20' :
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
                                                            <div className="w-7 h-7 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center">
                                                                <Loader2 className="w-3.5 h-3.5 text-emerald-300 animate-spin" />
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
                                                            isActive ? 'text-emerald-200' :
                                                                isError ? 'text-red-400' :
                                                                    'text-zinc-500'
                                                            }`}>
                                                            {creatorStepLabels[step.id] || step.label}
                                                        </span>
                                                        {isActive && (
                                                            <span className="text-[10px] text-emerald-300/70 mt-0.5 block">
                                                                Hazırlanıyor
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Status indicator */}
                                                    {isDone && (
                                                        <span className="text-[9px] font-medium text-emerald-500/60 uppercase tracking-wider flex-shrink-0">
                                                            Hazır
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
                                            Eser yayına alındı.
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
