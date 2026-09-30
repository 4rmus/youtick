'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getProvider, viewContract } from '@/lib/near';
import { NEAR_CONFIG, FEATURE_FLAGS } from '@/lib/constants';
import { useMessages } from '@/lib/i18n/I18nProvider';
import type { Messages } from '@/lib/i18n/messages';

type BetaState = {
    ends_at_ms: string;
    closed_at_ms: string | null;
};

export function PublicTestnetBetaBanner() {
    const t = useMessages().banner;
    const beta = useQuery({
        queryKey: ['publicTestnetBetaState', NEAR_CONFIG.marketContractId],
        enabled: !FEATURE_FLAGS.publicTestnetVideoV1,
        queryFn: () => viewContract<BetaState | null>(
            getProvider(),
            NEAR_CONFIG.marketContractId,
            'get_public_testnet_beta_state',
        ),
        retry: false,
        refetchInterval: 60_000,
    });
    if (FEATURE_FLAGS.publicTestnetVideoV1) {
        return <TestnetStrip label={t.publicTestnet} limits={t.publicLimits} termsLabel={t.termsAndTokens} />;
    }
    const remaining = !beta.data
        ? beta.isLoading ? t.checkingTime : t.timeUnavailable
        : beta.data.closed_at_ms === null
            ? remainingLabel(Number(beta.data.ends_at_ms) - beta.dataUpdatedAt, t)
            : t.closed;

    return <TestnetStrip label={t.testnetBeta} limits={t.betaLimits} termsLabel={t.terms} status={remaining} />;
}

/**
 * Compact strip. The public limits stay visible on every page (V1 public testnet requirement,
 * pinned by public-video-discover.test.ts), so they are not hidden behind a disclosure.
 */
function TestnetStrip({ label, limits, termsLabel, status }: { label: string; limits: string; termsLabel: string; status?: string }) {
    const t = useMessages().banner;
    return (
        <aside aria-label={label} className="border-b border-line bg-panel px-4 py-1.5 text-center text-[13px] text-light-2">
            <p className="flex flex-wrap items-center justify-center gap-x-3">
                <strong className="text-[11px] font-bold uppercase tracking-[0.14em] text-light">{label}</strong>
                <span>{t.noValue}</span>
                {status && <span>· {status}</span>}
                <Link className="inline-flex min-h-11 items-center text-light underline underline-offset-4 hover:text-ice sm:min-h-8" href="/terms">{termsLabel}</Link>
            </p>
            <p className="text-xs text-light-3"><span className="sr-only">{t.limitsTitle}: </span>{limits}</p>
        </aside>
    );
}

function remainingLabel(milliseconds: number, t: Messages['banner']): string {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return t.closed;
    const hours = Math.ceil(milliseconds / (60 * 60 * 1_000));
    return t.remaining(hours >= 24 ? t.days(Math.ceil(hours / 24)) : t.hours(hours));
}
