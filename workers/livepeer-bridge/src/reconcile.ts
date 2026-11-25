import type { SourceBytesEvidence, VerificationMode } from './media-provider';
import { assertDurableObjectRecordCapacity } from './durable-object-capacity';
import type { Env } from './env';
import type { JobRecord, ReconcileRecord, FinalizePublication } from './types';
import {
    JOB_KEY,
    RECONCILE_KEY,
    RECONCILE_HEALTHY_INTERVAL_MS,
    RECONCILE_CONFIRMATION_MS,
    RECONCILE_BACKOFF_MS,
} from './constants';
import { canonicalJson, safeErrorCode } from './helpers';
import { operatorJobAllowed, validStreamConfig, validStudioVerificationConfig } from './config';
import { readFinalPublication, publicationMatches } from './near-rpc';
import { publicBetaDeadlineExpired } from './public-testnet-beta';
import { mediaProvider, jobProviderKind } from './provider-registry';
import { scheduleReconcile } from './alarm-schedule';
import { tryAutoCloseAdmission } from './admission';
import { enqueueSalesSuspension, tryProcessSalesSuspension } from './operator-outbox';

const STRONG_PROVIDER_DRIFT_CODES = new Set([
    'provider_asset_missing',
    'provider_identity_mismatch',
    'provider_playback_exposed',
    'provider_playback_mismatch',
    'provider_playback_missing',
    'provider_state_invalid',
    'provider_verification_budget_exceeded',
]);
const PROVIDER_INVENTORY_DRIFT_CODES = new Set([
    'provider_asset_missing',
    'provider_identity_mismatch',
    'provider_playback_missing',
    'provider_publication_mismatch',
]);

export async function reconcilePublishedJob(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
): Promise<void> {
    await tryProcessSalesSuspension(state, env, job);
    try {
        const verified = await verifyReadyProviderAsset(state, env, job, 'published');
        if (!verified) return;
        if (canonicalJson(verified.publication) !== canonicalJson(job.publication)) {
            await persistDriftReconcile(state, env, job, 'provider_publication_mismatch');
            return;
        }
    } catch (error) {
        const code = safeErrorCode(error);
        if (!STRONG_PROVIDER_DRIFT_CODES.has(code)) {
            await persistUnknownReconcile(state, 'PROVIDER_UNKNOWN');
            return;
        }
        await persistDriftReconcile(state, env, job, code);
        return;
    }

    try {
        const publication = await readFinalPublication(env, job.publication!);
        if (!publication
            || !publicationMatches(job.publication!, publication)
            || !['ACTIVE', 'SALES_SUSPENDED'].includes(String(publication.availability))) {
            await persistDriftReconcile(state, env, job, 'near_publication_mismatch');
            return;
        }
    } catch (error) {
        if (safeErrorCode(error) === 'near_finalize_pending') {
            await persistUnknownReconcile(state, 'NEAR_UNKNOWN');
            return;
        }
        await persistDriftReconcile(state, env, job, 'near_publication_mismatch');
        return;
    }

    await persistHealthyReconcile(state);
}

export async function persistUnknownReconcile(
    state: DurableObjectState,
    status: 'PROVIDER_UNKNOWN' | 'NEAR_UNKNOWN',
): Promise<void> {
    const previous = await state.storage.get<ReconcileRecord>(RECONCILE_KEY);
    const consecutiveErrors = (previous?.consecutiveErrors || 0) + 1;
    const delay = RECONCILE_BACKOFF_MS[Math.min(consecutiveErrors - 1, RECONCILE_BACKOFF_MS.length - 1)];
    const nextReconcileAtMs = Date.now() + delay;
    await state.storage.put(RECONCILE_KEY, {
        schema: 'youtick.livepeer-reconcile.v1',
        status,
        consecutiveErrors,
        nextReconcileAtMs,
        lastGoodAtMs: previous?.lastGoodAtMs,
        lastDrift: previous?.lastDrift,
        salesSuspensionQueuedAtMs: previous?.salesSuspensionQueuedAtMs,
    } satisfies ReconcileRecord);
    await scheduleReconcile(state, nextReconcileAtMs);
}

export async function persistUploadVerificationResult(state: DurableObjectState, errorCode?: string): Promise<void> {
    const nextReadAtMs = await state.storage.transaction(async (transaction) => {
        const job = await transaction.get<JobRecord>(JOB_KEY);
        const previous = await transaction.get<ReconcileRecord>(RECONCILE_KEY);
        const code = job && ['UPLOAD_READY', 'UPLOADING', 'PROCESSING'].includes(job.state) ? errorCode : undefined;
        if (!previous && !code) return;
        await assertDurableObjectRecordCapacity(transaction, [RECONCILE_KEY], 'upload_job');
        const nextReconcileAtMs = code ? Math.min(
            Math.max(previous?.nextReconcileAtMs || 0, Date.now() + RECONCILE_CONFIRMATION_MS),
            job?.absoluteDeadlineAtMs ?? Number.MAX_SAFE_INTEGER,
        ) : previous!.nextReconcileAtMs;
        await transaction.put(RECONCILE_KEY, {
            ...previous,
            schema: 'youtick.livepeer-reconcile.v1',
            status: previous?.status || 'PROVIDER_UNKNOWN',
            consecutiveErrors: previous?.consecutiveErrors || 0,
            nextReconcileAtMs,
            uploadReadFailed: Boolean(code),
            uploadErrorCode: code,
        } satisfies ReconcileRecord);
        return code ? nextReconcileAtMs : undefined;
    });
    if (nextReadAtMs !== undefined) await scheduleReconcile(state, nextReadAtMs);
}

