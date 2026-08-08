# Configuration

## Web

Required public variables:

```text
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_MARKET_CONTRACT_ID=<fresh-market-account>
NEXT_PUBLIC_ACCESS_CONTRACT_ID=<fresh-access-account>
NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1=false
NEXT_PUBLIC_ENABLE_LIVEPEER_NEAR_CREATOR_FEE=false
NEXT_PUBLIC_MULTI_ASSET_PAYMENTS_MODE=off
NEXT_PUBLIC_LIVEPEER_BRIDGE_URL=https://<bridge-host>
NEXT_PUBLIC_LIVEPEER_CREATOR_FEE_GAS_RESERVE_YOCTO=<approved-positive-yoctonear>
NEXT_PUBLIC_PAYMENT_GAS_RESERVE_YOCTO=<approved-positive-yoctonear>
```

`NEXT_PUBLIC_USDC_CONTRACT_ID` may override the network's known USDC
contract. Missing or invalid market/access IDs fail closed. The gas reserve is
required by the upload transaction and must be an approved positive integer.
A true web gate does not enable the Worker.

Multi-asset checkout accepts `off`, `preview` or `live`. `preview` shows only a
dry quote; `live` can create a deposit address. The shared payment gas reserve
is mandatory before either mode can start a conversion. Web and Bridge modes
must match. A stored conversion continues status polling when the mode returns
to `off`, but no new quote is created.

## Livepeer Bridge

Non-secret values belong in `workers/livepeer-bridge/wrangler.toml`:

- `LIVEPEER_BRIDGE_ENABLED=false`
- `LIVEPEER_NEAR_CREATOR_FEE_ENABLED=false`
- `ALLOWED_ORIGINS`
- `NEAR_NETWORK`, `NEAR_RPC_URL`
- `MARKET_CONTRACT_ID`, `ACCESS_CONTRACT_ID`
- `LIVEPEER_PROJECT_ID`, `LIVEPEER_API_TOKEN_NAME`
- `LIVEPEER_CREATOR_ALLOWLIST`
- `LIVEPEER_JOB_OPERATION_RESERVATION_USD_MICROS`
- `LIVEPEER_PAID_MEDIA_OPERATOR_ID`
- `LIVEPEER_JWT_PUBLIC_KEY`, `LIVEPEER_JWT_ISSUER`
- `NEAR_OPERATOR_ACCOUNT_ID`, `NEAR_OPERATOR_KEY_EPOCH`
- `CREATOR_FEE_QUOTE_KEY_VERSION`
- `MULTI_ASSET_PAYMENTS_MODE=off`
- `MULTI_ASSET_PAYMENT_ASSET_IDS`

Set these only as Worker secrets:

- `LIVEPEER_API_KEY`
- `LIVEPEER_WEBHOOK_SECRET` and optional previous value during rotation
- `LIVEPEER_PAID_MEDIA_OPERATOR_TOKEN` and optional previous value
- `LIVEPEER_JWT_PRIVATE_KEY`
- `NEAR_OPERATOR_PRIVATE_KEY`
- `CREATOR_FEE_QUOTE_PRIVATE_KEY`
- `ONECLICK_API_KEY`

The monthly and per-job provider budget values must both be configured before
admission can open. Do not enable either runtime gate as part of configuration
or deployment preparation.

Multi-asset quotes are mainnet-only. The allowlist is a comma-separated subset
of the built-in canonical 1Click asset IDs. Release environments retain
`ONECLICK_API_KEY` and the positive payment gas reserve in every mode so an
existing conversion can still finish after quote creation is switched off.
