import { KeyPair, SignedTransaction, baseEncode, encodeDelegateAction } from 'near-api-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RelayerControl } from './control';
import type { Env } from './env';
import { handle } from './index';
import { ckdGateNonce, identityHash, type VerifiedIdentity } from './jwt';
import { createNearClient, type NearClient, type TxOutcome } from './near';

const ORIGIN = 'https://preview.youtick.net';
const RELAYER = 'relayer.youtick.testnet';
const USDC = 'usdc.fakes.testnet';
const GATE = 'ckd-gate.youtick.testnet';
const ISSUER = 'https://login.testnet.fast-auth.com/';
const ADMIN = 'a'.repeat(40);
const BLOCK_HASH = '11111111111111111111111111111111';
const PK1 = `bls12381g1:${'2'.repeat(66)}`;
const PK2 = `bls12381g2:${'3'.repeat(132)}`;
const DAY = 86_400_000;
const MARKET = 'v2-market.youtick.testnet';
/** Market V2's VAT signer for key version 1. */
const VAT_KEY = KeyPair.fromRandom('ed25519');
/** Buyers with a real key, so the fake fast-auth `sign` can produce a verifiable MPC signature. */
const buyers = new Map<string, KeyPair>();
const buyer = (sub: string) => { if (!buyers.has(sub)) buyers.set(sub, KeyPair.fromRandom('ed25519')); return buyers.get(sub)!; };

function createState() {
    const values = new Map<string, unknown>();
    let tail = Promise.resolve();
    const get = async <T>(key: string) => structuredClone(values.get(key)) as T | undefined;
    const put = async (key: string, value: unknown) => { values.set(key, structuredClone(value)); };
    const del = async (key: string | string[]) => (Array.isArray(key) ? key : [key]).filter((one) => values.delete(one)).length;
    const list = async <T>(options?: { prefix?: string }) => new Map(
        [...values.entries()].filter(([key]) => !options?.prefix || key.startsWith(options.prefix)).map(([key, value]) => [key, structuredClone(value) as T]),
    );
    const alarms: number[] = [];
    let scheduled: number | null = null;
    const storage = {
        get, put, list, delete: del,
        setAlarm: async (at: number) => { alarms.push(at); scheduled = at; },
        getAlarm: async () => scheduled,
        transaction: async <T>(callback: (txn: { get: typeof get; put: typeof put; delete: typeof del }) => Promise<T>) => {
            const run = tail.then(() => callback({ get, put, delete: del }));
            tail = run.then(() => undefined, () => undefined);
            return run;
        },
    };
    /** The runtime clears the scheduled alarm before it runs `alarm()`. */
    const fireAlarm = () => { scheduled = null; };
    return { state: { storage } as unknown as DurableObjectState, values, alarms, fireAlarm };
}

interface SentTx { hash: string; nonce: bigint; receiverId: string; action: Record<string, unknown> }
const kind = (tx: SentTx) => Object.keys(tx.action).find((key) => key !== 'enum' && tx.action[key] != null);

/** Applies decoded relayer transactions to a tiny chain model. */
function createChain() {
    const accounts = new Set<string>();
    const usdcRegistered = new Set<string>();
    const usdcTransfers: { receiver: string; amount: string }[] = [];
    const outcomes = new Map<string, TxOutcome>();
    const sent: SentTx[] = [];
    const chain = {
        accounts, usdcRegistered, usdcTransfers, outcomes, sent,
        keyNonce: 10n,
        // Test hooks.
        dropSends: false,
        rejectNextWithInvalidNonce: false,
        /** `tx` answers with an RPC error (unknown) instead of the real status. */
        statusUnavailable: false,
        expireResends: false,
        failMethod: '' as string,
        lastSigner: '' as string,
        ckdValue: { account_id: 'x', derivation_path: 'v1/x', response: { big_y: 'y', big_c: 'c' } } as unknown,
        usdcBalance: '100000000',
        userKeyNonce: 7n,
        /** fast-auth replies with a signature from the wrong key. */
        forgeMpc: false,
        relayed: [] as Record<string, unknown>[],
        publications: new Map<string, { publication_id: string; price_usdc: string; availability: string }>([
            ['job-001', { publication_id: 'job-001', price_usdc: '5000000', availability: 'ACTIVE' }],
        ]),
        tickets: new Set<string>(),
        purchasesPaused: false,
        beta: null as null | { ends_at_ms: string; closed_at_ms: string | null },
    };
    const near: NearClient = {
        async view<T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T> {
            if (method === 'paused') return false as T;
            if (method === 'mpc_address') return 'v1.signer-prod.testnet' as T;
            if (method === 'mpc_domain_id') return 1 as T;
            if (method === 'derived_public_key') {
                const sub = String(args.path).split('#')[2];
                if (sub.startsWith('buyer')) return buyer(sub).getPublicKey().toString() as T;
                const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sub)));
                return `ed25519:${baseEncode(digest)}` as T;
            }
            if (contractId === USDC && method === 'storage_balance_of') {
                return (usdcRegistered.has(String(args.account_id)) ? { total: '1', available: '0' } : null) as T;
            }
            if (contractId === USDC && method === 'storage_balance_bounds') return { min: '1250000000000000000000', max: null } as T;
            if (contractId === USDC && method === 'ft_balance_of') return chain.usdcBalance as T;
            if (contractId === MARKET && method === 'get_publication') return (chain.publications.get(String(args.publication_id)) ?? null) as T;
            if (contractId === MARKET && method === 'get_ticket') return (chain.tickets.has(String(args.ticket_id)) ? { ticket_id: args.ticket_id } : null) as T;
            if (contractId === MARKET && method === 'get_governance_state') return { new_purchases_paused: chain.purchasesPaused } as T;
            if (contractId === MARKET && method === 'get_public_testnet_beta_state') return chain.beta as T;
            if (contractId === MARKET && method === 'get_vat_public_key') return (args.key_version === 1 ? VAT_KEY.getPublicKey().toString() : null) as T;
            throw new Error(`unexpected view ${contractId}.${method}`);
        },
        async accountExists(accountId) { return accounts.has(accountId); },
        async accessKey(accountId) {
            if (accountId !== RELAYER && (chain as { userKeyMissing?: boolean }).userKeyMissing) throw new Error('access_key_missing');
            if (accountId !== RELAYER) return { nonce: chain.userKeyNonce, blockHash: BLOCK_HASH, blockHeight: 1_000, fullAccess: true };
            return { nonce: chain.keyNonce, blockHash: BLOCK_HASH, fullAccess: true };
        },
        async sendTx(signedTxBase64) {
            const signed = SignedTransaction.decode(Buffer.from(signedTxBase64, 'base64'));
            const hash = baseEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', signed.transaction.encode())));
            if (chain.rejectNextWithInvalidNonce) {
                chain.rejectNextWithInvalidNonce = false;
                chain.keyNonce += 5n;
                return { kind: 'invalid_nonce' };
            }
            const action = signed.transaction.actions[0] as unknown as Record<string, Record<string, unknown>>;
            sent.push({ hash, nonce: BigInt(signed.transaction.nonce), receiverId: signed.transaction.receiverId, action });
            const resend = sent.filter((tx) => tx.hash === hash).length > 1;
            if (resend && chain.expireResends) return { kind: 'expired' };
            if (chain.dropSends || outcomes.has(hash)) return { kind: 'unknown' };
            chain.keyNonce = BigInt(signed.transaction.nonce);
            const call = action.functionCall;
            const args = call ? JSON.parse(new TextDecoder().decode(Uint8Array.from(call.args as ArrayLike<number>))) : null;
            if (call && call.methodName === chain.failMethod) {
                outcomes.set(hash, { kind: 'failed' });
            } else if (action.transfer) {
                accounts.add(signed.transaction.receiverId);
                outcomes.set(hash, { kind: 'success', value: '' });
            } else if (call?.methodName === 'storage_deposit') {
                usdcRegistered.add(args.account_id);
                outcomes.set(hash, { kind: 'success', value: btoa('{}') });
            } else if (call?.methodName === 'ft_transfer') {
                usdcTransfers.push({ receiver: args.receiver_id, amount: args.amount });
                outcomes.set(hash, { kind: 'success', value: '' });
            } else if (call?.methodName === 'sign') {
                const payload = Uint8Array.from(args.sign_payload as number[]);
                const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', payload));
                const sub = [...buyers.entries()].find(([, key]) => key.getPublicKey().toString() === chain.lastSigner)?.[0];
                const signer = chain.forgeMpc ? KeyPair.fromRandom('ed25519') : buyer(sub ?? 'buyer');
                const { signature } = signer.sign(digest);
                outcomes.set(hash, { kind: 'success', value: btoa(JSON.stringify({ signature: Array.from(signature) })) });
            } else if (action.signedDelegate) {
                chain.relayed.push(action.signedDelegate as Record<string, unknown>);
                outcomes.set(hash, { kind: 'success', value: btoa('"5000000"') });
            } else if (call?.methodName === 'request_key') {
                outcomes.set(hash, { kind: 'success', value: btoa(JSON.stringify(chain.ckdValue)) });
            }
            return { kind: 'unknown' };
        },
        async txStatus(txHash) {
            if (chain.statusUnavailable) return { kind: 'unknown' };
            return outcomes.get(txHash) ?? { kind: 'not_found' };
        },
    };
    return { chain, near };
}

