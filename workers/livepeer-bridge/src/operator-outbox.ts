import { KeyPairSigner, actions, baseDecode, baseEncode, createTransaction } from 'near-api-js';
import { assertDurableObjectRecordCapacity } from './durable-object-capacity';
import type { Env } from './env';
import type {
    JsonObject,
    JobRecord,
    OutboxMethod,
    OutboxInput,
    OutboxRecord,
    FinalizePublication,
    OperatorRecord,
    OperatorArchiveScan,
} from './types';
import {
    MAX_SOURCE_BYTES,
    RECONCILE_KEY,
    OPERATOR_ARCHIVE_SCAN_KEY,
    ACCOUNT_ID_PATTERN,
    JOB_ID_PATTERN,
    SHA256_PATTERN,
    IDEMPOTENCY_PATTERN,
    PROVIDER_ID_PATTERN,
    OUTBOX_METHODS,
} from './constants';
import {
    formatLog,
    requireObject,
    requireExactKeys,
    canonicalJson,
    sha256Hex,
    bytesToBase64,
    json,
} from './helpers';
import {
    isMarketV2,
    operatorOutboxMethods,
    finalizeMethod,
    suspendMethod,
    marketProfileId,
    isPublicTestnetEnvironment,
    operatorJobAllowed,
    validOperatorConfig,
} from './config';
import { operatorObjectName } from './object-names';
import {
    readFinalMediaJob,
    finalTicketStatus,
    sendTransaction,
    queryTransaction,
    finalPublicationMatches,
    finalPublicationSalesSuspended,
    nearRpc,
} from './near-rpc';
import { requirePublicUploadPolicy, publicUploadJobDeadline } from './public-testnet-beta';
import { supportedMediaProfile } from './provider-registry';
import { scheduleAlarmNoLaterThan } from './alarm-schedule';

type FinalizeInput = {
    idempotencyKey: string;
    payloadSha256: string;
    submission: FinalizePublication;
};
type SuspendSalesInput = {
    idempotencyKey: string;
    payloadSha256: string;
    publicationId: string;
};
type MarkWatchedInput = {
    idempotencyKey: string;
    payloadSha256: string;
    ticketId: string;
};
type ReleaseExpiredInput = {
    idempotencyKey: string;
    payloadSha256: string;
    ticketIds: string[];
};
const FINALIZE_GAS = 15_000_000_000_000n;
// mark_watched settles escrow and pushes the creator share (20 TGas transfer + 15 TGas callback).
const MARK_WATCHED_GAS = 100_000_000_000_000n;
// Up to 25 tickets: per-ticket state updates and events, no transfers.
const RELEASE_EXPIRED_GAS = 150_000_000_000_000n;
const RELEASE_BATCH_SIZE = 25;
const ESCROW_RELEASE_MS = 30 * 24 * 60 * 60 * 1000;
// A stored record written under a V1 method name maps to its Market V2 name.
const LEGACY_METHOD_ALIASES = new Map<OutboxMethod, OutboxMethod>([
    ['finalize_livepeer_publication', 'finalize_publication'],
    ['suspend_livepeer_sales', 'suspend_sales'],
]);
// Per-ticket settlements: the chain is the durable record, so confirmed records are deleted and
// never archived (the operator object's record budget must not grow with tickets).
const EPHEMERAL_OUTBOX_METHODS = new Set<OutboxMethod>(['mark_watched', 'release_expired']);
const TICKET_ID_PATTERN = /^[0-9a-f]{64}$/;

export async function enqueueSalesSuspension(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
    driftCode: string,
): Promise<void> {
    const idempotencyKey = `${job.jobId}:suspend-sales`;
    const key = `outbox:${idempotencyKey}`;
    const method = suspendMethod(env);
    const payloadSha256 = await sha256Hex(canonicalJson({
        method,
        publication_id: job.jobId,
        drift_code: driftCode,
    }));
    await state.storage.transaction(async (transaction) => {
        const existing = await transaction.get<OutboxRecord>(key);
        if (existing) return;
        await assertDurableObjectRecordCapacity(
            transaction,
            [key, RECONCILE_KEY],
            'upload_job',
        );
        await transaction.put(key, {
            schema: 'youtick.livepeer-control-outbox.v1',
            state: 'PENDING',
            idempotencyKey,
            method,
            jobId: job.jobId,
            generation: job.generation,
            payloadSha256,
            createdAtMs: Date.now(),
        } satisfies OutboxRecord);
    });
}

