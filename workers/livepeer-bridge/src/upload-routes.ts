import type { Env } from './env';
import type { JsonObject } from './types';
import { MAX_SOURCE_BYTES, ACCOUNT_ID_PATTERN, JOB_ID_PATTERN } from './constants';
import {
    formatLog,
    readJsonObject,
    requireExactKeys,
    allowedOrigins,
    errorStatus,
    safeErrorCode,
    json,
    withCors,
} from './helpers';
import { studioActive, streamMaxDurationSeconds, validAdmissionConfig } from './config';
import { jobObjectName, admissionObjectName } from './object-names';
import { parseUploadIntentRequest, parseUploadHeartbeatRequest } from './control-requests';

type UploadPreflightRequest = {
    creator_id: string;
    job_id: string;
    generation: number;
    expected_source_bytes: string;
};

export async function forwardUploadIntent(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
    try {
        if (!env.LIVEPEER_CONTROL) throw new Error('runtime_not_configured');
        const forwardingRequest = request.clone();
        // The account limit runs in the object once the signature and on-chain key binding are verified.
        const input = await parseUploadIntentRequest(request, env);
        const objectName = jobObjectName(
            input.envelope.network,
            input.envelope.contract_id,
            input.body.job_id,
            input.body.generation,
        );
        const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(objectName));
        return withCors(await object.fetch(forwardingRequest), corsOrigin);
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('livepeer_bridge_route_failed', { code }));
        return withCors(json({ error: code }, errorStatus(code)), corsOrigin);
    }
}

export async function forwardUploadHeartbeat(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
    try {
        if (!env.LIVEPEER_CONTROL) throw new Error('runtime_not_configured');
        const forwardingRequest = request.clone();
        // The account limit runs in the object once the signature and on-chain key binding are verified.
        const input = await parseUploadHeartbeatRequest(request, env);
        const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(jobObjectName(
            input.envelope.network,
            input.envelope.contract_id,
            input.body.job_id,
            input.body.generation,
        )));
        return withCors(await object.fetch(forwardingRequest), corsOrigin);
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('livepeer_upload_heartbeat_failed', { code }));
        return withCors(json({ error: code }, errorStatus(code)), corsOrigin);
    }
}

export async function forwardUploadPreflight(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = allowedOrigins(env).has(origin) ? origin : '';
    try {
        if (!allowedOrigins(env).has(origin)) throw new Error('origin_denied');
        if (env.LIVEPEER_NEW_UPLOADS_ENABLED !== 'true') throw new Error('admission_closed');
        if (!env.LIVEPEER_CONTROL || !validAdmissionConfig(env)) {
            throw new Error('runtime_not_configured');
        }
        // creator_id is unsigned here, so only the route's IP limit applies; an account bucket would let anyone lock it.
        const input = parseUploadPreflightRequest(await readJsonObject(request));
        const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(admissionObjectName(
            env.NEAR_NETWORK!,
            env.MARKET_CONTRACT_ID!,
        )));
        return withCors(await object.fetch(new Request('https://object/internal/admission/preflight', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jobId: input.job_id,
                generation: input.generation,
                creator: input.creator_id,
                expectedSourceBytes: input.expected_source_bytes,
                // Stream-only Market V2: the preflight also answers the reservation budget.
                ...(!studioActive(env) && streamMaxDurationSeconds(env) !== null
                    ? { reservedSeconds: streamMaxDurationSeconds(env) } : {}),
            }),
        })), corsOrigin);
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('livepeer_upload_preflight_failed', { code }));
        return withCors(json({ error: code }, errorStatus(code)), corsOrigin);
    }
}

function parseUploadPreflightRequest(input: JsonObject): UploadPreflightRequest {
    requireExactKeys(
        input,
        ['creator_id', 'job_id', 'generation', 'expected_source_bytes'],
        'invalid_upload_preflight',
    );
    if (typeof input.creator_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(input.creator_id)
        || typeof input.job_id !== 'string'
        || !JOB_ID_PATTERN.test(input.job_id)
        || !Number.isSafeInteger(input.generation)
        || (input.generation as number) < 1
        || typeof input.expected_source_bytes !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(input.expected_source_bytes)
        || BigInt(input.expected_source_bytes) > MAX_SOURCE_BYTES) {
        throw new Error('invalid_upload_preflight');
    }
    return input as UploadPreflightRequest;
}
