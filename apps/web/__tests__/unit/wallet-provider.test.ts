import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

const walletTestState = vi.hoisted(() => ({
    cleanup: undefined as void | (() => void),
    connectorOptions: undefined as undefined | Record<string, unknown>,
    connectorWallets: [] as Array<{ manifest: Record<string, unknown> }>,
    connect: vi.fn(),
    connectDeviceSession: vi.fn(),
    clearDeviceSession: vi.fn(),
    revokeBrowserAuthority: vi.fn(),
    flags: { enablePlaybackAuthorizerV2: false, publicTestnetVideoV1: false },
    handlers: {} as Record<string, (payload: unknown) => void>,
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
        availableWallets = [{ manifest: { features: { signInWithFunctionCallKey: true } } }];
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
        connect(input?: unknown) {
            return input === undefined
                ? walletTestState.connect()
                : walletTestState.connect(input);
        }
        getConnectedWallet() { return new Promise(() => {}); }
        on(event: string, handler: (payload: unknown) => void) { walletTestState.handlers[event] = handler; }
        async disconnect() {}
        removeAllListeners() {}
    },
}));

vi.mock('@/lib/device-session', () => ({
    connectDeviceSession: walletTestState.connectDeviceSession,
    clearDeviceSession: walletTestState.clearDeviceSession,
}));
vi.mock('@/lib/constants', async (importOriginal) => ({ ...await importOriginal<object>(), FEATURE_FLAGS: walletTestState.flags }));
vi.mock('@/lib/signless-access-key', () => ({
    revokeBrowserAuthority: walletTestState.revokeBrowserAuthority,
    clearSignlessAccessKey: vi.fn(),
}));

import { WalletProvider, createWalletAdapter } from '@/components/providers/WalletProvider';
import { PINNED_WALLET_MANIFEST } from '@/lib/pinned-wallet-manifest';

describe('WalletProvider CSP initialization', () => {
    afterEach(() => {
        walletTestState.cleanup?.();
        walletTestState.cleanup = undefined;
        walletTestState.connectorOptions = undefined;
        walletTestState.connectorWallets = [];
        walletTestState.connect.mockReset();
        walletTestState.connectDeviceSession.mockReset();
        walletTestState.clearDeviceSession.mockReset();
        walletTestState.revokeBrowserAuthority.mockReset();
        walletTestState.flags.enablePlaybackAuthorizerV2 = false;
        walletTestState.flags.publicTestnetVideoV1 = false;
        walletTestState.handlers = {};
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

    it('connects without requesting a sign-in access key', async () => {
        vi.useFakeTimers();
        const getAccounts = vi.fn().mockResolvedValue([{ accountId: 'creator.testnet' }]);
        walletTestState.connect.mockResolvedValue({
            manifest: PINNED_WALLET_MANIFEST.wallets[0],
            getAccounts,
        });
        const provider = WalletProvider({ children: null }) as unknown as {
            props: { value: { connect: () => Promise<void> } };
        };

        await provider.props.value.connect();

        expect(walletTestState.connect).toHaveBeenCalledWith();
        expect(getAccounts).toHaveBeenCalledWith({ network: 'testnet' });
        await vi.advanceTimersByTimeAsync(5_000);
    });

    it('connects public-testnet without any message signature and rejects a late account after logout', async () => {
        vi.useFakeTimers();
        walletTestState.flags.enablePlaybackAuthorizerV2 = true;
        walletTestState.flags.publicTestnetVideoV1 = true;
        let finish!: (accounts: Array<{ accountId: string }>) => void;
        const getAccounts = vi.fn(() => new Promise<Array<{ accountId: string }>>((resolve) => { finish = resolve; }));
        walletTestState.connect.mockResolvedValue({ manifest: PINNED_WALLET_MANIFEST.wallets[0], getAccounts });
        const provider = WalletProvider({ children: null });
        const first = provider.props.value.connect();
        const second = provider.props.value.connect();
        await vi.advanceTimersByTimeAsync(0);
        await provider.props.value.signOut();
        finish([{ accountId: 'creator.testnet' }]);
        await Promise.all([first, second]);
        expect(walletTestState.connect).toHaveBeenCalledExactlyOnceWith();
        expect(walletTestState.connectDeviceSession).not.toHaveBeenCalled();
        expect(walletTestState.stateSetters[0]).not.toHaveBeenCalledWith('creator.testnet');
    });

    it('coalesces combined connect and ignores the duplicate sign-in until persistence completes', async () => {
        vi.useFakeTimers();
        walletTestState.flags.enablePlaybackAuthorizerV2 = true;
        const signedMessage = { accountId: 'creator.testnet', publicKey: 'wallet-public-key', signature: 'wallet-signature' };
        const wallet = { manifest: PINNED_WALLET_MANIFEST.wallets[0] };
        const params = { message: 'certificate-v2', recipient: 'market.testnet', nonce: new Uint8Array(32) };
        let persist!: () => void;
        walletTestState.connect.mockImplementation(async () => {
            walletTestState.handlers['wallet:signInAndSignMessage']({ wallet, accounts: [{ ...signedMessage, signedMessage }] });
            walletTestState.handlers['wallet:signIn']({ wallet, accounts: [signedMessage], source: 'signInAndSignMessage' });
            return wallet;
        });
        walletTestState.connectDeviceSession.mockImplementation(async (sign) => {
            expect(await sign(params)).toEqual(signedMessage);
            await new Promise<void>((resolve) => { persist = resolve; });
            return { certificate_proof: { account_id: signedMessage.accountId } };
        });
        const provider = WalletProvider({ children: null });
        const first = provider.props.value.connect();
        const second = provider.props.value.connect();
        await vi.advanceTimersByTimeAsync(0);
        expect(walletTestState.stateSetters[0]).not.toHaveBeenCalled();
        persist();
        await Promise.all([first, second]);
        expect(walletTestState.connectDeviceSession).toHaveBeenCalledOnce();
        expect(walletTestState.connect).toHaveBeenCalledWith({ signMessageParams: params });
        expect(walletTestState.stateSetters[0]).toHaveBeenCalledExactlyOnceWith('creator.testnet');
    });

    it('does not apply a combined response after sign-out or automatically retry cancellation', async () => {
        vi.useFakeTimers();
        walletTestState.flags.enablePlaybackAuthorizerV2 = true;
        let finish!: () => void;
        walletTestState.connectDeviceSession.mockImplementation(async () => {
            await new Promise<void>((resolve) => { finish = resolve; });
            return { certificate_proof: { account_id: 'creator.testnet' } };
        });
        const provider = WalletProvider({ children: null });
        const connecting = provider.props.value.connect();
        await vi.advanceTimersByTimeAsync(0);
        await provider.props.value.signOut();
        finish();
        await connecting;
        expect(walletTestState.stateSetters[0]).not.toHaveBeenCalledWith('creator.testnet');
        expect(walletTestState.clearDeviceSession).toHaveBeenCalled();
        expect(walletTestState.revokeBrowserAuthority).not.toHaveBeenCalled();
        walletTestState.connectDeviceSession.mockRejectedValue(new Error('User rejected'));
        await provider.props.value.connect();
        await vi.advanceTimersByTimeAsync(5_000);
        expect(walletTestState.connectDeviceSession).toHaveBeenCalledTimes(2);
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
