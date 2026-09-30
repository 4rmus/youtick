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
    if (FEATURE_FLAGS.publicTestnetVideoV1) return (
        <aside className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-xs text-amber-100">
            <strong>{t.publicTestnet}</strong> · {t.noValue} · {t.publicLimits} · <Link className="underline" href="/terms">{t.termsAndTokens}</Link>
        </aside>
    );
    const remaining = !beta.data
        ? beta.isLoading ? t.checkingTime : t.timeUnavailable
        : beta.data.closed_at_ms === null
            ? remainingLabel(Number(beta.data.ends_at_ms) - beta.dataUpdatedAt, t)
            : t.closed;

    return (
        <aside className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-xs text-amber-100">
            <strong>{t.testnetBeta}</strong> · {t.noValue} · {remaining} · {t.betaLimits} · <Link className="underline" href="/terms">{t.terms}</Link>
        </aside>
    );
}

function remainingLabel(milliseconds: number, t: Messages['banner']): string {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return t.remaining(t.closed);
    const hours = Math.ceil(milliseconds / (60 * 60 * 1_000));
    return t.remaining(hours >= 24 ? t.days(Math.ceil(hours / 24)) : t.hours(hours));
}
