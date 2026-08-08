'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Lock, Video } from 'lucide-react';
import { useWallet } from '@/components/providers/WalletProvider';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/PageShell';
import { ScreenState } from '@/components/ScreenState';
import { LivepeerPlayer } from '@/components/LivepeerPlayer';
import {
    buyLivepeerTicket,
    formatUsdc,
    hasLivepeerEntitlement,
    livepeerPublicationCoverUrl,
    readLivepeerPublication,
} from '@/lib/livepeer-publication';

export function LivepeerWatch({ jobId }: { jobId: string }) {
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
            for (const delay of [1_000, 2_000, 4_000, 8_000]) {
                await new Promise((resolve) => setTimeout(resolve, delay));
                if (await hasLivepeerEntitlement(accountId, jobId)) {
                    await queryClient.invalidateQueries({
                        queryKey: ['livepeerEntitlement', accountId, jobId],
                    });
                    return;
                }
            }
            throw new Error('livepeer_entitlement_pending');
        } catch (reason) {
            setError(purchaseErrorMessage(reason));
        } finally {
            setBusy(false);
        }
    };

    if (publicationQuery.isLoading) {
        return <PageShell className="flex items-center justify-center"><Loader2 role="status" className="h-10 w-10 animate-spin" /></PageShell>;
    }

    const publication = publicationQuery.data;
    if (publicationQuery.error || !publication) {
        return (
            <PageShell className="flex items-center justify-center">
                <ScreenState
                    icon={<Video className="h-7 w-7" />}
                    title="Video unavailable"
                    description="This video may still be processing, or the link may be invalid."
                    actions={<Button asChild variant="outline"><Link href="/discover">Back to discover</Link></Button>}
                />
            </PageShell>
        );
    }

    const canPlay = entitlementQuery.data === true && publication.availability !== 'TAKEDOWN';
    const salesOpen = publication.availability === 'ACTIVE';
    const coverUrl = livepeerPublicationCoverUrl(publication);

    return (
        <PageShell className="max-w-5xl">
            <Link href="/discover" className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
                <ArrowLeft className="h-4 w-4" /> Discover
            </Link>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">{publication.title}</h1>
                    <p className="mt-2 text-sm text-zinc-400">{publication.creator_id}</p>
                </div>
                <p className="text-xl font-bold">{formatUsdc(publication.price_usdc)} USDC</p>
            </div>

            {canPlay && accountId ? (
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
            ) : (
                <div className="relative mx-auto flex aspect-video max-w-3xl items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-center sm:p-8">
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
                        <h2 className="text-lg font-semibold">Ticket required</h2>
                        <p className="mt-2 text-sm text-zinc-300">
                            {publication.availability === 'TAKEDOWN'
                                ? 'This video is unavailable.'
                                : publication.availability === 'SALES_SUSPENDED'
                                    ? 'Ticket sales are paused. Existing ticket holders can still watch.'
                                    : 'Connect your wallet to buy a ticket with USDC.'}
                        </p>
                        {!accountId ? (
                            <Button className="mt-4 sm:mt-6" onClick={() => void connect()} disabled={!isReady}>Connect wallet</Button>
                        ) : (
                            <Button className="mt-4 sm:mt-6" disabled={!salesOpen || busy || entitlementQuery.isLoading} onClick={() => void purchase()}>
                                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Buy ticket · {formatUsdc(publication.price_usdc)} USDC
                            </Button>
                        )}
                        {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
                    </div>
                </div>
            )}
        </PageShell>
    );
}

function purchaseErrorMessage(reason: unknown): string {
    const message = reason instanceof Error ? reason.message : '';
    if (message === 'livepeer_entitlement_pending') {
        return 'Your ticket is still syncing. Try again shortly.';
    }
    if (message === 'livepeer_sales_closed') {
        return 'Ticket sales are paused for this video.';
    }
    return 'The ticket could not be purchased. Check your wallet and try again.';
}
