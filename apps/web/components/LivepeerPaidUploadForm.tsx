'use client';

import Link from 'next/link';
import { CheckCircle2, Loader2, Upload } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MultiAssetPaymentPanel } from '@/components/MultiAssetPaymentPanel';
import { FEATURE_FLAGS } from '@/lib/constants';
import { publicationPollIntervalMs } from '@/lib/livepeer-upload-state';
import { readLivepeerUploadProgress } from '@/lib/livepeer-publication';
import { LIVEPEER_SOURCE_ACCEPT, rememberLivepeerUploadJob } from '@/lib/livepeer-upload';
import {
    UPLOAD_EXPIRED_MESSAGE,
    UPLOAD_STEPS,
    formatMicroUsdc,
    formatYoctoNear,
    sourceSizeLimitLabel,
} from '@/features/upload/upload-job';
import { useUploadJob } from '@/features/upload/useUploadJob';

export { getLivepeerPublicationView, uploadErrorMessage } from '@/features/upload/upload-job';

export function LivepeerPaidUploadForm() {
    const {
        accountId,
        connect,
        getWallet,
        isReady,
        file,
        fileError,
        title,
        setTitle,
        price,
        setPrice,
        rightsAccepted,
        setRightsAccepted,
        jobId,
        trackedUpload,
        error,
        busy,
        resumeAvailable,
        uploadStage,
        uploadProgress,
        previewRef,
        payment,
        paymentAsset,
        setPaymentAsset,
        sponsorQuote,
        publicationView,
        publicationReady,
        publicationExpired,
        uploaded,
        displayedStatus,
        stepStates,
        uploadFeeUsdc,
        formReady,
        selectFile,
        preparePayment,
        start,
        resume,
        cancel,
    } = useUploadJob();

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div>
                <p className="text-sm font-medium text-emerald-300">Livepeer paid media</p>
                <h1 className="mt-2 text-3xl font-semibold">Publish a video</h1>
                <p className="mt-2 text-zinc-400">The browser sends the source directly to Livepeer. NEAR records payment and publication state.</p>
            </div>

            {!jobId && accountId && trackedUpload?.accountId === accountId && (
                <LivepeerUploadStatus accountId={accountId} jobId={trackedUpload.jobId} />
            )}
            {jobId && (
                <Link className="text-sm underline" href={`/upload?job=${encodeURIComponent(jobId)}`}>
                    Upload status link — bookmark to return later
                </Link>
            )}
            {uploaded && (
                <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>{publicationView.title}</AlertTitle>
                    <AlertDescription>{publicationView.message}</AlertDescription>
                </Alert>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>Publication</CardTitle>
                    <CardDescription>MP4, MOV, AVI, WebM, WMV, MKV or FLV; maximum {sourceSizeLimitLabel()} and minimum ticket price 2 USDC.</CardDescription>
                    {FEATURE_FLAGS.publicTestnetVideoV1 && <p className="text-sm text-zinc-400">Use free test USDC for uploads and tickets, and test NEAR for network fees. <a className="underline" href="/terms#test-tokens" target="_blank" rel="noreferrer">Get test tokens</a>, then check payment options again.</p>}
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
                    <Input aria-label="Title" placeholder="Title" maxLength={200} value={title} disabled={busy || uploaded || resumeAvailable} onChange={(event) => setTitle(event.target.value)} />
                    <Input aria-label="Ticket price in USDC" type="number" min="2" step="0.000001" value={price} disabled={busy || uploaded || resumeAvailable} onChange={(event) => setPrice(event.target.value)} />
                    <label className="flex items-start gap-3 text-sm">
                        <input type="checkbox" checked={rightsAccepted} disabled={busy || uploaded || resumeAvailable} onChange={(event) => setRightsAccepted(event.target.checked)} />
                        <span>I own the rights required to publish this video.</span>
                    </label>

                    {uploadFeeUsdc && <p className="text-sm">Creator upload fee: {formatMicroUsdc(uploadFeeUsdc)} USDC (minimum 0.50)</p>}
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
                            requiredUsdcMicro={uploadFeeUsdc!}
                            disabled={busy}
                            onUsdcReady={() => void preparePayment()}
                        />
                    )}

                    {file && !fileError && (
                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                            <ol aria-label="Publication progress" className="grid gap-3 sm:grid-cols-5">
                                {UPLOAD_STEPS.map((label, index) => {
                                    const failed = stepStates[index] === 'failed';
                                    const complete = stepStates[index] === 'complete';
                                    const active = stepStates[index] === 'active';
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
                    ) : resumeAvailable ? (
                        <div className="space-y-2">
                            <Button className="w-full" disabled={busy} onClick={() => void resume()}>
                                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Resume / check existing upload
                            </Button>
                            <p className="text-xs text-zinc-400">Use the same file. A wallet approval and NEAR network fee may be needed; your upload payment is not charged again.</p>
                        </div>
                    ) : uploaded ? (
                        <Button className="w-full" disabled>
                            {publicationView.pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {publicationView.buttonLabel}
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
                    {displayedStatus && <p role="status" className="text-sm text-zinc-400">{displayedStatus}</p>}
                    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
                </CardContent>
            </Card>
        </div>
    );
}

export function LivepeerUploadStatus({ accountId, jobId }: { accountId: string; jobId: string }) {
    const query = useQuery({
        queryKey: ['livepeerSavedUpload', accountId, jobId],
        queryFn: async () => {
            const progress = await readLivepeerUploadProgress(jobId, accountId);
            rememberLivepeerUploadJob(accountId, jobId);
            return progress;
        },
        retry: false,
        refetchInterval: (query) => query.state.status === 'success' && query.state.data?.publication
            ? false
            : publicationPollIntervalMs(query.state.dataUpdateCount + query.state.fetchFailureCount),
        refetchIntervalInBackground: false,
    });
    const progress = query.isError ? undefined : query.data;
    return (
        <Card>
            <CardHeader>
                <CardTitle>Your upload</CardTitle>
                <CardDescription role="status" aria-live="polite">
                    {query.isError ? 'This upload could not be verified for this account.'
                        : !progress ? 'Checking upload status…'
                            : progress.publication ? 'Publication ready.'
                                : progress.expired ? UPLOAD_EXPIRED_MESSAGE
                                    : 'Payment confirmed. Publication is still pending.'}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {progress?.publication ? (
                    <Button asChild><Link href={`/watch?job=${encodeURIComponent(jobId)}`}>Open publication</Link></Button>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        {progress && !progress.expired && 'Livepeer processing details are unavailable in this view. '}
                        No new payment or upload has been started.
                    </p>
                )}
                <Link className="text-sm underline" href={`/upload?job=${encodeURIComponent(jobId)}`}>
                    Upload status link — bookmark to return later
                </Link>
            </CardContent>
        </Card>
    );
}
