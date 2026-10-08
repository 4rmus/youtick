import { createHash } from 'node:crypto';
import { bls12_381 as bls } from '@noble/curves/bls12-381.js';
import { describe, expect, it, vi } from 'vitest';
import { hexEncode } from '@/lib/crypto/codec';
import { resolveNearAuthAccount } from '@/lib/near-auth/account';
import { signInWithCkd, trustedCkdGates } from '@/lib/near-auth/ckd-sign-in';
import { NEAR_AUTH_PROVIDERS, nearAuthConfig, type NearAuthConfig } from '@/lib/near-auth/config';
import { checkIdToken, fastAuthPath, MAX_ID_TOKEN_BYTES } from '@/lib/near-auth/id-token';
import { authorizeUrl, base64Url, loginWithNonce, type OidcEnvironment, type PopupLike } from '@/lib/near-auth/oidc';
import {
    ckdGatePath, decodeG1, deriveAppId, encodeG1, encodeG2, hashAppIdWithPk,
} from '@/lib/ticket-keys/ckd';

vi.unmock('near-api-js');

const provider = NEAR_AUTH_PROVIDERS.testnet!;
const ISSUER = provider.issuer;
const CLIENT = 'test-client_01';
const config: NearAuthConfig = { network: 'testnet', clientId: CLIENT, provider };
const NOW_S = 1_791_360_000;
const SUB = 'google-oauth2|1234567890';

const b64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = (claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', typ: 'JWT' }) =>
    `${b64url(header)}.${b64url(claims)}.c2ln`;
const claimsFor = (nonce: string, extra: Record<string, unknown> = {}) =>
    ({ iss: ISSUER, aud: CLIENT, sub: SUB, exp: NOW_S + 600, iat: NOW_S, nonce, ...extra });

describe('NEAR Auth config', () => {
    it('stays off unless the flag, a pinned provider and a client id are all present', () => {
        expect(nearAuthConfig({ clientId: CLIENT, network: 'testnet' })).toBeNull();
        expect(nearAuthConfig({ enabled: 'true', clientId: CLIENT, network: 'mainnet' })).toBeNull();
        expect(nearAuthConfig({ enabled: 'true', clientId: 'bad client', network: 'testnet' })).toBeNull();
        expect(nearAuthConfig({ enabled: 'true', clientId: CLIENT, network: 'testnet' })).toEqual(config);
        expect(Object.isFrozen(NEAR_AUTH_PROVIDERS) && Object.isFrozen(NEAR_AUTH_PROVIDERS.testnet)).toBe(true);
    });
});

class FakePopup implements PopupLike {
    closed = false;
    location = { href: 'about:blank' };
    close() { this.closed = true; }
}

type Reply = { origin?: string; foreignSource?: boolean; response: Record<string, unknown> };
function fakeOidc(reply: (url: URL) => Reply | Reply[] | 'close' | null,
    tokenResponse: (body: Record<string, unknown>) => Response) {
    let listener: ((event: { origin: string; data: unknown; source?: unknown }) => void) | null = null;
    let tick: (() => void) | null = null;
    const requests: Record<string, unknown>[] = [];
    let counter = 0;
    const env: OidcEnvironment = {
        addMessageListener(next) {
            listener = next;
            return () => { listener = null; };
        },
        fetch: vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            expect(String(url)).toBe(new URL('oauth/token', ISSUER).href);
            const body = JSON.parse(String(init?.body));
            requests.push(body);
            return tokenResponse(body);
        }) as unknown as typeof fetch,
        randomBytes: (length) => new Uint8Array(length).fill(++counter),
        sha256: async (data) => new Uint8Array(createHash('sha256').update(data).digest()),
        setInterval: (callback) => { tick = callback; return 1; },
        clearInterval: () => { tick = null; },
    };
    const deliver = (popup: FakePopup) => {
        const url = new URL(popup.location.href);
        const action = reply(url);
        if (action === 'close') { popup.closed = true; tick?.(); return; }
        if (!action) return;
        for (const message of Array.isArray(action) ? action : [action]) {
            listener?.({
                origin: message.origin ?? new URL(ISSUER).origin,
                source: message.foreignSource ? {} : popup,
                data: { type: 'authorization_response', response: message.response },
            });
        }
    };
    return { env, requests, deliver };
}

