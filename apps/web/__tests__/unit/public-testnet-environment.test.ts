import { afterEach, describe, expect, it, vi } from 'vitest';

describe('public testnet environment identity', () => {
    afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

    it('keeps the public 5 GB identity when operation switches change', async () => {
        vi.stubEnv('NEXT_PUBLIC_VIDEO_ENVIRONMENT', 'public-testnet');
        vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', 'testnet');
        for (const enabled of ['false', 'true']) {
            vi.stubEnv('NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1', enabled);
            vi.stubEnv('NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2', enabled);
            vi.stubEnv('NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS', enabled);
            vi.resetModules();
            const { FEATURE_FLAGS, MEDIA_UPLOAD_POLICY } = await import('@/lib/constants');
            expect(FEATURE_FLAGS.publicTestnetVideoV1).toBe(true);
            expect(FEATURE_FLAGS.publicTestnetBeta).toBe(false);
            expect(MEDIA_UPLOAD_POLICY.paidSourceMaxBytes).toBe(5_000_000_000);
        }
    });

    it('preserves legacy beta detection and rejects the public identity on mainnet', async () => {
        vi.stubEnv('NEXT_PUBLIC_VIDEO_ENVIRONMENT', '');
        vi.stubEnv('NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1', 'true');
        vi.stubEnv('NEXT_PUBLIC_ENABLE_PLAYBACK_AUTHORIZER_V2', 'true');
        vi.stubEnv('NEXT_PUBLIC_ENABLE_SPONSORED_LIVEPEER_UPLOADS', 'true');
        vi.resetModules();
        const legacy = await import('@/lib/constants');
        expect(legacy.FEATURE_FLAGS.publicTestnetBeta).toBe(true);
        expect(legacy.MEDIA_UPLOAD_POLICY.paidSourceMaxBytes).toBe(20_000_000_000);
        vi.stubEnv('NEXT_PUBLIC_VIDEO_ENVIRONMENT', 'public-testnet');
        vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', 'mainnet');
        vi.resetModules();
        await expect(import('@/lib/constants')).rejects.toThrow('public_testnet_network_mismatch');
    });
});
