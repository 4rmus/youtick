'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, Upload } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/components/providers/WalletProvider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MultiAssetPaymentPanel } from '@/components/MultiAssetPaymentPanel';
import { FEATURE_FLAGS } from '@/lib/constants';
import {
    publicationPollIntervalMs,
    restoreUploadStage,
    transitionUploadStage,
    type UploadStage,
} from '@/lib/livepeer-upload-state';
import {
    loadActivePaymentCheckout,
    multiAssetPaymentsEnabled,
    updateActivePaymentCheckoutState,
    verifyConvertedUsdcReady,
} from '@/lib/multi-asset-payments';
import {
    readLivepeerMediaJob,
    readLivepeerUploadProgress,
    waitForAuthorizedLivepeerJob,
} from '@/lib/livepeer-publication';
import {
    advanceLivepeerUploadDraftStage,
    authorizeLivepeerPaidJob,
    cancelLivepeerUpload,
    clearLivepeerJobSessionKey,
    clearLivepeerUploadDraft,
    configuredCreatorFeeGasReserveYocto,
    createLivepeerJobId,
    fingerprintLivepeerSource,
    LIVEPEER_SOURCE_ACCEPT,
    heartbeatLivepeerUploadLease,
    livepeerUploadFeeUsdc,
    parseLivepeerPriceUsdc,
    preflightLivepeerUpload,
    prepareCreatorFeePaymentOptions,
    readLivepeerUploadDraft,
    requestLivepeerUploadIntent,
    sponsoredUploadPaymentOptionsChanged,
    uploadLivepeerSource,
    validateLivepeerSourceFile,
    writeLivepeerUploadDraft,
    type CreatorFeeAsset,
    type SignedNearCreatorFeeQuote,
    type SponsoredUploadQuoteSummary,
} from '@/lib/livepeer-upload';

const UPLOAD_STEPS = ['Payment options', 'Wallet approval', 'Upload', 'Processing', 'Published'] as const;
const UPLOAD_EXPIRED_MESSAGE = 'The publication deadline has passed. This paid upload can no longer be published or retried.';
const UPLOAD_STAGE_STATE: Record<UploadStage, { active: number; completeThrough: number }> = {
    draft: { active: -1, completeThrough: -1 },
    preflight: { active: 0, completeThrough: -1 },
    payment_required: { active: -1, completeThrough: 0 },
    payment_pending: { active: 1, completeThrough: 0 },
    authorized: { active: 2, completeThrough: 1 },
    intent_pending: { active: 2, completeThrough: 1 },
    upload_ready: { active: 2, completeThrough: 1 },
    uploading: { active: 2, completeThrough: 1 },
    provider_processing: { active: 3, completeThrough: 2 },
    published: { active: -1, completeThrough: 4 },
};

