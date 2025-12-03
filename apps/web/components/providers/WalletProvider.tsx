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
}

const WalletContext = createContext<WalletContextValue | null>(null);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [selector, setSelector] = useState<WalletSelector | null>(null);
    const [modal, setModal] = useState<WalletSelectorModal | null>(null);
    const [accounts, setAccounts] = useState<Array<AccountState>>([]);

    useEffect(() => {
        setupWalletSelector({
            network: (process.env.NEXT_PUBLIC_NEAR_NETWORK as 'testnet' | 'mainnet') || 'testnet',
            modules: [setupMyNearWallet()],
        })
            .then((selector) => {
                setSelector(selector);
                setAccounts(selector.store.getState().accounts);

                // Add a small delay to ensure DOM is fully ready and stable
                setTimeout(() => {
                    const modal = setupModal(selector, {
                        contractId: process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || '',
                    });
                    setModal(modal);
                }, 200);
            })
            .catch((err) => {
                console.error('Failed to setup wallet selector', err);
            });
    }, []);

    useEffect(() => {
        if (!selector) {
            return;
        }

        const subscription = selector.store.observable.subscribe((state) => {
            setAccounts(state.accounts);
        });

        return () => subscription.unsubscribe();
    }, [selector]);

    const accountId = accounts.find((account) => account.active)?.accountId || null;

    return (
        <WalletContext.Provider value={{ selector, modal, accounts, accountId }}>
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
