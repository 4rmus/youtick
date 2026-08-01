# Paid Media v4 Implementation Plan

> Status: `SUPERSEDED / CODE_ONLY / NOT_DEPLOYED`
>
> Superseded by the [NEAR + Livepeer Paid Media v1 Plan](./near-livepeer-paid-media-implementation-plan.md).
> The current public-alpha architecture remains live until a separately
> approved cutover.

## 1. Product scope

The first release supports one product path:

- paid video only;
- creator uploads from a supported desktop browser;
- buyer pays with NEAR-native USDC;
- creator receives 98% and the platform receives 2%;
- finalized entitlement is required for playback.

The first release does not include:

- gift, trial, sponsored, zero-price, managed-guest or free-publish paths;
- Studio/Tauri as a product or production dependency;
- EVM, cross-chain, swap or one-click payment routes;
- a second persistence provider, Bunny delivery receipt or R2 playback mirror;
- 4K/HDR, DRM, Smart TV or recovery-player work.

These are separate product decisions. They must not remain as hidden
compatibility layers in the launch ABI, state, web app, workers, KMS policy or
tests.

## 2. Trust boundary

Raw media follows one path:

```text
creator browser -> private R2 -> isolated media processor
```

The browser uploads directly to R2 with short-lived, job-scoped multipart
grants. Media bytes do not pass through Next.js or a Cloudflare Worker.

R2 and the processor see plaintext. YouTick therefore must not describe this
model as self-custody or end-to-end encryption. Plaintext is removed after the
encrypted publication has passed every finalize gate.

## 3. Final runtime

```text
browser
  -> private R2 multipart upload
  -> one media processor
  -> encrypted pack-v2 + storage-manifest-v2 on Lighthouse
  -> one independent full-byte verifier
  -> KMS 5-of-5 store/readback
  -> raw R2 delete and fresh not-found verification
  -> one combined finalizer
  -> PUBLISHED
```

Playback follows:

```text
NEAR USDC purchase
  -> finalized entitlement
  -> short-lived Play grant
  -> KMS 3-of-5 reconstruction
  -> Lighthouse Range playback
  -> independent CID gateway fallback
```

The minimal deployable set is:

- web app;
- market, access-control and operator-registry contracts;
- Storage API control plane;
- one media-processor runtime;
- one independent media-verifier runtime;
- KMS operators;
- media-delivery capability/control worker;
- Web4 proxy where required by the current hosting model.

Readiness aggregation belongs to Storage API. Separate persistence coordinator,
delivery auditor and readiness submitter services are not part of v4.

## 4. Authoritative job flow

```text
AUTHORIZED
  -> UPLOADING
  -> SOURCE_VERIFIED
  -> PROCESSING
  -> SEALED
  -> L3_FULL_READBACK_VERIFIED
  -> KMS_5_OF_5
  -> SOURCE_DELETE_CONFIRMED
  -> READY_TO_PUBLISH
  -> PUBLISHED
```

`FAILED`, `CANCELLED` and `EXPIRED` are terminal. Every transition binds the
job, creator, generation, profile and manifest root and is idempotent.

`PUBLISHED` requires all three independent facts:

1. Lighthouse objects and canonical manifest passed full byte readback.
2. All five KMS operators passed store/readback for the exact finalized tuple.
3. Raw R2 source and multipart inventory were deleted and fresh checks returned
   not found/zero.

HEAD-only storage checks, local tests, CI artifacts or a health endpoint do not
replace these facts.

## 5. Implementation sequence

### PR-0 — Truth and CI routing

- Keep this file as the single active target plan.
- Keep live public-alpha documentation explicitly separate.
- Route v4 manifest/range protocol changes to every current consumer test.
- Do not import historical v3, Studio or external-replica plans.

Acceptance:

- documentation build passes;
- CI workflow changes run all existing checks;
- `git diff --check` passes.

### PR-1 — One paid-only contract and protocol

- Remove gift, trial, free, onboarding, prepaid and managed-guest launch state.
- Remove desktop/Studio/object-v1 publish ABI and compatibility state.
- Replace the old KMS + two-persistence + delivery receipt policy with:
  - KMS 5-of-5;
  - one independent byte-integrity receipt;
  - one raw-source delete receipt.
- Keep one combined, idempotent paid finalizer.
- Keep direct NEAR USDC `ft_on_transfer` settlement only.

Acceptance:

- contract unit and sandbox tests pass;
- ABI scan fails on removed launch terms;
- missing or mismatched evidence cannot produce `PUBLISHED`;
- duplicate finalize cannot duplicate publication or settlement.

### PR-2 — Browser to private R2 ingest

