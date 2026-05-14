# KMS Operator Share Secret Rotation

> Rotation procedure for `OPERATOR_SHARE_SECRET` in `workers/youtick-kms`.
> Zero-downtime; the 5 operators can be rotated independently.

## When to Rotate?

| Trigger | Urgency | Window |
|---|---|---|
| Suspected leak (secret seen in wrangler logs, CI/CD leak) | 🔴 P0 | 1 hour |
| Operator change / key owner change | 🟡 P1 | 24 hours |
| Routine (quarterly best practice) | 🟢 P2 | 1 week |

## Security Model Reminder

- Each operator (a, b, c, d, e) has an **isolated** `OPERATOR_SHARE_SECRET`.
- This secret only encrypts (AES-GCM) the Shamir share that operator stores in its KV.
- Shamir threshold is 3 → playback works even if one operator is offline during a rotation (2 spares above threshold).
- If a single operator's secret leaks, the attacker sees **fewer shares than the threshold** → the video key cannot be reconstructed.

**Conclusion:** Rotation can be done operator-by-operator, in sequence, without ever breaking the threshold.

## Concept: Dual-Key Window

The worker `decryptShareRecord` function:
1. First tries `OPERATOR_SHARE_SECRET` (new).
2. If that fails and `OPERATOR_SHARE_SECRET_PREVIOUS` is set, tries the previous secret.
3. On success, logs `console.warn('[KMS] decryptShareRecord: fell back to OPERATOR_SHARE_SECRET_PREVIOUS')`.

This log determines when the rotation window can be closed: when the log **disappears for N days** (see Grace Period below), PREVIOUS can be deleted.

## Procedure (for a single operator)

Example: rotation for `operator_a`. The same steps are repeated for the other 4 operators (sequentially, not concurrently).

### Phase 1: Preparation

1. **Generate a new secret** (32+ characters, high entropy):
   ```bash
   openssl rand -base64 48 | tr -d '\n' > /tmp/new_secret_a.txt
   wc -c /tmp/new_secret_a.txt   # >= 32
   ```
2. **Back up the current secret** (for fallback if rotation fails):
   ```bash
   # Current secret list (names only, no values)
   npx wrangler secret list --env operator_a
   ```
   ⚠️ Save the current value in a **secure password manager** (1Password, Bitwarden). Do not leave it on the clipboard.

### Phase 2: Set PREVIOUS (move the current secret)

```bash
cd workers/youtick-kms

# Upload the current secret's value as PREVIOUS
# (current value taken from the password manager, piped through stdin)
cat /tmp/current_secret_a.txt | npx wrangler secret put OPERATOR_SHARE_SECRET_PREVIOUS --env operator_a
```

At this point the worker has both secrets on every request. Behavior is unchanged — every KV entry is still encrypted with the current secret and decrypts on the first try.

### Phase 3: Deploy the new secret

```bash
cat /tmp/new_secret_a.txt | npx wrangler secret put OPERATOR_SHARE_SECRET --env operator_a
```

At this point:
- The worker now encrypts with the **new secret** for new writes (new uploads).
- Existing KV entries are still encrypted with the old secret → they don't decrypt with the new one → the PREVIOUS fallback kicks in.
- Logs begin to show `[KMS] decryptShareRecord: fell back to OPERATOR_SHARE_SECRET_PREVIOUS`.

### Phase 4: Verification (first 10 minutes)

```bash
# Log stream
npx wrangler tail --env operator_a

# Health check
curl -s https://youtick-kms-a.<subdomain>.workers.dev/health
# Expected: {"ok": true}
```

Play an existing video in the browser → you should see the fallback log and the video should play. **If playback fails, roll back (see below).**

Upload a new video → you should not see the fallback log (new write, new read both use the new secret). The video should play.

### Phase 5: Grace Period — watch the fallback log

It takes time for the new secret to cover every KV entry. Two strategies:

**Strategy A (passive, recommended baseline):** the system migrates to the new secret organically over time.
- New uploads → new secret.
- Old videos → fallback triggers when the user plays them (logged), but **no re-encryption** happens (the worker only reads).
- Result: you cannot delete PREVIOUS — old shares are unreadable without it.

⚠️ Strategy A's problem: old videos are never re-encrypted, so PREVIOUS can never be removed.

**Strategy B (active re-encrypt, the correct path):** run an explicit re-encrypt job.
1. Write a one-shot script (`scripts/reencrypt-operator-shares.mjs`).
2. The script lists every KV entry, reads each one (with fallback), and writes it back with the new secret.
3. After the job finishes, `wrangler tail` should show 0 fallback logs.