export async function tryProcessSalesSuspension(
    state: DurableObjectState,
    env: Env,
    job: JobRecord,
): Promise<void> {
    if (!operatorJobAllowed(env, job.jobId, job.creator) || job.generation !== 1) return;
    const key = `outbox:${job.jobId}:suspend-sales`;
    const record = await state.storage.get<OutboxRecord>(key);
    if (!record || record.state === 'CONFIRMED') return;
    try {
        const response = await forwardSalesSuspension(env, job.jobId);
        if (!response.ok) return;
        const result = await response.json() as { suspended?: unknown };
        if (result.suspended === true) {
            await state.storage.put(key, { ...record, state: 'CONFIRMED' });
        }
    } catch {
        // The durable alarm retry owns the next attempt; no provider or NEAR details are persisted.
    }
}

export function parseOutboxInput(value: JsonObject): OutboxInput {
    requireExactKeys(value, ['idempotencyKey', 'method', 'jobId', 'generation', 'payloadSha256'], 'invalid_outbox');
    if (typeof value.idempotencyKey !== 'string'
        || !IDEMPOTENCY_PATTERN.test(value.idempotencyKey)
        || typeof value.method !== 'string'
        || !OUTBOX_METHODS.has(value.method as OutboxMethod)
        || typeof value.jobId !== 'string'
        || !JOB_ID_PATTERN.test(value.jobId)
        || !Number.isSafeInteger(value.generation)
        || (value.generation as number) < 1
        || typeof value.payloadSha256 !== 'string'
        || !SHA256_PATTERN.test(value.payloadSha256)) {
        throw new Error('invalid_outbox');
    }
    return value as OutboxInput;
}

export function sameOutbox(left: OutboxRecord, right: OutboxRecord): boolean {
    return left.idempotencyKey === right.idempotencyKey
        && left.method === right.method
        && left.jobId === right.jobId
        && left.generation === right.generation
        && left.payloadSha256 === right.payloadSha256;
}

export async function forwardFinalize(env: Env, submission: FinalizePublication): Promise<Response> {
    if (!env.LIVEPEER_CONTROL || !validOperatorConfig(env)) throw new Error('runtime_not_configured');
    const signer = KeyPairSigner.fromSecretKey(env.NEAR_OPERATOR_PRIVATE_KEY as `ed25519:${string}`);
    const publicKey = (await signer.getPublicKey()).toString();
    const keyEpoch = Number(env.NEAR_OPERATOR_KEY_EPOCH);
    const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(
        operatorObjectName(env.NEAR_NETWORK!, publicKey, keyEpoch),
    ));
    const payloadSha256 = await sha256Hex(canonicalJson({ submission }));
    return object.fetch(new Request('https://object/internal/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            idempotencyKey: `${submission.job_id}:${submission.generation}:finalize`,
            payloadSha256,
            submission,
        }),
    }));
}

async function forwardSalesSuspension(env: Env, publicationId: string): Promise<Response> {
    if (!env.LIVEPEER_CONTROL || !validOperatorConfig(env)) throw new Error('runtime_not_configured');
    const signer = KeyPairSigner.fromSecretKey(env.NEAR_OPERATOR_PRIVATE_KEY as `ed25519:${string}`);
    const publicKey = (await signer.getPublicKey()).toString();
    const keyEpoch = Number(env.NEAR_OPERATOR_KEY_EPOCH);
    const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(
        operatorObjectName(env.NEAR_NETWORK!, publicKey, keyEpoch),
    ));
    const payloadSha256 = await sha256Hex(canonicalJson({ publication_id: publicationId }));
    return object.fetch(new Request('https://object/internal/suspend-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            idempotencyKey: `${publicationId}:suspend-sales`,
            payloadSha256,
            publicationId,
        }),
    }));
}

export async function forwardMarkWatched(env: Env, ticketId: string): Promise<Response> {
    if (!env.LIVEPEER_CONTROL || !validOperatorConfig(env)) throw new Error('runtime_not_configured');
    const signer = KeyPairSigner.fromSecretKey(env.NEAR_OPERATOR_PRIVATE_KEY as `ed25519:${string}`);
    const publicKey = (await signer.getPublicKey()).toString();
    const keyEpoch = Number(env.NEAR_OPERATOR_KEY_EPOCH);
    const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(
        operatorObjectName(env.NEAR_NETWORK!, publicKey, keyEpoch),
    ));
    const payloadSha256 = await sha256Hex(canonicalJson({ ticket_id: ticketId }));
    return object.fetch(new Request('https://object/internal/mark-watched', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: `${ticketId}:mark-watched`, payloadSha256, ticketId }),
    }));
}

