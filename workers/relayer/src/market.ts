// Checks a `buy_ticket_v2` message the way Market V2 does (contracts/market-v2 `buy_ticket_v2`),
// before the relayer pays for a fast-auth signature and a relay. The Market refunds a message it
// refuses, so without these checks anyone could spend the relayer's gas and the shared daily
// purchase limit on transfers that can never buy a ticket.
import { baseDecode, baseEncode } from 'near-api-js';
import type { NearClient } from './near';

const TICKET_SIGNATURE_DOMAIN = 'youtick.market-v2.ticket-sig.v1';
const VAT_DOMAIN = 'youtick.market-v2.vat.v1';
/** The contract rejects a signature expiring more than one hour ahead. */
const MAX_SIGNATURE_TTL_MS = 3_600_000;
/** Time for the sign and relay transactions to land before a signature expires on chain. */
const EXPIRY_MARGIN_MS = 60_000;
/** The contract's MIN_TICKET_PRICE_USDC: `split_ticket_amount` panics below it. */
const MIN_TICKET_PRICE_USDC = 5_000_000n;

const DECIMAL = /^(0|[1-9][0-9]{0,38})$/;
const HEX64 = /^[0-9a-f]{64}$/;
const BASE64_SIGNATURE = /^[A-Za-z0-9+/]{86}==$/;

interface PurchaseMessage {
    action: string;
    publication_id: string;
    ticket_public_key: string;
    device: { session_public_key: string; certificate_sha256: string; expires_at_ms: string; signature: string };
    vat: { vat_usdc_micro: string; expires_at_ms: string; key_version: string; signature: string };
}

function exactStrings(value: unknown, keys: string[]): value is Record<string, string> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
        && Object.keys(value as object).sort().join(',') === [...keys].sort().join(',')
        && keys.every((key) => typeof (value as Record<string, unknown>)[key] === 'string');
}

/**
 * Compact JSON as `JSON.stringify` writes it (apps/web does). Re-serializing must give the same
 * text, which also rules out duplicate keys: `JSON.parse` keeps the last one, while the Market's
 * serde rejects the message and the transfer is refunded.
 */
function parseMessage(msg: string): PurchaseMessage {
    let value: unknown;
    try {
        value = JSON.parse(msg);
    } catch {
        throw new Error('purchase_invalid');
    }
    if (JSON.stringify(value) !== msg) throw new Error('purchase_invalid');
    const body = value as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).sort().join(',') !== 'action,device,publication_id,ticket_public_key,vat'
        || body.action !== 'buy_ticket_v2' || typeof body.publication_id !== 'string' || typeof body.ticket_public_key !== 'string'
        || !exactStrings(body.device, ['session_public_key', 'certificate_sha256', 'expires_at_ms', 'signature'])
        || !exactStrings(body.vat, ['vat_usdc_micro', 'expires_at_ms', 'key_version', 'signature'])) {
        throw new Error('purchase_invalid');
    }
    return body as unknown as PurchaseMessage;
}

/** The 32 key bytes of a canonical `ed25519:<base58>` key, as the contract parses it. */
function ed25519Key(value: string, code = 'purchase_invalid'): Uint8Array {
    if (!value.startsWith('ed25519:')) throw new Error(code);
    let raw: Uint8Array;
    try {
        raw = baseDecode(value.slice('ed25519:'.length));
    } catch {
        throw new Error(code);
    }
    if (raw.length !== 32 || baseEncode(raw) !== value.slice('ed25519:'.length)) throw new Error(code);
    return raw;
}

function signedLines(fields: string[], code = 'purchase_invalid'): Uint8Array {
    if (fields.some((field) => !field || /[\r\n]/.test(field))) throw new Error(code);
    return new TextEncoder().encode(fields.join('\n'));
}

