import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
    'NEXT_PUBLIC_NEAR_NETWORK',
    'NEXT_PUBLIC_NFT_CONTRACT_ID',
    'NEXT_PUBLIC_MARKET_CONTRACT_ID',
    'NEXT_PUBLIC_ACCESS_CONTRACT_ID',
    'NEXT_PUBLIC_REGISTRY_CONTRACT_ID',
    'NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT',
    'NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PERSISTENCE',
    'NEXT_PUBLIC_STORAGE_API_URL',
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

    it('defaults to mainnet contract IDs', async () => {
        resetNearEnv();

        const { NEAR_CONFIG } = await import('@/lib/constants');

        expect(NEAR_CONFIG.networkId).toBe('mainnet');
        expect(NEAR_CONFIG.contractId).toBe('youtick.near');
        expect(NEAR_CONFIG.marketContractId).toBe('youtick.near');
        expect(NEAR_CONFIG.accessContractId).toBe('access.youtick.near');
        expect(NEAR_CONFIG.registryContractId).toBe('registry.youtick.near');
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
        expect(NEAR_CONFIG.accessContractId).toBe('access-1773606802388.v2-0.utick.testnet');
        expect(NEAR_CONFIG.registryContractId).toBe('registry-1773606802388.v2-0.utick.testnet');
    });
});

describe('FEATURE_FLAGS', () => {
    afterEach(() => {
        vi.resetModules();
        resetNearEnv();
    });

    it('keeps cross-chain checkout disabled by default', async () => {
        resetNearEnv();

        const { FEATURE_FLAGS } = await import('@/lib/constants');

        expect(FEATURE_FLAGS.enableCrossChainCheckout).toBe(false);
    });

    it('enables cross-chain checkout only when explicitly set to true', async () => {
        process.env.NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT = 'true';

        const { FEATURE_FLAGS } = await import('@/lib/constants');

        expect(FEATURE_FLAGS.enableCrossChainCheckout).toBe(true);
    });

    it('keeps cross-chain checkout disabled when explicitly set to false', async () => {
        process.env.NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT = 'false';

        const { FEATURE_FLAGS } = await import('@/lib/constants');

        expect(FEATURE_FLAGS.enableCrossChainCheckout).toBe(false);
    });

    it('keeps Lighthouse persistence disabled by default', async () => {
        resetNearEnv();

        const { FEATURE_FLAGS, APP_CONFIG } = await import('@/lib/constants');

        expect(FEATURE_FLAGS.enableLighthousePersistence).toBe(false);
        expect(APP_CONFIG.storageApiUrl).toBe('');
    });

    it('enables Lighthouse persistence only when explicitly configured', async () => {
        process.env.NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PERSISTENCE = 'true';
        process.env.NEXT_PUBLIC_STORAGE_API_URL = 'https://storage-api.example';

        const { FEATURE_FLAGS, APP_CONFIG } = await import('@/lib/constants');

        expect(FEATURE_FLAGS.enableLighthousePersistence).toBe(true);
        expect(APP_CONFIG.storageApiUrl).toBe('https://storage-api.example');
    });
});
