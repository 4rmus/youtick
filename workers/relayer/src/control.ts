// RelayerControl: the single Durable Object that owns the relayer key's nonces, the per-identity
// records, invite codes and the daily spending counters. The front Worker verifies tokens and
// derives accounts; this object only receives verified, minimal inputs (never raw subjects).
import { KeyPairSigner, Signature, actions, baseDecode, baseEncode, createTransaction } from 'near-api-js';
import type { Env } from './env';
import { relayerConfig, type RelayerConfig } from './env';
import { createNearClient, type NearClient, type TxOutcome } from './near';
import { purchaseDelegate, sameBytes, type PurchaseFields } from './purchase';

const CKD_GAS = 150_000_000_000_000n;
const STORAGE_DEPOSIT_GAS = 30_000_000_000_000n;
const FT_TRANSFER_GAS = 30_000_000_000_000n;
/** fast-auth `sign` forwards to the MPC network; the spike used the full 300 TGas and 1 yocto. */
const FAST_AUTH_SIGN_GAS = 300_000_000_000_000n;
const ONE_YOCTO = 1n;
/** Before this, an unconfirmed transaction is simply still in flight. */
const RESEND_AFTER_MS = 30 * 1000;
/** After this, a transaction the chain reports as unknown, with its nonce passed, did not land. */
const LANDING_WINDOW_MS = 3 * 60 * 1000;
/** CKD records hold the id_token inside the signed transaction; it is stripped after this. */
const CKD_RECORD_TTL_MS = 10 * 60 * 1000;
const POLL_DELAYS_MS = [1_000, 2_000, 3_000, 4_000];

type TxState = 'BROADCAST' | 'SUCCESS' | 'FAILED' | 'STUCK';

interface TxRecord {
    state: TxState;
    payloadSha256: string;
    receiverId: string;
    nonce: string;
    blockHash: string;
    /** Removed once the transaction can no longer be resent usefully (CKD: after the TTL). */
    signedTxBase64?: string;
    txHash: string;
    value?: string | null;
    createdAtMs: number;
    broadcastAtMs: number;
}

interface IdentityRecord {
    accountId: string;
    ready: boolean;
    createdAtMs: number;
}

interface InviteRecord {
    amountMicro: string;
    createdAtMs: number;
    expiresAtMs: number;
    state: 'open' | 'reserved' | 'paid';
    identityHash?: string;
    accountId?: string;
}

type Action = ReturnType<typeof actions.transfer>;

/**
 * How a transaction that may not have landed is recovered.
 * - `resign`: signing again is harmless (CKD request: gas only).
 * - `check`: sign again only if `effectDone` shows the effect is missing on chain.
 * - `manual`: never sign again automatically (money transfers without an on-chain check).
 */
interface SubmitPolicy {
    recovery: 'resign' | 'check' | 'manual';
    effectDone?: () => Promise<boolean>;
    /** Allow a new attempt after a final on-chain failure (nothing moved). */
    retryFailed?: boolean;
}

export interface ControlDeps {
    near?: NearClient;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
}

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

export class RelayerControl {
    private lock: Promise<unknown> = Promise.resolve();
    private readonly near: NearClient;
    private readonly now: () => number;
    private readonly sleep: (ms: number) => Promise<void>;

    constructor(private readonly state: DurableObjectState, private readonly env: Env, deps: ControlDeps = {}) {
        this.near = deps.near ?? createNearClient(env.NEAR_RPC_URL ?? '');
        this.now = deps.now ?? (() => Date.now());
        this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    }

