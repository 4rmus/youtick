import { KeyPairSigner } from 'near-api-js';
import type { Env } from './env';
import type { JsonObject, AdmissionReopenInput } from './types';
import { JOB_ID_PATTERN, PROVIDER_ID_PATTERN } from './constants';
import {
    formatLog,
    constantTimeEqual,
    readJsonObject,
    requireExactKeys,
    errorStatus,
    safeErrorCode,
    json,
} from './helpers';
import { validOperatorArchiveConfig, validAdmissionReopenConfig, validOperatorStatusConfig } from './config';
import { jobObjectName, operatorObjectName, admissionObjectName } from './object-names';
import { parseAdmissionReopenInput } from './admission';

export async function forwardAdmissionReopen(request: Request, env: Env): Promise<Response> {
    try {
        if (!env.LIVEPEER_CONTROL || !validAdmissionReopenConfig(env)) {
            throw new Error('runtime_not_configured');
        }
        await requireOperatorAuthorization(request, env);
        const input = parseAdmissionReopenRequest(await readJsonObject(request), env);
        const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(admissionObjectName(
            env.NEAR_NETWORK!,
            env.MARKET_CONTRACT_ID!,
        )));
        return await object.fetch(new Request('https://object/internal/admission/reopen', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        }));
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('livepeer_admission_reopen_failed', { code }));
        return json({ error: code }, errorStatus(code));
    }
}

export async function forwardPublicBetaAssetDelete(request: Request, env: Env): Promise<Response> {
    try {
        await requireOperatorAuthorization(request, env);
        const input = await readJsonObject(request);
        requireExactKeys(input, ['job_id', 'generation', 'asset_id'], 'invalid_outbox');
        if (typeof input.job_id !== 'string'
            || !JOB_ID_PATTERN.test(input.job_id)
            || input.generation !== 1
            || typeof input.asset_id !== 'string'
            || !PROVIDER_ID_PATTERN.test(input.asset_id)) {
            throw new Error('invalid_outbox');
        }
        const object = env.LIVEPEER_CONTROL!.get(env.LIVEPEER_CONTROL!.idFromName(jobObjectName(
            env.NEAR_NETWORK!,
            env.MARKET_CONTRACT_ID!,
            input.job_id,
            input.generation,
        )));
        return await object.fetch(new Request('https://object/internal/provider-asset-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jobId: input.job_id,
                generation: input.generation,
                assetId: input.asset_id,
            }),
        }));
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('public_beta_provider_delete_failed', { code }));
        return json({ error: code }, errorStatus(code));
    }
}

export async function forwardAdmissionStatus(request: Request, env: Env): Promise<Response> {
    try {
        if (!env.LIVEPEER_CONTROL || !validAdmissionReopenConfig(env)) {
            throw new Error('runtime_not_configured');
        }
        await requireOperatorAuthorization(request, env);
        const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(admissionObjectName(
            env.NEAR_NETWORK!,
            env.MARKET_CONTRACT_ID!,
        )));
        return await object.fetch(new Request('https://object/internal/admission/status'));
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('livepeer_admission_status_failed', { code }));
        return json({ error: code }, errorStatus(code));
    }
}

async function operatorControlObject(env: Env): Promise<DurableObjectStub> {
    if (!env.LIVEPEER_CONTROL || !validOperatorStatusConfig(env)) {
        throw new Error('runtime_not_configured');
    }
    const signer = KeyPairSigner.fromSecretKey(env.NEAR_OPERATOR_PRIVATE_KEY as `ed25519:${string}`);
    const publicKey = (await signer.getPublicKey()).toString();
    return env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(operatorObjectName(
        env.NEAR_NETWORK!,
        publicKey,
        Number(env.NEAR_OPERATOR_KEY_EPOCH),
    )));
}

export async function forwardOperatorOutboxStatus(
    request: Request,
    env: Env,
): Promise<Response> {
    try {
        await requireOperatorAuthorization(request, env);
        return await (await operatorControlObject(env)).fetch(
            new Request('https://object/internal/operator-outbox/status'),
        );
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('livepeer_operator_outbox_status_failed', { code }));
        return json({ error: code }, errorStatus(code));
    }
}

export async function forwardOperatorOutboxArchiveScan(
    request: Request,
    env: Env,
): Promise<Response> {
    try {
        if (!validOperatorArchiveConfig(env)) throw new Error('runtime_not_configured');
        await requireOperatorAuthorization(request, env);
        return await (await operatorControlObject(env)).fetch(new Request(
            'https://object/internal/operator-outbox/archive-scan',
            { method: 'POST' },
        ));
    } catch (error) {
        const code = safeErrorCode(error);
        console.error(formatLog('livepeer_operator_outbox_archive_scan_failed', { code }));
        return json({ error: code }, errorStatus(code));
    }
}

function parseAdmissionReopenRequest(input: JsonObject, env: Env): AdmissionReopenInput {
    requireExactKeys(input, [
        'idempotency_key',
        'network',
        'contract_id',
        'closure_code',
        'closure_observed_at_ms',
        'incident_id',
        'evidence_sha256',
        'resolution_code',
        'job_id',
        'generation',
    ], 'invalid_admission_reopen');
    if (input.network !== env.NEAR_NETWORK || input.contract_id !== env.MARKET_CONTRACT_ID) {
        throw new Error('admission_reopen_denied');
    }
    return parseAdmissionReopenInput({
        idempotencyKey: input.idempotency_key,
        operatorId: env.LIVEPEER_PAID_MEDIA_OPERATOR_ID,
        closureCode: input.closure_code,
        closureObservedAtMs: typeof input.closure_observed_at_ms === 'string'
            && /^[1-9][0-9]{0,15}$/.test(input.closure_observed_at_ms)
            ? Number(input.closure_observed_at_ms)
            : Number.NaN,
        incidentId: input.incident_id,
        evidenceSha256: input.evidence_sha256,
        resolutionCode: input.resolution_code,
        jobId: input.job_id,
        generation: input.generation,
    });
}

async function requireOperatorAuthorization(request: Request, env: Env): Promise<void> {
    const authorization = request.headers.get('Authorization') || '';
    const encoder = new TextEncoder();
    const actual = encoder.encode(authorization);
    const authorized = [
        env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN,
        env.LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN_PREVIOUS,
    ].filter((value): value is string => typeof value === 'string').reduce((matched, token) => (
        constantTimeEqual(actual, encoder.encode(`Bearer ${token}`)) || matched
    ), false);
    if (!authorized) {
        throw new Error('operator_unauthorized');
    }
}
