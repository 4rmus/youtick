'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useWallet } from '@/components/providers/WalletProvider';
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
import { Loader2, Upload, AlertCircle, CheckCircle2, Film, LockKeyhole, Play, ShieldCheck, Ticket, Copy, ExternalLink } from "lucide-react"
import { CostReceipt } from './CostReceipt';
import { CreatorAvatar } from './CreatorAvatar';
import { useLanguage } from '@/components/providers/LanguageContext';
import { getNearPrice, usdToNear } from '@/lib/price';
import { useUpload } from '@/hooks/useUpload';

type UploadPageCopy = ReturnType<typeof useLanguage>['t']['upload_page'];

// File size limits (KMS-based flow)
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB for paid
const MAX_FREE_FILE_SIZE = 100 * 1024 * 1024; // 100MB for free
const MIN_PAID_PRICE_USD = 0.5;

const getFriendlyStatus = (rawStatus: string, copy: UploadPageCopy): string => {
    if (!rawStatus) return '';

    const status = rawStatus.toLowerCase();

    if (status.includes('please enter')) return copy.status_missing_fields;
    if (status.includes('title must')) return copy.status_title_limit;
    if (status.includes('description must')) return copy.status_desc_limit;
    if (status.includes('price cannot be negative')) return copy.status_price_negative;
    if (status.includes('price cannot exceed')) return copy.status_price_limit;
    if (status.includes('usdc price must be at least') || status.includes('paid ticket price must be at least')) return copy.status_price_min;
    if (status.includes('could not generate thumbnail')) return copy.status_thumbnail_failed;
    if (status.includes('uploading cover') || status.includes('uploading poster') || status.includes('generating thumbnail') || status.includes('cover image') || status.includes('poster image')) return copy.status_cover;
    if (status.includes('authorizing') || status.includes('upload session') || status.includes('wallet ready') || status.includes('checking wallet')) return copy.status_session;
    if (status.includes('packaging') || status.includes('segment') || status.includes('manifest') || status.includes('delivery') || status.includes('uploading initialization') || status.includes('uploading delivery') || status.includes('uploading encrypted')) return copy.status_delivery;
    if (status.includes('encryption') || status.includes('encrypt') || status.includes('kms') || status.includes('key') || status.includes('storing encryption')) return copy.status_secure_access;
    if (status.includes('mint') || status.includes('blockchain') || status.includes('ticket') || status.includes('nft')) return copy.status_ticket;
    if (status.includes('storage orders') || status.includes('persistent storage') || status.includes('verifying storage') || status.includes('verifying status')) return copy.status_storage;
    if (status.includes('storage order failed')) return copy.status_storage_partial;
    if (status.includes('success') || status.includes('complete') || status.includes('uploaded')) return copy.status_success;
    if (status.includes('failed') || status.includes('error') || status.includes('cancel') || status.includes('upload failed')) return copy.status_failed;

    return rawStatus;
};

const isStatusError = (rawStatus: string): boolean => {
    const status = rawStatus.toLowerCase();
    return status.includes('failed') || status.includes('error') || status.includes('cancel') || status.includes('cannot');
};

