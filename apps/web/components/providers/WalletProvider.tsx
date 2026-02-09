'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { setupWalletSelector } from '@near-wallet-selector/core';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import { setupModal } from '@near-wallet-selector/modal-ui-js';
import type { WalletSelector, AccountState } from '@near-wallet-selector/core';
import type { WalletSelectorModal } from '@near-wallet-selector/modal-ui-js';
import '@near-wallet-selector/modal-ui-js/styles.css';

interface WalletContextValue {
    selector: WalletSelector | null;
    modal: WalletSelectorModal | null;
    accounts: Array<AccountState>;
    accountId: string | null;
    isTrial: boolean;
    getWallet: () => Promise<any>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [selector, setSelector] = useState<WalletSelector | null>(null);
    const [modal, setModal] = useState<WalletSelectorModal | null>(null);
    const [accounts, setAccounts] = useState<Array<AccountState>>([]);
    const [trialAccountId, setTrialAccountId] = useState<string | null>(null);

    // Initial setup
    useEffect(() => {
        // Check for trial account
        if (typeof window !== "undefined") {
            const storedTrial = localStorage.getItem("trialAccountId");
            if (storedTrial) {
                setTrialAccountId(storedTrial);
            }
        }

        setupWalletSelector({
            network: (process.env.NEXT_PUBLIC_NEAR_NETWORK as 'testnet' | 'mainnet') || 'mainnet',
            modules: [setupMyNearWallet()],
        })
            .then((selector) => {
                setSelector(selector);
                setAccounts(selector.store.getState().accounts);

                const modal = setupModal(selector, {
                    contractId: process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || '',
                });
                setModal(modal);
            })
            .catch((err) => {
                console.error('Failed to setup wallet selector', err);
            });
    }, []);

    // Subscribe to wallet selector changes
    useEffect(() => {
        if (!selector) {
            return;
        }

        const subscription = selector.store.observable.subscribe((state) => {
            setAccounts(state.accounts);
        });

        return () => subscription.unsubscribe();
    }, [selector]);

    // Determine active account (Wallet Selector > Trial Account)
    const walletAccountId = accounts.find((account) => account.active)?.accountId || null;
    const activeAccountId = walletAccountId || trialAccountId;
    const isTrial = !walletAccountId && !!trialAccountId;

    const getWallet = async () => {
        if (isTrial && trialAccountId) {
            const { TrialWallet } = await import('@/lib/trial-wallet');
            return new TrialWallet(trialAccountId);
        }
        if (selector) {
            return selector.wallet();
        }
        throw new Error("No wallet connected");
    };

    return (
        <WalletContext.Provider value={{
            selector,
            modal,
            accounts,
            accountId: activeAccountId,
            isTrial,
            getWallet,
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
