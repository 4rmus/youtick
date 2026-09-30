-- Read-only account views (Sahne G12). Index only; no data change.
CREATE INDEX IF NOT EXISTS withdrawal_history_account
    ON withdrawal_history (network, contract_id, account_id, source_block_height DESC, withdrawal_id DESC);
