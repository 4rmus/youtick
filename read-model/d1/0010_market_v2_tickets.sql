-- V2 Market tickets (contracts/market-v2, protocol/youtick-market-v2). Derived from final
-- ticket events; get_ticket stays authoritative (devices are not projected). No buyer account.
-- Index a V2 contract from its first block: status events for tickets this table has not seen
-- are skipped (here and in scripts/rebuild-market-read-model.mjs).
CREATE TABLE market_v2_tickets (
    network TEXT NOT NULL CHECK (network IN ('testnet', 'mainnet')),
    contract_id TEXT NOT NULL,
    ticket_id TEXT NOT NULL CHECK (length(ticket_id) = 64 AND ticket_id NOT GLOB '*[^0-9a-f]*'),
    publication_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    rail TEXT NOT NULL CHECK (rail IN ('crypto', 'card')),
    status TEXT NOT NULL CHECK (status IN ('purchased', 'watched', 'refunded', 'released', 'voided')),
    -- Crypto: USDC micro units. Card: provider minor units in `currency`.
    gross_amount TEXT NOT NULL CHECK (length(gross_amount) BETWEEN 1 AND 40 AND gross_amount NOT GLOB '*[^0-9]*'),
    currency TEXT NOT NULL CHECK (currency = 'USDC' OR currency GLOB '[A-Z][A-Z][A-Z]'),
    vat_usdc_micro TEXT NOT NULL CHECK (length(vat_usdc_micro) BETWEEN 1 AND 40 AND vat_usdc_micro NOT GLOB '*[^0-9]*'),
    platform_usdc_micro TEXT NOT NULL CHECK (length(platform_usdc_micro) BETWEEN 1 AND 40 AND platform_usdc_micro NOT GLOB '*[^0-9]*'),
    creator_usdc_micro TEXT NOT NULL CHECK (length(creator_usdc_micro) BETWEEN 1 AND 40 AND creator_usdc_micro NOT GLOB '*[^0-9]*'),
    purchased_at_ms INTEGER NOT NULL,
    settled_at_ms INTEGER,
    -- 1 only when the push to the creator failed and the share went to their contract balance
    -- (creator_payout_credited). A successful push emits no event and leaves 0.
    payout_credited_to_balance INTEGER NOT NULL DEFAULT 0 CHECK (payout_credited_to_balance IN (0, 1)),
    source_block_height INTEGER NOT NULL,
    PRIMARY KEY (network, contract_id, ticket_id)
);

CREATE INDEX market_v2_tickets_creator
    ON market_v2_tickets (network, contract_id, creator_id, status);

-- Release scheduling: purchased crypto tickets ordered by age.
CREATE INDEX market_v2_tickets_release_due
    ON market_v2_tickets (network, contract_id, rail, status, purchased_at_ms);
