-- Market V2 renamed its Bridge methods to provider-neutral names (gate MC, owner decision
-- 2026-10-22): finalize_publication and suspend_sales. The V1 names stay accepted because V1
-- Markets and existing rows keep them. SQLite cannot alter a CHECK, so the table is rebuilt with
-- identical column order (the writer inserts positionally), every row is copied unchanged, and
-- the cleanup index is recreated.
CREATE TABLE operator_outbox_archives_v2 (
    network TEXT NOT NULL CHECK (network = 'testnet'),
    contract_id TEXT NOT NULL,
    operator_account_id TEXT NOT NULL,
    operator_key_epoch INTEGER NOT NULL CHECK (operator_key_epoch > 0),
    idempotency_key TEXT NOT NULL,
    method TEXT NOT NULL CHECK (
        method IN (
            'finalize_publication', 'suspend_sales',
            'finalize_livepeer_publication', 'suspend_livepeer_sales'
        )
    ),
    payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
    tx_hash TEXT,
    created_at_ms INTEGER NOT NULL CHECK (created_at_ms > 0),
    confirmed_at_ms INTEGER NOT NULL CHECK (confirmed_at_ms >= created_at_ms),
    archive_requested_at_ms INTEGER NOT NULL CHECK (archive_requested_at_ms >= confirmed_at_ms),
    cleanup_eligible_at_ms INTEGER NOT NULL CHECK (
        cleanup_eligible_at_ms >= confirmed_at_ms + 7776000000
    ),
    archive_sha256 TEXT NOT NULL CHECK (length(archive_sha256) = 64),
    PRIMARY KEY (
        network, contract_id, operator_account_id, operator_key_epoch,
        idempotency_key
    )
);
INSERT INTO operator_outbox_archives_v2 (
    network, contract_id, operator_account_id, operator_key_epoch, idempotency_key, method,
    payload_sha256, tx_hash, created_at_ms, confirmed_at_ms, archive_requested_at_ms,
    cleanup_eligible_at_ms, archive_sha256
)
SELECT
    network, contract_id, operator_account_id, operator_key_epoch, idempotency_key, method,
    payload_sha256, tx_hash, created_at_ms, confirmed_at_ms, archive_requested_at_ms,
    cleanup_eligible_at_ms, archive_sha256
FROM operator_outbox_archives;
DROP TABLE operator_outbox_archives;
ALTER TABLE operator_outbox_archives_v2 RENAME TO operator_outbox_archives;
CREATE INDEX operator_outbox_archives_cleanup
    ON operator_outbox_archives (cleanup_eligible_at_ms);
