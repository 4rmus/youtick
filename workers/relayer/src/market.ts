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
function ed25519Key(value: string): Uint8Array {
    if (!value.startsWith('ed25519:')) throw new Error('purchase_invalid');
    let raw: Uint8Array;
    try {
        raw = baseDecode(value.slice('ed25519:'.length));
    } catch {
        throw new Error('purchase_invalid');
    }
    if (raw.length !== 32 || baseEncode(raw) !== value.slice('ed25519:'.length)) throw new Error('purchase_invalid');
    return raw;
}

function signedLines(fields: string[]): Uint8Array {
    if (fields.some((field) => !field || /[\r\n]/.test(field))) throw new Error('purchase_invalid');
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

function expiry(value: string, nowMs: number): void {
    if (!DECIMAL.test(value)) throw new Error('purchase_invalid');
    const expires = Number(value);
    if (!Number.isSafeInteger(expires) || expires <= nowMs + EXPIRY_MARGIN_MS) throw new Error('signature_expired');
    if (expires - nowMs > MAX_SIGNATURE_TTL_MS) throw new Error('purchase_invalid');
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
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', ticketKey as BufferSource));
    const ticketId = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');

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
