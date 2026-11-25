import { STREAM_TUS_URL_LIFETIME_MS } from './cloudflare-stream-provider';
import { assertDurableObjectRecordCapacity } from './durable-object-capacity';
import type { Env } from './env';
import type {
    JsonObject,
    JobRecord,
    AdmissionJobState,
    AdmissionReservation,
    AdmissionRecord,
    StreamReservation,
    StreamAdmissionState,
    AdmissionLease,
    AdmissionResolutionCode,
    AdmissionReopenInput,
} from './types';
import {
    LIFECYCLE_DELETE_BATCH,
    ADMISSION_KEY,
    ADMISSION_LEASE_HEARTBEAT_MS,
    ACCOUNT_ID_PATTERN,
    JOB_ID_PATTERN,
    SHA256_PATTERN,
    LEASE_ID_PATTERN,
    IDEMPOTENCY_PATTERN,
    IDENTIFIER_PATTERN,
} from './constants';
import { formatLog, requireExactKeys, safeErrorCode, json } from './helpers';
import {
    creatorAllowed,
    isPublicTestnetEnvironment,
    operationReservation,
    monthlyBudget,
    streamEnabled,
    positiveIntegerVar,
    streamMaxDurationSeconds,
} from './config';
import { admissionObjectName } from './object-names';
import { readFinalMediaJob } from './near-rpc';
import { publicUploadJobDeadline } from './public-testnet-beta';
import { jobProviderKind } from './provider-registry';

type AdmissionCandidate = {
    jobId: string;
    generation: number;
    creator: string;
    expectedSourceBytes: string;
    // Stream intents: the maxDurationSeconds the upload will book against prepaid storage.
    reservedSeconds?: number;
    storageMinutesUsed?: number;
    storageMinutesLimit?: number;
};
type AdmissionReopenRecord = AdmissionReopenInput & {
    schema: 'youtick.livepeer-admission-reopen.v1';
    reopenedAtMs: number;
};
// Stuck jobs counted in /__health: terminations in the last 24 hours (a gauge, not a lifetime total).
const STREAM_STUCK_WINDOW_MS = 24 * 60 * 60 * 1000;
const STREAM_STUCK_HISTORY = 32;
const ADMISSION_REOPEN_KEY_PREFIX = 'admission:reopen:';
const ADMISSION_GLOBAL_CONCURRENCY = 2;
const ADMISSION_CREATOR_DAILY_ATTEMPTS = 2;
const ADMISSION_AMBIGUOUS_TIMEOUT_MS = 15 * 60 * 1000;
const ADMISSION_LEASE_TTL_MS = 30 * 60 * 1000;
const ADMISSION_PROVIDER_FAILURE_LIMIT = 2;
const ADMISSION_PROVIDER_FAILURE_WINDOW_MS = 60 * 1000;
const ADMISSION_AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const ADMISSION_CLOSURE_CODES = new Set([
    'monthly_budget_exceeded',
    'provider_budget_or_inventory',
    'provider_unavailable',
    'create_ambiguous_timeout',
]);

const STREAM_SIGNAL_KEY = 'admission:stream-signal:v1';
type StreamSignalRecord = { lastWebhookAtMs?: number; storageMinutesUsed?: number; storageObservedAtMs?: number };

/** Best-effort observability signal into the admission object (never blocks the caller). */
export async function signalStreamAdmission(
    env: Env,
    signal: { lastWebhookAtMs?: number; storageMinutesUsed?: number },
): Promise<void> {
    if (!env.LIVEPEER_CONTROL || !env.NEAR_NETWORK || !env.MARKET_CONTRACT_ID) return;
    try {
        const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(
            admissionObjectName(env.NEAR_NETWORK, env.MARKET_CONTRACT_ID),
        ));
        await object.fetch(new Request('https://object/internal/admission/stream-signal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(signal),
        }));
    } catch {
        // Health freshness only; the webhook and cron outcomes do not depend on it.
    }
}

export async function recordStreamSignal(state: DurableObjectState, input: JsonObject): Promise<Response> {
    const keys = ['lastWebhookAtMs', 'storageMinutesUsed'].filter((key) => input[key] !== undefined);
    requireExactKeys(input, keys, 'invalid_outbox');
    if (keys.length === 0
        || (input.lastWebhookAtMs !== undefined && !Number.isSafeInteger(input.lastWebhookAtMs))
        || (input.storageMinutesUsed !== undefined
            && (typeof input.storageMinutesUsed !== 'number' || !Number.isFinite(input.storageMinutesUsed)
                || input.storageMinutesUsed < 0))) {
        throw new Error('invalid_outbox');
    }
    await state.storage.transaction(async (transaction) => {
        const previous = await transaction.get<StreamSignalRecord>(STREAM_SIGNAL_KEY);
        if (!previous) await assertDurableObjectRecordCapacity(transaction, [STREAM_SIGNAL_KEY], 'admission');
        await transaction.put(STREAM_SIGNAL_KEY, {
            ...previous,
            ...(input.lastWebhookAtMs !== undefined ? { lastWebhookAtMs: input.lastWebhookAtMs as number } : {}),
            ...(input.storageMinutesUsed !== undefined
                ? { storageMinutesUsed: input.storageMinutesUsed as number, storageObservedAtMs: Date.now() } : {}),
        } satisfies StreamSignalRecord);
    });
    return json({ accepted: true });
}

/** The public Stream block: only these six numbers, from the admission object (no quotas beyond them). */
export async function streamHealthBlock(env: Env): Promise<StreamHealthBlock> {
    const configured: StreamHealthBlock = {
        openReservedSeconds: null,
        reservationBudgetSeconds: positiveIntegerVar(env.STREAM_RESERVATION_SECONDS_BUDGET),
        storageMinutesUsed: null,
        storageMinutesCapacity: positiveIntegerVar(env.STREAM_STORAGE_MINUTES_CAPACITY),
        lastWebhookAtMs: null,
        stuckProcessingJobs: null,
        lastStuckAtMs: null,
    };
    if (!streamEnabled(env) || !env.LIVEPEER_CONTROL || !env.NEAR_NETWORK || !env.MARKET_CONTRACT_ID) return configured;
    try {
        const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(
            admissionObjectName(env.NEAR_NETWORK, env.MARKET_CONTRACT_ID),
        ));
        const response = await object.fetch(new Request('https://object/internal/admission/stream-status'));
        if (!response.ok) return configured;
        const value = await response.json() as Record<string, unknown>;
        const number = (key: keyof StreamHealthBlock) => typeof value[key] === 'number' && Number.isFinite(value[key])
            ? value[key] as number : null;
        return {
            openReservedSeconds: number('openReservedSeconds'),
            reservationBudgetSeconds: configured.reservationBudgetSeconds,
            storageMinutesUsed: number('storageMinutesUsed'),
            storageMinutesCapacity: configured.storageMinutesCapacity,
            lastWebhookAtMs: number('lastWebhookAtMs'),
            stuckProcessingJobs: number('stuckProcessingJobs'),
            lastStuckAtMs: number('lastStuckAtMs'),
        };
    } catch {
        return configured;
    }
}

