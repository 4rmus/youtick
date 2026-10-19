import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Which pages create the V1 wallet connector. Creating it fetches the wallet list from GitHub/jsDelivr and opens
// the connector's browser storage, so only the V1 pages create it on visit; elsewhere Connect creates it.

const pageState = vi.hoisted(() => ({
    pathname: '/',
    // A small hook runtime: state, refs and callbacks keep their slot across renders, effects run after the
    // render pass and only when their dependencies change, and a state update during render renders again.
    slots: [] as unknown[],
    cursor: 0,
    effects: [] as Array<{ deps?: unknown[]; cleanup?: void | (() => void) }>,
    effectCursor: 0,
    pendingEffects: [] as Array<() => void>,
    dirty: false,
    events: [] as string[],
    connectors: 0,
    connect: vi.fn(),
    getConnectedWallet: vi.fn(),
    addEventListener: vi.fn(),
}));

vi.mock('react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react')>();
    const slot = <T,>(init: () => T): number => {
        const index = pageState.cursor++;
        if (!(index in pageState.slots)) pageState.slots[index] = init();
        return index;
    };
    const changed = (previous?: unknown[], next?: unknown[]) => !previous || !next
        || previous.length !== next.length || previous.some((value, index) => !Object.is(value, next[index]));
    return {
        ...actual,
        useRef: <T,>(value: T) => pageState.slots[slot(() => ({ current: value }))],
        useState: <T,>(value: T) => {
            const index = slot(() => value);
            return [pageState.slots[index], (next: T) => {
                if (Object.is(pageState.slots[index], next)) return;
                pageState.slots[index] = next;
                pageState.dirty = true;
            }];
        },
        useCallback: <T,>(callback: T, deps: unknown[]) => {
            const index = slot(() => ({ callback, deps }));
            const memo = pageState.slots[index] as { callback: T; deps: unknown[] };
            if (changed(memo.deps, deps)) pageState.slots[index] = { callback, deps };
            return (pageState.slots[index] as { callback: T }).callback;
        },
        useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
            const index = pageState.effectCursor++;
            const previous = pageState.effects[index];
            if (previous && !changed(previous.deps, deps)) return;
            pageState.pendingEffects.push(() => {
                previous?.cleanup?.();
                pageState.effects[index] = { deps, cleanup: effect() };
            });
        },
    };
});

vi.mock('next/navigation', () => ({ usePathname: () => pageState.pathname }));

vi.mock('@hot-labs/near-connect', () => ({
    NearConnector: class {
        wallets: Array<{ manifest: Record<string, unknown> }> = [{ manifest: { id: 'meteor-wallet' } }];
        manifest = { wallets: [{ id: 'meteor-wallet' }] };
        whenManifestLoaded = Promise.resolve();

        constructor() { pageState.connectors += 1; }

        async registerWallet(manifest: Record<string, unknown>) {
            pageState.events.push('register-pinned-meteor');
            this.wallets.push({ manifest });
        }
        connect(input?: unknown) {
            pageState.events.push('connect');
            return pageState.connect(input);
        }
        getConnectedWallet() { return pageState.getConnectedWallet(); }
        on() {}
        removeAllListeners() { pageState.events.push('remove-listeners'); }
    },
}));

vi.mock('@/lib/device-session', () => ({
    connectDeviceSession: vi.fn(),
    clearDeviceSession: vi.fn().mockResolvedValue(undefined),
    suspendDeviceSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/constants', async (importOriginal) => ({
    ...await importOriginal<object>(),
    FEATURE_FLAGS: { enablePlaybackAuthorizerV2: false, publicTestnetVideoV1: false },
}));
vi.mock('@/lib/signless-access-key', () => ({ revokeBrowserAuthority: vi.fn(), clearSignlessAccessKey: vi.fn() }));
vi.mock('@/lib/video-measurements', () => ({ startVideoMeasurement: () => () => undefined }));

import { WalletProvider, loadsWalletOnVisit } from '@/components/providers/WalletProvider';
import { PUBLIC_ROOT_PAGES } from '@/lib/public-routes';

type WalletValue = { accountId: string | null; isReady: boolean; connect: () => Promise<void> };

