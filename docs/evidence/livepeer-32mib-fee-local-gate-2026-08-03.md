# Livepeer 32 MiB and fee gate evidence - 2026-08-03

Status: `PARTIAL / LOCAL_PASS / PROVIDER_80_MIB_PASS / CHROME_EDGE_PASS /
TESTNET_PURCHASE_PASS / RUNTIME_DISABLED`

## Scope and source truth

- Baseline: `426192c74745023e7e210c4b74c8eeba24f36c76`.
- Code snapshot: `ab20efd85ecf27c0003960cf888a7063b9dffa28`.
- Source evaluation SHA-256:
  `1b676eb620c35ae52357e280cfa3e9e2d0320c49e13b1318aaf118b8cb7de5fa`.
- Product path: `paid-media-livepeer-v1` only.
- The initial pass made no D6/testnet or provider mutation. A later explicitly
  authorized continuation created two disposable test accounts, funded test
  USDC, upgraded the isolated test market and attempted the single 80 MiB
  provider canary. See
  [the testnet execution receipt](livepeer-testnet-e2e-2026-08-03.md).
- No Worker/web deployment, runtime activation, public path, 20 GB media upload
  or Lighthouse/Crust fallback occurred.

## Locally proven

- The per-file limit is exactly decimal `20_000_000_000` bytes; +1 fails
  before provider code.
- Creator fee is
  `ceil(source_bytes / 1_000_000_000 * 300_000)` micro-USDC and is consumed
  atomically by USDC `ft_transfer_call` only for a new job.
- Exact examples: 80 MiB `0.025166`, 1 GB `0.300000`, 5 GB `1.500000`,
  10 GB `3.000000`, 20 GB `6.000000` USDC.
- Same-job exact replay returns the transferred amount; retry with a changed
  byte count fails. Pause/resume and provider reconciliation have no payment
  call. No automatic refund exists.
- Ticket minimum is exactly `2.000000` USDC; `2.000001` is accepted and the
  98/2 split remains unchanged. A future 5% commission is not implemented.
- Web and Worker use fixed 32 MiB TUS chunks, `parallelUploads: 1`, the same
  opaque resource URL and fail closed on 409. The exact 80 MiB local plan is
  32 + 32 + 16 MiB. The mocked provider receipt also pauses after the first
  chunk and resumes from a second authoritative HEAD on the same resource.
  Offset/length, disconnect, timeout, no-second-asset behavior and cleanup
  ordering are covered by tests.
- The real-browser harness now requires anonymous, malformed, wrong-key,
  wrong-subject and expired denial plus correct and refreshed JWT playback in
  both Chrome and Edge. These branches first passed locally; the later bounded
  provider/browser continuation passed as recorded below.
- A locally generated MP4 passed the mutation preflight at exactly `83,886,080`
  bytes, 12 seconds and SHA-256
  `1a53c572296c61861a435f750cb8d5309f8cdebbc218b92a6528d0494cce0b98`.
  The canary checks exact size, MP4 format, a video stream and positive duration
  with `ffprobe` before mutation. This temporary source must be rechecked at run
  time and is not provider evidence.
- Decimal 20 GB is not a monthly quota. Admission uses a separate monthly
  operation budget and per-job cost reservation. Both deployment values remain
  empty, so runtime admission fails closed.

Commands and results:

```text
cargo test --test paid_media_livepeer_v1
12 passed, 0 failed

cargo +1.86.0 test
3 unit + 12 focused + 1 sandbox passed, 0 failed

cargo +1.86.0 clippy --all-targets -- -D warnings
pass

cargo-near 0.17.0 build + node scripts/check-paid-media-livepeer-v1-abi.mjs
paid-media-livepeer-v1 ABI PASS: market=20, access=24

npm run test:run
64 passed, 0 failed

npm run test:provider-canary
68 passed, 0 failed

npm exec -- vitest run __tests__/unit/livepeer-upload.test.ts __tests__/unit/constants.test.ts
17 passed, 0 failed

npm run build (docs)
pass

git diff --check
pass
```

The sandbox test uses a real mock NEP-141 `ft_transfer_call`; it proves first
charge consumption and exact same-job replay refund before finalization.

## Provider and browser gate

The continuation proved that Livepeer's upload endpoint returns a bare HTTP
`204` to `OPTIONS` while its documented TUS resource operations work. Treating
absent advertisement headers as protocol denial was the local blocker. The
corrected canary records `not-advertised`, then proves the same opaque resource
through POST, HEAD, sequential 32 + 32 + 16 MiB PATCHes and cleanup.

The exact 80 MiB asset reached `ready`. Chrome and Edge passed the full JWT
denial, correct-token and refreshed-token matrix after fixing the harness CSP
to permit hls.js's local `blob:` MediaSource. The creator paid `25,166`
micro-USDC, the bridge finalized the exact provider tuple and the buyer paid
`2,000,001` micro-USDC; entitlement and the 98/2 ledger split passed. Sales were
then suspended and authenticated provider inventories returned `0 assets /
0 signing keys`.

Provider usage before/after values and actual invoice cost remain unproven. One
completed attempt proved TUS termination; the final retained recovery asset's
TUS bearer URL was not available after process exit, so that resource's
post-delete HEAD is not claimed independently. Exact receipts are in
[the testnet E2E evidence](livepeer-testnet-e2e-2026-08-03.md).

## Cost contract

The current public Growth list prices checked on 2026-08-03 are $0.33 per 60
transcoded minutes, $0.09 per 60 stored minutes per month and $0.03 per 60
delivered minutes, with a $100 monthly minimum. Actual canary cost cannot be
claimed without provider before/after usage and measured duration.

Estimate formulas for the approved single 720p output are:

```text
transcode_usd = duration_minutes * 0.33 / 60
storage_usd_month = duration_minutes * 0.09 / 60
delivery_usd = delivered_minutes * 0.03 / 60
creator_fee_usdc = ceil(source_bytes * 3 / 10_000) / 1_000_000
```

Equal-byte videos can have different durations and provider costs, while the
creator upload fee remains equal. The Growth minimum is an invoice floor, not
a hard cap. The current public upload guide does not state an exact single-file
maximum; this absence is not an unlimited-size guarantee.

References:

- [Livepeer direct upload guide](https://docs.livepeer.org/developers/guides/upload-video-asset)
- [Livepeer asset metadata](https://docs.livepeer.org/api-reference/asset/update)
- [Livepeer pricing](https://livepeer.studio/pricing)

## Gate classification

| Gate | Result |
|---|---|
| 32 MiB protocol and implementation | `DONE_LOCAL` |
| Fee and ticket economics | `DONE_LOCAL` |
| Per-file limit and fail-closed operation budget | `DONE_LOCAL` |
| Exact 80 MiB provider upload | `PASS / 32+32+16 / READY` |
| Chrome and Edge playback matrix | `PASS` |
| Provider usage and actual cost | `UNPROVEN` |
| Testnet upload fee, finalize and purchase | `PASS / SALES_SUSPENDED_AFTER_PROOF` |
| Contract source/WASM/current testnet code hash | `MATCH / POST-HOC_EQUIVALENCE` |
| Worker/web deploy/runtime/public activation | `NOT_RUN` |

The reported TUS/purchase blocker is closed. Full D6 still requires exact-SHA
Worker/web deployment, real runtime session/grant issuance, withdrawal,
rotation/outage drills and separate activation authority.