type StreamHealthBlock = {
    openReservedSeconds: number | null;
    reservationBudgetSeconds: number | null;
    storageMinutesUsed: number | null;
    storageMinutesCapacity: number | null;
    lastWebhookAtMs: number | null;
    stuckProcessingJobs: number | null;
    lastStuckAtMs: number | null;
};

export async function readStreamAdmissionStatus(state: DurableObjectState, env: Env): Promise<Response> {
    const [record, signal] = await Promise.all([
        state.storage.get<AdmissionRecord>(ADMISSION_KEY),
        state.storage.get<StreamSignalRecord>(STREAM_SIGNAL_KEY),
    ]);
    const now = Date.now();
    const intentObservedAtMs = record?.stream?.storageObservedAtMs ?? -1;
    const signalObservedAtMs = signal?.storageObservedAtMs ?? -1;
    const storageMinutesUsed = signalObservedAtMs >= intentObservedAtMs
        ? signal?.storageMinutesUsed ?? record?.stream?.storageMinutesUsed
        : record?.stream?.storageMinutesUsed ?? signal?.storageMinutesUsed;
    return json({
        openReservedSeconds: Object.values(liveStreamReservations(record?.stream, now))
            .reduce((sum, entry) => sum + entry.seconds, 0),
        reservationBudgetSeconds: positiveIntegerVar(env.STREAM_RESERVATION_SECONDS_BUDGET),
        storageMinutesUsed: storageMinutesUsed ?? null,
        storageMinutesCapacity: positiveIntegerVar(env.STREAM_STORAGE_MINUTES_CAPACITY),
        lastWebhookAtMs: signal?.lastWebhookAtMs ?? null,
        stuckProcessingJobs: (record?.stream?.stuckAtMs ?? []).filter((at) => at > now - STREAM_STUCK_WINDOW_MS).length,
        lastStuckAtMs: record?.stream?.lastStuckAtMs ?? null,
    } satisfies StreamHealthBlock);
}

export async function requestAdmission(
    env: Env,
    job: JobRecord,
    stream?: { storageMinutesUsed?: number; storageMinutesLimit?: number | null },
): Promise<AdmissionLease> {
    if (!env.LIVEPEER_CONTROL) throw new Error('runtime_not_configured');
    const reservedSeconds = jobProviderKind(job) === 'stream' ? streamMaxDurationSeconds(env) : null;
    if (jobProviderKind(job) === 'stream' && reservedSeconds === null) throw new Error('runtime_not_configured');
    const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(
        admissionObjectName(job.network, job.contractId),
    ));
    const route = isPublicTestnetEnvironment(env) && job.assetId && job.tusEndpoint ? 'resume' : 'reserve';
    const response = await object.fetch(new Request(`https://object/internal/admission/${route}`, {
        method: 'POST',
        body: JSON.stringify({
            jobId: job.jobId,
            generation: job.generation,
            creator: job.creator,
            expectedSourceBytes: job.expectedSourceBytes,
            ...(reservedSeconds !== null ? { reservedSeconds } : {}),
            ...(stream?.storageMinutesUsed !== undefined ? { storageMinutesUsed: stream.storageMinutesUsed } : {}),
            ...(typeof stream?.storageMinutesLimit === 'number' ? { storageMinutesLimit: stream.storageMinutesLimit } : {}),
        }),
    }));
    if (!response.ok) {
        const result = await response.json() as { error?: unknown };
        throw new Error(result.error === 'admission_denied' || result.error === 'provider_admission_closed'
            ? result.error : 'admission_closed');
    }
    const result = await response.json() as Record<string, unknown>;
    if (typeof result.lease_id !== 'string'
        || !LEASE_ID_PATTERN.test(result.lease_id)
        || typeof result.expires_at_ms !== 'string'
        || !/^[1-9][0-9]{12,15}$/.test(result.expires_at_ms)
        || Number(result.expires_at_ms) <= Date.now()) {
        throw new Error('admission_closed');
    }
    return { leaseId: result.lease_id, expiresAtMs: Number(result.expires_at_ms) };
}

export async function closeAdmissionAfterAmbiguousDelete(env: Env, job: JobRecord): Promise<void> {
    if (!env.LIVEPEER_CONTROL) return;
    const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(
        admissionObjectName(job.network, job.contractId),
    ));
    await object.fetch(new Request('https://object/internal/admission/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.jobId, generation: job.generation, state: 'AUTO_CLOSED' }),
    }));
}

export async function heartbeatAdmissionLease(env: Env, job: JobRecord): Promise<AdmissionLease> {
    if (!env.LIVEPEER_CONTROL || !job.leaseId) throw new Error('runtime_not_configured');
    const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(
        admissionObjectName(job.network, job.contractId),
    ));
    const response = await object.fetch(new Request('https://object/internal/admission/heartbeat', {
        method: 'POST',
        body: JSON.stringify({
            jobId: job.jobId,
            generation: job.generation,
            leaseId: job.leaseId,
        }),
    }));
    if (!response.ok) {
        let code: unknown;
        try {
            code = (await response.clone().json() as { error?: unknown }).error;
        } catch {
            throw new Error('admission_closed');
        }
        if (response.status === 409 && code === 'admission_denied') {
            throw new Error('admission_denied');
        }
        throw new Error('admission_closed');
    }
    const result = await response.json() as Record<string, unknown>;
    if (result.lease_id !== job.leaseId
        || typeof result.expires_at_ms !== 'string'
        || !/^[1-9][0-9]{12,15}$/.test(result.expires_at_ms)
        || Number(result.expires_at_ms) <= Date.now()) {
        throw new Error('admission_denied');
    }
    return { leaseId: job.leaseId, expiresAtMs: Number(result.expires_at_ms) };
}