async function verifyEd25519(signature: string, message: Uint8Array, key: Uint8Array): Promise<boolean> {
    if (!BASE64_SIGNATURE.test(signature)) return false;
    const bytes = Uint8Array.from(atob(signature), (char) => char.charCodeAt(0));
    // `atob` ignores non-zero trailing bits; the Market's base64 decoder rejects them.
    let canonical = '';
    for (const byte of bytes) canonical += String.fromCharCode(byte);
    if (btoa(canonical) !== signature) return false;
    const imported = await crypto.subtle.importKey('raw', key as BufferSource, 'Ed25519', false, ['verify']);
    return crypto.subtle.verify('Ed25519', imported, bytes as BufferSource, message as BufferSource);
}

function expiry(value: string, nowMs: number, invalid = 'purchase_invalid'): void {
    if (!DECIMAL.test(value)) throw new Error(invalid);
    const expires = Number(value);
    if (!Number.isSafeInteger(expires) || expires <= nowMs + EXPIRY_MARGIN_MS) throw new Error('signature_expired');
    if (expires - nowMs > MAX_SIGNATURE_TTL_MS) throw new Error(invalid);
}

async function sha256Hex(value: string | Uint8Array): Promise<string> {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function networkOf(contractId: string): string {
    if (contractId.endsWith('.testnet')) return 'testnet';
    if (contractId.endsWith('.near')) return 'mainnet';
    throw new Error('invalid_request');
}

/** The earlier of the device and VAT signature expiries of a message `checkPurchaseMessage` accepted. */
export function purchaseExpiresAtMs(msg: string): number {
    const purchase = parseMessage(msg);
    return Math.min(Number(purchase.device.expires_at_ms), Number(purchase.vat.expires_at_ms));
}

/**
 * Throws a client error code unless Market V2 would accept this purchase now: purchases open (not
 * paused, no ended public testnet beta), active publication,
 * amount equal to its price, an unused ticket key, unexpired signatures, a valid device signature
 * by the ticket key and a VAT attestation signed by the Market's key for that version.
 */
export async function checkPurchaseMessage(near: NearClient, input: {
    marketContractId: string; amount: string; msg: string; nowMs: number;
}): Promise<{ publicationId: string; ticketId: string }> {
    const purchase = parseMessage(input.msg);
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(purchase.publication_id) || !HEX64.test(purchase.device.certificate_sha256)
        || !DECIMAL.test(purchase.vat.vat_usdc_micro) || !/^(0|[1-9][0-9]{0,9})$/.test(purchase.vat.key_version)
        || Number(purchase.vat.key_version) > 0xffff_ffff) {
        throw new Error('purchase_invalid');
    }
    const ticketKey = ed25519Key(purchase.ticket_public_key);
    ed25519Key(purchase.device.session_public_key);
    expiry(purchase.device.expires_at_ms, input.nowMs);
    expiry(purchase.vat.expires_at_ms, input.nowMs);
    const ticketId = await sha256Hex(ticketKey);

    const [publication, ticket, vatKey, governance, beta] = await Promise.all([
        near.view<{ publication_id?: unknown; price_usdc?: unknown; availability?: unknown } | null>(
            input.marketContractId, 'get_publication', { publication_id: purchase.publication_id }),
        near.view<unknown>(input.marketContractId, 'get_ticket', { ticket_id: ticketId }),
        near.view<unknown>(input.marketContractId, 'get_vat_public_key', { key_version: Number(purchase.vat.key_version) }),
        near.view<{ new_purchases_paused?: unknown } | null>(input.marketContractId, 'get_governance_state', {}),
        near.view<{ ends_at_ms?: unknown; closed_at_ms?: unknown } | null>(input.marketContractId, 'get_public_testnet_beta_state', {}),
    ]);
    // A beta state that exists but is no longer active refunds every purchase.
    const betaOpen = beta === null || (beta.closed_at_ms === null && typeof beta.ends_at_ms === 'string'
        && /^[0-9]{1,20}$/.test(beta.ends_at_ms) && input.nowMs < Number(beta.ends_at_ms));
    if (governance?.new_purchases_paused !== false || !betaOpen) throw new Error('purchases_paused');
    if (!publication || publication.publication_id !== purchase.publication_id || publication.availability !== 'ACTIVE') {
        throw new Error('publication_unavailable');
    }
    if (publication.price_usdc !== input.amount) throw new Error('price_mismatch');
    if (BigInt(input.amount) < MIN_TICKET_PRICE_USDC) throw new Error('publication_unavailable');
    if (ticket !== null) throw new Error('ticket_exists');
    if (typeof vatKey !== 'string') throw new Error('purchase_invalid');

    const network = networkOf(input.marketContractId);
    const deviceMessage = signedLines([
        TICKET_SIGNATURE_DOMAIN, network, input.marketContractId, 'purchase_device', ticketId, purchase.device.expires_at_ms,
        purchase.publication_id, purchase.device.session_public_key, purchase.device.certificate_sha256,
    ]);
    const vatMessage = signedLines([
        VAT_DOMAIN, network, input.marketContractId, ticketId, purchase.publication_id, input.amount, purchase.vat.vat_usdc_micro,
        purchase.vat.expires_at_ms, purchase.vat.key_version,
    ]);
    if (!await verifyEd25519(purchase.device.signature, deviceMessage, ticketKey)
        || !await verifyEd25519(purchase.vat.signature, vatMessage, ed25519Key(vatKey))) {
        throw new Error('purchase_invalid');
    }
    return { publicationId: purchase.publication_id, ticketId };
}

