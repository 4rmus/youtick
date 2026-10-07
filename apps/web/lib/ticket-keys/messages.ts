// Canonical messages and call arguments for protocol/youtick-market-v2. Each builder checks its
// inputs against the canonical forms the contract and the Bridge accept, then signs the exact
// newline-joined string. Golden vectors: protocol/youtick-market-v2/golden-vectors.json.
import { baseDecode, baseEncode } from 'near-api-js';
import type { TicketKey } from './keys';

export const TICKET_SIGNATURE_DOMAIN = 'youtick.market-v2.ticket-sig.v1';
export const PLAYBACK_DOMAIN = 'youtick.market-v2.playback.v1';
/** The contract rejects a signature whose expiry is more than one hour ahead of block time. */
export const MAX_SIGNATURE_TTL_MS = 3_600_000;
/** The Bridge rejects a playback request expiring more than five minutes ahead. */
export const MAX_PLAYBACK_REQUEST_TTL_MS = 5 * 60 * 1000;

const U32_MAX = 0xffffffffn;
const U64_MAX = 0xffffffffffffffffn;
const U128_MAX = (1n << 128n) - 1n;

export interface MarketBinding {
    network: string;
    contractId: string;
}

type FieldType = 'identifier' | 'account' | 'key' | 'hex' | 'u32' | 'positive_u64' | 'currency';

// Fields signed after `expires_at_ms`, in order, with their canonical type.
export const TICKET_FIELDS = {
    purchase_device: [['publication_id', 'identifier'], ['session_public_key', 'key'], ['certificate_sha256', 'hex']],
    card_purchase: [['publication_id', 'identifier'], ['session_public_key', 'key'], ['certificate_sha256', 'hex'],
        ['payment_reference_hmac', 'hex'], ['gross_minor', 'positive_u64'], ['currency', 'currency']],
    add_device: [['session_public_key', 'key'], ['certificate_sha256', 'hex'], ['device_epoch', 'u32']],
    revoke_device: [['session_public_key', 'key'], ['device_epoch', 'u32']],
    refund_unwatched: [['refund_to', 'account']],
} as const satisfies Record<string, readonly (readonly [string, FieldType])[]>;

export type TicketAction = keyof typeof TICKET_FIELDS;
type FieldsOf<A extends TicketAction> = { [F in (typeof TICKET_FIELDS)[A][number] as F[0]]: string };

function fail(): never {
    throw new Error('invalid_ticket_message');
}

function decimal(value: string, max: bigint): string {
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || BigInt(value) > max) fail();
    return value;
}

function canonicalKey(value: string): string {
    if (typeof value !== 'string' || !value.startsWith('ed25519:')) fail();
    let raw: Uint8Array;
    try {
        raw = baseDecode(value.slice('ed25519:'.length));
    } catch {
        fail();
    }
    if (raw.length !== 32 || `ed25519:${baseEncode(raw)}` !== value) fail();
    return value;
}

function canonicalField(value: string, type: FieldType): string {
    switch (type) {
        case 'u32': return decimal(value, U32_MAX);
        case 'positive_u64': return value === '0' ? fail() : decimal(value, U64_MAX);
        case 'key': return canonicalKey(value);
        case 'hex': return /^[0-9a-f]{64}$/.test(value) ? value : fail();
        case 'currency': return /^[A-Z]{3}$/.test(value) ? value : fail();
        // schema.json `publication_id` and `account_id`; the contract checks them again.
        case 'identifier': return /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : fail();
        case 'account': return /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/.test(value) ? value : fail();
    }
}

function lines(values: string[]): string {
    for (const value of values) {
        if (typeof value !== 'string' || value.length === 0 || /[\n\r]/.test(value)) fail();
    }
    return values.join('\n');
}

function ticketIdField(value: string): string {
    return /^[0-9a-f]{64}$/.test(value) ? value : fail();
}