export async function updateAdmission(
    env: Env,
    job: JobRecord,
    state: AdmissionJobState | 'UPLOAD_EXPIRED' | 'PROVIDER_FAILED'
        | 'ONCHAIN_PUBLISHED' | 'AUTO_CLOSED' | 'CANCELLED'
        | 'PROVIDER_UNAVAILABLE',
    extra?: { durationSeconds?: number; reason?: 'stuck' },
): Promise<void> {
    if (!env.LIVEPEER_CONTROL) throw new Error('runtime_not_configured');
    const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(
        admissionObjectName(job.network, job.contractId),
    ));
    const response = await object.fetch(new Request('https://object/internal/admission/mark', {
        method: 'POST',
        body: JSON.stringify({
            jobId: job.jobId,
            generation: job.generation,
            state,
            ...(extra?.durationSeconds !== undefined && Number.isFinite(extra.durationSeconds) && extra.durationSeconds >= 0
                ? { durationSeconds: extra.durationSeconds } : {}),
            ...(extra?.reason ? { reason: extra.reason } : {}),
        }),
    }));
    if (!response.ok) throw new Error('admission_closed');
}

export async function tryAutoCloseAdmission(env: Env, job: JobRecord): Promise<void> {
    try {
        await updateAdmission(env, job, 'AUTO_CLOSED');
    } catch {
        // Reconciliation must retain its own alarm even if admission storage is unavailable.
    }
}

export async function preflightAdmission(
    state: DurableObjectState,
    env: Env,
    input: JsonObject,
): Promise<Response> {
    const candidate = parseAdmissionCandidate(input, 'invalid_upload_preflight');
    const jobReservationUsdMicros = operationReservation(env);
    const monthlyBudgetUsdMicros = monthlyBudget(env);
    if (!creatorAllowed(env, candidate.creator)
        || jobReservationUsdMicros === null
        || (!isPublicTestnetEnvironment(env) && monthlyBudgetUsdMicros === null)) {
        throw new Error('admission_closed');
    }
    const now = Date.now();
    const record = await state.storage.get<AdmissionRecord>(ADMISSION_KEY);
    try {
        if (planAdmission(
            record,
            candidate,
            now,
            jobReservationUsdMicros,
            monthlyBudgetUsdMicros,
            env,
        ).budgetExceeded) throw new Error('admission_closed');
    } catch (error) {
        const utcDay = new Date(now).toISOString().slice(0, 10);
        console.warn(formatLog('livepeer_upload_preflight_rejected', {
            code: safeErrorCode(error),
            admissionStatus: record?.status || 'OPEN',
            activeReservations: Object.keys(record?.reservations || {}).length,
            dailyGlobalAttempts: record?.daily.utcDay === utcDay ? record.daily.globalAttempts : 0,
            ...(error instanceof AdmissionDeniedError ? { reason: error.reason } : {}),
        }));
        if (error instanceof AdmissionDeniedError) {
            return json({
                error: 'admission_denied',
                reason: error.reason,
                ...(error.retryAtMs ? { retry_at_ms: error.retryAtMs } : {}),
            }, 409);
        }
        throw error;
    }
    return json({ available: true });
}

export async function reserveAdmission(
    state: DurableObjectState,
    env: Env,
    input: JsonObject,
): Promise<Response> {
    const candidate = parseAdmissionCandidate(input, 'invalid_outbox');
    if (!creatorAllowed(env, candidate.creator)) throw new Error('admission_closed');
    const jobReservationUsdMicros = operationReservation(env);
    const monthlyBudgetUsdMicros = monthlyBudget(env);
    if (jobReservationUsdMicros === null
        || (!isPublicTestnetEnvironment(env) && monthlyBudgetUsdMicros === null)) throw new Error('admission_closed');
    const now = Date.now();
    const result = await state.storage.transaction(async (transaction) => {
        const stored = await transaction.get<AdmissionRecord>(ADMISSION_KEY);
        await assertDurableObjectRecordCapacity(transaction, [ADMISSION_KEY], 'admission');
        const plan = planAdmission(
            stored,
            candidate,
            now,
            jobReservationUsdMicros,
            monthlyBudgetUsdMicros,
            env,
        );
        if (plan.budgetExceeded) {
            await transaction.put(ADMISSION_KEY, plan.record);
            return { record: plan.record, created: false, budgetExceeded: true };
        }
        if (!plan.created) {
            await transaction.put(ADMISSION_KEY, plan.record);
            return { record: plan.record, created: false, budgetExceeded: false };
        }
        const reservedBudgetUsdMicros = BigInt(plan.monthly.reservedBudgetUsdMicros)
            + jobReservationUsdMicros;
        const next: AdmissionRecord = {
            ...plan.record,
            reservations: {
                ...plan.record.reservations,
                [plan.reservationKey]: {
                    creator: candidate.creator,
                    expectedSourceBytes: candidate.expectedSourceBytes,
                    estimatedProviderCostUsdMicros: String(jobReservationUsdMicros),
                    state: 'CREATE_PENDING',
                    createdAtMs: now,
                    leaseId: crypto.randomUUID(),
                    expiresAtMs: now + ADMISSION_LEASE_TTL_MS,
                    lastHeartbeatAtMs: now,
                },
            },
            daily: {
                ...plan.daily,
                globalAttempts: plan.daily.globalAttempts + 1,
                creatorAttempts: {
                    ...plan.daily.creatorAttempts,
                    [candidate.creator]: (plan.daily.creatorAttempts[candidate.creator] || 0) + 1,
                },
            },
            monthly: {
                utcMonth: plan.monthly.utcMonth,
                reservedBudgetUsdMicros: String(reservedBudgetUsdMicros),
            },
            ...(candidate.reservedSeconds !== undefined ? {
                stream: withStreamReservations(plan.record.stream, {
                    ...liveStreamReservations(plan.record.stream, now),
                    [plan.reservationKey]: {
                        seconds: candidate.reservedSeconds,
                        createdAtMs: now,
                        expiresAtMs: now + STREAM_TUS_URL_LIFETIME_MS,
                    },
                }, candidate.storageMinutesUsed !== undefined
                    ? { storageMinutesUsed: candidate.storageMinutesUsed, storageObservedAtMs: now } : {}),
            } : {}),
        };
        await transaction.put(ADMISSION_KEY, next);
        return { record: next, created: true, budgetExceeded: false };
    });
    if (result.budgetExceeded) throw new Error('admission_closed');
    const lease = result.record.reservations[`${candidate.jobId}:${candidate.generation}`];
    if (!lease?.leaseId || !lease.expiresAtMs) throw new Error('admission_closed');
    await maintainAdmissionLifecycle(state);
    return json({
        accepted: true,
        created: result.created,
        lease_id: lease.leaseId,
        expires_at_ms: String(lease.expiresAtMs),
        heartbeat_interval_ms: ADMISSION_LEASE_HEARTBEAT_MS,
    });
}

