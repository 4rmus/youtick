import type { NextConfig } from 'next';

const isDevelopment = process.env.NODE_ENV !== 'production';
const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "media-src 'self' blob: https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
    async headers() {
        return [{ source: '/:path*', headers: [{ key: 'Content-Security-Policy', value: csp }] }];
    },
    images: { unoptimized: true },
    poweredByHeader: false,
};

export default nextConfig;
