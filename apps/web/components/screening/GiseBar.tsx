'use client';

import { Check, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { StatusLine } from '@/components/ui/status-line';
import type { useTicketCheckout } from '@/features/checkout/useTicketCheckout';
import { FEATURE_FLAGS } from '@/lib/constants';
import { messages } from '@/lib/i18n/messages';
import { formatUsdc, type LivepeerPublication } from '@/lib/livepeer-publication';
import { multiAssetPaymentsEnabled, readPaymentPreflight } from '@/lib/multi-asset-payments';
import { playerCopy } from '@/lib/player-copy';
import { cn } from '@/lib/utils';
import { errorAction, gisePhase, giseSteps, type StepMark } from './gise-model';

type Checkout = ReturnType<typeof useTicketCheckout>;

type GiseBarProps = {
    checkout: Checkout;
    publication: LivepeerPublication;
    otherAssetOpen: boolean;
    /** Opens the screening room for a ticket holder (G10). */
    onEnterSalon?(): void;
    /** Absent while an unfinished conversion keeps the panel open. */
    onToggleOtherAsset?(): void;
};

/** Sticky box office: price, the four purchase steps, one status sentence and the next action. */
export function GiseBar({ checkout, publication, otherAssetOpen, onToggleOtherAsset, onEnterSalon }: GiseBarProps) {
    const { locale, accountId, connect, isReady, busy, step, error, purchase, accessView, entitlementQuery } = checkout;
    const t = messages[locale].watch;
    const player = playerCopy[locale];
    const price = formatUsdc(publication.price_usdc);
    const phase = gisePhase({ accountId, accessView, availability: publication.availability, busy, step, error });
    const steps = giseSteps(phase);
    const preflight = useQuery({
        queryKey: ['ticketPreflight', accountId, publication.price_usdc],
        queryFn: () => readPaymentPreflight(accountId!, publication.price_usdc),
        enabled: Boolean(accountId) && phase === 'ready',
        staleTime: 30_000,
        retry: false,
    });

    const retry = async () => {
        // Re-read the ticket first so a late settlement is never paid twice.
        const current = await entitlementQuery.refetch();
        if (current.data === false) await purchase();
    };

    const status = {
        guest: t.guestStatus,
        ready: t.readyStatus,
        approving: step === 'verifying_price' ? t.verifyingStatus
            : step === 'reconciling_conversion' ? t.reconcilingStatus
                : t.approvalStatus(price),
        issuing: t.issuingStatus,
        owner: t.ownerStatus,
        error: error ?? '',
        checking: player.checking,
        access_error: player.accessError,
        closed: publication.availability === 'TAKEDOWN' ? t.takedown : t.salesPaused,
    }[phase];

    return (
        <section
            aria-label={t.stepsLabel}
            className={cn(
                'sticky bottom-[57px] z-30 border-t bg-panel/95 backdrop-blur md:bottom-0',
                phase === 'owner' ? 'border-ice' : phase === 'error' || phase === 'access_error' ? 'border-alert' : 'border-line',
            )}
        >
            <div className="container mx-auto flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:gap-8">
                <div className="flex items-center justify-between gap-4 md:block">
                    <p className="tabular text-3xl">{price} USDC</p>
                    {phase === 'owner' && <Chip tone="owned" className="md:mt-2">{t.ownerChip}</Chip>}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    {steps && (
                        <ol aria-label={t.stepsLabel} className="hidden items-center gap-3 md:flex">
                            {t.steps.map((label, index) => <StepItem key={label} label={label} index={index} mark={steps[index]} last={index === t.steps.length - 1} />)}
                        </ol>
                    )}
                    <StatusLine
                        tone={phase === 'error' || phase === 'access_error' ? 'error'
                            : phase === 'approving' || phase === 'issuing' || phase === 'checking' ? 'progress'
                                : phase === 'owner' ? 'success' : 'neutral'}
                        className="text-sm"
                    >
                        {status}
                    </StatusLine>
                    {phase === 'ready' && preflight.data && (
                        <p className="text-[13px] text-light-3">
                            {t.balance(formatUsdc(preflight.data.usdcBalanceMicro))} · {!preflight.data.usdcSufficient ? t.balanceShort
                                : !preflight.data.gasSufficient ? t.gasShort : t.balanceEnough}
                        </p>
                    )}
                    {phase === 'ready' && !FEATURE_FLAGS.enablePlaybackAuthorizerV2 && (
                        <p className="text-[13px] text-light-3">{t.playbackKeyNote}</p>
                    )}
                </div>

                <div className="flex flex-col items-stretch gap-2 md:items-end">
                    {phase === 'owner' && onEnterSalon && <Button size="lg" onClick={onEnterSalon}>{messages[locale].salon.enter}</Button>}
                    {phase === 'guest' && <Button size="lg" disabled={!isReady} onClick={() => void connect()}>{t.connectWallet}</Button>}
                    {(phase === 'ready' || phase === 'approving' || phase === 'issuing') && (
                        <Button size="lg" disabled={phase !== 'ready' || entitlementQuery.isLoading} onClick={() => void purchase()}>
                            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
                            {t.buy(price)}
                        </Button>
                    )}
                    {phase === 'error' && (errorAction(error, locale) === 'recheck'
                        ? <Button size="lg" variant="outline" disabled={entitlementQuery.isFetching} onClick={() => void entitlementQuery.refetch()}>{t.checkStatus}</Button>
                        : <Button size="lg" onClick={() => void retry()}>{t.retry}</Button>)}
                    {phase === 'access_error' && (
                        <Button size="lg" variant="outline" disabled={entitlementQuery.isFetching} onClick={() => void entitlementQuery.refetch()}>{player.checkAgain}</Button>
                    )}
                    {multiAssetPaymentsEnabled && accountId && onToggleOtherAsset && (phase === 'ready' || phase === 'error') && (
                        <button
                            type="button"
                            aria-expanded={otherAssetOpen}
                            onClick={onToggleOtherAsset}
                            className="min-h-11 text-sm text-light underline underline-offset-4 hover:text-ice focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ice"
                        >
                            {otherAssetOpen ? t.hideOtherAsset : t.otherAsset}
                        </button>
                    )}
                </div>
            </div>
        </section>
    );
}

function StepItem({ label, index, mark, last }: { label: string; index: number; mark: StepMark; last: boolean }) {
    return (
        <li aria-current={mark === 'active' || mark === 'busy' || mark === 'failed' ? 'step' : undefined} className="flex items-center gap-3">
            <span
                className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-extrabold',
                    mark === 'done' && 'border-ice bg-ice text-ink',
                    mark === 'active' && 'border-light text-light',
                    mark === 'busy' && 'border-line-strong border-t-ice motion-safe:animate-spin',
                    mark === 'failed' && 'border-alert text-alert',
                    mark === 'pending' && 'border-line-strong text-light-3',
                )}
            >
                {mark === 'done' ? <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} /> : mark === 'failed' ? '!' : mark === 'busy' ? null : index + 1}
            </span>
            <span className={cn('text-[11px] font-bold uppercase tracking-[0.14em]', mark === 'done' ? 'text-ice' : mark === 'pending' ? 'text-light-3' : mark === 'failed' ? 'text-alert' : 'text-light')}>
                {label}
            </span>
            {!last && <span aria-hidden="true" className={cn('h-px w-8', mark === 'done' ? 'bg-ice' : 'bg-line-strong')} />}
        </li>
    );
}