let clock = Date.UTC(2026, 9, 7, 12);

function setup(overrides: Partial<Env> = {}) {
    const { state, values, alarms, fireAlarm } = createState();
    const { chain, near } = createChain();
    const env: Env = {
        RELAYER_ENABLED: 'true', RELAYER_MUTATIONS_ENABLED: 'true', NEAR_NETWORK: 'testnet', NEAR_RPC_URL: 'https://rpc.test',
        RELAYER_ACCOUNT_ID: RELAYER, RELAYER_PRIVATE_KEY: KeyPair.fromRandom('ed25519').toString(), NEAR_AUTH_CLIENT_ID: 'client-1',
        CKD_GATE_ACCOUNT_IDS: GATE, USDC_CONTRACT_ID: USDC, MARKET_V2_CONTRACT_ID: MARKET, DAILY_PURCHASE_LIMIT: '5', IDENTITY_DAILY_PURCHASE_LIMIT: '2', ACCOUNT_FUNDING_YOCTO: '10000000000000000000000',
        MAX_STORAGE_DEPOSIT_YOCTO: '10000000000000000000000', DAILY_ACCOUNT_LIMIT: '3', DAILY_CKD_LIMIT: '5',
        IDENTITY_DAILY_CKD_LIMIT: '2', DAILY_INVITE_USDC_MICRO_LIMIT: '15000000', INVITE_AMOUNTS_USDC_MICRO: '5000000,10000000',
        INVITE_TTL_DAYS: '30', ALLOWED_ORIGINS: ORIGIN, RELAYER_ADMIN_TOKEN: ADMIN,
        ...overrides,
    };
    const control = new RelayerControl(state, env, { near, now: () => clock, sleep: async () => undefined });
    env.RELAYER_CONTROL = {
        idFromName: () => 'id',
        get: () => ({ fetch: (request: Request) => control.fetch(request) }),
    } as unknown as DurableObjectNamespace;
    // Tokens in tests are "sub|nonce"; the real verifier is covered in jwt.test.ts.
    const verify = vi.fn(async (token: unknown, options?: { audience?: string }): Promise<VerifiedIdentity> => {
        // Signing tokens in tests are JSON strings { sub, fatxn } for the guard audience.
        if (typeof token === 'string' && token.startsWith('{')) {
            const value = JSON.parse(token) as { sub: string; fatxn: number[]; audience?: string };
            if (options?.audience !== 'auth0.jwt.fast-auth.testnet' || value.audience === 'wrong') throw new Error('invalid_token');
            chain.lastSigner = buyer(value.sub).getPublicKey().toString();
            return { iss: ISSUER, sub: value.sub, exp: clock / 1000 + 600, nonce: null, fatxn: Uint8Array.from(value.fatxn) };
        }
        if (options?.audience) throw new Error('invalid_token');
        const [sub, nonce] = String(token).split('|');
        if (!sub || sub === 'bad') throw new Error('invalid_token');
        return { iss: ISSUER, sub, exp: clock / 1000 + 600, nonce: nonce || null, fatxn: null };
    });
    const call = async (path: string, body: unknown, headers: Record<string, string> = {}) => {
        const response = await handle(new Request(`https://relayer.test${path}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers }, body: JSON.stringify(body),
        }), env, { verify, near, now: () => clock });
        return { status: response.status, body: await response.json() as Record<string, unknown> };
    };
    const admin = (path: string, body?: unknown, method = 'POST') => handle(new Request(`https://relayer.test${path}`, {
        method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env, { verify, near }).then(async (response) => ({ status: response.status, body: await response.json() as Record<string, unknown> }));
    const alarm = () => { fireAlarm(); return control.alarm(); };
    return { env, chain, values, alarms, control, alarm, call, admin, verify };
}

async function accountOf(sub: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sub)));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

