import { jwtDecrypt } from 'jose';
import { NEAR_AUTH_LAB_DOMAIN } from './near-auth-lab';

// Server route consumers only: never return the verified subject to the browser.
export async function readNearAuthLabSession(request: Request): Promise<string | null> {
    const value = request.headers.get('cookie')?.split(';').map((part) => part.trim())
        .find((part) => part.startsWith('youtick_auth_lab='))?.slice('youtick_auth_lab='.length);
    if (!value) return null;
    const secret = process.env.NEAR_AUTH_LAB_SESSION_SECRET || '';
    const clientId = process.env.NEAR_AUTH_LAB_CLIENT_ID || '';
    if (value.length > 4096 || !/^[a-f0-9]{64}$/.test(secret) || !/^[A-Za-z0-9_-]{1,128}$/.test(clientId)) {
        throw new Error('invalid_session');
    }
    const key = new Uint8Array(secret.match(/../g)!.map((byte) => parseInt(byte, 16)));
    const { payload } = await jwtDecrypt(value, key, {
        issuer: 'youtick-auth-lab', audience: new URL(request.url).origin,
        keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'],
        requiredClaims: ['sub', 'iat', 'exp'], maxTokenAge: 3600,
    });
    if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 512
        || payload.identity_issuer !== `https://${NEAR_AUTH_LAB_DOMAIN}/` || payload.client_id !== clientId) {
        throw new Error('invalid_session');
    }
    return payload.sub;
}
