'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Loader2, Lock, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/PageShell';
import { ScreenState } from '@/components/ScreenState';
import { LivepeerPlayer } from '@/components/LivepeerPlayer';
import { MultiAssetPaymentPanel } from '@/components/MultiAssetPaymentPanel';
import { useTicketCheckout } from '@/features/checkout/useTicketCheckout';
import { FEATURE_FLAGS } from '@/lib/constants';
import { messages } from '@/lib/i18n/messages';
import { playerCopy } from '@/lib/player-copy';
import { formatUsdc, livepeerPublicationCoverUrl } from '@/lib/livepeer-publication';

export function LivepeerWatch({ jobId }: { jobId: string }) {
    const {
        locale,
        accountId,
        connect,
        getWallet,
        isReady,
        publicationQuery,
        entitlementQuery,
        paymentPurpose,
        busy,
        error,
        clearError,
        purchase,
        accessView,
        salesOpen,
    } = useTicketCheckout(jobId);
    const copy = playerCopy[locale];
    const t = messages[locale].watch;

    if (publicationQuery.isLoading) {
        return <PageShell className="flex items-center justify-center"><Loader2 role="status" className="h-10 w-10 animate-spin" /></PageShell>;
    }

    const publication = publicationQuery.data;
    if (publicationQuery.error || !publication) {
        return (
            <PageShell className="flex items-center justify-center">
                <ScreenState
                    icon={<Video className="h-7 w-7" />}
                    title={t.unavailableTitle}
                    description={t.unavailableDescription}
                    actions={<Button asChild variant="outline"><Link href="/discover">{t.backToDiscover}</Link></Button>}
                />
            </PageShell>
        );
    }

    const coverUrl = livepeerPublicationCoverUrl(publication);

    return (
        <PageShell className="max-w-5xl">
            <Link href="/discover" className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
                <ArrowLeft className="h-4 w-4" /> {t.discover}
            </Link>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">{publication.title}</h1>
                    <p className="mt-2 text-sm text-zinc-400">{publication.creator_id}</p>
                </div>
                <p className="text-xl font-bold">{formatUsdc(publication.price_usdc)} USDC</p>
            </div>

            {accessView === 'playable' && accountId ? (
                <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-black">
                    <LivepeerPlayer
                        accountId={accountId}
                        jobId={jobId}
                        generation={publication.generation}
                        playbackId={publication.playback_id}
                        title={publication.title}
                        poster={coverUrl ?? undefined}
                    />
                </div>
            ) : accessView === 'checking' || accessView === 'access_error' ? (
                <div lang={locale} className="flex min-h-48 flex-col items-center justify-center gap-4 rounded-2xl border border-zinc-800 bg-black p-6 text-center">
                    {accessView === 'access_error' ? <>
                        <p role="alert" className="text-sm text-zinc-300">{copy.accessError}</p>
                        <Button disabled={entitlementQuery.isFetching} onClick={() => void entitlementQuery.refetch()}>{copy.checkAgain}</Button>
                    </> : <p role="status" className="flex items-center gap-3 text-sm"><Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" />{copy.checking}</p>}
                </div>
            ) : (
                <div className="mx-auto max-w-3xl space-y-4">
                    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-center sm:p-8">
                        {coverUrl && (
                            <Image
                                fill
                                priority
                                unoptimized
                                src={coverUrl}
                                alt=""
                                sizes="(min-width: 768px) 768px, 100vw"
                                className="object-cover"
                                onError={(event) => { event.currentTarget.hidden = true; }}
                            />
                        )}
                        <div aria-hidden="true" className="absolute inset-0 bg-black/70" />
                        <div className="relative max-w-lg">
                            <Lock className="mx-auto mb-3 h-8 w-8 text-zinc-300 sm:mb-4 sm:h-10 sm:w-10" />
                            <h2 className="text-lg font-semibold">{t.ticketRequired}</h2>
                            <p className="mt-2 text-sm text-zinc-300">
                                {publication.availability === 'TAKEDOWN'
                                    ? t.takedown
                                    : publication.availability === 'SALES_SUSPENDED'
                                        ? t.salesPaused
                                        : t.connectToBuy}
                            </p>
                            {!accountId ? (
                                <Button className="mt-4 sm:mt-6" onClick={() => void connect()} disabled={!isReady}>{t.connectWallet}</Button>
                            ) : (
                                <>
                                    <Button className="mt-4 sm:mt-6" disabled={!salesOpen || busy || entitlementQuery.isLoading} onClick={() => void purchase()}>
                                        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        {t.pay(formatUsdc(publication.price_usdc))}
                                    </Button>
                                    {!FEATURE_FLAGS.enablePlaybackAuthorizerV2 && (
                                        <p className="mt-2 text-xs text-zinc-400">{t.playbackKeyNote}</p>
                                    )}
                                </>
                            )}
                            {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
                        </div>
                    </div>
                    {accountId && (
                        <MultiAssetPaymentPanel
                            accountId={accountId}
                            getWallet={getWallet}
                            purpose={paymentPurpose}
                            requiredUsdcMicro={publication.price_usdc}
                            disabled={busy || !salesOpen}
                            onUsdcReady={clearError}
                        />
                    )}
                </div>
            )}
        </PageShell>
    );
}