beforeEach(() => { clock += DAY; });

describe('accounts', () => {
    it('opens the implicit account and registers it with USDC once per identity', async () => {
        const { call, chain } = setup();
        const accountId = await accountOf('fan');
        expect(await call('/v1/accounts', { id_token: 'fan' })).toEqual({ status: 200, body: { accountId, ready: true } });
        expect(chain.sent.map((tx) => [tx.receiverId, kind(tx)])).toEqual([[accountId, 'transfer'], [USDC, 'functionCall']]);
        expect(String((chain.sent[1].action.functionCall as Record<string, unknown>).deposit)).toBe('1250000000000000000000');
        expect(await call('/v1/accounts', { id_token: 'fan' })).toEqual({ status: 200, body: { accountId, ready: true } });
        expect(chain.sent).toHaveLength(2);
    });

    it('skips work that is already done on chain and enforces the daily account limit', async () => {
        const { call, chain } = setup();
        const existing = await accountOf('wallet-user');
        chain.accounts.add(existing);
        chain.usdcRegistered.add(existing);
        expect((await call('/v1/accounts', { id_token: 'wallet-user' })).body).toEqual({ accountId: existing, ready: true });
        expect(chain.sent).toEqual([]);
        await call('/v1/accounts', { id_token: 'a' });
        await call('/v1/accounts', { id_token: 'b' });
        expect(await call('/v1/accounts', { id_token: 'c' })).toEqual({ status: 429, body: { error: 'daily_limit_reached' } });
    });

    it('applies the per-IP limiter when it is bound', async () => {
        const { env, call } = setup();
        const limit = vi.fn(async () => ({ success: false }));
        env.RELAYER_RATE_LIMITER = { limit } as unknown as RateLimit;
        expect(await call('/v1/accounts', { id_token: 'fan' }, { 'CF-Connecting-IP': '203.0.113.9' }))
            .toEqual({ status: 429, body: { error: 'rate_limited' } });
        expect(limit).toHaveBeenCalledWith({ key: '/v1/accounts:ip:203.0.113.9' });
    });

    it('rejects foreign origins, bad tokens, extra fields and disabled configuration', async () => {
        const { call, env } = setup();
        expect((await call('/v1/accounts', { id_token: 'fan' }, { Origin: 'https://evil.example' })).status).toBe(403);
        expect(await call('/v1/accounts', { id_token: 'bad' })).toMatchObject({ status: 401, body: { error: 'invalid_token' } });
        expect((await call('/v1/accounts', { id_token: 'fan', extra: 1 })).status).toBe(400);
        const disabled = await handle(new Request('https://relayer.test/v1/accounts', { method: 'POST' }), { ...env, RELAYER_ENABLED: 'false' });
        expect(disabled.status).toBe(503);
        const noMutations = setup({ RELAYER_MUTATIONS_ENABLED: 'false' });
        expect(await noMutations.call('/v1/accounts', { id_token: 'fan' })).toMatchObject({ status: 503, body: { error: 'mutations_disabled' } });
    });
});

describe('CKD requests', () => {
    async function ckdBody(sub: string, gate = GATE) {
        const nonce = await ckdGateNonce(gate, PK1, PK2);
        return { gate_account_id: gate, args: { jwt: `${sub}|${nonce}`, app_public_key: { pk1: PK1, pk2: PK2 } } };
    }

    it('submits request_key to the gate and returns the on_ckd value once', async () => {
        const { call, chain, values } = setup();
        const body = await ckdBody('fan');
        expect(await call('/v1/ckd', body)).toEqual({ status: 200, body: { result: chain.ckdValue } });
        const [tx] = chain.sent;
        expect(tx.receiverId).toBe(GATE);
        const fn = tx.action.functionCall as Record<string, unknown>;
        expect(fn.methodName).toBe('request_key');
        expect(BigInt(fn.gas as bigint)).toBe(150_000_000_000_000n);
        expect(JSON.parse(new TextDecoder().decode(Uint8Array.from(fn.args as ArrayLike<number>)))).toEqual(body.args);
        // The signed transaction (with the id_token) is not kept once the result is returned.
        expect([...values.keys()].some((key) => key.startsWith('tx:ckd:'))).toBe(false);
        expect(await call('/v1/ckd', body)).toEqual({ status: 409, body: { error: 'ckd_already_requested' } });
    });

    it('requires the nonce binding, a trusted gate and stays within per-identity limits', async () => {
        const { call } = setup();
        const body = await ckdBody('fan');
        expect((await call('/v1/ckd', { ...body, args: { ...body.args, jwt: 'fan|other-nonce' } })).status).toBe(401);
        expect((await call('/v1/ckd', await ckdBody('fan', 'other-gate.testnet'))).status).toBe(400);
        expect((await call('/v1/ckd', { ...body, args: { ...body.args, account_id: 'x.testnet' } })).status).toBe(400);
        for (const pk1 of [PK1.replace('g1', 'g2'), `${PK1}0`]) {
            expect((await call('/v1/ckd', { ...body, args: { ...body.args, app_public_key: { pk1, pk2: PK2 } } })).status).toBe(400);
        }
        const pk = (n: number) => `bls12381g1:${String(n).repeat(66)}`;
        for (const n of [4, 5]) {
            const nonce = await ckdGateNonce(GATE, pk(n), PK2);
            expect((await call('/v1/ckd', { gate_account_id: GATE, args: { jwt: `fan|${nonce}`, app_public_key: { pk1: pk(n), pk2: PK2 } } })).status).toBe(200);
        }
        const nonce = await ckdGateNonce(GATE, pk(6), PK2);
        expect(await call('/v1/ckd', { gate_account_id: GATE, args: { jwt: `fan|${nonce}`, app_public_key: { pk1: pk(6), pk2: PK2 } } }))
            .toEqual({ status: 429, body: { error: 'identity_limit_reached' } });
    });
});

