'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { NearConnector, type Account, type NearWalletBase } from '@hot-labs/near-connect';
import { clearSessionGrantCache } from '@/lib/access-grants';
import { NEAR_NETWORK } from '@/lib/constants';
import { getRpcEndpoints } from '@/lib/rpc-failover';
import {
    buildSignlessAccessKeyRequest,
    clearSignlessAccessKey,
    createSignlessAccessKey,
    persistSignlessAccessKey,
    reconcileSignlessAccessKey,
} from '@/lib/signless-access-key';
import type { WalletInstance } from '@/lib/types';

interface WalletContextValue {
    accountId: string | null;
    getWallet: () => Promise<WalletInstance>;
    signOut: () => Promise<void>;
    connect: () => Promise<void>;
    isReady: boolean;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function createWalletAdapter(wallet: NearWalletBase): WalletInstance {
    return {
        async signAndSendTransaction(params) {
            return (await wallet.signAndSendTransaction({
                network: NEAR_NETWORK,
                receiverId: params.receiverId,
                actions: params.actions as Parameters<NearWalletBase['signAndSendTransaction']>[0]['actions'],
            }) || {}) as object;
        },
        async signAndSendTransactions(params) {
            return await wallet.signAndSendTransactions({
                network: NEAR_NETWORK,
                transactions: params.transactions as Parameters<NearWalletBase['signAndSendTransactions']>[0]['transactions'],
            }) as object[] | void;
        },
        async getAccounts() {
            return wallet.getAccounts({ network: NEAR_NETWORK });
        },
        async signMessage(params) {
            return wallet.signMessage({
                network: NEAR_NETWORK,
                message: params.message,
                recipient: params.recipient,
                nonce: params.nonce,
            });
        },
    };
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
    const connectorRef = useRef<NearConnector | null>(null);
    const walletRef = useRef<NearWalletBase | null>(null);
    const accountIdRef = useRef<string | null>(null);
    const [accountId, setAccountId] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const clearAuth = useCallback(async (id: string | null) => {
        if (!id) return;
        clearSessionGrantCache(id);
        await clearSignlessAccessKey(id);
    }, []);

    const applyWallet = useCallback((wallet: NearWalletBase, accounts: Account[]) => {
        const nextAccountId = accounts[0]?.accountId ?? null;
        const previousAccountId = accountIdRef.current;
        if (previousAccountId && previousAccountId !== nextAccountId) void clearAuth(previousAccountId);
        walletRef.current = wallet;
        accountIdRef.current = nextAccountId;
        setAccountId(nextAccountId);
    }, [clearAuth]);

    useEffect(() => {
        let mounted = true;
        const providers = NEAR_NETWORK === 'testnet'
            ? { mainnet: [], testnet: getRpcEndpoints() }
            : { mainnet: getRpcEndpoints(), testnet: [] };
        const connector = new NearConnector({
            network: NEAR_NETWORK,
            providers,
            features: {
                signMessage: true,
                signAndSendTransaction: true,
                signAndSendTransactions: true,
                [NEAR_NETWORK]: true,
            },
            autoConnect: false,
            footerBranding: null,
        });
        connectorRef.current = connector;

        connector.on('wallet:signIn', ({ wallet, accounts }) => {
            if (!mounted) return;
            applyWallet(wallet, accounts);
            setError(null);
        });
        connector.on('wallet:signOut', () => {
            if (!mounted) return;
            void clearAuth(accountIdRef.current);
            walletRef.current = null;
            accountIdRef.current = null;
            setAccountId(null);
        });

        connector.whenManifestLoaded
            .then(async () => {
                const connected = await connector.getConnectedWallet();
                if (mounted) applyWallet(connected.wallet, connected.accounts);
            })
            .catch(() => {})
            .finally(() => {
                if (mounted) setIsReady(true);
            });

        return () => {
            mounted = false;
            connector.removeAllListeners();
            if (connectorRef.current === connector) connectorRef.current = null;
        };
    }, [applyWallet, clearAuth]);

    const getWallet = useCallback(async (): Promise<WalletInstance> => {
        const connector = connectorRef.current;
        if (!connector) throw new Error('Wallet connector is not ready');
        const wallet = walletRef.current ?? await connector.wallet();
        walletRef.current = wallet;
        return createWalletAdapter(wallet);
    }, []);

    const connect = useCallback(async () => {
        const connector = connectorRef.current;
        if (!connector) return;
        try {
            const supportsSignless = connector.availableWallets.some(
                (wallet) => wallet.manifest.features?.signInWithFunctionCallKey,
            );
            const keyPair = supportsSignless ? createSignlessAccessKey() : null;
            const wallet = await connector.connect(
                keyPair ? { addFunctionCallKey: buildSignlessAccessKeyRequest(keyPair) } : undefined,
            );
            const accounts = await wallet.getAccounts({ network: NEAR_NETWORK });
            const id = accounts[0]?.accountId;
            if (keyPair && id) {
                await persistSignlessAccessKey(id, keyPair);
                void reconcileSignlessAccessKey(id, keyPair).catch(() => {});
            }
            applyWallet(wallet, accounts);
            setError(null);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Wallet connection failed');
        }
    }, [applyWallet]);

    const signOut = useCallback(async () => {
        await clearAuth(accountIdRef.current);
        try {
            await connectorRef.current?.disconnect(walletRef.current ?? undefined);
        } finally {
            walletRef.current = null;
            accountIdRef.current = null;
            setAccountId(null);
        }
    }, [clearAuth]);

    return (
        <WalletContext.Provider value={{ accountId, getWallet, signOut, connect, isReady }}>
            {error && <p role="alert" className="fixed inset-x-4 top-4 z-50 mx-auto max-w-md rounded-lg border border-red-500/40 bg-black p-3 text-sm text-red-300">{error}</p>}
            {children}
        </WalletContext.Provider>
    );
}

export function useWallet(): WalletContextValue {
    const context = useContext(WalletContext);
    if (!context) throw new Error('useWallet must be used within WalletProvider');
    return context;
}
