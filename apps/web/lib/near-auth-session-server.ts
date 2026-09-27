import { createRemoteJWKSet, EncryptJWT, jwtVerify } from 'jose';
import { NEAR_AUTH_LAB_DOMAIN } from './near-auth-lab';
import { authSessionSettings, authSurfaceAllowed, type AuthSurface } from './near-auth-session-settings';

import { readNearAuthSession } from './near-auth-lab-session';

const ISSUER = `https://${NEAR_AUTH_LAB_DOMAIN}/`;
const KEYS = createRemoteJWKSet(new URL('.well-known/jwks.json', ISSUER), { timeoutDuration: 5_000 });
const MAX_BODY_BYTES = 16 * 1024;
const SESSION_SECONDS = 3600;

function json(value: object, status = 200, cookie?: string) {
    return Response.json(value, { status, headers: {
        'Cache-Control': 'no-store', Vary: 'Cookie',
        ...(cookie ? { 'Set-Cookie': cookie } : {}),
    } });
}

function cookie(value: string, maxAge: number, url: URL, surface: AuthSurface) {
    const settings = authSessionSettings(surface);
    return `${settings.cookie}=${value}; Path=${settings.path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${url.protocol === 'https:' ? '; Secure' : ''}`;
}

async function readToken(request: Request): Promise<string> {
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new Error('invalid_request');
    const reader = request.body?.getReader();
    if (!reader) throw new Error('invalid_request');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('body_too_large'); }
            chunks.push(value);
        }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1
        || !('idToken' in body) || typeof body.idToken !== 'string' || !body.idToken) throw new Error('invalid_request');
    return body.idToken;
}

export async function handleNearAuthSession(request: Request, surface: AuthSurface): Promise<Response> {
    const url = new URL(request.url);
    if (!authSurfaceAllowed(url, surface)) return json({ error: 'not_found' }, 404);
    if (request.method !== 'GET' && request.headers.get('origin') !== url.origin) return json({ error: 'origin_denied' }, 403);
    if (request.method === 'DELETE') return json({ authenticated: false }, 200, cookie('', 0, url, surface));

    const { clientId, secret, issuer } = authSessionSettings(surface);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(clientId) || !/^[a-f0-9]{64}$/.test(secret)) {
        return json({ error: 'session_not_configured' }, 503);
    }
    const key = new Uint8Array(secret.match(/../g)!.map((byte) => parseInt(byte, 16)));

    if (request.method === 'GET') {
        try {
            return json({ authenticated: Boolean(await readNearAuthSession(request, surface)) });
        } catch { return json({ authenticated: false }, 200, cookie('', 0, url, surface)); }
    }

    let token: string;
    try { token = await readToken(request); }
    catch (error) { return json({ error: 'invalid_request' }, error instanceof Error && error.message === 'body_too_large' ? 413 : 400); }
    try {
        const { payload } = await jwtVerify(token, KEYS, {
            issuer: ISSUER, audience: clientId, algorithms: ['RS256'],
            requiredClaims: ['iss', 'aud', 'sub', 'iat', 'exp'], maxTokenAge: SESSION_SECONDS, clockTolerance: 5,
        });
        if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 512
            || (payload.azp !== undefined && payload.azp !== clientId)
            || (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId)) throw new Error('invalid_identity');
        const now = Math.floor(Date.now() / 1000);
        const expires = Math.min(payload.exp!, now + SESSION_SECONDS);
        if (expires <= now) throw new Error('expired_identity');
        // Keep only the verified identity, encrypted. Never persist the Auth0 token or a NEAR account claim.
        const session = await new EncryptJWT({ identity_issuer: ISSUER, client_id: clientId })
            .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setSubject(payload.sub)
            .setIssuer(issuer).setAudience(url.origin).setIssuedAt(now).setExpirationTime(expires).encrypt(key);
        return json({ authenticated: true }, 200, cookie(session, expires - now, url, surface));
    } catch { return json({ error: 'identity_not_verified' }, 401); }
}