async function runLogin(popup: FakePopup, oidc: ReturnType<typeof fakeOidc>, nonce = 'n-1', prompt?: 'login') {
    const pending = loginWithNonce(popup, { issuer: ISSUER, clientId: CLIENT, nonce, redirectUri: 'https://youtick.test', prompt }, oidc.env);
    pending.catch(() => {});
    await vi.waitFor(() => expect(popup.location.href).not.toBe('about:blank'));
    oidc.deliver(popup);
    return pending;
}

describe('OIDC login with our own nonce', () => {
    it('builds a PKCE authorize request with the nonce and minimal scope', async () => {
        const url = new URL(await authorizeUrl({ issuer: ISSUER, clientId: CLIENT, nonce: 'abc', redirectUri: 'https://youtick.test' }, 's', 'c'));
        expect(url.origin + url.pathname).toBe(`${ISSUER}authorize`);
        expect(Object.fromEntries(url.searchParams)).toEqual({
            client_id: CLIENT, response_type: 'code', response_mode: 'web_message', redirect_uri: 'https://youtick.test',
            scope: 'openid', state: 's', nonce: 'abc', code_challenge: 'c', code_challenge_method: 'S256',
        });
        const forced = new URL(await authorizeUrl({ issuer: ISSUER, clientId: CLIENT, nonce: 'abc', redirectUri: 'https://youtick.test', prompt: 'login' }, 's', 'c'));
        expect(forced.searchParams.get('prompt')).toBe('login');
    });

    it('exchanges the code with the verifier that matches the challenge and returns the id_token', async () => {
        const popup = new FakePopup();
        const oidc = fakeOidc(
            (url) => ({ response: { state: url.searchParams.get('state'), code: 'auth-code' } }),
            () => Response.json({ id_token: 'h.p.s' }),
        );
        await expect(runLogin(popup, oidc, 'n-1', 'login')).resolves.toBe('h.p.s');
        expect(popup.closed).toBe(true);
        const url = new URL(popup.location.href);
        expect(url.searchParams.get('nonce')).toBe('n-1');
        const [body] = oidc.requests;
        expect(body).toMatchObject({ grant_type: 'authorization_code', client_id: CLIENT, code: 'auth-code', redirect_uri: 'https://youtick.test' });
        expect(base64Url(createHash('sha256').update(String(body.code_verifier)).digest()))
            .toBe(url.searchParams.get('code_challenge'));
        expect(url.searchParams.get('state')).not.toBe(body.code_verifier);
    });

    it('ignores messages for another state or window and keeps waiting for its own response', async () => {
        const popup = new FakePopup();
        const oidc = fakeOidc((url) => [
            { response: { state: 'other-login', code: 'stolen' } },
            { foreignSource: true, response: { state: url.searchParams.get('state'), code: 'from-a-frame' } },
            { response: { state: url.searchParams.get('state'), code: 'mine' } },
        ], () => Response.json({ id_token: 'h.p.s' }));
        await expect(runLogin(popup, oidc)).resolves.toBe('h.p.s');
        expect(oidc.requests.map((body) => body.code)).toEqual(['mine']);
    });

    it('closes the popup when the login cannot start', async () => {
        const popup = new FakePopup();
        const oidc = fakeOidc(() => null, () => Response.json({}));
        oidc.env.sha256 = async () => { throw new Error('no crypto'); };
        await expect(loginWithNonce(popup, { issuer: ISSUER, clientId: CLIENT, nonce: 'n', redirectUri: 'https://youtick.test' }, oidc.env))
            .rejects.toThrow('near_auth_login_failed');
        expect(popup.closed).toBe(true);
    });

    it('ignores foreign origins and rejects provider errors, a closed popup and a bad token response', async () => {
        const ok = () => Response.json({ id_token: 'h.p.s' });
        const cases: [Parameters<typeof fakeOidc>[0], (body: Record<string, unknown>) => Response, string][] = [
            [(url) => ({ response: { state: url.searchParams.get('state'), error: 'access_denied' } }), ok, 'near_auth_access_denied'],
            [(url) => ({ response: { state: url.searchParams.get('state'), error: 'weird', error_description: 'secret' } }), ok, 'near_auth_login_failed'],
            [() => 'close', ok, 'near_auth_login_cancelled'],
            [(url) => ({ response: { state: url.searchParams.get('state'), code: 'x' } }), () => Response.json({ error: 'invalid_grant' }, { status: 403 }), 'near_auth_token_exchange_failed'],
            [(url) => ({ response: { state: url.searchParams.get('state'), code: 'x' } }), () => Response.json({ access_token: 'a' }), 'near_auth_token_exchange_failed'],
            [(url) => ({ response: { state: url.searchParams.get('state'), code: 'x' } }), () => new Response('<html>'), 'near_auth_token_exchange_failed'],
        ];
        for (const [reply, tokenResponse, code] of cases) {
            await expect(runLogin(new FakePopup(), fakeOidc(reply, tokenResponse))).rejects.toThrow(code);
        }

        // A message from another origin is ignored; the login only ends when the popup closes.
        let closeNext = false;
        const popup = new FakePopup();
        const foreign = fakeOidc((url) => closeNext ? 'close'
            : { origin: 'https://evil.example', response: { state: url.searchParams.get('state'), code: 'x' } }, ok);
        const pending = runLogin(popup, foreign);
        const settled = vi.fn();
        pending.then(settled, settled);
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(settled).not.toHaveBeenCalled();
        expect(foreign.requests).toEqual([]);
        closeNext = true;
        foreign.deliver(popup);
        await expect(pending).rejects.toThrow('near_auth_login_cancelled');
    });
});