// --- Uploads through NEAR Auth (roadmap E5b.2) ------------------------------------------------
// Checks a plain `create_paid_job` message the way Market V2's `ft_on_transfer` does, and the
// `replace_upload_key` arguments the way the Market method does, before the relayer pays for a
// fast-auth signature and a relay. Both are refunded or rejected on chain otherwise.

/** `upload_msg` keys in protocol order (protocol/youtick-market-v2, "Upload through NEAR Auth"). */
const UPLOAD_KEYS = 'action,job_id,title,price_usdc,expected_source_bytes,profile_id,profile_config_sha256,upload_public_key,upload_key_expires_at_ms';
const UPLOAD_PROFILE_ID = 'paid-media-livepeer-v1';
const IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;
/** Market V2: PAID_SOURCE_MAX_BYTES, title 1-200 bytes, fee 3/10,000 per byte, at least 0.5 USDC. */
const MAX_SOURCE_BYTES = 20_000_000_000n;
const MAX_TITLE_BYTES = 200;
const UPLOAD_FEE = { numerator: 3n, denominator: 10_000n, minimum: 500_000n };

interface UploadMessage {
    action: string;
    job_id: string;
    title: string;
    price_usdc: string;
    expected_source_bytes: string;
    profile_id: string;
    profile_config_sha256: string;
    upload_public_key: string;
    upload_key_expires_at_ms: string;
}

interface MediaJobView {
    job_id?: unknown;
    creator_id?: unknown;
    profile_id?: unknown;
    profile_config_sha256?: unknown;
    title?: unknown;
    price_usdc?: unknown;
    expected_source_bytes?: unknown;
    status?: unknown;
    fee_asset?: unknown;
    fee_amount?: unknown;
    fee_usd_micro?: unknown;
    upload_public_key?: unknown;
    upload_key_expires_at_ms?: unknown;
    fee_quote_hash?: unknown;
}

function parseUploadMessage(msg: string): UploadMessage {
    let value: unknown;
    try {
        value = JSON.parse(msg);
    } catch {
        throw new Error('upload_invalid');
    }
    // Same text after re-serializing: no duplicate keys, no whitespace, protocol key order.
    if (JSON.stringify(value) !== msg) throw new Error('upload_invalid');
    const body = value as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join(',') !== UPLOAD_KEYS
        || Object.values(body).some((field) => typeof field !== 'string') || body.action !== 'create_paid_job') {
        throw new Error('upload_invalid');
    }
    return body as unknown as UploadMessage;
}

/** The contract's fee formula: `max(ceil(bytes * 3 / 10,000), 500,000)` micro-USDC. */
export function uploadFeeUsdcMicro(sourceBytes: string): string {
    const bytes = BigInt(sourceBytes);
    const fee = (bytes * UPLOAD_FEE.numerator + UPLOAD_FEE.denominator - 1n) / UPLOAD_FEE.denominator;
    return `${fee > UPLOAD_FEE.minimum ? fee : UPLOAD_FEE.minimum}`;
}