describe('invites', () => {
    async function createInvite(admin: ReturnType<typeof setup>['admin'], amount = '5000000') {
        const created = await admin('/internal/invites', { amount_usdc_micro: amount });
        expect(created.status).toBe(201);
        expect(created.body.code).toMatch(/^yt_[A-Za-z0-9_-]{24}$/);
        return String(created.body.code);
    }

    it('pays the credit once, records the creator and keeps only the code hash', async () => {
        const { call, admin, chain, values } = setup();
        const code = await createInvite(admin);
        expect([...values.values()].some((value) => JSON.stringify(value).includes(code))).toBe(false);
        expect(await call('/v1/invites/redeem', { id_token: 'creator', code })).toEqual({ status: 409, body: { error: 'account_required' } });
        await call('/v1/accounts', { id_token: 'creator' });
        const accountId = await accountOf('creator');
        expect(await call('/v1/invites/redeem', { id_token: 'creator', code }))
            .toEqual({ status: 200, body: { accountId, amountMicro: '5000000', paid: true } });
        expect(chain.usdcTransfers).toEqual([{ receiver: accountId, amount: '5000000' }]);
        const transfer = chain.sent.at(-1)!.action.functionCall as Record<string, unknown>;
        expect(BigInt(transfer.deposit as bigint)).toBe(1n);
        // Idempotent for the same identity; no second transfer.
        expect((await call('/v1/invites/redeem', { id_token: 'creator', code })).body).toMatchObject({ paid: true });
        expect(chain.usdcTransfers).toHaveLength(1);
        expect(await admin(`/internal/invited-accounts/${accountId}`, undefined, 'GET')).toEqual({ status: 200, body: { accountId, invited: true } });
        expect((await admin(`/internal/invited-accounts/${await accountOf('nobody')}`, undefined, 'GET')).body).toMatchObject({ invited: false });
    });

    it('allows one code per identity and one identity per code, and refuses expired or unknown codes', async () => {
        const { call, admin } = setup();
        const [first, second, third] = [await createInvite(admin), await createInvite(admin), await createInvite(admin, '10000000')];
        await call('/v1/accounts', { id_token: 'creator' });
        await call('/v1/accounts', { id_token: 'other' });
        expect((await call('/v1/invites/redeem', { id_token: 'creator', code: first })).status).toBe(200);
        expect(await call('/v1/invites/redeem', { id_token: 'creator', code: second })).toEqual({ status: 409, body: { error: 'invite_already_used' } });
        expect(await call('/v1/invites/redeem', { id_token: 'other', code: first })).toEqual({ status: 409, body: { error: 'invite_unavailable' } });
        expect(await call('/v1/invites/redeem', { id_token: 'other', code: `yt_${'A'.repeat(24)}` })).toEqual({ status: 409, body: { error: 'invite_unavailable' } });
        // 5 + 10 USDC would exceed the 15 USDC daily limit only with another 5; here it fits exactly.
        expect((await call('/v1/invites/redeem', { id_token: 'other', code: third })).status).toBe(200);
        clock += 31 * DAY;
        await call('/v1/accounts', { id_token: 'late' });
        expect(await call('/v1/invites/redeem', { id_token: 'late', code: second })).toEqual({ status: 409, body: { error: 'invite_unavailable' } });
    });

    it('returns the code when the transfer fails on chain and enforces the daily credit limit', async () => {
        const { call, admin, chain } = setup({ DAILY_INVITE_USDC_MICRO_LIMIT: '5000000' });
        const code = await createInvite(admin);
        await call('/v1/accounts', { id_token: 'creator' });
        chain.failMethod = 'ft_transfer';
        expect(await call('/v1/invites/redeem', { id_token: 'creator', code })).toEqual({ status: 502, body: { error: 'tx_failed' } });
        chain.failMethod = '';
        clock += DAY;
        expect((await call('/v1/invites/redeem', { id_token: 'creator', code })).body).toMatchObject({ paid: true });
        const another = await createInvite(admin);
        await call('/v1/accounts', { id_token: 'second' });
        expect(await call('/v1/invites/redeem', { id_token: 'second', code: another })).toEqual({ status: 429, body: { error: 'daily_limit_reached' } });
    });

    it('protects the internal endpoints with the admin token and allowed amounts', async () => {
        const { admin, env } = setup();
        const denied = await handle(new Request('https://relayer.test/internal/invites', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' }, body: '{"amount_usdc_micro":"5000000"}',
        }), env);
        expect(denied.status).toBe(401);
        expect((await admin('/internal/invites', { amount_usdc_micro: '7000000' })).status).toBe(400);
    });
});