> ⚠️ **Note:** `scripts/reencrypt-operator-shares.mjs` does not exist yet.
> Before switching to Strategy B, this script must be written and tested.
> For now Strategy A (passive) or Strategy C (TTL + hybrid) is recommended.

**Strategy C (hybrid, most practical):** TTL + active re-encrypt.
- Check the KV TTL on shares: if KV `put` calls in `workers/youtick-kms/src/index.ts` use `expirationTtl`, there is natural decay.
- If no TTL is set, Strategy B is required.

**Grace Period guidance:**
- Strategy B: 7 days after the re-encrypt job completes + 0 fallback logs → delete PREVIOUS.
- Strategy C (TTL-based): wait TTL × 1.1, then delete PREVIOUS.
- If no strategy is applied: **never delete PREVIOUS** (the dual-key window becomes permanent).

### Phase 6: Delete PREVIOUS (after the grace period)

```bash
npx wrangler tail --env operator_a --format pretty | grep "OPERATOR_SHARE_SECRET_PREVIOUS"
# 24 hours of empty output → safe

npx wrangler secret delete OPERATOR_SHARE_SECRET_PREVIOUS --env operator_a
```

Verification:
```bash
# Startup validation should pass
curl -s https://youtick-kms-a.<subdomain>.workers.dev/health
# Logs should NOT show "OPERATOR_SHARE_SECRET_PREVIOUS must be at least 32 characters when set"
```

## Rollback

### After Phase 3 (new secret deployed, something went wrong)

```bash
# Restore the old secret as the primary; remove PREVIOUS
cat /tmp/current_secret_a.txt | npx wrangler secret put OPERATOR_SHARE_SECRET --env operator_a
npx wrangler secret delete OPERATOR_SHARE_SECRET_PREVIOUS --env operator_a
```

All KV entries decrypt with the old secret again. Zero data loss.

### After Phase 6 (PREVIOUS deleted, old shares can no longer be decrypted)

This scenario should not happen if the grace period was respected. If it does:
1. Re-upload PREVIOUS from the password-manager backup.
2. Run the Phase 5 Strategy B re-encrypt job.
3. Delete PREVIOUS again.

## Full Flow for 5 Operators

```
operator_a: Phase 1-4 → Phase 5 (monitor) → Phase 6
  ↓ (only after a finishes)
operator_b: Phase 1-4 → Phase 5 → Phase 6
  ↓
operator_c: ...
  ↓
operator_d: ...
  ↓
operator_e: ...
```

Do not parallelize. The next operator does not start until the current
operator passes Phase 4 verification. The full rotation can take 1-2
weeks including grace periods.

**Why sequential?** The Shamir threshold is 3. If a rotation error
affects 3 operators at once, quorum is broken. Sequential rotation with
per-operator verification limits exposure to a maximum of one operator
at a time.

## Monitoring

During rotation, watch three signals:

| Signal | Where | Meaning |
|---|---|---|
| `[KMS] decryptShareRecord: fell back to OPERATOR_SHARE_SECRET_PREVIOUS` | `wrangler tail` | The rotation window is still active; grace period not over |
| Playback 5xx spike | Cloudflare Analytics | Rotation went wrong — roll back |
| `/health` returns 500 | Any operator | Validation failed — secret format problem |

## Checklist (copy per operator)

```
Operator: operator_X (X = a/b/c/d/e)
- [ ] New secret generated (32+ char, openssl rand)
- [ ] Current secret backed up in the password manager
- [ ] Phase 2: PREVIOUS set (current value)
- [ ] Phase 3: OPERATOR_SHARE_SECRET updated with the new value
- [ ] Phase 4: health check OK, existing video plays, new upload + playback OK
- [ ] Phase 5: wrangler tail shows the fallback log (expected)
- [ ] Grace period start: ____
- [ ] Re-encrypt strategy chosen: [ ] Passive A / [ ] Active B / [ ] Hybrid C
- [ ] Grace period end (Strategy B: 7 days / Strategy C: TTL×1.1): ____
- [ ] Phase 6: PREVIOUS deleted
- [ ] Rotation log updated: docs/operations/rotation-log.md
```

## References

- `workers/youtick-kms/src/index.ts` — `decryptShareRecord` (line ~1090), startup validation (`getWorkerReadiness`, line ~242-265)
- `workers/youtick-kms/wrangler.toml` — 5 operator environment definitions
- `docs/release-runbook.md` — secret management
- NIST SP 800-57 Part 1 Rev. 5 — cryptographic key lifecycle (external reference)
