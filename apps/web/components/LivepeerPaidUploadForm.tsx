'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, Upload } from 'lucide-react';
import { useWallet } from '@/components/providers/WalletProvider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MultiAssetPaymentPanel } from '@/components/MultiAssetPaymentPanel';
import { FEATURE_FLAGS } from '@/lib/constants';
import {
    loadActivePaymentCheckout,
    multiAssetPaymentsEnabled,
    updateActivePaymentCheckoutState,
    verifyConvertedUsdcReady,
} from '@/lib/multi-asset-payments';
import { readLivepeerMediaJob, readLivepeerPublication } from '@/lib/livepeer-publication';
import {
    authorizeLivepeerPaidJob,
    clearLivepeerUploadDraft,
    configuredCreatorFeeGasReserveYocto,
    createLivepeerJobId,
    LIVEPEER_SOURCE_ACCEPT,
    livepeerUploadFeeUsdc,
    parseLivepeerPriceUsdc,
    preflightLivepeerUpload,
    prepareCreatorFeePaymentOptions,
    readLivepeerUploadDraft,
    requestLivepeerUploadIntent,
    uploadLivepeerSource,
    validateLivepeerSourceFile,
    writeLivepeerUploadDraft,
    type CreatorFeeAsset,
    type SignedNearCreatorFeeQuote,
} from '@/lib/livepeer-upload';

type UploadStage = 'idle' | 'payment' | 'payment_ready' | 'authorization' | 'upload' | 'processing' | 'published';

