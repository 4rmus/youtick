import { describe, expect, it, vi } from 'vitest';
import { ckdGateNonce, createJwtVerifier, identityHash } from './jwt';

const ISSUER = 'https://login.testnet.fast-auth.com/';
const CLIENT = 'client-1';
const NOW = 1_791_360_000_000;

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encode = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));

async function keyPair(kid: string) {
    const pair = await crypto.subtle.generateKey(
        { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true, ['sign', 'verify'],
    ) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey) as JsonWebKey;
    return { kid, privateKey: pair.privateKey, jwk: { kty: 'RSA', kid, n: jwk.n, e: jwk.e, alg: 'RS256', use: 'sig' } };
}

async function sign(key: { kid: string; privateKey: CryptoKey }, claims: Record<string, unknown>, header: Record<string, unknown> = {}) {
    const signing = `${encode({ alg: 'RS256', typ: 'JWT', kid: key.kid, ...header })}.${encode(claims)}`;
    const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, new TextEncoder().encode(signing)));
    return `${signing}.${b64url(signature)}`;
}

const claims = (extra: Record<string, unknown> = {}) => ({
    iss: ISSUER, aud: CLIENT, sub: 'google-oauth2|42', iat: NOW / 1000 - 10, exp: NOW / 1000 + 600, nonce: 'n', ...extra,
});

describe('id_token verification', () => {
    it('accepts a signed token for this issuer and client and refetches keys once on an unknown kid', async () => {
        const first = await keyPair('k1');
        const second = await keyPair('k2');
        let keys = [first.jwk];
        let now = NOW;
        const fetcher = vi.fn(async () => Response.json({ keys }));
        const verify = createJwtVerifier({ issuer: ISSUER, clientId: CLIENT, fetch: fetcher as unknown as typeof fetch, now: () => now });
        await expect(verify(await sign(first, claims()))).resolves.toEqual({ iss: ISSUER, sub: 'google-oauth2|42', exp: NOW / 1000 + 600, nonce: 'n' });
        expect(String(fetcher.mock.calls[0]![0 as never])).toBe(`${ISSUER}.well-known/jwks.json`);
        keys = [first.jwk, second.jwk];
        now += 61_000;
        await expect(verify(await sign(second, claims({ nonce: undefined, iat: now / 1000 })))).resolves.toMatchObject({ nonce: null });
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('limits forced JWKS refreshes for unknown key ids', async () => {
        const key = await keyPair('k1');
        const stranger = await keyPair('kx');
        let now = NOW;
        const fetcher = vi.fn(async () => Response.json({ keys: [key.jwk] }));
        const verify = createJwtVerifier({ issuer: ISSUER, clientId: CLIENT, fetch: fetcher as unknown as typeof fetch, now: () => now });
        await verify(await sign(key, claims()));
        for (let i = 0; i < 5; i += 1) await expect(verify(await sign(stranger, claims()))).rejects.toThrow('invalid_token');
        expect(fetcher).toHaveBeenCalledTimes(1);
        now += 61_000;
        await expect(verify(await sign(stranger, claims()))).rejects.toThrow('invalid_token');
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('rejects forged, foreign, expired and malformed tokens', async () => {
        const key = await keyPair('k1');
        const other = await keyPair('k1');
        const verify = createJwtVerifier({ issuer: ISSUER, clientId: CLIENT, now: () => NOW,
            fetch: (async () => Response.json({ keys: [key.jwk] })) as unknown as typeof fetch });
        const bad = [
            await sign(other, claims()),
            await sign(key, claims({ iss: 'https://evil.example/' })),
            await sign(key, claims({ aud: 'other' })),
            await sign(key, claims({ aud: [CLIENT, 'other'] })),
            await sign(key, claims({ azp: 'other' })),
            await sign(key, claims({ exp: NOW / 1000 })),
            await sign(key, claims({ nbf: NOW / 1000 + 60 })),
            await sign(key, claims({ sub: 'a#b' })),
            await sign(key, claims({ sub: 'ü'.repeat(129) })),
            await sign(key, claims(), { alg: 'HS256' }),
            await sign(key, claims(), { kid: 'missing' }),
            'a.b',
            `${await sign(key, claims())}x`.replace(/\.[^.]+$/, '.!!'),
        ];
        for (const token of bad) await expect(verify(token)).rejects.toThrow('invalid_token');
    });

    it('hashes identities and computes the ckd-gate nonce', async () => {
        expect(await identityHash({ iss: ISSUER, sub: 'a' })).toMatch(/^[0-9a-f]{64}$/);
        expect(await identityHash({ iss: ISSUER, sub: 'a' })).not.toBe(await identityHash({ iss: ISSUER, sub: 'b' }));
        const expected = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ckd-gate|g.testnet|p1|p2'))));
        expect(await ckdGateNonce('g.testnet', 'p1', 'p2')).toBe(expected);
    });
});
