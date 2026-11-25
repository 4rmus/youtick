import { CloudflareStreamProvider } from './cloudflare-stream-provider';
import { commitUploadJobArchive, type UploadJobArchive } from './upload-job-archive';
import type { Env } from './env';
import type { JobState, JobRecord } from './types';
import {
    CONTROL_MAX_FUTURE_MS,
    LIFECYCLE_DELETE_BATCH,
    JOB_KEY,
    RECONCILE_BACKOFF_MS,
    LEGACY_PROFILE_ID,
} from './constants';
import { formatLog, canonicalJson, sha256Hex, safeErrorCode, json } from './helpers';
import {
    isMarketV2,
    operatorJobAllowed,
    positiveIntegerVar,
    streamMaxDurationSeconds,
    validStreamConfig,
} from './config';
import { finalPublicationMatches } from './near-rpc';
import { publicBetaDeadlineExpired } from './public-testnet-beta';
import { streamProvider, mediaProvider, jobProviderKind } from './provider-registry';
import { ensureReconcileScheduled, scheduleReconcile, scheduleAlarmNoLaterThan } from './alarm-schedule';
import { signalStreamAdmission, closeAdmissionAfterAmbiguousDelete, updateAdmission } from './admission';
import { forwardFinalize } from './operator-outbox';
import { persistUploadVerificationResult } from './reconcile';
import { logJobStateTransition, transitionJob } from './job-state';

const WEBHOOK_DEDUP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const UPLOAD_JOB_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

/** True only for a readable tus HEAD whose offset exceeds its length; unreadable, expired or short is false. */
export async function streamUploadOverflowed(provider: CloudflareStreamProvider, tusEndpoint: string): Promise<boolean> {
    try {
        const tus = await provider.readTusProgress(tusEndpoint);
        return BigInt(tus.offsetBytes) > BigInt(tus.lengthBytes);
    } catch {
        return false;
    }
}

/** Records a Stream state/pctComplete observation; returns the same object when nothing changed. */
export function trackStreamProgress(
    job: JobRecord,
    progress: { state: string; pctComplete: number } | undefined,
    now: number,
): JobRecord {
    if (jobProviderKind(job) !== 'stream' || !progress) return job;
    const previous = job.streamProgress;
    if (previous && previous.state === progress.state && previous.pctComplete === progress.pctComplete) return job;
    return { ...job, streamProgress: { state: progress.state, pctComplete: progress.pctComplete, changedAtMs: now } };
}

/**
 * Ends a Stream job (failure, expiry or cancellation) and deletes its UID exactly once, so the
 * reservation Stream booked at creation is released; gated by the provider-mutation flag.
 */
export async function terminateStreamJob(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
    toState: 'PROVIDER_FAILED' | 'UPLOAD_EXPIRED' | 'CANCELLED',
    code: string,
    extra?: { reason: 'stuck' },
): Promise<JobRecord> {
    const current = await state.storage.get<JobRecord>(JOB_KEY) ?? job;
    let record = current;
    if (!['PROVIDER_FAILED', 'UPLOAD_EXPIRED', 'CANCELLED'].includes(current.state)) {
        record = transitionJob(current, toState);
        await state.storage.put(JOB_KEY, record);
        logJobStateTransition(current.state, record.state, current);
    }
    console.warn(formatLog(toState === 'PROVIDER_FAILED' ? 'stream_upload_failed' : 'stream_upload_ended', {
        toState: record.state,
        code: /^[A-Za-z0-9_]{1,64}$/.test(code) ? code : 'unknown',
    }));
    record = await deleteStreamUpload(state, env, record);
    await scheduleTerminalArchive(state, env, record);
    await updateAdmission(env, record, record.state as 'PROVIDER_FAILED' | 'UPLOAD_EXPIRED' | 'CANCELLED', extra);
    return record;
}