export function ticketMessage<A extends TicketAction>(
    binding: MarketBinding, action: A, ticketId: string, expiresAtMs: string, fields: FieldsOf<A>,
): string {
    const spec = TICKET_FIELDS[action] as readonly (readonly [string, FieldType])[];
    if (!spec) fail();
    const values = fields as Record<string, string>;
    return lines([TICKET_SIGNATURE_DOMAIN, binding.network, binding.contractId, action, ticketIdField(ticketId),
        decimal(expiresAtMs, U64_MAX), ...spec.map(([name, type]) => canonicalField(values[name], type))]);
}

export interface PlaybackRequest {
    network: string;
    contract_id: string;
    ticket_id: string;
    session_public_key: string;
    origin: string;
    device_nonce: string;
    expires_at_ms: string;
}

export function playbackMessage(request: PlaybackRequest): string {
    if (!/^[0-9a-f]{32}$/.test(request.device_nonce)) fail();
    return lines([PLAYBACK_DOMAIN, request.network, request.contract_id, ticketIdField(request.ticket_id),
        canonicalKey(request.session_public_key), request.origin, request.device_nonce,
        decimal(request.expires_at_ms, U64_MAX)]);
}

/** Room for a client clock running ahead of block time. */
export const CLOCK_SKEW_MARGIN_MS = 5 * 60 * 1000;

/** A signature expiry `ttlMs` after `nowMs`, kept a skew margin below the contract's one-hour limit. */
export function signatureExpiry(nowMs: number, ttlMs = 10 * 60 * 1000): string {
    if (!Number.isSafeInteger(nowMs) || nowMs <= 0 || !Number.isSafeInteger(ttlMs) || ttlMs <= 0) fail();
    return `${nowMs + Math.min(ttlMs, MAX_SIGNATURE_TTL_MS - CLOCK_SKEW_MARGIN_MS)}`;
}

export interface DeviceBinding {
    sessionPublicKey: string;
    certificateSha256: string;
}

export interface VatAttestation {
    vat_usdc_micro: string;
    expires_at_ms: string;
    key_version: string;
    signature: string;
}

/**
 * `ft_transfer_call` arguments for a crypto purchase (`buy_ticket_v2`). The VAT attestation comes
 * from youtick's VAT signer for this ticket, publication and gross amount; the client passes it on.
 */
export function buildPurchaseTransferArgs(input: {
    binding: MarketBinding;
    ticket: TicketKey;
    publicationId: string;
    grossUsdcMicro: string;
    device: DeviceBinding;
    expiresAtMs: string;
    vat: VatAttestation;
}) {
    const { binding, ticket, device, vat } = input;
    if (input.grossUsdcMicro === '0') fail();
    decimal(input.grossUsdcMicro, U128_MAX);
    decimal(vat.vat_usdc_micro, U128_MAX);
    decimal(vat.expires_at_ms, U64_MAX);
    decimal(vat.key_version, U32_MAX);
    const signature = ticket.sign(ticketMessage(binding, 'purchase_device', ticket.ticketId, input.expiresAtMs, {
        publication_id: input.publicationId,
        session_public_key: device.sessionPublicKey,
        certificate_sha256: device.certificateSha256,
    }));
    const msg = {
        action: 'buy_ticket_v2',
        publication_id: input.publicationId,
        ticket_public_key: ticket.publicKey,
        device: {
            session_public_key: device.sessionPublicKey,
            certificate_sha256: device.certificateSha256,
            expires_at_ms: input.expiresAtMs,
            signature,
        },
        vat: {
            vat_usdc_micro: vat.vat_usdc_micro,
            expires_at_ms: vat.expires_at_ms,
            key_version: vat.key_version,
            signature: vat.signature,
        },
    };
    return { receiver_id: binding.contractId, amount: input.grossUsdcMicro, msg: JSON.stringify(msg) };
}

