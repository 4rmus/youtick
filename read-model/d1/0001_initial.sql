PRAGMA foreign_keys = ON;

CREATE TABLE chain_events (
    network TEXT NOT NULL CHECK (network IN ('testnet', 'mainnet')),
    contract_id TEXT NOT NULL,
    block_height INTEGER NOT NULL CHECK (block_height > 0),
    block_hash TEXT NOT NULL,
    receipt_id TEXT NOT NULL,
    event_index INTEGER NOT NULL CHECK (event_index >= 0),
    event_name TEXT NOT NULL,
    event_version TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    block_timestamp_ms INTEGER NOT NULL CHECK (block_timestamp_ms > 0),
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    PRIMARY KEY (network, contract_id, block_height, receipt_id, event_index),
    UNIQUE (network, contract_id, event_name, idempotency_key)
);

CREATE TABLE finality_watermarks (
    network TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    block_height INTEGER NOT NULL,
    block_hash TEXT NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    PRIMARY KEY (network, contract_id)
);

CREATE TABLE media_jobs (
    network TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    generation INTEGER NOT NULL,
    expected_source_bytes TEXT NOT NULL,
    fee_asset TEXT NOT NULL,
    fee_amount TEXT NOT NULL,
    upload_public_key_sha256 TEXT,
    source_block_height INTEGER NOT NULL,
    PRIMARY KEY (network, contract_id, job_id)
);

CREATE TABLE publications (
    network TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    publication_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    title TEXT NOT NULL,
    generation INTEGER NOT NULL,
    price_usdc TEXT NOT NULL,
    playback_id TEXT NOT NULL,
    availability TEXT NOT NULL,
    published_at_ms INTEGER NOT NULL,
    source_block_height INTEGER NOT NULL,
    PRIMARY KEY (network, contract_id, publication_id)
);

CREATE TABLE viewer_entitlements (
    network TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    publication_id TEXT NOT NULL,
    source_block_height INTEGER NOT NULL,
    PRIMARY KEY (network, contract_id, account_id, publication_id)
);

CREATE TABLE sale_ledger (
    network TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    account_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    publication_id TEXT NOT NULL,
    asset TEXT NOT NULL,
    amount TEXT NOT NULL,
    creator_amount TEXT NOT NULL,
    platform_amount TEXT NOT NULL,
    source_block_height INTEGER NOT NULL,
    PRIMARY KEY (network, contract_id, idempotency_key)
);

CREATE TABLE withdrawal_history (
    network TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    withdrawal_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    asset TEXT NOT NULL,
    amount TEXT NOT NULL,
    status TEXT NOT NULL,
    reason_code TEXT,
    source_block_height INTEGER NOT NULL,
    PRIMARY KEY (network, contract_id, withdrawal_id)
);

CREATE TABLE governance_audit (
    network TEXT NOT NULL,
    contract_id TEXT NOT NULL,
    event_name TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    source_block_height INTEGER NOT NULL,
    PRIMARY KEY (network, contract_id, event_name, idempotency_key)
);

CREATE INDEX publications_creator
    ON publications (network, contract_id, creator_id, source_block_height DESC);
CREATE INDEX sale_ledger_creator
    ON sale_ledger (network, contract_id, creator_id, source_block_height DESC);