function futureMs(value: string, nowMs: number, code: string): number {
    if (!DECIMAL.test(value)) throw new Error('upload_invalid');
    const expires = Number(value);
    if (!Number.isSafeInteger(expires)) throw new Error('upload_invalid');
    if (expires <= nowMs + EXPIRY_MARGIN_MS) throw new Error(code);
    return expires;
}

/** The upload-key expiry of a message `checkUploadMessage` accepted; the Market refunds after it. */
export function uploadExpiresAtMs(msg: string): number {
    return Number(parseUploadMessage(msg).upload_key_expires_at_ms);
}

/**
 * Throws a client error code unless Market V2 would create this paid job now: well-formed fields,
 * the exact fee, purchases not paused, no public beta or public upload policy (those need the
 * quoted V1 path), and no existing job under this id other than this creator's identical one.
 */
export async function checkUploadMessage(near: NearClient, input: {
    marketContractId: string; accountId: string; amount: string; msg: string; nowMs: number;
}): Promise<{ jobId: string }> {
    const upload = parseUploadMessage(input.msg);
    if (!IDENTIFIER.test(upload.job_id) || upload.title.trim() === '' || new TextEncoder().encode(upload.title).length > MAX_TITLE_BYTES
        || /[\p{Cc}]/u.test(upload.title) || !DECIMAL.test(upload.price_usdc) || BigInt(upload.price_usdc) < MIN_TICKET_PRICE_USDC
        || !DECIMAL.test(upload.expected_source_bytes) || BigInt(upload.expected_source_bytes) < 1n
        || BigInt(upload.expected_source_bytes) > MAX_SOURCE_BYTES || upload.profile_id !== UPLOAD_PROFILE_ID
        || !HEX64.test(upload.profile_config_sha256)) {
        throw new Error('upload_invalid');
    }
    ed25519Key(upload.upload_public_key, 'upload_invalid');
    futureMs(upload.upload_key_expires_at_ms, input.nowMs, 'upload_key_expired');
    if (input.amount !== uploadFeeUsdcMicro(upload.expected_source_bytes)) throw new Error('fee_mismatch');

    const [governance, beta, policy, job] = await Promise.all([
        near.view<{ new_purchases_paused?: unknown } | null>(input.marketContractId, 'get_governance_state', {}),
        near.view<unknown>(input.marketContractId, 'get_public_testnet_beta_state', {}),
        near.view<unknown>(input.marketContractId, 'get_public_upload_policy', {}),
        near.view<MediaJobView | null>(input.marketContractId, 'get_media_job', { job_id: upload.job_id }),
    ]);
    if (governance?.new_purchases_paused !== false) throw new Error('uploads_paused');
    // Either mode refunds a message without a sponsor quote; the relayer path carries none.
    if (beta !== null || policy !== null) throw new Error('quote_required');
    if (job !== null) {
        const identical = job.creator_id === input.accountId && job.title === upload.title && job.price_usdc === upload.price_usdc
            && job.expected_source_bytes === upload.expected_source_bytes && job.profile_id === upload.profile_id
            && job.profile_config_sha256 === upload.profile_config_sha256 && job.upload_public_key === upload.upload_public_key
            && job.upload_key_expires_at_ms === upload.upload_key_expires_at_ms && job.fee_asset === 'USDC'
            && job.fee_amount === input.amount && job.fee_usd_micro === input.amount && job.fee_quote_hash === null;
        // An identical job is already authorized (the transfer would only be refunded); anything else panics.
        throw new Error(identical ? 'job_exists' : 'job_conflict');
    }
    return { jobId: upload.job_id };
}

/**
 * Throws a client error code unless Market V2 would replace the upload key now: the job exists,
 * belongs to this creator, is still authorized (not published), the new expiry is in the future
 * and no public upload policy adds a deadline the relayer path does not know.
 */
