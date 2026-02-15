'use client';

import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from '@/lib/evm/config';
import type { ReactNode } from 'react';

interface EvmProviderProps {
    children: ReactNode;
}

export function EvmProvider({ children }: EvmProviderProps) {
    return (
        <WagmiProvider config={wagmiConfig}>
            {children}
        </WagmiProvider>
    );
}
