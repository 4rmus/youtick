import type { NextConfig } from 'next';

// Applied to every route, including /api (the CSP middleware skips API routes).
// Fullscreen, picture-in-picture and clipboard-write stay at the browser default for the player and copy buttons.
export const SECURITY_HEADERS = [
    { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), hid=(), serial=(), bluetooth=(), browsing-topics=()',
    },
];

const nextConfig: NextConfig = {
    images: { unoptimized: true },
    poweredByHeader: false,
    async headers() {
        return [{ source: '/:path*', headers: SECURITY_HEADERS }];
    },
};

export default nextConfig;