    async fetch(request: Request): Promise<Response> {
        const config = relayerConfig(this.env);
        if (!config) return json({ error: 'relayer_not_configured' }, 503);
        const path = new URL(request.url).pathname;
        let body: Record<string, unknown>;
        try {
            body = await request.json() as Record<string, unknown>;
        } catch {
            return json({ error: 'invalid_request' }, 400);
        }
        try {
            switch (path) {
                case '/account': return await this.ensureAccount(config, body);
                case '/ckd': return await this.requestCkd(config, body);
                case '/invite/create': return await this.createInvite(config, body);
                case '/invite/redeem': return await this.redeemInvite(config, body);
                case '/invite/status': return await this.inviteStatus(body);
                case '/purchase': return await this.relayPurchase(config, body);
                default: return json({ error: 'not_found' }, 404);
            }
        } catch (error) {
            const code = error instanceof Error ? error.message : 'internal_error';
            const known: Record<string, number> = {
                daily_limit_reached: 429, identity_limit_reached: 429, identity_conflict: 409, account_required: 409,
                invite_unavailable: 409, invite_already_used: 409, ckd_already_requested: 409, tx_failed: 502,
                tx_needs_review: 503, mutations_disabled: 503, relayer_key_invalid: 503, rpc_unavailable: 503,
                payload_conflict: 409, invalid_request: 400, purchase_already_submitted: 409, mpc_signature_invalid: 502,
            };
            if (known[code]) return json({ error: code }, known[code]);
            console.error(JSON.stringify({ event: 'relayer_internal_error', path }));
            return json({ error: 'internal_error' }, 500);
        }
    }

    /** Strips tokens from CKD and fast-auth sign records that outlived their TTL and drops settled ones. */
    async alarm(): Promise<void> {
        const config = relayerConfig(this.env);
        const records = new Map([
            ...await this.state.storage.list<TxRecord>({ prefix: 'tx:ckd:' }),
            ...await this.state.storage.list<TxRecord>({ prefix: 'tx:sign:' }),
        ]);
        let pending = false;
        for (const [key, record] of records) {
            const finish = key.startsWith('tx:ckd:')
                ? () => this.finishCkd(key.slice('tx:ckd:'.length), record)
                : () => this.finishSign(key.slice('tx:sign:'.length), record);
            if (record.state !== 'BROADCAST') {
                await finish();
                continue;
            }
            if (config) {
                const outcome = await this.near.txStatus(record.txHash, config.accountId);
                if (outcome.kind === 'success' || outcome.kind === 'failed') {
                    await finish();
                    continue;
                }
            }
            if (this.now() - record.createdAtMs > CKD_RECORD_TTL_MS && record.signedTxBase64) {
                const { signedTxBase64: _drop, ...rest } = record;
                await this.state.storage.put(key, rest);
            }
            pending = true;
        }
        if (pending) await this.state.storage.setAlarm(this.now() + CKD_RECORD_TTL_MS);
    }

    // --- Operations -------------------------------------------------------------------------

    /** Opens the implicit account once per identity and registers it with USDC. */
    private async ensureAccount(config: RelayerConfig, body: Record<string, unknown>): Promise<Response> {
        const identity = requireHex64(body.identityHash);
        const accountId = requireHex64(body.accountId);
        const key = `identity:${identity}`;
        const record = await this.state.storage.transaction(async (txn) => {
            const existing = await txn.get<IdentityRecord>(key);
            if (existing) {
                if (existing.accountId !== accountId) throw new Error('identity_conflict');
                return existing;
            }
            await this.consumeDaily(txn, 'accounts', 1n, BigInt(config.dailyAccountLimit));
            const created: IdentityRecord = { accountId, ready: false, createdAtMs: this.now() };
            await txn.put(key, created);
            return created;
        });
        if (record.ready) return json({ accountId, ready: true });

        const exists = () => this.near.accountExists(accountId);
        if (!await exists()) {
            const funded = await this.submit(config, `tx:fund:${identity}`, accountId, `fund|${accountId}|${config.accountFundingYocto}`,
                () => [actions.transfer(BigInt(config.accountFundingYocto))], { recovery: 'check', effectDone: exists, retryFailed: true });
            if (!funded.done) return json({ accountId, ready: false }, 202);
        }
        const registered = async () => (await this.near.view<unknown>(config.usdcContractId, 'storage_balance_of', { account_id: accountId })) !== null;
        if (!await registered()) {
            const bounds = await this.near.view<{ min?: unknown }>(config.usdcContractId, 'storage_balance_bounds', {});
            if (typeof bounds?.min !== 'string' || !/^[1-9][0-9]{0,30}$/.test(bounds.min)
                || BigInt(bounds.min) > BigInt(config.maxStorageDepositYocto)) throw new Error('rpc_unavailable');
            const deposit = BigInt(bounds.min);
            const done = await this.submit(config, `tx:usdc:${identity}`, config.usdcContractId, `usdc|${accountId}|${deposit}`,
                () => [actions.functionCall('storage_deposit', { account_id: accountId, registration_only: true }, STORAGE_DEPOSIT_GAS, deposit)],
                { recovery: 'check', effectDone: registered, retryFailed: true });
            if (!done.done) return json({ accountId, ready: false }, 202);
        }
        await this.state.storage.put(key, { ...record, ready: true });
        return json({ accountId, ready: true });
    }

