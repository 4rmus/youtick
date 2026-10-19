// RelayerControl: the single Durable Object that owns the relayer key's nonces, the per-identity
// records, invite codes and the daily spending counters. The front Worker verifies tokens and
// derives accounts; this object only receives verified, minimal inputs (never raw subjects).
import { KeyPairSigner, Signature, actions, baseDecode, baseEncode, createTransaction } from 'near-api-js';
import type { Env } from './env';
import { relayerConfig, type RelayerConfig } from './env';
import { createNearClient, type NearClient, type TxOutcome } from './near';
import { checkAddDeviceArgs, deviceRequestId, parseAddDeviceArgs, purchaseExpiresAtMs, ticketDevices, uploadExpiresAtMs, type AddDeviceArgs } from './market';
import { parsePurchaseFields, purchaseDelegate, sameBytes, type PurchaseFields } from './purchase';
import { parseUploadFields, parseUploadKeyFields, uploadDelegate, uploadKeyDelegate, type UploadFields, type UploadKeyFields } from './upload';

const CKD_GAS = 150_000_000_000_000n;
const STORAGE_DEPOSIT_GAS = 30_000_000_000_000n;
const FT_TRANSFER_GAS = 30_000_000_000_000n;
/** fast-auth `sign` forwards to the MPC network; the spike used the full 300 TGas and 1 yocto. */
const FAST_AUTH_SIGN_GAS = 300_000_000_000_000n;
const ONE_YOCTO = 1n;
/** `add_device`, the relayer's one direct Market call. 1 to 2 devices used under 10 TGas in the sandbox; the eviction case is unmeasured. */
const ADD_DEVICE_GAS = 30_000_000_000_000n;
/** A device listed with `authorized_at_ms` this close to the request (block time vs. this clock) counts as its effect. */
const DEVICE_EFFECT_SLACK_MS = 5 * 60 * 1000;
/** Before this, an unconfirmed transaction is simply still in flight. */
const RESEND_AFTER_MS = 30 * 1000;
/** After this, a transaction the chain reports as unknown, with its nonce passed, did not land. */
const LANDING_WINDOW_MS = 3 * 60 * 1000;
/** CKD records hold the id_token inside the signed transaction; it is stripped after this. */
const CKD_RECORD_TTL_MS = 10 * 60 * 1000;
/** A purchase still waiting for its fast-auth signature after this needs a new approval. */
const SIGN_TIMEOUT_MS = 10 * 60 * 1000;
/** A relay must still land before the message's device and VAT signatures expire. */
const RELAY_EXPIRY_MARGIN_MS = 30 * 1000;
/** Finished purchases and device links stay readable on the status route for this long. */
const PURCHASE_RECORD_TTL_MS = 24 * 60 * 60 * 1000;
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

/** What the relayed delegate does; a record without `kind` predates uploads and is a purchase. */
type RelayKind = 'purchase' | 'upload' | 'upload_key';
type RelayFields = PurchaseFields | UploadFields | UploadKeyFields;

/**
 * One NEAR Auth relay (a purchase, an upload fee payment or an upload-key replacement), keyed by
 * the SHA-256 of its delegate bytes. `signing` holds the approval token until fast-auth has
 * signed; `relaying` holds the MPC signature instead. `retryable` marks a failure before anything
 * was relayed, so a new approval of the same bytes may start again.
 */
interface PurchaseRecord {
    state: 'signing' | 'relaying' | 'submitted' | 'failed';
    kind?: RelayKind;
    identityHash: string;
    accountId: string;
    userPublicKey: string;
    fields: RelayFields;
    token?: string;
    signature?: string;
    /** The fast-auth sign transaction of a purchase that expired; its signature may still be on chain. */
    signTxHash?: string;
    txHash?: string | null;
    error?: string;
    retryable?: boolean;
    createdAtMs: number;
    updatedAtMs: number;
}

/**
 * One device link (`add_device` signed by the ticket key), keyed by `deviceRequestId`. The relayer
 * learns no account: only the ticket id and the device's public key and certificate hash.
 */
interface DeviceRecord {
    state: 'submitting' | 'submitted' | 'failed';
    ticketId: string;
    args: AddDeviceArgs;
    /** The device this link replaces, as the pre-check read it. */
    evicts: string | null;
    txHash: string | null;
    error?: string;
    createdAtMs: number;
    updatedAtMs: number;
}

