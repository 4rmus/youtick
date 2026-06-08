# YouTick Economics

> Public-alpha unit economics. Numbers below are taken directly from the live
> contracts, not projections. This is a **margin / cost-structure** description,
> not demand-side unit economics — there is no CAC/LTV/retention data yet (see
> "What this does not show").

## Take Rate

| Party | Share | Source |
|---|---|---|
| Creator | **98%** of each ticket sale | `contracts/nft-ticket/src/market.rs:562` |
| Platform | **2%** commission | `COMMISSION_RATE_PERCENT = 2 / COMMISSION_DENOMINATOR = 100` (`lib.rs:203-204`) |

The 2% is computed on-chain at purchase and accrues to a commission pool;
the remainder is paid to the creator in the same settlement. Owner withdrawals
from the commission pool are timelocked for the USDC pool and owner-gated for
NEAR (`treasury.rs:413-449`).

## Payment Rails

| Rail | Status | Path |
|---|---|---|
| NEAR (native) | Default checkout | `buy_ticket` |
| USDC | Live (FT transfer) | `ft_on_transfer` → 6-decimal stablecoin |
| USDT | Live at FT layer, **not yet test-covered** | shares the USDC price field; no separate `price_usdt` |
| Cross-chain (1Click / MetaMask) | Experimental, **off by default** | gated behind `NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=true` |

> Alpha note: treat USDT as experimental until it has its own contract tests and
> a recorded live smoke. NEAR is the proven path.

## Marginal Cost Structure

There is **no per-stream server cost**: media is encrypted in the browser,
stored on IPFS, and delivered through gateways; playback keys come from
threshold KMS workers (Cloudflare). The platform's variable costs are on-chain
storage deposits and gas, plus fixed infra (Cloudflare Workers/KV, Lighthouse
write API).

| Cost item | Amount | Constant |
|---|---|---|
| Trial account funding | **0.002 NEAR** per trial claim | `TRIAL_ACCOUNT_STORAGE_COST` (`lib.rs:196`) |
| NFT (ticket) storage | 0.01 NEAR | `STORAGE_COST_NFT` (`lib.rs:190`) |
| Upload/event session storage | 0.1 NEAR | `STORAGE_COST_ACCOUNT` (`lib.rs:191`) |
| Gift link deposit | 0.15 NEAR / link | `GIFT_DEPOSIT_PER_LINK` (`lib.rs:223`) |
| Implicit account creation | 0.11 NEAR | `ACCOUNT_CREATION_COST` (`lib.rs:226`) |

At ~sub-cent NEAR-denominated trial cost, the dominant economic question is not
infrastructure margin (which is structurally thin and favorable) but **demand**:
whether creators bring paying audiences.

## Trial Pool

Trial/guest onboarding is funded from an on-chain trial pool
(`get_trial_pool_balance`). Live balance is small and intentionally capped for
alpha; trial distribution should be rate-limited manually until the baseline
abuse-telemetry (`scripts/trial-baseline-snapshot.mjs`) has collected enough
data to set a falsifiable abuse threshold.

## What This Does Not Show (honesty note)

These figures describe **margin architecture and take-rate**, which are clean
and defensible. They are **not** unit economics in the investor sense:

- No CAC (no paid acquisition run yet).
- No LTV / retention (public alpha has not opened to external users).
- On-chain mint count is small and currently dominated by founder testing.

For a pre-seed conversation, the honest framing is: *the cost structure and
take-rate are proven on mainnet; demand validation is what this round funds.*
