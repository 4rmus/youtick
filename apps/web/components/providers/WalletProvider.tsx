'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { setupWalletSelector } from '@near-wallet-selector/core';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import { setupModal } from '@near-wallet-selector/modal-ui-js';
import type { WalletSelector, AccountState } from '@near-wallet-selector/core';
import type { WalletSelectorModal } from '@near-wallet-selector/modal-ui-js';
import { usePKPMint, usePKPData } from '@/lib/hooks/useSessionState';
import '@near-wallet-selector/modal-ui-js/styles.css';

interface WalletContextValue {
    selector: WalletSelector | null;
    modal: WalletSelectorModal | null;
    accounts: Array<AccountState>;
    accountId: string | null;
    isTrial: boolean;
    getWallet: () => Promise<any>;
    // PKP state
    pkpData: { publicKey: string; ethAddress: string; tokenId: string } | null;
    isPKPMinting: boolean;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [selector, setSelector] = useState<WalletSelector | null>(null);
    const [modal, setModal] = useState<WalletSelectorModal | null>(null);
    const [accounts, setAccounts] = useState<Array<AccountState>>([]);
    const [trialAccountId, setTrialAccountId] = useState<string | null>(null);

    // PKP minting state
    const pkpMintMutation = usePKPMint();
    const pkpMintAttempted = useRef<Set<string>>(new Set());

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
            network: (process.env.NEXT_PUBLIC_NEAR_NETWORK as 'testnet' | 'mainnet') || 'testnet',
            modules: [setupMyNearWallet()],
        })
            .then((selector) => {
                setSelector(selector);
                setAccounts(selector.store.getState().accounts);

                // P1 LCP Optimization: Remove arbitrary delay, setup modal immediately
                // The selector is already ready at this point
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

    // Get PKP data from React Query cache
    const { data: pkpData } = usePKPData(activeAccountId);

    // PKP Onboarding: Mint PKP on wallet connect (background, non-blocking)
    useEffect(() => {
        if (!activeAccountId) return;

        // Skip if already attempted for this account
        if (pkpMintAttempted.current.has(activeAccountId)) return;

        // Skip if PKP already exists
        const existingPkp = localStorage.getItem(`lit_pkp_${activeAccountId}`);
        if (existingPkp) return;

        // Skip if mutation is already pending
        if (pkpMintMutation.isPending) return;

        // Mark as attempted to prevent double-minting (React StrictMode safety)
        pkpMintAttempted.current.add(activeAccountId);

        // Mint PKP in background (non-blocking)
        console.log('[WalletProvider] Starting background PKP mint for:', activeAccountId);
        pkpMintMutation.mutate(activeAccountId, {
            onSuccess: (data) => {
                console.log('[WalletProvider] PKP minted successfully:', data.ethAddress);
            },
            onError: (error) => {
                console.warn('[WalletProvider] Background PKP mint failed (non-blocking):', error);
                // Remove from attempted set so it can be retried later
                pkpMintAttempted.current.delete(activeAccountId);
            },
        });
    }, [activeAccountId, pkpMintMutation]);

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
            // PKP state exposed to consumers
            pkpData: pkpData ?? null,
            isPKPMinting: pkpMintMutation.isPending,
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
