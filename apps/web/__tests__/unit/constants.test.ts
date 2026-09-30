import { afterEach, describe, expect, it, vi } from 'vitest';

const KEYS = [
    'NEXT_PUBLIC_NEAR_NETWORK',
    'NEXT_PUBLIC_MARKET_CONTRACT_ID',
    'NEXT_PUBLIC_ACCESS_CONTRACT_ID',
    'NEXT_PUBLIC_USDC_CONTRACT_ID',
    'NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1',
    'NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL',
    'NEXT_PUBLIC_ENABLE_CURRENT_CATALOG',
    'NEXT_PUBLIC_VIDEO_ENVIRONMENT',
    'NEXT_PUBLIC_MARKET_READ_MODEL_URL',
    'NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2',
    'NEXT_PUBLIC_ENABLE_PLAYBACK_SHADOW_V2',
    'NEXT_PUBLIC_ENABLE_LIVEPEER_NEAR_CREATOR_FEE',
    'NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS',
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

    it('keeps runtime gates disabled unless explicitly enabled', async () => {
        clearEnv();
        process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID = 'market.near';
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = 'access.near';
        const { FEATURE_FLAGS, MEDIA_UPLOAD_POLICY } = await import('@/lib/constants');
        expect(FEATURE_FLAGS).toEqual({
            publicTestnetVideoV1: false,
            enablePaidMediaLivepeerV1: false,
            enablePlaybackAuthorizerV2: false,
            enablePlaybackShadowV2: false,
            enableLivepeerNearCreatorFee: false,
            enableSponsoredLivepeerUploads: false,
            publicTestnetBeta: false,
            enableDerivedReadModel: false,
            enableCurrentCatalog: false,
            enableAccountReadModel: false,
        });
        expect(MEDIA_UPLOAD_POLICY.livepeerTusChunkBytes).toBe(32 * 1024 * 1024);
    });

    it.each([
        { current: false, derived: true, publicTestnet: true, paid: true, expected: false },
        { current: true, derived: false, publicTestnet: true, paid: true, expected: false },
        { current: true, derived: true, publicTestnet: false, paid: true, expected: false },
        { current: true, derived: true, publicTestnet: true, paid: false, expected: false },
        { current: true, derived: true, publicTestnet: true, paid: true, expected: true },
    ])('gates current catalogue reads on the complete public-testnet selection: %j', async flags => {
        clearEnv();
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
        process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID = 'market.testnet';
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = 'access.testnet';
        process.env.NEXT_PUBLIC_MARKET_READ_MODEL_URL = 'https://read.test';
        process.env.NEXT_PUBLIC_ENABLE_CURRENT_CATALOG = String(flags.current);
        process.env.NEXT_PUBLIC_ENABLE_DERIVED_READ_MODEL = String(flags.derived);
        process.env.NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1 = String(flags.paid);
        if (flags.publicTestnet) process.env.NEXT_PUBLIC_VIDEO_ENVIRONMENT = 'public-testnet';
        const { FEATURE_FLAGS } = await import('@/lib/constants');
        expect(FEATURE_FLAGS.enableCurrentCatalog).toBe(flags.expected);
    });

    it('derives public beta only from the existing combined testnet packet', async () => {
        clearEnv();
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
        process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID = 'market.testnet';
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = 'access.testnet';
        process.env.NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1 = 'true';
        process.env.NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2 = 'true';
        process.env.NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS = 'true';
        const { FEATURE_FLAGS } = await import('@/lib/constants');
        expect(FEATURE_FLAGS.publicTestnetBeta).toBe(true);
        const { validateLivepeerSourceFile } = await import('@/lib/livepeer-upload');
        expect(validateLivepeerSourceFile({ name: 'beta.mp4', type: 'video/mp4', size: 1_000_000_000 }))
            .toEqual({ ok: true, sourceType: 'mp4' });
        expect(validateLivepeerSourceFile({ name: 'beta.mp4', type: 'video/mp4', size: 1_000_000_001 }))
            .toEqual({ ok: false, error: 'source_limit_exceeded' });
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
