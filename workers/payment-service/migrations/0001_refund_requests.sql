-- USDC refund requests (owner decision 2026-10-10: technical failure, not as described, takedown).
-- The buyer's ticket key signs `refund_ticket`; youtick decides within 72 hours and the payment
-- operator submits approved refunds from its own machine. Market V2 stays the authority: a row is
-- marked `refunded` only after get_ticket reads `refunded`. No e-mail, IP or buyer identity.
CREATE TABLE refund_requests (
    request_id TEXT PRIMARY KEY CHECK (length(request_id) = 32 AND request_id NOT GLOB '*[^0-9a-f]*'),
    ticket_id TEXT NOT NULL CHECK (length(ticket_id) = 64 AND ticket_id NOT GLOB '*[^0-9a-f]*'),
    publication_id TEXT NOT NULL,
    refund_to TEXT NOT NULL,
    expires_at_ms INTEGER NOT NULL,
    signature TEXT NOT NULL,
    -- What the buyer says went wrong, 10-1000 characters.
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 10 AND 1000),
    status TEXT NOT NULL CHECK (status IN ('pending', 'refunded', 'declined')),
    created_at_ms INTEGER NOT NULL,
    decided_at_ms INTEGER,
    decision_note TEXT CHECK (decision_note IS NULL OR length(decision_note) <= 500),
    tx_hash TEXT
);

-- One open request per ticket.
CREATE UNIQUE INDEX refund_requests_pending_ticket ON refund_requests (ticket_id) WHERE status = 'pending';

CREATE INDEX refund_requests_status ON refund_requests (status, created_at_ms);