/** Cron: log the prepaid storage headroom every run and keep the health block fresh. */
export async function logStreamStorageHeadroom(env: Env): Promise<void> {
    if (!validStreamConfig(env)) return;
    const usage = await streamProvider(env).readStorageUsage();
    const capacity = positiveIntegerVar(env.STREAM_STORAGE_MINUTES_CAPACITY)!;
    const cap = streamMaxDurationSeconds(env)!;
    console.info(formatLog('stream_storage_headroom', {
        totalStorageMinutes: usage.totalStorageMinutes,
        capacityMinutes: capacity,
        headroomMinutes: capacity - usage.totalStorageMinutes,
        uploadsThatFit: Math.max(0, Math.floor((capacity - usage.totalStorageMinutes) / (cap / 60))),
    }));
    await signalStreamAdmission(env, { storageMinutesUsed: usage.totalStorageMinutes });
}

/** Reads Stream's prepaid storage for a new lease; the admission object makes the decision. */
export async function readStreamStorage(
    env: Env,
    job: JobRecord,
): Promise<{ storageMinutesUsed: number; storageMinutesLimit: number | null }> {
    const usage = await (mediaProvider(env, job) as CloudflareStreamProvider).readStorageUsage();
    return { storageMinutesUsed: usage.totalStorageMinutes, storageMinutesLimit: usage.totalStorageMinutesLimit };
}

async function deleteStreamUpload(state: DurableObjectState, env: Env, job: JobRecord): Promise<JobRecord> {
    if (jobProviderKind(job) !== 'stream' || !job.assetId || job.providerDelete
        || env.LIVEPEER_PROVIDER_MUTATIONS_ENABLED !== 'true') return job;
    let outcome: NonNullable<JobRecord['providerDelete']>['outcome'];
    try {
        outcome = await mediaProvider(env, job).deleteAsset(job.assetId) === 'deleted' ? 'DELETED' : 'MISSING';
    } catch {
        outcome = 'AMBIGUOUS';
    }
    const record: JobRecord = {
        ...job,
        providerDelete: { assetIdSha256: await sha256Hex(job.assetId), outcome, attemptedAtMs: Date.now() },
    };
    await state.storage.put(JOB_KEY, record);
    console.info(formatLog('stream_upload_deleted', { outcome }));
    if (outcome === 'AMBIGUOUS') await closeAdmissionAfterAmbiguousDelete(env, record);
    return record;
}

export async function purgeExpiredWebhookDedup(state: DurableObjectState): Promise<void> {
    const cutoff = Date.now() - WEBHOOK_DEDUP_RETENTION_MS;
    const records = await state.storage.list<{ receivedAtMs?: unknown }>({
        prefix: 'webhook:',
        limit: LIFECYCLE_DELETE_BATCH,
    });
    const expired = [...records]
        .filter(([, record]) => !Number.isSafeInteger(record.receivedAtMs)
            || Number(record.receivedAtMs) <= cutoff)
        .map(([key]) => key);
    if (expired.length > 0) await state.storage.delete(expired);
}

export async function purgeExpiredControlNonces(state: DurableObjectState): Promise<void> {
    const now = Date.now();
    const records = await state.storage.list<number | { expiresAtMs?: unknown }>({
        prefix: 'nonce:',
        limit: LIFECYCLE_DELETE_BATCH,
    });
    const deadlines = [...records].map(([key, record]) => ({
        key,
        expiresAtMs: typeof record === 'number'
            ? record + CONTROL_MAX_FUTURE_MS
            : Number(record.expiresAtMs),
    }));
    const expired = deadlines
        .filter(({ expiresAtMs }) => !Number.isSafeInteger(expiresAtMs) || expiresAtMs <= now)
        .map(({ key }) => key);
    if (expired.length > 0) await state.storage.delete(expired);
    const pending = deadlines
        .filter(({ expiresAtMs }) => Number.isSafeInteger(expiresAtMs) && expiresAtMs > now)
        .map(({ expiresAtMs }) => expiresAtMs);
    if (records.size === LIFECYCLE_DELETE_BATCH && expired.length > 0) pending.push(now);
    if (pending.length > 0) await scheduleAlarmNoLaterThan(state, Math.min(...pending));
}

