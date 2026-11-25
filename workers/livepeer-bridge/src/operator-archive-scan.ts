import {
    assertDurableObjectRecordCapacity,
    DURABLE_OBJECT_MAX_PERSISTENT_RECORDS,
} from './durable-object-capacity';
import { commitOperatorOutboxArchive, type OperatorOutboxArchive } from './operator-outbox-archive';
import type { Env } from './env';
import type { OutboxMethod, OperatorRecord, OperatorArchiveScan } from './types';
import {
    RECONCILE_BACKOFF_MS,
    OPERATOR_ARCHIVE_SCAN_KEY,
    SHA256_PATTERN,
    IDEMPOTENCY_PATTERN,
    OUTBOX_METHODS,
} from './constants';
import { formatLog, canonicalJson, sha256Hex, safeErrorCode, json } from './helpers';
import { validOperatorArchiveConfig } from './config';
import { scheduleAlarmNoLaterThan } from './alarm-schedule';

const OPERATOR_OUTBOX_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const OPERATOR_ARCHIVE_SCAN_BATCH = 32;

type OperatorOutboxStatus = {
    totalRecords: number;
    invalidRecords: number;
    confirmedRecords: number;
    pendingRecords: number;
    retryRecords: number;
    committedRecords: number;
    uncommittedRecords: number;
    eligibleRecords: number;
    scanActive: boolean;
};

function validOperatorOutboxRecord(key: string, value: unknown): value is OperatorRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Partial<OperatorRecord>;
    if (record.schema !== 'youtick.livepeer-operator-outbox.v1'
        || !['PENDING', 'RESERVED', 'SIGNED', 'BROADCAST', 'CONFIRMED'].includes(record.state || '')
        || !OUTBOX_METHODS.has(record.method as OutboxMethod)
        || typeof record.idempotencyKey !== 'string'
        || !IDEMPOTENCY_PATTERN.test(record.idempotencyKey)
        || key !== `outbox:${record.idempotencyKey}`
        || typeof record.payloadSha256 !== 'string'
        || !SHA256_PATTERN.test(record.payloadSha256)
        || !Number.isSafeInteger(record.createdAtMs)
        || Number(record.createdAtMs) <= 0) return false;
    if (record.state !== 'CONFIRMED') return true;
    const archive = record.archive;
    return Number.isSafeInteger(record.confirmedAtMs)
        && Number(record.confirmedAtMs) > 0
        && Boolean(archive)
        && ['PENDING', 'RETRY', 'COMMITTED'].includes(archive?.status || '')
        && Number.isSafeInteger(archive?.attempts)
        && Number(archive?.attempts) >= 0
        && Number.isSafeInteger(archive?.createdAtMs)
        && Number(archive?.createdAtMs) > 0
        && Number.isSafeInteger(archive?.nextAttemptAtMs)
        && Number(archive?.nextAttemptAtMs) > 0;
}

function summarizeOperatorOutbox(
    stored: Map<string, unknown>,
    scanActive: boolean,
    now: number,
): OperatorOutboxStatus {
    const records = [...stored].filter((entry): entry is [string, OperatorRecord] => (
        validOperatorOutboxRecord(entry[0], entry[1])
    )).map(([, record]) => record);
    const confirmed = records.filter((record) => record.state === 'CONFIRMED');
    const pending = confirmed.filter((record) => record.archive?.status === 'PENDING');
    const retry = confirmed.filter((record) => record.archive?.status === 'RETRY');
    const committed = confirmed.filter((record) => record.archive?.status === 'COMMITTED');
    const uncommitted = [...pending, ...retry];
    return {
        totalRecords: stored.size,
        invalidRecords: stored.size - records.length,
        confirmedRecords: confirmed.length,
        pendingRecords: pending.length,
        retryRecords: retry.length,
        committedRecords: committed.length,
        uncommittedRecords: uncommitted.length,
        eligibleRecords: uncommitted.filter((record) => record.archive!.nextAttemptAtMs <= now).length,
        scanActive,
    };
}