export async function parseMarkWatchedInput(value: JsonObject): Promise<MarkWatchedInput> {
    requireExactKeys(value, ['idempotencyKey', 'payloadSha256', 'ticketId'], 'invalid_outbox');
    if (typeof value.ticketId !== 'string'
        || !TICKET_ID_PATTERN.test(value.ticketId)
        || value.idempotencyKey !== `${value.ticketId}:mark-watched`
        || typeof value.payloadSha256 !== 'string'
        || value.payloadSha256 !== await sha256Hex(canonicalJson({ ticket_id: value.ticketId }))) {
        throw new Error('invalid_outbox');
    }
    return value as MarkWatchedInput;
}

export async function processMarkWatchedOutbox(
    state: DurableObjectState,
    env: Env,
    input: MarkWatchedInput,
): Promise<Response> {
    if (!isMarketV2(env)) throw new Error('operator_unauthorized');
    const settled = async () => ['watched', 'watched_in_escrow', 'released'].includes(await finalTicketStatus(env, input.ticketId) || '');
    // Already watched or released tickets never create an outbox record.
    if (await settled()) return json({ accepted: true, watched: true, tx_hash: null }, 200);
    try {
        const result = await processOperatorOutbox(
            state,
            env,
            input,
            'mark_watched',
            { ticket_id: input.ticketId },
            settled,
        );
        return json({ accepted: true, watched: result.confirmed, tx_hash: result.txHash }, result.status);
    } catch (error) {
        if (error instanceof Error && error.message === 'near_finalize_failed') {
            const status = await finalTicketStatus(env, input.ticketId);
            // The contract refuses refunded or voided tickets and taken-down publications.
            if (!['purchased', 'watched', 'watched_in_escrow', 'released'].includes(status || '')) throw new Error('playback_denied');
            // Still purchased after a failed transaction: drop the record so the next play signs
            // a fresh transaction instead of reporting the old failure forever.
            if (status === 'purchased') {
                await state.storage.delete(`outbox:${input.idempotencyKey}`);
                throw new Error('playback_pending');
            }
        }
        throw error;
    }
}

async function releaseIdempotencyKey(ticketIds: string[]): Promise<string> {
    return `release:${await sha256Hex(ticketIds.join(','))}`;
}

async function forwardReleaseExpired(env: Env, ticketIds: string[]): Promise<Response> {
    if (!env.LIVEPEER_CONTROL || !validOperatorConfig(env)) throw new Error('runtime_not_configured');
    const signer = KeyPairSigner.fromSecretKey(env.NEAR_OPERATOR_PRIVATE_KEY as `ed25519:${string}`);
    const publicKey = (await signer.getPublicKey()).toString();
    const object = env.LIVEPEER_CONTROL.get(env.LIVEPEER_CONTROL.idFromName(
        operatorObjectName(env.NEAR_NETWORK!, publicKey, Number(env.NEAR_OPERATOR_KEY_EPOCH)),
    ));
    const sorted = [...ticketIds].sort();
    return object.fetch(new Request('https://object/internal/release-expired', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            idempotencyKey: await releaseIdempotencyKey(sorted),
            payloadSha256: await sha256Hex(canonicalJson({ ticket_ids: sorted })),
            ticketIds: sorted,
        }),
    }));
}

export async function parseReleaseExpiredInput(value: JsonObject): Promise<ReleaseExpiredInput> {
    requireExactKeys(value, ['idempotencyKey', 'payloadSha256', 'ticketIds'], 'invalid_outbox');
    const ids = value.ticketIds;
    if (!Array.isArray(ids)
        || ids.length < 1 || ids.length > RELEASE_BATCH_SIZE
        || ids.some((id, index) => typeof id !== 'string' || !TICKET_ID_PATTERN.test(id)
            || (index > 0 && id <= (ids[index - 1] as string)))
        || value.idempotencyKey !== await releaseIdempotencyKey(ids as string[])
        || typeof value.payloadSha256 !== 'string'
        || value.payloadSha256 !== await sha256Hex(canonicalJson({ ticket_ids: ids }))) {
        throw new Error('invalid_outbox');
    }
    return value as ReleaseExpiredInput;
}