/** The `device` object the payment operator puts into `issue_card_ticket` for a card purchase. */
export function buildCardPurchaseDevice(input: {
    binding: MarketBinding;
    ticket: TicketKey;
    publicationId: string;
    device: DeviceBinding;
    paymentReferenceHmac: string;
    grossMinor: string;
    currency: string;
    expiresAtMs: string;
}) {
    const { binding, ticket, device } = input;
    const signature = ticket.sign(ticketMessage(binding, 'card_purchase', ticket.ticketId, input.expiresAtMs, {
        publication_id: input.publicationId,
        session_public_key: device.sessionPublicKey,
        certificate_sha256: device.certificateSha256,
        payment_reference_hmac: input.paymentReferenceHmac,
        gross_minor: input.grossMinor,
        currency: input.currency,
    }));
    return {
        session_public_key: device.sessionPublicKey,
        certificate_sha256: device.certificateSha256,
        expires_at_ms: input.expiresAtMs,
        signature,
    };
}

export function buildAddDeviceArgs(input: {
    binding: MarketBinding;
    ticket: TicketKey;
    device: DeviceBinding;
    deviceEpoch: string;
    expiresAtMs: string;
}) {
    const { binding, ticket, device } = input;
    const signature = ticket.sign(ticketMessage(binding, 'add_device', ticket.ticketId, input.expiresAtMs, {
        session_public_key: device.sessionPublicKey,
        certificate_sha256: device.certificateSha256,
        device_epoch: input.deviceEpoch,
    }));
    return {
        ticket_id: ticket.ticketId,
        session_public_key: device.sessionPublicKey,
        certificate_sha256: device.certificateSha256,
        device_epoch: input.deviceEpoch,
        expires_at_ms: input.expiresAtMs,
        signature,
    };
}

export function buildRevokeDeviceArgs(input: {
    binding: MarketBinding;
    ticket: TicketKey;
    sessionPublicKey: string;
    deviceEpoch: string;
    expiresAtMs: string;
}) {
    const { binding, ticket } = input;
    const signature = ticket.sign(ticketMessage(binding, 'revoke_device', ticket.ticketId, input.expiresAtMs, {
        session_public_key: input.sessionPublicKey,
        device_epoch: input.deviceEpoch,
    }));
    return {
        ticket_id: ticket.ticketId,
        session_public_key: input.sessionPublicKey,
        device_epoch: input.deviceEpoch,
        expires_at_ms: input.expiresAtMs,
        signature,
    };
}

export function buildRefundArgs(input: {
    binding: MarketBinding;
    ticket: TicketKey;
    refundTo: string;
    expiresAtMs: string;
}) {
    const { binding, ticket } = input;
    const signature = ticket.sign(ticketMessage(binding, 'refund_unwatched', ticket.ticketId, input.expiresAtMs, {
        refund_to: input.refundTo,
    }));
    return { ticket_id: ticket.ticketId, refund_to: input.refundTo, expires_at_ms: input.expiresAtMs, signature };
}

/**
 * The `/v3/playback-tokens` body. The device session key signs it (it is non-extractable in the
 * browser), so the caller passes a signer that returns a standard base64 Ed25519 signature.
 * The Bridge accepts `now < expires_at_ms <= now + 5 min`.
 */
export async function buildPlaybackV3Body(
    request: PlaybackRequest, signWithSessionKey: (message: Uint8Array) => Promise<string>, nowMs: number,
) {
    const message = playbackMessage(request);
    const expiresAtMs = Number(request.expires_at_ms);
    if (request.expires_at_ms === '0' || expiresAtMs <= nowMs || expiresAtMs > nowMs + MAX_PLAYBACK_REQUEST_TTL_MS) fail();
    return { request: { ...request }, signature: await signWithSessionKey(new TextEncoder().encode(message)) };
}

/** A fresh 128-bit lowercase hex nonce for one playback request. */
export function playbackDeviceNonce(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
