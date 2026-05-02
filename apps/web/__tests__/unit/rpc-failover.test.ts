import { afterEach, describe, expect, it, vi } from 'vitest';

describe('RPC failover endpoints', () => {
    afterEach(() => {
        delete (globalThis.window as { location?: unknown }).location;
        vi.resetModules();
        delete process.env.NEXT_PUBLIC_NEAR_NETWORK;
    });

    it('uses the same-origin mainnet RPC proxy for browser calls', async () => {
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'mainnet';

        const { getPrimaryRpcUrl, RPC_ENDPOINTS } = await import('@/lib/rpc-failover');

        expect(getPrimaryRpcUrl()).toBe('https://youtick.net/api/near-rpc');
        expect(RPC_ENDPOINTS).toEqual(['/api/near-rpc']);
        expect(RPC_ENDPOINTS).not.toContain('https://free.rpc.fastnear.com');
        expect(RPC_ENDPOINTS).not.toContain('https://rpc.mainnet.near.org');
    });

    it('uses the same-origin testnet RPC proxy for browser calls', async () => {
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';

        const { getPrimaryRpcUrl, RPC_ENDPOINTS } = await import('@/lib/rpc-failover');

        expect(getPrimaryRpcUrl()).toBe('https://youtick.net/api/near-rpc');
        expect(RPC_ENDPOINTS).toEqual(['/api/near-rpc']);
        expect(RPC_ENDPOINTS).not.toContain('https://test.rpc.fastnear.com');
        expect(RPC_ENDPOINTS).not.toContain('https://rpc.testnet.near.org');
    });

    it('resolves the proxy against the current browser origin', async () => {
        (globalThis.window as { location?: { origin: string } }).location = {
            origin: 'https://preview.youtick-static.pages.dev',
        };
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'mainnet';

        const { getPrimaryRpcUrl } = await import('@/lib/rpc-failover');

        expect(getPrimaryRpcUrl()).toBe('https://preview.youtick-static.pages.dev/api/near-rpc');
    });
});
