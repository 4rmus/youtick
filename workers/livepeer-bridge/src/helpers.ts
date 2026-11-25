import type { Env } from './env';
import type { JsonObject } from './types';
import { MAX_CONTROL_BODY_BYTES, SPONSORED_RELAY_REJECTION_CODES } from './constants';

type SponsoredRelayRejectionReason = keyof typeof SPONSORED_RELAY_REJECTION_CODES;
const DEFAULT_ALLOWED_ORIGINS = 'https://youtick.net,https://www.youtick.net';
const SAFE_ERROR_CODES = new Set([
    'invalid_creator_pending_upload',
    'creator_pending_upload_record_failed',
    'control_body_too_large',
    'control_request_expired',
    'creator_fee_quote_rate_limited',
    'admission_closed',
    'admission_denied',
    'admission_reopen_conflict',
    'admission_reopen_denied',
    'device_key_not_authorized',
    'device_nonce_replayed',
    'deployment_binding_mismatch',
    'durable_object_record_limit',
    'invalid_control_envelope',
    'invalid_control_request',
    'invalid_creator_fee_quote_request',
    'invalid_json',
    'invalid_finalize_request',
    'invalid_admission_reopen',
    'invalid_outbox',
    'invalid_playback_request',
    'invalid_playback_v2_request',
    'invalid_playback_v3_request',
    'playback_pending',
    'invalid_sponsored_upload_quote_request',
    'invalid_sponsored_upload_relay',
    'invalid_upload_preflight',
    'invalid_upload_intent',
    'invalid_webhook',
    'invalid_webhook_signature',
    'near_finalize_failed',
    'near_finalize_mismatch',
    'near_finalize_pending',
    'near_job_not_found',
    'near_job_query_failed',
    'near_job_response_invalid',
    'on_chain_job_mismatch',
    'origin_denied',
    'operator_unauthorized',
    'operator_mutations_disabled',
    'operator_archive_conflict',
    'operator_archive_eligible_count_invalid',
    'operator_archive_scan_active',
    'operator_archive_unavailable',
    'outbox_conflict',
    'provider_identity_mismatch',
    'provider_asset_missing',
    'provider_admission_closed',
    'provider_playback_missing',
    'provider_playback_exposed',
    'provider_playback_mismatch',
    'publication_cover_image_denied',
    'provider_verification_incomplete',
    'provider_verification_budget_exceeded',
    'verification_evidence_missing',
    'publication_cover_image_redirected',
    'publication_cover_image_status',
    'publication_cover_image_type',
    'publication_cover_image_size',
    'publication_cover_image_invalid',
    'provider_state_invalid',
    'provider_tus_state_invalid',
    'provider_tus_url_expired',
    'provider_unavailable',
    'provider_mutations_disabled',
    'rate_source_invalid',
    'rate_limited',
    'rate_source_stale',
    'rate_source_unavailable',
    'playback_authorization_unavailable',
    'playback_denied',
    'protocol_binding_mismatch',
    'provider_create_ambiguous',
    'provider_create_pending',
    'provider_recovery_not_ready',
    'provider_delete_ambiguous',
    'reservation_conflict',
    'runtime_not_configured',
    'sponsor_balance_insufficient',
    'sponsor_job_conflict',
    'sponsor_relay_conflict',
    'sponsor_relay_failed',
    'sponsor_relay_mutations_disabled',
    'sponsor_relay_pending',
    'upload_archive_conflict',
    'upload_archive_unavailable',
    'upload_cancel_denied',
    'webhook_expired',
    'webhook_queue_unavailable',
]);

export function sanitizeForLog(value: unknown, key = ''): unknown {
    if (isSensitiveLogKey(key)) return '[REDACTED]';
    if (typeof value === 'string'
        && /^https?:\/\//i.test(value)
        && /(?:tus|upload)/i.test(value)) return '[REDACTED]';
    if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item));
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([childKey, child]) => [
                childKey,
                sanitizeForLog(child, childKey),
            ]),
        );
    }
    return value;
}

function isSensitiveLogKey(key: string): boolean {
    const normalized = key.toLowerCase();
    return normalized.includes('authorization')
        || normalized.includes('secret')
        || normalized.includes('token')
        || normalized.includes('tus')
        || (normalized.includes('upload') && normalized.includes('url'))
        || (normalized.includes('signed') && normalized.includes('transaction'))
        || (normalized.includes('private') && normalized.includes('key'));
}

export function formatLog(event: string, details: JsonObject): string {
    return JSON.stringify({ event, details: sanitizeForLog(details) });
}

export function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
    return difference === 0;
}

export async function readJsonObject(request: Request): Promise<JsonObject> {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_CONTROL_BODY_BYTES) throw new Error('control_body_too_large');
    let value: unknown;
    try {
        value = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        throw new Error('invalid_json');
    }
    return requireObject(value, 'invalid_json');
}

export function requireObject(value: unknown, code: string): JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
    return value as JsonObject;
}

export function requireExactKeys(value: JsonObject, expected: string[], code: string): void {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
        throw new Error(code);
    }
}

