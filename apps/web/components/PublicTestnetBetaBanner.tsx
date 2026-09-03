'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getProvider, viewContract } from '@/lib/near';
import { NEAR_CONFIG } from '@/lib/constants';

type BetaState = {
    ends_at_ms: string;
    closed_at_ms: string | null;
};

export function PublicTestnetBetaBanner() {
    const beta = useQuery({
        queryKey: ['publicTestnetBetaState'],
        queryFn: () => viewContract<BetaState | null>(
            getProvider(),
            NEAR_CONFIG.marketContractId,
            'get_public_testnet_beta_state',
        ),
        retry: false,
        refetchInterval: 60_000,
    });
    const remaining = !beta.data
        ? beta.isLoading ? 'checking beta time' : 'beta time unavailable'
        : beta.data.closed_at_ms === null
            ? `${formatRemaining(Number(beta.data.ends_at_ms) - beta.dataUpdatedAt)} remaining`
            : 'closed';

    return (
        <aside className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-center text-xs text-amber-100">
            <strong>Testnet Beta</strong> · test tokens have no real value · {remaining} ·
            {' '}1 GB/file · 1 upload/UTC day · 10 uploads total · 0.10 test USDC sponsor fee ·
            {' '}24-hour publication deadline · <Link className="underline" href="/terms">Terms</Link>
        </aside>
    );
}

function formatRemaining(milliseconds: number): string {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 'closed';
    const hours = Math.ceil(milliseconds / (60 * 60 * 1_000));
    return hours >= 24 ? `${Math.ceil(hours / 24)} days` : `${hours} hours`;
}
