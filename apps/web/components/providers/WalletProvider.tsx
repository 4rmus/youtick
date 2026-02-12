'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { WalletSelector, Wallet } from '@near-wallet-selector/core';
import type { WalletSelectorModal } from '@near-wallet-selector/modal-ui';
import type { WalletInstance } from '@/lib/types';
import { NEAR_CONFIG } from '@/lib/constants';

interface WalletContextValue {
    accountId: string | null;
    isTrial: boolean;
    /** Active wallet ID: 'my-near-wallet' | 'meteor-wallet' | null */
    walletType: string | null;
    getWallet: () => Promise<WalletInstance>;
    signOut: () => Promise<void>;
    connect: () => Promise<void>;
    isReady: boolean;
}

const WalletContext = createContext<WalletContextValue | null>(null);

/**
 * Adapt wallet-selector's Wallet to our WalletInstance interface.
 * near-api-js v7 Action objects are passed through directly since
 * wallet-selector v10 uses `Action = NAJAction` from @near-js/transactions.
 */
function createWalletAdapter(wallet: Wallet): WalletInstance {
    return {
        async signAndSendTransaction(params) {
            const result = await wallet.signAndSendTransaction({
                receiverId: params.receiverId,
                actions: params.actions as Parameters<typeof wallet.signAndSendTransaction>[0]['actions'],
            });
            return (result || {}) as object;
        },
        async signAndSendTransactions(params) {
            const result = await wallet.signAndSendTransactions({
                transactions: params.transactions as Parameters<typeof wallet.signAndSendTransactions>[0]['transactions'],
            });
            return (result || []) as object[];
        },
        async getAccounts() {
            return wallet.getAccounts();
        },
    };
}

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const selectorRef = useRef<WalletSelector | null>(null);
    const modalRef = useRef<WalletSelectorModal | null>(null);
    const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
    const [accountId, setAccountId] = useState<string | null>(null);
    const [walletType, setWalletType] = useState<string | null>(null);
    const [trialAccountId, setTrialAccountId] = useState<string | null>(null);
    const [evmLinkedAccountId, setEvmLinkedAccountId] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        let mounted = true;

        // Check for trial account
        if (typeof window !== 'undefined') {
            const storedTrial = localStorage.getItem('trialAccountId');
            if (storedTrial) {
                setTrialAccountId(storedTrial);
            }
            // Check for EVM-linked implicit NEAR account (MetaMask-only users)
            const storedEvmAccount = localStorage.getItem('evmLinkedNearAccount');
            if (storedEvmAccount) {
                setEvmLinkedAccountId(storedEvmAccount);
            }
        }

        const network = (process.env.NEXT_PUBLIC_NEAR_NETWORK as 'testnet' | 'mainnet') || 'mainnet';
        const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || NEAR_CONFIG.contractId;

        // Dynamic imports to avoid SSR issues with wallet-selector modules
        Promise.all([
            import('@near-wallet-selector/core'),
            import('@near-wallet-selector/modal-ui'),
            import('@near-wallet-selector/my-near-wallet'),
            import('@near-wallet-selector/meteor-wallet'),
        ]).then(async ([
            { setupWalletSelector },
            { setupModal },
            { setupMyNearWallet },
            { setupMeteorWallet },
        ]) => {
            if (!mounted) return;

            const selector = await setupWalletSelector({
                network,
                modules: [
                    setupMyNearWallet(),
                    setupMeteorWallet(),
                ],
            });

            if (!mounted) return;

            selectorRef.current = selector;
            modalRef.current = setupModal(selector, { contractId });

            // Subscribe to account and wallet changes
            const subscription = selector.store.observable.subscribe((state) => {
                if (!mounted) return;
                const accounts = state.accounts;
                setAccountId(accounts.length > 0 ? accounts[0].accountId : null);
                setWalletType(state.selectedWalletId ?? null);
            });
            subscriptionRef.current = subscription;

            // Check existing session
            const state = selector.store.getState();
            if (state.accounts.length > 0) {
                setAccountId(state.accounts[0].accountId);
            }
            setWalletType(state.selectedWalletId ?? null);

            setIsReady(true);
        }).catch((err) => {
            if (!mounted) return;
            console.error('Failed to setup wallet selector:', err);
            setIsReady(true);
        });

        return () => {
            mounted = false;
            subscriptionRef.current?.unsubscribe();
        };
    }, []);

    // Determine active account (Wallet > Trial > EVM-linked implicit)
    const activeAccountId = accountId || trialAccountId || evmLinkedAccountId;
    const isTrial = !accountId && !!trialAccountId;
    const isEvmLinked = !accountId && !trialAccountId && !!evmLinkedAccountId;

    const getWallet = useCallback(async (): Promise<WalletInstance> => {
        if (isTrial && trialAccountId) {
            const { TrialWallet } = await import('@/lib/trial-wallet');
            return new TrialWallet(trialAccountId);
        }
        // EVM-linked implicit account uses same BrowserKeyStore format
        if (isEvmLinked && evmLinkedAccountId) {
            const { TrialWallet } = await import('@/lib/trial-wallet');
            return new TrialWallet(evmLinkedAccountId);
        }
        if (selectorRef.current) {
            const wallet = await selectorRef.current.wallet();
            return createWalletAdapter(wallet);
        }
        throw new Error('No wallet connected');
    }, [isTrial, trialAccountId, isEvmLinked, evmLinkedAccountId]);

    const signOut = useCallback(async (): Promise<void> => {
        if (isTrial && trialAccountId) {
            const { TrialWallet } = await import('@/lib/trial-wallet');
            const trialWallet = new TrialWallet(trialAccountId);
            await trialWallet.signOut();
            setTrialAccountId(null);
        } else if (isEvmLinked && evmLinkedAccountId) {
            localStorage.removeItem('evmLinkedNearAccount');
            setEvmLinkedAccountId(null);
        } else if (selectorRef.current) {
            const wallet = await selectorRef.current.wallet();
            await wallet.signOut();
        }
        setWalletType(null);
    }, [isTrial, trialAccountId, isEvmLinked, evmLinkedAccountId]);

    const connect = useCallback(async (): Promise<void> => {
        if (modalRef.current) {
            modalRef.current.show();
        }
    }, []);

    return (
        <WalletContext.Provider value={{
            accountId: activeAccountId,
            isTrial,
            walletType,
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
