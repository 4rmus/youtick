'use client';

import Link from 'next/link';
import { Loader2, Upload } from 'lucide-react';
import { MultiAssetPaymentPanel } from '@/components/MultiAssetPaymentPanel';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { StatusLine } from '@/components/ui/status-line';
import { Steps, type Step } from '@/components/ui/steps';
import { formatMicroUsdc, formatYoctoNear, sourceSizeLimitLabel } from '@/features/upload/upload-job';
import { useUploadJob } from '@/features/upload/useUploadJob';
import { FEATURE_FLAGS } from '@/lib/constants';
import { messages } from '@/lib/i18n/messages';
import { LIVEPEER_SOURCE_ACCEPT } from '@/lib/livepeer-upload';
import { playerTime } from '@/lib/player-copy';
import { SavedUploadStatus } from './SavedUploadStatus';
import { ShareScreening } from './ShareScreening';
import { feeBreakdown, priceValid, timelineIndex, timelineStates, titleValid, wizardSteps } from './wizard-model';

/**
 * /studio/new. All state and actions come from useUploadJob (G3); this component only presents them.
 * useUploadJob must stay the first hook here: existing tests observe the React.useState order.
 */
export function NewScreeningWizard() {
    const job = useUploadJob();
    const {
        locale, accountId, connect, getWallet, isReady, file, fileError, title, setTitle, price, setPrice,
        rightsAccepted, setRightsAccepted, jobId, trackedUpload, error, busy, resumeAvailable, uploadStage,
        uploadProgress, previewRef, payment, paymentAsset, setPaymentAsset, sponsorQuote, publicationView,
        providerState, jobStatus, publicationReady, publicationExpired, uploaded, displayedStatus, stepStates,
        transfer, uploadFeeUsdc, formReady, selectFile, preparePayment, start, resume, cancel,
    } = job;
    const t = messages[locale].wizard;
    const u = messages[locale].upload;
    const fileReady = Boolean(file && !fileError);
    const titleOk = titleValid(title);
    const priceOk = priceValid(price);
    const locked = busy || uploaded || resumeAvailable;
    const wizard = wizardSteps({ fileReady, fileFailed: Boolean(fileError), detailsReady: fileReady && titleOk && priceOk && rightsAccepted, uploadSteps: stepStates, expired: publicationExpired });
    const steps: Step[] = t.steps.map((label, index) => ({ label, state: wizard[index] }));
    const timeline = timelineStates(timelineIndex({ providerState, jobStatus, published: publicationReady }), publicationView.failed);
    const fee = file && uploadFeeUsdc ? feeBreakdown(file.size, uploadFeeUsdc) : null;

    return (
        <div className="container mx-auto grid min-h-[calc(100vh-4rem)] gap-10 px-4 py-12 md:grid-cols-[280px_minmax(0,1fr)] md:py-16">
            <aside className="flex flex-col gap-6 md:sticky md:top-24 md:self-start">
                <h1 className="font-display text-5xl md:text-6xl">{t.title}</h1>
                <Steps label={t.stepsLabel} steps={steps} />
                {jobId && (
                    <Link className="text-sm underline underline-offset-4 hover:text-ice" href={`/studio/new?job=${encodeURIComponent(jobId)}`}>{u.statusLink}</Link>
                )}
            </aside>

            <div className="flex min-w-0 flex-col gap-10">
                {!jobId && accountId && trackedUpload?.accountId === accountId && (
                    <SavedUploadStatus accountId={accountId} jobId={trackedUpload.jobId} />
                )}

                <Section index={1} title={t.steps[0]}>
                    <p className="text-sm text-light-3">{t.fileHint(sourceSizeLimitLabel())}</p>
                    <input
                        type="file"
                        aria-label={t.steps[0]}
                        accept={LIVEPEER_SOURCE_ACCEPT}
                        disabled={busy || (uploaded && !publicationExpired)}
                        onChange={selectFile}
                        className="min-h-12 w-full rounded-xs border border-edge bg-panel px-3 py-2 text-sm file:mr-4 file:border-0 file:bg-raised file:px-3 file:py-2 file:text-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ice"
                    />
                    {file && !fileError && <p className="text-[13px] text-light-3">{t.fileSize((file.size / 1_000_000_000).toFixed(2))}</p>}
                    {fileError && <StatusLine tone="error">{fileError}</StatusLine>}
                    {file && !fileError && (
                        <div className="relative overflow-hidden border border-line bg-black">
                            <video
                                ref={previewRef}
                                aria-label={u.coverPreviewLabel}
                                className="aspect-video w-full object-cover"
                                muted
                                playsInline
                                preload="metadata"
                                onLoadedMetadata={(event) => {
                                    const video = event.currentTarget;
                                    if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(1, video.duration / 2);
                                }}
                            />
                            <span className="absolute bottom-3 left-3 bg-ink/80 px-3 py-1 text-xs text-light">{u.coverPreview}</span>
                        </div>
                    )}
                </Section>

                <Section index={2} title={t.steps[1]}>
                    <Field id="wizard-title" label={u.titleLabel} maxLength={200} value={title} disabled={locked}
                        hint={t.titleHint} error={title && !titleOk ? t.titleInvalid : undefined}
                        onChange={(event) => setTitle(event.target.value)} />
                    <Field id="wizard-price" label={u.priceLabel} type="number" min="2" step="0.000001" inputMode="decimal"
                        numeric suffix="USDC" value={price} disabled={locked}
                        hint={t.priceHint} error={price && !priceOk ? t.priceInvalid : undefined}
                        onChange={(event) => setPrice(event.target.value)} />
                    <label className="flex min-h-11 items-start gap-3 text-sm text-light-2">
                        <input type="checkbox" className="mt-1 h-4 w-4 accent-ice" checked={rightsAccepted} disabled={locked} onChange={(event) => setRightsAccepted(event.target.checked)} />
                        <span>{u.rights}</span>
                    </label>
                </Section>

                <Section index={3} title={t.steps[2]}>
                    {FEATURE_FLAGS.publicTestnetVideoV1 && (
                        <p className="text-sm text-light-3">{u.testTokensBefore}<a className="underline underline-offset-4" href="/terms#test-tokens" target="_blank" rel="noreferrer">{u.testTokensLink}</a>{u.testTokensAfter}</p>
                    )}
                    {fee && (
                        <dl className="flex flex-col border-t border-line text-sm">
                            <Row term={t.feeRate(fee.gigabytes)} value={`${formatMicroUsdc(fee.byteFeeMicro)} USDC`} />
                            {fee.minimumApplied && <Row term={t.feeMinimum} value="0.50 USDC" />}
                            <Row term={t.feeUpload} value={`${formatMicroUsdc(fee.uploadFeeMicro)} USDC`} strong={!sponsorQuote} />
                            {sponsorQuote && <Row term={t.feeSponsor} value={`${formatMicroUsdc(sponsorQuote.sponsorFeeUsdc)} USDC`} />}
                            {sponsorQuote && <Row term={t.feeTotal} value={`${formatMicroUsdc(sponsorQuote.totalFeeUsdc)} USDC`} strong />}
                        </dl>
                    )}
                    <p className="text-[13px] text-light-3">{t.feeSeparate}</p>
                    {payment && (
                        <fieldset className="flex flex-col gap-2 text-sm">
                            {payment.usable.map((asset) => (
                                <label key={asset} className="flex min-h-11 items-center gap-3">
                                    <input type="radio" name="creator-fee" className="h-4 w-4 accent-ice" checked={paymentAsset === asset} disabled={busy} onChange={() => setPaymentAsset(asset)} />
                                    <span>{asset === 'USDC' ? u.usdcOption(formatMicroUsdc(payment.usdcFee)) : u.nearOption(formatYoctoNear(payment.nearQuote!.quote.fee_near_yocto))}</span>
                                </label>
                            ))}
                            {FEATURE_FLAGS.enableLivepeerNearCreatorFee && !payment.nearQuote && <p className="text-xs text-light-3">{u.nearUnavailable}</p>}
                            {sponsorQuote && (
                                <StatusLine>{u.sponsorTotal(formatMicroUsdc(sponsorQuote.uploadFeeUsdc), formatMicroUsdc(sponsorQuote.sponsorFeeUsdc), formatMicroUsdc(sponsorQuote.totalFeeUsdc))}</StatusLine>
                            )}
                        </fieldset>
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
                    <div className="flex flex-col gap-2">
                        {!accountId ? (
                            <Button size="lg" onClick={() => void connect()} disabled={!isReady}>{u.connectWallet}</Button>
                        ) : publicationReady || publicationExpired ? null : resumeAvailable ? (
                            <>
                                <Button size="lg" disabled={busy} onClick={() => void resume()}>{busy && <Loader2 className="animate-spin" />} {u.resume}</Button>
                                <p className="text-xs text-light-3">{u.resumeNote}</p>
                            </>
                        ) : uploaded ? null : !payment ? (
                            <Button size="lg" disabled={!formReady || !titleOk || !priceOk || busy} onClick={() => void preparePayment()}>{busy && <Loader2 className="animate-spin" />} {u.checkPayment}</Button>
                        ) : (
                            <Button size="lg" disabled={!formReady || !titleOk || !priceOk || busy || !paymentAsset} onClick={() => void start()}>{busy ? <Loader2 className="animate-spin" /> : <Upload />} {u.payAndUpload}</Button>
                        )}
                    </div>
                </Section>

                <Section index={4} title={t.steps[3]}>
                    {uploadStage === 'uploading' && (
                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between text-sm text-light-2"><span>{u.uploading}</span><span className="tabular">{uploadProgress}%</span></div>
                            <progress aria-label={u.uploadProgressLabel} className="h-2 w-full accent-ice" max={100} value={uploadProgress} />
                            {transfer.bytesPerSecond !== null && transfer.remainingSeconds !== null && (
                                <p className="text-[13px] text-light-3">{t.transfer((transfer.bytesPerSecond / 1_000_000).toFixed(1), playerTime(transfer.remainingSeconds))}</p>
                            )}
                        </div>
                    )}
                    {accountId && jobId && uploadStage === 'authorized' && (
                        <div className="flex flex-col gap-2">
                            <Button variant="destructive" className="self-start" disabled={busy} onClick={() => void cancel()}>{u.cancelJob}</Button>
                            <p className="text-xs text-light-3">{u.cancelNote}</p>
                        </div>
                    )}
                    {displayedStatus && <StatusLine tone={busy ? 'progress' : 'neutral'}>{displayedStatus}</StatusLine>}
                    {error && <StatusLine tone="error">{error}</StatusLine>}
                </Section>

                <Section index={5} title={t.steps[4]}>
                    {uploaded ? (
                        <>
                            <Steps label={t.timelineTitle} steps={t.timeline.map((label, index) => ({ label, state: timeline[index] }))} />
                            <StatusLine tone={publicationView.failed ? 'error' : publicationReady ? 'success' : 'progress'}>
                                <strong className="font-semibold">{publicationView.title}.</strong> {publicationView.message}
                            </StatusLine>
                            {!publicationReady && !publicationView.failed && <p className="text-[13px] text-light-3">{t.canLeave}</p>}
                            {publicationReady && jobId && (
                                <div className="flex flex-col gap-4">
                                    <Button asChild size="lg" className="self-start"><Link href={`/s/${encodeURIComponent(jobId)}`}>{t.openScreening}</Link></Button>
                                    <ShareScreening jobId={jobId} t={t} />
                                </div>
                            )}
                        </>
                    ) : <p className="text-sm text-light-3">{t.canLeave}</p>}
                </Section>
            </div>
        </div>
    );
}

function Section({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
    return (
        <section aria-labelledby={`wizard-step-${index}`} className="flex flex-col gap-4 border-t border-line pt-6">
            <h2 id={`wizard-step-${index}`} className="font-display text-3xl"><span className="tabular mr-3 text-light-3">{index}</span>{title}</h2>
            {children}
        </section>
    );
}

function Row({ term, value, strong = false }: { term: string; value: string; strong?: boolean }) {
    return (
        <div className="flex justify-between gap-4 border-b border-line py-2.5">
            <dt className="text-light-3">{term}</dt>
            <dd className={strong ? 'tabular text-lg' : 'tabular'}>{value}</dd>
        </div>
    );
}
