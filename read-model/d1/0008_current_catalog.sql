-- Independent current-state catalogue; historical checkpoints and archives are unchanged.
CREATE TABLE current_catalog_state (
    network TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    verified_block_height INTEGER NOT NULL CHECK (verified_block_height > 0),
    verified_block_hash TEXT NOT NULL,
    source_block_timestamp_ms INTEGER NOT NULL CHECK (source_block_timestamp_ms > 0),
    checked_at_ms INTEGER NOT NULL,
    publication_count INTEGER NOT NULL CHECK (publication_count BETWEEN 0 AND 48),
    content_revision TEXT NOT NULL,
    PRIMARY KEY (network, contract_id)
);
CREATE TABLE current_publications (
    network TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    publication_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    title TEXT NOT NULL,
    generation INTEGER NOT NULL,
    price_usdc TEXT NOT NULL,
    playback_id TEXT NOT NULL,
    availability TEXT NOT NULL CHECK (availability IN ('ACTIVE', 'SALES_SUSPENDED', 'TAKEDOWN')),
    published_at_ms INTEGER NOT NULL,
    PRIMARY KEY (network, contract_id, publication_id),
    UNIQUE (network, contract_id, playback_id)
);
