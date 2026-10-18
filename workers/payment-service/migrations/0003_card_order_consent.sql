-- Gate C3 (E9-lite): the version of the instant-access consent the buyer ticked at checkout (express
-- request for immediate supply and acknowledgement that the 14-day cancellation right ends once
-- playback starts). The text itself lives in the web (components/v2/instant-access-consent.ts) under
-- this version string. Orders opened before this migration have no recorded consent (NULL).
ALTER TABLE card_orders ADD COLUMN consent_version TEXT
    CHECK (consent_version IS NULL OR (length(consent_version) BETWEEN 1 AND 64 AND consent_version NOT GLOB '*[^a-z0-9.-]*'));
