import { KeyPair, SignedTransaction, baseEncode, encodeDelegateAction } from 'near-api-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RelayerControl } from './control';
import type { Env } from './env';
import { handle } from './index';
import { ckdGateNonce, identityHash, type VerifiedIdentity } from './jwt';
import type { NearClient, TxOutcome } from './near';

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
/** Buyers with a real key, so the fake fast-auth `sign` can produce a verifiable MPC signature. */
const buyers = new Map<string, KeyPair>();
const buyer = (sub: string) => { if (!buyers.has(sub)) buyers.set(sub, KeyPair.fromRandom('ed25519')); return buyers.get(sub)!; };

function createState() {
    const values = new Map<string, unknown>();
    let tail = Promise.resolve();
    const get = async <T>(key: string) => structuredClone(values.get(key)) as T | undefined;
    const put = async (key: string, value: unknown) => { values.set(key, structuredClone(value)); };
    const del = async (key: string) => values.delete(key);
    const list = async <T>(options?: { prefix?: string }) => new Map(
        [...values.entries()].filter(([key]) => !options?.prefix || key.startsWith(options.prefix)).map(([key, value]) => [key, structuredClone(value) as T]),
    );
    const alarms: number[] = [];
    const storage = {
        get, put, list, delete: del, setAlarm: async (at: number) => { alarms.push(at); },
        transaction: async <T>(callback: (txn: { get: typeof get; put: typeof put; delete: typeof del }) => Promise<T>) => {
            const run = tail.then(() => callback({ get, put, delete: del }));
            tail = run.then(() => undefined, () => undefined);
            return run;
        },
    };
    return { state: { storage } as unknown as DurableObjectState, values, alarms };
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
            throw new Error(`unexpected view ${contractId}.${method}`);
        },
        async accountExists(accountId) { return accounts.has(accountId); },
        async accessKey(accountId) {
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
    const { state, values, alarms } = createState();
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
        }), env, { verify, near });
        return { status: response.status, body: await response.json() as Record<string, unknown> };
    };
    const admin = (path: string, body?: unknown, method = 'POST') => handle(new Request(`https://relayer.test${path}`, {
        method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ADMIN}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), env, { verify, near }).then(async (response) => ({ status: response.status, body: await response.json() as Record<string, unknown> }));
    return { env, chain, values, alarms, control, call, admin, verify };
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
    async function purchase(sub: string, overrides: { amount?: string; receiver?: string; action?: string; nonce?: string; tamper?: boolean; audience?: string } = {}) {
        const msg = JSON.stringify({ action: overrides.action ?? 'buy_ticket_v2', publication_id: 'job-001', ticket_public_key: 'ed25519:x' });
        const fields = { args: { receiver_id: overrides.receiver ?? MARKET, amount: overrides.amount ?? '5000000', msg }, nonce: overrides.nonce ?? '8', max_block_height: '1100' };
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
        expect(await call('/v1/purchases', request.body)).toMatchObject({ status: 200, body: { submitted: true } });
        const sign = chain.sent.find((tx) => (tx.action.functionCall as Record<string, unknown> | undefined)?.methodName === 'sign')!;
        expect(sign.receiverId).toBe('fast-auth.testnet');
        const signArgs = JSON.parse(new TextDecoder().decode(Uint8Array.from((sign.action.functionCall as { args: ArrayLike<number> }).args)));
        expect(signArgs).toMatchObject({ guard_id: `jwt#${ISSUER}`, algorithm: 'eddsa', sign_payload: Array.from(request.bytes) });
        const relay = chain.sent.at(-1)!;
        expect(relay.receiverId).toBe(request.accountId);
        expect(Array.from(encodeDelegateAction(chain.relayed[0].delegateAction as never))).toEqual(Array.from(request.bytes));
        // The approval token does not stay in storage once the signature exists.
        expect([...values.keys()].some((key) => key.startsWith('tx:sign:'))).toBe(false);
        // A retry of the same approval is idempotent: same relay, no new transaction.
        const sentBefore = chain.sent.length;
        const again = await call('/v1/purchases', request.body);
        expect(again).toEqual({ status: 200, body: { submitted: true, txHash: relay.hash } });
        expect(chain.sent).toHaveLength(sentBefore);
    });

    it('sponsors nothing but a buy_ticket_v2 transfer to this Market that matches the approval', async () => {
        const { call, chain } = setup();
        const cases: [Parameters<typeof purchase>[1], number, string][] = [
            [{ receiver: 'other-market.testnet' }, 400, 'invalid_request'],
            [{ action: 'withdraw' }, 400, 'invalid_request'],
            [{ tamper: true }, 400, 'approval_mismatch'],
            [{ audience: 'wrong' }, 401, 'invalid_token'],
            [{ nonce: '7' }, 409, 'delegate_stale'],
            [{ amount: '200000000' }, 409, 'insufficient_balance'],
        ];
        for (const [overrides, status, error] of cases) {
            expect(await call('/v1/purchases', (await purchase('buyer-2', overrides)).body)).toEqual({ status, body: { error } });
        }
        expect(chain.sent).toEqual([]);
        const login = await call('/v1/purchases', { ...(await purchase('buyer-2')).body, access_token_extra: 1 });
        expect(login.status).toBe(400);
    });

    it('refuses an MPC signature that does not verify against the buyer key, and limits purchases per identity', async () => {
        const forged = setup();
        forged.chain.forgeMpc = true;
        expect(await forged.call('/v1/purchases', (await purchase('buyer-3')).body)).toEqual({ status: 502, body: { error: 'mpc_signature_invalid' } });
        expect(forged.chain.relayed).toEqual([]);

        const limited = setup();
        for (const nonce of ['8', '9']) expect((await limited.call('/v1/purchases', (await purchase('buyer-4', { nonce })).body)).status).toBe(200);
        expect(await limited.call('/v1/purchases', (await purchase('buyer-4', { nonce: '10' })).body))
            .toEqual({ status: 429, body: { error: 'identity_limit_reached' } });
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
