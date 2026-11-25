import { mediaProfileFamily } from './media-provider';
import type { Env } from './env';
import type {
    UploadIntentRequest,
    UploadHeartbeatRequest,
    UploadCancellationRequest,
    OnChainJob,
    JobState,
    JobRecord,
} from './types';
import { ADMISSION_LEASE_HEARTBEAT_MS } from './constants';
import { formatLog, json } from './helpers';

const LIVEPEER_TUS_CHUNK_BYTES = 32 * 1024 * 1024;

export function logJobStateTransition(
    fromState: JobRecord['state'] | null,
    toState: JobRecord['state'],
    previous?: JobRecord,
): void {
    if (fromState === toState) return;
    console.info(formatLog('state_transition', {
        stateKind: 'upload_job',
        fromState: fromState || 'NONE',
        toState,
        ...(previous ? {
            generation: previous.generation,
            clock: 'server_observation',
            observedAtMs: Date.now(),
            // Time between our state observations, not provider queue/transcode time.
            observedStateMs: previous.stateChangedAtMs === undefined
                ? null : Math.max(0, Date.now() - previous.stateChangedAtMs),
        } : {}),
    }));
}

const JOB_STATE_TRANSITIONS: Record<JobState, ReadonlySet<JobState>> = {
    AUTHORIZED: new Set(['LEASED', 'UPLOAD_EXPIRED', 'CANCELLED']),
    LEASED: new Set(['PROVIDER_CREATE_PENDING', 'UPLOAD_EXPIRED', 'CANCELLED']),
    PROVIDER_CREATE_PENDING: new Set(['CREATE_AMBIGUOUS', 'UPLOAD_READY', 'UPLOAD_EXPIRED']),
    CREATE_PENDING: new Set(['CREATE_AMBIGUOUS', 'UPLOAD_READY']),
    CREATE_AMBIGUOUS: new Set(),
    UPLOAD_READY: new Set(['UPLOADING', 'PROCESSING', 'READY_VERIFIED', 'UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'CANCELLED']),
    UPLOADING: new Set(['PROCESSING', 'READY_VERIFIED', 'UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'CANCELLED']),
    PROCESSING: new Set(['READY_VERIFIED', 'UPLOAD_EXPIRED', 'PROVIDER_FAILED']),
    READY_VERIFIED: new Set(['FINALIZE_QUEUED', 'FINALIZE_RETRY', 'UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'ONCHAIN_PUBLISHED']),
    FINALIZE_QUEUED: new Set(['FINALIZE_RETRY', 'UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'ONCHAIN_PUBLISHED']),
    FINALIZE_RETRY: new Set(['FINALIZE_QUEUED', 'UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'ONCHAIN_PUBLISHED']),
    UPLOAD_EXPIRED: new Set(),
    PROVIDER_FAILED: new Set(),
    ONCHAIN_PUBLISHED: new Set(),
    CANCELLED: new Set(),
};

export function transitionJob(record: JobRecord, state: JobState): JobRecord {
    if (record.state === state) return record;
    if (!JOB_STATE_TRANSITIONS[record.state].has(state)) throw new Error('invalid_job_transition');
    const now = Date.now();
    const terminal = ['UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'CANCELLED'].includes(state);
    return {
        ...record,
        state,
        stateChangedAtMs: now,
        ...(terminal ? {
            terminalAtMs: now,
            terminalArchive: {
                status: 'PENDING',
                attempts: 0,
                createdAtMs: now,
                nextAttemptAtMs: now,
            },
        } : {}),
    };
}

export function uploadIntentResponse(record: JobRecord, created: boolean): Response {
    if (!['UPLOAD_READY', 'UPLOADING'].includes(record.state)
        || !record.tusEndpoint
        || !record.leaseId
        || !record.leaseExpiresAtMs) {
        throw new Error('provider_create_ambiguous');
    }
    return json({
        schema: 'youtick.livepeer-upload-intent.v2',
        job_id: record.jobId,
        generation: record.generation,
        expected_source_bytes: record.expectedSourceBytes,
        source_type: record.sourceType,
        chunk_bytes: LIVEPEER_TUS_CHUNK_BYTES,
        tus_endpoint: record.tusEndpoint,
        lease_id: record.leaseId,
        lease_expires_at_ms: String(record.leaseExpiresAtMs),
        heartbeat_interval_ms: ADMISSION_LEASE_HEARTBEAT_MS,
        created,
    }, created ? 201 : 200);
}

export function requireHeartbeatChainJob(input: UploadHeartbeatRequest, job: OnChainJob): void {
    if (job.job_id !== input.body.job_id
        || job.creator_id !== input.envelope.account_id
        || job.generation !== input.body.generation
        || job.status !== 'Authorized'
        || job.upload_public_key !== input.envelope.session_public_key
        || typeof job.upload_key_expires_at_ms !== 'string'
        || !/^[1-9][0-9]{0,15}$/.test(job.upload_key_expires_at_ms)
        || BigInt(job.upload_key_expires_at_ms) <= BigInt(Date.now())) {
        throw new Error('on_chain_job_mismatch');
    }
}

export function requireCancellationChainJob(input: UploadCancellationRequest, job: OnChainJob): void {
    if (job.job_id !== input.body.job_id
        || job.creator_id !== input.envelope.account_id
        || job.generation !== input.body.generation
        || job.status !== 'Authorized'
        || job.upload_public_key !== input.envelope.session_public_key
        || typeof job.upload_key_expires_at_ms !== 'string'
        || !/^[1-9][0-9]{0,15}$/.test(job.upload_key_expires_at_ms)
        || BigInt(job.upload_key_expires_at_ms) <= BigInt(Date.now())) {
        throw new Error('on_chain_job_mismatch');
    }
}

export function requireExactChainJob(input: UploadIntentRequest, job: OnChainJob): void {
    if (job.job_id !== input.body.job_id
        || job.creator_id !== input.envelope.account_id
        || job.profile_id !== input.body.profile_id
        || job.profile_config_sha256 !== input.body.profile_config_sha256
        || job.expected_source_bytes !== input.body.expected_source_bytes
        || job.generation !== input.body.generation
        || job.status !== 'Authorized'
        || job.upload_public_key !== input.envelope.session_public_key
        || typeof job.upload_key_expires_at_ms !== 'string'
        || !/^[1-9][0-9]{0,15}$/.test(job.upload_key_expires_at_ms)
        || BigInt(job.upload_key_expires_at_ms) <= BigInt(Date.now())) {
        throw new Error('on_chain_job_mismatch');
    }
}

export function jobRecord(
    input: UploadIntentRequest,
    env: Env,
    absoluteDeadlineAtMs?: string,
): JobRecord {
    // The adapter is fixed at creation from the profile hash and never re-derived later.
    const stream = mediaProfileFamily(input.body.profile_config_sha256) === 'stream';
    if (!stream && (typeof env.LIVEPEER_API_TOKEN_NAME !== 'string'
        || env.LIVEPEER_API_TOKEN_NAME.length < 1
        || env.LIVEPEER_API_TOKEN_NAME.length > 128)) {
        throw new Error('runtime_not_configured');
    }
    const createdAtMs = Date.now();
    return {
        schema: 'youtick.livepeer-control-job.v2',
        state: 'AUTHORIZED',
        network: input.envelope.network,
        contractId: input.envelope.contract_id,
        jobId: input.body.job_id,
        generation: input.body.generation,
        creator: input.envelope.account_id,
        expectedSourceBytes: input.body.expected_source_bytes,
        sourceFingerprintSha256: input.body.source_fingerprint_sha256,
        sourceType: input.body.source_type,
        profileId: input.body.profile_id,
        profileConfigSha256: input.body.profile_config_sha256,
        createdAtMs,
        stateChangedAtMs: createdAtMs,
        ...(stream ? { provider: 'stream' as const } : { apiTokenName: env.LIVEPEER_API_TOKEN_NAME }),
        ...(absoluteDeadlineAtMs === undefined
            ? {}
            : { absoluteDeadlineAtMs: Number(absoluteDeadlineAtMs) }),
    };
}

export function sameJob(left: JobRecord, right: JobRecord): boolean {
    return left.network === right.network
        && left.contractId === right.contractId
        && left.jobId === right.jobId
        && left.generation === right.generation
        && left.creator === right.creator
        && left.expectedSourceBytes === right.expectedSourceBytes
        && left.sourceFingerprintSha256 === right.sourceFingerprintSha256
        && left.sourceType === right.sourceType
        && left.profileId === right.profileId
        && left.profileConfigSha256 === right.profileConfigSha256;
}