export async function processReleaseExpiredOutbox(
    state: DurableObjectState,
    env: Env,
    input: ReleaseExpiredInput,
): Promise<Response> {
    if (!isMarketV2(env)) throw new Error('operator_unauthorized');
    // Confirmed once no ticket of the batch is still in escrow (released, or refunded meanwhile).
    const settled = async () => {
        for (const ticketId of input.ticketIds) {
            const status = await finalTicketStatus(env, ticketId);
            if (status === 'purchased' || status === 'watched_in_escrow') return false;
        }
        return true;
    };
    if (await settled()) return json({ accepted: true, released: true, tx_hash: null }, 200);
    try {
        const result = await processOperatorOutbox(
            state,
            env,
            input,
            'release_expired',
            { ticket_ids: input.ticketIds },
            settled,
        );
        return json({ accepted: true, released: result.confirmed, tx_hash: result.txHash }, result.status);
    } catch (error) {
        // A failed batch is retried by the next scheduled run with a fresh transaction.
        if (error instanceof Error && error.message === 'near_finalize_failed') {
            await state.storage.delete(`outbox:${input.idempotencyKey}`);
        }
        throw error;
    }
}

/**
 * Reads up to 25 crypto tickets still in escrow (purchased, or watched without settlement) older
 * than 30 days from the read model. Tickets of taken-down publications are excluded: the
 * contract skips them, and they would otherwise stay at the head of the queue.
 */
export async function dueReleaseTicketIds(env: Env, nowMs: number): Promise<string[]> {
    const result = await env.MARKET_READ_MODEL!.prepare(`
        SELECT t.ticket_id FROM market_v2_tickets AS t
        WHERE t.network = ? AND t.contract_id = ? AND t.rail = 'crypto'
          AND t.status IN ('purchased', 'watched') AND t.settled_at_ms IS NULL
          AND t.purchased_at_ms <= ?
          AND NOT EXISTS (
              SELECT 1 FROM publications AS p
              WHERE p.network = t.network AND p.contract_id = t.contract_id
                AND p.publication_id = t.publication_id AND p.availability = 'TAKEDOWN'
          )
        ORDER BY t.purchased_at_ms, t.ticket_id
        LIMIT ?
    `).bind(env.NEAR_NETWORK, env.MARKET_CONTRACT_ID, nowMs - ESCROW_RELEASE_MS, RELEASE_BATCH_SIZE)
        .all<{ ticket_id: string }>();
    return (result.results || [])
        .map((row) => row.ticket_id)
        .filter((id) => typeof id === 'string' && TICKET_ID_PATTERN.test(id));
}

export async function runScheduledRelease(env: Env, nowMs = Date.now()): Promise<{ released: number; status: number | null }> {
    if (!isMarketV2(env) || env.MARKET_V2_RELEASE_ENABLED !== 'true' || !env.MARKET_READ_MODEL) {
        return { released: 0, status: null };
    }
    const ticketIds = await dueReleaseTicketIds(env, nowMs);
    if (ticketIds.length === 0) return { released: 0, status: null };
    const response = await forwardReleaseExpired(env, ticketIds);
    console.info(formatLog('market_v2_release_scheduled', { tickets: ticketIds.length, status: response.status }));
    return { released: response.status === 200 ? ticketIds.length : 0, status: response.status };
}

export async function parseSuspendSalesInput(value: JsonObject): Promise<SuspendSalesInput> {
    requireExactKeys(value, ['idempotencyKey', 'payloadSha256', 'publicationId'], 'invalid_outbox');
    if (typeof value.publicationId !== 'string'
        || !JOB_ID_PATTERN.test(value.publicationId)
        || value.idempotencyKey !== `${value.publicationId}:suspend-sales`
        || typeof value.payloadSha256 !== 'string'
        || value.payloadSha256 !== await sha256Hex(canonicalJson({
            publication_id: value.publicationId,
        }))) {
        throw new Error('invalid_outbox');
    }
    return value as SuspendSalesInput;
}

