'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { NearConnector, type NearWalletBase, type Account } from '@hot-labs/near-connect';
import { NEAR_CONFIG } from '@/lib/constants';
import { getRpcEndpoints } from '@/lib/rpc-failover';
import type { WalletInstance } from '@/lib/types';
import { clearKmsAuthCache } from '@/lib/kms/client';
import { clearSessionGrantCache } from '@/lib/access-grants';
import { clearW3AuthCache } from '@/lib/crust/w3auth';
import { clearManagedNearAccount, migrateLegacyManagedNearAccount, writeManagedNearAccount, type ManagedNearAccountKind } from '@/lib/managed-near-account';
import { TrialWallet } from '@/lib/trial-wallet';
import { buildSignlessAccessKeyRequest, clearSignlessAccessKey, createSignlessAccessKey, persistSignlessAccessKey } from '@/lib/signless-access-key';

interface WalletContextValue {
    accountId: string | null;
    isTrial: boolean;
    managedAccountKind: ManagedNearAccountKind | null;
    walletType: string | null;
    getWallet: () => Promise<WalletInstance>;
    signOut: () => Promise<void>;
    connect: () => Promise<void>;
    setEvmLinkedAccount: (accountId: string) => void;
    setManagedAccount: (accountId: string, kind: ManagedNearAccountKind) => void;
    isReady: boolean;
}

type NearConnectNetwork = 'mainnet' | 'testnet';

const WalletContext = createContext<WalletContextValue | null>(null);

function getNearConnectNetwork(): NearConnectNetwork {
    return NEAR_CONFIG.networkId === 'testnet' ? 'testnet' : 'mainnet';
}

