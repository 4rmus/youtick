import { afterEach, describe, expect, it, vi } from 'vitest';

const KEYS = [
    'NEXT_PUBLIC_NEAR_NETWORK',
    'NEXT_PUBLIC_MARKET_CONTRACT_ID',
    'NEXT_PUBLIC_ACCESS_CONTRACT_ID',
    'NEXT_PUBLIC_USDC_CONTRACT_ID',
    'NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1',
    'NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL',
    'NEXT_PUBLIC_MARKET_READ_MODEL_URL',
    'NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2',
    'NEXT_PUBLIC_ENABLE_PLAYBACK_SHADOW_V2',
    'NEXT_PUBLIC_ENABLE_LIVEPEER_NEAR_CREATOR_FEE',
] as const;

function clearEnv() { for (const key of KEYS) delete process.env[key]; }

describe('Livepeer-only configuration', () => {
    afterEach(() => { vi.resetModules(); clearEnv(); });

    it('fails closed without explicit market and access contracts', async () => {
        clearEnv();
        await expect(import('@/lib/constants')).rejects.toThrow('NEXT_PUBLIC_MARKET_CONTRACT_ID is required');
        vi.resetModules();
        process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID = 'market.testnet';
        await expect(import('@/lib/constants')).rejects.toThrow('NEXT_PUBLIC_ACCESS_CONTRACT_ID is required');
    });

    it('exposes only the market, access and USDC contract IDs', async () => {
        clearEnv();
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
        process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID = 'market.testnet';
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = 'access.testnet';
        const { NEAR_CONFIG, NEAR_NETWORK } = await import('@/lib/constants');
        expect(NEAR_NETWORK).toBe('testnet');
        expect(Object.keys(NEAR_CONFIG).sort()).toEqual(['accessContractId', 'marketContractId', 'usdcContractId']);
        expect(NEAR_CONFIG.marketContractId).toBe('market.testnet');
        expect(NEAR_CONFIG.accessContractId).toBe('access.testnet');
    });

    it('keeps both runtime gates disabled unless explicitly enabled', async () => {
        clearEnv();
        process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID = 'market.near';
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = 'access.near';
        const { FEATURE_FLAGS, MEDIA_UPLOAD_POLICY } = await import('@/lib/constants');
        expect(FEATURE_FLAGS).toEqual({
            enablePaidMediaLivepeerV1: false,
            enablePlaybackAuthorizerV2: false,
            enablePlaybackShadowV2: false,
            enableLivepeerNearCreatorFee: false,
            enableDerivedReadModel: false,
        });
        expect(MEDIA_UPLOAD_POLICY.livepeerTusChunkBytes).toBe(32 * 1024 * 1024);
    });

    it('requires an exact HTTPS read-model origin only when its gate is enabled', async () => {
        clearEnv();
        process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID = 'market.testnet';
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = 'access.testnet';
        process.env.NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL = 'true';
        await expect(import('@/lib/constants')).rejects.toThrow(
            'NEXT_PUBLIC_MARKET_READ_MODEL_URL is required',
        );
        vi.resetModules();
        process.env.NEXT_PUBLIC_MARKET_READ_MODEL_URL = 'http://read.test';
        await expect(import('@/lib/constants')).rejects.toThrow(
            'NEXT_PUBLIC_MARKET_READ_MODEL_URL must be an HTTPS origin',
        );
    });
});
