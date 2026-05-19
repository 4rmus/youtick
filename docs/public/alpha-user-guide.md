# YouTick Public Alpha — User Guide

> What you can do at **youtick.net** during the 30-day public alpha (opens
> Day 23 of the internal launch plan; mainnet `youtick.near`). Owner-controlled,
> hybrid-decentralized — treat as preview, not final product.

## Three Ways In

| Path | Entry | Account you get | Wallet required |
|---|---|---|---|
| Guest access | Landing hero → "Guest access" CTA → `/trial` | Managed implicit account | No |
| Gift link | Sender shares `/claim#key=…` | Guest implicit account *or* your existing wallet | Optional |
| Wallet connect | Header → "Connect" | Your NEAR account | Yes |

Guest and gift-implicit paths use a server-issued onboarding key (gated by an
invisible Turnstile challenge in production) to mint an implicit account.
Tickets and any deposited NEAR stay yours; you can upgrade to a self-custody
wallet later via the **Upgrade** dialog on the success card.

## Onboarding (`/trial`)

1. Hit `/trial` (or the landing-page CTA).
2. `TrialOnboarding` requests an onboarding signature from the API and creates
   an implicit account funded with `TRIAL_ACCOUNT_STORAGE_COST` (0.002 NEAR).
3. Success card shows your account ID, an **Upgrade to wallet** button
   (`TrialUpgradeDialog`), and a **Connect wallet** fallback.
4. If you arrived via `?redirect=…` (e.g. from a ticket page), connecting a
   wallet sends you back automatically.

## Claiming a Gift (`/claim#key=…`)

The claim page reads the secret key from the URL hash (preferred) or
`?secret=`/`?key=` for legacy links, then clears the URL.

| Step | What happens |
|---|---|
| **Loading** | Server-side `get_gift_info_full` looks up the gift by public key. |
| **Preview** | Thumbnail, title, sender, and "Claim Ticket" CTA. |
| **Choose claim method** | *Guest account* (creates a managed implicit account and claims) **or** *Existing wallet* (transfers the NFT to an account ID you type). |
| **Success** | Account + tx hash + Watch CTA, plus the upgrade dialog for guest claims. |

Used or invalid links surface "This link is invalid or has already been used."

## Watching

- All tickets unlock playback through a **3-of-5 KMS share threshold**. The
  browser reconstructs the playback key only after enough operators return
  shares.
- Wallet *and* managed (guest/trial) accounts use a **signless access key**
  scoped to `issue_session_grant` with a limited gas allowance, plus a
  **10-minute play session grant**. You don't sign popups during a session.
- If the player surfaces **"Signless playback unavailable"**, the local key
  was cleared — reconnect the wallet (or re-enter via `/trial`) and retry.

## Buying

- **NEAR is the default checkout currency** on the wallet-driven `buy_ticket`
  path.
- **Cross-chain checkout** (USDC/USDT) is gated behind
  `NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=true` *and* requires a connected
  NEAR wallet. Guest/trial accounts cannot use it; the
  `PaymentMethodSelector` will block the option.
- The legacy implicit-account swap path inside `TicketPurchaseCard` was
  removed; paid checkout always goes through a connected wallet.

## Wallet Stack

The "Connect" button uses **HOT Connect** (`@hot-labs/near-connect`), which
replaced the previous `near-wallet-selector` modal. Any wallet that HOT
Connect supports works — HOT, MyNear, Meteor, etc.

## Known Limits During Alpha

| Area | Status |
|---|---|
| Mainnet contract `youtick.near` | Live (current code hash `HA3i8Se8Mrsd14Ye2qYvwehRgP9Phrd76psgyy9Y1bCF`; R2 deploy hash was `BXbiiT86A8mjVNwvZhNLhUDqvmTVUe7anHotTpQPXg2F`) |
| Storage upload | Lighthouse primary write; Crust kept as compat / diagnostic |
| Storage API auth | NEP-413 upload challenge required (`/uploads/intent` returns `Unauthorized` without it) |
| Trial pool funding | Fixed `TRIAL_ACCOUNT_STORAGE_COST = 0.002 NEAR` per claim |
| Cross-chain payments | Off by default in production; flag-gated |
| Access-control timelock | Deferred for current alpha scope; registry `Pause` / `DeactivateDecryptionOperator` proposals are pre-staged |
| Takedown | Owner-controlled `takedown_event`; see [`incident-takedown.md`](../operations/incident-takedown.md) |

Live known-issues tracker: [`docs/operations/known-issues.md`](../operations/known-issues.md).

## Reporting Problems

- **General bugs / feedback** — GitHub issues:
  <https://github.com/4rmus/youtick/issues>
- **Takedown / acceptable-use** — see [Acceptable Use Policy](../legal/acceptable-use-policy.md).
- **Playback failure** — open an issue with the failing CID, the exact
  player error string (e.g. `SIGNLESS_PLAYBACK_UNAVAILABLE`), and your
  account ID.

## Related Docs

| Read | For |
|---|---|
| [Architecture Overview](./architecture-overview.md) | Trust model, KMS, IPFS layer |
| [Acceptable Use Policy](../legal/acceptable-use-policy.md) | What is and isn't allowed |
| [Quick Start](../quick-start.md) | Running the app locally |
| Launch plan (`docs/launch-plan-2026-05.md`) | Day-by-day readiness, GO/NO-GO gate |