function getNearConnectProviders() {
    const endpoints = getRpcEndpoints();
    return getNearConnectNetwork() === 'testnet'
        ? { mainnet: [], testnet: endpoints }
        : { mainnet: endpoints, testnet: [] };
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function clearWalletAuthCaches(accountId: string): Promise<void> {
    clearKmsAuthCache(accountId);
    clearSessionGrantCache(accountId);
    clearW3AuthCache(accountId);
    await clearSignlessAccessKey(accountId);
}

function recordNearConnectError(error: unknown, code: string): void {
    const normalized = error instanceof Error ? error : new Error(getErrorMessage(error));

    if (process.env.NODE_ENV !== 'production') {
        console.error(`[near-connect:${code}]`, normalized);
    }

    if (process.env.NEXT_PUBLIC_SENTRY_ENABLED === 'true') {
        import('@sentry/nextjs')
            .then((Sentry) => {
                Sentry.captureException(normalized, {
                    tags: {
                        component: 'near-connect',
                        near_connect_error: code,
                    },
                });
            })
            .catch(() => {});
    }
}

function createWalletAdapter(wallet: NearWalletBase): WalletInstance {
    const network = getNearConnectNetwork();

    return {
        async signAndSendTransaction(params) {
            const result = await wallet.signAndSendTransaction({
                network,
                receiverId: params.receiverId,
                actions: params.actions as Parameters<NearWalletBase['signAndSendTransaction']>[0]['actions'],
            });
            return (result || {}) as object;
        },
        async signAndSendTransactions(params) {
            const result = await wallet.signAndSendTransactions({
                network,
                transactions: params.transactions as Parameters<NearWalletBase['signAndSendTransactions']>[0]['transactions'],
            });
            return result as object[] | void;
        },
        async getAccounts() {
            return wallet.getAccounts({ network });
        },
        async signMessage(params) {
            const signed = await wallet.signMessage({
                network,
                message: params.message,
                recipient: params.recipient,
                nonce: params.nonce,
            });

            return {
                ...signed,
                state: params.state,
            };
        },
    };
}

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const connectorRef = useRef<NearConnector | null>(null);
    const walletRef = useRef<NearWalletBase | null>(null);
    const accountIdRef = useRef<string | null>(null);
    const managedAccountKindRef = useRef<ManagedNearAccountKind | null>(null);
    const [accountId, setAccountId] = useState<string | null>(null);
    const [managedAccountKind, setManagedAccountKindState] = useState<ManagedNearAccountKind | null>(null);
    const [walletType, setWalletType] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [initError, setInitError] = useState<string | null>(null);

    const applyManagedAccount = useCallback((nextAccountId: string, kind: ManagedNearAccountKind) => {
        const previousAccountId = accountIdRef.current;
        if (previousAccountId && previousAccountId !== nextAccountId) {
            void clearWalletAuthCaches(previousAccountId);
        }

        walletRef.current = null;
        accountIdRef.current = nextAccountId;
        managedAccountKindRef.current = kind;
        setAccountId(nextAccountId);
        setManagedAccountKindState(kind);
        setWalletType(kind);
    }, []);

    const applyConnectedWallet = useCallback((wallet: NearWalletBase, accounts: Account[]) => {
        const nextAccountId = accounts[0]?.accountId ?? null;
        const previousAccountId = accountIdRef.current;

        if (previousAccountId && previousAccountId !== nextAccountId) {
            void clearWalletAuthCaches(previousAccountId);
        }

        walletRef.current = wallet;
        accountIdRef.current = nextAccountId;
        managedAccountKindRef.current = null;
        setAccountId(nextAccountId);
        setManagedAccountKindState(null);
        setWalletType(wallet.manifest.id);
    }, []);

    const applyStoredManagedAccount = useCallback(async (): Promise<boolean> => {
        const managed = migrateLegacyManagedNearAccount();
        if (managed && await TrialWallet.hasValidKey(managed.accountId)) {
            applyManagedAccount(managed.accountId, managed.kind);
            return true;
        }
        if (managed) {
            clearManagedNearAccount();
        }
        walletRef.current = null;
        accountIdRef.current = null;
        managedAccountKindRef.current = null;
        setAccountId(null);
        setManagedAccountKindState(null);
        setWalletType(null);
        return false;
    }, [applyManagedAccount]);

    useEffect(() => {
        let mounted = true;
        const network = getNearConnectNetwork();
        const connector = new NearConnector({
            network,
            providers: getNearConnectProviders(),
            features: {
                signMessage: true,
                signAndSendTransaction: true,
                signAndSendTransactions: true,
                [network]: true,
            },
            autoConnect: false,
            footerBranding: null,
        });

        connectorRef.current = connector;

        connector.on('wallet:signIn', ({ wallet, accounts }) => {
            if (!mounted) return;
            applyConnectedWallet(wallet, accounts);
            setInitError(null);
        });

        connector.on('wallet:signOut', () => {
            if (!mounted) return;
            const previousAccountId = accountIdRef.current;
            if (previousAccountId) {
                void clearWalletAuthCaches(previousAccountId);
            }
            walletRef.current = null;
            accountIdRef.current = null;
            managedAccountKindRef.current = null;
            setAccountId(null);
            setManagedAccountKindState(null);
            setWalletType(null);
        });

        connector.whenManifestLoaded
            .then(async () => {
                if (!mounted) return;

                if (connector.availableWallets.length === 0) {
                    throw new Error('No NEAR Connect wallet manifest entries are available for this network.');
                }

                try {
                    const connected = await connector.getConnectedWallet();
                    if (mounted) {
                        applyConnectedWallet(connected.wallet, connected.accounts);
                    }
                } catch {
                    await applyStoredManagedAccount();
                }
            })
            .catch(async (error) => {
                if (!mounted) return;
                if (await applyStoredManagedAccount()) {
                    setInitError(null);
                    return;
                }
                recordNearConnectError(error, 'manifest_unavailable');
                setInitError(getErrorMessage(error));
            })
            .finally(() => {
                if (mounted) {
                    setIsReady(true);
                }
            });

        return () => {
            mounted = false;
            connector.removeAllListeners();
            if (connectorRef.current === connector) {
                connectorRef.current = null;
            }
        };
    }, [applyConnectedWallet, applyStoredManagedAccount]);

    const getWallet = useCallback(async (): Promise<WalletInstance> => {
        const managedKind = managedAccountKindRef.current;
        const activeAccountId = accountIdRef.current;
        if (managedKind && activeAccountId) {
            return new TrialWallet(activeAccountId, managedKind) as WalletInstance;
        }

        const connector = connectorRef.current;
        if (!connector) {
            throw new Error('Wallet connector is not ready');
        }

        const wallet = walletRef.current ?? await connector.wallet();
        walletRef.current = wallet;
        return createWalletAdapter(wallet);
    }, []);

    const signOut = useCallback(async (): Promise<void> => {
        const previousAccountId = accountIdRef.current;
        if (previousAccountId) {
            await clearWalletAuthCaches(previousAccountId);
        }

        if (managedAccountKindRef.current && previousAccountId) {
            await new TrialWallet(previousAccountId).signOut();
        } else {
            const connector = connectorRef.current;
            try {
                await connector?.disconnect(walletRef.current ?? undefined);
            } catch (error) {
                recordNearConnectError(error, 'sign_out_failed');
            }
        }

        walletRef.current = null;
        accountIdRef.current = null;
        managedAccountKindRef.current = null;
        setAccountId(null);
        setManagedAccountKindState(null);
        setWalletType(null);
    }, []);

    const connect = useCallback(async (): Promise<void> => {
        const connector = connectorRef.current;
        if (!connector) {
            setInitError('Wallet connector is not ready.');
            return;
        }

        try {
            const canProvisionSignlessKey = connector.availableWallets.some(
                (wallet) => wallet.manifest.features?.signInWithFunctionCallKey,
            );
            const signlessKeyPair = canProvisionSignlessKey ? createSignlessAccessKey() : null;
            const wallet = await connector.connect(signlessKeyPair
                ? { addFunctionCallKey: buildSignlessAccessKeyRequest(signlessKeyPair) }
                : undefined);
            const accounts = await wallet.getAccounts({ network: getNearConnectNetwork() });
            const connectedAccountId = accounts[0]?.accountId;
            if (signlessKeyPair && connectedAccountId) {
                await persistSignlessAccessKey(connectedAccountId, signlessKeyPair);
            }
            applyConnectedWallet(wallet, accounts);
            setInitError(null);
        } catch (error) {
            recordNearConnectError(error, 'connect_failed');
            setInitError(getErrorMessage(error));
        }
    }, [applyConnectedWallet]);

    const setEvmLinkedAccount = useCallback((nextAccountId: string) => {
        writeManagedNearAccount(nextAccountId, 'evm');
        applyManagedAccount(nextAccountId, 'evm');
    }, [applyManagedAccount]);

    const setManagedAccount = useCallback((nextAccountId: string, kind: ManagedNearAccountKind) => {
        writeManagedNearAccount(nextAccountId, kind);
        applyManagedAccount(nextAccountId, kind);
    }, [applyManagedAccount]);

    return (
        <WalletContext.Provider value={{
            accountId,
            isTrial: managedAccountKind === 'guest' || managedAccountKind === 'trial',
            managedAccountKind,
            walletType,
            getWallet,
            signOut,
            connect,
            setEvmLinkedAccount,
            setManagedAccount,
            isReady,
        }}>
            {initError && (
                <div
                    role="alert"
                    className="fixed left-1/2 top-4 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-lg border border-red-500/40 bg-red-950/95 px-4 py-3 text-sm text-red-50 shadow-lg"
                >
                    Wallet connection is temporarily unavailable. {initError}
                </div>
            )}
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
