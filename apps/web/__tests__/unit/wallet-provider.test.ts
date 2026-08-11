import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

const walletTestState = vi.hoisted(() => ({
    cleanup: undefined as void | (() => void),
    connectorOptions: undefined as undefined | Record<string, unknown>,
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
        whenManifestLoaded = Promise.resolve();

        constructor(options: Record<string, unknown>) {
            walletTestState.connectorOptions = options;
        }

        getConnectedWallet() { return new Promise(() => {}); }
        on() {}
        removeAllListeners() {}
    },
}));

import { WalletProvider } from '@/components/providers/WalletProvider';

describe('WalletProvider CSP initialization', () => {
    afterEach(() => {
        walletTestState.cleanup?.();
        walletTestState.cleanup = undefined;
        walletTestState.connectorOptions = undefined;
        walletTestState.stateSetters = [];
        vi.useRealTimers();
    });

    it('passes the request nonce and stops waiting for a stale wallet restore', async () => {
        vi.useFakeTimers();

        WalletProvider({ children: null, cspNonce: 'request-nonce' });
        await vi.advanceTimersByTimeAsync(5_000);

        expect(walletTestState.connectorOptions).toMatchObject({ cspNonce: 'request-nonce' });
        expect(walletTestState.stateSetters[1]).toHaveBeenCalledWith(true);
    });

    it('reads the middleware nonce in the root layout', async () => {
        const layout = await readFile('app/layout.tsx', 'utf8');

        expect(layout).toContain("(await headers()).get('x-nonce')");
        expect(layout).toContain('<WalletProvider cspNonce={cspNonce}>');
    });
});