async function persistDriftReconcile(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
    code: string,
): Promise<void> {
    const now = Date.now();
    const previous = await state.storage.get<ReconcileRecord>(RECONCILE_KEY);
    const repeated = previous?.status === 'DRIFT_BLOCKED' && previous.lastDrift?.code === code;
    const lastDrift = repeated ? {
        ...previous.lastDrift!,
        lastObservedAtMs: now,
        observations: previous.lastDrift!.observations + 1,
    } : {
        code,
        firstObservedAtMs: now,
        lastObservedAtMs: now,
        observations: 1,
    };
    const confirmed = lastDrift.observations >= 2
        && now - lastDrift.firstObservedAtMs >= RECONCILE_CONFIRMATION_MS;
    const consecutiveErrors = (previous?.consecutiveErrors || 0) + 1;
    const delay = RECONCILE_BACKOFF_MS[Math.min(consecutiveErrors - 1, RECONCILE_BACKOFF_MS.length - 1)];
    const nextReconcileAtMs = now + delay;
    let salesSuspensionQueuedAtMs = previous?.salesSuspensionQueuedAtMs;
    if (PROVIDER_INVENTORY_DRIFT_CODES.has(code)) {
        await tryAutoCloseAdmission(env, job);
    }
    if (confirmed
        && !salesSuspensionQueuedAtMs
        && operatorJobAllowed(env, job.jobId, job.creator)
        && job.generation === 1
    ) {
        await enqueueSalesSuspension(state, env, job, code);
        salesSuspensionQueuedAtMs = now;
    }
    if (confirmed) await tryProcessSalesSuspension(state, env, job);
    await state.storage.put(RECONCILE_KEY, {
        schema: 'youtick.livepeer-reconcile.v1',
        status: 'DRIFT_BLOCKED',
        consecutiveErrors,
        nextReconcileAtMs,
        lastGoodAtMs: previous?.lastGoodAtMs,
        lastDrift,
        salesSuspensionQueuedAtMs,
    } satisfies ReconcileRecord);
    await scheduleReconcile(state, nextReconcileAtMs);
}

async function persistHealthyReconcile(state: DurableObjectState): Promise<void> {
    const now = Date.now();
    const previous = await state.storage.get<ReconcileRecord>(RECONCILE_KEY);
    const recovering = (previous?.lastDrift !== undefined && previous.status !== 'HEALTHY')
        || previous?.recovery !== undefined;
    if (recovering) {
        const recovery = previous?.recovery || { firstObservedAtMs: now, observations: 0 };
        const nextRecovery = { ...recovery, observations: recovery.observations + 1 };
        if (nextRecovery.observations < 2
            || now - nextRecovery.firstObservedAtMs < RECONCILE_CONFIRMATION_MS) {
            const nextReconcileAtMs = now + RECONCILE_CONFIRMATION_MS;
            await state.storage.put(RECONCILE_KEY, {
                schema: 'youtick.livepeer-reconcile.v1',
                status: 'DRIFT_BLOCKED',
                consecutiveErrors: 0,
                nextReconcileAtMs,
                lastGoodAtMs: previous?.lastGoodAtMs,
                lastDrift: previous?.lastDrift,
                recovery: nextRecovery,
                salesSuspensionQueuedAtMs: previous?.salesSuspensionQueuedAtMs,
            } satisfies ReconcileRecord);
            await scheduleReconcile(state, nextReconcileAtMs);
            return;
        }
    }
    const nextReconcileAtMs = now + RECONCILE_HEALTHY_INTERVAL_MS;
    await state.storage.put(RECONCILE_KEY, {
        schema: 'youtick.livepeer-reconcile.v1',
        status: 'HEALTHY',
        consecutiveErrors: 0,
        nextReconcileAtMs,
        lastGoodAtMs: now,
        lastDrift: previous?.lastDrift,
        salesSuspensionQueuedAtMs: previous?.salesSuspensionQueuedAtMs,
    } satisfies ReconcileRecord);
    await scheduleReconcile(state, nextReconcileAtMs);
}

type VerifiedPublication = {
    publication: FinalizePublication;
    // Byte proof to persist with READY_VERIFIED; only 'tus-offset' adapters return one.
    sourceBytesEvidence?: SourceBytesEvidence;
    // Media duration the adapter reported (Stream storage accounting).
    durationSeconds?: number;
};

