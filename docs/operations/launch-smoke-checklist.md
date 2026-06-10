# Launch Smoke Checklist (Gate item: upload → buy → watch)

> Records the live evidence for the GO/NO-GO gate. The full automated matrix
> can't be run by one person on mainnet (real wallet signing + `ft_transfer_call`
> from a deployed token), so this is a **recorded manual checklist**. Owner
> action required — fill in tx hashes as you go.
>
> Smoke definition source: `docs/release-runbook.md:156-167`.

## Scope decision (per the orchestrated eval)

USDT is implemented at the FT layer but shares `price_usdc`, has **no contract
tests**, and is unproven end-to-end. **Recommended honest gate: NEAR 3/3
(upload → buy → watch).** Mark USDC/USDT "experimental" and record them
separately if/when exercised, rather than claiming an unproven 9/9.

## Pre-flight (already green)

- [ ] `docs/release-runbook.md` Pre-Flight commands pass (web + workers + contracts)
- [ ] `registry.youtick.near get_threshold_config` → `5 / 3`
- [ ] 5 KMS `/health` → `ok:true`
- [ ] Monitoring live (`docs/operations/monitoring-setup.md`)

## NEAR path (required for GO)

| Step | Account | Expected | Tx hash / evidence |
|---|---|---|---|
| Connect wallet | creator | wallet connected | — |
| Create event + upload short video | creator | `create_event_prepaid` / `nft_mint_prepaid` succeed; `encrypted_cid` recorded | `__________` |
| KMS shares stored | creator | store + read-back verify pass (no mint without it) | `__________` |
| Buy ticket | buyer (different account) | `buy_ticket` succeeds; `has_ticket` true | `__________` |
| Watch | buyer | playback reconstructs key (≥3 shares) and video starts | screenshot / note |

## USDC path — RECORDED GREEN (2026-06-10)

Verified end-to-end on mainnet: buyer `novilusio.near` acquired NEAR-native USDC
via Rhea/Ref and purchased a ticket for event `f95dd20d-fa77-4c1d-8526-16b6271bafbe`
(creator `aramustafa.near`, price 0.5 USDC), then issued a Play session grant and
watched. Post-state confirmed by read-only view calls.

| Step | Account | Expected | Tx hash / evidence |
|---|---|---|---|
| Wrap NEAR → wNEAR | buyer | `near_deposit` on `wrap.near` | `RBhND6jYjSbBQiNCdM3BhzqtJGh3DsGSzY95o3rmXZy` |
| Swap wNEAR → USDC (Rhea/Ref) | buyer | `ft_transfer_call` → `v2.ref-finance.near` (pools 5470, 4179) | `3VMUhPU8dabXnAJxiFPHzXa5ncQxd7YFMJ6XHwrddigP` |
| Buy ticket with USDC | buyer | `ft_transfer_call` USDC → `youtick.near` `buy_ticket` (amount 500000); `has_ticket` true | `4ktUNKqz49kCheDMaXAGbY8Ejz1bdHxj5vKiegiRehEY` |
| Issue Play grant + watch | buyer | `issue_session_grant` (scope Play, resource = video) on `access.youtick.near`; grant recorded, not revoked | `7XF8ukHA2sJdZxpZYcvVW7gAgyfeHLKzKFseHnNb86PQ` |

Read-only post-state (2026-06-10):
- `has_ticket(novilusio.near, f95dd20d-…)` → `true`
- `get_event(f95dd20d-…)` → exists, `price_usdc: "500000"`, creator `aramustafa.near`
- `get_session_grant(ed25519:9HSBbRnxW874FLjJz1zr1yqmh3BPPiGrG9mbonU6TLTc)` → Play scope,
  resource matches video, origin+device bound, `revoked:false`

Watch URL: <https://youtick.net/watch?cid=f95dd20d-fa77-4c1d-8526-16b6271bafbe>

## USDT path (experimental — record if exercised)

| Step | Account | Expected | Tx hash |
|---|---|---|---|
| Buy ticket with USDT | buyer | `ft_transfer_call` → ticket minted | `__________` |
| Watch | buyer | playback starts | note |

## Result

- [ ] NEAR 3/3 PASS → gate item GREEN (with USDC/USDT marked experimental), or
- [ ] Full 9/9 recorded → gate item GREEN (full matrix)

Record the `encrypted_cid`, the watching account, date, and a one-line outcome in
the release evidence. Watch/playback is off-chain — capture it with a note or
screen recording, since it won't appear in tx history.

> Tip: a fresh testnet creator+buyer pair (testnet USDC/USDT token ids already in
> `contracts/nft-ticket/src/lib.rs`) lets you exercise USDC/USDT without mainnet
> token risk; record those tx hashes as the experimental-rail evidence.