export async function resumeAdmission(state: DurableObjectState, env: Env, input: JsonObject): Promise<Response> {
    if (!isPublicTestnetEnvironment(env)) throw new Error('admission_denied');
    const candidate = parseAdmissionCandidate(input, 'invalid_outbox');
    const { job } = await readFinalMediaJob(env, candidate.jobId);
    const deadline = publicUploadJobDeadline(job);
    if (job.status !== 'Authorized' || job.job_id !== candidate.jobId || job.creator_id !== candidate.creator
        || job.generation !== candidate.generation || job.expected_source_bytes !== candidate.expectedSourceBytes) {
        throw new Error('admission_denied');
    }
    const now = Date.now();
    const reservationKey = `${candidate.jobId}:${candidate.generation}`;
    const lease = await state.storage.transaction(async (transaction) => {
        const stored = await transaction.get<AdmissionRecord>(ADMISSION_KEY);
        if (!stored) throw new Error('admission_denied');
        const record = normalizeAdmissionLeases(stored, now);
        const existing = record.reservations[reservationKey];
        if (existing && (existing.creator !== candidate.creator || existing.expectedSourceBytes !== candidate.expectedSourceBytes
            || existing.state === 'CREATE_AMBIGUOUS')) throw new Error('admission_denied');
        if (!existing && (Object.keys(record.reservations).length >= 10
            || Object.values(record.reservations).some((entry) => entry.creator === candidate.creator))) {
            throw new Error('admission_denied');
        }
        const renewed: AdmissionReservation = {
            creator: candidate.creator, expectedSourceBytes: candidate.expectedSourceBytes,
            estimatedProviderCostUsdMicros: existing?.estimatedProviderCostUsdMicros || '0',
            state: 'UPLOADING', createdAtMs: existing?.createdAtMs ?? now,
            leaseId: existing?.leaseId || crypto.randomUUID(), expiresAtMs: Math.min(now + ADMISSION_LEASE_TTL_MS, deadline),
            lastHeartbeatAtMs: now,
        };
        // Reacquire a slot for the same existing asset; do not charge another job attempt or budget reservation.
        await transaction.put(ADMISSION_KEY, { ...record, reservations: { ...record.reservations, [reservationKey]: renewed } });
        return renewed;
    });
    await maintainAdmissionLifecycle(state);
    return json({ accepted: true, created: false, lease_id: lease.leaseId,
        expires_at_ms: String(lease.expiresAtMs), heartbeat_interval_ms: ADMISSION_LEASE_HEARTBEAT_MS });
}

function parseAdmissionCandidate(input: JsonObject, code: string): AdmissionCandidate {
    const optional = ['reservedSeconds', 'storageMinutesUsed', 'storageMinutesLimit'].filter((key) => input[key] !== undefined);
    requireExactKeys(input, ['jobId', 'generation', 'creator', 'expectedSourceBytes', ...optional], code);
    const minutes = (value: unknown) => value === undefined
        || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
    if ((input.reservedSeconds !== undefined
        && (!Number.isSafeInteger(input.reservedSeconds) || (input.reservedSeconds as number) < 1))
        || !minutes(input.storageMinutesUsed) || !minutes(input.storageMinutesLimit)) {
        throw new Error(code);
    }
    if (typeof input.jobId !== 'string'
        || !JOB_ID_PATTERN.test(input.jobId)
        || !Number.isSafeInteger(input.generation)
        || (input.generation as number) < 1
        || typeof input.creator !== 'string'
        || !ACCOUNT_ID_PATTERN.test(input.creator)
        || typeof input.expectedSourceBytes !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(input.expectedSourceBytes)) {
        throw new Error(code);
    }
    return {
        jobId: input.jobId,
        generation: input.generation as number,
        creator: input.creator,
        expectedSourceBytes: input.expectedSourceBytes,
        ...(input.reservedSeconds !== undefined ? { reservedSeconds: input.reservedSeconds as number } : {}),
        ...(input.storageMinutesUsed !== undefined ? { storageMinutesUsed: input.storageMinutesUsed as number } : {}),
        ...(input.storageMinutesLimit !== undefined ? { storageMinutesLimit: input.storageMinutesLimit as number } : {}),
    };
}

/** Stream reservations Stream may still hold: dropped at release or 24 h after creation at the latest. */
function liveStreamReservations(stream: StreamAdmissionState | undefined, now: number): Record<string, StreamReservation> {
    return Object.fromEntries(Object.entries(stream?.reservations ?? {}).filter(([, entry]) => entry.expiresAtMs > now));
}

function withStreamReservations(
    stream: StreamAdmissionState | undefined,
    reservations: Record<string, StreamReservation>,
    patch: Partial<StreamAdmissionState> = {},
): StreamAdmissionState {
    return {
        verifiedStorageSeconds: stream?.verifiedStorageSeconds ?? 0,
        ...stream,
        ...patch,
        reservations,
        openReservedSeconds: Object.values(reservations).reduce((sum, entry) => sum + entry.seconds, 0),
    };
}

type AdmissionDenialReason = 'active_upload' | 'daily_limit' | 'capacity' | 'source_too_large'
    | 'reservation_budget';