export async function scheduleTerminalArchive(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
): Promise<void> {
    await persistUploadVerificationResult(state);
    if (env.UPLOAD_JOB_ARCHIVE_ENABLED !== 'true'
        || !job.terminalArchive
        || job.terminalArchive.status === 'COMMITTED') return;
    await scheduleAlarmNoLaterThan(state, Math.max(Date.now(), job.terminalArchive.nextAttemptAtMs));
}

export async function advanceTerminalArchive(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
): Promise<void> {
    const metadata = job.terminalArchive;
    if (!metadata) return;
    const attempts = Math.min(metadata.attempts + 1, RECONCILE_BACKOFF_MS.length);
    try {
        if (!env.MARKET_READ_MODEL
            || env.NEAR_NETWORK !== 'testnet'
            || env.MARKET_CONTRACT_ID !== job.contractId) {
            throw new Error('upload_archive_unavailable');
        }
        const archive = await terminalUploadJobArchive(job);
        await commitUploadJobArchive(env.MARKET_READ_MODEL, archive);
        await state.storage.put(JOB_KEY, {
            ...job,
            terminalArchive: {
                ...metadata,
                status: 'COMMITTED',
                attempts,
                archiveSha256: archive.archiveSha256,
                committedAtMs: Date.now(),
                cleanupEligibleAtMs: archive.cleanupEligibleAtMs,
            },
        } satisfies JobRecord);
        console.info(formatLog('upload_job_archive_committed', {
            terminalState: job.state,
            attempts,
        }));
    } catch (error) {
        const code = safeErrorCode(error);
        const nextAttemptAtMs = Date.now() + RECONCILE_BACKOFF_MS[attempts - 1];
        await state.storage.put(JOB_KEY, {
            ...job,
            terminalArchive: {
                ...metadata,
                status: 'RETRY',
                attempts,
                nextAttemptAtMs,
            },
        } satisfies JobRecord);
        console.error(formatLog('upload_job_archive_failed', { code, attempts }));
        await state.storage.setAlarm(nextAttemptAtMs);
    }
}

async function terminalUploadJobArchive(job: JobRecord): Promise<UploadJobArchive> {
    if (job.network !== 'testnet'
        || !['CANCELLED', 'UPLOAD_EXPIRED', 'PROVIDER_FAILED'].includes(job.state)
        || !job.terminalAtMs
        || !job.terminalArchive) {
        throw new Error('upload_archive_unavailable');
    }
    const summary = {
        network: job.network,
        contractId: job.contractId,
        jobId: job.jobId,
        generation: job.generation,
        creatorId: job.creator,
        terminalState: job.state as UploadJobArchive['terminalState'],
        terminalAtMs: job.terminalAtMs,
        expectedSourceBytes: job.expectedSourceBytes,
        sourceFingerprintSha256: job.sourceFingerprintSha256 || null,
        assetIdSha256: job.assetId ? await sha256Hex(job.assetId) : null,
        projectIdSha256: job.projectId ? await sha256Hex(job.projectId) : null,
        archiveRequestedAtMs: job.terminalArchive.createdAtMs,
        cleanupEligibleAtMs: job.terminalAtMs + UPLOAD_JOB_RETENTION_MS,
    };
    return { ...summary, archiveSha256: await sha256Hex(canonicalJson(summary)) };
}

