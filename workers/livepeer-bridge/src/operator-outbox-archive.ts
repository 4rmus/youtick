export type OperatorOutboxArchive = {
    network: 'testnet';
    contractId: string;
    operatorAccountId: string;
    operatorKeyEpoch: number;
    idempotencyKey: string;
    method: 'finalize_livepeer_publication' | 'suspend_livepeer_sales';
    payloadSha256: string;
    txHash: string | null;
    createdAtMs: number;
    confirmedAtMs: number;
    archiveRequestedAtMs: number;
    cleanupEligibleAtMs: number;
    archiveSha256: string;
};

export async function commitOperatorOutboxArchive(
    database: D1Database,
    archive: OperatorOutboxArchive,
): Promise<void> {
    const result = await database.prepare(`
        INSERT INTO operator_outbox_archives (
            network, contract_id, operator_account_id, operator_key_epoch,
            idempotency_key, method, payload_sha256, tx_hash, created_at_ms,
            confirmed_at_ms, archive_requested_at_ms, cleanup_eligible_at_ms,
            archive_sha256
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (
            network, contract_id, operator_account_id, operator_key_epoch,
            idempotency_key
        ) DO NOTHING
    `).bind(
        archive.network,
        archive.contractId,
        archive.operatorAccountId,
        archive.operatorKeyEpoch,
        archive.idempotencyKey,
        archive.method,
        archive.payloadSha256,
        archive.txHash,
        archive.createdAtMs,
        archive.confirmedAtMs,
        archive.archiveRequestedAtMs,
        archive.cleanupEligibleAtMs,
        archive.archiveSha256,
    ).run();
    if (!result.success) throw new Error('operator_archive_unavailable');

    const stored = await database.prepare(`
        SELECT method, payload_sha256, tx_hash, created_at_ms, confirmed_at_ms,
               archive_requested_at_ms, cleanup_eligible_at_ms, archive_sha256
        FROM operator_outbox_archives
        WHERE network = ? AND contract_id = ? AND operator_account_id = ?
          AND operator_key_epoch = ? AND idempotency_key = ?
    `).bind(
        archive.network,
        archive.contractId,
        archive.operatorAccountId,
        archive.operatorKeyEpoch,
        archive.idempotencyKey,
    ).first<Record<string, unknown>>();
    if (!stored) throw new Error('operator_archive_unavailable');
    const expected = {
        method: archive.method,
        payload_sha256: archive.payloadSha256,
        tx_hash: archive.txHash,
        created_at_ms: archive.createdAtMs,
        confirmed_at_ms: archive.confirmedAtMs,
        archive_requested_at_ms: archive.archiveRequestedAtMs,
        cleanup_eligible_at_ms: archive.cleanupEligibleAtMs,
        archive_sha256: archive.archiveSha256,
    };
    if (Object.entries(expected).some(([key, value]) => stored[key] !== value)) {
        throw new Error('operator_archive_conflict');
    }
}
