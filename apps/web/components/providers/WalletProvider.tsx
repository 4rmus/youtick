'use client';

import { Buffer } from 'buffer';
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { WalletSelector, Wallet } from '@near-wallet-selector/core';
import type { WalletSelectorModal } from '@near-wallet-selector/modal-ui';
import { NEAR_CONFIG } from '@/lib/constants';
import type { WalletInstance } from '@/lib/types';
import { clearKmsAuthCache } from '@/lib/kms/client';
import { clearSessionGrantCache } from '@/lib/access-grants';
import { clearW3AuthCache } from '@/lib/crust/w3auth';
import {
    clearManagedNearAccount,
    migrateLegacyManagedNearAccount,
    readManagedNearAccount,
    type ManagedNearAccountKind,
    writeManagedNearAccount,
} from '@/lib/managed-near-account';

interface WalletContextValue {
    accountId: string | null;
    isTrial: boolean;
    managedAccountKind: ManagedNearAccountKind | null;
    /** Active wallet ID: 'my-near-wallet' | 'meteor-wallet' | null */
    walletType: string | null;
    getWallet: () => Promise<WalletInstance>;
    signOut: () => Promise<void>;
    connect: () => Promise<void>;
    /** Activate an EVM-linked implicit NEAR account without page refresh */
    setEvmLinkedAccount: (accountId: string) => void;
    setManagedAccount: (accountId: string, kind: ManagedNearAccountKind) => void;
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
        async signMessage(params) {
            if (!wallet.signMessage) {
                throw new Error('Connected wallet does not support signMessage');
            }

            return wallet.signMessage({
                message: params.message,
                recipient: params.recipient,
                nonce: Buffer.from(params.nonce) as Parameters<NonNullable<typeof wallet.signMessage>>[0]['nonce'],
                callbackUrl: params.callbackUrl,
                state: params.state,
            });
        },
    };
}

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const selectorRef = useRef<WalletSelector | null>(null);
    const modalRef = useRef<WalletSelectorModal | null>(null);
    const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
    const [accountId, setAccountId] = useState<string | null>(null);
    const [walletType, setWalletType] = useState<string | null>(null);
    const [managedAccountId, setManagedAccountId] = useState<string | null>(null);
    const [managedAccountKind, setManagedAccountKind] = useState<ManagedNearAccountKind | null>(null);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        let mounted = true;

        if (typeof window !== 'undefined') {
            const migrated = migrateLegacyManagedNearAccount() || readManagedNearAccount();
            if (migrated) {
                setManagedAccountId(migrated.accountId);
                setManagedAccountKind(migrated.kind);
            }
        }

        const network = NEAR_CONFIG.networkId;

        if (typeof window !== 'undefined') {
            localStorage.removeItem('DEV__METEOR_WALLET_BASE_URL');
        }

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
                createAccessKeyFor: {
                    contractId: NEAR_CONFIG.contractId,
                    methodNames: [],
                },
                modules: [
                    setupMyNearWallet(),
                    setupMeteorWallet(),
                ],
            });

            if (!mounted) return;

            selectorRef.current = selector;
            modalRef.current = setupModal(selector, {
                contractId: NEAR_CONFIG.contractId,
                methodNames: [],
            });

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

    // Determine active account (Wallet > managed local account)
    const activeAccountId = accountId || managedAccountId;
    const isTrial = !accountId && (managedAccountKind === 'trial' || managedAccountKind === 'guest');
    const isManagedLocalAccount = !accountId && !!managedAccountId;

    const getWallet = useCallback(async (): Promise<WalletInstance> => {
        if (isManagedLocalAccount && managedAccountId) {
            const { TrialWallet } = await import('@/lib/trial-wallet');
            return new TrialWallet(managedAccountId);
        }
        if (selectorRef.current) {
            const wallet = await selectorRef.current.wallet();
            return createWalletAdapter(wallet);
        }
        throw new Error('No wallet connected');
    }, [isManagedLocalAccount, managedAccountId]);

    const signOut = useCallback(async (): Promise<void> => {
        if (activeAccountId) {
            clearKmsAuthCache(activeAccountId);
            clearSessionGrantCache(activeAccountId);
            clearW3AuthCache(activeAccountId);
        }
        if (isManagedLocalAccount && managedAccountId) {
            const { TrialWallet } = await import('@/lib/trial-wallet');
            const managedWallet = new TrialWallet(managedAccountId);
            await managedWallet.signOut();
            setManagedAccountId(null);
            setManagedAccountKind(null);
        } else if (selectorRef.current) {
            const wallet = await selectorRef.current.wallet();
            await wallet.signOut();
            clearManagedNearAccount();
            setManagedAccountId(null);
            setManagedAccountKind(null);
        }
        setWalletType(null);
    }, [activeAccountId, isManagedLocalAccount, managedAccountId]);

    const connect = useCallback(async (): Promise<void> => {
        if (modalRef.current) {
            modalRef.current.show();
        }
    }, []);

    const setEvmLinkedAccount = useCallback((id: string) => {
        writeManagedNearAccount(id, 'evm');
        setManagedAccountId(id);
        setManagedAccountKind('evm');
    }, []);

    const setManagedAccount = useCallback((id: string, kind: ManagedNearAccountKind) => {
        writeManagedNearAccount(id, kind);
        setManagedAccountId(id);
        setManagedAccountKind(kind);
    }, []);

    return (
        <WalletContext.Provider value={{
            accountId: activeAccountId,
            isTrial,
            managedAccountKind,
            walletType,
            getWallet,
            signOut,
            connect,
            setEvmLinkedAccount,
            setManagedAccount,
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