// Still reported as `admission_denied`; the reason and retry time are shown only to the
// creator asking for their own preflight. Capacity carries no time to avoid exposing others.
class AdmissionDeniedError extends Error {
    constructor(readonly reason: AdmissionDenialReason, readonly retryAtMs?: number) {
        super('admission_denied');
    }
}

function nextUtcDayMs(now: number): number {
    const next = new Date(now);
    next.setUTCHours(24, 0, 0, 0);
    return next.getTime();
}

function planAdmission(
    stored: AdmissionRecord | undefined,
    candidate: AdmissionCandidate,
    now: number,
    jobReservationUsdMicros: bigint,
    monthlyBudgetUsdMicros: bigint | null,
    env: Env,
): {
    record: AdmissionRecord;
    reservationKey: string;
    created: boolean;
    budgetExceeded: boolean;
    daily: AdmissionRecord['daily'];
    monthly: AdmissionRecord['monthly'];
} {
    if (isPublicTestnetEnvironment(env) && BigInt(candidate.expectedSourceBytes) > 5_000_000_000n) {
        throw new AdmissionDeniedError('source_too_large');
    }
    const utcDay = new Date(now).toISOString().slice(0, 10);
    const utcMonth = utcDay.slice(0, 7);
    let record = stored
        ? normalizeAdmissionLeases(stored, now)
        : emptyAdmissionRecord(utcDay, utcMonth);
    const reservationKey = `${candidate.jobId}:${candidate.generation}`;
    const existing = record.reservations[reservationKey];
    if (existing) {
        if (existing.creator !== candidate.creator
            || existing.expectedSourceBytes !== candidate.expectedSourceBytes) {
            throw new Error('admission_denied');
        }
        return {
            record,
            reservationKey,
            created: false,
            budgetExceeded: false,
            daily: record.daily,
            monthly: record.monthly,
        };
    }
    if (record.status === 'AUTO_CLOSED') {
        if (record.closure?.code !== 'monthly_budget_exceeded') {
            throw new Error('admission_closed');
        }
        if (monthlyBudgetUsdMicros !== null && record.monthly.utcMonth === utcMonth) {
            return {
                record,
                reservationKey,
                created: false,
                budgetExceeded: true,
                daily: record.daily,
                monthly: record.monthly,
            };
        }
        record = {
            schema: record.schema,
            status: 'OPEN',
            reservations: record.reservations,
            daily: record.daily,
            monthly: record.monthly,
            ...(record.stream ? { stream: record.stream } : {}),
        };
    }
    const daily = record.daily.utcDay === utcDay
        ? record.daily
        : { utcDay, globalAttempts: 0, creatorAttempts: {} };
    const monthly = record.monthly.utcMonth === utcMonth
        ? record.monthly
        : { utcMonth, reservedBudgetUsdMicros: '0' };
    const active = Object.values(record.reservations);
    const creatorLeases = active.filter((reservation) => reservation.creator === candidate.creator);
    if (creatorLeases.length > 0) {
        throw new AdmissionDeniedError('active_upload', Math.max(...creatorLeases.map(leaseDeadline)));
    }
    if ((daily.creatorAttempts[candidate.creator] || 0) >= ADMISSION_CREATOR_DAILY_ATTEMPTS) {
        throw new AdmissionDeniedError('daily_limit', nextUtcDayMs(now));
    }
    if (active.length >= (isPublicTestnetEnvironment(env) ? 10 : ADMISSION_GLOBAL_CONCURRENCY)) {
        throw new AdmissionDeniedError('capacity');
    }
    if (candidate.reservedSeconds !== undefined) {
        // Open Stream reservations plus this upload's cap must fit the reservation budget.
        const budget = positiveIntegerVar(env.STREAM_RESERVATION_SECONDS_BUDGET);
        const open = Object.entries(liveStreamReservations(record.stream, now))
            .filter(([key]) => key !== reservationKey)
            .reduce((sum, [, entry]) => sum + entry.seconds, 0);
        if (budget === null || open + candidate.reservedSeconds > budget) {
            console.warn(formatLog('stream_reservation_denied', {
                openReservedSeconds: open, reservedSeconds: candidate.reservedSeconds, budgetSeconds: budget,
            }));
            throw new AdmissionDeniedError('reservation_budget');
        }
        // Storage headroom, serialized with the budget: Stream's reported usage plus our open
        // reservations plus this cap must fit min(configured capacity, Stream's reported limit).
        // Deliberately conservative: if M0-P3 (U9/U25) shows totalStorageMinutes already includes
        // the reservations Stream books at URL creation, the open / 60 term is dropped.
        if (candidate.storageMinutesUsed !== undefined) {
            const configured = positiveIntegerVar(env.STREAM_STORAGE_MINUTES_CAPACITY);
            const capacity = Math.min(configured ?? 0, candidate.storageMinutesLimit ?? Number.POSITIVE_INFINITY);
            if (candidate.storageMinutesUsed + open / 60 + candidate.reservedSeconds / 60 > capacity) {
                console.warn(formatLog('provider_admission_closed', {
                    reason: 'stream_storage_headroom',
                    totalStorageMinutes: candidate.storageMinutesUsed,
                    openReservedMinutes: open / 60,
                    reservedMinutes: candidate.reservedSeconds / 60,
                    capacityMinutes: capacity,
                }));
                throw new Error('provider_admission_closed');
            }
        }
    }
    if (monthlyBudgetUsdMicros !== null
        && BigInt(monthly.reservedBudgetUsdMicros) + jobReservationUsdMicros > monthlyBudgetUsdMicros) {
        return {
            record: {
                ...record,
                status: 'AUTO_CLOSED',
                daily,
                monthly,
                closure: { code: 'monthly_budget_exceeded', observedAtMs: now },
            },
            reservationKey,
            created: false,
            budgetExceeded: true,
            daily,
            monthly,
        };
    }
    return { record, reservationKey, created: true, budgetExceeded: false, daily, monthly };
}

