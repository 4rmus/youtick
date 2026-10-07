// youtick relayer (roadmap E5c, decision D7): a separate Worker with its own NEAR key that
// - opens a NEAR Auth user's implicit account once per identity and registers it with USDC,
// - submits ckd-gate `request_key` (rule a) and returns the encrypted CKD response,
// - pays invite credits (single-use codes, one per identity) and records invited creators,
// - relays NEAR Auth ticket purchases signed through fast-auth (roadmap E7b).
// It never sees ticket keys or CKD secrets; the CKD response is encrypted to the browser's key.
import { relayerConfig, type Env, type RelayerConfig } from './env';
import { ckdGateNonce, createJwtVerifier, identityHash, type VerifiedIdentity } from './jwt';
import { createNearClient, fastAuthAccount, fastAuthKey, type NearClient } from './near';
import { checkPurchaseMessage } from './market';
import { MAX_DELEGATE_TTL_BLOCKS, NONCE_RANGE_MULTIPLIER, parsePurchaseFields, purchaseDelegate, sameBytes } from './purchase';

export { RelayerControl } from './control';
export type { Env } from './env';

const MAX_BODY_BYTES = 16 * 1024;
const BLS_G1 = /^bls12381g1:[1-9A-HJ-NP-Za-km-z]{60,70}$/;
const BLS_G2 = /^bls12381g2:[1-9A-HJ-NP-Za-km-z]{120,135}$/;
/** Purchase errors the client can act on; each means "Market V2 would refund this now". */
const PURCHASE_REJECTIONS: Record<string, number> = {
    purchase_invalid: 400, publication_unavailable: 409, price_mismatch: 409, ticket_exists: 409, signature_expired: 409,
};

export interface RelayerDeps {
    verify?: (token: unknown, options?: { audience?: string }) => Promise<VerifiedIdentity>;
    near?: NearClient;
    now?: () => number;
}

let cachedVerifier: { key: string; verify: (token: unknown) => Promise<VerifiedIdentity> } | null = null;

function verifierFor(config: RelayerConfig) {
    const key = `${config.provider.issuer}|${config.clientId}`;
    if (cachedVerifier?.key !== key) {
        cachedVerifier = { key, verify: createJwtVerifier({ issuer: config.provider.issuer, clientId: config.clientId }) };
    }
    return cachedVerifier.verify;
}

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function corsHeaders(origin: string): Record<string, string> {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
    };
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new Error('invalid_request');
    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new Error('invalid_request');
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_request');
    return value as Record<string, unknown>;
}

function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value as object).length === keys.length && keys.every((key) => key in (value as object));
}

async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function adminAuthorized(request: Request, config: RelayerConfig, env: Env): Promise<boolean> {
    const header = request.headers.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    // Compare digests so the comparison time does not depend on the secret.
    return Boolean(token) && await sha256Hex(token) === await sha256Hex(env.RELAYER_ADMIN_TOKEN!) && Boolean(config);
}

function control(env: Env): DurableObjectStub {
    const namespace = env.RELAYER_CONTROL!;
    return namespace.get(namespace.idFromName('relayer-v1'));
}

