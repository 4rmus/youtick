import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeProtectedHeader, generateKeyPair, jwtDecrypt, SignJWT, type JWTPayload } from 'jose';

const resolver = vi.hoisted(() => ({ key: null as CryptoKey | null, url: '', timeout: 0 }));
vi.mock('jose', async (load) => ({
    ...await load<typeof import('jose')>(),
    createRemoteJWKSet: (url: URL, options: { timeoutDuration: number }) => {
        resolver.url = url.href;
        resolver.timeout = options.timeoutDuration;
        return async () => { if (!resolver.key) throw new Error('test_key_missing'); return resolver.key; };
    },
}));

import { GET, POST, DELETE } from '@/app/api/auth-lab/session/route';

const ORIGIN = 'http://localhost:3000';
const URL = `${ORIGIN}/api/auth-lab/session`;
const ISSUER = 'https://login.testnet.fast-auth.com/';
const SECRET = '11'.repeat(32);
let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    resolver.key = pair.publicKey;
    privateKey = pair.privateKey;
    otherPrivateKey = (await generateKeyPair('RS256')).privateKey;
});
beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEAR_AUTH_LAB_ENABLED', 'true');
    vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', 'testnet');
    vi.stubEnv('NEAR_AUTH_LAB_CLIENT_ID', 'local-test-client');
    vi.stubEnv('NEAR_AUTH_LAB_SESSION_SECRET', SECRET);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

function token(claims: JWTPayload = {}, key = privateKey) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ iss: ISSUER, aud: 'local-test-client', sub: 'google-oauth2|synthetic-user',
        email: 'synthetic@example.invalid', name: 'Synthetic User', account_id: 'untrusted.testnet',
        iat: now, exp: now + 300, ...claims }).setProtectedHeader({ alg: 'RS256', kid: 'fixture' }).sign(key);
}

