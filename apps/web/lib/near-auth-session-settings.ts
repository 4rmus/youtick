import { nearAuthLabEnabled } from './near-auth-lab';

export type AuthSurface = 'lab' | 'product';
export function productSessionSettings() {
    if (process.env.NEAR_AUTH_V1_ENABLED !== 'true' || process.env.NEAR_AUTH_LAB_ENABLED === 'true'
        || process.env.NEXT_PUBLIC_NEAR_NETWORK !== 'testnet'
        || process.env.NEXT_PUBLIC_VIDEO_ENVIRONMENT !== 'public-testnet') return null;
    const clientId = process.env.NEAR_AUTH_V1_CLIENT_ID || '';
    const secret = process.env.NEAR_AUTH_V1_SESSION_SECRET || '';
    const origin = process.env.NEAR_AUTH_V1_ORIGIN || '';
    try {
        const url = new URL(origin);
        if (url.origin !== origin || url.username || url.password || (url.protocol !== 'https:'
            && !(process.env.NODE_ENV === 'development' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) return null;
    } catch { return null; }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(clientId) || !/^[a-f0-9]{64}$/.test(secret)) return null;
    return { clientId, secret, origin };
}

export function authSessionSettings(surface: AuthSurface) {
    return surface === 'product'
        ? { cookie: 'youtick_auth_v1', path: '/api/auth', issuer: 'youtick-auth-v1',
            clientId: process.env.NEAR_AUTH_V1_CLIENT_ID || '', secret: process.env.NEAR_AUTH_V1_SESSION_SECRET || '' }
        : { cookie: 'youtick_auth_lab', path: '/api/auth-lab', issuer: 'youtick-auth-lab',
            clientId: process.env.NEAR_AUTH_LAB_CLIENT_ID || '', secret: process.env.NEAR_AUTH_LAB_SESSION_SECRET || '' };
}

export function authSurfaceAllowed(url: URL, surface: AuthSurface): boolean {
    if (surface === 'product') return productSessionSettings()?.origin === url.origin;
    return nearAuthLabEnabled(process.env.NODE_ENV, process.env.NEAR_AUTH_LAB_ENABLED, process.env.NEXT_PUBLIC_NEAR_NETWORK)
        && ['localhost', '127.0.0.1'].includes(url.hostname);
}