export async function readOperatorOutboxStatus(state: DurableObjectState): Promise<Response> {
    const [stored, scan] = await Promise.all([
        state.storage.list<unknown>({
            prefix: 'outbox:',
            limit: DURABLE_OBJECT_MAX_PERSISTENT_RECORDS,
        }),
        state.storage.get<OperatorArchiveScan>(OPERATOR_ARCHIVE_SCAN_KEY),
    ]);
    return json({
        schema: 'youtick.livepeer-operator-outbox-status.v1',
        ...summarizeOperatorOutbox(stored, Boolean(scan), Date.now()),
    });
}

export async function startOperatorOutboxArchiveScan(
    state: DurableObjectState,
    env: Env,
): Promise<Response> {
    if (!validOperatorArchiveConfig(env)) throw new Error('runtime_not_configured');
    const status = await state.storage.transaction(async (transaction) => {
        const stored = await transaction.list<unknown>({
            prefix: 'outbox:',
            limit: DURABLE_OBJECT_MAX_PERSISTENT_RECORDS,
        });
        const scan = await transaction.get<OperatorArchiveScan>(OPERATOR_ARCHIVE_SCAN_KEY);
        const current = summarizeOperatorOutbox(stored, Boolean(scan), Date.now());
        if (current.scanActive) throw new Error('operator_archive_scan_active');
        if (current.invalidRecords !== 0
            || current.uncommittedRecords !== 1
            || current.eligibleRecords !== 1) {
            throw new Error('operator_archive_eligible_count_invalid');
        }
        await assertDurableObjectRecordCapacity(
            transaction,
            [OPERATOR_ARCHIVE_SCAN_KEY],
            'operator',
        );
        await transaction.put(OPERATOR_ARCHIVE_SCAN_KEY, {} satisfies OperatorArchiveScan);
        return current;
    });
    await scheduleAlarmNoLaterThan(state, Date.now());
    return json({ accepted: true, eligibleRecords: status.eligibleRecords }, 202);
}

export async function advanceOperatorArchiveScan(
    state: DurableObjectState,
    env: Env,
): Promise<boolean> {
    if (env.OPERATOR_OUTBOX_ARCHIVE_ENABLED !== 'true') return false;
    const scan = await state.storage.get<OperatorArchiveScan>(OPERATOR_ARCHIVE_SCAN_KEY);
    if (!scan) return false;
    const now = Date.now();
    if (scan.after === undefined
        && scan.earliestRetryAtMs !== undefined
        && scan.earliestRetryAtMs > now) {
        await scheduleAlarmNoLaterThan(state, scan.earliestRetryAtMs);
        return true;
    }
    const records = await state.storage.list<OperatorRecord>({
        prefix: 'outbox:',
        startAfter: scan.after,
        limit: OPERATOR_ARCHIVE_SCAN_BATCH,
    });
    if (records.size === 0) {
        if (scan.earliestRetryAtMs !== undefined) {
            await state.storage.put(OPERATOR_ARCHIVE_SCAN_KEY, {
                earliestRetryAtMs: scan.earliestRetryAtMs,
            } satisfies OperatorArchiveScan);
            await scheduleAlarmNoLaterThan(state, scan.earliestRetryAtMs);
            return true;
        }
        await state.storage.delete(OPERATOR_ARCHIVE_SCAN_KEY);
        return scan.after !== undefined;
    }

    let earliestRetryAtMs = scan.after === undefined ? undefined : scan.earliestRetryAtMs;
    for (const [key, record] of records) {
        if (record.schema !== 'youtick.livepeer-operator-outbox.v1'
            || record.state !== 'CONFIRMED'
            || !record.archive
            || record.archive.status === 'COMMITTED') continue;
        if (record.archive.nextAttemptAtMs > now) {
            earliestRetryAtMs = Math.min(
                earliestRetryAtMs ?? record.archive.nextAttemptAtMs,
                record.archive.nextAttemptAtMs,
            );
            continue;
        }
        const retryAtMs = await advanceOperatorArchive(state, env, key, record);
        if (retryAtMs !== null) {
            earliestRetryAtMs = Math.min(earliestRetryAtMs ?? retryAtMs, retryAtMs);
        }
        await state.storage.transaction(async (transaction) => {
            await assertDurableObjectRecordCapacity(
                transaction,
                [OPERATOR_ARCHIVE_SCAN_KEY],
                'operator',
            );
            await transaction.put(OPERATOR_ARCHIVE_SCAN_KEY, {
                after: key,
                ...(earliestRetryAtMs === undefined ? {} : { earliestRetryAtMs }),
            } satisfies OperatorArchiveScan);
        });
        await scheduleAlarmNoLaterThan(state, now);
        return true;
    }

    const after = [...records.keys()].at(-1)!;
    if (records.size === OPERATOR_ARCHIVE_SCAN_BATCH) {
        await state.storage.transaction(async (transaction) => {
            await assertDurableObjectRecordCapacity(
                transaction,
                [OPERATOR_ARCHIVE_SCAN_KEY],
                'operator',
            );
            await transaction.put(OPERATOR_ARCHIVE_SCAN_KEY, {
                after,
                ...(earliestRetryAtMs === undefined ? {} : { earliestRetryAtMs }),
            } satisfies OperatorArchiveScan);
        });
        await scheduleAlarmNoLaterThan(state, now);
        return true;
    }
    if (earliestRetryAtMs !== undefined) {
        await state.storage.put(OPERATOR_ARCHIVE_SCAN_KEY, {
            earliestRetryAtMs,
        } satisfies OperatorArchiveScan);
        await scheduleAlarmNoLaterThan(state, earliestRetryAtMs);
        return true;
    }
    await state.storage.delete(OPERATOR_ARCHIVE_SCAN_KEY);
    return false;
}