export async function checkUploadKeyArgs(near: NearClient, input: {
    marketContractId: string; accountId: string; args: { job_id: string; new_public_key: string; expires_at_ms: string }; nowMs: number;
}): Promise<void> {
    ed25519Key(input.args.new_public_key, 'upload_invalid');
    futureMs(input.args.expires_at_ms, input.nowMs, 'upload_key_expired');
    const [job, policy] = await Promise.all([
        near.view<MediaJobView | null>(input.marketContractId, 'get_media_job', { job_id: input.args.job_id }),
        near.view<unknown>(input.marketContractId, 'get_public_upload_policy', {}),
    ]);
    if (job === null) throw new Error('job_not_found');
    if (job.creator_id !== input.accountId) throw new Error('job_conflict');
    if (job.status !== 'Authorized') throw new Error('job_published');
    if (policy !== null) throw new Error('quote_required');
}

// --- Device links (add_device) -----------------------------------------------------------------
// The ticket key signs `add_device`; the contract accepts it from any caller, so the relayer submits
// it from its own account and the viewer needs no NEAR transaction. These checks mirror the Market
// method (contracts/market-v2 `add_device`, `playable_ticket`) so that a call it would reject never
// spends the relayer's gas or the shared limits.

/** `add_device_args` in protocol order (protocol/youtick-market-v2 schema). */
export const ADD_DEVICE_KEYS = ['ticket_id', 'session_public_key', 'certificate_sha256', 'device_epoch', 'expires_at_ms', 'signature'] as const;
export type AddDeviceArgs = Record<(typeof ADD_DEVICE_KEYS)[number], string>;

/** Market V2 `MAX_TICKET_DEVICES`: a fourth device replaces the oldest. */
const MAX_TICKET_DEVICES = 3;
/** A device listed for longer than this needs no transaction; the web renews within this window. */
export const DEVICE_RENEW_WITHIN_MS = 7 * 86_400_000;
/** `add_device` asserts a 25,000-byte storage runway after every call, renewals included; plus room for one device. */
const DEVICE_MIN_RUNWAY_BYTES = 26_000n;
/** The Bridge only plays keys of 43-44 base58 characters (workers/livepeer-bridge `playback-v3.ts`). */
const SESSION_KEY = /^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/;
const U32 = /^(0|[1-9][0-9]{0,9})$/;
const PLAYABLE_STATUSES = new Set(['purchased', 'watched', 'watched_in_escrow', 'released']);

interface TicketView {
    ticket_id?: unknown;
    ticket_public_key?: unknown;
    publication_id?: unknown;
    status?: unknown;
    device_epoch?: unknown;
    devices?: unknown;
}

interface DeviceView {
    session_public_key: string;
    authorized_at_ms: string;
    expires_at_ms: string;
}

/** A canonical `ed25519:<base58 of 32 bytes>` key, of any length the chain may hold. */
export function isCanonicalEd25519(value: string): boolean {
    try {
        ed25519Key(value);
        return true;
    } catch {
        return false;
    }
}

/** The six string arguments in protocol order, nothing else. */
export function parseAddDeviceArgs(value: unknown): AddDeviceArgs {
    if (!exactStrings(value, [...ADD_DEVICE_KEYS])) throw new Error('invalid_request');
    return Object.fromEntries(ADD_DEVICE_KEYS.map((key) => [key, value[key]])) as AddDeviceArgs;
}

/**
 * The record key of one device link. The signature is left out (protocol rule 3: no deduplication by
 * signature bytes), so a second encoding of the same signature cannot start a second transaction.
 */
export function deviceRequestId(args: AddDeviceArgs): Promise<string> {
    return sha256Hex(['device', args.ticket_id, args.session_public_key, args.certificate_sha256, args.device_epoch, args.expires_at_ms].join('|'));
}

/** The devices a ticket view lists, in the contract's order (oldest link or renewal first). */
export function ticketDevices(ticket: unknown): DeviceView[] {
    const devices = (ticket as TicketView | null)?.devices;
    if (!Array.isArray(devices) || !devices.every((device) => device && typeof device === 'object'
        && typeof device.session_public_key === 'string' && typeof device.expires_at_ms === 'string' && DECIMAL.test(device.expires_at_ms)
        && typeof device.authorized_at_ms === 'string' && DECIMAL.test(device.authorized_at_ms))) {
        throw new Error('rpc_unavailable');
    }
    return devices as DeviceView[];
}