export async function parseFinalizeInput(value: JsonObject, env: Env): Promise<FinalizeInput> {
    requireExactKeys(value, ['idempotencyKey', 'payloadSha256', 'submission'], 'invalid_finalize_request');
    const submission = requireObject(value.submission, 'invalid_finalize_request');
    requireExactKeys(submission, [
        'job_id', 'generation', 'creator_id', 'expected_source_bytes', 'profile_id',
        'profile_config_sha256', 'asset_id_hash', 'playback_id', 'project_id_hash',
        'verified_source_bytes', 'provider_source_fingerprint', 'ready_at_ms', 'availability',
    ], 'invalid_finalize_request');
    if (typeof submission.job_id !== 'string'
        || !JOB_ID_PATTERN.test(submission.job_id)
        || !Number.isSafeInteger(submission.generation)
        || (submission.generation as number) < 1
        || typeof submission.creator_id !== 'string'
        || !ACCOUNT_ID_PATTERN.test(submission.creator_id)
        || typeof submission.expected_source_bytes !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(submission.expected_source_bytes)
        || BigInt(submission.expected_source_bytes) > MAX_SOURCE_BYTES
        || submission.verified_source_bytes !== submission.expected_source_bytes
        || submission.profile_id !== marketProfileId(env)
        || !supportedMediaProfile(submission.profile_config_sha256)
        || typeof submission.asset_id_hash !== 'string'
        || !SHA256_PATTERN.test(submission.asset_id_hash)
        || typeof submission.playback_id !== 'string'
        || !PROVIDER_ID_PATTERN.test(submission.playback_id)
        || typeof submission.project_id_hash !== 'string'
        || !SHA256_PATTERN.test(submission.project_id_hash)
        || (submission.provider_source_fingerprint !== null
            && (typeof submission.provider_source_fingerprint !== 'string'
                || !SHA256_PATTERN.test(submission.provider_source_fingerprint)))
        || typeof submission.ready_at_ms !== 'string'
        || !/^[1-9][0-9]{0,19}$/.test(submission.ready_at_ms)
        || submission.availability !== 'ACTIVE') {
        throw new Error('invalid_finalize_request');
    }
    const typed = submission as FinalizePublication;
    if (value.idempotencyKey !== `${typed.job_id}:${typed.generation}:finalize`
        || typeof value.payloadSha256 !== 'string'
        || value.payloadSha256 !== await sha256Hex(canonicalJson({ submission: typed }))) {
        throw new Error('invalid_finalize_request');
    }
    return {
        idempotencyKey: value.idempotencyKey,
        payloadSha256: value.payloadSha256,
        submission: typed,
    } as FinalizeInput;
}

export async function processFinalizeOutbox(
    state: DurableObjectState,
    env: Env,
    input: FinalizeInput,
): Promise<Response> {
    if (!operatorJobAllowed(env, input.submission.job_id, input.submission.creator_id)
        || input.submission.generation !== 1) {
        throw new Error('operator_unauthorized');
    }
    if (isPublicTestnetEnvironment(env)) {
        await requirePublicUploadPolicy(env);
        const { job } = await readFinalMediaJob(env, input.submission.job_id);
        publicUploadJobDeadline(job);
        if (job.job_id !== input.submission.job_id || job.creator_id !== input.submission.creator_id
            || job.generation !== input.submission.generation
            || job.expected_source_bytes !== input.submission.expected_source_bytes
            || job.profile_id !== input.submission.profile_id
            || job.profile_config_sha256 !== input.submission.profile_config_sha256) {
            throw new Error('on_chain_job_mismatch');
        }
    }
    const result = await processOperatorOutbox(
        state,
        env,
        input,
        finalizeMethod(env),
        { submission: input.submission },
        () => finalPublicationMatches(env, input.submission),
    );
    return json({ accepted: true, finalized: result.confirmed, tx_hash: result.txHash }, result.status);
}

export async function processSuspendSalesOutbox(
    state: DurableObjectState,
    env: Env,
    input: SuspendSalesInput,
): Promise<Response> {
    if (!operatorJobAllowed(env, input.publicationId)) {
        throw new Error('operator_unauthorized');
    }
    if (isPublicTestnetEnvironment(env)) await requirePublicUploadPolicy(env);
    const result = await processOperatorOutbox(
        state,
        env,
        input,
        suspendMethod(env),
        { publication_id: input.publicationId },
        () => finalPublicationSalesSuspended(env, input.publicationId),
    );
    return json({ accepted: true, suspended: result.confirmed, tx_hash: result.txHash }, result.status);
}