export function LivepeerPaidUploadForm() {
    const { accountId, connect, getWallet, isReady } = useWallet();
    const [file, setFile] = React.useState<File | null>(null);
    const [fileError, setFileError] = React.useState<string | null>(null);
    const [title, setTitle] = React.useState('');
    const [price, setPrice] = React.useState('2.00');
    const [jobId, setJobId] = React.useState<string | null>(null);
    const [rightsAccepted, setRightsAccepted] = React.useState(false);
    const [status, setStatus] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [uploadStage, setUploadStage] = React.useState<UploadStage>('draft');
    const [failedStep, setFailedStep] = React.useState<number | null>(null);
    const [uploadProgress, setUploadProgress] = React.useState(0);
    const previewRef = React.useRef<HTMLVideoElement>(null);
    const [payment, setPayment] = React.useState<{
        usable: CreatorFeeAsset[];
        usdcFee: string;
        nearQuote?: SignedNearCreatorFeeQuote;
        sponsoredUsdc: boolean;
    } | null>(null);
    const [paymentAsset, setPaymentAsset] = React.useState<CreatorFeeAsset | null>(null);
    const [sponsorQuote, setSponsorQuote] = React.useState<SponsoredUploadQuoteSummary | null>(null);
    const fileSelectionVersion = React.useRef(0);
    const moveUploadStage = React.useCallback((next: UploadStage) => {
        setUploadStage((current) => transitionUploadStage(current, next));
    }, []);
    const uploaded = uploadStage === 'provider_processing' || uploadStage === 'published';
    const publicationReady = uploadStage === 'published';
    const publicationPollingEnabled = Boolean(uploaded && jobId && accountId);
    const publicationQuery = useQuery({
        queryKey: ['livepeerUploadPublication', accountId, jobId],
        queryFn: async () => {
            if (!jobId) throw new Error('livepeer_job_missing');
            const progress = await readLivepeerUploadProgress(jobId);
            if (progress.publication || progress.expired || !FEATURE_FLAGS.publicTestnetBeta) {
                return { ...progress, providerState: null };
            }
            if (!file || !accountId) throw new Error('livepeer_upload_status_unavailable');
            const source = validateLivepeerSourceFile(file);
            if (!source.ok) throw new Error(source.error);
            const provider = await requestLivepeerUploadIntent({
                accountId, jobId, generation: 1, expectedSourceBytes: file.size,
                sourceFingerprintSha256: await fingerprintLivepeerSource(file),
                sourceType: source.sourceType, recovery: 'reconcile',
            });
            return { ...progress, providerState: provider.state };
        },
        enabled: publicationPollingEnabled,
        retry: false,
        refetchInterval: (query) => query.state.data?.publication
            ? false
            : publicationPollIntervalMs(
                query.state.dataUpdateCount + query.state.fetchFailureCount,
            ),
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
    });
    const publicationExpired = publicationQuery.data?.expired === true;
    const providerFailed = publicationQuery.data?.providerState === 'PROVIDER_FAILED';

    React.useEffect(() => {
        const preview = previewRef.current;
        if (!file || !preview) return;
        const url = URL.createObjectURL(file);
        preview.src = url;
        return () => {
            preview.removeAttribute('src');
            preview.load();
            URL.revokeObjectURL(url);
        };
    }, [file]);

    React.useEffect(() => {
        fileSelectionVersion.current += 1;
        setJobId(null);
        setStatus(null);
        setError(null);
        moveUploadStage('draft');
        setFailedStep(null);
        setUploadProgress(0);
        setPayment(null);
        setPaymentAsset(null);
        setSponsorQuote(null);
    }, [accountId, moveUploadStage]);

    React.useEffect(() => {
        if (!publicationPollingEnabled || !accountId) return;
        if (publicationQuery.data?.publication) {
            clearLivepeerUploadDraft(accountId);
            if (jobId) clearLivepeerJobSessionKey(accountId, jobId);
            moveUploadStage('published');
            setFailedStep(null);
            setError(null);
            setStatus('Publication ready.');
        } else if (publicationQuery.data?.expired) {
            setFailedStep(3);
            setStatus(UPLOAD_EXPIRED_MESSAGE);
        } else if (publicationQuery.isError) {
            setStatus('Publication status is unavailable. Keep your file; no retry or new payment has been started.');
        } else if (publicationQuery.data?.providerState === 'PROVIDER_FAILED') {
            setFailedStep(3);
            setStatus('Livepeer could not process this upload. No new payment or upload has been started.');
        } else if (publicationQuery.data?.job) {
            setStatus(publicationQuery.data.job.status === 'Published'
                || ['READY_VERIFIED', 'FINALIZE_QUEUED', 'FINALIZE_RETRY', 'ONCHAIN_PUBLISHED'].includes(publicationQuery.data.providerState || '')
                ? 'Finalizing publication…'
                : publicationQuery.data.providerState === 'PROCESSING'
                    ? 'Livepeer is processing the upload…'
                    : 'Upload complete. Waiting for Livepeer processing…');
        }
    }, [accountId, jobId, moveUploadStage, publicationPollingEnabled, publicationQuery.data, publicationQuery.isError]);

    const selectFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectionVersion = ++fileSelectionVersion.current;
        const selected = event.target.files?.[0] || null;
        setError(null);
        moveUploadStage('draft');
        setFailedStep(null);
        setUploadProgress(0);
        setPayment(null);
        setPaymentAsset(null);
        setSponsorQuote(null);
        setJobId(null);
        if (typeof selected !== 'object' || !(selected instanceof File)) {
            setFile(null);
            return setFileError(null);
        }
        setFile(selected);
        const validation = validateLivepeerSourceFile(selected);
        if (!validation.ok) return setFileError(fileValidationMessage(validation.error));
        setFileError(null);
        const draft = accountId ? await readLivepeerUploadDraft(accountId, selected) : null;
        if (selectionVersion !== fileSelectionVersion.current) return;
        setJobId(draft?.jobId || null);
        if (draft) {
            setTitle(draft.title);
            setPrice(draft.price);
            moveUploadStage(restoreUploadStage(draft.stage));
        }
    };

    const preparePayment = async () => {
        if (!accountId || !file || fileError || !title.trim() || !rightsAccepted) return;
        setBusy(true);
        setError(null);
        setFailedStep(null);
        moveUploadStage('draft');
        moveUploadStage('preflight');
        setStatus('Checking payment options…');
        try {
            parseLivepeerPriceUsdc(price);
            const activeJobId = jobId || createLivepeerJobId();
            setJobId(activeJobId);
            writeLivepeerUploadDraft(accountId, {
                schema: 'youtick.livepeer-ui-draft.v2',
                stage: 'payment_pending',
                jobId: activeJobId,
                title: title.trim(),
                price,
                sourceBytes: file.size,
                sourceName: file.name,
                sourceLastModified: file.lastModified,
                sourceFingerprintSha256: await fingerprintLivepeerSource(file),
            });
            await preflightLivepeerUpload({
                accountId,
                jobId: activeJobId,
                generation: 1,
                expectedSourceBytes: file.size,
            });
            const wallet = await getWallet();
            if (FEATURE_FLAGS.publicTestnetBeta
                && typeof wallet.signDelegateActions !== 'function') {
                throw new Error('sponsored_upload_wallet_unsupported');
            }
            const uploadFeeUsdc = livepeerUploadFeeUsdc(file.size);
            const activeCheckout = loadActivePaymentCheckout(accountId);
            const matchingCheckout = multiAssetPaymentsEnabled
                && activeCheckout
                && !['complete', 'refunded', 'failed'].includes(activeCheckout.state)
                && activeCheckout.required_usdc_micro === uploadFeeUsdc
                && activeCheckout.quote.purpose.type === 'upload'
                && activeCheckout.quote.purpose.expected_source_bytes === String(file.size);
            const sponsoredUsdc = FEATURE_FLAGS.enableSponsoredLivepeerUploads
                && typeof wallet.signDelegateActions === 'function'
                && !matchingCheckout;
            const options = await prepareCreatorFeePaymentOptions({
                accountId,
                jobId: activeJobId,
                expectedSourceBytes: file.size,
                gasReserveYocto: configuredCreatorFeeGasReserveYocto(),
                gasSponsoredUsdc: sponsoredUsdc,
            });
            if (!options.selected && !multiAssetPaymentsEnabled) {
                throw new Error('creator_fee_balance_or_gas_insufficient');
            }
            setPayment({ ...options, sponsoredUsdc });
            setPaymentAsset(options.selected);
            setSponsorQuote(null);
            moveUploadStage('payment_required');
            setStatus(null);
        } catch (reason) {
            setFailedStep(0);
            setError(uploadErrorMessage(reason, false));
        } finally {
            setBusy(false);
        }
    };

    const start = async () => {
        if (!accountId || !file || fileError || !title.trim() || !rightsAccepted || !jobId || !payment || !paymentAsset) return;
        setBusy(true);
        setError(null);
        setFailedStep(null);
        let activeStep = 1;
        let availabilityConfirmed = false;
        let convertedCheckout = false;
        try {
            const source = validateLivepeerSourceFile(file);
            if (!source.ok) throw new Error(source.error);
            if (!payment.usable.includes(paymentAsset)) throw new Error('creator_fee_asset_unavailable');
            if (paymentAsset === 'NEAR' && (!payment.nearQuote || BigInt(payment.nearQuote.quote.expires_at_ms) <= BigInt(Date.now()))) {
                setPayment(null);
                setPaymentAsset(null);
                setSponsorQuote(null);
                throw new Error('near_creator_fee_quote_expired');
            }
            const existingJob = await readLivepeerMediaJob(jobId);
            if (existingJob?.status === 'Published') {
                clearLivepeerUploadDraft(accountId);
                clearLivepeerJobSessionKey(accountId, jobId);
                moveUploadStage('published');
                setStatus('Publication ready.');
                return;
            }
            setStatus('Checking upload availability…');
            await preflightLivepeerUpload({
                accountId,
                jobId,
                generation: 1,
                expectedSourceBytes: file.size,
            });
            availabilityConfirmed = true;
            moveUploadStage('payment_pending');
            setStatus('Authorizing the paid job…');
            const wallet = await getWallet();
            const conversionExpectation = {
                purpose: { type: 'upload' as const, expected_source_bytes: String(file.size) },
                requiredUsdcMicro: payment.usdcFee,
            };
            const activeCheckout = paymentAsset === 'USDC'
                ? loadActivePaymentCheckout(accountId)
                : null;
            const matchingCheckout = multiAssetPaymentsEnabled
                && activeCheckout
                && !['complete', 'refunded', 'failed'].includes(activeCheckout.state)
                && activeCheckout.required_usdc_micro === payment.usdcFee
                && activeCheckout.quote.purpose.type === 'upload'
                && activeCheckout.quote.purpose.expected_source_bytes === String(file.size)
                ? activeCheckout
                : null;
            if (sponsoredUploadPaymentOptionsChanged(
                payment.sponsoredUsdc,
                Boolean(matchingCheckout),
            )) {
                setPayment(null);
                setPaymentAsset(null);
                setSponsorQuote(null);
                activeStep = 0;
                throw new Error('creator_fee_payment_options_changed');
            }
            if (matchingCheckout?.state === 'usdc_final') {
                const ready = await verifyConvertedUsdcReady({
                    accountId,
                    requiredUsdcMicro: payment.usdcFee,
                    status: 'SUCCESS',
                });
                if (!ready) throw new Error('payment_converted_usdc_not_ready');
                convertedCheckout = updateActivePaymentCheckoutState(
                    accountId,
                    conversionExpectation,
                    'core_pending',
                ) !== null;
            } else if (matchingCheckout?.state === 'core_pending') {
                convertedCheckout = true;
            }
            const uploadPublicKey = await authorizeLivepeerPaidJob(wallet, {
                accountId,
                jobId,
                title: title.trim(),
                priceUsdc: parseLivepeerPriceUsdc(price),
                expectedSourceBytes: file.size,
                asset: paymentAsset,
                nearQuote: payment.nearQuote,
                allowSponsoredUsdc: payment.sponsoredUsdc && !matchingCheckout,
                onSponsoredQuote: async (quote) => {
                    setSponsorQuote(quote);
                    setStatus(`Confirm the ${formatMicroUsdc(quote.totalFeeUsdc)} USDC total in your wallet.`);
                    await new Promise<void>((resolve) => setTimeout(resolve, 0));
                },
            });
            setStatus('Waiting for the payment to finalize…');
            await waitForAuthorizedLivepeerJob(jobId, accountId, uploadPublicKey);
            advanceLivepeerUploadDraftStage(accountId, jobId, 'authorized');
            moveUploadStage('authorized');
            if (convertedCheckout) {
                updateActivePaymentCheckoutState(accountId, conversionExpectation, 'complete');
                convertedCheckout = false;
            }
            activeStep = 2;
            moveUploadStage('intent_pending');
            setUploadProgress(0);
            setStatus('Preparing the Livepeer upload…');
            const intent = await requestLivepeerUploadIntent({
                accountId,
                jobId,
                generation: 1,
                expectedSourceBytes: file.size,
                sourceFingerprintSha256: await fingerprintLivepeerSource(file),
                sourceType: source.sourceType,
            });
            advanceLivepeerUploadDraftStage(accountId, jobId, 'upload_ready');
            moveUploadStage('upload_ready');
            setStatus('Uploading directly to Livepeer…');
            advanceLivepeerUploadDraftStage(accountId, jobId, 'uploading');
            moveUploadStage('uploading');
            await uploadLivepeerSource(file, intent, {
                onProgress: (sent, total) => setUploadProgress(
                    total > 0 ? Math.min(99, Math.max(0, Math.floor((sent / total) * 100))) : 0,
                ),
                heartbeat: () => heartbeatLivepeerUploadLease({ accountId, intent }),
            });
            advanceLivepeerUploadDraftStage(accountId, jobId, 'provider_processing');
            setUploadProgress(100);
            moveUploadStage('provider_processing');
            setStatus('Livepeer is processing the upload…');
        } catch (reason) {
            if (convertedCheckout && accountId && file && payment) {
                updateActivePaymentCheckoutState(accountId, {
                    purpose: { type: 'upload', expected_source_bytes: String(file.size) },
                    requiredUsdcMicro: payment.usdcFee,
                }, 'usdc_final');
            }
            setFailedStep(activeStep);
            setStatus(null);
            setError(uploadErrorMessage(reason, availabilityConfirmed));
        } finally {
            setBusy(false);
        }
    };

    const cancel = async () => {
        if (!accountId || !jobId || uploadStage !== 'authorized') return;
        setBusy(true);
        setError(null);
        setStatus('Cancelling the upload job…');
        try {
            await cancelLivepeerUpload({ accountId, jobId, generation: 1 });
            clearLivepeerJobSessionKey(accountId, jobId);
            clearLivepeerUploadDraft(accountId);
            setJobId(null);
            setPayment(null);
            setPaymentAsset(null);
            setSponsorQuote(null);
            setFailedStep(null);
            setUploadProgress(0);
            moveUploadStage('draft');
            setStatus('Upload job cancelled. The technical-pilot fee is non-refundable.');
        } catch (reason) {
            setStatus(null);
            setError(reason instanceof Error ? reason.message : 'Upload job could not be cancelled.');
        } finally {
            setBusy(false);
        }
    };

    const formReady = Boolean(accountId && file && !fileError && title.trim() && price.trim() && rightsAccepted);

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div>
                <p className="text-sm font-medium text-emerald-300">Livepeer paid media</p>
                <h1 className="mt-2 text-3xl font-semibold">Publish a video</h1>
                <p className="mt-2 text-zinc-400">The browser sends the source directly to Livepeer. NEAR records payment and publication state.</p>
            </div>

            {uploaded && (
                <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>{publicationReady ? 'Publication ready' : publicationExpired ? 'Publication deadline passed' : publicationQuery.isError ? 'Publication status unavailable' : providerFailed ? 'Video processing failed' : 'Upload complete; awaiting publication'}</AlertTitle>
                    <AlertDescription>{publicationExpired ? UPLOAD_EXPIRED_MESSAGE : 'A watch link appears only after the publication exists on NEAR.'}</AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Publication</CardTitle>
                    <CardDescription>MP4, MOV, AVI, WebM, WMV, MKV or FLV; maximum {FEATURE_FLAGS.publicTestnetBeta ? '1 GB' : '20 GB'} and minimum ticket price 2 USDC.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <Input type="file" accept={LIVEPEER_SOURCE_ACCEPT} disabled={busy || (uploaded && !publicationExpired)} onChange={selectFile} />
                    {fileError && <p role="alert" className="text-sm text-red-400">{fileError}</p>}
                    {file && !fileError && (
                        <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-black">
                            <video
                                ref={previewRef}
                                aria-label="Selected video cover preview"
                                className="aspect-video w-full object-cover"
                                muted
                                playsInline
                                preload="metadata"
                                onLoadedMetadata={(event) => {
                                    const duration = event.currentTarget.duration;
                                    if (Number.isFinite(duration) && duration > 0) {
                                        event.currentTarget.currentTime = Math.min(1, duration / 2);
                                    }
                                }}
                            />
                            <span className="absolute bottom-3 left-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white">Cover preview</span>
                        </div>
                    )}
                    <Input aria-label="Title" placeholder="Title" maxLength={200} value={title} disabled={busy || uploaded} onChange={(event) => setTitle(event.target.value)} />
                    <Input aria-label="Ticket price in USDC" type="number" min="2" step="0.000001" value={price} disabled={busy || uploaded} onChange={(event) => setPrice(event.target.value)} />
                    <label className="flex items-start gap-3 text-sm">
                        <input type="checkbox" checked={rightsAccepted} disabled={busy || uploaded} onChange={(event) => setRightsAccepted(event.target.checked)} />
                        <span>I own the rights required to publish this video.</span>
                    </label>

                    {file && !fileError && <p className="text-sm">Creator upload fee: {formatMicroUsdc(livepeerUploadFeeUsdc(file.size))} USDC (minimum 0.50)</p>}
                    {payment && (
                        <div className="space-y-2 text-sm">
                            {payment.usable.map((asset) => (
                                <label key={asset} className="flex items-center gap-2">
                                    <input type="radio" name="creator-fee" checked={paymentAsset === asset} disabled={busy} onChange={() => setPaymentAsset(asset)} />
                                    <span>{asset === 'USDC' ? `${formatMicroUsdc(payment.usdcFee)} USDC · 1 payment approval` : `${formatYoctoNear(payment.nearQuote!.quote.fee_near_yocto)} NEAR · 1 payment approval`}</span>
                                </label>
                            ))}
                            {FEATURE_FLAGS.enableLivepeerNearCreatorFee && !payment.nearQuote && <p className="text-xs text-zinc-400">NEAR payment is unavailable; USDC remains available.</p>}
                            {sponsorQuote && (
                                <p role="status" className="text-xs text-emerald-300">
                                    Upload {formatMicroUsdc(sponsorQuote.uploadFeeUsdc)} + gas sponsor {formatMicroUsdc(sponsorQuote.sponsorFeeUsdc)} = {formatMicroUsdc(sponsorQuote.totalFeeUsdc)} USDC total
                                </p>
                            )}
                        </div>
                    )}
                    {accountId && jobId && file && !fileError && (
                        <MultiAssetPaymentPanel
                            accountId={accountId}
                            getWallet={getWallet}
                            purpose={{ type: 'upload', expected_source_bytes: String(file.size) }}
                            requiredUsdcMicro={livepeerUploadFeeUsdc(file.size)}
                            disabled={busy}
                            onUsdcReady={() => void preparePayment()}
                        />
                    )}

                    {file && !fileError && (
                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                            <ol aria-label="Publication progress" className="grid gap-3 sm:grid-cols-5">
                                {UPLOAD_STEPS.map((label, index) => {
                                    const state = UPLOAD_STAGE_STATE[uploadStage];
                                    const failed = failedStep === index;
                                    const complete = !failed && index <= state.completeThrough;
                                    const active = !failed && index === state.active;
                                    return (
                                        <li
                                            key={label}
                                            aria-current={active ? 'step' : undefined}
                                            className={`flex items-center gap-2 text-xs ${failed ? 'text-red-400' : active || complete ? 'text-white' : 'text-zinc-500'}`}
                                        >
                                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${failed ? 'border-red-400' : complete ? 'border-emerald-400 bg-emerald-400 text-black' : active ? 'border-emerald-400 text-emerald-300' : 'border-zinc-700'}`}>
                                                {complete ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : index + 1}
                                            </span>
                                            <span>{label}</span>
                                        </li>
                                    );
                                })}
                            </ol>
                            {uploadStage === 'uploading' && (
                                <div className="mt-4">
                                    <div className="mb-2 flex justify-between text-sm text-zinc-300">
                                        <span>Uploading</span>
                                        <span>{uploadProgress}%</span>
                                    </div>
                                    <progress
                                        aria-label="Video upload progress"
                                        className="h-2 w-full accent-emerald-400"
                                        max={100}
                                        value={uploadProgress}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {!accountId ? (
                        <Button onClick={() => void connect()} disabled={!isReady}>Connect wallet</Button>
                    ) : publicationReady && jobId ? (
                        <Button asChild className="w-full"><Link href={`/watch?job=${encodeURIComponent(jobId)}`}>Open publication</Link></Button>
                    ) : publicationExpired ? (
                        <Button className="w-full" disabled>Publication deadline passed</Button>
                    ) : uploaded ? (
                        <Button className="w-full" disabled>
                            {!publicationQuery.isError && !providerFailed && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {publicationQuery.isError ? 'Status unavailable' : providerFailed ? 'Processing failed' : 'Waiting for publication'}
                        </Button>
                    ) : !payment ? (
                        <Button className="w-full" disabled={!formReady || busy} onClick={() => void preparePayment()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Check payment options</Button>
                    ) : (
                        <Button className="w-full" disabled={!formReady || busy || !paymentAsset} onClick={() => void start()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Pay and upload</Button>
                    )}
                    {accountId && jobId && uploadStage === 'authorized' && (
                        <div className="space-y-2">
                            <Button className="w-full" variant="destructive" disabled={busy} onClick={() => void cancel()}>
                                Cancel job (no refund)
                            </Button>
                            <p className="text-xs text-zinc-400">Cancellation stops provider creation only. The technical-pilot fee is not refunded.</p>
                        </div>
                    )}
                    {status && <p role="status" className="text-sm text-zinc-400">{status}</p>}
                    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
                </CardContent>
            </Card>
        </div>
    );
}

function formatMicroUsdc(value: string): string {
    const amount = BigInt(value);
    const fraction = (amount % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
    return `${amount / 1_000_000n}.${fraction.padEnd(2, '0')}`;
}

function fileValidationMessage(error: 'empty_file' | 'source_limit_exceeded' | 'unsupported_video_type'): string {
    if (error === 'empty_file') return 'Choose a non-empty video file.';
    if (error === 'source_limit_exceeded') {
        return `Choose a video file no larger than ${FEATURE_FLAGS.publicTestnetBeta ? '1 GB' : '20 GB'}.`;
    }
    return 'Choose an MP4, MOV, AVI, WebM, WMV, MKV or FLV video file.';
}

function uploadErrorMessage(reason: unknown, availabilityConfirmed: boolean): string {
    const code = reason instanceof Error ? reason.message : '';
    if (code === 'livepeer_upload_expired') return UPLOAD_EXPIRED_MESSAGE;
    if (code === 'livepeer_upload_status_unavailable') {
        return 'Publication status could not be confirmed. Recovery has not been started.';
    }
    if (code === 'admission_closed' || code === 'admission_denied') {
        return availabilityConfirmed
            ? 'Upload availability changed after authorization. Retry this same upload job.'
            : 'Upload is not available for this account right now. No wallet approval was requested.';
    }
    if (code === 'livepeer_job_pending') {
        return 'The payment was sent, but the exact upload key is still finalizing. Retry this upload job.';
    }
    if (code === 'payment_converted_usdc_not_ready') {
        return 'The converted USDC balance or NEAR gas reserve is no longer sufficient.';
    }
    if (code === 'creator_fee_payment_options_changed') {
        return 'Payment options changed. Check payment options again.';
    }
    if (code === 'sponsor_balance_insufficient') {
        return 'Your USDC balance is below the quoted upload and gas-sponsor total.';
    }
    if (code === 'sponsored_upload_wallet_unsupported') {
        return 'This testnet beta requires a Meteor wallet that supports one-step sponsored approval.';
    }
    if (code === 'livepeer_upload_key_recovery_unavailable') {
        return 'This upload key is unavailable. Keep the existing job; no new payment or key change has been started.';
    }
    return code || 'Upload failed.';
}

function formatYoctoNear(value: string): string {
    const amount = BigInt(value);
    const fraction = (amount % (10n ** 24n)).toString().padStart(24, '0').replace(/0+$/, '');
    return fraction ? `${amount / (10n ** 24n)}.${fraction}` : String(amount / (10n ** 24n));
}