describe('id_token checks before submission', () => {
    const expected = { issuer: ISSUER, clientId: CLIENT, nonce: 'n-1', nowS: NOW_S };

    it('accepts a token for this client, issuer and nonce', () => {
        expect(checkIdToken(token(claimsFor('n-1')), expected)).toEqual({ iss: ISSUER, sub: SUB, exp: NOW_S + 600, nonce: 'n-1' });
        expect(checkIdToken(token(claimsFor('n-1', { aud: [CLIENT, 'other'], azp: CLIENT })), expected).sub).toBe(SUB);
        expect(checkIdToken(token(claimsFor('n-1', { sub: 'ü'.repeat(128) })), expected).sub).toHaveLength(128);
        expect(fastAuthPath({ iss: ISSUER, sub: SUB })).toBe(`jwt#${ISSUER}#${SUB}`);
    });

    it('rejects tokens the gate would refuse or that belong to something else', () => {
        const cases: [string, string][] = [
            [token(claimsFor('n-2')), 'id_token_nonce_mismatch'],
            [token(claimsFor('n-1', { iss: 'https://evil.example/' })), 'id_token_issuer_mismatch'],
            [token(claimsFor('n-1', { aud: 'other-client' })), 'id_token_audience_mismatch'],
            [token(claimsFor('n-1', { aud: [CLIENT, 'other'] })), 'id_token_audience_mismatch'],
            [token(claimsFor('n-1', { azp: 'other-client' })), 'id_token_audience_mismatch'],
            [token(claimsFor('n-1', { exp: NOW_S + 30 })), 'id_token_expired'],
            [token(claimsFor('n-1', { exp: String(NOW_S + 600) })), 'id_token_expired'],
            [token(claimsFor('n-1', { nbf: NOW_S + 60 })), 'invalid_id_token'],
            [token(claimsFor('n-1', { sub: 'a#b' })), 'invalid_id_token'],
            [token(claimsFor('n-1', { sub: 's'.repeat(257) })), 'invalid_id_token'],
            [token(claimsFor('n-1', { sub: 'ü'.repeat(129) })), 'invalid_id_token'],
            [token(claimsFor('n-1', { nbf: -1 })), 'invalid_id_token'],
            [token(claimsFor('n-1'), { alg: 'none' }), 'invalid_id_token'],
            ['only.two', 'invalid_id_token'],
            [`${token(claimsFor('n-1'))}${'x'.repeat(MAX_ID_TOKEN_BYTES)}`, 'invalid_id_token'],
            ['a+b.c.d', 'invalid_id_token'],
        ];
        for (const [value, code] of cases) expect(() => checkIdToken(value, expected)).toThrow(code);
    });
});

