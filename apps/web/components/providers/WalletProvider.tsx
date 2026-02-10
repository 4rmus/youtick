'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { NearConnector } from '@hot-labs/near-connect';
import type { WalletInstance } from '@/lib/types';

interface WalletContextValue {
    accountId: string | null;
    isTrial: boolean;
    getWallet: () => Promise<WalletInstance>;
    signOut: () => Promise<void>;
    connect: () => Promise<void>;
    isReady: boolean;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const connectorRef = useRef<NearConnector | null>(null);
    const [accountId, setAccountId] = useState<string | null>(null);
    const [trialAccountId, setTrialAccountId] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        // Check for trial account
        if (typeof window !== 'undefined') {
            const storedTrial = localStorage.getItem('trialAccountId');
            if (storedTrial) {
                setTrialAccountId(storedTrial);
            }
        }

        const network = (process.env.NEXT_PUBLIC_NEAR_NETWORK as 'testnet' | 'mainnet') || 'mainnet';

        const connector = new NearConnector({
            network,
            excludedWallets: [
                'intear-wallet',
                'nightly',
                'unity-wallet',
                'okx-wallet',
            ],
        });

        connectorRef.current = connector;

        connector.on('wallet:signIn', async ({ accounts }) => {
            if (accounts && accounts.length > 0) {
                setAccountId(accounts[0].accountId);
            }
        });

        connector.on('wallet:signOut', async () => {
            setAccountId(null);
        });

        // Auto-reconnect existing session
        connector.wallet()
            .then(async (wallet) => {
                const accounts = await wallet.getAccounts();
                if (accounts.length > 0) {
                    setAccountId(accounts[0].accountId);
                }
            })
            .catch(() => {
                // No existing session
            })
            .finally(() => {
                setIsReady(true);
            });
    }, []);

    // Determine active account (Wallet > Trial Account)
    const activeAccountId = accountId || trialAccountId;
    const isTrial = !accountId && !!trialAccountId;

    const getWallet = useCallback(async (): Promise<WalletInstance> => {
        if (isTrial && trialAccountId) {
            const { TrialWallet } = await import('@/lib/trial-wallet');
            return new TrialWallet(trialAccountId) as unknown as WalletInstance;
        }
        if (connectorRef.current) {
            return connectorRef.current.wallet() as unknown as Promise<WalletInstance>;
        }
        throw new Error('No wallet connected');
    }, [isTrial, trialAccountId]);

    const signOut = useCallback(async (): Promise<void> => {
        if (isTrial && trialAccountId) {
            const { TrialWallet } = await import('@/lib/trial-wallet');
            const trialWallet = new TrialWallet(trialAccountId);
            await trialWallet.signOut();
            setTrialAccountId(null);
        } else if (connectorRef.current) {
            await connectorRef.current.disconnect();
        }
    }, [isTrial, trialAccountId]);

    const connect = useCallback(async (): Promise<void> => {
        if (connectorRef.current) {
            await connectorRef.current.connect();
        }
    }, []);

    return (
        <WalletContext.Provider value={{
            accountId: activeAccountId,
            isTrial,
            getWallet,
            signOut,
            connect,
            isReady,
        }}>
            {children}
        </WalletContext.Provider>
    );
};

export function useWallet() {
    const context = useContext(WalletContext);
    if (!context) {
        throw new Error('useWallet must be used within a WalletProvider');
    }
    return context;
}