async function processOperatorOutbox(
    state: DurableObjectState,
    env: Env,
    input: FinalizeInput | SuspendSalesInput | MarkWatchedInput | ReleaseExpiredInput,
    method: OutboxMethod,
    args: JsonObject,
    isConfirmed: () => Promise<boolean>,
): Promise<{ confirmed: boolean; txHash: string | null; status: number }> {
    if (!validOperatorConfig(env)) throw new Error('runtime_not_configured');
    const signer = KeyPairSigner.fromSecretKey(env.NEAR_OPERATOR_PRIVATE_KEY as `ed25519:${string}`);
    const publicKey = await signer.getPublicKey();
    const key = `outbox:${input.idempotencyKey}`;
    let legacyConfirmed = false as boolean;
    let record = await state.storage.transaction(async (transaction) => {
        const existing = await transaction.get<OperatorRecord>(key);
        if (existing) {
            if (existing.payloadSha256 !== input.payloadSha256) throw new Error('outbox_conflict');
            if (existing.method !== undefined && existing.method !== method) {
                // Records written under the V1 names before the MC rename (V2 testnet only).
                if (LEGACY_METHOD_ALIASES.get(existing.method) !== method) throw new Error('outbox_conflict');
                if (existing.state === 'CONFIRMED') {
                    // Already executed: idempotent success, the stored method stays as archived.
                    legacyConfirmed = true;
                    return existing;
                }
                // An unconfirmed legacy finalization can never land (old profile id); the guarded
                // advanceFinalization never retries it, so a new request for it is a conflict.
                if (method !== 'suspend_sales') throw new Error('outbox_conflict');
                // The payload hash is method-less; a signed V1-name transaction can only fail on the
                // MC contract, so it is dropped and the same record is re-signed under the new name.
                const rekeyed = normalizeOperatorRecord(clearSignedTransaction(existing), method);
                await transaction.put(key, rekeyed);
                return rekeyed;
            }
            const normalized = normalizeOperatorRecord(existing, method);
            await transaction.put(key, normalized);
            return normalized;
        }
        await assertDurableObjectRecordCapacity(transaction, [
            key,
            'operator:last-nonce',
            OPERATOR_ARCHIVE_SCAN_KEY,
        ], 'operator');
        const created: OperatorRecord = {
            schema: 'youtick.livepeer-operator-outbox.v1',
            state: 'PENDING',
            method,
            idempotencyKey: input.idempotencyKey,
            payloadSha256: input.payloadSha256,
            createdAtMs: Date.now(),
        };
        await transaction.put(key, created);
        return created;
    });
    if (legacyConfirmed) return { confirmed: true, txHash: record.txHash || null, status: 200 };

    if (await isConfirmed()) {
        record = await persistConfirmedOperatorRecord(state, env, key, record);
        return { confirmed: true, txHash: record.txHash || null, status: 200 };
    }

    if (isPublicTestnetEnvironment(env) && record.state === 'BROADCAST' && record.txHash) {
        const confirmed = await pollOperatorFinality(env, record.txHash, isConfirmed);
        if (confirmed) record = await persistConfirmedOperatorRecord(state, env, key, record);
        else if (record.nonce) console.warn(formatLog('operator_nonce_pending_observed', {
            method, state: record.state, ageMs: Math.max(0, Date.now() - record.createdAtMs),
        }));
        return { confirmed, txHash: record.txHash || null, status: confirmed ? 200 : 202 };
    }

    if (record.state === 'BROADCAST' && record.txHash) {
        const status = await queryTransaction(env, record.txHash);
        if (await isConfirmed()) {
            record = await persistConfirmedOperatorRecord(state, env, key, record);
            return { confirmed: true, txHash: record.txHash || null, status: 200 };
        }
        if (status === 'failed') throw new Error('near_finalize_failed');
        if (status === 'invalid_nonce') {
            record = clearSignedTransaction(record);
            await state.storage.put(key, record);
        }
    }

    if (env.LIVEPEER_OPERATOR_MUTATIONS_ENABLED !== 'true') {
        throw new Error('operator_mutations_disabled');
    }

    if (!record.signedTxBase64) {
        if (!record.nonce || !record.blockHash) {
            const accessKey = await readOperatorAccessKey(env, publicKey.toString());
            record = await state.storage.transaction(async (transaction) => {
                const current = await transaction.get<OperatorRecord>(key);
                if (!current) throw new Error('near_finalize_pending');
                if (current.nonce && current.blockHash) return current;
                const lastNonce = BigInt(await transaction.get<string>('operator:last-nonce') || '0');
                const nonce = (lastNonce > accessKey.nonce ? lastNonce : accessKey.nonce) + 1n;
                const reserved = {
                    ...current,
                    state: 'RESERVED' as const,
                    nonce: String(nonce),
                    blockHash: accessKey.blockHash,
                };
                await assertDurableObjectRecordCapacity(
                    transaction,
                    ['operator:last-nonce'],
                    'operator',
                );
                await transaction.put('operator:last-nonce', String(nonce));
                await transaction.put(key, reserved);
                return reserved;
            });
        }
        const transaction = createTransaction(
            env.NEAR_OPERATOR_ACCOUNT_ID!,
            publicKey,
            env.MARKET_CONTRACT_ID!,
            BigInt(record.nonce!),
            [actions.functionCall(
                method,
                args,
                method === 'mark_watched' ? MARK_WATCHED_GAS
                    : method === 'release_expired' ? RELEASE_EXPIRED_GAS : FINALIZE_GAS,
                0n,
            )],
            baseDecode(record.blockHash!),
        );
        const signed = await signer.signTransaction(transaction);
        record = {
            ...record,
            state: 'SIGNED',
            signedTxBase64: bytesToBase64(signed.signedTransaction.encode()),
            txHash: baseEncode(signed.txHash),
        };
        await state.storage.put(key, record);
    }

    if (isPublicTestnetEnvironment(env)) {
        // A lost response must enter read-only reconciliation, never another send.
        record = { ...record, state: 'BROADCAST' };
        await state.storage.put(key, record);
    }
    let broadcast: 'sent' | 'invalid_nonce' | 'failed' | 'unknown';
    try {
        broadcast = await sendTransaction(env, record.signedTxBase64!);
    } catch {
        broadcast = 'unknown';
    }
    record = { ...record, state: 'BROADCAST' };
    await state.storage.put(key, record);
    if (await isConfirmed()) {
        record = await persistConfirmedOperatorRecord(state, env, key, record);
        return { confirmed: true, txHash: record.txHash || null, status: 200 };
    }
    if (isPublicTestnetEnvironment(env)) {
        if (broadcast === 'failed' || broadcast === 'invalid_nonce') throw new Error('near_finalize_failed');
        const confirmed = await pollOperatorFinality(env, record.txHash!, isConfirmed);
        if (confirmed) record = await persistConfirmedOperatorRecord(state, env, key, record);
        else if (record.nonce) console.warn(formatLog('operator_nonce_pending_observed', {
            method, state: record.state, ageMs: Math.max(0, Date.now() - record.createdAtMs),
        }));
        return { confirmed, txHash: record.txHash || null, status: confirmed ? 200 : 202 };
    }
    if (broadcast === 'failed') throw new Error('near_finalize_failed');
    if (broadcast === 'invalid_nonce') {
        await state.storage.put(key, clearSignedTransaction(record));
    }
    if (broadcast !== 'invalid_nonce' && record.nonce) {
        console.warn(formatLog('operator_nonce_pending_observed', {
            method,
            state: record.state,
            ageMs: Math.max(0, Date.now() - record.createdAtMs),
        }));
    }
    return { confirmed: false, txHash: record.txHash || null, status: 202 };
}

