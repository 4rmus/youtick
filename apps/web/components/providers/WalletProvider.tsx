'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { NearConnector, type Account, type NearWalletBase, type WalletManifest } from '@hot-labs/near-connect';
import { clearSessionGrantCache } from '@/lib/access-grants';
import { clearDeviceSession, connectDeviceSession } from '@/lib/device-session';
import { FEATURE_FLAGS, NEAR_NETWORK } from '@/lib/constants';
import { getRpcEndpoints } from '@/lib/rpc-failover';
import { startVideoMeasurement } from '@/lib/video-measurements';
import {
    clearSignlessAccessKey,
    revokeBrowserAuthority,
} from '@/lib/signless-access-key';
import type { WalletInstance } from '@/lib/types';
import {
    PINNED_WALLET_MANIFEST,
    isPinnedMeteorManifest,
} from '@/lib/pinned-wallet-manifest';

interface WalletContextValue {
    accountId: string | null;
    getWallet: () => Promise<WalletInstance>;
    signOut: () => Promise<void>;
    connect: () => Promise<void>;
    isReady: boolean;
}

const WalletContext = createContext<WalletContextValue | null>(null);
const WALLET_RESTORE_TIMEOUT_MS = 5_000;
const SPONSORED_DELEGATE_MAX_BLOCKS = 200;
const VERIFIED_WALLET_WINDOWS: Record<string, number> = {
    'meteor-wallet': 200,
};

function sponsoredDelegateWindow(wallet: NearWalletBase, trusted: boolean): number | null {
    if (!trusted || !isPinnedMeteorManifest(wallet.manifest)) return null;
    const features = wallet.manifest.features as unknown as Record<string, unknown>;
    if (!features.signDelegateActions) return null;
    if (features.signDelegateActionsWithTtl === true) return SPONSORED_DELEGATE_MAX_BLOCKS;
    const observed = VERIFIED_WALLET_WINDOWS[wallet.manifest.id];
    return observed && observed <= SPONSORED_DELEGATE_MAX_BLOCKS ? observed : null;
}

export function createWalletAdapter(wallet: NearWalletBase, trusted = false): WalletInstance {
    const delegateWindow = sponsoredDelegateWindow(wallet, trusted);
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
        ...(delegateWindow
            && typeof wallet.signDelegateActions === 'function'
            ? {
                async signDelegateActions(params: {
                    delegateActions: Array<{ receiverId: string; actions: unknown[] }>;
                    blockHeightTtl?: number;
                }) {
                    return wallet.signDelegateActions({
                        network: NEAR_NETWORK,
                        delegateActions: params.delegateActions as Parameters<NearWalletBase['signDelegateActions']>[0]['delegateActions'],
                        blockHeightTtl: params.blockHeightTtl ?? delegateWindow,
                    } as Parameters<NearWalletBase['signDelegateActions']>[0]);
                },
            }
            : {}),
    };
}

