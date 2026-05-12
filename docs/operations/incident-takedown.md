# Incident Runbook: Emergency Takedown

Use this for illegal content, imminent harm, or urgent policy violations where
normal review latency is unacceptable. This runbook documents current repo
behavior; it does not add new operator APIs.

## Detect

- Report intake identifies an encrypted CID and a concrete reason.
- Confirm the event exists before taking action.
- Preserve report evidence outside the repo if it contains sensitive material.

## On-Chain Action

The current emergency path is `takedown_event(encrypted_cid, reason)` on
`youtick.near`. It is owner-only, has no timelock, works while paused, writes to
the same banned-event storage as `ban_event`, and emits a distinct takedown
event log.

After the on-chain takedown, KMS `/retrieve` checks `is_event_banned` and should
return a generic not-found/unauthorized response for that CID.

## Off-Chain Actions

1. Remove provider pins for the encrypted CID and related manifest/assets where
   provider tooling supports it.
2. Purge or denylist delivery caches that may still serve encrypted bytes.
3. Ask each active KMS operator to remove the related KV share keys through the
   approved operator process.

Current KMS worker routes are `/auth/challenge`, `/auth/verify`, `/store`,
`/retrieve`, and `/health`; there is no public HTTP delete endpoint in the
worker source. Treat KMS share deletion as an operator/admin action until a
dedicated audited delete path exists.

## Record

Create `docs/operations/takedowns/<date>.md` after the incident with the public
facts only: encrypted CID, reason category, on-chain transaction hash, provider
actions, operator actions, and follow-up items. Do not commit private report
material or secret operator configuration.
