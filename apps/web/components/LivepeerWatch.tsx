'use client';

import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Lock, Video } from 'lucide-react';
import { useLanguage } from '@/components/providers/LanguageContext';
import { useWallet } from '@/components/providers/WalletProvider';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/PageShell';
import { ScreenState } from '@/components/ScreenState';
import { VideoPlayer } from '@/components/VideoPlayer';
import {
    buyLivepeerTicket,
    hasLivepeerEntitlement,
    readLivepeerPublication,
} from '@/lib/livepeer-publication';

export function LivepeerWatch({ jobId }: { jobId: string }) {
    const { t } = useLanguage();
    const { accountId, connect, getWallet, isReady } = useWallet();
    const queryClient = useQueryClient();
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const publicationQuery = useQuery({
        queryKey: ['livepeerPublication', jobId],
        queryFn: () => readLivepeerPublication(jobId),
        retry: false,
    });
    const entitlementQuery = useQuery({
        queryKey: ['livepeerEntitlement', accountId, jobId],
        queryFn: () => hasLivepeerEntitlement(accountId!, jobId),
        enabled: Boolean(accountId && publicationQuery.data),
        staleTime: 15_000,
    });

    const purchase = async () => {
        const publication = publicationQuery.data;
        if (!accountId || !publication) return;
        setBusy(true);
        setError(null);
        try {
            await buyLivepeerTicket(await getWallet(), accountId, publication);
            let entitled = false;
            for (const delay of [1_000, 2_000, 4_000, 8_000]) {
                await new Promise((resolve) => setTimeout(resolve, delay));
                if (await hasLivepeerEntitlement(accountId, jobId)) {
                    entitled = true;
                    break;
                }
            }
            if (!entitled) throw new Error('livepeer_entitlement_pending');
            await queryClient.invalidateQueries({
                queryKey: ['livepeerEntitlement', accountId, jobId],
            });
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'livepeer_purchase_failed');
        } finally {
            setBusy(false);
        }
    };

    if (publicationQuery.isLoading) {
        return (
            <PageShell className="flex items-center justify-center">
                <Loader2 role="status" className="h-10 w-10 animate-spin text-zinc-500" />
            </PageShell>
        );
    }

    const publication = publicationQuery.data;
    if (publicationQuery.error || !publication) {
        return (
            <PageShell className="flex items-center justify-center">
                <ScreenState
                    icon={<Video className="h-8 w-8" />}
                    title={t.discover_page?.no_videos || 'No Releases Found'}
                    description={t.watch_page.select_video_desc}
                />
            </PageShell>
        );
    }

    const canPlay = entitlementQuery.data === true && publication.availability !== 'TAKEDOWN';
    const salesOpen = publication.availability === 'ACTIVE';

    return (
        <PageShell className="max-w-5xl">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white md:text-3xl">{publication.title}</h1>
                    <p className="mt-2 text-sm text-zinc-400">{publication.creator_id}</p>
                </div>
                <div className="text-right">
                    <p className="text-xs uppercase tracking-wider text-zinc-500">{t.watch_page.price}</p>
                    <p className="text-xl font-bold text-white">{formatUsdc(publication.price_usdc)} USDC</p>
                </div>
            </div>

            {canPlay && accountId ? (
                <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
                    <VideoPlayer livepeer={{
                        accountId,
                        jobId,
                        generation: publication.generation,
                        playbackId: publication.playback_id,
                    }} />
                </div>
            ) : (
                <div className="mx-auto max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center">
                    <Lock className="mx-auto mb-4 h-10 w-10 text-zinc-500" />
                    <h2 className="text-lg font-semibold text-white">{t.watch_page.locked_preview_title}</h2>
                    <p className="mt-2 text-sm text-zinc-400">
                        {publication.availability === 'TAKEDOWN'
                            ? t.watch_page.select_video_desc
                            : t.watch_page.locked_preview_desc}
                    </p>
                    {!accountId ? (
                        <Button className="mt-6" onClick={() => void connect()} disabled={!isReady}>
                            {t.upload_page.connect_wallet}
                        </Button>
                    ) : (
                        <Button
                            className="mt-6"
                            disabled={!salesOpen || busy || entitlementQuery.isLoading}
                            onClick={() => void purchase()}
                        >
                            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t.ticket_purchase.buy_ticket} · {formatUsdc(publication.price_usdc)} USDC
                        </Button>
                    )}
                    {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
                </div>
            )}
        </PageShell>
    );
}

function formatUsdc(value: string): string {
    const amount = BigInt(value);
    const whole = amount / 1_000_000n;
    const fraction = (amount % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole.toString();
}
