import { afterEach, describe, expect, it, vi } from 'vitest';

const KEYS = [
    'NEXT_PUBLIC_NEAR_NETWORK',
    'NEXT_PUBLIC_MARKET_CONTRACT_ID',
    'NEXT_PUBLIC_ACCESS_CONTRACT_ID',
    'NEXT_PUBLIC_USDC_CONTRACT_ID',
    'NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1',
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
            enableLivepeerNearCreatorFee: false,
        });
        expect(MEDIA_UPLOAD_POLICY.livepeerTusChunkBytes).toBe(32 * 1024 * 1024);
    });
});