function fakeView(overrides: Record<string, unknown> = {}) {
    const values: Record<string, unknown> = {
        paused: false, mpc_address: provider.mpcContractId, mpc_domain_id: provider.fastAuthDomainId,
        derived_public_key: 'ed25519:11111111111111111111111111111111',
        ...overrides,
    };
    const calls: [string, string, Record<string, unknown>][] = [];
    const view = vi.fn(async (contractId: string, method: string, args: Record<string, unknown>) => {
        calls.push([contractId, method, args]);
        return values[method];
    }) as unknown as <T>(contractId: string, method: string, args: Record<string, unknown>) => Promise<T>;
    return { view, calls };
}

describe('fast-auth account resolution', () => {
    it('derives the implicit account from the MPC key for jwt#iss#sub', async () => {
        const { view, calls } = fakeView({ derived_public_key: 'ed25519:11111111111111111111111111111111' });
        const account = await resolveNearAuthAccount(provider, { iss: ISSUER, sub: SUB }, view);
        expect(account).toEqual({ accountId: '0'.repeat(64), publicKey: 'ed25519:11111111111111111111111111111111' });
        expect(calls).toContainEqual([provider.mpcContractId, 'derived_public_key', {
            path: `jwt#${ISSUER}#${SUB}`, predecessor: provider.fastAuthContractId, domain_id: provider.fastAuthDomainId,
        }]);
    });

    it('refuses a paused or reconfigured provider and malformed keys', async () => {
        const cases: [Record<string, unknown>, string][] = [
            [{ paused: true }, 'near_auth_paused'],
            [{ mpc_address: 'v1.signer' }, 'provider_configuration_changed'],
            [{ mpc_domain_id: 2 }, 'provider_configuration_changed'],
            [{ derived_public_key: 'secp256k1:abc' }, 'invalid_public_key'],
            [{ derived_public_key: 'ed25519:111' }, 'invalid_public_key'],
            [{ derived_public_key: 'ed25519:0OIl' }, 'invalid_public_key'],
        ];
        for (const [override, code] of cases) {
            await expect(resolveNearAuthAccount(provider, { iss: ISSUER, sub: SUB }, fakeView(override).view)).rejects.toThrow(code);
        }
        await expect(resolveNearAuthAccount(provider, { iss: 'https://evil.example/', sub: SUB }, fakeView().view))
            .rejects.toThrow('id_token_issuer_mismatch');
    });
});

