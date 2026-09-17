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
