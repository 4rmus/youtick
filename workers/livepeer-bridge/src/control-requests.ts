import { base58Decode } from './base58';
import { MEDIA_SOURCE_FORMATS } from './media-provider';
import type { Env } from './env';
import type {
    LivepeerSourceType,
    UploadIntentBody,
    ControlEnvelope,
    UploadIntentRequest,
    UploadHeartbeatBody,
    UploadHeartbeatRequest,
    UploadCancellationBody,
    UploadCancellationRequest,
} from './types';
import {
    MAX_SOURCE_BYTES,
    CONTROL_MAX_FUTURE_MS,
    ACCOUNT_ID_PATTERN,
    JOB_ID_PATTERN,
    SHA256_PATTERN,
    SESSION_KEY_PATTERN,
    NONCE_PATTERN,
    LEASE_ID_PATTERN,
} from './constants';
import {
    readJsonObject,
    requireObject,
    requireExactKeys,
    canonicalJson,
    sha256Hex,
    allowedOrigins,
    isAllowedControlOrigin,
    base64Decode,
} from './helpers';
import { marketProfileId } from './config';
import { uploadProfileAccepted } from './provider-registry';

export async function parseUploadIntentRequest(request: Request, env: Env): Promise<UploadIntentRequest> {
    const value = await readJsonObject(request);
    requireExactKeys(value, ['body', 'envelope'], 'invalid_control_request');
    const body = parseUploadBody(value.body, env);
    const envelope = parseControlEnvelope(value.envelope);
    const bodySha256 = await sha256Hex(canonicalJson(body));

    if (envelope.version !== '3'
        || envelope.route !== '/v1/upload-intents'
        || envelope.body_sha256 !== bodySha256
        || envelope.resource !== `job:${body.job_id}:${body.generation}`
        || request.headers.get('Origin') !== envelope.origin) {
        throw new Error('protocol_binding_mismatch');
    }
    if (envelope.network !== env.NEAR_NETWORK || envelope.contract_id !== env.MARKET_CONTRACT_ID) {
        throw new Error('deployment_binding_mismatch');
    }
    if (!allowedOrigins(env).has(envelope.origin)) throw new Error('origin_denied');
    const now = BigInt(Date.now());
    const expiresAt = BigInt(envelope.expires_at_ms);
    if (expiresAt <= now || expiresAt > now + BigInt(CONTROL_MAX_FUTURE_MS)) {
        throw new Error('control_request_expired');
    }
    return { body, envelope };
}

export async function parseUploadHeartbeatRequest(
    request: Request,
    env: Env,
): Promise<UploadHeartbeatRequest> {
    const value = await readJsonObject(request);
    requireExactKeys(value, ['body', 'envelope'], 'invalid_control_request');
    const body = parseUploadHeartbeatBody(value.body);
    const envelope = parseControlEnvelope(value.envelope);
    const bodySha256 = await sha256Hex(canonicalJson(body));
    if (envelope.version !== '2'
        || envelope.route !== '/v1/upload-heartbeats'
        || envelope.body_sha256 !== bodySha256
        || envelope.resource !== `job:${body.job_id}:${body.generation}`
        || request.headers.get('Origin') !== envelope.origin) {
        throw new Error('protocol_binding_mismatch');
    }
    if (envelope.network !== env.NEAR_NETWORK || envelope.contract_id !== env.MARKET_CONTRACT_ID) {
        throw new Error('deployment_binding_mismatch');
    }
    if (!allowedOrigins(env).has(envelope.origin)) throw new Error('origin_denied');
    const now = BigInt(Date.now());
    const expiresAt = BigInt(envelope.expires_at_ms);
    if (expiresAt <= now || expiresAt > now + BigInt(CONTROL_MAX_FUTURE_MS)) {
        throw new Error('control_request_expired');
    }
    return { body, envelope };
}

export async function parseUploadCancellationRequest(
    request: Request,
    env: Env,
): Promise<UploadCancellationRequest> {
    const value = await readJsonObject(request);
    requireExactKeys(value, ['body', 'envelope'], 'invalid_control_request');
    const body = parseUploadCancellationBody(value.body);
    const envelope = parseControlEnvelope(value.envelope);
    const bodySha256 = await sha256Hex(canonicalJson(body));
    if (envelope.version !== '2'
        || envelope.route !== '/v1/upload-cancellations'
        || envelope.body_sha256 !== bodySha256
        || envelope.resource !== `job:${body.job_id}:${body.generation}`
        || request.headers.get('Origin') !== envelope.origin) {
        throw new Error('protocol_binding_mismatch');
    }
    if (envelope.network !== env.NEAR_NETWORK || envelope.contract_id !== env.MARKET_CONTRACT_ID) {
        throw new Error('deployment_binding_mismatch');
    }
    if (!allowedOrigins(env).has(envelope.origin)) throw new Error('origin_denied');
    const now = BigInt(Date.now());
    const expiresAt = BigInt(envelope.expires_at_ms);
    if (expiresAt <= now || expiresAt > now + BigInt(CONTROL_MAX_FUTURE_MS)) {
        throw new Error('control_request_expired');
    }
    return { body, envelope };
}

