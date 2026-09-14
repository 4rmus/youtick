import { readFile } from 'node:fs/promises';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const walletTestState = vi.hoisted(() => ({
    cleanup: undefined as void | (() => void),
    connectorOptions: undefined as undefined | Record<string, unknown>,
    connectorWallets: [] as Array<{ manifest: Record<string, unknown> }>,
    connect: vi.fn(),
    getConnectedWallet: vi.fn(),
    manifestLoaded: undefined as Promise<void> | undefined,
    connectDeviceSession: vi.fn(),
    clearDeviceSession: vi.fn(),
    suspendDeviceSession: vi.fn(),
    revokeBrowserAuthority: vi.fn(),
    flags: { enablePlaybackAuthorizerV2: false, publicTestnetVideoV1: false },
    handlers: {} as Record<string, (payload: unknown) => void>,
    storageListener: undefined as undefined | ((event: StorageEvent) => void),
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
        whenManifestLoaded = walletTestState.manifestLoaded ?? Promise.resolve();

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
        getConnectedWallet() { return walletTestState.getConnectedWallet() ?? new Promise(() => {}); }
        on(event: string, handler: (payload: unknown) => void) { walletTestState.handlers[event] = handler; }
        async disconnect() {}
        removeAllListeners() {}
    },
}));

vi.mock('@/lib/device-session', () => ({
    connectDeviceSession: walletTestState.connectDeviceSession,
    clearDeviceSession: walletTestState.clearDeviceSession,
    suspendDeviceSession: walletTestState.suspendDeviceSession,
}));
vi.mock('@/lib/constants', async (importOriginal) => ({ ...await importOriginal<object>(), FEATURE_FLAGS: walletTestState.flags }));
vi.mock('@/lib/signless-access-key', () => ({
    revokeBrowserAuthority: walletTestState.revokeBrowserAuthority,
    clearSignlessAccessKey: vi.fn(),
}));

import { WalletProvider, createWalletAdapter } from '@/components/providers/WalletProvider';
import { PINNED_WALLET_MANIFEST } from '@/lib/pinned-wallet-manifest';

const selectionKey = 'meteor-wallet:meteor-account-data';
function selectMeteor(accountId: string) {
    localStorage.setItem(selectionKey, JSON.stringify({ account: { accountId }, identifier: { accountId, blockchain: 'near', network: 'testnet' } }));
}

