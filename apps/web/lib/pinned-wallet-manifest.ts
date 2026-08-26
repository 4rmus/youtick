import source from './pinned-wallet-manifest.json';

export const PINNED_WALLET_MANIFEST = source.manifest;
export const PINNED_METEOR_EXECUTOR_SHA256 = source.executorSha256;

export function isPinnedMeteorManifest(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const manifest = value as Record<string, unknown>;
    const pinned = PINNED_WALLET_MANIFEST.wallets[0];
    return manifest.id === pinned.id
        && manifest.type === pinned.type
        && manifest.version === pinned.version
        && manifest.executor === pinned.executor
        && manifest.debug !== true;
}