async function pollOperatorFinality(env: Env, txHash: string, isConfirmed: () => Promise<boolean>): Promise<boolean> {
    for (const delay of [0, 250, 750]) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        const status = await queryTransaction(env, txHash).catch(() => 'unknown');
        if (await isConfirmed().catch(() => false)) return true;
        if (status === 'failed' || status === 'invalid_nonce') throw new Error('near_finalize_failed');
    }
    return false;
}

async function readOperatorAccessKey(
    env: Env,
    publicKey: string,
): Promise<{ nonce: bigint; blockHash: string }> {
    const payload = await nearRpc(env, {
        request_type: 'view_access_key',
        finality: 'final',
        account_id: env.NEAR_OPERATOR_ACCOUNT_ID,
        public_key: publicKey,
    });
    const result = requireObject(payload.result, 'runtime_not_configured');
    const permission = requireObject(result.permission, 'runtime_not_configured');
    const functionCall = requireObject(permission.FunctionCall, 'runtime_not_configured');
    const methodNames = functionCall.method_names;
    if (functionCall.receiver_id !== env.MARKET_CONTRACT_ID
        || typeof functionCall.allowance !== 'string'
        || !/^[1-9][0-9]*$/.test(functionCall.allowance)
        || !Array.isArray(methodNames)
        || methodNames.length !== operatorOutboxMethods(env).size
        || methodNames.some((method) => typeof method !== 'string' || !operatorOutboxMethods(env).has(method as OutboxMethod))
        || Array.from(operatorOutboxMethods(env)).some((method) => !methodNames.includes(method))
        || typeof result.nonce !== 'number'
        || !Number.isSafeInteger(result.nonce)
        || typeof result.block_hash !== 'string') {
        throw new Error('runtime_not_configured');
    }
    return { nonce: BigInt(result.nonce), blockHash: result.block_hash };
}

