import { afterEach, expect, it, vi } from 'vitest';

const initialize = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@opennextjs/cloudflare', () => ({ initOpenNextCloudflareForDev: initialize }));
afterEach(() => { vi.unstubAllEnvs(); });

it.each([
    ['development', 'true', 'testnet', true],
    ['development', 'false', 'testnet', false],
    ['development', 'true', 'mainnet', false],
    ['production', 'true', 'testnet', false],
    ['test', 'true', 'testnet', false],
] as const)('initializes local bindings only for the closed testnet lab: %s / %s / %s', async (environment, enabled, network, expected) => {
    vi.resetModules(); initialize.mockClear();
    vi.stubEnv('NODE_ENV', environment); vi.stubEnv('NEAR_AUTH_LAB_ENABLED', enabled); vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', network);
    await import('../../next.config');
    expect(initialize).toHaveBeenCalledTimes(expected ? 1 : 0);
    if (expected) expect(initialize).toHaveBeenCalledWith({ environment: 'preview', remoteBindings: false, persist: false });
});


it.each([
    ['development', 'true', 'testnet', 'public-testnet', true],
    ['development', 'false', 'testnet', 'public-testnet', false],
    ['development', 'true', 'mainnet', 'public-testnet', false],
    ['development', 'true', 'testnet', 'production', false],
    ['production', 'true', 'testnet', 'public-testnet', false],
] as const)('keeps product dev bindings local and testnet-only: %s/%s/%s/%s', async (environment, enabled, network, video, expected) => {
    vi.resetModules(); initialize.mockClear();
    vi.stubEnv('NODE_ENV', environment); vi.stubEnv('NEAR_AUTH_LAB_ENABLED', 'false');
    vi.stubEnv('NEAR_AUTH_V1_ENABLED', enabled); vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', network);
    vi.stubEnv('NEXT_PUBLIC_VIDEO_ENVIRONMENT', video);
    await import('../../next.config');
    expect(initialize).toHaveBeenCalledTimes(expected ? 1 : 0);
    if (expected) expect(initialize).toHaveBeenCalledWith({ environment: 'preview', remoteBindings: false, persist: false });
});

it.each(['development', 'production'] as const)('uses a supplied local binding config only in development: %s', async environment => {
    vi.resetModules(); initialize.mockClear();
    vi.stubEnv('NODE_ENV', environment); vi.stubEnv('NEAR_AUTH_LAB_ENABLED', 'false');
    vi.stubEnv('NEAR_AUTH_V1_ENABLED', 'true'); vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', 'testnet');
    vi.stubEnv('NEXT_PUBLIC_VIDEO_ENVIRONMENT', 'public-testnet');
    vi.stubEnv('NEAR_AUTH_LOCAL_BINDINGS_CONFIG', '/tmp/synthetic-web.json');
    await import('../../next.config');
    if (environment === 'development') expect(initialize).toHaveBeenCalledWith({ configPath: '/tmp/synthetic-web.json', remoteBindings: false, persist: false });
    else expect(initialize).not.toHaveBeenCalled();
});