export function UploadForm() {
    const { t } = useLanguage();
    const u = t.upload_page;
    const { accountId } = useWallet();
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
    const [linkCopied, setLinkCopied] = useState(false);

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
    const publishedCid = uploadLogic.state.publishedCid;
    const dispatch = uploadLogic.dispatch;
    const setStatus = (msg: string) => dispatch({ type: 'SET_STATUS', payload: msg });

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
    }, [dispatch, estimatedStorageFee, price]);

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
            setLinkCopied(false);
            dispatch({ type: 'SET_PUBLISHED_CID', payload: null });

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
                    setStatus(u.status_cover);

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
                    setStatus(u.status_thumbnail_failed);
                }
            } else {
                setThumbnail(null);
                setPosterThumbnail(null);
                setStatus('');
            }
        }
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
            setLinkCopied(false);
        }
    };

    const handleUpload = async () => {
        if (!file || !accountId) return;
        if (fileSizeError) return;
        if (!title || !description) {
            setStatus(u.status_missing_fields);
            return;
        }
        if (title.length > 200) {
            setStatus(u.status_title_limit);
            return;
        }
        if (description.length > 2000) {
            setStatus(u.status_desc_limit);
            return;
        }
        if (priceUsdNum < 0) {
            setStatus(u.status_price_negative);
            return;
        }
        if (priceUsdNum > 0 && priceUsdNum < MIN_PAID_PRICE_USD) {
            setStatus(u.status_price_min);
            return;
        }
        if (priceUsdNum > 50000) {
            setStatus(u.status_price_limit);
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
            setLinkCopied(false);
        }
    };

    const visibleStatus = getFriendlyStatus(status, u);
    const statusHasError = isStatusError(status);
    const priceLabel = priceUsdNum === 0 ? t.profile_page.free : `$${priceUsdNum.toFixed(2)}`;
    const accessLabel = priceUsdNum > 0
        ? u.paid_ticket_title
        : u.free_ticket_title;
    const ctaLabel = parseFloat(payAmount) > 0 ? u.pay_and_upload : u.upload_btn;
    const publishedWatchPath = publishedCid ? `/watch?cid=${encodeURIComponent(publishedCid)}` : '';
    const handleCopyPublishedLink = async () => {
        if (!publishedWatchPath || typeof window === 'undefined') return;

        try {
            await navigator.clipboard.writeText(new URL(publishedWatchPath, window.location.origin).toString());
            setLinkCopied(true);
            window.setTimeout(() => setLinkCopied(false), 1800);
        } catch (error) {
            console.error('Copy release link failed:', error);
        }
    };
    const creatorStepLabels: Record<string, string> = {
        session: u.steps.session,
        thumbnail: u.steps.thumbnail,
        encrypt: u.steps.encrypt,
        upload: u.steps.upload,
        kms: u.steps.kms,
        mint: u.steps.mint,
        storage: u.steps.storage,
        verify: u.steps.verify,
    };

    return (
        <div className="w-full max-w-7xl mx-auto p-4 space-y-5">
            {/* Header Row: Same grid as content for alignment */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Title - Same width as form (3/5) */}
                <div className="lg:col-span-3 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-near-green">{u.creator_panel}</p>
                    <h1 className="text-3xl font-bold tracking-tight text-white">{u.title}</h1>
                    <p className="text-muted-foreground text-sm">
                        {u.panel_desc}
                    </p>
                </div>
                {/* Verified Badge - Same width as preview (2/5) */}
                <div className="lg:col-span-2 px-4 py-3 rounded-lg border flex items-start gap-3 bg-near-green/10 border-near-green/25">
                    <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 bg-near-green/15 border border-near-green/30">
                        <ShieldCheck className="w-4 h-4 text-near-green" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-near-green">{u.secure_permission_title}</p>
                        <p className="text-xs text-zinc-400">
                            {u.secure_permission_desc}
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Content Grid - Same height columns */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">

                {/* LEFT COLUMN: FORM INPUTS */}
                <Card className="lg:col-span-3 order-2 lg:order-1 rounded-lg">
                    <CardHeader>
                        <CardTitle>{u.publication_info_title}</CardTitle>
                        <CardDescription>{u.publication_info_desc}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        {!accountId && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>{u.wallet_missing_title}</AlertTitle>
                                <AlertDescription>
                                    {u.connect_wallet}
                                </AlertDescription>
                            </Alert>
                        )}



                        <section className="space-y-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                            <div className="flex items-center gap-2">
                                <Film className="h-4 w-4 text-near-green" />
                                <h2 className="text-sm font-semibold text-white">{u.work_info_section}</h2>
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="video-title" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    {u.video_title}
                                </label>
                                <Input
                                    id="video-title"
                                    type="text"
                                    placeholder={u.title_placeholder}
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    disabled={uploading || !accountId}
                                    maxLength={200}
                                    aria-required="true"
                                />
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="video-description" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    {u.video_desc}
                                </label>
                                <Textarea
                                    id="video-description"
                                    placeholder={u.desc_placeholder}
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
                                            className="min-h-11 max-w-full rounded-full border border-white/10 bg-zinc-950/50 px-3 py-2 text-left text-xs leading-snug text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green"
                                        >
                                            {hint}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="content-type" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    {u.content_type}
                                </label>
                                <select
                                    id="content-type"
                                    value={contentType}
                                    onChange={(e) => setContentType(e.target.value)}
                                    disabled={uploading || !accountId}
                                    className="w-full rounded-md border border-white/10 bg-zinc-950/50 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green"
                                >
                                    <option value="Cinema">{u.content_type_film}</option>
                                    <option value="Concert">{u.content_type_concert}</option>
                                    <option value="Documentary">{u.content_type_documentary}</option>
                                    <option value="ShortFilm">{u.content_type_shortfilm}</option>
                                    <option value="FestivalSelection">{u.content_type_festival}</option>
                                    <option value="Exclusive">{u.content_type_exclusive}</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label htmlFor="video-file" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                        {u.file}
                                    </label>
                                    <Input
                                        id="video-file"
                                        type="file"
                                        accept="video/mp4,video/quicktime,.mp4,.mov"
                                        onChange={handleFileChange}
                                        disabled={uploading || !accountId}
                                        className="cursor-pointer"
                                    />
                                    <p className="text-[11px] text-zinc-500">{u.file_help}</p>
                                </div>

                                <div className="space-y-2 rounded-md border border-white/10 bg-zinc-950/30 p-3">
                                    <p className="text-sm font-medium text-white">{u.cover_title}</p>
                                    <p className="text-xs text-zinc-400">
                                        {u.cover_desc}
                                    </p>
                                </div>
                            </div>
                        </section>

                        <section className="space-y-4 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                            <div className="flex items-center gap-2">
                                <Ticket className="h-4 w-4 text-near-green" />
                                <h2 className="text-sm font-semibold text-white">{u.ticket_access_title}</h2>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className={`rounded-md border p-3 ${accessMode === 'free_collectible' ? 'border-near-green/60 bg-near-green/10' : 'border-white/10 bg-zinc-950/30'}`}>
                                    <Ticket className="h-4 w-4 text-near-green mb-2" />
                                    <span className="block text-sm font-medium text-white">{u.free_ticket_title}</span>
                                    <span className="mt-1 block text-xs text-zinc-400">{u.free_ticket_desc}</span>
                                </div>
                                <div className={`rounded-md border p-3 ${accessMode === 'paid' ? 'border-near-purple/60 bg-near-purple/10' : 'border-white/10 bg-zinc-950/30'}`}>
                                    <LockKeyhole className="h-4 w-4 text-near-purple mb-2" />
                                    <span className="block text-sm font-medium text-white">{u.paid_ticket_title}</span>
                                    <span className="mt-1 block text-xs text-zinc-400">{u.paid_ticket_desc}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label htmlFor="ticket-price" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    {u.price}
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
                                        aria-label={`${u.price}, USD`}
                                        className="pl-7"
                                    />
                                </div>
                                <p className="text-xs text-zinc-500">
                                    {u.price_help_free}
                                    {priceUsdNum > 0 && nearPrice > 0 && ` ${u.approx_near} ${priceNearDerived.toFixed(2)} NEAR.`}
                                </p>
                                {priceUsdNum > 0 && priceUsdNum < MIN_PAID_PRICE_USD && (
                                    <p className="text-xs text-near-red">{u.status_price_min}</p>
                                )}
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
                                <AlertTitle>{statusHasError ? u.attention_title : u.publish_status}</AlertTitle>
                                <AlertDescription>
                                    {visibleStatus}
                                </AlertDescription>
                            </Alert>
                        )}

                        {retryStep === 'sign_auth' && (
                            <Alert className="border-near-red/50 bg-near-red/10 text-near-red">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>{u.continue_title}</AlertTitle>
                                <AlertDescription className="flex flex-col gap-2">
                                    <p>{u.retry_desc}</p>
                                    <Button
                                        onClick={handleRetrySign}
                                        variant="outline"
                                        className="w-full border-near-red/50 hover:bg-near-red/20"
                                    >
                                        {u.retry_button}
                                    </Button>
                                </AlertDescription>
                            </Alert>
                        )}

                        {publishedCid && !uploading && (
                            <div className="rounded-lg border border-near-green/25 bg-near-green/10 p-4">
                                <div className="flex items-start gap-3">
                                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-near-green" />
                                    <div className="min-w-0 flex-1">
                                        <h3 className="text-sm font-semibold text-near-green">{u.success_panel_title}</h3>
                                        <p className="mt-1 text-xs leading-relaxed text-zinc-300">{u.success_panel_desc}</p>
                                        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="near"
                                                onClick={() => { window.location.href = publishedWatchPath; }}
                                            >
                                                <ExternalLink className="mr-2 h-4 w-4" />
                                                {u.success_watch}
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => { window.location.href = '/discover'; }}
                                                className="border-near-green/40 text-near-green hover:bg-near-green/10"
                                            >
                                                {u.success_discover}
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={handleCopyPublishedLink}
                                                className="text-near-green hover:bg-near-green/10"
                                            >
                                                <Copy className="mr-2 h-4 w-4" />
                                                {linkCopied ? u.success_copied : u.success_copy}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
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
                            className="h-11 w-full"
                        >
                            {uploading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {u.uploading_button}
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
                                        alt={u.preview_alt}
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
                                        <span className="text-zinc-500 text-xs font-medium">{u.cover_waiting}</span>
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
                                        ? 'bg-near-green/90 border-near-green/30'
                                        : 'bg-black/60 border-white/10'
                                        }`}>
                                        <span className="text-[10px] font-bold text-white tracking-wider uppercase">{priceLabel}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Content Section */}
                            <div className="p-5 relative">
                                {/* Title */}
                                <h4 className="font-bold text-white text-lg leading-tight line-clamp-1 mb-1.5 group-hover:text-near-green transition-colors duration-300">
                                    {title || u.preview_title_fallback}
                                </h4>

                                {/* Description */}
                                <p className="text-sm text-zinc-400 line-clamp-2 mb-4 leading-relaxed">
                                    {description || u.preview_desc_fallback}
                                </p>

                                {/* Divider with Gradient */}
                                <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-4" />

                                {/* Creator Row */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <CreatorAvatar name={accountId} size="md" online />

                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-zinc-500 font-medium">{u.creator_label}</span>
                                            <span className="text-xs text-zinc-300 font-medium truncate max-w-[120px]">
                                                {accountId || u.connect_wallet}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Ticket Type Indicator */}
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                                        <div className={`w-2 h-2 rounded-full ${accessMode === 'paid' ? 'bg-near-purple' : 'bg-near-green'}`} />
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
                                    {u.publish_status}
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
                                                className="h-full rounded-full bg-near-green transition-all duration-700 ease-out"
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
                                                        className={`absolute left-[13px] -top-1 w-[2px] h-[calc(50%+4px)] rounded-full transition-all duration-500 ${isDone || isActive || isError ? 'bg-near-green/80' : 'bg-transparent'
                                                            }`}
                                                    />
                                                )}

                                                <div className={`flex items-center gap-3 px-2 py-2.5 rounded-md transition-all duration-300 ${isActive ? 'bg-near-green/[0.08] border border-near-green/20' :
                                                    isError ? 'bg-near-red/[0.06] border border-near-red/15' :
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
                                                            <div className="w-7 h-7 rounded-full bg-near-green/20 border-2 border-near-green flex items-center justify-center">
                                                                <Loader2 className="w-3.5 h-3.5 text-near-green animate-spin" />
                                                            </div>
                                                        )}
                                                        {step.status === 'complete' && (
                                                            <div className="w-7 h-7 rounded-full bg-near-green flex items-center justify-center shadow-lg shadow-near-green/25">
                                                                <CheckCircle2 className="w-3.5 h-3.5 text-near-black" />
                                                            </div>
                                                        )}
                                                        {step.status === 'error' && (
                                                            <div className="w-7 h-7 rounded-full bg-near-red/20 border-2 border-near-red flex items-center justify-center shadow-lg shadow-near-red/25">
                                                                <AlertCircle className="w-3.5 h-3.5 text-near-red" />
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Step content */}
                                                    <div className="flex-1 min-w-0">
                                                        <span className={`text-xs font-medium block transition-colors duration-300 ${isDone ? 'text-near-green' :
                                                            isActive ? 'text-near-green' :
                                                                isError ? 'text-near-red' :
                                                                    'text-zinc-500'
                                                            }`}>
                                                            {creatorStepLabels[step.id] || step.label}
                                                        </span>
                                                        {isActive && (
                                                            <span className="text-[10px] text-near-green/70 mt-0.5 block">
                                                                {u.preparing}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Status indicator */}
                                                    {isDone && (
                                                        <span className="text-[9px] font-medium text-near-green/60 uppercase tracking-wider flex-shrink-0">
                                                            {u.ready}
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
                                <div className="mt-4 pt-4 border-t border-near-green/10">
                                    <div className="flex items-center gap-2 text-near-green">
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span className="text-xs font-semibold">
                                            {u.all_done}
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
