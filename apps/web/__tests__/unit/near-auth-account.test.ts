import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EncryptJWT } from 'jose';
import { POST } from '@/app/api/auth-lab/account/route';

vi.unmock('near-api-js');

const ORIGIN = 'http://localhost:3000';
const SECRET = '11'.repeat(32);
const KEY = 'ed25519:11111111111111111111111111111111';
const IMPLICIT = '00'.repeat(32);
const network = vi.fn();
let candidates: string[];
let permission: unknown;
let mpc: string;
let blockMismatch: boolean;
let implicitExists: boolean;
let gasPrice: string;
let protocolVersion: number;

beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEAR_AUTH_LAB_ENABLED', 'true');
    vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', 'testnet');
    vi.stubEnv('NEAR_AUTH_LAB_CLIENT_ID', 'local-test-client');
    vi.stubEnv('NEAR_AUTH_LAB_SESSION_SECRET', SECRET);
    candidates = ['matched.testnet']; permission = 'FullAccess'; mpc = 'v1.signer-prod.testnet'; blockMismatch = false;
    implicitExists = false; gasPrice = '100000000'; protocolVersion = 85;
    network.mockReset().mockImplementation(async (url: string, init: RequestInit) => {
        expect(init.signal).toBeInstanceOf(AbortSignal);
        expect(init.cache).toBe('no-store');
        if (url.startsWith('https://test.api.fastnear.com/')) return Response.json({ public_key: KEY, account_ids: candidates });
        expect(url).toBe('https://test.rpc.fastnear.com/');
        const { method, params } = JSON.parse(init.body as string);
        if (method === 'gas_price') return Response.json({ result: { gas_price: gasPrice } });
        if (method === 'EXPERIMENTAL_protocol_config') {
            const cost = { send_not_sir: 500000000000, execution: 7200000000000 };
            return Response.json({ result: { protocol_version: protocolVersion, runtime_config: {
                min_gas_purchase_price: '1000000000', transaction_costs: {
                    action_creation_config: { create_account_cost: cost,
                        add_key_cost: { full_access_cost: { send_not_sir: 100000000000, execution: 100000000000 } },
                        transfer_cost: { send_not_sir: 100000000000, execution: 100000000000 } },
                    action_receipt_creation_config: { send_not_sir: 100000000000, execution: 100000000000 },
                },
            } } });
        }
        expect(method).toBe('query');
        const block = { block_hash: blockMismatch && params.block_id ? 'wrong-block' : 'final-block', block_height: 123 };
        if (params.request_type === 'view_account') return Response.json(implicitExists
            ? { result: { ...block, amount: '100000000000000000000000' } }
            : { result: { ...block, error: `account ${params.account_id} does not exist while viewing` } });
        if (params.request_type === 'view_access_key') {
            expect(params.block_id).toBe('final-block');
            expect(params.public_key).toBe(KEY);
            return params.account_id === IMPLICIT
                ? Response.json({ error: { cause: { name: 'UNKNOWN_ACCOUNT' } } })
                : Response.json({ result: { ...block, permission } });
        }
        const values: Record<string, unknown> = { paused: false, mpc_address: mpc, mpc_domain_id: 1, derived_public_key: KEY };
        if (params.method_name === 'derived_public_key') {
            expect(params.account_id).toBe(mpc);
            expect(params.block_id).toBe('final-block');
            expect(JSON.parse(Buffer.from(params.args_base64, 'base64').toString())).toEqual({
                path: 'jwt#https://login.testnet.fast-auth.com/#google-oauth2|synthetic-user',
                predecessor: 'fast-auth.testnet', domain_id: 1,
            });
        }
        return Response.json({ result: { ...block, result: [...Buffer.from(JSON.stringify(values[params.method_name]))] } });
    });
    vi.stubGlobal('fetch', network);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function request(options: { origin?: string; anonymous?: boolean; body?: string; expired?: boolean; tampered?: boolean; funding?: boolean } = {}) {
    const now = Math.floor(Date.now() / 1000);
    const session = await new EncryptJWT({ identity_issuer: 'https://login.testnet.fast-auth.com/', client_id: 'local-test-client' })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setSubject('google-oauth2|synthetic-user')
        .setIssuer('youtick-auth-lab').setAudience(ORIGIN).setIssuedAt(now - 10)
        .setExpirationTime(options.expired ? now - 1 : now + 300).encrypt(Buffer.from(SECRET, 'hex'));
    return new Request(`${ORIGIN}/api/auth-lab/account${options.funding ? '?prepare=funding' : ''}`, { method: 'POST', headers: {
        Origin: options.origin ?? ORIGIN,
        ...(!options.anonymous ? { Cookie: `youtick_auth_lab=${options.tampered ? 'invalid' : session}` } : {}),
    }, ...(options.body !== undefined ? { body: options.body } : {}) });
}

