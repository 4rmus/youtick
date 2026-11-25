import type { Env } from './env';
import type { ControlEnvelope } from './types';
import {
    CONTROL_MAX_FUTURE_MS,
    PLAYBACK_MIN_TTL_SECONDS,
    PLAYBACK_MAX_TTL_SECONDS,
    JOB_ID_PATTERN,
    SHA256_PATTERN,
    PLAYBACK_ID_PATTERN,
} from './constants';
import {
    formatLog,
    readJsonObject,
    requireObject,
    requireExactKeys,
    canonicalJson,
    sha256Hex,
    allowedOrigins,
    errorStatus,
    safeErrorCode,
    json,
    withCors,
} from './helpers';
import { validPlaybackConfig, validPlaybackV2Config } from './config';
import { jobObjectName } from './object-names';
import { nearPlaybackView } from './near-rpc';
import {
    enforcePublicBetaAccountRateLimit,
    requireActivePublicTestnetBetaForPlayback,
} from './public-testnet-beta';
import { publicationProfileHash } from './provider-registry';
import { parseControlEnvelope } from './control-requests';
import {
    parsePlaybackV2Request,
    verifyPlaybackV2Proofs,
    readStatelessPlaybackAuthorization,
    logTakedownPlaybackAttempt,
} from './playback-v2';

type PlaybackTokenBody = {
    job_id: string;
    generation: number;
    playback_id: string;
    grant_id: string;
    origin_hash: string;
    device_hash: string;
    requested_ttl_seconds: number;
};
type PlaybackTokenRequest = {
    body: PlaybackTokenBody;
    envelope: ControlEnvelope;
    shadowV2?: unknown;
};

export async function forwardPlaybackToken(
    request: Request,
    env: Env,
    context?: ExecutionContext,
): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
    try {
        if (!env.LIVEPEER_CONTROL || !validPlaybackConfig(env)) throw new Error('runtime_not_configured');
        const input = await parsePlaybackTokenRequest(request, env);
        await enforcePublicBetaAccountRateLimit(
            env,
            '/v1/playback-tokens',
            input.envelope.account_id,
        );
        await requireActivePublicTestnetBetaForPlayback(env);
        const forwardingRequest = new Request(request.url, {
            method: 'POST',
            headers: request.headers,
            body: JSON.stringify({ body: input.body, envelope: input.envelope }),
        });
        const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(jobObjectName(
            input.envelope.network,
            input.envelope.contract_id,
            input.body.job_id,
            input.body.generation,
        )));
        const response = await object.fetch(forwardingRequest);
        if (env.LIVEPEER_PLAYBACK_SHADOW_V2_ENABLED === 'true'
            && input.shadowV2 !== undefined
            && context) {
            context.waitUntil(observePlaybackShadow(
                input.shadowV2,
                origin,
                env,
                response.clone(),
            ));
        }
        return withCors(response, corsOrigin);
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('livepeer_playback_route_failed', { code }));
        return withCors(json({ error: code }, errorStatus(code)), corsOrigin);
    }
}

async function observePlaybackShadow(
    shadowV2: unknown,
    origin: string,
    env: Env,
    legacyResponse: Response,
): Promise<void> {
    const legacyReasonCode = legacyResponse.ok
        ? 'authorized'
        : await responseErrorCode(legacyResponse);
    let v2ReasonCode = 'authorized';
    try {
        if (!validPlaybackV2Config(env)) throw new Error('runtime_not_configured');
        const request = new Request('https://shadow.invalid/v2/playback-tokens', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: origin },
            body: JSON.stringify(shadowV2),
        });
        const input = await parsePlaybackV2Request(request, env);
        await verifyPlaybackV2Proofs(env, input);
        await readStatelessPlaybackAuthorization(env, input);
    } catch (error) {
        v2ReasonCode = safeErrorCode(error);
    }
    const legacyDecision = playbackDecision(legacyReasonCode);
    const v2Decision = playbackDecision(v2ReasonCode);
    console.info(formatLog('playback_shadow_authorization_compared', {
        legacyDecision,
        legacyReasonCode,
        v2Decision,
        v2ReasonCode,
        decisionMatch: legacyDecision === v2Decision,
    }));
}

async function responseErrorCode(response: Response): Promise<string> {
    try {
        const body = await response.json() as { error?: unknown };
        return safeErrorCode(new Error(typeof body.error === 'string' ? body.error : 'internal_error'));
    } catch {
        return 'internal_error';
    }
}

function playbackDecision(reasonCode: string): 'ALLOW' | 'DENY' | 'UNAVAILABLE' {
    if (reasonCode === 'authorized') return 'ALLOW';
    if (reasonCode === 'internal_error'
        || reasonCode === 'runtime_not_configured'
        || reasonCode === 'playback_authorization_unavailable'
        || reasonCode === 'provider_unavailable'
        || reasonCode.startsWith('near_')) return 'UNAVAILABLE';
    return 'DENY';
}