async function forward(env: Env, path: string, body: Record<string, unknown>, headers: Record<string, string>): Promise<Response> {
    const response = await control(env).fetch(new Request(`https://relayer-control${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
    return json(await response.json(), response.status, headers);
}

export async function handle(request: Request, env: Env, deps: RelayerDeps = {}): Promise<Response> {
    const url = new URL(request.url);
    const config = relayerConfig(env);
    if (!config || !env.RELAYER_CONTROL) return json({ error: 'relayer_disabled' }, 503);

    if (url.pathname.startsWith('/internal/')) {
        if (!await adminAuthorized(request, config, env)) return json({ error: 'unauthorized' }, 401);
        if (request.method === 'POST' && url.pathname === '/internal/invites') {
            let body: Record<string, unknown>;
            try {
                body = await readJson(request);
            } catch {
                return json({ error: 'invalid_request' }, 400);
            }
            if (!exactKeys(body, ['amount_usdc_micro']) || typeof body.amount_usdc_micro !== 'string') {
                return json({ error: 'invalid_request' }, 400);
            }
            const bytes = crypto.getRandomValues(new Uint8Array(18));
            const code = `yt_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_')}`;
            const response = await control(env).fetch(new Request('https://relayer-control/invite/create', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ codeHash: await sha256Hex(code), amountMicro: body.amount_usdc_micro }),
            }));
            const created = await response.json() as Record<string, unknown>;
            // The code is returned once and only its hash is stored.
            return json(response.ok ? { code, ...created } : created, response.status);
        }
        const match = /^\/internal\/invited-accounts\/([0-9a-f]{64})$/.exec(url.pathname);
        if (request.method === 'GET' && match) return forward(env, '/invite/status', { accountId: match[1] }, {});
        return json({ error: 'not_found' }, 404);
    }

    if (!url.pathname.startsWith('/v1/')) return json({ error: 'not_found' }, 404);
    const origin = request.headers.get('origin') ?? '';
    if (!config.allowedOrigins.includes(origin)) return json({ error: 'origin_denied' }, 403);
    const cors = corsHeaders(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
    if (env.RELAYER_RATE_LIMITER) {
        const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
        if (!(await env.RELAYER_RATE_LIMITER.limit({ key: `${url.pathname}:ip:${ip}` })).success) {
            return json({ error: 'rate_limited' }, 429, cors);
        }
    }

    let body: Record<string, unknown>;
    try {
        body = await readJson(request);
    } catch {
        return json({ error: 'invalid_request' }, 400, cors);
    }
    const verify = deps.verify ?? verifierFor(config);
    const near = deps.near ?? createNearClient(env.NEAR_RPC_URL!);

    async function verifiedAccount(token: unknown) {
        const identity = await verify(token);
        return { identity, identityHash: await identityHash(identity), accountId: await fastAuthAccount(near, config!.provider, identity.sub) };
    }

    try {
        if (url.pathname === '/v1/accounts') {
            if (!exactKeys(body, ['id_token'])) return json({ error: 'invalid_request' }, 400, cors);
            const account = await verifiedAccount(body.id_token);
            return forward(env, '/account', { identityHash: account.identityHash, accountId: account.accountId }, cors);
        }
        if (url.pathname === '/v1/ckd') {
            const args = body.args as Record<string, unknown> | undefined;
            const key = args?.app_public_key as Record<string, unknown> | undefined;
            if (!exactKeys(body, ['gate_account_id', 'args']) || !exactKeys(args, ['jwt', 'app_public_key'])
                || !exactKeys(key, ['pk1', 'pk2']) || typeof body.gate_account_id !== 'string'
                || !config.ckdGates.includes(body.gate_account_id)
                || typeof key.pk1 !== 'string' || !BLS_G1.test(key.pk1) || typeof key.pk2 !== 'string' || !BLS_G2.test(key.pk2)) {
                return json({ error: 'invalid_request' }, 400, cors);
            }
            const identity = await verify(args!.jwt);
            const nonce = await ckdGateNonce(body.gate_account_id, key.pk1, key.pk2);
            // Same binding the gate checks; stops tokens that would only burn gas.
            if (identity.nonce !== nonce) return json({ error: 'invalid_token' }, 401, cors);
            return forward(env, '/ckd', {
                identityHash: await identityHash(identity), gateAccountId: body.gate_account_id, nonce,
                args: { jwt: args!.jwt, app_public_key: { pk1: key.pk1, pk2: key.pk2 } },
            }, cors);
        }
        if (url.pathname === '/v1/purchases') {
            const { access_token: accessToken, ...rest } = body;
            const fields = parsePurchaseFields(rest, config.marketContractId);
            const identity = await verify(accessToken, { audience: config.provider.signingAudience });
            if (!identity.fatxn) return json({ error: 'invalid_token' }, 401, cors);
            const key = await fastAuthKey(near, config.provider, identity.sub);
            const { bytes } = purchaseDelegate({ senderId: key.accountId, publicKey: key.publicKey, usdcContractId: config.usdcContractId, fields });
            // The user approved exactly these bytes, or nothing is signed.
            if (!sameBytes(bytes, identity.fatxn)) return json({ error: 'approval_mismatch' }, 400, cors);
            // Checks that save gas: the chain would reject these after fast-auth already signed.
            const accessKey = await near.accessKey(key.accountId, key.publicKey);
            const maxHeight = BigInt(fields.max_block_height);
            const nonce = BigInt(fields.nonce);
            if (nonce <= accessKey.nonce || accessKey.blockHeight === undefined
                || nonce >= BigInt(accessKey.blockHeight) * NONCE_RANGE_MULTIPLIER
                || maxHeight <= BigInt(accessKey.blockHeight) || maxHeight > BigInt(accessKey.blockHeight) + MAX_DELEGATE_TTL_BLOCKS) {
                return json({ error: 'delegate_stale' }, 409, cors);
            }
            const balance = await near.view<unknown>(config.usdcContractId, 'ft_balance_of', { account_id: key.accountId });
            if (typeof balance !== 'string' || !/^[0-9]{1,39}$/.test(balance) || BigInt(balance) < BigInt(fields.args.amount)) {
                return json({ error: 'insufficient_balance' }, 409, cors);
            }
            await checkPurchaseMessage(near, {
                marketContractId: config.marketContractId, amount: fields.args.amount, msg: fields.args.msg, nowMs: (deps.now ?? Date.now)(),
            });
            let binary = '';
            for (const byte of bytes) binary += String.fromCharCode(byte);
            return forward(env, '/purchase', {
                identityHash: await identityHash(identity), accountId: key.accountId, userPublicKey: key.publicKey,
                accessToken, fields: { args: fields.args, nonce: fields.nonce, max_block_height: fields.max_block_height }, bytes: btoa(binary),
            }, cors);
        }
        if (url.pathname === '/v1/purchases/status') {
            // No token: the id (SHA-256 of the approved delegate) only lets the caller finish or read
            // a purchase the user already approved, which signing tokens outliving it would not allow.
            if (!exactKeys(body, ['purchase_id']) || typeof body.purchase_id !== 'string' || !/^[0-9a-f]{64}$/.test(body.purchase_id)) {
                return json({ error: 'invalid_request' }, 400, cors);
            }
            return forward(env, '/purchase/status', { purchaseId: body.purchase_id }, cors);
        }
        if (url.pathname === '/v1/invites/redeem') {
            if (!exactKeys(body, ['id_token', 'code']) || typeof body.code !== 'string' || !/^yt_[A-Za-z0-9_-]{24}$/.test(body.code)) {
                return json({ error: 'invalid_request' }, 400, cors);
            }
            const account = await verifiedAccount(body.id_token);
            return forward(env, '/invite/redeem', {
                identityHash: account.identityHash, accountId: account.accountId, codeHash: await sha256Hex(body.code),
            }, cors);
        }
        return json({ error: 'not_found' }, 404, cors);
    } catch (error) {
        const code = error instanceof Error ? error.message : '';
        if (code === 'invalid_token') return json({ error: 'invalid_token' }, 401, cors);
        if (code === 'invalid_request') return json({ error: 'invalid_request' }, 400, cors);
        if (PURCHASE_REJECTIONS[code]) return json({ error: code }, PURCHASE_REJECTIONS[code], cors);
        if (code === 'access_key_missing') return json({ error: 'account_not_ready' }, 409, cors);
        if (['jwks_unavailable', 'rpc_unavailable', 'provider_configuration_changed'].includes(code)) {
            return json({ error: 'dependency_unavailable' }, 503, cors);
        }
        console.error(JSON.stringify({ event: 'relayer_request_failed', path: url.pathname }));
        return json({ error: 'internal_error' }, 500, cors);
    }
}

export default {
    fetch: (request: Request, env: Env) => handle(request, env),
};