it('derives from the verified session, verifies FullAccess at one final block and exposes no identity or signing claim', async () => {
    const response = await POST(await request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ publicKey: KEY, accounts: ['matched.testnet'], implicitAccount: IMPLICIT, blockHeight: 123, signingTested: false });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(network).toHaveBeenCalledTimes(7);
});

it.each(['ready', 'existing-target', 'existing-match', 'expensive', 'protocol-changed'])('funding preparation: %s', async (scenario) => {
    candidates = scenario === 'existing-match' ? ['matched.testnet'] : [];
    implicitExists = scenario === 'existing-target';
    if (scenario === 'expensive') gasPrice = '100000000000';
    if (scenario === 'protocol-changed') protocolVersion = 86;
    const response = await POST(await request({ funding: true }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.funding.allowed).toBe(scenario === 'ready');
    expect(result.funding.reason).toBe(scenario.startsWith('existing') ? 'account_exists' : scenario === 'ready' ? 'ready' : 'fee_not_verified');
    expect(result.implicitAccount).toBe(IMPLICIT);
});

it.each([
    [{ anonymous: true }, 401], [{ expired: true }, 401], [{ tampered: true }, 401],
    [{ origin: 'https://untrusted.example' }, 403], [{ body: '{"accountId":"attacker.testnet"}' }, 400],
] as const)('rejects invalid requests before network access: %j', async (options, status) => {
    expect((await POST(await request(options))).status).toBe(status);
    expect(network).not.toHaveBeenCalled();
});

it('is closed in production even with the lab flag enabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect((await POST(await request())).status).toBe(404);
    expect(network).not.toHaveBeenCalled();
});

it('accepts an empty streamed request body as used by the actual Next server', async () => {
    const base = await request();
    const emptyStream = new ReadableStream({ start(controller) { controller.close(); } });
    const streamed = new Request(base.url, { method: 'POST', headers: base.headers, body: emptyStream, duplex: 'half' } as RequestInit);
    expect((await POST(streamed)).status).toBe(200);
});

it('does not accept an indexed account with only a FunctionCall key', async () => {
    permission = { FunctionCall: { receiver_id: 'contract.testnet', method_names: [], allowance: null } };
    expect((await (await POST(await request())).json()).accounts).toEqual([]);
});

it('reports no match without treating an implicit address as an existing account', async () => {
    candidates = [];
    expect((await (await POST(await request())).json()).accounts).toEqual([]);
});

it.each(['missing-key', 'other-key', 'other-error', 'wrong-block'])('handles legacy result.error safely: %s', async (scenario) => {
    candidates = [];
    const original = network.getMockImplementation()!;
    network.mockImplementation(async (url: string, init: RequestInit) => {
        if (init.body && JSON.parse(init.body as string).params.request_type === 'view_access_key') {
            return Response.json({ result: {
                block_hash: scenario === 'wrong-block' ? 'wrong-block' : 'final-block', block_height: 123, logs: [],
                error: scenario === 'other-error' ? 'temporary storage failure' :
                    `access key ${scenario === 'other-key' ? 'ed25519:another-key' : KEY} does not exist while viewing`,
            } });
        }
        return original(url, init);
    });
    const response = await POST(await request());
    expect(response.status).toBe(scenario === 'missing-key' ? 200 : 503);
    if (scenario === 'missing-key') expect((await response.json()).accounts).toEqual([]);
    else expect(await response.json()).toEqual({ error: 'account_check_unavailable' });
});

it('returns multiple verified accounts without automatically selecting one', async () => {
    candidates = ['first.testnet', 'second.testnet'];
    expect((await (await POST(await request())).json()).accounts).toEqual(candidates);
});

it.each(['configuration', 'block', 'candidate-limit', 'invalid-account', 'invalid-permission', 'provider-error'])('fails closed on %s', async (failure) => {
    if (failure === 'configuration') mpc = 'another.testnet';
    if (failure === 'block') blockMismatch = true;
    if (failure === 'candidate-limit') candidates = Array.from({ length: 6 }, (_, i) => `account${i}.testnet`);
    if (failure === 'invalid-account') candidates = ['../untrusted'];
    if (failure === 'invalid-permission') permission = undefined;
    if (failure === 'provider-error') network.mockRejectedValue(new Error('do not expose provider body or identity'));
    const response = await POST(await request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'account_check_unavailable' });
});