export async function advanceFinalization(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
): Promise<Response> {
    if (publicBetaDeadlineExpired(job)) {
        return expireJob(state, env, job);
    }
    if (isLegacyProfileJobOnMarketV2(env, job)) {
        return settleLegacyProfileJob(state, env, job);
    }
    if (!operatorJobAllowed(env, job.jobId, job.creator) || job.generation !== 1) {
        return json({ accepted: true, ignored: true }, 202);
    }
    const response = await forwardFinalize(env, job.publication!);
    if (!response.ok) {
        const attempts = Math.min(
            (job.finalizeRetry?.attempts || 0) + 1,
            RECONCILE_BACKOFF_MS.length,
        );
        const nextAttemptAtMs = Date.now() + RECONCILE_BACKOFF_MS[attempts - 1];
        const retry = {
            ...transitionJob(job, 'FINALIZE_RETRY'),
            finalizeRetry: {
                attempts,
                lastHttpStatus: response.status,
                nextAttemptAtMs,
            },
        };
        await state.storage.put(JOB_KEY, retry);
        logJobStateTransition(job.state, retry.state, job);
        await scheduleReconcile(state, nextAttemptAtMs);
        return response;
    }
    const result = await response.clone().json() as { finalized?: unknown };
    const nextState = result.finalized === true ? 'ONCHAIN_PUBLISHED' : 'FINALIZE_QUEUED';
    const { finalizeRetry: _retry, ...withoutRetry } = job;
    const record = transitionJob(withoutRetry, nextState);
    await state.storage.put(JOB_KEY, record);
    logJobStateTransition(job.state, record.state, job);
    await updateAdmission(env, record, nextState);
    if (record.state === 'ONCHAIN_PUBLISHED') {
        await ensureReconcileScheduled(state);
    } else {
        await scheduleReconcile(state, Date.now() + RECONCILE_BACKOFF_MS[0]);
    }
    return response;
}

async function expireJob(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
): Promise<Response> {
    if (jobProviderKind(job) === 'stream') {
        await terminateStreamJob(state, env, job, 'UPLOAD_EXPIRED', 'job_expired');
        return json({ accepted: true, expired: true }, 202);
    }
    const expired = transitionJob(job, 'UPLOAD_EXPIRED');
    await state.storage.put(JOB_KEY, expired);
    await scheduleTerminalArchive(state, env, expired);
    await updateAdmission(env, expired, 'UPLOAD_EXPIRED');
    return json({ accepted: true, expired: true }, 202);
}

// A job stored with the V1 profile id before the MC rename can never finalize on Market V2
// (assert_profile requires the neutral id and job.profile_id == submission.profile_id).
export function isLegacyProfileJobOnMarketV2(env: Env, job: JobRecord): boolean {
    return isMarketV2(env) && job.profileId === LEGACY_PROFILE_ID;
}

// States from which UPLOAD_EXPIRED is a legal transition before a publication exists.
const LEGACY_PROFILE_EXPIRABLE_STATES = new Set<JobState>([
    'AUTHORIZED', 'LEASED', 'PROVIDER_CREATE_PENDING', 'UPLOAD_READY', 'UPLOADING', 'PROCESSING',
]);

export async function expireLegacyProfileJob(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
): Promise<Response | null> {
    if (!isLegacyProfileJobOnMarketV2(env, job) || !LEGACY_PROFILE_EXPIRABLE_STATES.has(job.state)) return null;
    console.warn(formatLog('legacy_profile_job_expired', { fromState: job.state, generation: job.generation }));
    logJobStateTransition(job.state, 'UPLOAD_EXPIRED', job);
    return expireJob(state, env, job);
}

// Never forwards a finalization: a publication already final on chain is adopted, anything else expires.
export async function settleLegacyProfileJob(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
): Promise<Response> {
    let published = false;
    if (job.publication) {
        try {
            published = await finalPublicationMatches(env, job.publication);
        } catch (error) {
            if (safeErrorCode(error) !== 'near_finalize_mismatch') {
                // NEAR is unavailable: keep the job and read again later; nothing is signed.
                await scheduleReconcile(state, Date.now() + RECONCILE_BACKOFF_MS[0]);
                return json({ accepted: true, pending: true }, 202);
            }
        }
    }
    if (!published) {
        console.warn(formatLog('legacy_profile_job_expired', { fromState: job.state, generation: job.generation }));
        logJobStateTransition(job.state, 'UPLOAD_EXPIRED', job);
        return expireJob(state, env, job);
    }
    const { finalizeRetry: _retry, ...withoutRetry } = job;
    const record = transitionJob(withoutRetry, 'ONCHAIN_PUBLISHED');
    await state.storage.put(JOB_KEY, record);
    logJobStateTransition(job.state, record.state, job);
    await updateAdmission(env, record, 'ONCHAIN_PUBLISHED');
    await ensureReconcileScheduled(state);
    return json({ accepted: true, finalized: true });
}
