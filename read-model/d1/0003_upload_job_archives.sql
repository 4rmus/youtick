CREATE TABLE upload_job_archives (
    network TEXT NOT NULL CHECK (network = 'testnet'),
    contract_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    generation INTEGER NOT NULL CHECK (generation > 0),
    creator_id TEXT NOT NULL,
    terminal_state TEXT NOT NULL CHECK (
        terminal_state IN ('CANCELLED', 'UPLOAD_EXPIRED', 'PROVIDER_FAILED')
    ),
    terminal_at_ms INTEGER NOT NULL CHECK (terminal_at_ms > 0),
    expected_source_bytes TEXT NOT NULL,
    source_fingerprint_sha256 TEXT,
    asset_id_sha256 TEXT,
    project_id_sha256 TEXT,
    archive_requested_at_ms INTEGER NOT NULL CHECK (archive_requested_at_ms > 0),
    cleanup_eligible_at_ms INTEGER NOT NULL CHECK (
        cleanup_eligible_at_ms >= terminal_at_ms + 1209600000
    ),
    archive_sha256 TEXT NOT NULL CHECK (length(archive_sha256) = 64),
    PRIMARY KEY (network, contract_id, job_id, generation)
);

CREATE INDEX upload_job_archives_cleanup
    ON upload_job_archives (cleanup_eligible_at_ms);