function request(method: string, body?: object, cookie?: string, origin = ORIGIN) {
    return new Request(URL, { method, headers: {
        Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
}

async function establish() {
    const identityToken = await token();
    const response = await POST(request('POST', { idToken: identityToken }));
    expect(response.status).toBe(200);
    return { identityToken, response, cookie: response.headers.get('set-cookie')!.split(';')[0] };
}

describe('server-verified local NEAR Auth session', () => {
    it('uses real signature verification, encrypts only the verified identity and restores it after reload', async () => {
        const { identityToken, response, cookie } = await establish();
        expect(resolver.url).toBe(`${ISSUER}.well-known/jwks.json`);
        expect(resolver.timeout).toBe(5000);
        expect(await response.json()).toEqual({ authenticated: true });
        const header = response.headers.get('set-cookie')!;
        for (const value of ['HttpOnly', 'SameSite=Lax', 'Path=/api/auth-lab']) expect(header).toContain(value);
        const maxAge = Number(header.match(/Max-Age=(\d+)/)?.[1]);
        expect(maxAge).toBeGreaterThan(0);
        expect(maxAge).toBeLessThanOrEqual(300);
        expect(header).not.toContain(identityToken);
        expect(header).not.toContain('synthetic-user');
        const value = cookie.slice(cookie.indexOf('=') + 1);
        expect(decodeProtectedHeader(value)).toEqual({ alg: 'dir', enc: 'A256GCM' });
        const decoded = await jwtDecrypt(value, Buffer.from(SECRET, 'hex'));
        expect(decoded.payload.sub).toBe('google-oauth2|synthetic-user');
        expect(decoded.payload.identity_issuer).toBe(ISSUER);
        expect(decoded.payload).not.toHaveProperty('idToken');
        expect(decoded.payload).not.toHaveProperty('email');
        expect(decoded.payload).not.toHaveProperty('name');
        expect(decoded.payload).not.toHaveProperty('account_id');
        const restored = await GET(request('GET', undefined, cookie));
        expect(await restored.json()).toEqual({ authenticated: true });
        expect(restored.headers.get('cache-control')).toBe('no-store');
        expect(restored.headers.has('set-cookie')).toBe(false);
    });

    it('does not grant a session for an invalid signature', async () => {
        const response = await POST(request('POST', { idToken: await token({}, otherPrivateKey) }));
        expect(response.status).toBe(401);
        expect(response.headers.has('set-cookie')).toBe(false);
    });

    const invalidClaims: Array<[string, JWTPayload]> = [
        ['issuer', { iss: 'https://untrusted.example/' }], ['audience', { aud: 'another-client' }],
        ['expiration', { exp: 1 }], ['missing expiration', { exp: undefined }],
        ['missing subject', { sub: undefined }], ['empty subject', { sub: '' }],
        ['authorized party', { azp: 'another-client' }],
        ['multiple audiences without authorized party', { aud: ['local-test-client', 'another-client'] }],
        ['old issuance', { iat: 1 }], ['future issuance', { iat: 9_999_999_999 }],
    ];
    it.each(invalidClaims)('rejects invalid %s claims', async (_label, claims) => {
        const response = await POST(request('POST', { idToken: await token(claims) }));
        expect(response.status).toBe(401);
        expect(response.headers.has('set-cookie')).toBe(false);
    });

    it('rejects HS256 algorithm confusion', async () => {
        const now = Math.floor(Date.now() / 1000);
        const forged = await new SignJWT({ iss: ISSUER, aud: 'local-test-client', sub: 'attacker', iat: now, exp: now + 300 })
            .setProtectedHeader({ alg: 'HS256' }).sign(Buffer.from(SECRET, 'hex'));
        expect((await POST(request('POST', { idToken: forged }))).status).toBe(401);
    });

    it('rejects cross-origin login and logout before issuing or clearing cookies', async () => {
        const { cookie } = await establish();
        for (const [method, handler] of [['POST', POST], ['DELETE', DELETE]] as const) {
            const response = await handler(request(method, method === 'POST' ? { idToken: await token() } : undefined, cookie, 'https://untrusted.example'));
            expect(response.status).toBe(403);
            expect(response.headers.has('set-cookie')).toBe(false);
        }
    });

    it('rejects oversized input and client-supplied NEAR account claims', async () => {
        expect((await POST(request('POST', { idToken: 'x'.repeat(17 * 1024) }))).status).toBe(413);
        expect((await POST(request('POST', { idToken: await token(), account_id: 'victim.testnet' }))).status).toBe(400);
    });

    it('rejects a tampered cookie, another origin or another configured client', async () => {
        const { cookie } = await establish();
        const tampered = `${cookie.slice(0, -20)}${cookie.at(-20) === 'A' ? 'B' : 'A'}${cookie.slice(-19)}`;
        expect(await (await GET(request('GET', undefined, tampered))).json()).toEqual({ authenticated: false });
        expect(await (await GET(new Request('http://localhost:3001/api/auth-lab/session', { headers: { Cookie: cookie } }))).json()).toEqual({ authenticated: false });
        vi.stubEnv('NEAR_AUTH_LAB_CLIENT_ID', 'different-client');
        expect(await (await GET(request('GET', undefined, cookie))).json()).toEqual({ authenticated: false });
    });

    it('never extends a session past the original identity token expiration', async () => {
        const { cookie } = await establish();
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(Date.now() + 301_000);
        const response = await GET(request('GET', undefined, cookie));
        expect(await response.json()).toEqual({ authenticated: false });
        expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    });

    it('clears the browser cookie on logout and rejects an absent cookie', async () => {
        const { cookie } = await establish();
        const response = await DELETE(request('DELETE', undefined, cookie));
        expect(await response.json()).toEqual({ authenticated: false });
        expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
        expect(await (await GET(request('GET'))).json()).toEqual({ authenticated: false });
    });

    it('fails closed without a server key and always stays closed in production', async () => {
        vi.stubEnv('NEAR_AUTH_LAB_SESSION_SECRET', undefined);
        expect((await GET(request('GET'))).status).toBe(503);
        vi.stubEnv('NODE_ENV', 'production');
        expect((await GET(request('GET'))).status).toBe(404);
        expect((await POST(request('POST', { idToken: await token() }))).status).toBe(404);
        expect((await DELETE(request('DELETE'))).status).toBe(404);
    });
});

// Product surface uses the same cryptographic checks, but never accepts the lab cookie.
import { GET as productGet, POST as productPost, DELETE as productDelete } from '@/app/api/auth/session/route';
import { POST as productAccount } from '@/app/api/auth/account/route';
import { productSessionSettings } from '@/lib/near-auth-session-settings';
const productPreflight = vi.hoisted(() => vi.fn());
vi.mock('@/lib/near-auth-account-preflight', () => ({ nearAuthAccountPreflight: productPreflight }));

function enableProduct() {
    vi.stubEnv('NEAR_AUTH_LAB_ENABLED', 'false');
    vi.stubEnv('NEAR_AUTH_V1_ENABLED', 'true');
    vi.stubEnv('NEXT_PUBLIC_VIDEO_ENVIRONMENT', 'public-testnet');
    vi.stubEnv('NEAR_AUTH_V1_ORIGIN', ORIGIN);
    vi.stubEnv('NEAR_AUTH_V1_CLIENT_ID', 'product-client');
    vi.stubEnv('NEAR_AUTH_V1_SESSION_SECRET', '22'.repeat(32));
}
function productRequest(method: string, body?: object, cookie?: string, path = '/api/auth/session', origin = ORIGIN) {
    return new Request(`${ORIGIN}${path}`, { method, headers: { Origin: origin, 'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function productCookie() {
    const t = await token({ aud: 'product-client' });
    const response = await productPost(productRequest('POST', { idToken: t }));
    expect(response.status).toBe(200);
    return response.headers.get('set-cookie')!;
}

it.each([
    ['NEAR_AUTH_V1_ENABLED', undefined], ['NEAR_AUTH_LAB_ENABLED', 'true'], ['NEXT_PUBLIC_NEAR_NETWORK', 'mainnet'],
    ['NEXT_PUBLIC_VIDEO_ENVIRONMENT', 'production'], ['NEAR_AUTH_V1_ORIGIN', 'https://other.invalid'],
    ['NEAR_AUTH_V1_SESSION_SECRET', 'invalid'],
])('keeps product routes closed for %s=%s', async (key, value) => {
    enableProduct(); vi.stubEnv(key, value);
    expect((await productGet(productRequest('GET'))).status).toBe(404);
});
it('uses a separate product cookie, verifies the account on the server and does not fund it', async () => {
    enableProduct(); productPreflight.mockReset().mockResolvedValue({ implicitAccount: 'ab'.repeat(32), accounts: [] });
    const setCookie = await productCookie(), cookie = setCookie.split(';')[0];
    expect(setCookie).toContain('youtick_auth_v1='); expect(setCookie).toContain('Path=/api/auth; HttpOnly; SameSite=Lax');
    expect(setCookie).not.toContain('google-oauth2');
    expect(await (await productGet(productRequest('GET', undefined, cookie))).json()).toEqual({ authenticated: true });
    const result = await productAccount(productRequest('POST', undefined, cookie, '/api/auth/account'));
    expect(await result.json()).toEqual({ accountId: 'ab'.repeat(32), accountReady: false, expiresAt: expect.any(Number) });
    expect(productPreflight).toHaveBeenCalledExactlyOnceWith('google-oauth2|synthetic-user');
    expect((await productAccount(productRequest('POST', { accountId: 'attacker.testnet' }, cookie, '/api/auth/account'))).status).toBe(400);
    expect((await productAccount(productRequest('POST', undefined, cookie, '/api/auth/account?prepare=funding'))).status).toBe(400);
    expect((await productAccount(productRequest('POST', undefined, cookie, '/api/auth/account', 'https://evil.invalid'))).status).toBe(403);
    const cleared = await productDelete(productRequest('DELETE', undefined, cookie));
    expect(cleared.headers.get('set-cookie')).toContain('youtick_auth_v1=;');
    expect(cleared.headers.get('set-cookie')).not.toContain('youtick_auth_lab');
});
it('rejects lab tokens/cookies and cross-origin product writes', async () => {
    const lab = await establish(); enableProduct();
    expect((await productPost(productRequest('POST', { idToken: lab.identityToken }))).status).toBe(401);
    expect(await (await productGet(productRequest('GET', undefined, lab.cookie))).json()).toEqual({ authenticated: false });
    expect((await productPost(productRequest('POST', { idToken: await token({ aud: 'product-client' }) }, undefined,
        '/api/auth/session', 'https://evil.invalid'))).status).toBe(403);
});
it('requires exact safe origins and only exposes the product client id to layout', () => {
    enableProduct();
    for (const origin of ['https://user:password@example.com', 'https://example.com/path', 'https://example.com/', 'http://public-testnet.youtick.net']) {
        vi.stubEnv('NEAR_AUTH_V1_ORIGIN', origin); expect(productSessionSettings()).toBeNull();
    }
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('NEAR_AUTH_V1_ORIGIN', ORIGIN);
    expect(productSessionSettings()).toBeNull();
    vi.stubEnv('NEAR_AUTH_V1_ORIGIN', 'https://public-testnet.youtick.net');
    expect(productSessionSettings()?.clientId).toBe('product-client');
});

it('accepts Next-style empty POST streams for product account reads but rejects data', async () => {
    enableProduct(); productPreflight.mockReset().mockResolvedValue({ implicitAccount: 'ab'.repeat(32), accounts: [] });
    const cookie = (await productCookie()).split(';')[0];
    for (const withData of [false, true]) {
        const body = new ReadableStream<Uint8Array>({ start(controller) {
            if (withData) controller.enqueue(new TextEncoder().encode('{}'));
            controller.close();
        } });
        const request = new Request(`${ORIGIN}/api/auth/account`, { method: 'POST',
            headers: { Origin: ORIGIN, Cookie: cookie }, body, duplex: 'half' } as RequestInit);
        expect((await productAccount(request)).status).toBe(withData ? 400 : 200);
    }
    expect(productPreflight).toHaveBeenCalledOnce();
});
