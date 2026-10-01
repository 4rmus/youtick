-- Raises the current-state catalogue capacity from 48 to 95 publications, the most that fits the
-- 100-query catalogue share of the 995-query invocation budget. SQLite cannot alter a CHECK, so the
-- state table is rebuilt with identical column order (the writer inserts positionally) and its row is
-- copied unchanged. current_publications and every historical table are untouched.
CREATE TABLE current_catalog_state_v2 (
    network TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    verified_block_height INTEGER NOT NULL CHECK (verified_block_height > 0),
    verified_block_hash TEXT NOT NULL,
    source_block_timestamp_ms INTEGER NOT NULL CHECK (source_block_timestamp_ms > 0),
    checked_at_ms INTEGER NOT NULL,
    publication_count INTEGER NOT NULL CHECK (publication_count BETWEEN 0 AND 95),
    content_revision TEXT NOT NULL,
    PRIMARY KEY (network, contract_id)
);
INSERT INTO current_catalog_state_v2 (
    network, contract_id, verified_block_height, verified_block_hash,
    source_block_timestamp_ms, checked_at_ms, publication_count, content_revision
)
SELECT
    network, contract_id, verified_block_height, verified_block_hash,
    source_block_timestamp_ms, checked_at_ms, publication_count, content_revision
FROM current_catalog_state;
DROP TABLE current_catalog_state;
ALTER TABLE current_catalog_state_v2 RENAME TO current_catalog_state;