function parseUploadBody(value: unknown, env: Env): UploadIntentBody {
    const body = requireObject(value, 'invalid_upload_intent');
    const keys = [
        'job_id',
        'generation',
        'expected_source_bytes',
        'source_fingerprint_sha256',
        'source_type',
        'profile_id',
        'profile_config_sha256',
    ];
    requireExactKeys(body, body.recovery === undefined ? keys : [...keys, 'recovery'], 'invalid_upload_intent');
    if (typeof body.job_id !== 'string'
        || !JOB_ID_PATTERN.test(body.job_id)
        || !Number.isSafeInteger(body.generation)
        || (body.generation as number) < 1
        || typeof body.expected_source_bytes !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(body.expected_source_bytes)
        || BigInt(body.expected_source_bytes) > MAX_SOURCE_BYTES
        || typeof body.source_fingerprint_sha256 !== 'string'
        || !SHA256_PATTERN.test(body.source_fingerprint_sha256)
        || !isLivepeerSourceType(body.source_type)
        || body.profile_id !== marketProfileId(env)
        || !uploadProfileAccepted(env, body.profile_config_sha256)
        || (body.recovery !== undefined && !['reconcile', 'resume'].includes(String(body.recovery)))) {
        throw new Error('invalid_upload_intent');
    }
    return body as UploadIntentBody;
}

function parseUploadHeartbeatBody(value: unknown): UploadHeartbeatBody {
    const body = requireObject(value, 'invalid_upload_intent');
    requireExactKeys(body, ['job_id', 'generation', 'lease_id'], 'invalid_upload_intent');
    if (typeof body.job_id !== 'string'
        || !JOB_ID_PATTERN.test(body.job_id)
        || !Number.isSafeInteger(body.generation)
        || (body.generation as number) < 1
        || typeof body.lease_id !== 'string'
        || !LEASE_ID_PATTERN.test(body.lease_id)) {
        throw new Error('invalid_upload_intent');
    }
    return body as UploadHeartbeatBody;
}

function parseUploadCancellationBody(value: unknown): UploadCancellationBody {
    const body = requireObject(value, 'invalid_upload_intent');
    requireExactKeys(body, ['job_id', 'generation'], 'invalid_upload_intent');
    if (typeof body.job_id !== 'string'
        || !JOB_ID_PATTERN.test(body.job_id)
        || !Number.isSafeInteger(body.generation)
        || (body.generation as number) < 1) {
        throw new Error('invalid_upload_intent');
    }
    return body as UploadCancellationBody;
}

function isLivepeerSourceType(value: unknown): value is LivepeerSourceType {
    return typeof value === 'string' && Object.hasOwn(MEDIA_SOURCE_FORMATS, value);
}

export function parseControlEnvelope(value: unknown): ControlEnvelope {
    const envelope = requireObject(value, 'invalid_control_envelope');
    requireExactKeys(envelope, [
        'domain',
        'version',
        'method',
        'route',
        'network',
        'contract_id',
        'account_id',
        'resource',
        'session_public_key',
        'origin',
        'device_nonce',
        'expires_at_ms',
        'body_sha256',
    ], 'invalid_control_envelope');
    if (envelope.domain !== 'youtick.paid-media-livepeer-v1.control'
        || !['2', '3'].includes(String(envelope.version))
        || envelope.method !== 'POST'
        || !['/v1/upload-intents', '/v1/upload-heartbeats', '/v1/upload-cancellations', '/v1/playback-tokens']
            .includes(String(envelope.route))
        || !['testnet', 'mainnet'].includes(String(envelope.network))
        || typeof envelope.contract_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(envelope.contract_id)
        || typeof envelope.account_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(envelope.account_id)
        || typeof envelope.resource !== 'string'
        || /[\r\n]/.test(envelope.resource)
        || typeof envelope.session_public_key !== 'string'
        || !SESSION_KEY_PATTERN.test(envelope.session_public_key)
        || typeof envelope.origin !== 'string'
        || !isAllowedControlOrigin(envelope.origin)
        || typeof envelope.device_nonce !== 'string'
        || !NONCE_PATTERN.test(envelope.device_nonce)
        || typeof envelope.expires_at_ms !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(envelope.expires_at_ms)
        || typeof envelope.body_sha256 !== 'string'
        || !SHA256_PATTERN.test(envelope.body_sha256)) {
        throw new Error('invalid_control_envelope');
    }
    return envelope as ControlEnvelope;
}

export async function verifyControlSignature(request: Request, envelope: ControlEnvelope): Promise<void> {
    const signature = request.headers.get('X-Youtick-Signature') || '';
    let signatureBytes: Uint8Array;
    try {
        signatureBytes = base64Decode(signature);
    } catch {
        throw new Error('invalid_control_request');
    }
    let publicKeyBytes: Uint8Array;
    try {
        publicKeyBytes = base58Decode(envelope.session_public_key);
    } catch {
        throw new Error('invalid_control_request');
    }
    if (signatureBytes.length !== 64 || publicKeyBytes.length !== 32) {
        throw new Error('invalid_control_request');
    }
    const key = await crypto.subtle.importKey('raw', publicKeyBytes, 'Ed25519', false, ['verify']);
    const valid = await crypto.subtle.verify(
        'Ed25519',
        key,
        signatureBytes,
        new TextEncoder().encode(canonicalControlMessage(envelope)),
    );
    if (!valid) throw new Error('invalid_control_request');
}

function canonicalControlMessage(envelope: ControlEnvelope): string {
    return [
        envelope.domain,
        envelope.version,
        envelope.method,
        envelope.route,
        envelope.network,
        envelope.contract_id,
        envelope.account_id,
        envelope.resource,
        envelope.session_public_key,
        envelope.origin,
        envelope.device_nonce,
        envelope.expires_at_ms,
        envelope.body_sha256,
    ].join('\n');
}