function render(): WalletValue {
    for (let pass = 0; pass < 5; pass += 1) {
        pageState.cursor = 0;
        pageState.effectCursor = 0;
        pageState.pendingEffects = [];
        pageState.dirty = false;
        const tree = WalletProvider({ children: null, cspNonce: 'request-nonce' }) as unknown as { props: { value: WalletValue } };
        if (pageState.dirty) continue;
        for (const run of pageState.pendingEffects) run();
        return tree.props.value;
    }
    throw new Error('render_loop');
}

const V1_PAGES = ['/discover', '/upload', '/watch', '/profile'];
const V2_PAGES = ['/tickets', '/tickets/buy', '/invite', '/studio'];
const restoredSession = { wallet: { manifest: { id: 'other-wallet' } }, accounts: [{ accountId: 'saved.testnet' }] };
const connectedWallet = { manifest: { id: 'other-wallet' }, getAccounts: async () => [{ accountId: 'creator.testnet' }] };

describe('WalletProvider pages', () => {
    beforeEach(() => {
        Object.assign(window, { addEventListener: pageState.addEventListener, removeEventListener: vi.fn() });
    });
    afterEach(() => {
        for (const effect of pageState.effects) effect?.cleanup?.();
        pageState.pathname = '/';
        pageState.slots = [];
        pageState.effects = [];
        pageState.events = [];
        pageState.connectors = 0;
        pageState.connect.mockReset();
        pageState.getConnectedWallet.mockReset();
        pageState.addEventListener.mockReset();
        delete (window as Partial<Window>).addEventListener;
        delete (window as Partial<Window>).removeEventListener;
    });

    it('loads the wallet on visit only on the V1 pages', () => {
        for (const page of V1_PAGES) {
            expect(loadsWalletOnVisit(page)).toBe(true);
            expect(loadsWalletOnVisit(`${page}/`)).toBe(true);
        }
        expect(loadsWalletOnVisit('/watch/clip')).toBe(true);
        expect(PUBLIC_ROOT_PAGES.length).toBeGreaterThan(0);
        for (const page of [...PUBLIC_ROOT_PAGES, ...V2_PAGES, '/missing', '/discovery', '/tr/discover']) {
            expect(loadsWalletOnVisit(page)).toBe(false);
            expect(loadsWalletOnVisit(`${page}/`)).toBe(false);
        }
    });

    it.each([...PUBLIC_ROOT_PAGES, ...V2_PAGES])('creates no connector on %s and keeps Connect available', (page) => {
        pageState.pathname = page;
        const value = render();
        expect(pageState.connectors).toBe(0);
        expect(pageState.addEventListener).not.toHaveBeenCalled();
        expect(value).toMatchObject({ accountId: null, isReady: true });
    });

    it('creates the connector on a V1 page and keeps it after client navigation to a public page', async () => {
        pageState.pathname = '/discover';
        pageState.getConnectedWallet.mockResolvedValue(restoredSession);
        expect(render().isReady).toBe(false);
        expect(pageState.connectors).toBe(1);
        await vi.waitFor(() => expect(pageState.dirty).toBe(true));
        expect(render()).toMatchObject({ accountId: 'saved.testnet', isReady: true });
        pageState.pathname = '/';
        expect(render()).toMatchObject({ accountId: 'saved.testnet', isReady: true });
        expect(pageState.connectors).toBe(1);
        expect(pageState.events).not.toContain('remove-listeners');
    });

    it('creates the connector on Connect from a public page and connects after the pinned wallet is registered', async () => {
        pageState.getConnectedWallet.mockRejectedValue(new Error('No wallet selected'));
        pageState.connect.mockResolvedValue(connectedWallet);
        const value = render();
        const connecting = value.connect();
        expect(value.connect()).toBe(connecting);
        expect(pageState.connectors).toBe(0);
        expect(render().isReady).toBe(false);
        expect(pageState.connectors).toBe(1);
        await connecting;
        expect(pageState.events).toEqual(['register-pinned-meteor', 'connect']);
        expect(pageState.connect).toHaveBeenCalledExactlyOnceWith(undefined);
        expect(render()).toMatchObject({ accountId: 'creator.testnet', isReady: true });
    });

    it('uses a restored session instead of opening the wallet selector again', async () => {
        pageState.pathname = '/tr/apply';
        pageState.getConnectedWallet.mockResolvedValue(restoredSession);
        const connecting = render().connect();
        render();
        await connecting;
        expect(pageState.connect).not.toHaveBeenCalled();
        expect(render()).toMatchObject({ accountId: 'saved.testnet', isReady: true });
    });
});