export function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value as JsonObject).sort().map((key) => (
            `${JSON.stringify(key)}:${canonicalJson((value as JsonObject)[key])}`
        )).join(',')}}`;
    }
    return JSON.stringify(value);
}

export async function sha256Hex(value: string): Promise<string> {
    return sha256BytesHex(new TextEncoder().encode(value));
}

export async function sha256BytesHex(value: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', value);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function allowedOrigins(env: Env): Set<string> {
    return new Set((env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS)
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean));
}

export function isHttpsOrigin(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.origin === value;
    } catch {
        return false;
    }
}

export function isAllowedControlOrigin(value: string): boolean {
    if (isHttpsOrigin(value)) return true;
    try {
        const url = new URL(value);
        return url.protocol === 'http:' && url.hostname === 'localhost' && url.origin === value;
    } catch {
        return false;
    }
}

export function isHttpsUrl(value?: string): boolean {
    try {
        return new URL(value || '').protocol === 'https:' && !value?.startsWith('<');
    } catch {
        return false;
    }
}

export function validApiKey(value?: string): boolean {
    return typeof value === 'string' && value.length >= 16 && !/[\r\n]/.test(value);
}

export function base64Decode(value: string): Uint8Array {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function base64UrlDecode(value: string): Uint8Array {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    return base64Decode(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
}

export function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

export function errorStatus(code: string): number {
    if (code === 'internal_error') return 500;
    if (code === 'creator_fee_quote_rate_limited' || code === 'rate_limited') return 429;
    if (code === 'origin_denied'
        || code === 'device_key_not_authorized'
        || code === 'invalid_webhook_signature'
        || code === 'admission_reopen_denied'
        || code === 'operator_unauthorized'
        || code === 'playback_denied') return 403;
    if (code.includes('conflict')
        || code === 'admission_denied'
        || code === 'operator_archive_eligible_count_invalid'
        || code === 'operator_archive_scan_active'
        || code === 'on_chain_job_mismatch'
        || code === 'near_finalize_failed'
        || code === 'near_finalize_mismatch'
        || code === 'provider_asset_missing'
        || code === 'provider_identity_mismatch'
        || code === 'provider_playback_missing'
        || code === 'provider_playback_exposed'
        || code === 'provider_playback_mismatch'
        || code === 'provider_verification_incomplete'
        || code === 'provider_verification_budget_exceeded'
        || code === 'verification_evidence_missing'
        || code === 'provider_state_invalid'
        || code === 'provider_tus_state_invalid'
        || code === 'provider_tus_url_expired'
        || code === 'device_nonce_replayed'
        || code === 'provider_create_pending'
        || code === 'provider_delete_ambiguous'
        || code === 'provider_recovery_not_ready'
        || code === 'upload_cancel_denied'
        || code === 'sponsor_balance_insufficient'
        || code === 'sponsor_job_conflict'
        || code === 'sponsor_relay_failed') return 409;
    if (code.startsWith('near_')
        || code === 'admission_closed'
        || code === 'runtime_not_configured'
        || code === 'webhook_queue_unavailable'
        || code === 'playback_authorization_unavailable'
        || code === 'playback_pending'
        || code === 'rate_source_invalid'
        || code === 'rate_source_stale'
        || code === 'rate_source_unavailable'
        || code === 'provider_unavailable'
        || code === 'durable_object_record_limit'
        || code === 'provider_mutations_disabled'
        || code === 'operator_mutations_disabled'
        || code === 'sponsor_relay_mutations_disabled'
        || code === 'sponsor_relay_pending'
        || code === 'provider_admission_closed'
        || code === 'provider_create_ambiguous') return 503;
    return 400;
}

export function safeErrorCode(error: unknown): string {
    if (sponsoredRelayRejectionReason(error)) return 'invalid_sponsored_upload_relay';
    return error instanceof Error && SAFE_ERROR_CODES.has(error.message)
        ? error.message
        : 'internal_error';
}

export function sponsoredRelayRejectionReason(error: unknown): SponsoredRelayRejectionReason | undefined {
    if (!(error instanceof Error)) return undefined;
    return (Object.keys(SPONSORED_RELAY_REJECTION_CODES) as SponsoredRelayRejectionReason[])
        .find((reason) => SPONSORED_RELAY_REJECTION_CODES[reason] === error.message);
}

export function json(body: JsonObject, status = 200): Response {
    return Response.json(body, {
        status,
        headers: { 'Cache-Control': 'no-store' },
    });
}

/**
 * `/__health` for the allowed web origins: GET (and its preflight) only, no credentials, no
 * request headers. Any other request, with or without an Origin, gets the response unchanged.
 */
export function withHealthCors(response: Response, request: Request, env: Env): Response {
    const origin = request.headers.get('Origin') || '';
    if (!allowedOrigins(env).has(origin)) return response;
    const headers = new Headers(response.headers);
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Vary', 'Origin');
    return new Response(response.body, { status: response.status, headers });
}

export function withCors(response: Response, origin: string): Response {
    const headers = new Headers(response.headers);
    if (origin) headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Youtick-Signature');
    headers.set('Vary', 'Origin');
    return new Response(response.body, { status: response.status, headers });
}
