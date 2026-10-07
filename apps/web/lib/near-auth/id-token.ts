// Client-side checks on the id_token before it is sent on chain. These do not verify the RS256
// signature (ckd-gate and the relayer do); they stop a token that would fail there, or that belongs
// to another client, issuer or ephemeral key, from being submitted at all.

/** ckd-gate limits (contracts/ckd-gate/src/lib.rs). */
export const MAX_ID_TOKEN_BYTES = 7168;
export const MAX_SUBJECT_LENGTH = 256;
/** The gate checks `exp` against block time a few blocks after submission. */
export const MIN_REMAINING_VALIDITY_S = 60;

export interface IdTokenClaims {
    iss: string;
    sub: string;
    exp: number;
    nonce: string;
}

function base64UrlDecode(value: string): Uint8Array {
    if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error('invalid_id_token');
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

export function checkIdToken(
    token: string,
    expected: { issuer: string; clientId: string; nonce: string; nowS: number },
): IdTokenClaims {
    if (typeof token !== 'string' || new TextEncoder().encode(token).length > MAX_ID_TOKEN_BYTES) {
        throw new Error('invalid_id_token');
    }
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('invalid_id_token');
    let header: Record<string, unknown>;
    let claims: Record<string, unknown>;
    try {
        header = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(base64UrlDecode(parts[0])));
        claims = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(base64UrlDecode(parts[1])));
    } catch {
        throw new Error('invalid_id_token');
    }
    if (!header || header.alg !== 'RS256' || !claims || typeof claims !== 'object') throw new Error('invalid_id_token');
    if (claims.iss !== expected.issuer) throw new Error('id_token_issuer_mismatch');
    const aud = claims.aud;
    const audiences = typeof aud === 'string' ? [aud] : Array.isArray(aud) ? aud : [];
    if (!audiences.includes(expected.clientId)
        || (audiences.length > 1 && claims.azp !== expected.clientId)
        || (claims.azp !== undefined && claims.azp !== expected.clientId)) throw new Error('id_token_audience_mismatch');
    if (claims.nonce !== expected.nonce) throw new Error('id_token_nonce_mismatch');
    const sub = claims.sub;
    // The gate limits `sub` in UTF-8 bytes.
    if (typeof sub !== 'string' || !sub || new TextEncoder().encode(sub).length > MAX_SUBJECT_LENGTH || sub.includes('#')) {
        throw new Error('invalid_id_token');
    }
    const exp = claims.exp;
    if (typeof exp !== 'number' || !Number.isSafeInteger(exp) || exp < expected.nowS + MIN_REMAINING_VALIDITY_S) {
        throw new Error('id_token_expired');
    }
    const nbf = claims.nbf;
    if (nbf !== undefined && (typeof nbf !== 'number' || !Number.isSafeInteger(nbf) || nbf < 0 || nbf > expected.nowS + 5)) {
        throw new Error('invalid_id_token');
    }
    return { iss: expected.issuer, sub, exp, nonce: expected.nonce };
}

/** fast-auth's MPC path for an identity (`jwt#<iss>#<sub>`, fast-auth `verify_sub`). */
export const fastAuthPath = (claims: Pick<IdTokenClaims, 'iss' | 'sub'>) => `jwt#${claims.iss}#${claims.sub}`;