function normalizeAdmissionLeases(record: AdmissionRecord, now: number): AdmissionRecord {
    const reservations: Record<string, AdmissionReservation> = {};
    for (const [key, reservation] of Object.entries(record.reservations)) {
        const normalized = {
            ...reservation,
            leaseId: reservation.leaseId && LEASE_ID_PATTERN.test(reservation.leaseId)
                ? reservation.leaseId
                : crypto.randomUUID(),
            expiresAtMs: Number.isSafeInteger(reservation.expiresAtMs)
                ? reservation.expiresAtMs
                : reservation.createdAtMs + ADMISSION_LEASE_TTL_MS,
            lastHeartbeatAtMs: Number.isSafeInteger(reservation.lastHeartbeatAtMs)
                ? reservation.lastHeartbeatAtMs
                : reservation.createdAtMs,
        };
        if (now < leaseDeadline(normalized)) reservations[key] = normalized;
    }
    return { ...record, reservations };
}

function leaseDeadline(reservation: AdmissionReservation): number {
    return reservation.state === 'CREATE_AMBIGUOUS'
        ? (reservation.ambiguousAtMs || reservation.createdAtMs) + ADMISSION_AMBIGUOUS_TIMEOUT_MS
        : reservation.expiresAtMs || reservation.createdAtMs + ADMISSION_LEASE_TTL_MS;
}

