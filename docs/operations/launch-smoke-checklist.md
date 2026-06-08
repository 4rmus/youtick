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

## USDC path (experimental — record if exercised)

| Step | Account | Expected | Tx hash |
|---|---|---|---|
| Buy ticket with USDC | buyer | `ft_transfer_call` → ticket minted | `__________` |
| Watch | buyer | playback starts | note |

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
