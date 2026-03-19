'use client';

import dynamic from 'next/dynamic';
import { FEATURE_FLAGS } from '@/lib/constants';

const DynamicEvmProvider = dynamic(
    () => import('@/components/providers/EvmProvider').then((mod) => mod.EvmProvider),
    { ssr: false },
);

export function OptionalEvmProvider({ children }: { children: React.ReactNode }) {
    if (!FEATURE_FLAGS.enableCrossChainCheckout) {
        return <>{children}</>;
    }

    return <DynamicEvmProvider>{children}</DynamicEvmProvider>;
}
