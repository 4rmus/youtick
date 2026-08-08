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
import { MultiAssetPaymentPanel } from '@/components/MultiAssetPaymentPanel';
import {
    buyLivepeerTicket,
    formatUsdc,
    hasLivepeerEntitlement,
    livepeerPublicationCoverUrl,
    readLivepeerPublication,
} from '@/lib/livepeer-publication';
import {
    loadActivePaymentCheckout,
    updateActivePaymentCheckoutState,
    verifyConvertedUsdcReady,
    type PaymentPurpose,
} from '@/lib/multi-asset-payments';

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
    const paymentPurpose = React.useMemo(() => ({
        type: 'ticket' as const,
        publication_id: jobId,
    }), [jobId]);

    const purchase = async () => {
        const publication = publicationQuery.data;
        if (!accountId || !publication) return;
        setBusy(true);
        setError(null);
        let convertedCheckout = false;
        let conversionExpectation: {
            purpose: PaymentPurpose;
            requiredUsdcMicro: string;
        } | null = null;
        try {
            const current = await readLivepeerPublication(jobId);
            if (!current || current.availability !== 'ACTIVE') throw new Error('livepeer_sales_closed');
            if (current.price_usdc !== publication.price_usdc) {
                queryClient.setQueryData(['livepeerPublication', jobId], current);
                throw new Error('payment_amount_changed');
            }
            const activeCheckout = loadActivePaymentCheckout(accountId);
            const matchingCheckout = activeCheckout
                && activeCheckout.quote.purpose.type === 'ticket'
                && activeCheckout.quote.purpose.publication_id === jobId
                ? activeCheckout
                : null;
            if (matchingCheckout?.state === 'usdc_final') {
                const ready = await verifyConvertedUsdcReady({
                    accountId,
                    requiredUsdcMicro: current.price_usdc,
                    status: 'SUCCESS',
                });
                if (!ready) throw new Error('payment_converted_usdc_not_ready');
                conversionExpectation = {
                    purpose: paymentPurpose,
                    requiredUsdcMicro: matchingCheckout.required_usdc_micro,
                };
                convertedCheckout = updateActivePaymentCheckoutState(
                    accountId,
                    conversionExpectation,
                    'core_pending',
                ) !== null;
            } else if (matchingCheckout?.state === 'core_pending') {
                conversionExpectation = {
                    purpose: paymentPurpose,
                    requiredUsdcMicro: matchingCheckout.required_usdc_micro,
                };
                convertedCheckout = true;
                if (await waitForLivepeerEntitlement(accountId, jobId)) {
                    await queryClient.invalidateQueries({
                        queryKey: ['livepeerEntitlement', accountId, jobId],
                    });
                    updateActivePaymentCheckoutState(
                        accountId,
                        conversionExpectation,
                        'complete',
                    );
                    return;
                }
                await recoverRefundedTicketPayment(
                    accountId,
                    conversionExpectation.requiredUsdcMicro,
                    conversionExpectation,
                );
            }
            await buyLivepeerTicket(await getWallet(), accountId, current);
            if (await waitForLivepeerEntitlement(accountId, jobId)) {
                await queryClient.invalidateQueries({
                    queryKey: ['livepeerEntitlement', accountId, jobId],
                });
                if (convertedCheckout && conversionExpectation) {
                    updateActivePaymentCheckoutState(
                        accountId,
                        conversionExpectation,
                        'complete',
                    );
                }
                return;
            }
            if (convertedCheckout && conversionExpectation) {
                await recoverRefundedTicketPayment(
                    accountId,
                    current.price_usdc,
                    conversionExpectation,
                );
            }
            throw new Error('livepeer_entitlement_pending');
        } catch (reason) {
            if (convertedCheckout
                && conversionExpectation
                && !(reason instanceof Error && reason.message === 'livepeer_entitlement_pending')) {
                updateActivePaymentCheckoutState(
                    accountId,
                    conversionExpectation,
                    'usdc_final',
                );
            }
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
                                <>
                                    <Button className="mt-4 sm:mt-6" disabled={!salesOpen || busy || entitlementQuery.isLoading} onClick={() => void purchase()}>
                                        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Pay {formatUsdc(publication.price_usdc)} USDC · 1 payment approval
                                    </Button>
                                    <p className="mt-2 text-xs text-zinc-400">Your wallet may request one-time playback-key setup if it was not prepared when you connected.</p>
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
                            onUsdcReady={() => setError(null)}
                        />
                    )}
                </div>
            )}
        </PageShell>
    );
}

async function waitForLivepeerEntitlement(accountId: string, jobId: string): Promise<boolean> {
    for (const delay of [1_000, 2_000, 4_000, 8_000]) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (await hasLivepeerEntitlement(accountId, jobId).catch(() => false)) return true;
    }
    return false;
}

async function recoverRefundedTicketPayment(
    accountId: string,
    requiredUsdcMicro: string,
    expectation: { purpose: PaymentPurpose; requiredUsdcMicro: string },
): Promise<never> {
    const refunded = await verifyConvertedUsdcReady({
        accountId,
        requiredUsdcMicro,
        status: 'SUCCESS',
    }).catch(() => false);
    if (refunded) {
        updateActivePaymentCheckoutState(accountId, expectation, 'usdc_final');
        throw new Error('livepeer_ticket_payment_refunded');
    }
    throw new Error('livepeer_entitlement_pending');
}

function purchaseErrorMessage(reason: unknown): string {
    const message = reason instanceof Error ? reason.message : '';
    if (message === 'livepeer_entitlement_pending') {
        return 'Your ticket is still syncing. Try again shortly.';
    }
    if (message === 'livepeer_sales_closed') {
        return 'Ticket sales are paused for this video.';
    }
    if (message === 'payment_amount_changed') {
        return 'The ticket price changed. Review the updated amount before paying.';
    }
    if (message === 'payment_converted_usdc_not_ready') {
        return 'The converted USDC balance or NEAR gas reserve is no longer sufficient.';
    }
    if (message === 'livepeer_ticket_payment_refunded') {
        return 'The ticket payment did not settle. Your USDC is still available to retry.';
    }
    return 'The ticket could not be purchased. Check your wallet and try again.';
}
