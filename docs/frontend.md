# Frontend Implementation

> Next.js App Router frontend (`apps/web`) with NEAR wallet flows, KMS encryption, and IPFS playback

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
│   ├── kms/                # KMS client + AES-CTR encryption + streaming
│   ├── crust/              # Upload/retrieval gateway logic
│   ├── session-manager.ts  # Session key lifecycle
│   ├── batch-transactions.ts
│   ├── gift-service.ts
│   └── ...
└── __tests__/              # Unit and integration tests
```

---

## Core Flows

### Upload (`components/UploadForm.tsx`)

1. Validate metadata and file constraints.
2. Ensure session key + prepaid balance.
3. Upload thumbnail to Crust.
4. Paid video path: AES-CTR encrypt -> upload ciphertext + manifest -> store AES key in KMS.
5. Submit batched on-chain actions (mint ticket + create event).

### Playback (`components/IpfsPlayer.tsx`)

1. Resolve event metadata from `encrypted_cid`.
2. Verify ownership state.
3. If encrypted: fetch manifest, retrieve AES key from KMS using signed request, stream decrypt.
4. If free: direct IPFS gateway playback with fallback.

### Ticket Purchase (`components/TicketPurchaseCard.tsx`)

- Reads event details from contract.
- Supports wallet/session flows.
- Triggers ownership re-check for instant access after purchase.

---

## Important Modules

- `lib/kms/client.ts`: stores/retrieves AES keys from KMS worker.
- `lib/kms/encryption.ts`: AES-CTR chunk encryption/decryption.
- `lib/kms/streaming.ts`: progressive decrypted playback.
- `lib/crust/gateway.ts`: multi-gateway read failover.
- `lib/session-manager.ts`: session key creation/import/check/calls.
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