export async function parsePlaybackTokenRequest(request: Request, env: Env): Promise<PlaybackTokenRequest> {
    const value = await readJsonObject(request);
    const hasShadowV2 = Object.hasOwn(value, 'shadow_v2');
    requireExactKeys(
        value,
        hasShadowV2 ? ['body', 'envelope', 'shadow_v2'] : ['body', 'envelope'],
        'invalid_control_request',
    );
    const body = parsePlaybackTokenBody(value.body);
    const envelope = parseControlEnvelope(value.envelope);
    const bodySha256 = await sha256Hex(canonicalJson(body));

    if (envelope.version !== '2'
        || envelope.route !== '/v1/playback-tokens'
        || envelope.body_sha256 !== bodySha256
        || envelope.resource !== `playback:${body.job_id}:${body.generation}:${body.playback_id}`
        || body.grant_id !== `play:${body.job_id}:${envelope.account_id}`
        || request.headers.get('Origin') !== envelope.origin
        || body.origin_hash !== await sha256Hex(envelope.origin)) {
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
    return { body, envelope, ...(hasShadowV2 ? { shadowV2: value.shadow_v2 } : {}) };
}

function parsePlaybackTokenBody(value: unknown): PlaybackTokenBody {
    const body = requireObject(value, 'invalid_playback_request');
    requireExactKeys(body, [
        'job_id',
        'generation',
        'playback_id',
        'grant_id',
        'origin_hash',
        'device_hash',
        'requested_ttl_seconds',
    ], 'invalid_playback_request');
    if (typeof body.job_id !== 'string'
        || !JOB_ID_PATTERN.test(body.job_id)
        || !Number.isSafeInteger(body.generation)
        || (body.generation as number) < 1
        || typeof body.playback_id !== 'string'
        || !PLAYBACK_ID_PATTERN.test(body.playback_id)
        || typeof body.grant_id !== 'string'
        || body.grant_id.length > 256
        || /[\r\n]/.test(body.grant_id)
        || typeof body.origin_hash !== 'string'
        || !SHA256_PATTERN.test(body.origin_hash)
        || typeof body.device_hash !== 'string'
        || !SHA256_PATTERN.test(body.device_hash)
        || !Number.isSafeInteger(body.requested_ttl_seconds)
        || (body.requested_ttl_seconds as number) < PLAYBACK_MIN_TTL_SECONDS
        || (body.requested_ttl_seconds as number) > PLAYBACK_MAX_TTL_SECONDS) {
        throw new Error('invalid_playback_request');
    }
    return body as PlaybackTokenBody;
}

export async function readPlaybackAuthorization(
    env: Env,
    input: PlaybackTokenRequest,
): Promise<{ grantExpiresAtMs: number; profileConfigSha256?: string }> {
    if (!validPlaybackConfig(env)) throw new Error('runtime_not_configured');
    const publicationRead = await nearPlaybackView(
        env,
        env.MARKET_CONTRACT_ID!,
        'get_publication',
        { publication_id: input.body.job_id },
    );
    const publication = requireObject(publicationRead.value, 'playback_denied');
    logTakedownPlaybackAttempt(publication, 'LEGACY_SESSION_GRANT');
    if (publication.publication_id !== input.body.job_id
        || publication.generation !== input.body.generation
        || publication.playback_id !== input.body.playback_id
        || !['ACTIVE', 'SALES_SUSPENDED'].includes(String(publication.availability))) {
        throw new Error('playback_denied');
    }

    const [entitlementRead, grantRead, verificationRead] = await Promise.all([
        nearPlaybackView(env, env.MARKET_CONTRACT_ID!, 'has_entitlement', {
            account_id: input.envelope.account_id,
            publication_id: input.body.job_id,
        }, publicationRead.blockHash),
        nearPlaybackView(env, env.ACCESS_CONTRACT_ID!, 'get_session_grant', {
            session_pk: input.envelope.session_public_key,
        }, publicationRead.blockHash),
        nearPlaybackView(env, env.ACCESS_CONTRACT_ID!, 'verify_session_grant', {
            session_pk: input.envelope.session_public_key,
            scope: 'Play',
            resource_id: input.body.job_id,
            origin_hash: input.body.origin_hash,
            device_hash: input.body.device_hash,
        }, publicationRead.blockHash),
    ]);
    const grant = requireObject(grantRead.value, 'playback_denied');
    const verification = requireObject(verificationRead.value, 'playback_denied');
    if (entitlementRead.value !== true
        || verification.valid !== true
        || verification.owner_id !== input.envelope.account_id
        || grant.owner_id !== input.envelope.account_id
        || grant.session_pk !== input.envelope.session_public_key
        || grant.scope !== 'Play'
        || grant.resource_id !== input.body.job_id
        || grant.origin_hash !== input.body.origin_hash
        || grant.device_hash !== input.body.device_hash
        || grant.revoked !== false
        || !Number.isSafeInteger(grant.expires_at_ms)
        || (grant.expires_at_ms as number) <= Date.now()) {
        throw new Error('playback_denied');
    }
    return {
        grantExpiresAtMs: grant.expires_at_ms as number,
        profileConfigSha256: publicationProfileHash(publication),
    };
}