describe('CKD sign-in (option C2)', () => {
    const G1 = bls.G1.Point;
    const G2 = bls.G2.Point;
    const Fr = G1.Fn;
    const GATE = 'ckd-gate.youtick.testnet';
    const ACCOUNT = '0'.repeat(64);

    function mpc(masterSecret: Uint8Array) {
        const msk = Fr.fromBytes(masterSecret);
        const mpcPublicKey = G2.BASE.multiply(msk);
        return {
            mpcPublicKey: encodeG2(mpcPublicKey),
            respond(pk1: string, accountId: string) {
                const appId = deriveAppId(GATE, ckdGatePath(accountId));
                const sig = hashAppIdWithPk(mpcPublicKey, appId).multiply(msk);
                const y = Fr.fromBytes(bls.utils.randomSecretKey());
                return { big_y: encodeG1(G1.BASE.multiply(y)), big_c: encodeG1(sig.add(decodeG1(pk1).multiply(y))) };
            },
        };
    }

    function setup(options: { accountOnChain?: string; nonceOverride?: string } = {}) {
        const network = mpc(bls.utils.randomSecretKey());
        const trustRoots = { testnet: [{ gateAccountId: GATE, mpcPublicKey: network.mpcPublicKey }], mainnet: [] };
        let nonce = '';
        const oidc = fakeOidc((url) => {
            nonce = url.searchParams.get('nonce')!;
            return { response: { state: url.searchParams.get('state'), code: 'code' } };
        }, () => Response.json({ id_token: token(claimsFor(options.nonceOverride ?? nonce)) }));
        const submit = vi.fn(async ({ gateAccountId, args }: Parameters<Parameters<typeof signInWithCkd>[0]['submit']>[0]) => {
            expect(gateAccountId).toBe(GATE);
            const accountId = options.accountOnChain ?? ACCOUNT;
            return { account_id: accountId, derivation_path: ckdGatePath(accountId), response: network.respond(args.app_public_key.pk1, accountId) };
        });
        const popup = new FakePopup();
        const run = () => {
            const pending = signInWithCkd({
                config, gateAccountId: GATE, popup, redirectUri: 'https://youtick.test', submit, trustRoots,
                view: fakeView({ derived_public_key: 'ed25519:11111111111111111111111111111111' }).view,
                nowS: () => NOW_S, oidc: oidc.env,
            });
            void vi.waitFor(() => expect(popup.location.href).not.toBe('about:blank')).then(() => oidc.deliver(popup));
            return pending;
        };
        return { run, submit };
    }

    it('binds the login nonce to the ephemeral key and decrypts the same key across logins', async () => {
        const network = mpc(bls.utils.randomSecretKey());
        const trustRoots = { testnet: [{ gateAccountId: GATE, mpcPublicKey: network.mpcPublicKey }], mainnet: [] };
        const keys: string[] = [];
        for (let attempt = 0; attempt < 2; attempt += 1) {
            let nonce = '';
            const oidc = fakeOidc((url) => {
                nonce = url.searchParams.get('nonce')!;
                return { response: { state: url.searchParams.get('state'), code: 'code' } };
            }, () => Response.json({ id_token: token(claimsFor(nonce)) }));
            const submit = vi.fn(async ({ args }: Parameters<Parameters<typeof signInWithCkd>[0]['submit']>[0]) => {
                const expectedNonce = createHash('sha256')
                    .update(`ckd-gate|${GATE}|${args.app_public_key.pk1}|${args.app_public_key.pk2}`).digest('base64url');
                expect(nonce).toBe(expectedNonce);
                expect(args).not.toHaveProperty('account_id');
                return { account_id: ACCOUNT, derivation_path: ckdGatePath(ACCOUNT), response: network.respond(args.app_public_key.pk1, ACCOUNT) };
            });
            const popup = new FakePopup();
            const pending = signInWithCkd({
                config, gateAccountId: GATE, popup, redirectUri: 'https://youtick.test', submit, trustRoots,
                view: fakeView({ derived_public_key: 'ed25519:11111111111111111111111111111111' }).view,
                nowS: () => NOW_S, oidc: oidc.env,
            });
            await vi.waitFor(() => expect(popup.location.href).not.toBe('about:blank'));
            oidc.deliver(popup);
            const result = await pending;
            expect(result).toMatchObject({ accountId: ACCOUNT, gateAccountId: GATE });
            keys.push(hexEncode(result.ckdKey));
        }
        expect(keys[0]).toHaveLength(64);
        expect(keys[0]).toBe(keys[1]);
    });

    it('does not submit a token bound to another key and rejects a result for another account', async () => {
        const replayed = setup({ nonceOverride: 'captured-nonce' });
        await expect(replayed.run()).rejects.toThrow('id_token_nonce_mismatch');
        expect(replayed.submit).not.toHaveBeenCalled();

        const otherAccount = setup({ accountOnChain: 'f'.repeat(64) });
        await expect(otherAccount.run()).rejects.toThrow('ckd_account_mismatch');
    });

    it('refuses an untrusted gate before opening the provider page', async () => {
        expect(trustedCkdGates('testnet')).toEqual(['v2-ckd-gate-261007.youtick-dev-v3.testnet']);
        expect(trustedCkdGates('testnet')).not.toContain(GATE);
        expect(trustedCkdGates('mainnet')).toEqual([]);
        const roots = { testnet: [{ gateAccountId: 'other-gate.testnet', mpcPublicKey: encodeG2(G2.BASE) }], mainnet: [] };
        for (const trustRoots of [undefined, roots]) {
            const popup = new FakePopup();
            const submit = vi.fn();
            await expect(signInWithCkd({
                config, gateAccountId: GATE, popup, redirectUri: 'https://youtick.test', view: fakeView().view,
                submit, trustRoots,
            })).rejects.toThrow('ckd_gate_not_trusted');
            expect(popup.location.href).toBe('about:blank');
            expect(popup.closed).toBe(true);
            expect(submit).not.toHaveBeenCalled();
        }
    });
});
