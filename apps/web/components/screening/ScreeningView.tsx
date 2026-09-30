'use client';

import React from 'react';
import Link from 'next/link';
import { CoverImage } from '@/components/media/CoverImage';
import { LivepeerPlayer } from '@/components/LivepeerPlayer';
import { MultiAssetPaymentPanel } from '@/components/MultiAssetPaymentPanel';
import { PageShell } from '@/components/PageShell';
import { StateScreen } from '@/components/states/StateScreen';
import { Button } from '@/components/ui/button';
import { StatusLine } from '@/components/ui/status-line';
import { formatPublishedDate } from '@/components/discover/discover-model';
import { useTicketCheckout } from '@/features/checkout/useTicketCheckout';
import { messages } from '@/lib/i18n/messages';
import { livepeerPublicationCoverUrl } from '@/lib/livepeer-publication';
import { loadActivePaymentCheckout, multiAssetPaymentsEnabled } from '@/lib/multi-asset-payments';
import { CoverageSection } from './CoverageSection';
import { GiseBar } from './GiseBar';
import { MoreFromCreator } from './MoreFromCreator';

/** Screening page: stage, ticket scope, more from the creator and the sticky box-office bar. */
export function ScreeningView({ jobId }: { jobId: string }) {
    const checkout = useTicketCheckout(jobId);
    const { locale, accountId, getWallet, publicationQuery, paymentPurpose, busy, clearError, accessView, salesOpen } = checkout;
    const t = messages[locale].watch;
    const discover = messages[locale].discover;
    const [otherAssetRequested, setOtherAssetRequested] = React.useState(false);
    // An unfinished conversion for this screening is always shown so it can be reconciled before any new payment.
    const [activeConversion, setActiveConversion] = React.useState(false);
    React.useEffect(() => {
        if (!accountId) { setActiveConversion(false); return; }
        const active = loadActivePaymentCheckout(accountId);
        setActiveConversion(Boolean(active && active.quote.purpose.type === 'ticket' && active.quote.purpose.publication_id === jobId));
    }, [accountId, jobId]);

    if (publicationQuery.isLoading) {
        return <PageShell><StatusLine tone="progress">{t.verifyingStatus}</StatusLine></PageShell>;
    }
    const publication = publicationQuery.data;
    if (publicationQuery.error || !publication) {
        return (
            <PageShell>
                <StateScreen
                    tone="alert"
                    glyph="?"
                    title={t.unavailableTitle}
                    body={t.unavailableDescription}
                    actions={<Button asChild variant="outline"><Link href="/">{t.backToDiscover}</Link></Button>}
                />
            </PageShell>
        );
    }

    const coverUrl = livepeerPublicationCoverUrl(publication);
    const playable = accessView === 'playable' && accountId;
    // No payment surface while ticket access is unknown (checking or failed to read).
    const showOtherAsset = Boolean(accountId) && accessView === 'locked'
        && (activeConversion || (multiAssetPaymentsEnabled && otherAssetRequested && salesOpen));

    return (
        <div>
            <section className="relative isolate border-b border-line">
                {playable ? (
                    <div id="player" className="bg-black">
                        <div className="container mx-auto px-0 md:px-4">
                            <LivepeerPlayer
                                accountId={accountId}
                                jobId={jobId}
                                generation={publication.generation}
                                playbackId={publication.playback_id}
                                title={publication.title}
                                poster={coverUrl ?? undefined}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="absolute inset-0 -z-10 bg-panel">
                        {coverUrl && <CoverImage publicationId={publication.publication_id} title={publication.title} src={coverUrl} size="stage" priority sizes="100vw" className="h-full" />}
                        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/20" />
                    </div>
                )}
                <div className={playable ? 'container mx-auto px-4 py-8' : 'container mx-auto flex min-h-[56vh] flex-col justify-end px-4 pb-10 pt-24 md:min-h-[520px]'}>
                    <p className="label-caps text-ice">{t.screeningLabel}</p>
                    <h1 className="font-display mt-3 break-words text-6xl leading-[0.86] sm:text-8xl">{publication.title}</h1>
                    <p className="mt-4 text-base text-light-2">
                        <span className="font-bold text-light">{publication.creator_id}</span> · {t.published(formatPublishedDate(publication.published_at_ms, locale))}
                    </p>
                </div>
            </section>

            <div className="container mx-auto flex flex-col gap-14 px-4 py-12">
                {showOtherAsset && accountId && (
                    <section aria-label={t.otherAsset} className="max-w-3xl">
                        <MultiAssetPaymentPanel
                            accountId={accountId}
                            getWallet={getWallet}
                            purpose={paymentPurpose}
                            requiredUsdcMicro={publication.price_usdc}
                            disabled={busy || !salesOpen}
                            onUsdcReady={clearError}
                        />
                    </section>
                )}
                <CoverageSection t={t} />
                <MoreFromCreator creatorId={publication.creator_id} currentId={publication.publication_id} t={{ ...t, salesPaused: discover.salesPaused, unavailable: discover.unavailable }} />
            </div>

            <GiseBar
                checkout={checkout}
                publication={publication}
                otherAssetOpen={showOtherAsset}
                onToggleOtherAsset={activeConversion ? undefined : () => setOtherAssetRequested((value) => !value)}
            />
        </div>
    );
}
