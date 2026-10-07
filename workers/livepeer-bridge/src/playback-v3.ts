// Ticket playback for the V2 Market (protocol/youtick-market-v2, "Playback request").
// Pure parsing and decision logic; index.ts wires it to NEAR views, the operator outbox
// (mark_watched) and the Livepeer JWT.

export const PLAYBACK_V3_DOMAIN = 'youtick.market-v2.playback.v1';
const TICKET_ID_PATTERN = /^[0-9a-f]{64}$/;
const SESSION_KEY_PATTERN = /^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/;
const DEVICE_NONCE_PATTERN = /^[0-9a-f]{32}$/;
const DECIMAL_MS_PATTERN = /^[1-9][0-9]{0,19}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9+/]{86}==$/;
const MAX_REQUEST_AHEAD_MS = 5 * 60 * 1000;
const PLAYABLE_STATUSES = new Set(['purchased', 'watched', 'released']);
const PLAYABLE_AVAILABILITY = new Set(['ACTIVE', 'SALES_SUSPENDED']);

export type PlaybackV3Request = {
    network: string;
    contract_id: string;
    ticket_id: string;
    session_public_key: string;
    origin: string;
    device_nonce: string;
    expires_at_ms: string;
};

export type PlaybackV3Input = { request: PlaybackV3Request; signature: string };

export type PlaybackV3Binding = {
    network: string;
    contractId: string;
    origins: Set<string>;
    nowMs: number;
};

/** `watch` means the ticket is still `purchased`: mark_watched must finalize before a token. */
export type PlaybackV3Decision = {
    kind: 'watch' | 'play';
    playbackId: string;
    deviceExpiresAtMs: number;
};

const REQUEST_KEYS: (keyof PlaybackV3Request)[] = [
    'network', 'contract_id', 'ticket_id', 'session_public_key', 'origin', 'device_nonce', 'expires_at_ms',
];

function object(value: unknown, code: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
    return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], code: string): void {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(code);
}

export function parsePlaybackV3Body(value: unknown, binding: PlaybackV3Binding): PlaybackV3Input {
    const code = 'invalid_playback_v3_request';
    const body = object(value, code);
    exactKeys(body, ['request', 'signature'], code);
    const request = object(body.request, code);
    exactKeys(request, REQUEST_KEYS, code);
    for (const key of REQUEST_KEYS) {
        if (typeof request[key] !== 'string') throw new Error(code);
    }
    const typed = request as PlaybackV3Request;
    if (!TICKET_ID_PATTERN.test(typed.ticket_id)
        || !SESSION_KEY_PATTERN.test(typed.session_public_key)
        || !DEVICE_NONCE_PATTERN.test(typed.device_nonce)
        || !DECIMAL_MS_PATTERN.test(typed.expires_at_ms)
        || typeof body.signature !== 'string'
        || !SIGNATURE_PATTERN.test(body.signature)) {
        throw new Error(code);
    }
    if (typed.network !== binding.network || typed.contract_id !== binding.contractId) {
        throw new Error('deployment_binding_mismatch');
    }
    if (!binding.origins.has(typed.origin)) throw new Error('origin_denied');
    const expiresAtMs = Number(typed.expires_at_ms);
    if (expiresAtMs <= binding.nowMs) throw new Error('control_request_expired');
    if (expiresAtMs > binding.nowMs + MAX_REQUEST_AHEAD_MS) throw new Error(code);
    return { request: typed, signature: body.signature };
}

export function canonicalPlaybackV3Message(request: PlaybackV3Request): string {
    return [
        PLAYBACK_V3_DOMAIN,
        request.network,
        request.contract_id,
        request.ticket_id,
        request.session_public_key,
        request.origin,
        request.device_nonce,
        request.expires_at_ms,
    ].join('\n');
}

/**
 * Decides from the final `get_ticket` and `get_publication` views. Denies unknown, refunded or
 * voided tickets, taken-down publications, and devices that are not listed or have expired.
 * Device lists are authoritative only through `get_ticket` (contracts/market-v2/README.md).
 */
export function decideTicketPlayback(
    ticketValue: unknown,
    publicationValue: unknown,
    request: PlaybackV3Request,
    nowMs: number,
): PlaybackV3Decision {
    if (ticketValue === null || publicationValue === null) throw new Error('playback_denied');
    const ticket = object(ticketValue, 'playback_authorization_unavailable');
    const publication = object(publicationValue, 'playback_authorization_unavailable');
    if (ticket.ticket_id !== request.ticket_id
        || typeof ticket.status !== 'string'
        || !PLAYABLE_STATUSES.has(ticket.status)
        || publication.publication_id !== ticket.publication_id
        || typeof publication.availability !== 'string'
        || !PLAYABLE_AVAILABILITY.has(publication.availability)
        || typeof publication.playback_id !== 'string') {
        throw new Error('playback_denied');
    }
    const devices = Array.isArray(ticket.devices) ? ticket.devices : [];
    const device = devices
        .map((entry) => object(entry, 'playback_authorization_unavailable'))
        .find((entry) => entry.session_public_key === request.session_public_key);
    const deviceExpiresAtMs = device && typeof device.expires_at_ms === 'string'
        && DECIMAL_MS_PATTERN.test(device.expires_at_ms)
        ? Number(device.expires_at_ms)
        : 0;
    if (deviceExpiresAtMs <= nowMs) throw new Error('playback_denied');
    return {
        kind: ticket.status === 'purchased' ? 'watch' : 'play',
        playbackId: publication.playback_id,
        deviceExpiresAtMs,
    };
}
