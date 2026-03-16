import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
    'NEXT_PUBLIC_NEAR_NETWORK',
    'NEXT_PUBLIC_NFT_CONTRACT_ID',
    'NEXT_PUBLIC_MARKET_CONTRACT_ID',
    'NEXT_PUBLIC_ACCESS_CONTRACT_ID',
    'NEXT_PUBLIC_REGISTRY_CONTRACT_ID',
] as const;

function resetNearEnv(): void {
    for (const key of ENV_KEYS) {
        delete process.env[key];
    }
}

describe('NEAR_CONFIG', () => {
    afterEach(() => {
        vi.resetModules();
        resetNearEnv();
    });

    it('defaults to testnet-first contract IDs', async () => {
        resetNearEnv();

        const { NEAR_CONFIG } = await import('@/lib/constants');

        expect(NEAR_CONFIG.networkId).toBe('testnet');
        expect(NEAR_CONFIG.contractId).toBe('v1.utick.testnet');
        expect(NEAR_CONFIG.marketContractId).toBe('v1.utick.testnet');
        expect(NEAR_CONFIG.accessContractId).toBe('access.v1.utick.testnet');
        expect(NEAR_CONFIG.registryContractId).toBe('registry.v1.utick.testnet');
    });

    it('respects explicit mainnet contract overrides', async () => {
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'mainnet';
        process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID = 'market.youtick.near';
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = 'access.youtick.near';
        process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID = 'registry.youtick.near';

        const { NEAR_CONFIG } = await import('@/lib/constants');

        expect(NEAR_CONFIG.networkId).toBe('mainnet');
        expect(NEAR_CONFIG.contractId).toBe('market.youtick.near');
        expect(NEAR_CONFIG.marketContractId).toBe('market.youtick.near');
        expect(NEAR_CONFIG.accessContractId).toBe('access.youtick.near');
        expect(NEAR_CONFIG.registryContractId).toBe('registry.youtick.near');
    });

    it('keeps NEXT_PUBLIC_NFT_CONTRACT_ID as a compatibility alias for the market contract', async () => {
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
        process.env.NEXT_PUBLIC_NFT_CONTRACT_ID = 'legacy-market.testnet';

        const { NEAR_CONFIG } = await import('@/lib/constants');

        expect(NEAR_CONFIG.contractId).toBe('legacy-market.testnet');
        expect(NEAR_CONFIG.marketContractId).toBe('legacy-market.testnet');
        expect(NEAR_CONFIG.accessContractId).toBe('access.v1.utick.testnet');
        expect(NEAR_CONFIG.registryContractId).toBe('registry.v1.utick.testnet');
    });
});