export function WalletProvider({ children, cspNonce }: { children: React.ReactNode; cspNonce?: string }) {
    const connectorRef = useRef<NearConnector | null>(null);
    const walletRef = useRef<NearWalletBase | null>(null);
    const pinnedWalletRef = useRef<NearWalletBase | null>(null);
    const connectingRef = useRef<Promise<void> | null>(null);
    const connectAbortRef = useRef<AbortController | null>(null);
    const authGenerationRef = useRef(0);
    const signedReplyRef = useRef<Awaited<ReturnType<NonNullable<WalletInstance['signMessage']>>> | null>(null);
    const accountIdRef = useRef<string | null>(null);
    const [accountId, setAccountId] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const clearAuth = useCallback(async (id: string | null) => {
        if (!id) return;
        clearSessionGrantCache(id);
        await clearDeviceSession();
        await clearSignlessAccessKey(id);
    }, []);

    const applyWallet = useCallback((wallet: NearWalletBase, accounts: Account[], sessionPrepared = false) => {
        const nextAccountId = accounts[0]?.accountId ?? null;
        const previousAccountId = accountIdRef.current;
        if (!sessionPrepared && previousAccountId && previousAccountId !== nextAccountId) {
            authGenerationRef.current += 1;
            void clearAuth(previousAccountId).catch(() => setError('Secure session cleanup failed. Please retry disconnect.'));
        }
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
            cspNonce,
        });
        connectorRef.current = connector;

        connector.on('wallet:signInAndSignMessage', ({ accounts }) => {
            if (mounted && connectingRef.current) {
                const account = accounts[0];
                if (account && account.accountId === account.signedMessage?.accountId) signedReplyRef.current = account.signedMessage;
            }
        });
        connector.on('wallet:signIn', ({ wallet, accounts, source }) => {
            if (!mounted || connectingRef.current || source === 'signInAndSignMessage') return;
            authGenerationRef.current += 1;
            applyWallet(wallet, accounts);
            setError(null);
        });
        connector.on('wallet:signOut', () => {
            if (!mounted) return;
            authGenerationRef.current += 1;
            void clearDeviceSession().catch(() => setError('Secure session cleanup failed. Please retry disconnect.'));
            void clearAuth(accountIdRef.current).catch(() => {});
            walletRef.current = null;
            accountIdRef.current = null;
            setAccountId(null);
        });

        const restoreGeneration = authGenerationRef.current;
        const canRestore = () => mounted && !connectingRef.current && restoreGeneration === authGenerationRef.current;
        const finishRestore = startVideoMeasurement('wallet_restore');
        // Bound UI readiness without discarding the SDK's eventual restore result.
        const timeoutId = setTimeout(() => {
            if (!mounted) return;
            setIsReady(true);
            if (!canRestore()) return;
            finishRestore('delayed');
            setError('Your wallet connection is taking longer than expected. You can wait or reload this page.');
        }, WALLET_RESTORE_TIMEOUT_MS);
        connector.whenManifestLoaded
            .then(async () => {
                if (!mounted) return;
                connector.wallets = connector.wallets.filter((candidate) => (
                    candidate.manifest.id !== 'meteor-wallet'
                ));
                connector.manifest.wallets = connector.manifest.wallets.filter((candidate) => (
                    candidate.id !== 'meteor-wallet'
                ));
                await connector.registerWallet(
                    PINNED_WALLET_MANIFEST.wallets[0] as unknown as WalletManifest,
                );
                if (!mounted) return;
                pinnedWalletRef.current = connector.wallets.find((candidate) => (
                    isPinnedMeteorManifest(candidate.manifest)
                )) ?? null;
                if (!canRestore()) return;
                const connected = await connector.getConnectedWallet();
                if (!canRestore()) return;
                applyWallet(connected.wallet, connected.accounts);
                setError(null);
                finishRestore('completed');
            })
            .catch((reason: unknown) => {
                if (!canRestore()) return;
                let disconnected = false;
                try {
                    disconnected = reason instanceof Error
                        && ['No wallet selected', 'No accounts found'].includes(reason.message);
                } catch {
                    // Unreadable SDK errors still get a fixed, non-sensitive message.
                }
                finishRestore(disconnected ? 'disconnected' : 'failed');
                setError(disconnected ? null : 'Your wallet connection could not be restored. Reload this page to try again.');
            })
            .finally(() => {
                clearTimeout(timeoutId);
                finishRestore('cancelled');
                if (mounted) setIsReady(true);
            });

        return () => {
            mounted = false;
            clearTimeout(timeoutId);
            finishRestore('cancelled');
            connectAbortRef.current?.abort();
            authGenerationRef.current += 1;
            connector.removeAllListeners();
            if (connectorRef.current === connector) connectorRef.current = null;
            pinnedWalletRef.current = null;
        };
    }, [applyWallet, clearAuth, cspNonce]);

    const getWallet = useCallback(async (): Promise<WalletInstance> => {
        const connector = connectorRef.current;
        if (!connector) throw new Error('Wallet connector is not ready');
        const wallet = walletRef.current ?? await connector.wallet();
        walletRef.current = wallet;
        return createWalletAdapter(wallet, wallet === pinnedWalletRef.current);
    }, []);

    const connect = useCallback((): Promise<void> => {
        if (connectingRef.current) return connectingRef.current;
        const connector = connectorRef.current;
        if (!connector) return Promise.resolve();
        const expectedGeneration = ++authGenerationRef.current;
        const controller = new AbortController();
        connectAbortRef.current = controller;
        const work = (async () => {
            await Promise.resolve();
            try {
                controller.signal.throwIfAborted();
                if (!FEATURE_FLAGS.enablePlaybackAuthorizerV2 || FEATURE_FLAGS.publicTestnetVideoV1) {
                    const wallet = await connector.connect();
                    const accounts = await wallet.getAccounts({ network: NEAR_NETWORK });
                    if (expectedGeneration === authGenerationRef.current) applyWallet(wallet, accounts);
                } else {
                    if (accountIdRef.current) await clearAuth(accountIdRef.current);
                    else await clearDeviceSession();
                    controller.signal.throwIfAborted();
                    let connectedWallet: NearWalletBase | undefined;
                    const session = await connectDeviceSession(async (signMessageParams) => {
                        signedReplyRef.current = null;
                        connectedWallet = await connector.connect({ signMessageParams });
                        if (expectedGeneration !== authGenerationRef.current || !signedReplyRef.current) {
                            throw new Error('device_session_cancelled');
                        }
                        return signedReplyRef.current;
                    }, controller.signal);
                    if (expectedGeneration !== authGenerationRef.current || !connectedWallet) return;
                    applyWallet(connectedWallet, [{ accountId: session.certificate_proof.account_id }], true);
                }
                if (expectedGeneration === authGenerationRef.current) setError(null);
            } catch (reason) {
                if (expectedGeneration === authGenerationRef.current) {
                    setError(reason instanceof Error && reason.message.startsWith('device_session_')
                        ? 'Session verification was not completed. Enable secure site storage and connect again.'
                        : 'Wallet connection was not completed. Choose Connect wallet to try again.');
                }
            }
        })();
        connectingRef.current = work;
        void work.finally(() => { if (connectingRef.current === work) connectingRef.current = null; });
        return work;
    }, [applyWallet, clearAuth]);

    const signOut = useCallback(async () => {
        const id = accountIdRef.current;
        authGenerationRef.current += 1;
        connectAbortRef.current?.abort();
        try {
            await clearDeviceSession();
        } catch {
            setError('Secure session cleanup failed. Enable site storage and retry disconnect.');
            return;
        }
        if (id) {
            try {
                await revokeBrowserAuthority(await getWallet(), id);
            } catch {
                setError('Secure disconnect was not approved. Your wallet remains connected.');
                return;
            }
        }
        await clearAuth(id);
        try {
            await connectorRef.current?.disconnect(walletRef.current ?? undefined);
        } catch {
            setError('Browser access was revoked, but the wallet could not be disconnected. Please retry.');
            return;
        }
        walletRef.current = null;
        accountIdRef.current = null;
        setAccountId(null);
        setError(null);
    }, [clearAuth, getWallet]);

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