const UPLOAD_STEPS = ['Payment options', 'Wallet approval', 'Upload', 'Processing', 'Published'] as const;
const UPLOAD_STAGE_STATE: Record<UploadStage, { active: number; completeThrough: number }> = {
    idle: { active: -1, completeThrough: -1 },
    payment: { active: 0, completeThrough: -1 },
    payment_ready: { active: -1, completeThrough: 0 },
    authorization: { active: 1, completeThrough: 0 },
    upload: { active: 2, completeThrough: 1 },
    processing: { active: 3, completeThrough: 2 },
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
    const [uploaded, setUploaded] = React.useState(false);
    const [publicationReady, setPublicationReady] = React.useState(false);
    const [uploadStage, setUploadStage] = React.useState<UploadStage>('idle');
    const [failedStep, setFailedStep] = React.useState<number | null>(null);
    const [uploadProgress, setUploadProgress] = React.useState(0);
    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
    const [payment, setPayment] = React.useState<{
        usable: CreatorFeeAsset[];
        usdcFee: string;
        nearQuote?: SignedNearCreatorFeeQuote;
    } | null>(null);
    const [paymentAsset, setPaymentAsset] = React.useState<CreatorFeeAsset | null>(null);

    React.useEffect(() => {
        if (!file) {
            setPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    React.useEffect(() => {
        setJobId(null);
        setStatus(null);
        setError(null);
        setUploaded(false);
        setPublicationReady(false);
        setUploadStage('idle');
        setFailedStep(null);
        setUploadProgress(0);
        setPayment(null);
        setPaymentAsset(null);
    }, [accountId]);

    React.useEffect(() => {
        if (!uploaded || !jobId || !accountId) return;
        let disposed = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const check = async () => {
            try {
                const job = await readLivepeerMediaJob(jobId);
                if (!job) throw new Error('livepeer_job_missing');
                const publication = await readLivepeerPublication(jobId);
                if (disposed) return;
                if (publication) {
                    clearLivepeerUploadDraft(accountId);
                    setPublicationReady(true);
                    setUploadStage('published');
                    setStatus('Publication ready.');
                    return;
                }
                setStatus(job.status === 'Published' ? 'Finalizing publication…' : 'Livepeer is processing the upload…');
            } catch {
                if (!disposed) setStatus('Waiting for the publication status…');
            }
            if (!disposed) timer = setTimeout(check, 5_000);
        };
        void check();
        return () => {
            disposed = true;
            if (timer) clearTimeout(timer);
        };
    }, [accountId, jobId, uploaded]);

    const selectFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selected = event.target.files?.[0] || null;
        setFile(selected);
        setError(null);
        setUploaded(false);
        setPublicationReady(false);
        setUploadStage('idle');
        setFailedStep(null);
        setUploadProgress(0);
        setPayment(null);
        setPaymentAsset(null);
        setJobId(null);
        if (!selected) return setFileError(null);
        const validation = validateLivepeerSourceFile(selected);
        setFileError(validation.ok ? null : fileValidationMessage(validation.error));
        const draft = accountId ? readLivepeerUploadDraft(accountId, selected) : null;
        setJobId(draft?.jobId || null);
        if (draft) {
            setTitle(draft.title);
            setPrice(draft.price);
        }
    };

    const preparePayment = async () => {
        if (!accountId || !file || fileError || !title.trim() || !rightsAccepted) return;
        setBusy(true);
        setError(null);
        setFailedStep(null);
        setUploadStage('payment');
        setStatus('Checking payment options…');
        try {
            parseLivepeerPriceUsdc(price);
            const activeJobId = jobId || createLivepeerJobId();
            setJobId(activeJobId);
            writeLivepeerUploadDraft(accountId, {
                jobId: activeJobId,
                title: title.trim(),
                price,
                sourceBytes: file.size,
                sourceName: file.name,
                sourceLastModified: file.lastModified,
            });
            const options = await prepareCreatorFeePaymentOptions({
                accountId,
                jobId: activeJobId,
                expectedSourceBytes: file.size,
                gasReserveYocto: configuredCreatorFeeGasReserveYocto(),
            });
            if (!options.selected && !multiAssetPaymentsEnabled) {
                throw new Error('creator_fee_balance_or_gas_insufficient');
            }
            setPayment(options);
            setPaymentAsset(options.selected);
            setUploadStage('payment_ready');
            setStatus(null);
        } catch (reason) {
            setFailedStep(0);
            setError(reason instanceof Error ? reason.message : 'Payment options could not be loaded.');
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
                throw new Error('near_creator_fee_quote_expired');
            }
            const existingJob = await readLivepeerMediaJob(jobId);
            if (existingJob?.status === 'Published') {
                clearLivepeerUploadDraft(accountId);
                setUploaded(true);
                setPublicationReady(true);
                setUploadStage('published');
                setStatus('Publication ready.');
                return;
            }
            setUploadStage('authorization');
            setStatus('Checking upload availability…');
            await preflightLivepeerUpload({
                accountId,
                jobId,
                generation: 1,
                expectedSourceBytes: file.size,
            });
            availabilityConfirmed = true;
            setStatus('Authorizing the paid job…');
            const wallet = await getWallet();
            const conversionExpectation = {
                purpose: { type: 'upload' as const, expected_source_bytes: String(file.size) },
                requiredUsdcMicro: payment.usdcFee,
            };
            const activeCheckout = paymentAsset === 'USDC'
                ? loadActivePaymentCheckout(accountId)
                : null;
            const matchingCheckout = activeCheckout
                && activeCheckout.required_usdc_micro === payment.usdcFee
                && activeCheckout.quote.purpose.type === 'upload'
                && activeCheckout.quote.purpose.expected_source_bytes === String(file.size)
                ? activeCheckout
                : null;
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
            });
            setStatus('Waiting for the payment to finalize…');
            await waitForAuthorizedLivepeerJob(jobId, accountId, uploadPublicKey);
            if (convertedCheckout) {
                updateActivePaymentCheckoutState(accountId, conversionExpectation, 'complete');
                convertedCheckout = false;
            }
            activeStep = 2;
            setUploadStage('upload');
            setUploadProgress(0);
            setStatus('Preparing the Livepeer upload…');
            const intent = await requestLivepeerUploadIntent({
                accountId,
                jobId,
                generation: 1,
                expectedSourceBytes: file.size,
                sourceType: source.sourceType,
            });
            setStatus('Uploading directly to Livepeer…');
            await uploadLivepeerSource(file, intent, {
                onProgress: (sent, total) => setUploadProgress(
                    total > 0 ? Math.min(99, Math.max(0, Math.floor((sent / total) * 100))) : 0,
                ),
            });
            setUploadProgress(100);
            setUploaded(true);
            setUploadStage('processing');
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
                    <AlertTitle>{publicationReady ? 'Publication ready' : 'Upload complete; processing'}</AlertTitle>
                    <AlertDescription>A watch link appears only after the publication exists on NEAR.</AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Publication</CardTitle>
                    <CardDescription>MP4, MOV, AVI, WebM, WMV, MKV or FLV; maximum 20 GB and minimum ticket price 2 USDC.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <Input type="file" accept={LIVEPEER_SOURCE_ACCEPT} disabled={busy || uploaded} onChange={selectFile} />
                    {fileError && <p role="alert" className="text-sm text-red-400">{fileError}</p>}
                    {previewUrl && !fileError && (
                        <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-black">
                            <video
                                aria-label="Selected video cover preview"
                                className="aspect-video w-full object-cover"
                                muted
                                playsInline
                                preload="metadata"
                                src={previewUrl}
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
                            {uploadStage === 'upload' && (
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
                    ) : uploaded ? (
                        <Button className="w-full" disabled><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing</Button>
                    ) : !payment ? (
                        <Button className="w-full" disabled={!formReady || busy} onClick={() => void preparePayment()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Check payment options</Button>
                    ) : (
                        <Button className="w-full" disabled={!formReady || busy || !paymentAsset} onClick={() => void start()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Pay and upload</Button>
                    )}
                    {status && <p role="status" className="text-sm text-zinc-400">{status}</p>}
                    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
                </CardContent>
            </Card>
        </div>
    );
}

async function waitForAuthorizedLivepeerJob(
    jobId: string,
    accountId: string,
    uploadPublicKey: string,
): Promise<void> {
    for (const delay of [0, 1_000, 2_000, 4_000, 8_000]) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        try {
            const job = await readLivepeerMediaJob(jobId);
            if (job
                && job.creator_id === accountId
                && job.upload_public_key === uploadPublicKey) return;
        } catch {
            // Final state can lag briefly after the wallet returns.
        }
    }
    throw new Error('livepeer_job_pending');
}

function formatMicroUsdc(value: string): string {
    const amount = BigInt(value);
    const fraction = (amount % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
    return `${amount / 1_000_000n}.${fraction.padEnd(2, '0')}`;
}

function fileValidationMessage(error: 'empty_file' | 'source_limit_exceeded' | 'unsupported_video_type'): string {
    if (error === 'empty_file') return 'Choose a non-empty video file.';
    if (error === 'source_limit_exceeded') return 'Choose a video file no larger than 20 GB.';
    return 'Choose an MP4, MOV, AVI, WebM, WMV, MKV or FLV video file.';
}

function uploadErrorMessage(reason: unknown, availabilityConfirmed: boolean): string {
    const code = reason instanceof Error ? reason.message : '';
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
    return code || 'Upload failed.';
}

function formatYoctoNear(value: string): string {
    const amount = BigInt(value);
    const fraction = (amount % (10n ** 24n)).toString().padStart(24, '0').replace(/0+$/, '');
    return fraction ? `${amount / (10n ** 24n)}.${fraction}` : String(amount / (10n ** 24n));
}