/** What the pre-check reports again after an `add_device` transaction failed on chain. */
const DEVICE_FAILURES = new Set(['device_invalid', 'ticket_not_found', 'ticket_not_playable', 'publication_unavailable',
    'device_epoch_stale', 'signature_expired', 'storage_unavailable']);

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

async function sha256Hex(value: string | Uint8Array): Promise<string> {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
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
                case '/purchase': return await this.relayDelegate(config, body, 'purchase');
                case '/purchase/status': return await this.advancePurchase(config, requireHex64(body.purchaseId), 'purchase');
                case '/upload': return await this.relayDelegate(config, body, 'upload');
                case '/upload-key': return await this.relayDelegate(config, body, 'upload_key');
                case '/upload/status': return await this.advancePurchase(config, requireHex64(body.uploadId), 'upload');
                case '/device': return await this.linkDevice(config, body);
                case '/device/status': return await this.advanceDevice(config, requireHex64(body.deviceRequestId));
                default: return json({ error: 'not_found' }, 404);
            }
        } catch (error) {
            const code = error instanceof Error ? error.message : 'internal_error';
            const known: Record<string, number> = {
                daily_limit_reached: 429, identity_limit_reached: 429, identity_conflict: 409, account_required: 409,
                invite_unavailable: 409, invite_already_used: 409, ckd_already_requested: 409, tx_failed: 502,
                tx_needs_review: 503, mutations_disabled: 503, relayer_key_invalid: 503, rpc_unavailable: 503,
                payload_conflict: 409, invalid_request: 400, purchase_not_found: 404, approval_rejected: 409,
                approval_expired: 409, relay_failed: 502, signature_expired: 409, upload_not_found: 404, upload_key_expired: 409,
                devices_disabled: 503, device_request_not_found: 404, ticket_limit_reached: 429, device_add_failed: 502,
                device_invalid: 400, ticket_not_found: 404, ticket_not_playable: 409, publication_unavailable: 409,
                device_epoch_stale: 409, storage_unavailable: 503,
            };
            if (known[code]) return json({ error: code }, known[code]);
            // The object only reads the relayer's own access key.
            if (code === 'access_key_missing') return json({ error: 'relayer_key_invalid' }, 503);
            console.error(JSON.stringify({ event: 'relayer_internal_error', path }));
            return json({ error: 'internal_error' }, 500);
        }
    }

    /**
     * Strips id_tokens from stale CKD records and drops settled ones, finishes purchases and device
     * links whose client stopped asking, and removes finished records after their TTL.
     */
    async alarm(): Promise<void> {
        const config = relayerConfig(this.env);
        let pending = false;
        for (const [key, record] of await this.state.storage.list<TxRecord>({ prefix: 'tx:ckd:' })) {
            const nonce = key.slice('tx:ckd:'.length);
            if (record.state !== 'BROADCAST') {
                await this.finishCkd(nonce, record);
                continue;
            }
            if (config) {
                const outcome = await this.near.txStatus(record.txHash, config.accountId);
                if (outcome.kind === 'success' || outcome.kind === 'failed') {
                    await this.finishCkd(nonce, record);
                    continue;
                }
            }
            if (this.now() - record.createdAtMs > CKD_RECORD_TTL_MS && record.signedTxBase64) {
                const { signedTxBase64: _drop, ...rest } = record;
                await this.state.storage.put(key, rest);
            }
            pending = true;
        }
        for (const [key, record] of await this.state.storage.list<PurchaseRecord>({ prefix: 'purchase:' })) {
            const id = key.slice('purchase:'.length);
            if (record.state === 'submitted' || record.state === 'failed') {
                if (this.now() - record.updatedAtMs > PURCHASE_RECORD_TTL_MS) {
                    await this.state.storage.delete([key, `tx:relay:${id}`]);
                } else {
                    pending = true;
                }
                continue;
            }
            pending = true;
            if (!config) continue;
            try {
                await this.advancePurchase(config, id);
            } catch {
                // Recorded on the purchase; the status route reports it.
            }
            const current = await this.state.storage.get<PurchaseRecord>(key);
            if (current?.state === 'signing' && this.now() - current.createdAtMs > SIGN_TIMEOUT_MS) {
                // Not retryable: an unconfirmed sign may still have landed, and its signature is public.
                await this.failPurchase(id, 'approval_expired', false).catch(() => undefined);
            }
        }
        for (const [key, record] of await this.state.storage.list<DeviceRecord>({ prefix: 'device:' })) {
            const id = key.slice('device:'.length);
            if (record.state !== 'submitting') {
                if (this.now() - record.updatedAtMs > PURCHASE_RECORD_TTL_MS) {
                    await this.state.storage.delete([key, `tx:device:${id}`]);
                } else {
                    pending = true;
                }
                continue;
            }
            pending = true;
            if (!config) continue;
            try {
                await this.advanceDevice(config, id);
            } catch {
                // Recorded on the device link; the status route reports it.
            }
        }
        if (pending) await this.state.storage.setAlarm(this.now() + CKD_RECORD_TTL_MS);
    }

    /** Keeps the earliest scheduled alarm instead of pushing it back on every request. */
    private async ensureAlarm(): Promise<void> {
        if (await this.state.storage.getAlarm() === null) await this.state.storage.setAlarm(this.now() + CKD_RECORD_TTL_MS);
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
        await this.ensureAlarm();
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

    /** Rebuilds the one delegate a record (or a request of that kind) stands for. */
    private delegateFor(config: RelayerConfig, kind: RelayKind, record: { accountId: string; userPublicKey: string; fields: RelayFields }) {
        const base = { senderId: record.accountId, publicKey: record.userPublicKey };
        if (kind === 'upload') return uploadDelegate({ ...base, usdcContractId: config.usdcContractId, fields: record.fields as UploadFields });
        if (kind === 'upload_key') return uploadKeyDelegate({ ...base, marketContractId: config.marketContractId, fields: record.fields as UploadKeyFields });
        return purchaseDelegate({ ...base, usdcContractId: config.usdcContractId, fields: record.fields as PurchaseFields });
    }

    /** When the chain would refund or reject the relay even with a valid signature. */
    private static expiresAtMs(kind: RelayKind, fields: RelayFields): number {
        if (kind === 'upload') return uploadExpiresAtMs((fields as UploadFields).args.msg);
        if (kind === 'upload_key') return Number((fields as UploadKeyFields).args.expires_at_ms);
        return purchaseExpiresAtMs((fields as PurchaseFields).args.msg);
    }

    private static reply(kind: RelayKind, id: string, state: string, txHash: string | null, status = 200): Response {
        return json(kind === 'purchase' ? { purchaseId: id, state, txHash } : { uploadId: id, state, txHash }, status);
    }

    /**
     * A NEAR Auth relay: fast-auth `sign` turns the user's approval token into an MPC signature
     * over the delegate the user approved; the relayer then submits it as a signed delegate. The
     * delegate's own nonce means it can execute at most once, whatever the relayer retries.
     * The record is written with the limit charge, so one relay is charged once.
     */
    private async relayDelegate(config: RelayerConfig, body: Record<string, unknown>, kind: RelayKind): Promise<Response> {
        const identity = requireHex64(body.identityHash);
        const accountId = requireHex64(body.accountId);
        const userPublicKey = body.userPublicKey;
        const token = body.accessToken;
        if (typeof userPublicKey !== 'string' || typeof token !== 'string' || !body.fields || typeof body.bytes !== 'string') {
            throw new Error('invalid_request');
        }
        const fields: RelayFields = kind === 'upload' ? strip(parseUploadFields(body.fields, config.marketContractId))
            : kind === 'upload_key' ? parseUploadKeyFields(body.fields)
                : strip(parsePurchaseFields(body.fields, config.marketContractId));
        const { bytes } = this.delegateFor(config, kind, { accountId, userPublicKey, fields });
        if (!sameBytes(bytes, Uint8Array.from(atob(body.bytes), (char) => char.charCodeAt(0)))) throw new Error('invalid_request');
        const id = await sha256Hex(bytes);
        const counter = kind === 'purchase' ? 'purchase' : 'upload';
        const dailyLimit = kind === 'purchase' ? config.dailyPurchaseLimit : config.dailyUploadLimit;
        const identityLimit = kind === 'purchase' ? config.identityDailyPurchaseLimit : config.identityDailyUploadLimit;
        await this.state.storage.transaction(async (txn) => {
            const existing = await txn.get<PurchaseRecord>(`purchase:${id}`);
            if (existing?.state === 'signing' && !await txn.get(`tx:sign:${id}`)) {
                // Nothing was sent with the earlier token (e.g. mutations were disabled): use the newer one.
                await txn.put(`purchase:${id}`, { ...existing, token, updatedAtMs: this.now() });
                return;
            }
            if (existing && !(existing.state === 'failed' && existing.retryable)) return;
            const identityKey = `count:${this.day()}:${counter}:${identity}`;
            const used = BigInt(await txn.get<string>(identityKey) ?? '0');
            if (used >= BigInt(identityLimit)) throw new Error('identity_limit_reached');
            await this.consumeDaily(txn, `${counter}s`, 1n, BigInt(dailyLimit));
            await txn.put(identityKey, String(used + 1n));
            const record: PurchaseRecord = {
                state: 'signing', kind, identityHash: identity, accountId, userPublicKey, fields, token,
                createdAtMs: this.now(), updatedAtMs: this.now(),
            };
            await txn.put(`purchase:${id}`, record);
        });
        await this.ensureAlarm();
        return this.advancePurchase(config, id, kind);
    }

    /**
     * Moves a purchase on from its stored record, so the status route and the alarm need no token:
     * sign, verify and keep the MPC signature, relay, record the relay. Each step is idempotent.
     */
    private async advancePurchase(config: RelayerConfig, id: string, expect?: RelayKind): Promise<Response> {
        let record = await this.state.storage.get<PurchaseRecord>(`purchase:${id}`);
        const kind: RelayKind = record?.kind ?? 'purchase';
        // The upload status route reads upload and upload-key records; the purchase route only purchases.
        const family = (value: RelayKind) => (value === 'purchase' ? 'purchase' : 'upload');
        if (!record || (expect && family(expect) !== family(kind))) throw new Error(expect === 'purchase' || !expect ? 'purchase_not_found' : 'upload_not_found');
        if (record.state === 'failed') throw new Error(record.error ?? 'relay_failed');
        if (record.state === 'submitted') return RelayerControl.reply(kind, id, 'submitted', record.txHash ?? null);
        const { delegateAction, bytes } = this.delegateFor(config, kind, record);

        if (record.state === 'signing') {
            const token = record.token ?? '';
            let sign: { done: true; value: string | null } | { done: false };
            try {
                sign = await this.submit(config, `tx:sign:${id}`, config.provider.fastAuthContractId, `sign|${id}`,
                    () => [actions.functionCall('sign', {
                        guard_id: `jwt#${config.provider.issuer}`, verify_payload: token, sign_payload: Array.from(bytes), algorithm: 'eddsa',
                    }, FAST_AUTH_SIGN_GAS, ONE_YOCTO)], { recovery: 'resign' });
            } catch (error) {
                if (error instanceof Error && error.message === 'tx_failed') return this.failPurchase(id, 'approval_rejected', true);
                throw error;
            }
            if (!sign.done) return RelayerControl.reply(kind, id, 'signing', null, 202);
            let signature: Uint8Array;
            try {
                // A guard that rejects the token still lets `sign` succeed, with no signature in the value.
                signature = await this.verifiedMpcSignature(sign.value, bytes, record.userPublicKey);
            } catch {
                return this.failPurchase(id, 'approval_rejected', true);
            }
            // The signature is public once relayed; the token and the token-bearing sign record are not kept.
            record = await this.state.storage.transaction(async (txn) => {
                const current = await txn.get<PurchaseRecord>(`purchase:${id}`);
                if (!current || current.state !== 'signing') return current;
                const { token: _drop, ...rest } = current;
                const next: PurchaseRecord = { ...rest, state: 'relaying', signature: bytesToBase64(signature), updatedAtMs: this.now() };
                await txn.put(`purchase:${id}`, next);
                await txn.delete(`tx:sign:${id}`);
                return next;
            });
            if (!record) throw new Error(kind === 'purchase' ? 'purchase_not_found' : 'upload_not_found');
            if (record.state !== 'relaying') return this.advancePurchase(config, id, expect);
        }

        const signature = Uint8Array.from(atob(record.signature ?? ''), (char) => char.charCodeAt(0));
        // A relay first sent after a signature expired would only be refunded.
        if (!await this.state.storage.get(`tx:relay:${id}`)
            && RelayerControl.expiresAtMs(kind, record.fields) <= this.now() + RELAY_EXPIRY_MARGIN_MS) {
            return this.failPurchase(id, 'signature_expired', false);
        }
        let done: { done: boolean };
        try {
            done = await this.submit(config, `tx:relay:${id}`, record.accountId, `relay|${id}`,
                () => [actions.signedDelegate({ delegateAction, signature: new Signature({ keyType: 0, data: signature }) })],
                { recovery: 'resign' });
        } catch (error) {
            // A final failure of the relay transaction itself: the delegate expired or its nonce was used.
            if (error instanceof Error && error.message === 'tx_failed') return this.failPurchase(id, 'relay_failed', false);
            throw error;
        }
        const relay = await this.state.storage.get<TxRecord>(`tx:relay:${id}`);
        if (!done.done) return RelayerControl.reply(kind, id, 'relaying', relay?.txHash ?? null, 202);
        await this.state.storage.transaction(async (txn) => {
            const current = await txn.get<PurchaseRecord>(`purchase:${id}`);
            if (current?.state !== 'relaying') return;
            await txn.put(`purchase:${id}`, { ...current, state: 'submitted', txHash: relay?.txHash ?? null, updatedAtMs: this.now() });
        });
        // The relay landed; whether the Market accepted or refunded is read by the client (`get_ticket`, `get_media_job`).
        return RelayerControl.reply(kind, id, 'submitted', relay?.txHash ?? null);
    }

    /** Ends a purchase that is not done yet, keeping neither its token nor its sign record. */
    private async failPurchase(id: string, error: string, retryable: boolean): Promise<Response> {
        await this.state.storage.transaction(async (txn) => {
            const current = await txn.get<PurchaseRecord>(`purchase:${id}`);
            if (!current || current.state === 'submitted' || current.state === 'failed') return;
            const { token: _drop, ...rest } = current;
            const sign = await txn.get<TxRecord>(`tx:sign:${id}`);
            await txn.put(`purchase:${id}`, {
                ...rest, state: 'failed', error, retryable, updatedAtMs: this.now(), ...(sign ? { signTxHash: sign.txHash } : {}),
            });
            await txn.delete(`tx:sign:${id}`);
        });
        const current = await this.state.storage.get<PurchaseRecord>(`purchase:${id}`);
        // Another request may have finished it meanwhile.
        if (current?.state === 'submitted') return RelayerControl.reply(current.kind ?? 'purchase', id, 'submitted', current.txHash ?? null);
        throw new Error(current?.error ?? error);
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

    // --- Device links ------------------------------------------------------------------------

    /**
     * Records a device link the front Worker pre-checked and charges the daily and per-ticket
     * limits in the same storage transaction, so a repeated or concurrent request of the same link
     * is charged once and submits one transaction.
     */
    private async linkDevice(config: RelayerConfig, body: Record<string, unknown>): Promise<Response> {
        const limits = config.devices;
        if (!limits) throw new Error('devices_disabled');
        const args = parseAddDeviceArgs(body.args);
        const evicts = body.evicts;
        if (evicts !== null && (typeof evicts !== 'string' || !/^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(evicts))) {
            throw new Error('invalid_request');
        }
        if (!config.mutationsEnabled) throw new Error('mutations_disabled');
        const id = await deviceRequestId(args);
        await this.state.storage.transaction(async (txn) => {
            if (await txn.get(`device:${id}`)) return;
            const ticketKey = `count:${this.day()}:device:${args.ticket_id}`;
            const used = BigInt(await txn.get<string>(ticketKey) ?? '0');
            if (used >= BigInt(limits.ticketDailyLimit)) throw new Error('ticket_limit_reached');
            await this.consumeDaily(txn, 'devices', 1n, BigInt(limits.dailyLimit));
            await txn.put(ticketKey, String(used + 1n));
            const record: DeviceRecord = {
                state: 'submitting', ticketId: args.ticket_id, args, evicts, txHash: null, createdAtMs: this.now(), updatedAtMs: this.now(),
            };
            await txn.put(`device:${id}`, record);
        });
        await this.ensureAlarm();
        return this.advanceDevice(config, id);
    }

    /**
     * Sends `add_device` from the relayer account through the outbox, or reads the result. Recovery
     * `check`: a transaction the chain does not know is signed again only while the ticket does not
     * list the device as linked since this request.
     */
    private async advanceDevice(config: RelayerConfig, id: string): Promise<Response> {
        if (!config.devices) throw new Error('devices_disabled');
        const record = await this.state.storage.get<DeviceRecord>(`device:${id}`);
        if (!record) throw new Error('device_request_not_found');
        if (record.state === 'failed') throw new Error(record.error ?? 'device_add_failed');
        if (record.state === 'submitted') return RelayerControl.deviceReply(id, record);
        const txKey = `tx:device:${id}`;
        // A first send after the signature expired would only fail on chain.
        if (!await this.state.storage.get(txKey) && Number(record.args.expires_at_ms) <= this.now() + RELAY_EXPIRY_MARGIN_MS) {
            return this.failDevice(id, 'signature_expired');
        }
        const effectDone = async () => {
            const ticket = await this.near.view<unknown>(config.marketContractId, 'get_ticket', { ticket_id: record.ticketId });
            return ticket !== null && ticketDevices(ticket).some((device) => device.session_public_key === record.args.session_public_key
                && Number(device.authorized_at_ms) >= record.createdAtMs - DEVICE_EFFECT_SLACK_MS);
        };
        let done: { done: boolean };
        try {
            done = await this.submit(config, txKey, config.marketContractId, `device|${id}|${JSON.stringify(record.args)}`,
                () => [addDeviceAction(record.args)], { recovery: 'check', effectDone });
        } catch (error) {
            // The chain gives no reason; the pre-check, run again, usually names it (a moved epoch, a refund).
            if (error instanceof Error && error.message === 'tx_failed') return this.failDevice(id, await this.deviceFailure(config, record));
            throw error;
        }
        const tx = await this.state.storage.get<TxRecord>(txKey);
        if (!done.done) return json({ deviceRequestId: id, state: 'pending', txHash: tx?.txHash ?? null }, 202);
        const submitted = await this.state.storage.transaction(async (txn) => {
            const current = await txn.get<DeviceRecord>(`device:${id}`);
            if (current?.state !== 'submitting') return current;
            const next: DeviceRecord = { ...current, state: 'submitted', txHash: tx?.txHash ?? null, updatedAtMs: this.now() };
            await txn.put(`device:${id}`, next);
            return next;
        });
        if (submitted?.state === 'failed') throw new Error(submitted.error ?? 'device_add_failed');
        return RelayerControl.deviceReply(id, submitted ?? record);
    }

    private static deviceReply(id: string, record: DeviceRecord): Response {
        return json({
            deviceRequestId: id, state: 'submitted', txHash: record.txHash,
            ...(record.evicts ? { evicts_session_public_key: record.evicts } : {}),
        });
    }

    private async deviceFailure(config: RelayerConfig, record: DeviceRecord): Promise<string> {
        try {
            await checkAddDeviceArgs(this.near, { marketContractId: config.marketContractId, args: record.args, nowMs: this.now() });
        } catch (error) {
            if (error instanceof Error && DEVICE_FAILURES.has(error.message)) return error.message;
        }
        return 'device_add_failed';
    }

    private async failDevice(id: string, error: string): Promise<Response> {
        const current = await this.state.storage.transaction(async (txn) => {
            const record = await txn.get<DeviceRecord>(`device:${id}`);
            if (!record || record.state !== 'submitting') return record;
            const failed: DeviceRecord = { ...record, state: 'failed', error, updatedAtMs: this.now() };
            await txn.put(`device:${id}`, failed);
            return failed;
        });
        // Another request may have finished it meanwhile.
        if (current?.state === 'submitted') return RelayerControl.deviceReply(id, current);
        throw new Error(current?.error ?? error);
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

/** The only Market call the relayer signs itself: `add_device` with no deposit. */
function addDeviceAction(args: AddDeviceArgs): Action {
    return actions.functionCall('add_device', { ...args }, ADD_DEVICE_GAS, 0n);
}

/** Drops the parse helpers' extra lookup fields so the stored record holds the relayed fields only. */
function strip<T extends { args: unknown; nonce: string; max_block_height: string }>(fields: T): { args: T['args']; nonce: string; max_block_height: string } {
    return { args: fields.args, nonce: fields.nonce, max_block_height: fields.max_block_height };
}

function requireHex64(value: unknown): string {
    if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new Error('invalid_request');
    return value;
}
