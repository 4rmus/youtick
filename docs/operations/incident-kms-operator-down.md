# Incident Runbook: KMS Operator Down

Use this when one KMS operator returns 5xx, fails `/health`, or stops returning
shares. Do not execute registry changes unless the incident owner approves them.

## Detect

- Uptime alert for one operator `/health`.
- Playback reports mention one failed operator while other operators still
  respond.
- `/health` reports `ok: false`, `ready: false`, degraded RPC, degraded KV, or
  registry readiness errors.

## Triage

1. Identify the operator endpoint and account ID from the private operator
   config, not from public docs.
2. Check worker logs for RPC, KV, readiness, or registry verification failures.
3. Check whether the registry record is active and whether its endpoint still
   matches the worker origin.
4. Confirm impact: with a 3-of-5 threshold, one operator down should be degraded
   but not a full playback outage.

## Mitigate

- If only one operator is down and the issue is not compromise, prefer repair
  over registry removal.
- If the operator is compromised, returning bad data, or staying down long
  enough to hurt playback, execute the pre-staged
  `DeactivateDecryptionOperator` proposal after approval.
- If no pre-staged proposal exists, create a reviewed proposal and wait for the
  timelock; do not invent a direct registry bypass.

## Recover

1. Redeploy or repair the affected worker with the correct KV namespace, share
   secret, registry operator account, and allowed origins.
2. Confirm `/health` is ready.
3. Confirm registry endpoint and active status are correct.
4. Run a small playback smoke after the operator is back.
5. Record root cause, action taken, and whether registry state changed.