/**
 * Throws a client error code unless Market V2 would add or renew this device now: canonical fields,
 * a signature expiring between one minute and one hour from now, a playable ticket whose publication
 * is not taken down, the ticket key's `add_device` signature, the current device epoch and enough
 * storage runway. `listed` means the device is already linked for more than seven days, so no
 * transaction is needed; `renewal` means it is linked but expires within seven days; `evicts` is
 * the device a fourth link would replace.
 */
export async function checkAddDeviceArgs(near: NearClient, input: {
    marketContractId: string; args: AddDeviceArgs; nowMs: number;
}): Promise<{ listed: boolean; renewal: boolean; evicts: string | null }> {
    const { args, nowMs } = input;
    if (!HEX64.test(args.ticket_id) || !HEX64.test(args.certificate_sha256) || !SESSION_KEY.test(args.session_public_key)
        || !U32.test(args.device_epoch) || Number(args.device_epoch) > 0xffff_ffff || !BASE64_SIGNATURE.test(args.signature)) {
        throw new Error('device_invalid');
    }
    ed25519Key(args.session_public_key, 'device_invalid');
    expiry(args.expires_at_ms, nowMs, 'device_invalid');

    const ticket = await near.view<TicketView | null>(input.marketContractId, 'get_ticket', { ticket_id: args.ticket_id });
    if (ticket === null) throw new Error('ticket_not_found');
    if (!ticket || typeof ticket !== 'object' || ticket.ticket_id !== args.ticket_id || typeof ticket.ticket_public_key !== 'string'
        || typeof ticket.publication_id !== 'string' || !Number.isSafeInteger(ticket.device_epoch)) {
        throw new Error('rpc_unavailable');
    }
    const devices = ticketDevices(ticket);
    if (!PLAYABLE_STATUSES.has(ticket.status as string)) throw new Error('ticket_not_playable');
    const ticketKey = ed25519Key(ticket.ticket_public_key, 'device_invalid');
    if (await sha256Hex(ticketKey) !== args.ticket_id) throw new Error('device_invalid');
    const publication = await near.view<{ publication_id?: unknown; availability?: unknown } | null>(
        input.marketContractId, 'get_publication', { publication_id: ticket.publication_id });
    if (!publication || publication.publication_id !== ticket.publication_id || publication.availability === 'TAKEDOWN') {
        throw new Error('publication_unavailable');
    }
    const message = signedLines([
        TICKET_SIGNATURE_DOMAIN, networkOf(input.marketContractId), input.marketContractId, 'add_device', args.ticket_id, args.expires_at_ms,
        args.session_public_key, args.certificate_sha256, args.device_epoch,
    ], 'device_invalid');
    if (!await verifyEd25519(args.signature, message, ticketKey)) throw new Error('device_invalid');

    // Checked before the epoch: a holder retrying a link that already landed (and evicted a device,
    // which moves the epoch) gets "listed", not a request to sign again.
    const active = devices.filter((device) => Number(device.expires_at_ms) > nowMs);
    const own = active.find((device) => device.session_public_key === args.session_public_key);
    if (own && Number(own.expires_at_ms) > nowMs + DEVICE_RENEW_WITHIN_MS) return { listed: true, renewal: false, evicts: null };
    if (Number(args.device_epoch) !== ticket.device_epoch) throw new Error('device_epoch_stale');
    const reserve = await near.view<{ reserve_runway_bytes?: unknown } | null>(input.marketContractId, 'get_storage_reserve_status', {});
    if (typeof reserve?.reserve_runway_bytes !== 'string' || !DECIMAL.test(reserve.reserve_runway_bytes)) throw new Error('rpc_unavailable');
    if (BigInt(reserve.reserve_runway_bytes) < DEVICE_MIN_RUNWAY_BYTES) throw new Error('storage_unavailable');
    // A renewal removes the same key first and never evicts.
    const others = active.filter((device) => device.session_public_key !== args.session_public_key);
    return { listed: false, renewal: Boolean(own), evicts: others.length >= MAX_TICKET_DEVICES ? others[0].session_public_key : null };
}
