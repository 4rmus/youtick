import { jwtDecrypt } from 'jose';
import { NEAR_AUTH_LAB_DOMAIN } from './near-auth-lab';
import { authSessionSettings, type AuthSurface } from './near-auth-session-settings';

// Server route consumers only: never return the verified subject to the browser.
export async function readNearAuthLabSession(request: Request): Promise<string | null> {
    return (await readNearAuthSession(request, 'lab'))?.subject ?? null;
}

export async function readNearAuthSession(request: Request, surface: AuthSurface) {
    const settings = authSessionSettings(surface);
    const value = request.headers.get('cookie')?.split(';').map((part) => part.trim())
        .find((part) => part.startsWith(`${settings.cookie}=`))?.slice(settings.cookie.length + 1);
    if (!value) return null;
    const secret = settings.secret;
    const clientId = settings.clientId;
    if (value.length > 4096 || !/^[a-f0-9]{64}$/.test(secret) || !/^[A-Za-z0-9_-]{1,128}$/.test(clientId)) {
        throw new Error('invalid_session');
    }
    const key = new Uint8Array(secret.match(/../g)!.map((byte) => parseInt(byte, 16)));
    const { payload } = await jwtDecrypt(value, key, {
        issuer: settings.issuer, audience: new URL(request.url).origin,
        keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'],
        requiredClaims: ['sub', 'iat', 'exp'], maxTokenAge: 3600,
    });
    if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 512
        || payload.identity_issuer !== `https://${NEAR_AUTH_LAB_DOMAIN}/` || payload.client_id !== clientId) {
        throw new Error('invalid_session');
    }
    return { subject: payload.sub, expiresAt: payload.exp! * 1000 };
}