async function advanceOperatorArchive(
    state: DurableObjectState,
    env: Env,
    key: string,
    record: OperatorRecord,
): Promise<number | null> {
    const metadata = record.archive;
    if (!metadata) return null;
    const attempts = Math.min(metadata.attempts + 1, RECONCILE_BACKOFF_MS.length);
    try {
        if (!validOperatorArchiveConfig(env)) throw new Error('operator_archive_unavailable');
        const archive = await operatorOutboxArchive(env, record);
        await commitOperatorOutboxArchive(env.MARKET_READ_MODEL!, archive);
        await state.storage.put(key, {
            ...record,
            archive: {
                ...metadata,
                status: 'COMMITTED',
                attempts,
                archiveSha256: archive.archiveSha256,
                committedAtMs: Date.now(),
                cleanupEligibleAtMs: archive.cleanupEligibleAtMs,
            },
        } satisfies OperatorRecord);
        return null;
    } catch (error) {
        const nextAttemptAtMs = Date.now() + RECONCILE_BACKOFF_MS[attempts - 1];
        await state.storage.put(key, {
            ...record,
            archive: {
                ...metadata,
                status: 'RETRY',
                attempts,
                nextAttemptAtMs,
            },
        } satisfies OperatorRecord);
        console.error(formatLog('operator_outbox_archive_failed', {
            code: safeErrorCode(error),
            attempts,
        }));
        return nextAttemptAtMs;
    }
}

async function operatorOutboxArchive(
    env: Env,
    record: OperatorRecord,
): Promise<OperatorOutboxArchive> {
    // Confirmed mark_watched records are deleted, never archived (persistConfirmedOperatorRecord).
    if (record.state !== 'CONFIRMED' || !record.confirmedAtMs || !record.archive
        || record.method === 'mark_watched' || record.method === 'release_expired') {
        throw new Error('operator_archive_unavailable');
    }
    const summary = {
        network: 'testnet' as const,
        contractId: env.MARKET_CONTRACT_ID!,
        operatorAccountId: env.NEAR_OPERATOR_ACCOUNT_ID!,
        operatorKeyEpoch: Number(env.NEAR_OPERATOR_KEY_EPOCH),
        idempotencyKey: record.idempotencyKey,
        method: record.method,
        payloadSha256: record.payloadSha256,
        txHash: record.txHash || null,
        createdAtMs: record.createdAtMs,
        confirmedAtMs: record.confirmedAtMs,
        archiveRequestedAtMs: record.archive.createdAtMs,
        cleanupEligibleAtMs: record.confirmedAtMs + OPERATOR_OUTBOX_RETENTION_MS,
    };
    return { ...summary, archiveSha256: await sha256Hex(canonicalJson(summary)) };
}
