# Frontend Implementation

> Next.js App Router frontend (`apps/web`) with NEAR wallet flows, share-based KMS encryption, and IPFS playback

---

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 + React 19 |
| Language | TypeScript 5 |
| UI | Tailwind CSS 4 + Radix UI |
| State/Data | React Query + custom hooks |
| Wallet | NEAR Wallet Selector |
| Chain | `near-api-js` v7 |

---

## Directory Layout

```text
apps/web/
├── app/                    # Routes (discover, watch, upload, claim, profile, trial)
├── components/             # UI components and feature modules
├── hooks/                  # Route-level hooks
├── lib/
│   ├── kms/                # Multi-operator KMS client + AES-CTR encryption + streaming
│   ├── crust/              # Upload/retrieval gateway logic
│   ├── access-grants.ts    # Session grant lifecycle for playback
│   ├── registry.ts         # Operator registry queries
│   ├── upload-session-manager.ts  # Upload session key lifecycle
│   ├── batch-transactions.ts
│   ├── gift-service.ts
│   └── ...
└── __tests__/              # Unit and integration tests
```

---

## Core Flows

### Upload (`components/UploadForm.tsx`)

1. Validate metadata and file constraints.
2. Ensure upload session authority and budget.
3. Upload thumbnail to Crust.
4. Paid video path: AES-CTR encrypt -> upload ciphertext + manifest -> split key into Shamir shares -> distribute shares to KMS operators.
5. Submit batched on-chain actions (mint ticket + create event).

### Playback (`components/IpfsPlayer.tsx`)

1. Resolve event metadata from `encrypted_cid`.
2. Verify ticket ownership.
3. Ensure a Play grant in the access-control contract.
4. Query operator registry for active operators and threshold config.
5. Request key shares in parallel from operators.
6. Reconstruct AES key from threshold shares.
7. Stream-decrypt and play.

### Ticket Purchase (`components/TicketPurchaseCard.tsx`)

- Reads event details from contract.
- Supports wallet flows.
- Triggers ownership re-check for instant access after purchase.

---

## Important Modules

- `lib/kms/client.ts`: distributes/collects Shamir shares across KMS operators.
- `lib/kms/shares.ts`: Shamir Secret Sharing split/reconstruct over GF(256).
- `lib/kms/encryption.ts`: AES-CTR chunk encryption/decryption.
- `lib/kms/streaming.ts`: progressive decrypted playback.
- `lib/access-grants.ts`: session grant creation and verification.
- `lib/registry.ts`: operator registry queries and caching.
- `lib/rpc-failover.ts`: browser-safe NEAR RPC URL selection. In production,
  browser RPC goes through same-origin `/api/near-rpc`, served by `workers/web4-proxy`.
- `lib/crust/gateway.ts`: multi-gateway read failover.
- `lib/upload-session-manager.ts`: upload session key creation and cleanup.
- `lib/metadata-parser.ts`: title/CID/thumbnail metadata parsing.

---

## Development Commands

```bash
cd apps/web
npm run dev
npm run lint
npm run test -- --run
npm run build
```