function clearSignedTransaction(record: OperatorRecord): OperatorRecord {
    const next = { ...record, state: 'PENDING' as const };
    delete next.nonce;
    delete next.blockHash;
    delete next.signedTxBase64;
    delete next.txHash;
    return next;
}

function normalizeOperatorRecord(record: OperatorRecord, method: OutboxMethod): OperatorRecord {
    return {
        schema: 'youtick.livepeer-operator-outbox.v1',
        state: record.state,
        method,
        idempotencyKey: record.idempotencyKey,
        payloadSha256: record.payloadSha256,
        createdAtMs: record.createdAtMs,
        ...(record.nonce === undefined ? {} : { nonce: record.nonce }),
        ...(record.blockHash === undefined ? {} : { blockHash: record.blockHash }),
        ...(record.signedTxBase64 === undefined ? {} : { signedTxBase64: record.signedTxBase64 }),
        ...(record.txHash === undefined ? {} : { txHash: record.txHash }),
        ...(record.confirmedAtMs === undefined ? {} : { confirmedAtMs: record.confirmedAtMs }),
        ...(record.archive === undefined ? {} : { archive: record.archive }),
    };
}

function confirmOperatorRecord(record: OperatorRecord): OperatorRecord {
    const confirmedAtMs = record.confirmedAtMs || Date.now();
    return {
        schema: 'youtick.livepeer-operator-outbox.v1',
        state: 'CONFIRMED',
        method: record.method,
        idempotencyKey: record.idempotencyKey,
        payloadSha256: record.payloadSha256,
        createdAtMs: record.createdAtMs,
        ...(record.txHash === undefined ? {} : { txHash: record.txHash }),
        confirmedAtMs,
        archive: record.archive || {
            status: 'PENDING',
            attempts: 0,
            createdAtMs: confirmedAtMs,
            nextAttemptAtMs: confirmedAtMs,
        },
    };
}

async function persistConfirmedOperatorRecord(
    state: DurableObjectState,
    env: Env,
    key: string,
    record: OperatorRecord,
): Promise<OperatorRecord> {
    const confirmed = confirmOperatorRecord(record);
    if (EPHEMERAL_OUTBOX_METHODS.has(confirmed.method)) {
        // One record per ticket would exhaust the operator object's record budget; the chain
        // (final ticket status) is the durable record, so confirmed settlements are not kept.
        await state.storage.delete(key);
        return confirmed;
    }
    await state.storage.put(key, confirmed);
    const archive = confirmed.archive;
    if (env.OPERATOR_OUTBOX_ARCHIVE_ENABLED === 'true'
        && archive
        && archive.status !== 'COMMITTED') {
        await state.storage.transaction(async (transaction) => {
            if (await transaction.get<OperatorArchiveScan>(OPERATOR_ARCHIVE_SCAN_KEY)) return;
            await assertDurableObjectRecordCapacity(
                transaction,
                [OPERATOR_ARCHIVE_SCAN_KEY],
                'operator',
            );
            await transaction.put(OPERATOR_ARCHIVE_SCAN_KEY, {} satisfies OperatorArchiveScan);
        });
        await scheduleAlarmNoLaterThan(
            state,
            Math.max(Date.now(), archive.nextAttemptAtMs),
        );
    }
    return confirmed;
}
