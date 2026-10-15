-- Card path (roadmap E8). The card provider is the merchant of record; this database is youtick's
-- own order book and ledger for card purchases, not a read model. Market V2 stays the ticket
-- authority: the payment operator writes `issue_card_ticket` only after a verified provider
-- purchase event and `void_card_ticket` after a refund or a lost chargeback. A browser redirect
-- never changes an order. Stored per order: the publication, the ticket's public key and the
-- device binding the ticket key signed. No e-mail, name, IP or card data.
CREATE TABLE card_orders (
    order_id TEXT PRIMARY KEY CHECK (length(order_id) = 32 AND order_id NOT GLOB '*[^0-9a-f]*'),
    provider TEXT NOT NULL,
    -- The provider's own order id; on chain only as payment_reference_hmac.
    provider_order_id TEXT NOT NULL,
    payment_reference_hmac TEXT NOT NULL CHECK (length(payment_reference_hmac) = 64),
    publication_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    ticket_id TEXT NOT NULL CHECK (length(ticket_id) = 64 AND ticket_id NOT GLOB '*[^0-9a-f]*'),
    ticket_public_key TEXT NOT NULL,
    gross_minor INTEGER NOT NULL CHECK (gross_minor > 0),
    currency TEXT NOT NULL CHECK (length(currency) = 3),
    -- The `card_purchase` device binding; null until the ticket key signs it.
    session_public_key TEXT,
    certificate_sha256 TEXT,
    device_expires_at_ms INTEGER,
    device_signature TEXT,
    -- created: provider order exists, no signature yet. awaiting_payment: signed.
    -- paid: verified purchase event, ticket not yet on chain. issued: on chain.
    -- void_pending: refund or lost chargeback after issue, void not yet on chain. voided: on chain.
    -- cancelled: refund or lost chargeback before issue; nothing was written.
    status TEXT NOT NULL CHECK (status IN ('created', 'awaiting_payment', 'paid', 'issued', 'void_pending', 'voided', 'cancelled')),
    void_reason TEXT CHECK (void_reason IS NULL OR void_reason IN ('refund', 'chargeback')),
    -- The last transaction the operator signed for this order; recorded before it is sent, so an
    -- unknown outcome is settled by reading the ticket, never by blind resending.
    pending_tx_hash TEXT,
    issue_tx_hash TEXT,
    void_tx_hash TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    -- A fixed code (src/card-operator.ts), never provider or chain text.
    last_error TEXT,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    paid_at_ms INTEGER
);

CREATE UNIQUE INDEX card_orders_provider_order ON card_orders (provider, provider_order_id);
CREATE UNIQUE INDEX card_orders_reference ON card_orders (payment_reference_hmac);
-- One order per ticket key: the contract accepts one ticket per ticket_id.
CREATE UNIQUE INDEX card_orders_ticket ON card_orders (ticket_id);
CREATE INDEX card_orders_status ON card_orders (status, updated_at_ms);

-- Every verified provider event, once. A redelivered event is recognised by its provider id.
CREATE TABLE card_events (
    provider TEXT NOT NULL,
    provider_event_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('purchase', 'refund', 'chargeback_opened', 'chargeback_lost', 'chargeback_won')),
    order_id TEXT,
    -- applied, or a fixed code when the event changed nothing (src/card-events.ts).
    outcome TEXT NOT NULL,
    received_at_ms INTEGER NOT NULL,
    PRIMARY KEY (provider, provider_event_id)
);

-- Money facts as the provider reported them, one row per event that moved money. The creator
-- share is not computed here: the card split is an open owner decision (roadmap D4).
CREATE TABLE card_ledger (
    provider TEXT NOT NULL,
    provider_event_id TEXT NOT NULL,
    order_id TEXT NOT NULL REFERENCES card_orders (order_id),
    kind TEXT NOT NULL CHECK (kind IN ('sale', 'refund', 'chargeback')),
    -- Signed: a sale is positive, a refund or chargeback negative.
    amount_minor INTEGER NOT NULL,
    currency TEXT NOT NULL CHECK (length(currency) = 3),
    publication_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    occurred_at_ms INTEGER NOT NULL,
    PRIMARY KEY (provider, provider_event_id)
);

CREATE INDEX card_ledger_creator ON card_ledger (creator_id, occurred_at_ms);