export async function verifyReadyProviderAsset(
    state: DurableObjectState, env: Env, job: JobRecord, mode: VerificationMode,
): Promise<VerifiedPublication | null> {
    if (!(jobProviderKind(job) === 'stream' ? validStreamConfig(env) : validStudioVerificationConfig(env))
        || !job.assetId || !job.playbackId || !job.projectId) {
        throw new Error('runtime_not_configured');
    }
    if (job.state !== 'ONCHAIN_PUBLISHED' && publicBetaDeadlineExpired(job)) {
        throw new Error('provider_verification_incomplete');
    }
    try {
        const verified = await mediaProvider(env, job).verifyReadyAsset({
            jobId: job.jobId,
            generation: job.generation,
            expectedSourceBytes: job.expectedSourceBytes,
            profileConfigSha256: job.profileConfigSha256,
            assetId: job.assetId,
            playbackId: job.playbackId,
            projectId: job.projectId,
            expectedProjectId: jobProviderKind(job) === 'stream' ? env.STREAM_ACCOUNT_ID! : env.LIVEPEER_PROJECT_ID!,
            apiTokenName: job.apiTokenName,
            checkpoint: job.providerVerification,
            tusEndpoint: job.tusEndpoint,
            mode,
            storedEvidence: job.sourceBytesEvidence,
            ...(jobProviderKind(job) === 'stream' && job.providerCreate?.completedAtMs !== undefined
                ? { uploadCreatedAtMs: job.providerCreate.completedAtMs } : {}),
        });
        // A pending result may ask for a later look (Stream waits for its ladder); default 1 s.
        const continueAfterMs = 'pending' in verified && verified.retryAfterMs !== undefined
            ? verified.retryAfterMs : 1_000;
        const nextAtMs = job.state === 'ONCHAIN_PUBLISHED' ? Date.now() + continueAfterMs
            : Math.min(Date.now() + continueAfterMs, job.absoluteDeadlineAtMs ?? Number.MAX_SAFE_INTEGER);
        await state.storage.transaction(async (transaction) => {
            const current = await transaction.get<JobRecord>(JOB_KEY);
            // streamProgress is observability a concurrent Stream webhook may update mid-verification.
            if (!current || canonicalJson({ ...current, providerVerification: undefined, streamProgress: undefined })
                !== canonicalJson({ ...job, providerVerification: undefined, streamProgress: undefined })
                || current.state !== 'ONCHAIN_PUBLISHED' && publicBetaDeadlineExpired(current)) {
                throw new Error('provider_verification_incomplete');
            }
            if ('pending' in verified) {
                await assertDurableObjectRecordCapacity(transaction, [JOB_KEY, RECONCILE_KEY], 'upload_job');
                await transaction.put(JOB_KEY, { ...current, providerVerification: verified.checkpoint });
                const previous = await transaction.get<ReconcileRecord>(RECONCILE_KEY);
                await transaction.put(RECONCILE_KEY, {
                    ...previous, schema: 'youtick.livepeer-reconcile.v1', status: 'PROVIDER_UNKNOWN',
                    consecutiveErrors: previous?.consecutiveErrors || 0, nextReconcileAtMs: nextAtMs,
                    uploadReadFailed: false, uploadErrorCode: undefined,
                } satisfies ReconcileRecord);
            } else if (current.providerVerification || verified.sourceBytesEvidence) {
                const { providerVerification: _checkpoint, ...completed } = current;
                await transaction.put(JOB_KEY, verified.sourceBytesEvidence
                    ? { ...completed, sourceBytesEvidence: verified.sourceBytesEvidence } : completed);
            }
        });
        if ('pending' in verified) {
            await scheduleReconcile(state, nextAtMs);
            return null;
        }
        const publication: FinalizePublication = {
            job_id: job.jobId,
            generation: job.generation,
            creator_id: job.creator,
            expected_source_bytes: job.expectedSourceBytes,
            profile_id: job.profileId,
            profile_config_sha256: job.profileConfigSha256,
            asset_id_hash: verified.assetIdHash,
            playback_id: verified.playbackId,
            project_id_hash: verified.projectIdHash,
            verified_source_bytes: verified.verifiedSourceBytes,
            provider_source_fingerprint: verified.sourceFingerprint,
            ready_at_ms: verified.readyAtMs,
            availability: 'ACTIVE',
        };
        return {
            publication,
            ...(verified.sourceBytesEvidence ? { sourceBytesEvidence: verified.sourceBytesEvidence } : {}),
            ...(verified.durationSeconds !== undefined ? { durationSeconds: verified.durationSeconds } : {}),
        };
    } catch (error) {
        if (safeErrorCode(error) !== 'provider_unavailable') {
            await state.storage.transaction(async (transaction) => {
                const current = await transaction.get<JobRecord>(JOB_KEY);
                if (current?.providerVerification) {
                    const { providerVerification: _checkpoint, ...withoutCheckpoint } = current;
                    await transaction.put(JOB_KEY, withoutCheckpoint);
                }
            });
        }
        throw error;
    }
}