describe('WalletProvider CSP initialization', () => {
    beforeEach(() => {
        Object.assign(window, {
            addEventListener: vi.fn((name, fn) => { if (name === 'storage') walletTestState.storageListener = fn; }),
            removeEventListener: vi.fn(),
        });
    });
    afterEach(() => {
        walletTestState.cleanup?.();
        walletTestState.cleanup = undefined;
        walletTestState.connectorOptions = undefined;
        walletTestState.connectorWallets = [];
        walletTestState.connect.mockReset();
        walletTestState.getConnectedWallet.mockReset();
        walletTestState.manifestLoaded = undefined;
        walletTestState.connectDeviceSession.mockReset();
        walletTestState.clearDeviceSession.mockReset();
        walletTestState.suspendDeviceSession.mockReset();
        walletTestState.revokeBrowserAuthority.mockReset();
        walletTestState.flags.enablePlaybackAuthorizerV2 = false;
        walletTestState.flags.publicTestnetVideoV1 = false;
        walletTestState.handlers = {};
        walletTestState.registeredWallets = [];
        walletTestState.stateSetters = [];
        vi.useRealTimers();
        vi.restoreAllMocks();
        delete (window as Partial<Window>).addEventListener;
        delete (window as Partial<Window>).removeEventListener;
        walletTestState.storageListener = undefined;
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

    it.each(['manifest', 'accounts'])('applies a valid late restore after delayed %s without reconnecting', async (stage) => {
        vi.useFakeTimers();
        const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        let release!: () => void;
        const waiting = new Promise<void>((resolve) => { release = resolve; });
        const restored = { wallet: { manifest: { id: 'other-wallet' } }, accounts: [{ accountId: 'creator.testnet' }] };
        if (stage === 'manifest') walletTestState.manifestLoaded = waiting;
        walletTestState.getConnectedWallet.mockImplementation(async () => {
            if (stage === 'accounts') await waiting;
            return restored;
        });
        WalletProvider({ children: null });
        await vi.advanceTimersByTimeAsync(5_000);
        const readyAtDeadline = walletTestState.stateSetters[1].mock.calls.some(([value]) => value === true);
        release();
        await vi.advanceTimersByTimeAsync(0);
        expect(walletTestState.stateSetters[0]).toHaveBeenCalledExactlyOnceWith('creator.testnet');
        expect(readyAtDeadline).toBe(true);
        expect(walletTestState.stateSetters[2]).toHaveBeenCalledWith(expect.stringContaining('taking longer'));
        expect(walletTestState.stateSetters[2]).toHaveBeenLastCalledWith(null);
        expect(walletTestState.getConnectedWallet).toHaveBeenCalledOnce();
        expect(walletTestState.connect).not.toHaveBeenCalled();
        expect(walletTestState.connectDeviceSession).not.toHaveBeenCalled();
        expect(walletTestState.clearDeviceSession).not.toHaveBeenCalled();
        const events = log.mock.calls.map(([value]) => JSON.parse(String(value)));
        expect(events.map((event) => event.outcome)).toEqual(['started', 'delayed', 'completed']);
        expect(events.every((event) => event.phase === 'wallet_restore')).toBe(true);
        expect(JSON.stringify(events)).not.toContain('creator.testnet');
        expect(vi.getTimerCount()).toBe(0);
    });

    it.each(['unmount', 'signOut', 'signIn', 'connect'])('ignores a late restore after %s', async (action) => {
        vi.useFakeTimers();
        const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        walletTestState.clearDeviceSession.mockResolvedValue(undefined);
        let release!: (value: unknown) => void;
        walletTestState.getConnectedWallet.mockReturnValue(new Promise((resolve) => { release = resolve; }));
        const provider = WalletProvider({ children: null });
        await vi.advanceTimersByTimeAsync(0);
        const nextWallet = { manifest: { id: 'other-wallet' }, getAccounts: vi.fn().mockResolvedValue([{ accountId: 'new.testnet' }]) };
        if (action === 'unmount') {
            walletTestState.cleanup?.();
            walletTestState.cleanup = undefined;
        } else if (action === 'signOut') {
            walletTestState.handlers['wallet:signOut']({});
        } else if (action === 'signIn') {
            walletTestState.handlers['wallet:signIn']({ wallet: nextWallet, accounts: [{ accountId: 'new.testnet' }], source: 'signIn' });
        } else {
            walletTestState.connect.mockResolvedValue(nextWallet);
            await provider.props.value.connect();
        }
        await vi.advanceTimersByTimeAsync(5_000);
        release({ wallet: nextWallet, accounts: [{ accountId: 'old.testnet' }] });
        await vi.advanceTimersByTimeAsync(0);
        expect(walletTestState.stateSetters[0]).not.toHaveBeenCalledWith('old.testnet');
        if (action === 'signIn' || action === 'connect') expect(walletTestState.stateSetters[0]).toHaveBeenLastCalledWith('new.testnet');
        expect(walletTestState.stateSetters[2]).not.toHaveBeenCalledWith(expect.any(String));
        expect(log.mock.calls.map(([value]) => JSON.parse(String(value)).outcome)).toEqual(['started', 'cancelled']);
        expect(vi.getTimerCount()).toBe(0);
    });

    it.each(['No wallet selected', 'No accounts found'])('keeps %s disconnected without clearing device authority', async (message) => {
        vi.useFakeTimers();
        const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        walletTestState.getConnectedWallet.mockRejectedValue(new Error(message));
        WalletProvider({ children: null });
        await vi.advanceTimersByTimeAsync(5_000);
        expect(walletTestState.stateSetters[0]).not.toHaveBeenCalled();
        expect(walletTestState.stateSetters[1]).toHaveBeenCalledWith(true);
        expect(walletTestState.stateSetters[2]).not.toHaveBeenCalledWith(expect.any(String));
        expect(walletTestState.clearDeviceSession).not.toHaveBeenCalled();
        expect(JSON.parse(String(log.mock.calls.at(-1)?.[0])).outcome).toBe('disconnected');
        expect(vi.getTimerCount()).toBe(0);
    });

    it('still registers pinned Meteor when manual connect supersedes a delayed restore', async () => {
        vi.useFakeTimers();
        let release!: () => void;
        walletTestState.manifestLoaded = new Promise<void>((resolve) => { release = resolve; });
        walletTestState.connect.mockImplementation(async () => {
            await walletTestState.manifestLoaded;
            return { manifest: { id: 'other-wallet' }, getAccounts: async () => [{ accountId: 'new.testnet' }] };
        });
        const provider = WalletProvider({ children: null });
        await vi.advanceTimersByTimeAsync(5_000);
        const connecting = provider.props.value.connect();
        release();
        await connecting;
        await vi.advanceTimersByTimeAsync(0);
        expect(walletTestState.registeredWallets).toEqual([PINNED_WALLET_MANIFEST.wallets[0]]);
        expect(walletTestState.stateSetters[0]).toHaveBeenLastCalledWith('new.testnet');
        expect(walletTestState.getConnectedWallet).not.toHaveBeenCalled();
        expect(walletTestState.connect).toHaveBeenCalledOnce();
    });

    it.each([
        Object.assign(new Error('secret https://private/?jwt=secret'), { proof: 'secret' }),
        Object.defineProperty(new Error(), 'message', { get() { throw new Error('secret getter'); } }),
    ])('shows a safe restore failure without logging the SDK payload', async (failure) => {
        vi.useFakeTimers();
        const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
        walletTestState.getConnectedWallet.mockRejectedValue(failure);
        WalletProvider({ children: null });
        await vi.advanceTimersByTimeAsync(5_000);
        expect(walletTestState.stateSetters[2]).toHaveBeenLastCalledWith(expect.stringContaining('could not be restored'));
        expect(walletTestState.stateSetters[0]).not.toHaveBeenCalled();
        expect(walletTestState.clearDeviceSession).not.toHaveBeenCalled();
        expect(JSON.parse(String(log.mock.calls.at(-1)?.[0])).outcome).toBe('failed');
        expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|private|proof/);
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
            manifest: { id: 'other-wallet' },
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
        walletTestState.connect.mockResolvedValue({ manifest: { id: 'other-wallet' }, getAccounts });
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

    it('switches public-testnet accounts without erasing device storage or requesting signatures', async () => {
        vi.useFakeTimers();
        walletTestState.flags.publicTestnetVideoV1 = true;
        const wallet = { manifest: { id: 'other-wallet' }, getAccounts: vi.fn() };
        const provider = WalletProvider({ children: null });
        walletTestState.connect.mockResolvedValue(wallet);
        for (const accountId of ['creator.testnet', 'buyer.testnet', 'creator.testnet']) {
            wallet.getAccounts.mockResolvedValue([{ accountId }]);
            await provider.props.value.connect();
            expect(walletTestState.stateSetters[0]).toHaveBeenLastCalledWith(accountId);
        }
        expect(walletTestState.clearDeviceSession).not.toHaveBeenCalled();
        expect(walletTestState.suspendDeviceSession).toHaveBeenCalledTimes(2);
        expect(walletTestState.connectDeviceSession).not.toHaveBeenCalled();
        expect(walletTestState.revokeBrowserAuthority).not.toHaveBeenCalled();
        await provider.props.value.signOut();
        expect(walletTestState.clearDeviceSession).toHaveBeenCalled();
        expect(walletTestState.stateSetters[0]).toHaveBeenLastCalledWith(null);
    });

    it('keeps the original account and device after a cancelled switch', async () => {
        vi.useFakeTimers();
        walletTestState.flags.publicTestnetVideoV1 = true;
        const wallet = { manifest: { id: 'other-wallet' }, getAccounts: async () => [{ accountId: 'creator.testnet' }] };
        const provider = WalletProvider({ children: null });
        walletTestState.connect.mockResolvedValueOnce(wallet).mockRejectedValueOnce(new Error('User rejected'));
        await provider.props.value.connect();
        await provider.props.value.connect();
        expect(walletTestState.stateSetters[0]).toHaveBeenLastCalledWith('creator.testnet');
        expect(walletTestState.suspendDeviceSession).not.toHaveBeenCalled();
        expect(walletTestState.clearDeviceSession).not.toHaveBeenCalled();
    });

    it.each(['logout', 'newer sign-in'])('rejects a pending account switch after %s', async (action) => {
        vi.useFakeTimers();
        walletTestState.clearDeviceSession.mockResolvedValue(undefined);
        walletTestState.flags.publicTestnetVideoV1 = true;
        const wallet = { manifest: { id: 'other-wallet' } };
        WalletProvider({ children: null });
        const signIn = (accountId: string) => walletTestState.handlers['wallet:signIn']({ wallet, accounts: [{ accountId }], source: 'signIn' });
        signIn('creator.testnet');
        await vi.advanceTimersByTimeAsync(0);
        let finish!: () => void;
        walletTestState.suspendDeviceSession.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
        signIn('stale.testnet');
        await vi.advanceTimersByTimeAsync(0);
        expect(finish).toBeTypeOf('function');
        if (action === 'logout') walletTestState.handlers['wallet:signOut']({});
        else signIn('newest.testnet');
        await vi.advanceTimersByTimeAsync(0);
        finish();
        await vi.advanceTimersByTimeAsync(0);
        expect(walletTestState.stateSetters[0]).not.toHaveBeenCalledWith('stale.testnet');
        expect(walletTestState.stateSetters[0]).toHaveBeenLastCalledWith(action === 'logout' ? null : 'newest.testnet');
    });

    it('does not apply a new account if device suspension fails', async () => {
        vi.useFakeTimers();
        walletTestState.flags.publicTestnetVideoV1 = true;
        const wallet = { manifest: { id: 'other-wallet' }, getAccounts: vi.fn() };
        const provider = WalletProvider({ children: null });
        walletTestState.connect.mockResolvedValue(wallet);
        wallet.getAccounts.mockResolvedValueOnce([{ accountId: 'creator.testnet' }]).mockResolvedValueOnce([{ accountId: 'buyer.testnet' }]);
        await provider.props.value.connect();
        walletTestState.suspendDeviceSession.mockRejectedValueOnce(new Error('device_session_storage_unavailable'));
        await provider.props.value.connect();
        expect(walletTestState.stateSetters[0]).not.toHaveBeenCalledWith('buyer.testnet');
        expect(walletTestState.stateSetters[2]).toHaveBeenLastCalledWith(expect.stringContaining('Session verification was not completed'));
    });

    it('retains device deletion for non-public-testnet account changes', async () => {
        vi.useFakeTimers();
        const wallet = { manifest: { id: 'other-wallet' }, getAccounts: vi.fn() };
        const provider = WalletProvider({ children: null });
        walletTestState.connect.mockResolvedValue(wallet);
        for (const accountId of ['creator.testnet', 'buyer.testnet']) {
            wallet.getAccounts.mockResolvedValue([{ accountId }]);
            await provider.props.value.connect();
        }
        expect(walletTestState.clearDeviceSession).toHaveBeenCalledOnce();
        expect(walletTestState.suspendDeviceSession).not.toHaveBeenCalled();
    });

    it('uses Meteor selection on connect and cold restore instead of linked-account ordering', async () => {
        vi.useFakeTimers();
        walletTestState.flags.publicTestnetVideoV1 = true;
        const accounts = [{ accountId: 'utick2.testnet' }, { accountId: 'soteri.testnet' }];
        const wallet = { manifest: PINNED_WALLET_MANIFEST.wallets[0], getAccounts: vi.fn().mockResolvedValue(accounts) };
        selectMeteor('utick2.testnet');
        const provider = WalletProvider({ children: null });
        walletTestState.handlers['wallet:signIn']({ wallet, accounts: [accounts[0]], source: 'signIn' });
        await vi.advanceTimersByTimeAsync(0);
        walletTestState.connect.mockImplementation(async () => {
            selectMeteor('soteri.testnet');
            walletTestState.handlers['wallet:signIn']({ wallet, accounts: [accounts[1]], source: 'signIn' });
            return wallet;
        });
        await provider.props.value.connect();
        expect(walletTestState.stateSetters[0]).toHaveBeenLastCalledWith('soteri.testnet');
        expect(await (await provider.props.value.getWallet()).getAccounts()).toEqual([accounts[1]]);
        expect(walletTestState.clearDeviceSession).not.toHaveBeenCalled();
        walletTestState.cleanup?.();
        walletTestState.stateSetters = [];
        walletTestState.getConnectedWallet.mockResolvedValue({ wallet, accounts });
        WalletProvider({ children: null });
        await vi.advanceTimersByTimeAsync(0);
        expect(walletTestState.stateSetters[0]).toHaveBeenLastCalledWith('soteri.testnet');
    });

    it('requires explicit selection on cold restore when linked Meteor accounts have no selected signer', async () => {
        vi.useFakeTimers();
        walletTestState.getConnectedWallet.mockResolvedValue({ wallet: { manifest: PINNED_WALLET_MANIFEST.wallets[0] }, accounts: [{ accountId: 'utick2.testnet' }, { accountId: 'soteri.testnet' }] });
        WalletProvider({ children: null });
        await vi.advanceTimersByTimeAsync(0);
        expect(walletTestState.stateSetters[0]).not.toHaveBeenCalled();
        expect(walletTestState.stateSetters[2]).toHaveBeenLastCalledWith(expect.stringContaining('Choose Connect wallet'));
        expect(walletTestState.clearDeviceSession).not.toHaveBeenCalled();
    });

    it('stops stale adapters after another tab selects an account without deleting devices', async () => {
        vi.useFakeTimers();
        walletTestState.flags.publicTestnetVideoV1 = true;
        selectMeteor('utick2.testnet');
        const send = vi.fn();
        const wallet = { manifest: PINNED_WALLET_MANIFEST.wallets[0], getAccounts: async () => [{ accountId: 'utick2.testnet' }, { accountId: 'soteri.testnet' }], signAndSendTransaction: send };
        const provider = WalletProvider({ children: null });
        walletTestState.connect.mockResolvedValue(wallet);
        await provider.props.value.connect();
        const adapter = await provider.props.value.getWallet();
        selectMeteor('soteri.testnet');
        walletTestState.storageListener?.({ key: selectionKey, storageArea: localStorage } as StorageEvent);
        await vi.advanceTimersByTimeAsync(0);
        expect(walletTestState.stateSetters[0]).toHaveBeenLastCalledWith(null);
        expect(walletTestState.suspendDeviceSession).toHaveBeenCalledOnce();
        expect(walletTestState.clearDeviceSession).not.toHaveBeenCalled();
        await expect(adapter.signAndSendTransaction({ receiverId: 'market.testnet', actions: [] })).rejects.toThrow('wallet_account_changed');
        expect(send).not.toHaveBeenCalled();
    });

    it.each([
        ['signAndSendTransaction', { receiverId: 'market.testnet', actions: [] }],
        ['signAndSendTransactions', { transactions: [] }],
        ['signDelegateActions', { delegateActions: [] }],
        ['signMessage', { message: 'public challenge', recipient: 'market.testnet', nonce: new Uint8Array(32) }],
    ] as const)('checks the selected account immediately before %s, even without a storage event', async (method, params) => {
        const send = vi.fn().mockResolvedValue({ accountId: 'soteri.testnet' });
        const wallet = {
            manifest: PINNED_WALLET_MANIFEST.wallets[0],
            getAccounts: vi.fn().mockResolvedValue([{ accountId: 'utick2.testnet' }, { accountId: 'soteri.testnet' }]),
            signAndSendTransaction: send, signAndSendTransactions: send, signDelegateActions: send, signMessage: send,
        };
        selectMeteor('soteri.testnet');
        const adapter = createWalletAdapter(wallet as never, true, { accountId: 'soteri.testnet', isCurrent: () => true });
        expect(await adapter.getAccounts?.()).toEqual([{ accountId: 'soteri.testnet' }]);
        await adapter[method]!(params as never);
        expect(send).toHaveBeenCalledOnce();
        send.mockClear();
        selectMeteor('utick2.testnet');
        await expect(adapter[method]!(params as never)).rejects.toThrow('wallet_account_changed');
        expect(send).not.toHaveBeenCalled();
    });

    it('rejects a signer change while an account read is pending', async () => {
        selectMeteor('soteri.testnet');
        let finish!: (value: Array<{ accountId: string }>) => void;
        const send = vi.fn();
        const wallet = { manifest: PINNED_WALLET_MANIFEST.wallets[0], getAccounts: () => new Promise<Array<{ accountId: string }>>(resolve => { finish = resolve; }), signAndSendTransaction: send };
        const adapter = createWalletAdapter(wallet as never, true, { accountId: 'soteri.testnet', isCurrent: () => true });
        const signing = adapter.signAndSendTransaction({ receiverId: 'market.testnet', actions: [] });
        selectMeteor('utick2.testnet');
        finish([{ accountId: 'utick2.testnet' }, { accountId: 'soteri.testnet' }]);
        await expect(signing).rejects.toThrow('wallet_account_changed');
        expect(send).not.toHaveBeenCalled();
    });

    it('rejects an old adapter after a local wallet switch', async () => {
        vi.useFakeTimers();
        walletTestState.flags.publicTestnetVideoV1 = true;
        const send = vi.fn();
        const original = { manifest: { id: 'other-wallet' }, getAccounts: async () => [{ accountId: 'creator.testnet' }], signAndSendTransaction: send };
        const next = { manifest: { id: 'next-wallet' }, getAccounts: async () => [{ accountId: 'buyer.testnet' }] };
        const provider = WalletProvider({ children: null });
        walletTestState.connect.mockResolvedValueOnce(original).mockResolvedValueOnce(next);
        await provider.props.value.connect();
        const stale = await provider.props.value.getWallet();
        await provider.props.value.connect();
        await expect(stale.signAndSendTransaction({ receiverId: 'market.testnet', actions: [] })).rejects.toThrow('wallet_account_changed');
        expect(send).not.toHaveBeenCalled();
    });

    it('keeps pinned Meteor combined sign-in compatible with account-only proof metadata', async () => {
        vi.useFakeTimers();
        walletTestState.flags.enablePlaybackAuthorizerV2 = true;
        const accountId = 'soteri.testnet';
        const signed = { accountId, publicKey: 'message-signing-key', signature: 'proof' };
        const wallet = { manifest: PINNED_WALLET_MANIFEST.wallets[0] };
        walletTestState.connect.mockImplementation(async () => {
            localStorage.setItem(selectionKey, JSON.stringify({ account: { accountId, publicKey: 'primary-wallet-key' }, identifier: { accountId, network: 'testnet', blockchain: 'near' } }));
            walletTestState.handlers['wallet:signInAndSignMessage']({ accounts: [{ accountId, signedMessage: signed }] });
            return wallet;
        });
        walletTestState.connectDeviceSession.mockImplementation(async sign => {
            expect(await sign({ message: 'certificate', recipient: 'market.testnet', nonce: new Uint8Array(32) })).toEqual(signed);
            return { certificate_proof: { account_id: accountId } };
        });
        const provider = WalletProvider({ children: null });
        await provider.props.value.connect();
        expect(walletTestState.stateSetters[0]).toHaveBeenLastCalledWith(accountId);
    });

    it('coalesces combined connect and ignores the duplicate sign-in until persistence completes', async () => {
        vi.useFakeTimers();
        walletTestState.flags.enablePlaybackAuthorizerV2 = true;
        const signedMessage = { accountId: 'creator.testnet', publicKey: 'wallet-public-key', signature: 'wallet-signature' };
        const wallet = { manifest: { id: 'other-wallet' } };
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
        selectMeteor('creator.testnet');
        const supported = createWalletAdapter({
            manifest: PINNED_WALLET_MANIFEST.wallets[0],
            getAccounts: async () => [{ accountId: 'creator.testnet' }],
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
