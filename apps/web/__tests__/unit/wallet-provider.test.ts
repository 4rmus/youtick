import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

const walletTestState = vi.hoisted(() => ({
    cleanup: undefined as void | (() => void),
    connectorOptions: undefined as undefined | Record<string, unknown>,
    connectorWallets: [] as Array<{ manifest: Record<string, unknown> }>,
    registeredWallets: [] as Array<Record<string, unknown>>,
    stateSetters: [] as ReturnType<typeof vi.fn>[],
}));

vi.mock('react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react')>();
    return {
        ...actual,
        useCallback: <T,>(callback: T) => callback,
        useEffect: (effect: () => void | (() => void)) => {
            walletTestState.cleanup = effect();
        },
        useRef: <T,>(value: T) => ({ current: value }),
        useState: <T,>(value: T) => {
            const setter = vi.fn();
            walletTestState.stateSetters.push(setter);
            return [value, setter];
        },
    };
});

vi.mock('@hot-labs/near-connect', () => ({
    NearConnector: class {
        availableWallets = [];
        wallets: Array<{ manifest: Record<string, unknown> }> = [
            { manifest: { id: 'other-wallet' } },
            { manifest: { id: 'meteor-wallet', executor: 'https://moving.example/meteor.js' } },
        ];
        manifest = { wallets: this.wallets.map((wallet) => wallet.manifest), version: 'remote' };
        whenManifestLoaded = Promise.resolve();

        constructor(options: Record<string, unknown>) {
            walletTestState.connectorOptions = options;
            walletTestState.connectorWallets = this.wallets;
        }

        async registerWallet(manifest: Record<string, unknown>) {
            walletTestState.registeredWallets.push(manifest);
            this.wallets.push({ manifest });
        }
        getConnectedWallet() { return new Promise(() => {}); }
        on() {}
        removeAllListeners() {}
    },
}));

import { WalletProvider, createWalletAdapter } from '@/components/providers/WalletProvider';
import { PINNED_WALLET_MANIFEST } from '@/lib/pinned-wallet-manifest';

describe('WalletProvider CSP initialization', () => {
    afterEach(() => {
        walletTestState.cleanup?.();
        walletTestState.cleanup = undefined;
        walletTestState.connectorOptions = undefined;
        walletTestState.connectorWallets = [];
        walletTestState.registeredWallets = [];
        walletTestState.stateSetters = [];
        vi.useRealTimers();
    });

    it('passes the request nonce and stops waiting for a stale wallet restore', async () => {
        vi.useFakeTimers();

        WalletProvider({ children: null, cspNonce: 'request-nonce' });
        await vi.advanceTimersByTimeAsync(5_000);

        expect(walletTestState.connectorOptions).toMatchObject({ cspNonce: 'request-nonce' });
        expect(walletTestState.connectorOptions).not.toHaveProperty('manifest');
        expect(walletTestState.connectorWallets.map((wallet) => wallet.manifest.id)).toEqual([
            'other-wallet',
            'meteor-wallet',
        ]);
        expect(walletTestState.registeredWallets).toEqual([
            PINNED_WALLET_MANIFEST.wallets[0],
        ]);
        expect(walletTestState.stateSetters[1]).toHaveBeenCalledWith(true);
    });

    it('reads the middleware nonce in the root layout', async () => {
        const layout = await readFile('app/layout.tsx', 'utf8');

        expect(layout).toContain("(await headers()).get('x-nonce')");
        expect(layout).toContain('<WalletProvider cspNonce={cspNonce}>');
    });

    it('exposes delegate signing only when the connected wallet advertises it', async () => {
        const signDelegateActions = vi.fn().mockResolvedValue({
            signedDelegateActions: ['signed-delegate'],
        });
        const supported = createWalletAdapter({
            manifest: PINNED_WALLET_MANIFEST.wallets[0],
            signDelegateActions,
        } as never, true);
        await expect(supported.signDelegateActions?.({
            delegateActions: [{ receiverId: 'usdc.testnet', actions: [] }],
        })).resolves.toEqual({ signedDelegateActions: ['signed-delegate'] });
        expect(signDelegateActions).toHaveBeenCalledWith({
            network: 'testnet',
            delegateActions: [{ receiverId: 'usdc.testnet', actions: [] }],
            blockHeightTtl: 200,
        });

        const unsupported = createWalletAdapter({
            manifest: { id: 'ledger', features: { signDelegateActions: true } },
            signDelegateActions,
        } as never, true);
        expect(unsupported.signDelegateActions).toBeUndefined();

        const unpinnedTtlWallet = createWalletAdapter({
            manifest: {
                id: 'future-wallet',
                features: { signDelegateActions: true, signDelegateActionsWithTtl: true },
            },
            signDelegateActions,
        } as never, true);
        expect(unpinnedTtlWallet.signDelegateActions).toBeUndefined();
    });
});