- Add persisted Create, UploadPart grant, ListParts, Complete and Abort control
  routes.
- Use one wallet transaction and zero wallet `signMessage` prompts for the
  device authorization.
- Add IndexedDB resume state and upload only missing parts after reload/reselect.
- Add active multipart/raw reaper and a 24-hour retention kill switch.
- Remove the old free uploader/session/provider chain after the paid consumer is
  complete.

Acceptance:

- desktop `20_000_000_000` bytes is accepted and one byte more is rejected
  before wallet authorization;
- exact part-length enforcement is proven against real R2 from supported
  browsers, not inferred from local mocks;
- 30% and 70% interruption tests resume only missing parts;
- wrong origin, creator, job, generation, prefix, part or replay is denied;
- media bytes never enter the web/API/Worker body path.

The exact 20 GB and device matrix are feature-enable/release gates. Development
may continue fail-closed behind a disabled flag while those provider canaries
remain incomplete.

### PR-3 — Processor, verifier and old-runtime removal

- Move only the existing Rust transcode/rolling-pack core into the
  media-processor package.
- Do not move Studio UI, Tauri, handoff or desktop lifecycle code.
- Add queue claim/lease, pinned FFmpeg/ffprobe, bounded resources, canonical
  CMAF, AES-GCM, pack-v2 and storage-manifest-v2.
- Keep the verifier separate from the writer and require Lighthouse full-byte
  readback.
- Connect KMS 5-of-5, raw deletion and combined finalize.
- After parity, remove Studio, persistence coordinator, delivery auditor,
  readiness submitter and their old protocol/CI surfaces.

Acceptance:

- crash creates a new generation and DEK; the old generation cannot finalize;
- plaintext is absent from durable output, logs and telemetry;
- every referenced CID and manifest passes full readback;
- KMS 5-of-5 and raw not-found are mandatory;
- no parallel production runner remains.

### PR-4 — Paid-only purchase and playback

- Reduce purchase UI to direct NEAR USDC.
- Remove EVM, swap, one-click, gift, trial, free and managed-guest consumers and
  dependencies.
- Require finalized paid entitlement and a short-lived Play grant.
- Use KMS 3-of-5 and exact Range playback with independent gateway fallback.
- Add one paid upload/buy/watch Playwright smoke.

Acceptance:

- free publish/claim and legacy playback routes are absent;
- wrong entitlement, CID, generation and KMS tuple fail closed;
- primary gateway failure uses the independent CID fallback;
- paid browser smoke passes.

### PR-5 — Testnet E2E and release candidate

- Deploy fresh v4 testnet contract IDs from the exact green artifact.
- Run real upload, process, publish, USDC buy, watch and withdraw.
- Record device/resume, cost, raw cleanup, duplicate settlement and liability
  evidence.
- Remove superseded code/protocol documentation only after its last consumer is
  gone.
- Update public documentation only at the actual cutover.

Acceptance:

- `TESTNET_E2E_PASS`;
- no orphan raw object or multipart upload;
- no duplicate publication, entitlement or settlement;
- source, artifact, deployed hashes and runtime configuration match.

## 6. Mainnet rule

Use fresh v4 mainnet contract IDs. Keep legacy accounts read-only until their
remaining obligations are inventoried and resolved.

Do not run destructive clear-state as part of application development. If
canonical account IDs later become a hard requirement, clear-state is a
separate high-risk operation requiring an explicit approval window, exact
authority/finance inventory, rehearsal and rollback limits.

Production activation requires a separate approval and at least a 72-hour
closed-mainnet canary before public enablement.

## 7. Migration and cleanup rules

- Base implementation branches on the latest `origin/main`.
- Treat earlier paid-only candidate history as research/spike evidence.
- Do not merge or cherry-pick that history wholesale.
- Port only the files and hunks required by the current PR.
- Preserve historical evidence only when it proves a current gate.
- Delete stale plans rather than adding another archive layer.
- Never delete a protocol file before all code, CI and operational consumers are
  removed.
- Never stage unrelated work with `git add -A`.

## 8. Stop conditions

Stop the affected phase when any of these is true:

- media bytes pass through Web/API/Worker;
- upload scope can cross job, creator, generation, origin, prefix or part;
- exact provider behavior is assumed instead of canary-tested;
- processor/parser can read credentials or unrestricted network resources;
- plaintext reaches durable storage, logs or telemetry;
- metadata-only L3 checks can satisfy byte integrity;
- fewer than five KMS store/readback receipts can publish;
- raw delete/not-found is missing;
- an old generation or duplicate request can publish or settle;
- local/CI success is presented as deployed or live capability.
