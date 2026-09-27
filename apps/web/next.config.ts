import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

if (process.env.NODE_ENV === 'development' && (process.env.NEAR_AUTH_LAB_ENABLED === 'true'
    || (process.env.NEAR_AUTH_V1_ENABLED === 'true' && process.env.NEXT_PUBLIC_VIDEO_ENVIRONMENT === 'public-testnet'))
    && process.env.NEXT_PUBLIC_NEAR_NETWORK === 'testnet') {
    // Reuse local rate-limit bindings; the Preview environment is not deployed or contacted.
    void initOpenNextCloudflareForDev({
        ...(process.env.NEAR_AUTH_LOCAL_BINDINGS_CONFIG
            ? { configPath: process.env.NEAR_AUTH_LOCAL_BINDINGS_CONFIG }
            : { environment: 'preview' }),
        remoteBindings: false, persist: false,
    });
}

const nextConfig: NextConfig = {
    images: { unoptimized: true },
    poweredByHeader: false,
};

export default nextConfig;