export async function markAdmission(state: DurableObjectState, input: JsonObject): Promise<Response> {
    const optional = ['durationSeconds', 'reason'].filter((key) => input[key] !== undefined);
    requireExactKeys(input, ['jobId', 'generation', 'state', ...optional], 'invalid_outbox');
    if ((input.durationSeconds !== undefined
        && (typeof input.durationSeconds !== 'number' || !Number.isFinite(input.durationSeconds) || input.durationSeconds < 0))
        || (input.reason !== undefined && input.reason !== 'stuck')) {
        throw new Error('invalid_outbox');
    }
    if (typeof input.jobId !== 'string'
        || !JOB_ID_PATTERN.test(input.jobId)
        || !Number.isSafeInteger(input.generation)
        || (input.generation as number) < 1
        || !['CREATE_AMBIGUOUS', 'UPLOAD_READY', 'READY_VERIFIED', 'FINALIZE_QUEUED', 'UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'ONCHAIN_PUBLISHED', 'AUTO_CLOSED', 'CANCELLED', 'PROVIDER_UNAVAILABLE'].includes(String(input.state))) {
        throw new Error('invalid_outbox');
    }
    const reservationKey = `${input.jobId}:${input.generation}`;
    await state.storage.transaction(async (transaction) => {
        const stored = await transaction.get<AdmissionRecord>(ADMISSION_KEY);
        if (!stored) throw new Error('admission_closed');
        const record = releaseStreamReservation(stored, reservationKey, String(input.state), input);
        if (record !== stored) await transaction.put(ADMISSION_KEY, record);
        if (input.state === 'AUTO_CLOSED') {
            if (record.status === 'AUTO_CLOSED') return;
            await transaction.put(ADMISSION_KEY, {
                ...record,
                status: 'AUTO_CLOSED',
                closure: { code: 'provider_budget_or_inventory', observedAtMs: Date.now() },
            } satisfies AdmissionRecord);
            return;
        }
        const reservation = record.reservations[reservationKey];
        if (!reservation && ['UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'ONCHAIN_PUBLISHED', 'CANCELLED'].includes(String(input.state))) return;
        if (!reservation) throw new Error('admission_denied');
        const reservations = { ...record.reservations };
        if (input.state === 'PROVIDER_UNAVAILABLE') {
            if (reservation.state === 'CREATE_AMBIGUOUS') return;
            const now = Date.now();
            const previous = record.providerFailures;
            const consecutive = previous
                && now - previous.lastObservedAtMs
                    <= ADMISSION_PROVIDER_FAILURE_WINDOW_MS;
            const providerFailures = consecutive
                ? {
                    count: previous.count + 1,
                    firstObservedAtMs: previous.firstObservedAtMs,
                    lastObservedAtMs: now,
                }
                : { count: 1, firstObservedAtMs: now, lastObservedAtMs: now };
            const tripped = providerFailures.count >= ADMISSION_PROVIDER_FAILURE_LIMIT;
            reservations[reservationKey] = {
                ...reservation,
                state: 'CREATE_AMBIGUOUS',
                ambiguousAtMs: reservation.ambiguousAtMs || now,
            };
            await transaction.put(ADMISSION_KEY, {
                ...record,
                status: tripped ? 'AUTO_CLOSED' : record.status,
                reservations,
                providerFailures,
                closure: tripped
                    ? { code: 'provider_unavailable', observedAtMs: now }
                    : record.closure,
            } satisfies AdmissionRecord);
            return;
        }
        if (['UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'ONCHAIN_PUBLISHED', 'CANCELLED'].includes(String(input.state))) {
            delete reservations[reservationKey];
        } else {
            const ambiguousAtMs = input.state === 'CREATE_AMBIGUOUS'
                ? reservation.ambiguousAtMs || Date.now()
                : undefined;
            const heartbeatAtMs = Date.now();
            reservations[reservationKey] = {
                ...reservation,
                state: input.state as AdmissionJobState,
                ambiguousAtMs,
                expiresAtMs: input.state === 'CREATE_AMBIGUOUS'
                    ? reservation.expiresAtMs
                    : heartbeatAtMs + ADMISSION_LEASE_TTL_MS,
                lastHeartbeatAtMs: input.state === 'CREATE_AMBIGUOUS'
                    ? reservation.lastHeartbeatAtMs
                    : heartbeatAtMs,
            };
        }
        const next = { ...record, reservations };
        if (input.state === 'UPLOAD_READY') delete next.providerFailures;
        await transaction.put(ADMISSION_KEY, next);
    });
    await maintainAdmissionLifecycle(state);
    return json({ accepted: true });
}

// A Stream reservation is released at a terminal state or READY_VERIFIED (Stream then counts the
// real duration instead of the cap). READY_VERIFIED adds the duration once (only while the
// reservation is still held) as an informational counter; it never closes admission.
function releaseStreamReservation(
    record: AdmissionRecord,
    reservationKey: string,
    nextState: string,
    input: JsonObject,
): AdmissionRecord {
    const stuck = input.reason === 'stuck';
    const held = record.stream?.reservations[reservationKey];
    if (!record.stream || (!held && !stuck)
        || !['READY_VERIFIED', 'UPLOAD_EXPIRED', 'PROVIDER_FAILED', 'ONCHAIN_PUBLISHED', 'CANCELLED'].includes(nextState)) {
        return record;
    }
    const now = Date.now();
    const reservations = liveStreamReservations(record.stream, now);
    delete reservations[reservationKey];
    const duration = nextState === 'READY_VERIFIED' && held && typeof input.durationSeconds === 'number'
        ? Math.ceil(input.durationSeconds) : 0;
    const stuckAtMs = [...(record.stream.stuckAtMs ?? []), ...(stuck ? [now] : [])]
        .filter((at) => at > now - STREAM_STUCK_WINDOW_MS)
        .slice(-STREAM_STUCK_HISTORY);
    // verifiedStorageSeconds is informational only: the live storage-usage read at intent decides.
    const stream = withStreamReservations(record.stream, reservations, {
        verifiedStorageSeconds: record.stream.verifiedStorageSeconds + duration,
        stuckAtMs,
        ...(stuck ? { lastStuckAtMs: now } : {}),
    });
    return { ...record, stream };
}

export async function heartbeatAdmission(state: DurableObjectState, input: JsonObject): Promise<Response> {
    requireExactKeys(input, ['jobId', 'generation', 'leaseId'], 'invalid_outbox');
    if (typeof input.jobId !== 'string'
        || !JOB_ID_PATTERN.test(input.jobId)
        || !Number.isSafeInteger(input.generation)
        || (input.generation as number) < 1
        || typeof input.leaseId !== 'string'
        || !LEASE_ID_PATTERN.test(input.leaseId)) {
        throw new Error('invalid_outbox');
    }
    const now = Date.now();
    const reservationKey = `${input.jobId}:${input.generation}`;
    const result = await state.storage.transaction(async (transaction) => {
        const stored = await transaction.get<AdmissionRecord>(ADMISSION_KEY);
        if (!stored) return null;
        const record = normalizeAdmissionLeases(stored, now);
        const reservation = record.reservations[reservationKey];
        if (!reservation
            || reservation.state === 'CREATE_AMBIGUOUS'
            || reservation.leaseId !== input.leaseId) {
            await transaction.put(ADMISSION_KEY, record);
            return null;
        }
        const renewed = {
            ...reservation,
            state: 'UPLOADING' as const,
            expiresAtMs: now + ADMISSION_LEASE_TTL_MS,
            lastHeartbeatAtMs: now,
        };
        await transaction.put(ADMISSION_KEY, {
            ...record,
            reservations: { ...record.reservations, [reservationKey]: renewed },
        } satisfies AdmissionRecord);
        return renewed;
    });
    if (!result?.leaseId || !result.expiresAtMs) throw new Error('admission_denied');
    await maintainAdmissionLifecycle(state);
    return json({
        accepted: true,
        lease_id: result.leaseId,
        expires_at_ms: String(result.expiresAtMs),
        heartbeat_interval_ms: ADMISSION_LEASE_HEARTBEAT_MS,
    });
}

export async function maintainAdmissionLifecycle(state: DurableObjectState): Promise<void> {
    const now = Date.now();
    const record = await state.storage.get<AdmissionRecord>(ADMISSION_KEY);
    const activeRecord = record ? normalizeAdmissionLeases(record, now) : null;
    if (activeRecord) await state.storage.put(ADMISSION_KEY, activeRecord);
    const activeLeases = activeRecord
        ? Object.values(activeRecord.reservations).map((reservation) => ({
            deadline: leaseDeadline(reservation),
        }))
        : [];

    const audits = await state.storage.list<AdmissionReopenRecord>({
        prefix: ADMISSION_REOPEN_KEY_PREFIX,
        limit: LIFECYCLE_DELETE_BATCH,
    });
    const auditCutoff = now - ADMISSION_AUDIT_RETENTION_MS;
    const expiredAuditKeys = [...audits]
        .filter(([, audit]) => !Number.isSafeInteger(audit.reopenedAtMs)
            || audit.reopenedAtMs <= auditCutoff)
        .map(([key]) => key);
    if (expiredAuditKeys.length > 0) await state.storage.delete(expiredAuditKeys);

    const nextDeadlines = [
        ...activeLeases.map(({ deadline }) => deadline),
        ...[...audits]
            .filter(([key, audit]) => !expiredAuditKeys.includes(key)
                && Number.isSafeInteger(audit.reopenedAtMs))
            .map(([, audit]) => audit.reopenedAtMs + ADMISSION_AUDIT_RETENTION_MS),
    ];
    if (nextDeadlines.length > 0) await state.storage.setAlarm(Math.min(...nextDeadlines));
}

export async function reopenAdmission(state: DurableObjectState, input: JsonObject): Promise<Response> {
    const reopen = parseAdmissionReopenInput(input);
    const auditKey = `${ADMISSION_REOPEN_KEY_PREFIX}${reopen.idempotencyKey}`;
    const result = await state.storage.transaction(async (transaction) => {
        const existing = await transaction.get<AdmissionReopenRecord>(auditKey);
        if (existing) {
            if (!sameAdmissionReopen(existing, reopen)) throw new Error('admission_reopen_conflict');
            return { replayed: true };
        }
        const record = await transaction.get<AdmissionRecord>(ADMISSION_KEY);
        if (!record
            || record.status !== 'AUTO_CLOSED'
            || record.closure?.code !== reopen.closureCode
            || record.closure.observedAtMs !== reopen.closureObservedAtMs) {
            throw new Error('admission_reopen_denied');
        }
        await assertDurableObjectRecordCapacity(transaction, [auditKey], 'admission');
        const reservations = { ...record.reservations };
        if (reopen.jobId !== null && reopen.generation !== null) {
            const reservationKey = `${reopen.jobId}:${reopen.generation}`;
            if (reservations[reservationKey]?.state !== 'CREATE_AMBIGUOUS') {
                throw new Error('admission_reopen_denied');
            }
            delete reservations[reservationKey];
        }
        if (record.closure.code === 'provider_unavailable'
            && reopen.resolutionCode === 'INVENTORY_RECONCILED') {
            for (const [key, reservation] of Object.entries(reservations)) {
                if (reservation.state === 'CREATE_AMBIGUOUS') delete reservations[key];
            }
        }
        if (reopen.resolutionCode === 'BUDGET_WINDOW_ROLLED'
            && record.monthly.utcMonth === new Date().toISOString().slice(0, 7)) {
            throw new Error('admission_reopen_denied');
        }
        await transaction.put(ADMISSION_KEY, {
            schema: record.schema,
            status: 'OPEN',
            reservations,
            daily: record.daily,
            monthly: record.monthly,
            // An operator reopen restarts the informational counter from Stream's last reported usage.
            ...(record.stream ? {
                stream: {
                    ...record.stream,
                    verifiedStorageSeconds: record.stream.storageMinutesUsed !== undefined
                        ? Math.round(record.stream.storageMinutesUsed * 60) : 0,
                },
            } : {}),
        } satisfies AdmissionRecord);
        await transaction.put(auditKey, {
            schema: 'youtick.livepeer-admission-reopen.v1',
            ...reopen,
            reopenedAtMs: Date.now(),
        } satisfies AdmissionReopenRecord);
        return { replayed: false };
    });
    await maintainAdmissionLifecycle(state);
    return json({ accepted: true, reopened: true, replayed: result.replayed }, result.replayed ? 200 : 201);
}

export async function readAdmissionStatus(state: DurableObjectState, env: Env): Promise<Response> {
    const record = await state.storage.get<AdmissionRecord>(ADMISSION_KEY);
    const jobReservationUsdMicros = operationReservation(env);
    const monthlyBudgetUsdMicros = monthlyBudget(env);
    return json({
        schema: 'youtick.livepeer-admission-status.v1',
        status: record?.status || 'UNINITIALIZED',
        limits: {
            globalConcurrency: isPublicTestnetEnvironment(env) ? 10 : ADMISSION_GLOBAL_CONCURRENCY,
            creatorConcurrency: 1,
            creatorDailyAttempts: ADMISSION_CREATOR_DAILY_ATTEMPTS,
            ambiguousTimeoutMs: ADMISSION_AMBIGUOUS_TIMEOUT_MS,
            leaseTtlMs: ADMISSION_LEASE_TTL_MS,
            leaseHeartbeatMs: ADMISSION_LEASE_HEARTBEAT_MS,
            providerFailureLimit: ADMISSION_PROVIDER_FAILURE_LIMIT,
            providerFailureWindowMs: ADMISSION_PROVIDER_FAILURE_WINDOW_MS,
        },
        closure: record?.closure || null,
        providerFailures: record?.providerFailures || null,
        reservations: record?.reservations || {},
        daily: record?.daily || null,
        monthly: {
            current: record?.monthly || null,
            configuredBudgetUsdMicros: monthlyBudgetUsdMicros === null
                ? null
                : String(monthlyBudgetUsdMicros),
            configuredJobReservationUsdMicros: isPublicTestnetEnvironment(env)
                ? null : String(jobReservationUsdMicros || ''),
        },
    });
}

export function parseAdmissionReopenInput(input: JsonObject): AdmissionReopenInput {
    requireExactKeys(input, [
        'idempotencyKey',
        'operatorId',
        'closureCode',
        'closureObservedAtMs',
        'incidentId',
        'evidenceSha256',
        'resolutionCode',
        'jobId',
        'generation',
    ], 'invalid_admission_reopen');
    const resolutionCode = input.resolutionCode as AdmissionResolutionCode;
    const hasJob = typeof input.jobId === 'string' && Number.isSafeInteger(input.generation);
    const hasNoJob = input.jobId === null && input.generation === null;
    const jobResolution = resolutionCode === 'PROVIDER_ABSENCE_CONFIRMED'
        || resolutionCode === 'TUS_TERMINATION_CONFIRMED';
    const generalResolution = resolutionCode === 'INVENTORY_RECONCILED'
        || resolutionCode === 'BUDGET_WINDOW_ROLLED';
    if (typeof input.idempotencyKey !== 'string'
        || !IDEMPOTENCY_PATTERN.test(input.idempotencyKey)
        || typeof input.operatorId !== 'string'
        || !IDENTIFIER_PATTERN.test(input.operatorId)
        || typeof input.closureCode !== 'string'
        || !ADMISSION_CLOSURE_CODES.has(input.closureCode)
        || !Number.isSafeInteger(input.closureObservedAtMs)
        || (input.closureObservedAtMs as number) < 1
        || typeof input.incidentId !== 'string'
        || !IDENTIFIER_PATTERN.test(input.incidentId)
        || typeof input.evidenceSha256 !== 'string'
        || !SHA256_PATTERN.test(input.evidenceSha256)
        || (!jobResolution && !generalResolution)
        || (jobResolution && !hasJob)
        || (generalResolution && !hasNoJob)
        || (hasJob && (!JOB_ID_PATTERN.test(input.jobId as string)
            || (input.generation as number) < 1))) {
        throw new Error('invalid_admission_reopen');
    }
    if ((input.closureCode === 'monthly_budget_exceeded'
        && resolutionCode !== 'BUDGET_WINDOW_ROLLED')
        || (input.closureCode === 'create_ambiguous_timeout' && !jobResolution)
        || (input.closureCode === 'provider_budget_or_inventory'
            && resolutionCode === 'BUDGET_WINDOW_ROLLED')
        || (input.closureCode === 'provider_unavailable'
            && resolutionCode !== 'INVENTORY_RECONCILED')) {
        throw new Error('invalid_admission_reopen');
    }
    return input as unknown as AdmissionReopenInput;
}

function sameAdmissionReopen(left: AdmissionReopenRecord, right: AdmissionReopenInput): boolean {
    return left.idempotencyKey === right.idempotencyKey
        && left.operatorId === right.operatorId
        && left.closureCode === right.closureCode
        && left.closureObservedAtMs === right.closureObservedAtMs
        && left.incidentId === right.incidentId
        && left.evidenceSha256 === right.evidenceSha256
        && left.resolutionCode === right.resolutionCode
        && left.jobId === right.jobId
        && left.generation === right.generation;
}

function emptyAdmissionRecord(utcDay: string, utcMonth: string): AdmissionRecord {
    return {
        schema: 'youtick.livepeer-admission.v2',
        status: 'OPEN',
        reservations: {},
        daily: { utcDay, globalAttempts: 0, creatorAttempts: {} },
        monthly: { utcMonth, reservedBudgetUsdMicros: '0' },
    };
}
