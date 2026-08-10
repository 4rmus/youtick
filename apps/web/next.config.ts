import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    images: { unoptimized: true },
    poweredByHeader: false,
    async headers() {
        return [{
            source: '/(.*)',
            headers: [
                { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
            ],
        }];
    },
};

export default nextConfig;
