# NEAR + Livepeer v1 testnet allowance evidence - 2026-08-01

Status: `PASS / BOUNDED TESTNET / PRODUCTION BUDGET OPEN / NOT ACTIVATED`

This receipt proves narrow NEAR FunctionCall behavior for the disabled
paid-media Livepeer v1 profile. It did not deploy a Worker or web runtime,
create a Livepeer asset, use mainnet, or activate a feature flag.

## Boundary

- sponsor: `youtick-dev-v3.testnet`;
- market: `lp-market-260801.youtick-dev-v3.testnet`, funded with `2.7 NEAR`;
- creator: `lp-creator-260801.youtick-dev-v3.testnet`, funded with `0.35 NEAR`;
- bridge: `lp-bridge-260801.youtick-dev-v3.testnet`, funded with `0.35 NEAR`;
- governance: `lp-governance-260801.youtick-dev-v3.testnet`, funded with
  `0.35 NEAR`;
- total funding ceiling: `3.75` testnet NEAR;
- credentials remain outside the repository with local `0600` permissions.

Account creation transactions:

- market: `GcQTQbZoA41wAAt1cuPnKRsSErskCbfTeMDFGcaQYd1d`;
- creator: `4mqrKGkajprp4AgZMWMC7CHjhX1GkQuQVZingvSC9qkR`;
- bridge: `8MsvYGqtXzeWzpUh8DVumpxjTm3vVyyZBSSUnBYLqA6d`.

The governance account was also created and independently read back at final
state. Its creation response was not retained, so this receipt does not invent
a transaction hash for it.

## Contract deployment

- Rust toolchain: `1.86.0`;
- WASM bytes: `192959`;
- WASM SHA-256: `a715fde0bf81b871b60911d65cc4df68abbe3673429efb0c7d93ff950bc6cac8`;
- deploy: `DCnEbbTSvN2xqNSDKnzp6B6PuJhHuVuvw4A5zUKY5WPh`;
- initialize: `5fBbNjtceMCp1PKSH6wqZCqX4nXUBUgJkKNdhnsNJoFL`;
- initializer bound the governance account as platform and the separate bridge
  account as operator.

This is a dedicated test contract, not a staging or production deployment.

## Creator FunctionCall measurement

A temporary key was restricted to the exact market and only
`create_paid_job`. The successful exact-20-GB job used:

- configured allowance: `8_000_000_000_000_000_000_000` yoctoNEAR
  (`0.008 NEAR`);
- prepaid gas: `5 TGas`;
- allowance charged at admission: `5_920_924_715_817_000_000_000`
  yoctoNEAR;
- total gas burnt: `1_919_164_223_169`;
- total tokens burnt: `191_916_422_316_900_000_000` yoctoNEAR;
- add key: `E3kEMnHQjbT5tr6txZr6kfssEH5eVrpmFzHQbCTJAiX`;
- call: `HSACM1tLjHBUHLLTuWFVRfNJmCmtEunxoAezckXaxkcN`;
- delete key: `52yHc8DHzoBxuNCyqMoJR6m7u94YH1k9HJb9H6Hrvj4V`.

The remaining allowance was below another identical `5 TGas` admission cost.
The key was then deleted. This locks `0.008 NEAR` only for the bounded testnet
profile; it is not a production budget.

An earlier `0.0006 NEAR` probe failed before execution because the current
testnet gas price required approximately `0.00592 NEAR` at admission. Its key
was deleted. This demonstrates why actual burnt gas alone is not a safe
allowance calculation.

## Bridge FunctionCall measurement

A separate temporary key was restricted to the exact market and only:

- `finalize_livepeer_publication`;
- `suspend_livepeer_sales`.

It finalized the measured exact-20-GB job and moved it to
`SALES_SUSPENDED`:

- add key: `JAGWF5MTuUnoimjyej24APfhc3gMez5DAeEpJp9zNiY9`;
- finalize: `2GXaYHKWgPnnS4d6Qyun1EMp3iSXP29131u8wy7EpmMC`;
- suspend: `6du5BcyTcqwVARpQ3biJ62grskBMm9qLSxHc4bWTzSH7`;
- delete key: `ATzZiqLGKCXmfAzLkBbRVvBA99JeezRWQPCMuyuQn9xa`;
- finalize total gas burnt: `2_621_705_924_481`;
- suspend total gas burnt: `2_012_999_092_637`.

Both `https://test.rpc.fastnear.com` and
`https://near-testnet.drpc.org` reported no remaining limited bridge key and
the publication in `SALES_SUSPENDED` with expected source bytes
`20_000_000_000`.

## Operational note

The deprecated `https://rpc.testnet.near.org` endpoint returned HTTP 429 during
the run. The final evidence uses the currently documented FastNEAR testnet RPC
and an independent dRPC read. Provider endpoint selection must remain explicit
in deployment configuration.
