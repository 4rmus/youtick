import { KeyPair, SignedTransaction, baseEncode, encodeDelegateAction } from 'near-api-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RelayerControl } from './control';
import type { Env } from './env';
import { handle } from './index';
import { ckdGateNonce, identityHash, type VerifiedIdentity } from './jwt';
import { createNearClient, type NearClient, type TxOutcome } from './near';
import vectors from '../../../protocol/youtick-market-v2/golden-vectors.json';

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

interface TicketDevice { session_public_key: string; certificate_sha256: string; authorized_at_ms: string; expires_at_ms: string }
interface TicketView {
    ticket_id: string; ticket_public_key: string; publication_id: string; status: string; device_epoch: number; devices: TicketDevice[];
}

interface SentTx { hash: string; nonce: bigint; signerId: string; receiverId: string; action: Record<string, unknown> }
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
        mediaJobs: new Map<string, Record<string, unknown>>(),
        uploadPolicy: null as unknown,
        /** Full ticket views (device links); `tickets` above only marks a ticket id as used. */
        ticketViews: new Map<string, TicketView>(),
        storageRunway: '1000000',
        /** Runs when a transaction reaches the chain, after the relayer's pre-checks. */
        beforeSend: () => undefined as void,
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
            if (method === 'get_publication') return (chain.publications.get(String(args.publication_id)) ?? null) as T;
            if (method === 'get_ticket' && chain.ticketViews.has(String(args.ticket_id))) return structuredClone(chain.ticketViews.get(String(args.ticket_id))) as T;
            if (contractId === MARKET && method === 'get_ticket') return (chain.tickets.has(String(args.ticket_id)) ? { ticket_id: args.ticket_id } : null) as T;
            if (method === 'get_storage_reserve_status') return { reserve_runway_bytes: chain.storageRunway, reserve_covered: true } as T;
            if (contractId === MARKET && method === 'get_governance_state') return { new_purchases_paused: chain.purchasesPaused } as T;
            if (contractId === MARKET && method === 'get_public_testnet_beta_state') return chain.beta as T;
            if (contractId === MARKET && method === 'get_vat_public_key') return (args.key_version === 1 ? VAT_KEY.getPublicKey().toString() : null) as T;
            if (contractId === MARKET && method === 'get_media_job') return (chain.mediaJobs.get(String(args.job_id)) ?? null) as T;
            if (contractId === MARKET && method === 'get_public_upload_policy') return chain.uploadPolicy as T;
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
            chain.beforeSend();
            sent.push({ hash, nonce: BigInt(signed.transaction.nonce), signerId: signed.transaction.signerId, receiverId: signed.transaction.receiverId, action });
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
            } else if (call?.methodName === 'add_device') {
                // Market V2 `add_device`: current epoch only; drop expired devices and this key; a fourth evicts the oldest.
                const ticket = chain.ticketViews.get(args.ticket_id);
                if (!ticket || args.device_epoch !== String(ticket.device_epoch)) {
                    outcomes.set(hash, { kind: 'failed' });
                } else {
                    const devices = ticket.devices.filter((device) => Number(device.expires_at_ms) > clock && device.session_public_key !== args.session_public_key);
                    if (devices.length === 3) {
                        devices.shift();
                        ticket.device_epoch += 1;
                    }
                    const device = {
                        session_public_key: args.session_public_key, certificate_sha256: args.certificate_sha256,
                        authorized_at_ms: String(clock), expires_at_ms: String(clock + 30 * DAY),
                    };
                    ticket.devices = [...devices, device];
                    outcomes.set(hash, { kind: 'success', value: btoa(JSON.stringify(device)) });
                }
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
        DAILY_UPLOAD_LIMIT: '4', IDENTITY_DAILY_UPLOAD_LIMIT: '2',
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

describe('NEAR Auth uploads', () => {
    const hex = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
    const accountOfBuyer = (sub: string) => Array.from(buyer(sub).getPublicKey().data, (b) => b.toString(16).padStart(2, '0')).join('');
    const PROFILE_HASH = '96197f502ab9777df0e1c1360803461c3f7e2809495ad575bfe338bc69f5bf77';

    /** A `create_paid_job` message Market V2 would accept, in protocol key order; 2 GB costs 0.6 USDC. */
    function uploadMessage(overrides: Partial<Record<string, string>> = {}) {
        const uploadKey = KeyPair.fromRandom('ed25519').getPublicKey().toString();
        return JSON.stringify({
            action: 'create_paid_job', job_id: 'lp-0f8c2a4e-5b6d-4c7e-8f90-a1b2c3d4e5f6', title: 'Stüdyo kaydı', price_usdc: '5000000',
            expected_source_bytes: '2000000000', profile_id: 'paid-media-livepeer-v1', profile_config_sha256: PROFILE_HASH,
            upload_public_key: uploadKey, upload_key_expires_at_ms: String(clock + DAY), ...overrides,
        });
    }

    async function upload(sub: string, overrides: { amount?: string; receiver?: string; msg?: string; tamper?: boolean } = {}) {
        const fields = {
            args: { receiver_id: overrides.receiver ?? MARKET, amount: overrides.amount ?? '600000', msg: overrides.msg ?? uploadMessage() },
            nonce: '8', max_block_height: '1100',
        };
        const { uploadDelegate } = await import('./upload');
        const accountId = accountOfBuyer(sub);
        const { bytes } = uploadDelegate({ senderId: accountId, publicKey: buyer(sub).getPublicKey().toString(), usdcContractId: USDC, fields });
        const fatxn = Array.from(bytes);
        if (overrides.tamper) fatxn[fatxn.length - 40] ^= 1;
        return { body: { access_token: JSON.stringify({ sub, fatxn }), ...fields }, accountId, bytes, msg: JSON.parse(fields.args.msg) as Record<string, string> };
    }

    async function uploadKey(sub: string, overrides: Partial<{ job_id: string; new_public_key: string; expires_at_ms: string }> = {}) {
        const fields = {
            args: {
                job_id: 'lp-0f8c2a4e-5b6d-4c7e-8f90-a1b2c3d4e5f6', new_public_key: KeyPair.fromRandom('ed25519').getPublicKey().toString(),
                expires_at_ms: String(clock + DAY), ...overrides,
            },
            nonce: '9', max_block_height: '1100',
        };
        const { uploadKeyDelegate } = await import('./upload');
        const accountId = accountOfBuyer(sub);
        const { bytes } = uploadKeyDelegate({ senderId: accountId, publicKey: buyer(sub).getPublicKey().toString(), marketContractId: MARKET, fields });
        return { body: { access_token: JSON.stringify({ sub, fatxn: Array.from(bytes) }), ...fields }, accountId, bytes };
    }

    const authorizedJob = (creatorId: string, msg: Record<string, string>, amount = '600000') => ({
        job_id: msg.job_id, creator_id: creatorId, profile_id: msg.profile_id, profile_config_sha256: msg.profile_config_sha256, title: msg.title,
        price_usdc: msg.price_usdc, expected_source_bytes: msg.expected_source_bytes, generation: 1, status: 'Authorized', created_at_ms: clock,
        published_at_ms: null, fee_asset: 'USDC', fee_amount: amount, fee_usd_micro: amount, upload_public_key: msg.upload_public_key,
        upload_key_expires_at_ms: msg.upload_key_expires_at_ms, fee_quote_hash: null,
    });

    it('signs the upload fee transfer through fast-auth and relays exactly the approved delegate', async () => {
        const { call, chain, values } = setup();
        const request = await upload('buyer-u1');
        const first = await call('/v1/uploads', request.body);
        expect(first).toMatchObject({ status: 200, body: { state: 'submitted', uploadId: await hex(request.bytes) } });
        expect(first.body).not.toHaveProperty('purchaseId');
        const sign = chain.sent.find((tx) => (tx.action.functionCall as Record<string, unknown> | undefined)?.methodName === 'sign')!;
        const signArgs = JSON.parse(new TextDecoder().decode(Uint8Array.from((sign.action.functionCall as { args: ArrayLike<number> }).args)));
        expect(signArgs).toMatchObject({ guard_id: `jwt#${ISSUER}`, algorithm: 'eddsa', sign_payload: Array.from(request.bytes) });
        expect(chain.sent.at(-1)!.receiverId).toBe(request.accountId);
        expect(Array.from(encodeDelegateAction(chain.relayed[0].delegateAction as never))).toEqual(Array.from(request.bytes));
        const relayed = chain.relayed[0].delegateAction as { receiverId: string; actions: { functionCall: { methodName: string; gas: bigint; deposit: bigint } }[] };
        expect(relayed.receiverId).toBe(USDC);
        expect(relayed.actions[0].functionCall).toMatchObject({ methodName: 'ft_transfer_call', gas: 100_000_000_000_000n, deposit: 1n });
        expect(JSON.stringify([...values.values()])).not.toContain('fatxn');
        const sentBefore = chain.sent.length;
        const expected = { status: 200, body: { uploadId: first.body.uploadId, state: 'submitted', txHash: chain.sent.at(-1)!.hash } };
        expect(await call('/v1/uploads', request.body)).toEqual(expected);
        expect(await call('/v1/uploads/status', { upload_id: first.body.uploadId })).toEqual(expected);
        // Upload records are not purchases.
        expect(await call('/v1/purchases/status', { purchase_id: first.body.uploadId })).toEqual({ status: 404, body: { error: 'purchase_not_found' } });
        expect(chain.sent).toHaveLength(sentBefore);
    });

    it('refuses before signing an upload Market V2 would refund or reject', async () => {
        const { call, chain } = setup();
        const creator = accountOfBuyer('buyer-u2');
        const base = await upload('buyer-u2');
        const expired = uploadMessage({ upload_key_expires_at_ms: String(clock + 30_000) });
        const longTitle = uploadMessage({ title: 'ş'.repeat(101) });
        const unordered = JSON.stringify({ job_id: base.msg.job_id, ...base.msg });
        const cases: [Parameters<typeof upload>[1], number, string][] = [
            [{ receiver: 'other-market.testnet' }, 400, 'invalid_request'],
            [{ msg: JSON.stringify({ action: 'buy_ticket_v2', publication_id: 'job-001' }) }, 400, 'invalid_request'],
            [{ tamper: true }, 400, 'approval_mismatch'],
            [{ amount: '500000' }, 409, 'fee_mismatch'],
            [{ msg: expired }, 409, 'upload_key_expired'],
            [{ msg: longTitle }, 400, 'upload_invalid'],
            [{ msg: unordered }, 400, 'upload_invalid'],
        ];
        for (const [overrides, status, error] of cases) {
            expect(await call('/v1/uploads', (await upload('buyer-u2', overrides)).body)).toEqual({ status, body: { error } });
        }
        chain.usdcBalance = '599999';
        expect(await call('/v1/uploads', base.body)).toEqual({ status: 409, body: { error: 'insufficient_balance' } });
        chain.usdcBalance = '100000000';
        chain.purchasesPaused = true;
        expect(await call('/v1/uploads', base.body)).toEqual({ status: 503, body: { error: 'uploads_paused' } });
        chain.purchasesPaused = false;
        chain.beta = { ends_at_ms: String(clock + DAY), closed_at_ms: null };
        expect(await call('/v1/uploads', base.body)).toEqual({ status: 409, body: { error: 'quote_required' } });
        chain.beta = null;
        chain.uploadPolicy = { max_source_bytes: '1' };
        expect(await call('/v1/uploads', base.body)).toEqual({ status: 409, body: { error: 'quote_required' } });
        chain.uploadPolicy = null;
        chain.mediaJobs.set(base.msg.job_id, authorizedJob(creator, base.msg));
        expect(await call('/v1/uploads', base.body)).toEqual({ status: 409, body: { error: 'job_exists' } });
        chain.mediaJobs.set(base.msg.job_id, { ...authorizedJob(creator, base.msg), title: 'other' });
        expect(await call('/v1/uploads', base.body)).toEqual({ status: 409, body: { error: 'job_conflict' } });
        chain.mediaJobs.set(base.msg.job_id, authorizedJob(accountOfBuyer('buyer-u3'), base.msg));
        expect(await call('/v1/uploads', base.body)).toEqual({ status: 409, body: { error: 'job_conflict' } });
        expect(chain.sent).toEqual([]);
    });

    it('limits uploads per identity and per day, apart from purchases', async () => {
        const { call, chain } = setup();
        expect((await call('/v1/uploads', (await upload('buyer-u4', { msg: uploadMessage({ job_id: 'job-a' }) })).body)).status).toBe(200);
        expect((await call('/v1/uploads', (await upload('buyer-u4', { msg: uploadMessage({ job_id: 'job-b' }) })).body)).status).toBe(200);
        expect(await call('/v1/uploads', (await upload('buyer-u4', { msg: uploadMessage({ job_id: 'job-c' }) })).body))
            .toEqual({ status: 429, body: { error: 'identity_limit_reached' } });
        // Purchases have their own counter.
        expect(chain.relayed).toHaveLength(2);
        expect((await call('/v1/uploads', (await upload('buyer-u5', { msg: uploadMessage({ job_id: 'job-d' }) })).body)).status).toBe(200);
        expect((await call('/v1/uploads', (await upload('buyer-u6', { msg: uploadMessage({ job_id: 'job-e' }) })).body)).status).toBe(200);
        expect(await call('/v1/uploads', (await upload('buyer-u7', { msg: uploadMessage({ job_id: 'job-f' }) })).body))
            .toEqual({ status: 429, body: { error: 'daily_limit_reached' } });
    });

    it('relays replace_upload_key for the creator of an authorized job only', async () => {
        const { call, chain } = setup();
        const creator = accountOfBuyer('buyer-u8');
        const request = await uploadKey('buyer-u8');
        expect(await call('/v1/upload-keys', request.body)).toEqual({ status: 404, body: { error: 'job_not_found' } });
        chain.mediaJobs.set(request.body.args.job_id, authorizedJob(accountOfBuyer('buyer-u9'), JSON.parse(uploadMessage()) as Record<string, string>));
        expect(await call('/v1/upload-keys', request.body)).toEqual({ status: 409, body: { error: 'job_conflict' } });
        chain.mediaJobs.set(request.body.args.job_id, { ...authorizedJob(creator, JSON.parse(uploadMessage()) as Record<string, string>), status: 'Published' });
        expect(await call('/v1/upload-keys', request.body)).toEqual({ status: 409, body: { error: 'job_published' } });
        chain.mediaJobs.set(request.body.args.job_id, authorizedJob(creator, JSON.parse(uploadMessage()) as Record<string, string>));
        expect(await call('/v1/upload-keys', (await uploadKey('buyer-u8', { expires_at_ms: String(clock + 1_000) })).body))
            .toEqual({ status: 409, body: { error: 'upload_key_expired' } });
        expect(chain.sent).toEqual([]);
        const first = await call('/v1/upload-keys', request.body);
        expect(first).toMatchObject({ status: 200, body: { state: 'submitted', uploadId: await hex(request.bytes) } });
        expect(Array.from(encodeDelegateAction(chain.relayed[0].delegateAction as never))).toEqual(Array.from(request.bytes));
        const relayed = chain.relayed[0].delegateAction as { receiverId: string; actions: { functionCall: { methodName: string; deposit: bigint } }[] };
        expect(relayed.receiverId).toBe(MARKET);
        expect(relayed.actions[0].functionCall).toMatchObject({ methodName: 'replace_upload_key', deposit: 0n });
        expect(await call('/v1/uploads/status', { upload_id: first.body.uploadId })).toMatchObject({ status: 200, body: { state: 'submitted' } });
        // A key replacement shares the identity's upload counter.
        expect((await call('/v1/uploads', (await upload('buyer-u8', { msg: uploadMessage({ job_id: 'job-g' }) })).body)).status).toBe(200);
        expect(await call('/v1/uploads', (await upload('buyer-u8', { msg: uploadMessage({ job_id: 'job-h' }) })).body))
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

describe('device links', () => {
    const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
    const hex = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)), (b) => b.toString(16).padStart(2, '0')).join('');
    const CERT = 'cd'.repeat(32);
    const day = () => new Date(clock).toISOString().slice(0, 10);
    /** A device key the Bridge would play: 43-44 base58 characters, as apps/web `loadDeviceKey` makes. */
    const sessionKey = (): string => {
        const key = KeyPair.fromRandom('ed25519').getPublicKey().toString();
        return key.length >= 'ed25519:'.length + 43 ? key : sessionKey();
    };
    const device = (session: string, authorizedAtMs: number): TicketDevice => ({
        session_public_key: session, certificate_sha256: CERT, authorized_at_ms: String(authorizedAtMs), expires_at_ms: String(authorizedAtMs + 30 * DAY),
    });
    const deviceSetup = (overrides: Partial<Env> = {}) => setup({ DAILY_DEVICE_LIMIT: '5', TICKET_DAILY_DEVICE_LIMIT: '3', ...overrides });
    const addDevices = (chain: ReturnType<typeof setup>['chain']) =>
        chain.sent.filter((tx) => (tx.action.functionCall as { methodName?: string } | undefined)?.methodName === 'add_device');

    /** A purchased ticket on chain whose purchase device was linked a day ago. */
    async function ticketOnChain(chain: ReturnType<typeof setup>['chain'], overrides: Partial<TicketView> = {}) {
        const ticket = KeyPair.fromRandom('ed25519');
        const ticketId = await hex(ticket.getPublicKey().data);
        const view: TicketView = {
            ticket_id: ticketId, ticket_public_key: ticket.getPublicKey().toString(), publication_id: 'job-001', status: 'purchased',
            device_epoch: 0, devices: [device(sessionKey(), clock - DAY)], ...overrides,
        };
        chain.ticketViews.set(ticketId, view);
        return { ticket, ticketId, view };
    }

    /** `add_device` arguments signed by the ticket key, as apps/web `buildAddDeviceArgs` builds them. */
    function linkArgs(ticket: KeyPair, ticketId: string, overrides: {
        session?: string; epoch?: string; expiresAtMs?: number; action?: string; contract?: string;
    } = {}) {
        const session = overrides.session ?? sessionKey();
        const epoch = overrides.epoch ?? '0';
        const expires = String(overrides.expiresAtMs ?? clock + 10 * 60_000);
        const message = ['youtick.market-v2.ticket-sig.v1', 'testnet', overrides.contract ?? MARKET, overrides.action ?? 'add_device', ticketId, expires,
            session, CERT, epoch].join('\n');
        return {
            ticket_id: ticketId, session_public_key: session, certificate_sha256: CERT, device_epoch: epoch, expires_at_ms: expires,
            signature: b64(ticket.sign(new TextEncoder().encode(message)).signature),
        };
    }

    it('submits one add_device from the relayer account to the Market, with no deposit and fixed gas', async () => {
        const { call, chain, values } = deviceSetup();
        const { ticket, ticketId } = await ticketOnChain(chain);
        const args = linkArgs(ticket, ticketId);
        const linked = await call('/v1/devices', args);
        expect(linked).toMatchObject({ status: 200, body: { state: 'submitted', deviceRequestId: expect.stringMatching(/^[0-9a-f]{64}$/) } });
        expect(linked.body).not.toHaveProperty('evicts_session_public_key');
        expect(chain.sent).toHaveLength(1);
        const [tx] = addDevices(chain);
        expect([tx.signerId, tx.receiverId, linked.body.txHash]).toEqual([RELAYER, MARKET, tx.hash]);
        const functionCall = tx.action.functionCall as { args: ArrayLike<number>; gas: bigint; deposit: bigint };
        expect([String(functionCall.gas), String(functionCall.deposit)]).toEqual(['30000000000000', '0']);
        expect(JSON.parse(new TextDecoder().decode(Uint8Array.from(functionCall.args)))).toEqual(args);
        expect(chain.ticketViews.get(ticketId)!.devices.map((entry) => entry.session_public_key)).toContain(args.session_public_key);
        // The status route reads the record; a repeat finds the device listed. Neither sends or counts again.
        expect(await call('/v1/devices/status', { device_request_id: linked.body.deviceRequestId })).toEqual(linked);
        expect(await call('/v1/devices', args)).toEqual({
            status: 200, body: { deviceRequestId: linked.body.deviceRequestId, state: 'listed', txHash: null },
        });
        expect(chain.sent).toHaveLength(1);
        expect([values.get(`count:${day()}:devices`), values.get(`count:${day()}:device:${ticketId}`)]).toEqual(['1', '1']);
    });

    it('accepts the protocol vectors: a link at epoch 0, the revoked device again at epoch 1 and a renewal', async () => {
        const before = clock;
        try {
            const { fixture } = vectors;
            clock = Number(fixture.issued_at_ms);
            const { call, chain } = deviceSetup({ MARKET_V2_CONTRACT_ID: fixture.contract_id });
            const ticket = vectors.key_derivation.tickets[0];
            const purchaseSession = vectors.purchase.msg.device.session_public_key;
            // The purchase device expires within seven days, so its renewal is sent.
            const view: TicketView = {
                ticket_id: ticket.ticket_id, ticket_public_key: ticket.public_key, publication_id: fixture.publication_id, status: 'watched_in_escrow',
                device_epoch: 0, devices: [device(purchaseSession, clock - 24 * DAY)],
            };
            chain.ticketViews.set(ticket.ticket_id, view);
            expect(await call('/v1/devices', vectors.calls.add_device_args)).toMatchObject({ status: 200, body: { state: 'submitted' } });
            // `revoke_device` (holder-signed, not relayed here) removes the second session and moves the epoch.
            const revoked = vectors.calls.revoke_device_args.session_public_key;
            view.devices = chain.ticketViews.get(ticket.ticket_id)!.devices.filter((entry) => entry.session_public_key !== revoked);
            view.device_epoch = 1;
            chain.ticketViews.set(ticket.ticket_id, view);
            expect(await call('/v1/devices', vectors.calls.add_device_args)).toEqual({ status: 409, body: { error: 'device_epoch_stale' } });
            for (const name of ['link_at_epoch_1', 'renewal'] as const) {
                const linked = await call('/v1/devices', vectors.device_link[name].add_device_args);
                expect(linked).toMatchObject({ status: 200, body: { state: 'submitted' } });
                expect(linked.body).not.toHaveProperty('evicts_session_public_key');
            }
            const after = chain.ticketViews.get(ticket.ticket_id)!;
            expect(after.device_epoch).toBe(1);
            expect(after.devices.map((entry) => [entry.session_public_key, entry.expires_at_ms])).toEqual([
                [revoked, vectors.device_link.link_at_epoch_1.device_added.data[0].expires_at_ms],
                [purchaseSession, vectors.device_link.renewal.device_added.data[0].expires_at_ms],
            ]);
            expect(addDevices(chain)).toHaveLength(3);
        } finally {
            clock = before;
        }
    });

    it('refuses before any transaction what Market V2 would reject', async () => {
        const { call, chain, values } = deviceSetup();
        const { ticket, ticketId } = await ticketOnChain(chain);
        const refunded = await ticketOnChain(chain, { status: 'refunded' });
        const voided = await ticketOnChain(chain, { status: 'voided' });
        chain.publications.set('job-removed', { publication_id: 'job-removed', price_usdc: '5000000', availability: 'TAKEDOWN' });
        const removed = await ticketOnChain(chain, { publication_id: 'job-removed' });
        const unknown = KeyPair.fromRandom('ed25519');
        const valid = linkArgs(ticket, ticketId);
        // The Market's base64 decoder rejects non-zero trailing bits that `atob` ignores.
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        const trailing = `${valid.signature.slice(0, 85)}${alphabet[alphabet.indexOf(valid.signature[85]) ^ 1]}==`;
        // A canonical 32-byte key of 42 base58 characters, which the Bridge would never play.
        let short = '';
        while (short.length !== 'ed25519:'.length + 42) {
            const raw = crypto.getRandomValues(new Uint8Array(32));
            raw.set([0, 0, 0]);
            short = `ed25519:${baseEncode(raw)}`;
        }
        const cases: [Record<string, unknown>, number, string][] = [
            [linkArgs(KeyPair.fromRandom('ed25519'), ticketId), 400, 'device_invalid'],
            [linkArgs(ticket, ticketId, { action: 'revoke_device' }), 400, 'device_invalid'],
            [linkArgs(ticket, ticketId, { contract: 'other-market.testnet' }), 400, 'device_invalid'],
            [linkArgs(ticket, ticketId, { epoch: '1' }), 409, 'device_epoch_stale'],
            [linkArgs(ticket, ticketId, { epoch: '00' }), 400, 'device_invalid'],
            [linkArgs(ticket, ticketId, { expiresAtMs: clock + 30_000 }), 409, 'signature_expired'],
            [linkArgs(ticket, ticketId, { expiresAtMs: clock + 2 * 3_600_000 }), 400, 'device_invalid'],
            [linkArgs(ticket, ticketId, { session: short }), 400, 'device_invalid'],
            [{ ...valid, signature: trailing }, 400, 'device_invalid'],
            [{ ...valid, extra: '1' }, 400, 'invalid_request'],
            [{ ...valid, device_epoch: 0 }, 400, 'invalid_request'],
            [Object.fromEntries(Object.entries(valid).filter(([key]) => key !== 'certificate_sha256')), 400, 'invalid_request'],
            [linkArgs(unknown, await hex(unknown.getPublicKey().data)), 404, 'ticket_not_found'],
            [linkArgs(refunded.ticket, refunded.ticketId), 409, 'ticket_not_playable'],
            [linkArgs(voided.ticket, voided.ticketId), 409, 'ticket_not_playable'],
            [linkArgs(removed.ticket, removed.ticketId), 409, 'publication_unavailable'],
        ];
        for (const [body, status, error] of cases) {
            expect(await call('/v1/devices', body)).toEqual({ status, body: { error } });
        }
        // `add_device` asserts the storage runway even for a renewal.
        chain.storageRunway = '25999';
        expect(await call('/v1/devices', valid)).toEqual({ status: 503, body: { error: 'storage_unavailable' } });
        expect(chain.sent).toEqual([]);
        expect([...values.keys()].filter((key) => key.startsWith('count:') || key.startsWith('device:'))).toEqual([]);
    });

    it('sends nothing for a device linked for more than seven days, and renews one that expires sooner', async () => {
        const { call, chain } = deviceSetup();
        const fresh = sessionKey();
        const expiring = sessionKey();
        const { ticket, ticketId } = await ticketOnChain(chain, { devices: [device(fresh, clock - 20 * DAY), device(expiring, clock - 24 * DAY)] });
        expect(await call('/v1/devices', linkArgs(ticket, ticketId, { session: fresh }))).toMatchObject({ status: 200, body: { state: 'listed' } });
        expect(chain.sent).toEqual([]);
        const renewed = await call('/v1/devices', linkArgs(ticket, ticketId, { session: expiring }));
        expect(renewed).toMatchObject({ status: 200, body: { state: 'submitted' } });
        expect(renewed.body).not.toHaveProperty('evicts_session_public_key');
        // A renewal keeps the device count and the epoch, and moves the device to the end with 30 new days.
        const view = chain.ticketViews.get(ticketId)!;
        expect([view.device_epoch, view.devices.map((entry) => entry.session_public_key)]).toEqual([0, [fresh, expiring]]);
        expect(view.devices[1].expires_at_ms).toBe(String(clock + 30 * DAY));
    });

    it('names the device a fourth link replaces, ignoring expired ones', async () => {
        const { call, chain } = deviceSetup();
        const [oldest, middle, newest, expired] = [sessionKey(), sessionKey(), sessionKey(), sessionKey()];
        const { ticket, ticketId } = await ticketOnChain(chain, {
            devices: [device(expired, clock - 31 * DAY), device(oldest, clock - 3 * DAY), device(middle, clock - 2 * DAY)],
        });
        expect((await call('/v1/devices', linkArgs(ticket, ticketId, { session: newest }))).body).not.toHaveProperty('evicts_session_public_key');
        const fourth = linkArgs(ticket, ticketId);
        expect(await call('/v1/devices', fourth)).toMatchObject({ status: 200, body: { state: 'submitted', evicts_session_public_key: oldest } });
        const view = chain.ticketViews.get(ticketId)!;
        expect([view.device_epoch, view.devices.map((entry) => entry.session_public_key)]).toEqual([1, [middle, newest, fourth.session_public_key]]);
    });

    it('sends one transaction and charges once for concurrent requests of one link', async () => {
        const { call, chain, values } = deviceSetup();
        const { ticket, ticketId } = await ticketOnChain(chain);
        const args = linkArgs(ticket, ticketId);
        const [first, second] = await Promise.all([call('/v1/devices', args), call('/v1/devices', args)]);
        expect(first).toMatchObject({ status: 200, body: { state: 'submitted' } });
        expect(second).toEqual(first);
        expect(addDevices(chain)).toHaveLength(1);
        expect([values.get(`count:${day()}:devices`), values.get(`count:${day()}:device:${ticketId}`)]).toEqual(['1', '1']);
    });

    it('limits device links per ticket and per day', async () => {
        const { call, chain } = deviceSetup({ DAILY_DEVICE_LIMIT: '3', TICKET_DAILY_DEVICE_LIMIT: '2' });
        const first = await ticketOnChain(chain);
        const second = await ticketOnChain(chain);
        const third = await ticketOnChain(chain);
        for (let index = 0; index < 2; index += 1) {
            expect((await call('/v1/devices', linkArgs(first.ticket, first.ticketId))).status).toBe(200);
        }
        expect(await call('/v1/devices', linkArgs(first.ticket, first.ticketId))).toEqual({ status: 429, body: { error: 'ticket_limit_reached' } });
        expect((await call('/v1/devices', linkArgs(second.ticket, second.ticketId))).status).toBe(200);
        expect(await call('/v1/devices', linkArgs(third.ticket, third.ticketId))).toEqual({ status: 429, body: { error: 'daily_limit_reached' } });
        expect(addDevices(chain)).toHaveLength(3);
        clock += DAY;
        expect((await call('/v1/devices', linkArgs(third.ticket, third.ticketId))).status).toBe(200);
    });

    it('answers devices_disabled without the device limits while the other routes keep working', async () => {
        for (const overrides of [{}, { DAILY_DEVICE_LIMIT: '5' }, { DAILY_DEVICE_LIMIT: '5', TICKET_DAILY_DEVICE_LIMIT: '0' }]) {
            const { call, chain } = setup(overrides);
            const { ticket, ticketId } = await ticketOnChain(chain);
            expect(await call('/v1/devices', linkArgs(ticket, ticketId))).toEqual({ status: 503, body: { error: 'devices_disabled' } });
            expect(await call('/v1/devices/status', { device_request_id: 'a'.repeat(64) })).toEqual({ status: 503, body: { error: 'devices_disabled' } });
            expect(await call('/v1/accounts', { id_token: 'fan' })).toMatchObject({ status: 200, body: { ready: true } });
            expect(addDevices(chain)).toEqual([]);
        }
    });

    it('signs nothing while mutations are off, checks origins and reports unknown requests', async () => {
        const { call, chain, values } = deviceSetup({ RELAYER_MUTATIONS_ENABLED: 'false' });
        const { ticket, ticketId } = await ticketOnChain(chain);
        const args = linkArgs(ticket, ticketId);
        expect(await call('/v1/devices', args)).toEqual({ status: 503, body: { error: 'mutations_disabled' } });
        expect(await call('/v1/devices', args, { Origin: 'https://evil.example' })).toEqual({ status: 403, body: { error: 'origin_denied' } });
        expect(await call('/v1/devices/status', { device_request_id: 'a'.repeat(64) })).toEqual({ status: 404, body: { error: 'device_request_not_found' } });
        expect(await call('/v1/devices/status', { device_request_id: 'A'.repeat(64) })).toEqual({ status: 400, body: { error: 'invalid_request' } });
        expect(await call('/v1/devices/status', { device_request_id: 'a'.repeat(64), extra: 1 })).toEqual({ status: 400, body: { error: 'invalid_request' } });
        expect(chain.sent).toEqual([]);
        expect([...values.keys()].filter((key) => key.startsWith('count:') || key.startsWith('device:'))).toEqual([]);
    });

    it('settles a lost broadcast from the ticket instead of signing again, and signs again when the device is missing', async () => {
        const { call, chain } = deviceSetup();
        const { ticket, ticketId, view } = await ticketOnChain(chain);
        chain.dropSends = true;
        const landed = linkArgs(ticket, ticketId);
        const pending = await call('/v1/devices', landed);
        expect(pending).toMatchObject({ status: 202, body: { state: 'pending', txHash: addDevices(chain)[0].hash } });
        // The transaction landed, but the chain no longer knows it: the ticket lists the device since this request.
        view.devices = [...chain.ticketViews.get(ticketId)!.devices, device(landed.session_public_key, clock)];
        chain.ticketViews.set(ticketId, view);
        chain.keyNonce = addDevices(chain)[0].nonce;
        chain.dropSends = false;
        clock += 4 * 60_000;
        expect(await call('/v1/devices/status', { device_request_id: pending.body.deviceRequestId }))
            .toMatchObject({ status: 200, body: { state: 'submitted' } });
        expect(addDevices(chain)).toHaveLength(1);

        chain.dropSends = true;
        const lost = linkArgs(ticket, ticketId);
        const second = await call('/v1/devices', lost);
        expect(second.status).toBe(202);
        const dropped = addDevices(chain)[1];
        chain.keyNonce = dropped.nonce;
        chain.dropSends = false;
        clock += 4 * 60_000;
        expect(await call('/v1/devices/status', { device_request_id: second.body.deviceRequestId }))
            .toMatchObject({ status: 200, body: { state: 'submitted' } });
        expect(addDevices(chain).map((tx) => tx.hash).slice(1)).toEqual([dropped.hash, expect.not.stringMatching(dropped.hash)]);
        expect(chain.ticketViews.get(ticketId)!.devices.filter((entry) => entry.session_public_key === lost.session_public_key)).toHaveLength(1);
    });

    it('names the reason when add_device fails on chain, and never sends that link again', async () => {
        const { call, chain } = deviceSetup();
        const { ticket, ticketId, view } = await ticketOnChain(chain);
        // Another link evicted a device between the pre-check and this transaction.
        chain.beforeSend = () => { chain.ticketViews.get(ticketId)!.device_epoch = 1; };
        expect(await call('/v1/devices', linkArgs(ticket, ticketId))).toEqual({ status: 409, body: { error: 'device_epoch_stale' } });
        chain.beforeSend = () => undefined;
        view.device_epoch = 1;
        chain.ticketViews.set(ticketId, view);

        chain.failMethod = 'add_device';
        const args = linkArgs(ticket, ticketId, { epoch: '1' });
        const failed = await call('/v1/devices', args);
        expect(failed).toEqual({ status: 502, body: { error: 'device_add_failed' } });
        chain.failMethod = '';
        expect(await call('/v1/devices', args)).toEqual(failed);
        expect(addDevices(chain)).toHaveLength(2);
    });

    it('finishes a link from the alarm when the client stops asking, and drops it after a day', async () => {
        const { call, chain, alarm } = deviceSetup();
        const { ticket, ticketId } = await ticketOnChain(chain);
        chain.statusUnavailable = true;
        const pending = await call('/v1/devices', linkArgs(ticket, ticketId));
        expect(pending.status).toBe(202);
        chain.statusUnavailable = false;
        await alarm();
        const status = { device_request_id: pending.body.deviceRequestId };
        expect(await call('/v1/devices/status', status)).toMatchObject({ status: 200, body: { state: 'submitted', txHash: pending.body.txHash } });
        clock += DAY + 60_000;
        await alarm();
        expect(await call('/v1/devices/status', status)).toEqual({ status: 404, body: { error: 'device_request_not_found' } });
        expect(addDevices(chain)).toHaveLength(1);
    });

    it('fails a link whose signature expired before anything was sent', async () => {
        const { call, chain, control, values } = deviceSetup();
        const { ticket, ticketId } = await ticketOnChain(chain);
        const args = linkArgs(ticket, ticketId, { expiresAtMs: clock + 70_000 });
        // The front pre-check passed; the Durable Object sees it 45 seconds later, too close to the expiry to land.
        clock += 45_000;
        const response = await control.fetch(new Request('https://relayer-control/device', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ args, evicts: null }),
        }));
        expect([response.status, await response.json()]).toEqual([409, { error: 'signature_expired' }]);
        expect(addDevices(chain)).toEqual([]);
        expect([...values.values()].some((value) => (value as { state?: string }).state === 'failed')).toBe(true);
    });
});
