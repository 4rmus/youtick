import { afterEach, describe, expect, it, vi } from 'vitest';

describe('RPC failover endpoints', () => {
    afterEach(() => {
        vi.resetModules();
        delete process.env.NEXT_PUBLIC_NEAR_NETWORK;
    });

    it('uses CORS-compatible mainnet endpoints for browser calls', async () => {
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'mainnet';

        const { getPrimaryRpcUrl, RPC_ENDPOINTS } = await import('@/lib/rpc-failover');

        expect(getPrimaryRpcUrl()).toBe('https://free.rpc.fastnear.com');
        expect(RPC_ENDPOINTS).toEqual(['https://free.rpc.fastnear.com']);
        expect(RPC_ENDPOINTS).not.toContain('https://rpc.mainnet.near.org');
    });

    it('uses CORS-compatible testnet endpoints for browser calls', async () => {
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';

        const { getPrimaryRpcUrl, RPC_ENDPOINTS } = await import('@/lib/rpc-failover');

        expect(getPrimaryRpcUrl()).toBe('https://test.rpc.fastnear.com');
        expect(RPC_ENDPOINTS).toEqual(['https://test.rpc.fastnear.com']);
        expect(RPC_ENDPOINTS).not.toContain('https://rpc.testnet.near.org');
    });
});