describe('NEAR Auth purchases', () => {
    const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
    const hex = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('');

    /** A `buy_ticket_v2` message Market V2 would accept, signed like apps/web and the payment service do. */
    async function purchaseMessage(overrides: { publication?: string; gross?: string; ticket?: KeyPair; vatSigner?: KeyPair; expiresAtMs?: number } = {}) {
        const ticket = overrides.ticket ?? KeyPair.fromRandom('ed25519');
        const ticketId = await hex(ticket.getPublicKey().data);
        const publication = overrides.publication ?? 'job-001';
        const gross = overrides.gross ?? '5000000';
        const expires = String(overrides.expiresAtMs ?? clock + 10 * 60_000);
        const session = KeyPair.fromRandom('ed25519').getPublicKey().toString();
        const certificate = 'ab'.repeat(32);
        const lines = (fields: string[]) => new TextEncoder().encode(fields.join('\n'));
        const device = ticket.sign(lines(['youtick.market-v2.ticket-sig.v1', 'testnet', MARKET, 'purchase_device', ticketId, expires, publication, session, certificate]));
        const vat = (overrides.vatSigner ?? VAT_KEY).sign(lines(['youtick.market-v2.vat.v1', 'testnet', MARKET, ticketId, publication, gross, '833334', expires, '1']));
        return {
            ticketId,
            msg: JSON.stringify({
                action: 'buy_ticket_v2', publication_id: publication, ticket_public_key: ticket.getPublicKey().toString(),
                device: { session_public_key: session, certificate_sha256: certificate, expires_at_ms: expires, signature: b64(device.signature) },
                vat: { vat_usdc_micro: '833334', expires_at_ms: expires, key_version: '1', signature: b64(vat.signature) },
            }),
        };
    }

    async function purchase(sub: string, overrides: {
        amount?: string; receiver?: string; msg?: string; nonce?: string; maxBlockHeight?: string; tamper?: boolean; audience?: string;
    } = {}) {
        const msg = overrides.msg ?? (await purchaseMessage({ gross: overrides.amount })).msg;
        const fields = {
            args: { receiver_id: overrides.receiver ?? MARKET, amount: overrides.amount ?? '5000000', msg },
            nonce: overrides.nonce ?? '8', max_block_height: overrides.maxBlockHeight ?? '1100',
        };
        const { purchaseDelegate } = await import('./purchase');
        const accountId = Array.from(buyer(sub).getPublicKey().data, (b) => b.toString(16).padStart(2, '0')).join('');
        const { bytes } = purchaseDelegate({ senderId: accountId, publicKey: buyer(sub).getPublicKey().toString(), usdcContractId: USDC, fields });
        const fatxn = Array.from(bytes);
        if (overrides.tamper) fatxn[fatxn.length - 40] ^= 1;
        return { body: { access_token: JSON.stringify({ sub, fatxn, audience: overrides.audience }), ...fields }, accountId, bytes };
    }

    it('signs through fast-auth, verifies the MPC signature and relays exactly the approved delegate', async () => {
        const { call, chain, values } = setup();
        const request = await purchase('buyer-1');
        const first = await call('/v1/purchases', request.body);
        expect(first).toMatchObject({ status: 200, body: { state: 'submitted', purchaseId: await hex(request.bytes) } });
        const sign = chain.sent.find((tx) => (tx.action.functionCall as Record<string, unknown> | undefined)?.methodName === 'sign')!;
        expect(sign.receiverId).toBe('fast-auth.testnet');
        const signArgs = JSON.parse(new TextDecoder().decode(Uint8Array.from((sign.action.functionCall as { args: ArrayLike<number> }).args)));
        expect(signArgs).toMatchObject({ guard_id: `jwt#${ISSUER}`, algorithm: 'eddsa', sign_payload: Array.from(request.bytes) });
        const relay = chain.sent.at(-1)!;
        expect(relay.receiverId).toBe(request.accountId);
        expect(Array.from(encodeDelegateAction(chain.relayed[0].delegateAction as never))).toEqual(Array.from(request.bytes));
        // The approval token does not stay in storage once the signature exists.
        expect([...values.keys()].some((key) => key.startsWith('tx:sign:'))).toBe(false);
        expect(JSON.stringify([...values.values()])).not.toContain('fatxn');
        // A retry of the same approval and the status route are idempotent: same relay, no new transaction.
        const sentBefore = chain.sent.length;
        const expected = { status: 200, body: { purchaseId: first.body.purchaseId, state: 'submitted', txHash: relay.hash } };
        expect(await call('/v1/purchases', request.body)).toEqual(expected);
        expect(await call('/v1/purchases/status', { purchase_id: first.body.purchaseId })).toEqual(expected);
        expect(chain.sent).toHaveLength(sentBefore);
    });

    it('sponsors nothing but a buy_ticket_v2 transfer to this Market that matches the approval', async () => {
        const { call, chain } = setup();
        const cases: [Parameters<typeof purchase>[1], number, string][] = [
            [{ receiver: 'other-market.testnet' }, 400, 'invalid_request'],
            [{ msg: JSON.stringify({ action: 'withdraw', publication_id: 'job-001' }) }, 400, 'invalid_request'],
            [{ tamper: true }, 400, 'approval_mismatch'],
            [{ audience: 'wrong' }, 401, 'invalid_token'],
            [{ nonce: '7' }, 409, 'delegate_stale'],
            [{ maxBlockHeight: '2201' }, 409, 'delegate_stale'],
            [{ amount: '200000000' }, 409, 'insufficient_balance'],
        ];
        for (const [overrides, status, error] of cases) {
            expect(await call('/v1/purchases', (await purchase('buyer-2', overrides)).body)).toEqual({ status, body: { error } });
        }
        expect(chain.sent).toEqual([]);
        const login = await call('/v1/purchases', { ...(await purchase('buyer-2')).body, access_token_extra: 1 });
        expect(login.status).toBe(400);
    });

    it('bounds the delegate nonce before anything is signed', async () => {
        const { call, chain } = setup();
        // NEAR rejects a delegate nonce at or above block_height * 1e6 (the fake key is read at height 1,000).
        expect(await call('/v1/purchases', (await purchase('buyer-5', { nonce: '1000000000' })).body))
            .toEqual({ status: 409, body: { error: 'delegate_stale' } });
        expect(await call('/v1/purchases', (await purchase('buyer-5', { nonce: '999999999' })).body)).toMatchObject({ status: 200 });
        // Above u64 the delegate cannot even be encoded.
        const tooLarge = (await purchase('buyer-5')).body;
        expect(await call('/v1/purchases', { ...tooLarge, nonce: String(1n << 64n) })).toEqual({ status: 400, body: { error: 'invalid_request' } });
        expect(chain.relayed).toHaveLength(1);
    });

    it('refuses before signing a purchase Market V2 would refund', async () => {
        const { call, chain } = setup();
        const used = KeyPair.fromRandom('ed25519');
        chain.tickets.add((await purchaseMessage({ ticket: used })).ticketId);
        chain.publications.set('job-paused', { publication_id: 'job-paused', price_usdc: '5000000', availability: 'SALES_SUSPENDED' });
        chain.publications.set('job-cheap', { publication_id: 'job-cheap', price_usdc: '4000000', availability: 'ACTIVE' });
        // The Market's base64 decoder rejects non-zero trailing bits that `atob` ignores.
        const valid = JSON.parse((await purchaseMessage()).msg) as { device: { signature: string }; vat: { signature: string } };
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        const position = alphabet.indexOf(valid.vat.signature[85]);
        valid.vat.signature = `${valid.vat.signature.slice(0, 85)}${alphabet[position ^ 1]}==`;
        const duplicate = (await purchaseMessage()).msg;
        const cases: [string, number, string][] = [
            [(await purchaseMessage({ publication: 'job-paused' })).msg, 409, 'publication_unavailable'],
            [(await purchaseMessage({ publication: 'job-missing' })).msg, 409, 'publication_unavailable'],
            [(await purchaseMessage({ ticket: used })).msg, 409, 'ticket_exists'],
            [(await purchaseMessage({ expiresAtMs: clock + 30_000 })).msg, 409, 'signature_expired'],
            [(await purchaseMessage({ expiresAtMs: clock + 2 * 3_600_000 })).msg, 400, 'purchase_invalid'],
            [(await purchaseMessage({ vatSigner: KeyPair.fromRandom('ed25519') })).msg, 400, 'purchase_invalid'],
            [JSON.stringify({ ...JSON.parse((await purchaseMessage()).msg), extra: 1 }), 400, 'purchase_invalid'],
            [JSON.stringify(valid), 400, 'purchase_invalid'],
            // JSON.parse keeps the last duplicate; the Market's serde refuses the message.
            [duplicate.replace('"publication_id":"job-001"', '"publication_id":"other","publication_id":"job-001"'), 400, 'purchase_invalid'],
            [duplicate.replace('"key_version":"1"', '"key_version":"2","key_version":"1"'), 400, 'purchase_invalid'],
            [JSON.stringify(JSON.parse(duplicate), null, 1), 400, 'purchase_invalid'],
        ];
        for (const [msg, status, error] of cases) {
            expect(await call('/v1/purchases', (await purchase('buyer-6', { msg })).body)).toEqual({ status, body: { error } });
        }
        expect(await call('/v1/purchases', (await purchase('buyer-6', { amount: '4000000', msg: (await purchaseMessage({ publication: 'job-cheap', gross: '4000000' })).msg })).body))
            .toEqual({ status: 409, body: { error: 'publication_unavailable' } });
        // Market-wide: purchases paused by governance, or a public testnet beta that has ended.
        chain.purchasesPaused = true;
        expect(await call('/v1/purchases', (await purchase('buyer-6')).body)).toEqual({ status: 503, body: { error: 'purchases_paused' } });
        chain.purchasesPaused = false;
        chain.beta = { ends_at_ms: String(clock - 1), closed_at_ms: null };
        expect(await call('/v1/purchases', (await purchase('buyer-6')).body)).toEqual({ status: 503, body: { error: 'purchases_paused' } });
        chain.beta = { ends_at_ms: String(clock + DAY), closed_at_ms: String(clock - 1) };
        expect(await call('/v1/purchases', (await purchase('buyer-6')).body)).toEqual({ status: 503, body: { error: 'purchases_paused' } });
        chain.beta = { ends_at_ms: String(clock + DAY), closed_at_ms: null };
        expect(await call('/v1/purchases', (await purchase('buyer-6', { nonce: '9' })).body)).toMatchObject({ status: 200 });
        chain.sent.length = 0;
        // The amount must be the publication price, signed into the VAT attestation.
        chain.publications.set('job-001', { publication_id: 'job-001', price_usdc: '6000000', availability: 'ACTIVE' });
        expect(await call('/v1/purchases', (await purchase('buyer-6')).body)).toEqual({ status: 409, body: { error: 'price_mismatch' } });
        expect(chain.sent).toEqual([]);
    });

    it('finishes a pending purchase from the status route, with no token and after the nonce moved', async () => {
        const { call, chain, verify } = setup();
        chain.statusUnavailable = true;
        const pending = await call('/v1/purchases', (await purchase('buyer-7')).body);
        expect(pending).toMatchObject({ status: 202, body: { state: 'signing' } });
        const id = pending.body.purchaseId as string;
        expect(id).toMatch(/^[0-9a-f]{64}$/);
        chain.statusUnavailable = false;
        // The signing token has expired and the user's key nonce reached the delegate's: neither matters here.
        chain.userKeyNonce = 8n;
        verify.mockClear();
        expect(await call('/v1/purchases/status', { purchase_id: id })).toMatchObject({ status: 200, body: { purchaseId: id, state: 'submitted' } });
        expect(verify).not.toHaveBeenCalled();
        expect(chain.relayed).toHaveLength(1);
        expect(await call('/v1/purchases/status', { purchase_id: 'f'.repeat(64) })).toEqual({ status: 404, body: { error: 'purchase_not_found' } });
        expect(await call('/v1/purchases/status', { purchase_id: id, access_token: 'x' })).toEqual({ status: 400, body: { error: 'invalid_request' } });
    });

    it('relays an approved purchase from the alarm when the client stops asking, and drops it after a day', async () => {
        const { call, chain, values, alarm, alarms } = setup();
        chain.statusUnavailable = true;
        const pending = await call('/v1/purchases', (await purchase('buyer-8')).body);
        expect(pending.status).toBe(202);
        // A second purchase keeps the earliest alarm instead of moving it later.
        clock += 60_000;
        expect((await call('/v1/purchases', (await purchase('buyer-8', { nonce: '9' })).body)).status).toBe(202);
        expect(alarms).toHaveLength(1);
        chain.statusUnavailable = false;
        await alarm();
        const id = pending.body.purchaseId as string;
        expect(values.get(`purchase:${id}`)).toMatchObject({ state: 'submitted' });
        expect(chain.relayed).toHaveLength(2);
        clock += 25 * 60 * 60_000;
        await alarm();
        expect([...values.keys()].filter((key) => key.startsWith('purchase:') || key.startsWith('tx:relay:'))).toEqual([]);
    });

    it('expires a purchase whose signature is not confirmed in time, without starting the same bytes again', async () => {
        const { call, chain, values, alarm } = setup();
        chain.statusUnavailable = true;
        const message = (await purchaseMessage({ expiresAtMs: clock + 50 * 60_000 })).msg;
        const request = await purchase('buyer-9', { msg: message });
        const pending = await call('/v1/purchases', request.body);
        const id = pending.body.purchaseId as string;
        const signHash = (values.get(`tx:sign:${id}`) as { txHash: string }).txHash;
        clock += 11 * 60_000;
        await alarm();
        // The sign may have landed unseen; its hash is kept and the same bytes are not signed again.
        expect(values.get(`purchase:${id}`)).toMatchObject({ state: 'failed', error: 'approval_expired', retryable: false, signTxHash: signHash });
        expect(JSON.stringify([...values.entries()])).not.toContain('fatxn');
        expect(await call('/v1/purchases/status', { purchase_id: id })).toEqual({ status: 409, body: { error: 'approval_expired' } });
        chain.statusUnavailable = false;
        const sent = chain.sent.length;
        expect(await call('/v1/purchases', request.body)).toEqual({ status: 409, body: { error: 'approval_expired' } });
        expect(chain.sent).toHaveLength(sent);
        // A new approval has new bytes; the shared delegate nonce still lets only one of them execute.
        expect(await call('/v1/purchases', (await purchase('buyer-9', { msg: message, maxBlockHeight: '1101' })).body))
            .toMatchObject({ status: 200, body: { state: 'submitted' } });
    });

    it('does not relay once the message signatures are about to expire', async () => {
        const { call, chain } = setup();
        chain.statusUnavailable = true;
        const pending = await call('/v1/purchases', (await purchase('buyer-12', { msg: (await purchaseMessage({ expiresAtMs: clock + 3 * 60_000 })).msg })).body);
        expect(pending.status).toBe(202);
        clock += 3 * 60_000;
        chain.statusUnavailable = false;
        expect(await call('/v1/purchases/status', { purchase_id: pending.body.purchaseId })).toEqual({ status: 409, body: { error: 'signature_expired' } });
        expect(chain.relayed).toEqual([]);
    });

    it('uses a newer approval token when nothing was sent with the earlier one', async () => {
        const { call, chain, env } = setup({ RELAYER_MUTATIONS_ENABLED: 'false' });
        const request = await purchase('buyer-13');
        expect(await call('/v1/purchases', request.body)).toEqual({ status: 503, body: { error: 'mutations_disabled' } });
        env.RELAYER_MUTATIONS_ENABLED = 'true';
        const token = JSON.stringify({ ...JSON.parse(request.body.access_token), audience: 'renewed' });
        expect(await call('/v1/purchases', { ...request.body, access_token: token })).toMatchObject({ status: 200 });
        const sign = chain.sent.find((tx) => (tx.action.functionCall as Record<string, unknown> | undefined)?.methodName === 'sign')!;
        const args = JSON.parse(new TextDecoder().decode(Uint8Array.from((sign.action.functionCall as { args: ArrayLike<number> }).args)));
        expect(args.verify_payload).toBe(token);
    });

    it('charges the limits once for concurrent requests of one purchase', async () => {
        const { call, values } = setup();
        const request = await purchase('buyer-10');
        const results = await Promise.all([call('/v1/purchases', request.body), call('/v1/purchases', request.body)]);
        expect(results.map((result) => result.status)).toEqual([200, 200]);
        const day = new Date(clock).toISOString().slice(0, 10);
        expect(values.get(`count:${day}:purchases`)).toBe('1');
    });

    it('refuses an MPC signature that does not verify against the buyer key, and limits purchases per identity', async () => {
        const forged = setup();
        forged.chain.forgeMpc = true;
        const request = await purchase('buyer-3');
        expect(await forged.call('/v1/purchases', request.body)).toEqual({ status: 409, body: { error: 'approval_rejected' } });
        expect(forged.chain.relayed).toEqual([]);
        expect([...forged.values.keys()].some((key) => key.startsWith('tx:sign:'))).toBe(false);
        // The status route reports the same final answer instead of signing again.
        const sent = forged.chain.sent.length;
        const id = [...forged.values.keys()].find((key) => key.startsWith('purchase:'))!.slice('purchase:'.length);
        expect(await forged.call('/v1/purchases/status', { purchase_id: id })).toEqual({ status: 409, body: { error: 'approval_rejected' } });
        expect(forged.chain.sent).toHaveLength(sent);

        const limited = setup();
        for (const nonce of ['8', '9']) expect((await limited.call('/v1/purchases', (await purchase('buyer-4', { nonce })).body)).status).toBe(200);
        expect(await limited.call('/v1/purchases', (await purchase('buyer-4', { nonce: '10' })).body))
            .toEqual({ status: 429, body: { error: 'identity_limit_reached' } });
    });

    it('tells a missing access key apart from an unavailable RPC', async () => {
        const reply = (body: unknown) => createNearClient('https://rpc.test', async () => Response.json(body));
        const missing = { jsonrpc: '2.0', id: 1, error: { name: 'HANDLER_ERROR', cause: { name: 'UNKNOWN_ACCESS_KEY' } } };
        await expect(reply(missing).accessKey('a.testnet', 'ed25519:x')).rejects.toThrow('access_key_missing');
        await expect(reply({ jsonrpc: '2.0', id: 1, error: { name: 'INTERNAL_ERROR' } }).accessKey('a.testnet', 'ed25519:x')).rejects.toThrow('rpc_unavailable');
    });

    it('reports a missing NEAR Auth access key as an account that is not ready', async () => {
        const { call, chain } = setup();
        const near = chain as unknown as { userKeyMissing?: boolean };
        near.userKeyMissing = true;
        expect(await call('/v1/purchases', (await purchase('buyer-11')).body)).toEqual({ status: 409, body: { error: 'account_not_ready' } });
    });
});

