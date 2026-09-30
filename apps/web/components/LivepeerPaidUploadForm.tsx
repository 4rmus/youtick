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
    formatMicroUsdc,
    formatYoctoNear,
    sourceSizeLimitLabel,
} from '@/features/upload/upload-job';
import { useUploadJob } from '@/features/upload/useUploadJob';
import { useMessages } from '@/lib/i18n/I18nProvider';
import { messages } from '@/lib/i18n/messages';

export { getLivepeerPublicationView, uploadErrorMessage } from '@/features/upload/upload-job';

export function LivepeerPaidUploadForm() {
    const {
        locale,
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
    const t = messages[locale].upload;

    return (
        <div className="mx-auto max-w-3xl space-y-6">
            <div>
                <p className="text-sm font-medium text-emerald-300">{t.eyebrow}</p>
                <h1 className="mt-2 text-3xl font-semibold">{t.title}</h1>
                <p className="mt-2 text-zinc-400">{t.description}</p>
            </div>

            {!jobId && accountId && trackedUpload?.accountId === accountId && (
                <LivepeerUploadStatus accountId={accountId} jobId={trackedUpload.jobId} />
            )}
            {jobId && (
                <Link className="text-sm underline" href={`/upload?job=${encodeURIComponent(jobId)}`}>
                    {t.statusLink}
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
                    <CardTitle>{t.cardTitle}</CardTitle>
                    <CardDescription>{t.cardDescription(sourceSizeLimitLabel())}</CardDescription>
                    {FEATURE_FLAGS.publicTestnetVideoV1 && <p className="text-sm text-zinc-400">{t.testTokensBefore}<a className="underline" href="/terms#test-tokens" target="_blank" rel="noreferrer">{t.testTokensLink}</a>{t.testTokensAfter}</p>}
                </CardHeader>
                <CardContent className="space-y-5">
                    <Input type="file" accept={LIVEPEER_SOURCE_ACCEPT} disabled={busy || (uploaded && !publicationExpired)} onChange={selectFile} />
                    {fileError && <p role="alert" className="text-sm text-red-400">{fileError}</p>}
                    {file && !fileError && (
                        <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-black">
                            <video
                                ref={previewRef}
                                aria-label={t.coverPreviewLabel}
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
                            <span className="absolute bottom-3 left-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white">{t.coverPreview}</span>
                        </div>
                    )}
                    <Input aria-label={t.titleLabel} placeholder={t.titleLabel} maxLength={200} value={title} disabled={busy || uploaded || resumeAvailable} onChange={(event) => setTitle(event.target.value)} />
                    <Input aria-label={t.priceLabel} type="number" min="2" step="0.000001" value={price} disabled={busy || uploaded || resumeAvailable} onChange={(event) => setPrice(event.target.value)} />
                    <label className="flex items-start gap-3 text-sm">
                        <input type="checkbox" checked={rightsAccepted} disabled={busy || uploaded || resumeAvailable} onChange={(event) => setRightsAccepted(event.target.checked)} />
                        <span>{t.rights}</span>
                    </label>

                    {uploadFeeUsdc && <p className="text-sm">{t.fee(formatMicroUsdc(uploadFeeUsdc))}</p>}
                    {payment && (
                        <div className="space-y-2 text-sm">
                            {payment.usable.map((asset) => (
                                <label key={asset} className="flex items-center gap-2">
                                    <input type="radio" name="creator-fee" checked={paymentAsset === asset} disabled={busy} onChange={() => setPaymentAsset(asset)} />
                                    <span>{asset === 'USDC' ? t.usdcOption(formatMicroUsdc(payment.usdcFee)) : t.nearOption(formatYoctoNear(payment.nearQuote!.quote.fee_near_yocto))}</span>
                                </label>
                            ))}
                            {FEATURE_FLAGS.enableLivepeerNearCreatorFee && !payment.nearQuote && <p className="text-xs text-zinc-400">{t.nearUnavailable}</p>}
                            {sponsorQuote && (
                                <p role="status" className="text-xs text-emerald-300">
                                    {t.sponsorTotal(formatMicroUsdc(sponsorQuote.uploadFeeUsdc), formatMicroUsdc(sponsorQuote.sponsorFeeUsdc), formatMicroUsdc(sponsorQuote.totalFeeUsdc))}
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
                            <ol aria-label={t.progressLabel} className="grid gap-3 sm:grid-cols-5">
                                {t.steps.map((label, index) => {
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
                                        <span>{t.uploading}</span>
                                        <span>{uploadProgress}%</span>
                                    </div>
                                    <progress
                                        aria-label={t.uploadProgressLabel}
                                        className="h-2 w-full accent-emerald-400"
                                        max={100}
                                        value={uploadProgress}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {!accountId ? (
                        <Button onClick={() => void connect()} disabled={!isReady}>{t.connectWallet}</Button>
                    ) : publicationReady && jobId ? (
                        <Button asChild className="w-full"><Link href={`/watch?job=${encodeURIComponent(jobId)}`}>{t.openPublication}</Link></Button>
                    ) : publicationExpired ? (
                        <Button className="w-full" disabled>{t.deadlinePassed}</Button>
                    ) : resumeAvailable ? (
                        <div className="space-y-2">
                            <Button className="w-full" disabled={busy} onClick={() => void resume()}>
                                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {t.resume}
                            </Button>
                            <p className="text-xs text-zinc-400">{t.resumeNote}</p>
                        </div>
                    ) : uploaded ? (
                        <Button className="w-full" disabled>
                            {publicationView.pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {publicationView.buttonLabel}
                        </Button>
                    ) : !payment ? (
                        <Button className="w-full" disabled={!formReady || busy} onClick={() => void preparePayment()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {t.checkPayment}</Button>
                    ) : (
                        <Button className="w-full" disabled={!formReady || busy || !paymentAsset} onClick={() => void start()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} {t.payAndUpload}</Button>
                    )}
                    {accountId && jobId && uploadStage === 'authorized' && (
                        <div className="space-y-2">
                            <Button className="w-full" variant="destructive" disabled={busy} onClick={() => void cancel()}>
                                {t.cancelJob}
                            </Button>
                            <p className="text-xs text-zinc-400">{t.cancelNote}</p>
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
    const upload = useMessages().upload;
    const t = upload.saved;
    const { statusLink, openPublication } = upload;
    const expiredMessage = upload.publication.expiredMessage;
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
                <CardTitle>{t.title}</CardTitle>
                <CardDescription role="status" aria-live="polite">
                    {query.isError ? t.unverified
                        : !progress ? t.checking
                            : progress.publication ? t.ready
                                : progress.expired ? expiredMessage
                                    : t.pending}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {progress?.publication ? (
                    <Button asChild><Link href={`/watch?job=${encodeURIComponent(jobId)}`}>{openPublication}</Link></Button>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        {progress && !progress.expired && t.detailsUnavailable}
                        {t.noNewPayment}
                    </p>
                )}
                <Link className="text-sm underline" href={`/upload?job=${encodeURIComponent(jobId)}`}>
                    {statusLink}
                </Link>
            </CardContent>
        </Card>
    );
}
