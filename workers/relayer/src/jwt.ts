// RS256 verification of NEAR Auth id_tokens with the issuer's JWKS (WebCrypto, no dependency).
// The relayer verifies before spending gas or money; ckd-gate verifies the same token again on chain.

export interface VerifiedIdentity {
    iss: string;
    sub: string;
    exp: number;
    nonce: string | null;
    /** fast-auth's approved payload: the exact bytes the user saw on the NEAR Auth approval screen. */
    fatxn: Uint8Array | null;
}

export interface VerifyOptions {
    /** Defaults to the client ID (id_tokens). Signing access tokens use the fast-auth guard audience. */
    audience?: string;
}

export interface JwtVerifierConfig {
    issuer: string;
    clientId: string;
    fetch?: typeof fetch;
    now?: () => number;
}

const MAX_TOKEN_BYTES = 7168;
const MAX_SUBJECT_BYTES = 256;
const JWKS_TTL_MS = 10 * 60 * 1000;
/** Unknown `kid`s force a refetch at most this often, so random kids cannot amplify JWKS traffic. */
const JWKS_FORCED_REFRESH_MS = 60 * 1000;
const CLOCK_SKEW_S = 5;

type Jwk = { kty?: unknown; kid?: unknown; n?: unknown; e?: unknown; alg?: unknown; use?: unknown };

function base64UrlBytes(value: string): Uint8Array {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid_token');
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function jsonPart(value: string): Record<string, unknown> {
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(base64UrlBytes(value)));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid_token');
    return parsed as Record<string, unknown>;
}

export function createJwtVerifier(config: JwtVerifierConfig) {
    const fetcher = config.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
    const now = config.now ?? (() => Date.now());
    let cache: { keys: Map<string, CryptoKey>; fetchedAt: number } | null = null;

    async function loadKeys(force: boolean): Promise<Map<string, CryptoKey>> {
        if (cache && now() - cache.fetchedAt < (force ? JWKS_FORCED_REFRESH_MS : JWKS_TTL_MS)) return cache.keys;
        const response = await fetcher(new URL('.well-known/jwks.json', config.issuer), {
            cache: 'no-store', signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) throw new Error('jwks_unavailable');
        const body = await response.json().catch(() => null) as { keys?: unknown } | null;
        if (!body || !Array.isArray(body.keys)) throw new Error('jwks_unavailable');
        const keys = new Map<string, CryptoKey>();
        for (const jwk of body.keys as Jwk[]) {
            if (jwk?.kty !== 'RSA' || typeof jwk.kid !== 'string' || typeof jwk.n !== 'string' || typeof jwk.e !== 'string'
                || (jwk.alg !== undefined && jwk.alg !== 'RS256') || (jwk.use !== undefined && jwk.use !== 'sig')) continue;
            keys.set(jwk.kid, await crypto.subtle.importKey(
                'jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
                { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
            ));
        }
        cache = { keys, fetchedAt: now() };
        return keys;
    }

    return async function verify(token: unknown, options: VerifyOptions = {}): Promise<VerifiedIdentity> {
        const audience = options.audience ?? config.clientId;
        if (typeof token !== 'string' || new TextEncoder().encode(token).length > MAX_TOKEN_BYTES) throw new Error('invalid_token');
        const parts = token.split('.');
        if (parts.length !== 3) throw new Error('invalid_token');
        let header: Record<string, unknown>;
        let claims: Record<string, unknown>;
        let signature: Uint8Array;
        try {
            header = jsonPart(parts[0]);
            claims = jsonPart(parts[1]);
            signature = base64UrlBytes(parts[2]);
        } catch {
            throw new Error('invalid_token');
        }
        if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('invalid_token');
        let key = (await loadKeys(false)).get(header.kid);
        // A key rotation shows up as an unknown kid; refetch once.
        if (!key) key = (await loadKeys(true)).get(header.kid);
        if (!key) throw new Error('invalid_token');
        const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
        if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature as BufferSource, signed)) {
            throw new Error('invalid_token');
        }

        const nowS = Math.floor(now() / 1000);
        const aud = claims.aud;
        const audiences = typeof aud === 'string' ? [aud] : Array.isArray(aud) ? aud : [];
        const sub = claims.sub;
        if (claims.iss !== config.issuer
            || !audiences.includes(audience)
            // Access tokens name the guard as audience, so the client must be proven by `azp`.
            || ((audiences.length > 1 || audience !== config.clientId) && claims.azp !== config.clientId)
            || (claims.azp !== undefined && claims.azp !== config.clientId)
            || typeof sub !== 'string' || !sub || sub.includes('#')
            || new TextEncoder().encode(sub).length > MAX_SUBJECT_BYTES
            || typeof claims.exp !== 'number' || !Number.isSafeInteger(claims.exp) || claims.exp <= nowS
            || (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > nowS + CLOCK_SKEW_S))
            || (claims.iat !== undefined && (typeof claims.iat !== 'number' || claims.iat > nowS + CLOCK_SKEW_S))
            || (claims.nonce !== undefined && typeof claims.nonce !== 'string')) {
            throw new Error('invalid_token');
        }
        let fatxn: Uint8Array | null = null;
        if (claims.fatxn !== undefined) {
            const value = claims.fatxn;
            if (!Array.isArray(value) || value.length === 0 || value.length > 4096
                || !value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) throw new Error('invalid_token');
            fatxn = Uint8Array.from(value as number[]);
        }
        return { iss: config.issuer, sub, exp: claims.exp, nonce: (claims.nonce as string | undefined) ?? null, fatxn };
    };
}

/** Stored instead of the raw subject. */
export async function identityHash(identity: Pick<VerifiedIdentity, 'iss' | 'sub'>): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`youtick-relayer-identity|${identity.iss}|${identity.sub}`));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** ckd-gate's nonce: b64url(sha256("ckd-gate|<gate>|<pk1>|<pk2>")), no padding. */
export async function ckdGateNonce(gateAccountId: string, pk1: string, pk2: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ckd-gate|${gateAccountId}|${pk1}|${pk2}`)));
    let binary = '';
    for (const byte of digest) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