describe('transaction outbox', () => {
    it('reconciles a lost broadcast by resending the same signed transaction, never a new signature', async () => {
        const { call, chain } = setup();
        chain.dropSends = true;
        expect(await call('/v1/accounts', { id_token: 'fan' })).toMatchObject({ status: 202, body: { ready: false } });
        const first = chain.sent[0];
        // Still within the in-flight window: no resend.
        expect((await call('/v1/accounts', { id_token: 'fan' })).status).toBe(202);
        expect(new Set(chain.sent.map((tx) => tx.hash))).toEqual(new Set([first.hash]));
        chain.dropSends = false;
        clock += 60_000;
        expect((await call('/v1/accounts', { id_token: 'fan' })).body).toMatchObject({ ready: true });
        expect(chain.sent.filter((tx) => kind(tx) === 'transfer').every((tx) => tx.hash === first.hash)).toBe(true);
        expect(chain.accounts.size).toBe(1);
    });

    it('signs again only when the transaction can no longer land', async () => {
        const { call, chain } = setup();
        chain.dropSends = true;
        await call('/v1/accounts', { id_token: 'fan' });
        const first = chain.sent[0];
        chain.keyNonce = first.nonce + 3n;
        clock += 60_000;
        expect((await call('/v1/accounts', { id_token: 'fan' })).status).toBe(202);
        expect(chain.sent.every((tx) => tx.hash === first.hash)).toBe(true);
        chain.dropSends = false;
        clock += 4 * 60_000;
        expect((await call('/v1/accounts', { id_token: 'fan' })).body).toMatchObject({ ready: true });
        const transfers = chain.sent.filter((tx) => kind(tx) === 'transfer');
        expect(transfers.at(-1)!.hash).not.toBe(first.hash);
        expect(transfers.at(-1)!.nonce).toBeGreaterThan(first.nonce + 3n);
    });

    it('signs once more after a validation-time nonce rejection', async () => {
        const { call, chain } = setup();
        chain.rejectNextWithInvalidNonce = true;
        expect((await call('/v1/accounts', { id_token: 'fan' })).body).toMatchObject({ ready: true });
        expect(chain.sent[0].nonce).toBe(16n);
    });

    it('never pays an invite twice when the status RPC fails after the transfer landed', async () => {
        const { call, admin, chain } = setup();
        const code = String((await admin('/internal/invites', { amount_usdc_micro: '5000000' })).body.code);
        await call('/v1/accounts', { id_token: 'creator' });
        await call('/v1/accounts', { id_token: 'other' });
        chain.statusUnavailable = true;
        expect((await call('/v1/invites/redeem', { id_token: 'creator', code })).status).toBe(202);
        clock += 30 * 60_000;
        expect((await call('/v1/invites/redeem', { id_token: 'creator', code })).status).toBe(202);
        expect(await call('/v1/invites/redeem', { id_token: 'other', code })).toEqual({ status: 409, body: { error: 'invite_unavailable' } });
        expect(chain.usdcTransfers).toHaveLength(1);
        chain.statusUnavailable = false;
        expect((await call('/v1/invites/redeem', { id_token: 'creator', code })).body).toMatchObject({ paid: true });
        expect(chain.usdcTransfers).toHaveLength(1);
    });

    it('hands an invite transfer the chain does not know to manual review instead of signing again', async () => {
        const { call, admin, chain } = setup();
        const code = String((await admin('/internal/invites', { amount_usdc_micro: '5000000' })).body.code);
        await call('/v1/accounts', { id_token: 'creator' });
        chain.dropSends = true;
        expect((await call('/v1/invites/redeem', { id_token: 'creator', code })).status).toBe(202);
        const transfer = chain.sent.at(-1)!;
        chain.keyNonce = transfer.nonce + 1n;
        clock += 10 * 60_000;
        expect(await call('/v1/invites/redeem', { id_token: 'creator', code })).toEqual({ status: 503, body: { error: 'tx_needs_review' } });
        expect(chain.sent.filter((tx) => (tx.action.functionCall as Record<string, unknown> | undefined)?.methodName === 'ft_transfer'))
            .toHaveLength(1);
    });

    it('signs again when the resend reports an expired block hash', async () => {
        const { call, chain } = setup();
        chain.dropSends = true;
        await call('/v1/accounts', { id_token: 'fan' });
        const first = chain.sent[0];
        chain.dropSends = false;
        chain.expireResends = true;
        clock += 60_000;
        expect((await call('/v1/accounts', { id_token: 'fan' })).body).toMatchObject({ ready: true });
        const transfers = chain.sent.filter((tx) => kind(tx) === 'transfer');
        expect(new Set(transfers.map((tx) => tx.hash)).size).toBe(2);
        expect(transfers.at(-1)!.hash).not.toBe(first.hash);
        expect(chain.accounts.size).toBe(1);
    });

    it('settles funding from chain state instead of signing again when the account already exists', async () => {
        const { call, chain } = setup();
        chain.dropSends = true;
        await call('/v1/accounts', { id_token: 'fan' });
        chain.keyNonce = chain.sent[0].nonce + 1n;
        chain.accounts.add(await accountOf('fan'));
        chain.dropSends = false;
        clock += 10 * 60_000;
        expect((await call('/v1/accounts', { id_token: 'fan' })).body).toMatchObject({ ready: true });
        expect(chain.sent.filter((tx) => kind(tx) === 'transfer')).toHaveLength(1);
    });

    it('keeps no id_token after a failed CKD request and strips it from stale ones', async () => {
        const { call, chain, values, control } = setup();
        chain.failMethod = 'request_key';
        const nonce = await ckdGateNonce(GATE, PK1, PK2);
        expect((await call('/v1/ckd', { gate_account_id: GATE, args: { jwt: `fan|${nonce}`, app_public_key: { pk1: PK1, pk2: PK2 } } })).status).toBe(502);
        expect(JSON.stringify([...values.entries()])).not.toContain(nonce.slice(0, 20) + '"');
        expect([...values.keys()].filter((key) => key.startsWith('tx:ckd:'))).toEqual([]);
        expect(values.has(`ckd-done:${nonce}`)).toBe(true);

        chain.failMethod = '';
        chain.statusUnavailable = true;
        const pk1 = `bls12381g1:${'4'.repeat(66)}`;
        const pending = await ckdGateNonce(GATE, pk1, PK2);
        expect((await call('/v1/ckd', { gate_account_id: GATE, args: { jwt: `fan|${pending}`, app_public_key: { pk1, pk2: PK2 } } })).status).toBe(202);
        expect((values.get(`tx:ckd:${pending}`) as Record<string, unknown>).signedTxBase64).toBeTruthy();
        clock += 11 * 60_000;
        await control.alarm();
        expect((values.get(`tx:ckd:${pending}`) as Record<string, unknown>).signedTxBase64).toBeUndefined();
        chain.statusUnavailable = false;
        await control.alarm();
        expect(values.has(`tx:ckd:${pending}`)).toBe(false);
        expect(values.has(`ckd-done:${pending}`)).toBe(true);
    });

    it('stores no raw subject or id_token outside in-flight CKD transactions', async () => {
        const { call, values } = setup();
        await call('/v1/accounts', { id_token: 'secret-subject-42' });
        expect(JSON.stringify([...values.entries()])).not.toContain('secret-subject');
        expect([...values.keys()]).toContain(`identity:${await identityHash({ iss: ISSUER, sub: 'secret-subject-42' })}`);
    });
});
