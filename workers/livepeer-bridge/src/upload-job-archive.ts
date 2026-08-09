export type UploadJobArchive = {
    network: 'testnet';
    contractId: string;
    jobId: string;
    generation: number;
    creatorId: string;
    terminalState: 'CANCELLED' | 'UPLOAD_EXPIRED' | 'PROVIDER_FAILED';
    terminalAtMs: number;
    expectedSourceBytes: string;
    sourceFingerprintSha256: string | null;
    assetIdSha256: string | null;
    projectIdSha256: string | null;
    archiveRequestedAtMs: number;
    cleanupEligibleAtMs: number;
    archiveSha256: string;
};

export async function commitUploadJobArchive(
    database: D1Database,
    archive: UploadJobArchive,
): Promise<void> {
    const result = await database.prepare(`
        INSERT INTO upload_job_archives (
            network, contract_id, job_id, generation, creator_id,
            terminal_state, terminal_at_ms, expected_source_bytes,
            source_fingerprint_sha256, asset_id_sha256, project_id_sha256,
            archive_requested_at_ms, cleanup_eligible_at_ms, archive_sha256
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (network, contract_id, job_id, generation) DO NOTHING
    `).bind(
        archive.network,
        archive.contractId,
        archive.jobId,
        archive.generation,
        archive.creatorId,
        archive.terminalState,
        archive.terminalAtMs,
        archive.expectedSourceBytes,
        archive.sourceFingerprintSha256,
        archive.assetIdSha256,
        archive.projectIdSha256,
        archive.archiveRequestedAtMs,
        archive.cleanupEligibleAtMs,
        archive.archiveSha256,
    ).run();
    if (!result.success) throw new Error('upload_archive_unavailable');

    const stored = await database.prepare(`
        SELECT creator_id, terminal_state, terminal_at_ms,
               expected_source_bytes, source_fingerprint_sha256,
               asset_id_sha256, project_id_sha256, archive_requested_at_ms,
               cleanup_eligible_at_ms, archive_sha256
        FROM upload_job_archives
        WHERE network = ? AND contract_id = ? AND job_id = ? AND generation = ?
    `).bind(
        archive.network,
        archive.contractId,
        archive.jobId,
        archive.generation,
    ).first<Record<string, unknown>>();
    if (!stored) throw new Error('upload_archive_unavailable');
    const expected = {
        creator_id: archive.creatorId,
        terminal_state: archive.terminalState,
        terminal_at_ms: archive.terminalAtMs,
        expected_source_bytes: archive.expectedSourceBytes,
        source_fingerprint_sha256: archive.sourceFingerprintSha256,
        asset_id_sha256: archive.assetIdSha256,
        project_id_sha256: archive.projectIdSha256,
        archive_requested_at_ms: archive.archiveRequestedAtMs,
        cleanup_eligible_at_ms: archive.cleanupEligibleAtMs,
        archive_sha256: archive.archiveSha256,
    };
    if (Object.entries(expected).some(([key, value]) => stored[key] !== value)) {
        throw new Error('upload_archive_conflict');
    }
}