    /** Submits ckd-gate `request_key` (rule a) and returns the gate's `on_ckd` value. */
    private async requestCkd(config: RelayerConfig, body: Record<string, unknown>): Promise<Response> {
        const identity = requireHex64(body.identityHash);
        const gate = body.gateAccountId;
        const nonce = body.nonce;
        const args = body.args;
        if (typeof gate !== 'string' || !config.ckdGates.includes(gate) || typeof nonce !== 'string'
            || !/^[A-Za-z0-9_-]{43}$/.test(nonce) || !args || typeof args !== 'object') throw new Error('invalid_request');
        const key = `tx:ckd:${nonce}`;
        await this.state.storage.transaction(async (txn) => {
            if (await txn.get(key)) return;
            if (await txn.get(`ckd-done:${nonce}`)) throw new Error('ckd_already_requested');
            const day = this.day();
            const identityKey = `count:${day}:ckd:${identity}`;
            const used = BigInt(await txn.get<string>(identityKey) ?? '0');
            if (used >= BigInt(config.identityDailyCkdLimit)) throw new Error('identity_limit_reached');
            await this.consumeDaily(txn, 'ckd', 1n, BigInt(config.dailyCkdLimit));
            await txn.put(identityKey, String(used + 1n));
        });
        await this.state.storage.setAlarm(this.now() + CKD_RECORD_TTL_MS);
        let result: { done: true; value: string | null } | { done: false };
        try {
            result = await this.submit(config, key, gate, `ckd|${gate}|${JSON.stringify(args)}`,
                () => [actions.functionCall('request_key', args as Record<string, unknown>, CKD_GAS, 0n)], { recovery: 'resign' });
        } catch (error) {
            if (error instanceof Error && error.message === 'tx_failed') await this.finishCkd(nonce);
            throw error;
        }
        if (!result.done) return json({ pending: true }, 202);
        await this.finishCkd(nonce);
        try {
            return json({ result: JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(result.value ?? ''), (char) => char.charCodeAt(0)))) });
        } catch {
            throw new Error('tx_failed');
        }
    }

    /** Replaces a CKD record (which carries the id_token) with a replay marker. */
    private async finishCkd(nonce: string, record?: TxRecord): Promise<void> {
        await this.state.storage.transaction(async (txn) => {
            const current = await txn.get<TxRecord>(`tx:ckd:${nonce}`);
            if (record && current && current.txHash !== record.txHash) return;
            await txn.put(`ckd-done:${nonce}`, { atMs: this.now(), txHash: current?.txHash ?? null });
            await txn.delete(`tx:ckd:${nonce}`);
        });
    }

    /**
     * A NEAR Auth purchase: fast-auth `sign` turns the user's approval token into an MPC signature
     * over the delegate the user approved; the relayer then submits it as a signed delegate. The
     * delegate's own nonce means the purchase can execute at most once, whatever the relayer retries.
     */
    private async relayPurchase(config: RelayerConfig, body: Record<string, unknown>): Promise<Response> {
        const identity = requireHex64(body.identityHash);
        const accountId = requireHex64(body.accountId);
        const userPublicKey = body.userPublicKey;
        const token = body.accessToken;
        const fields = body.fields as PurchaseFields | undefined;
        if (typeof userPublicKey !== 'string' || typeof token !== 'string' || !fields || typeof body.bytes !== 'string') {
            throw new Error('invalid_request');
        }
        const { delegateAction, bytes } = purchaseDelegate({ senderId: accountId, publicKey: userPublicKey, usdcContractId: config.usdcContractId, fields });
        if (!sameBytes(bytes, Uint8Array.from(atob(body.bytes), (char) => char.charCodeAt(0)))) throw new Error('invalid_request');
        const id = await sha256Hex(bytesToBase64(bytes));
        await this.state.storage.transaction(async (txn) => {
            if (await txn.get(`tx:sign:${id}`) || await txn.get(`purchase-sig:${id}`)) return;
            if (await txn.get(`purchase-done:${id}`)) throw new Error('purchase_already_submitted');
            const identityKey = `count:${this.day()}:purchase:${identity}`;
            const used = BigInt(await txn.get<string>(identityKey) ?? '0');
            if (used >= BigInt(config.identityDailyPurchaseLimit)) throw new Error('identity_limit_reached');
            await this.consumeDaily(txn, 'purchases', 1n, BigInt(config.dailyPurchaseLimit));
            await txn.put(identityKey, String(used + 1n));
        });

        let signatureB64 = await this.state.storage.get<string>(`purchase-sig:${id}`);
        if (!signatureB64) {
            await this.state.storage.setAlarm(this.now() + CKD_RECORD_TTL_MS);
            const sign = await this.submit(config, `tx:sign:${id}`, config.provider.fastAuthContractId, `sign|${id}`,
                () => [actions.functionCall('sign', {
                    guard_id: `jwt#${config.provider.issuer}`, verify_payload: token, sign_payload: Array.from(bytes), algorithm: 'eddsa',
                }, FAST_AUTH_SIGN_GAS, ONE_YOCTO)], { recovery: 'resign' });
            if (!sign.done) return json({ pending: true }, 202);
            signatureB64 = bytesToBase64(await this.verifiedMpcSignature(sign.value, bytes, userPublicKey));
            // The signature is public once relayed; the token-bearing sign record is not kept.
            await this.state.storage.put(`purchase-sig:${id}`, signatureB64);
            await this.finishSign(id);
        }
        const signature = Uint8Array.from(atob(signatureB64), (char) => char.charCodeAt(0));
        const done = await this.submit(config, `tx:relay:${id}`, accountId, `relay|${id}`,
            () => [actions.signedDelegate({ delegateAction, signature: new Signature({ keyType: 0, data: signature }) })],
            { recovery: 'resign' });
        const relay = await this.state.storage.get<TxRecord>(`tx:relay:${id}`);
        if (!done.done) return json({ pending: true, txHash: relay?.txHash ?? null }, 202);
        await this.state.storage.put(`purchase-done:${id}`, { atMs: this.now(), txHash: relay?.txHash ?? null });
        // The relay landed; whether the Market accepted or refunded is read from `get_ticket` by the client.
        return json({ submitted: true, txHash: relay?.txHash ?? null });
    }

    private async verifiedMpcSignature(value: string | null, bytes: Uint8Array, userPublicKey: string): Promise<Uint8Array> {
        let signature: Uint8Array;
        try {
            const reply = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value ?? ''), (char) => char.charCodeAt(0)))) as { signature?: unknown };
            if (!Array.isArray(reply.signature) || reply.signature.length !== 64) throw new Error('shape');
            signature = Uint8Array.from(reply.signature as number[]);
        } catch {
            throw new Error('mpc_signature_invalid');
        }
        const raw = baseDecode(userPublicKey.slice('ed25519:'.length));
        const key = await crypto.subtle.importKey('raw', raw as BufferSource, 'Ed25519', false, ['verify']);
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
        if (!await crypto.subtle.verify('Ed25519', key, signature as BufferSource, digest)) throw new Error('mpc_signature_invalid');
        return signature;
    }

    /** The fast-auth sign record carries the approval token; keep only its hash once it is used. */
    private async finishSign(id: string, record?: TxRecord): Promise<void> {
        await this.state.storage.transaction(async (txn) => {
            const current = await txn.get<TxRecord>(`tx:sign:${id}`);
            if (record && current && current.txHash !== record.txHash) return;
            await txn.put(`sign-done:${id}`, { atMs: this.now(), txHash: current?.txHash ?? null });
            await txn.delete(`tx:sign:${id}`);
        });
    }

    private async createInvite(config: RelayerConfig, body: Record<string, unknown>): Promise<Response> {
        const codeHash = requireHex64(body.codeHash);
        const amount = body.amountMicro;
        if (typeof amount !== 'string' || !config.inviteAmountsMicro.includes(amount)) throw new Error('invalid_request');
        const record: InviteRecord = {
            amountMicro: amount, createdAtMs: this.now(), expiresAtMs: this.now() + config.inviteTtlMs, state: 'open',
        };
        await this.state.storage.transaction(async (txn) => {
            if (await txn.get(`invite:${codeHash}`)) throw new Error('invalid_request');
            await txn.put(`invite:${codeHash}`, record);
        });
        return json({ amountMicro: amount, expiresAtMs: record.expiresAtMs }, 201);
    }

    /** One code per identity, one identity per code; pays the credit in USDC from the relayer. */
    private async redeemInvite(config: RelayerConfig, body: Record<string, unknown>): Promise<Response> {
        const codeHash = requireHex64(body.codeHash);
        const identity = requireHex64(body.identityHash);
        const accountId = requireHex64(body.accountId);
        const invite = await this.state.storage.transaction(async (txn) => {
            const account = await txn.get<IdentityRecord>(`identity:${identity}`);
            if (!account?.ready || account.accountId !== accountId) throw new Error('account_required');
            const current = await txn.get<InviteRecord>(`invite:${codeHash}`);
            if (!current) throw new Error('invite_unavailable');
            if (current.state !== 'open') {
                if (current.identityHash === identity) return current;
                throw new Error('invite_unavailable');
            }
            if (current.expiresAtMs <= this.now()) throw new Error('invite_unavailable');
            if (await txn.get(`invite-identity:${identity}`)) throw new Error('invite_already_used');
            await this.consumeDaily(txn, 'invite_usdc_micro', BigInt(current.amountMicro), BigInt(config.dailyInviteUsdcMicroLimit));
            const reserved: InviteRecord = { ...current, state: 'reserved', identityHash: identity, accountId };
            await txn.put(`invite:${codeHash}`, reserved);
            await txn.put(`invite-identity:${identity}`, codeHash);
            return reserved;
        });
        if (invite.state === 'paid') return json({ accountId, amountMicro: invite.amountMicro, paid: true });

        const txKey = `tx:invite:${codeHash}`;
        let result: { done: boolean };
        try {
            // `manual`: a USDC transfer is never signed a second time without a human checking the chain.
            result = await this.submit(config, txKey, config.usdcContractId, `invite|${codeHash}|${accountId}|${invite.amountMicro}`,
                () => [actions.functionCall('ft_transfer', { receiver_id: accountId, amount: invite.amountMicro, memo: 'youtick invite credit' },
                    FT_TRANSFER_GAS, ONE_YOCTO)], { recovery: 'manual' });
        } catch (error) {
            if (error instanceof Error && error.message === 'tx_failed') await this.releaseFailedInvite(codeHash, identity, invite, txKey);
            throw error;
        }
        if (!result.done) return json({ accountId, amountMicro: invite.amountMicro, paid: false }, 202);
        await this.state.storage.transaction(async (txn) => {
            await txn.put(`invite:${codeHash}`, { ...invite, state: 'paid' });
            await txn.put(`invited-account:${accountId}`, { codeHash, paidAtMs: this.now() });
        });
        return json({ accountId, amountMicro: invite.amountMicro, paid: true });
    }

    /** Only a final on-chain failure of this exact transaction gives the code back. */
    private async releaseFailedInvite(codeHash: string, identity: string, invite: InviteRecord, txKey: string): Promise<void> {
        await this.withLock(() => this.state.storage.transaction(async (txn) => {
            const tx = await txn.get<TxRecord>(txKey);
            const current = await txn.get<InviteRecord>(`invite:${codeHash}`);
            if (tx?.state !== 'FAILED' || current?.state !== 'reserved' || current.identityHash !== identity) return;
            await txn.put(`invite:${codeHash}`, { ...invite, state: 'open', identityHash: undefined, accountId: undefined });
            await txn.delete(`invite-identity:${identity}`);
            await txn.delete(txKey);
        }));
    }

    private async inviteStatus(body: Record<string, unknown>): Promise<Response> {
        const accountId = requireHex64(body.accountId);
        return json({ accountId, invited: Boolean(await this.state.storage.get(`invited-account:${accountId}`)) });
    }

    // --- Spending limits --------------------------------------------------------------------

    private day(): string {
        return new Date(this.now()).toISOString().slice(0, 10);
    }

    private async consumeDaily(
        txn: Pick<DurableObjectTransaction, 'get' | 'put'>, counter: string, amount: bigint, limit: bigint,
    ): Promise<void> {
        const key = `count:${this.day()}:${counter}`;
        const used = BigInt(await txn.get<string>(key) ?? '0');
        if (used + amount > limit) throw new Error('daily_limit_reached');
        await txn.put(key, String(used + amount));
    }

    // --- Transaction outbox -----------------------------------------------------------------

    /**
     * Idempotent send keyed by `key`. Nonce reservation, signing and broadcast run under one lock
     * and the signed transaction is stored before it is sent. Afterwards the record changes only on
     * evidence: a final status, a send rejected for an expired block hash, or (per policy) a
     * transaction the chain does not know whose nonce has passed and whose effect is missing.
     */
    private async submit(
        config: RelayerConfig, key: string, receiverId: string, payload: string, build: () => Action[], policy: SubmitPolicy,
    ): Promise<{ done: true; value: string | null } | { done: false }> {
        const payloadSha256 = await sha256Hex(`${receiverId}|${payload}`);
        let record = await this.withLock(async () => {
            const existing = await this.state.storage.get<TxRecord>(key);
            if (existing) {
                if (existing.payloadSha256 !== payloadSha256) throw new Error('payload_conflict');
                if (existing.state !== 'FAILED' || !policy.retryFailed) return existing;
            }
            if (!config.mutationsEnabled) throw new Error('mutations_disabled');
            return this.signAndBroadcast(config, key, receiverId, payloadSha256, build);
        });

        for (let attempt = 0; ; attempt += 1) {
            if (record.state === 'SUCCESS') return { done: true, value: record.value ?? null };
            if (record.state === 'FAILED') throw new Error('tx_failed');
            if (record.state === 'STUCK') throw new Error('tx_needs_review');
            const outcome = await this.near.txStatus(record.txHash, config.accountId);
            record = await this.withLock(() => this.reconcile(config, key, record, outcome, build, policy));
            if (record.state !== 'BROADCAST') continue;
            if (attempt >= POLL_DELAYS_MS.length) return { done: false };
            await this.sleep(POLL_DELAYS_MS[attempt]);
        }
    }

    private async reconcile(
        config: RelayerConfig, key: string, record: TxRecord, outcome: TxOutcome, build: () => Action[], policy: SubmitPolicy,
    ): Promise<TxRecord> {
        const current = await this.state.storage.get<TxRecord>(key);
        if (!current || current.txHash !== record.txHash || current.state !== 'BROADCAST') return current ?? record;
        if (outcome.kind === 'success' || outcome.kind === 'failed') return this.settle(key, current, outcome);
        if (this.now() - current.broadcastAtMs < RESEND_AFTER_MS) return current;

        const accessKey = await this.near.accessKey(config.accountId, config.publicKey);
        if (accessKey.nonce < BigInt(current.nonce)) {
            // Our nonce is unused at final state, so this transaction has not landed yet.
            if (!current.signedTxBase64) return current;
            const resent = await this.near.sendTx(current.signedTxBase64);
            if (resent.kind === 'success' || resent.kind === 'failed') return this.settle(key, current, resent);
            // An expired block hash means it can never land: safe to sign again for every policy.
            if (resent.kind === 'expired') return this.resign(config, key, current, build);
            return current;
        }
        // The nonce has passed. Only "not found" after the landing window counts as not landed.
        if (outcome.kind !== 'not_found' || this.now() - current.broadcastAtMs < LANDING_WINDOW_MS) return current;
        if (policy.recovery === 'resign') return this.resign(config, key, current, build);
        if (policy.recovery === 'check' && policy.effectDone) {
            if (await policy.effectDone()) return this.settle(key, current, { kind: 'success', value: null });
            return this.resign(config, key, current, build);
        }
        console.warn(JSON.stringify({ event: 'relayer_tx_needs_review', kind: key.split(':')[1], txHash: current.txHash }));
        const stuck: TxRecord = { ...current, state: 'STUCK' };
        await this.state.storage.put(key, stuck);
        return stuck;
    }

    private async settle(key: string, current: TxRecord, outcome: { kind: 'success'; value: string | null } | { kind: 'failed' }): Promise<TxRecord> {
        const next: TxRecord = outcome.kind === 'success' ? { ...current, state: 'SUCCESS', value: outcome.value } : { ...current, state: 'FAILED' };
        await this.state.storage.put(key, next);
        return next;
    }

    private async resign(config: RelayerConfig, key: string, current: TxRecord, build: () => Action[]): Promise<TxRecord> {
        if (!config.mutationsEnabled) throw new Error('mutations_disabled');
        console.warn(JSON.stringify({ event: 'relayer_tx_resigned', kind: key.split(':')[1], previous: current.txHash }));
        return this.signAndBroadcast(config, key, current.receiverId, current.payloadSha256, build);
    }

    private async signAndBroadcast(
        config: RelayerConfig, key: string, receiverId: string, payloadSha256: string, build: () => Action[],
    ): Promise<TxRecord> {
        const signer = KeyPairSigner.fromSecretKey(config.privateKey as `ed25519:${string}`);
        const publicKey = await signer.getPublicKey();
        if (publicKey.toString() !== config.publicKey) throw new Error('relayer_key_invalid');
        for (let attempt = 0; ; attempt += 1) {
            const accessKey = await this.near.accessKey(config.accountId, config.publicKey);
            if (!accessKey.fullAccess) throw new Error('relayer_key_invalid');
            const last = BigInt(await this.state.storage.get<string>('relayer:last-nonce') ?? '0');
            const nonce = (last > accessKey.nonce ? last : accessKey.nonce) + 1n;
            await this.state.storage.put('relayer:last-nonce', String(nonce));
            const transaction = createTransaction(config.accountId, publicKey, receiverId, nonce, build(), baseDecode(accessKey.blockHash));
            const signed = await signer.signTransaction(transaction);
            let record: TxRecord = {
                state: 'BROADCAST', payloadSha256, receiverId, nonce: String(nonce), blockHash: accessKey.blockHash,
                signedTxBase64: bytesToBase64(signed.signedTransaction.encode()), txHash: baseEncode(signed.txHash),
                createdAtMs: this.now(), broadcastAtMs: this.now(),
            };
            // Stored before sending: a lost response leads to reconciliation, never a blind second signature.
            await this.state.storage.put(key, record);
            const outcome = await this.near.sendTx(record.signedTxBase64!);
            // A brand-new transaction rejected for its nonce or block hash was never accepted: sign once more.
            if ((outcome.kind === 'invalid_nonce' || outcome.kind === 'expired') && attempt === 0) continue;
            if (outcome.kind === 'success' || outcome.kind === 'failed') record = await this.settle(key, record, outcome);
            return record;
        }
    }

    private withLock<T>(task: () => Promise<T>): Promise<T> {
        const run = this.lock.then(task, task);
        this.lock = run.catch(() => undefined);
        return run;
    }
}

function requireHex64(value: unknown): string {
    if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new Error('invalid_request');
    return value;
}
