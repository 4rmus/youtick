import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
    'NEXT_PUBLIC_NEAR_NETWORK',
    'NEXT_PUBLIC_NFT_CONTRACT_ID',
    'NEXT_PUBLIC_MARKET_CONTRACT_ID',
    'NEXT_PUBLIC_ACCESS_CONTRACT_ID',
    'NEXT_PUBLIC_REGISTRY_CONTRACT_ID',
    'NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT',
    'NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PERSISTENCE',
    'NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PRIMARY_UPLOAD',
    'NEXT_PUBLIC_STORAGE_API_URL',
    'NEXT_PUBLIC_ENABLE_MEDIA_DELIVERY_WORKER',
    'NEXT_PUBLIC_MEDIA_DELIVERY_URL',
    'NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1',
    'NEXT_PUBLIC_ENABLE_LIVEPEER_NEAR_CREATOR_FEE',
    'NEXT_PUBLIC_LIVEPEER_BRIDGE_URL',
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
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = 'access.local.testnet';
        process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID = 'registry.local.testnet';

        const { NEAR_CONFIG } = await import('@/lib/constants');

        expect(NEAR_CONFIG.contractId).toBe('legacy-market.testnet');
        expect(NEAR_CONFIG.marketContractId).toBe('legacy-market.testnet');
        expect(NEAR_CONFIG.accessContractId).toBe('access.local.testnet');
        expect(NEAR_CONFIG.registryContractId).toBe('registry.local.testnet');
    });

    it('uses placeholder testnet contract IDs instead of stale dev accounts', async () => {
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';

        const { NEAR_CONFIG } = await import('@/lib/constants');

        expect(NEAR_CONFIG.contractId).toBe('replace-with-market.testnet');
        expect(NEAR_CONFIG.marketContractId).toBe('replace-with-market.testnet');
        expect(NEAR_CONFIG.accessContractId).toBe('replace-with-access.testnet');
        expect(NEAR_CONFIG.registryContractId).toBe('replace-with-registry.testnet');
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

    it('keeps Livepeer disabled with the locked 32 MiB chunk default', async () => {
        resetNearEnv();

        const { APP_CONFIG, FEATURE_FLAGS, MEDIA_UPLOAD_POLICY } = await import('@/lib/constants');

        expect(FEATURE_FLAGS.enablePaidMediaLivepeerV1).toBe(false);
        expect(FEATURE_FLAGS.enableLivepeerNearCreatorFee).toBe(false);
        expect(APP_CONFIG.livepeerBridgeUrl).toBe('');
        expect(MEDIA_UPLOAD_POLICY.livepeerTusChunkBytes).toBe(32 * 1024 * 1024);
    });

    it('enables the NEAR creator-fee rail only when explicitly configured', async () => {
        process.env.NEXT_PUBLIC_ENABLE_LIVEPEER_NEAR_CREATOR_FEE = 'true';

        const { FEATURE_FLAGS } = await import('@/lib/constants');

        expect(FEATURE_FLAGS.enableLivepeerNearCreatorFee).toBe(true);
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

    it('uses Lighthouse upload as the default storage path', async () => {
        resetNearEnv();

        const { FEATURE_FLAGS, APP_CONFIG } = await import('@/lib/constants');

        expect(FEATURE_FLAGS.enableLighthousePersistence).toBe(false);
        expect(FEATURE_FLAGS.enableLighthousePrimaryUpload).toBe(true);
        expect(APP_CONFIG.storageApiUrl).toBe('');
        expect(FEATURE_FLAGS.enableMediaDeliveryWorker).toBe(false);
        expect(APP_CONFIG.mediaDeliveryUrl).toBe('');
    });

    it('enables Lighthouse persistence only when explicitly configured', async () => {
        process.env.NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PERSISTENCE = 'true';
        process.env.NEXT_PUBLIC_STORAGE_API_URL = 'https://storage-api.example';

        const { FEATURE_FLAGS, APP_CONFIG } = await import('@/lib/constants');

        expect(FEATURE_FLAGS.enableLighthousePersistence).toBe(true);
        expect(APP_CONFIG.storageApiUrl).toBe('https://storage-api.example');
    });

    it('can explicitly disable Lighthouse primary upload', async () => {
        process.env.NEXT_PUBLIC_ENABLE_LIGHTHOUSE_PRIMARY_UPLOAD = 'false';

        const { FEATURE_FLAGS } = await import('@/lib/constants');

        expect(FEATURE_FLAGS.enableLighthousePrimaryUpload).toBe(false);
    });

    it('enables media delivery worker only when explicitly configured', async () => {
        process.env.NEXT_PUBLIC_ENABLE_MEDIA_DELIVERY_WORKER = 'true';
        process.env.NEXT_PUBLIC_MEDIA_DELIVERY_URL = 'https://media.youtick.net';

        const { FEATURE_FLAGS, APP_CONFIG } = await import('@/lib/constants');

        expect(FEATURE_FLAGS.enableMediaDeliveryWorker).toBe(true);
        expect(APP_CONFIG.mediaDeliveryUrl).toBe('https://media.youtick.net');
    });
});
