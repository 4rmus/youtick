# Frontend Implementation

> **Next.js 16 Application with App Router** -- React 19, TypeScript, and decentralized service integration

---

## Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Framework | Next.js (App Router) | 16.0.10 |
| UI Library | React | 19.2.3 |
| Styling | Tailwind CSS | 4.x |
| Language | TypeScript | 5.x |
| Icons | Lucide React | Latest |
| Dialogs/Primitives | Radix UI | Latest |

---

## Project Structure

```
apps/web/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Landing page
│   ├── claim/
│   │   └── page.tsx            # Gift ticket claiming
│   ├── discover/
│   │   └── page.tsx            # Browse and discover events
│   ├── profile/
│   │   └── page.tsx            # User profile and owned tickets
│   ├── ticket/
│   │   ├── page.tsx            # Ticket listing view
│   │   └── [cid]/
│   │       └── page.tsx        # Individual ticket purchase page
│   ├── trial/
│   │   └── page.tsx            # Trial account onboarding
│   └── api/                    # API routes
│       ├── nova-proxy/
│       │   └── [...path]/
│       │       └── route.ts    # Nova API proxy
│       └── trial/
│           └── sponsored/
│               └── route.ts    # Sponsored trial creation
├── components/
│   ├── UploadForm.tsx          # Upload wizard (session, group, encrypt, mint)
│   ├── IpfsPlayer.tsx          # Decrypted video player
│   ├── TicketPurchaseCard.tsx   # Ticket purchase flow
│   ├── GiftLinkGenerator.tsx    # Gift link creation
│   ├── NovaThumbnail.tsx       # Nova/IPFS thumbnail component
│   ├── NovaAccessSync.tsx     # Auto-sync Nova group memberships
│   ├── VideoCard.tsx          # Video card display component
│   ├── AccountSetupDialog.tsx # Account setup wizard
│   ├── DecentralizationBadge.tsx # Live decentralization metrics
│   ├── MintButton.tsx          # NFT minting trigger
│   ├── OnboardingKeyInit.tsx   # Trial account key setup
│   ├── TrialOnboarding.tsx     # Trial user onboarding flow
│   ├── TrialUpgradeDialog.tsx  # Trial-to-full account upgrade
│   └── ui/                     # Reusable UI primitives (Button, Input, etc.)
├── hooks/
│   ├── useAllVideos.ts         # Browse all events from contract
│   ├── useOwnedTokens.ts      # User's NFT tickets
│   ├── useNovaAccessSync.ts   # Nova access synchronization
│   └── useEventDescription.ts # Event metadata + thumbnail
├── lib/
│   ├── constants.ts            # App-wide configuration constants
│   ├── errors.ts               # Standardized error classes and codes
│   ├── env.ts                  # Environment variable validation
│   ├── session-manager.ts      # NEAR session key management
│   ├── gift-service.ts         # Gift link generation and claiming
│   ├── batch-transactions.ts   # Batched NEAR transaction helpers
│   ├── rate-limiter.ts         # Rate limiting with file persistence
│   ├── metadata-parser.ts      # Title/thumbnail metadata extraction
│   ├── translations.ts         # i18n translation strings
│   ├── decentralization-metrics.ts # Live decentralization scoring
│   ├── nova/                   # Nova Protocol integration (12 modules)
│   │   ├── index.ts            # Module entry point, singleton
│   │   ├── client.ts           # Upload/download with TEE encryption
│   │   ├── auth.ts             # Authentication token generation
│   │   ├── config.ts           # Nova SDK configuration
│   │   ├── groups.ts           # Group management utilities
│   │   ├── types.ts            # TypeScript type definitions
│   │   ├── costs.ts            # Group registration cost checks
│   │   ├── attestation.ts      # TEE attestation verification
│   │   ├── key-storage.ts      # AES key storage in Nova TEE
│   │   ├── post-purchase.ts    # Post-purchase Nova group membership
│   │   ├── pending-access-queue.ts # Retry failed group additions
│   │   └── public-groups.ts    # Public group management (thumbnails)
│   ├── crust/                  # Crust Network IPFS integration (7 modules)
│   └── crypto/                 # Cryptographic utilities
│       ├── aes-gcm.ts          # AES-256-GCM encryption
│       └── aes-ctr-chunked.ts  # AES-CTR for large file streaming
└── public/
    └── locales/                # i18n translation files
```

---

## Key Components

### UploadForm.tsx

Handles the complete upload workflow: session key setup, Nova group creation, client-side encryption, Crust upload, and NFT minting.

```typescript
// Simplified upload flow
async function handleUpload(file: File, metadata: EventMetadata) {
  setStep("session");
  const sessionKey = await setupSession();

  setStep("group");
  const groupId = await nova.createGroup({ name: `video-${uuid}` });

  setStep("encrypt");
  const result = await nova.uploadFile({ groupId, file });

  setStep("mint");
  await mintNFT(result.cid, groupId, metadata);

  setStep("complete");
}
```

**Progress States:**

| Step | Label | Description |
|------|-------|-------------|
| `session` | Creating Session Key | One-time wallet signature for signless UX |
| `group` | Creating Nova Group | Access control group on Nova Protocol |
| `encrypt` | Encrypting and Uploading | AES-256-GCM encryption + Crust upload |
| `mint` | Minting NFT | On-chain event creation and NFT mint |
| `complete` | Success | Upload finished, video is live |

### IpfsPlayer.tsx

Decrypted video player for ticket holders. Performs a three-step verification: on-chain ownership check, Nova group membership verification, then decryption and playback.

```typescript
function IpfsPlayer({ eventCid, groupId }: { eventCid: string; groupId: string }) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadVideo() {
      // 1. Check on-chain NFT ownership
      const hasAccess = await verifyOwnership(accountId, eventCid);
      if (!hasAccess) {
        setError("You don't own a ticket for this video");
        return;
      }

      // 2. Verify Nova group membership
      const isMember = await nova.verifyMembership({ groupId, accountId });
      if (!isMember) {
        setError("Not authorized to view this content");
        return;
      }

      // 3. Download encrypted data and decrypt via Nova
      const decryptedVideo = await nova.downloadFile({
        groupId,
        cid: eventCid,
        accountId
      });

      // 4. Create blob URL for playback
      setVideoUrl(URL.createObjectURL(decryptedVideo));
    }

    loadVideo();

    // Cleanup blob URL on unmount
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [eventCid, groupId]);

  if (error) return <ErrorDisplay message={error} />;
  if (!videoUrl) return <LoadingSpinner />;

  return <video src={videoUrl} controls />;
}
```

### TicketPurchaseCard.tsx

Displays event details (title, price, thumbnail) and handles the purchase flow. Uses `useSessionState` for cached session key checks and `useIsCreator` to detect if the current user is the video creator.

Key responsibilities:
- Fetches event details from the contract (`get_event`)
- Parses title metadata for thumbnail extraction
- Handles both wallet-signed and session-key-based purchases
- Triggers Nova group membership addition post-purchase via `addBuyerToNovaGroup`

### GiftLinkGenerator.tsx

Allows creators to generate gift links for their events. Each link contains an Access Key that lets the recipient claim a ticket without needing an existing NEAR wallet.

Key responsibilities:
- Configurable ticket count per batch
- Calculates cost per link (ticket price + 0.12 NEAR overhead for account creation)
- Creates gift drops on-chain with scoped access keys
- Provides copy-to-clipboard and download functionality for generated links

### NovaThumbnail.tsx

Handles thumbnail display from both `nova://` URLs and legacy IPFS URLs. For Nova URLs, it parses the group ID and CID, auto-joins public groups, and resolves the image through Crust gateways.

Features:
- Module-level URL resolution cache for performance
- Automatic `nova://` URL parsing via `parseNovaUrl`
- Public group auto-join for thumbnails
- Fallback chain: Nova resolution, then IPFS gateway, then placeholder
- Loading and error states with graceful degradation

### DecentralizationBadge.tsx

Displays a real-time composite decentralization score with an expandable per-layer breakdown. Updates reactively as operations complete.

```typescript
// Layer breakdown: NEAR Protocol, Nova TEE, Crust Storage
// Composite score: weighted average across all layers
// Color coding: green (95%+), yellow (85-94%), red (<85%)
```

---

## Hooks

### useAllVideos.ts

Fetches all events from the smart contract and transforms them into a display-ready format. Used on the browse/discover page.

```typescript
export function useAllVideos() {
  const [tokens, setTokens] = useState<TokenWithVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchVideos = async () => {
      // Fetch events from contract via JsonRpcProvider
      const events = await viewContract<unknown[]>(
        provider, NFT_CONTRACT_ID, 'get_events', { limit: 200 }
      );

      // Transform events into TokenWithVideo format
      const eventTokens = events.map(([cid, event]) => ({
        token_id: `event-${index}`,
        owner_id: event.creator_id,
        metadata: {
          title: parseTitleMetadata(event.title).title,
          description: event.description,
          media: parseTitleMetadata(event.title).thumbnailUrl,
        },
        video_metadata: {
          encrypted_cid: cid,
          price: event.price
        }
      }));

      setTokens(eventTokens.reverse());
    };

    fetchVideos();
  }, []);

  return { tokens, loading, error, debugInfo };
}
```

### useOwnedTokens.ts

Fetches the current user's owned NFT tickets from the contract. Relies on the wallet provider for the connected `accountId`.

```typescript
export function useOwnedTokens() {
  const { accountId } = useWallet();
  const [tokens, setTokens] = useState<TokenWithVideo[]>([]);

  useEffect(() => {
    if (!accountId) { setTokens([]); return; }

    // Calls get_tokens_with_video which returns Vec<(Token, Option<VideoMetadata>)>
    const result = await viewContract<[any, any][]>(
      provider, NFT_CONTRACT_ID, 'get_tokens_with_video',
      { account_id: accountId, limit: 50 }
    );

    // Maps contract data to UI-ready TokenWithVideo format
    // Uses parseTitleMetadata for thumbnail extraction
  }, [accountId]);

  return { tokens, loading, error };
}
```

### useEventDescription.ts

Fetches event metadata (description, thumbnail, creator) for a given encrypted CID. Used on ticket detail pages.

```typescript
export function useEventDescription(encrypted_cid: string | null) {
  const [description, setDescription] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [creatorId, setCreatorId] = useState<string | null>(null);

  useEffect(() => {
    // Calls get_event on the contract
    // Parses title metadata for thumbnail extraction
    // Returns description, thumbnailUrl, creatorId, loading
  }, [encrypted_cid]);

  return { description, thumbnailUrl, creatorId, loading };
}
```

---

## Error Handling

### Standardized Error Classes

YouTick uses a structured `AppError` class with error codes for consistent error handling across the application.

```typescript
import { AppError, ErrorCodes, isRetryableError } from '@/lib/errors';

// Error codes cover: rate limiting, network, auth, contract,
// Nova/TEE, IPFS, validation, and configuration
throw new AppError(ErrorCodes.RATE_LIMITED, 'Too many requests', true);
```

### Retry Mechanism with Exponential Backoff

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      // Exponential backoff: 1s, 2s, 4s
      await delay(Math.pow(2, i) * 1000);
    }
  }

  throw lastError!;
}
```

### Nova Error Handler

```typescript
import { NovaError } from '@/lib/nova/types';

async function handleNovaOperation() {
  try {
    await nova.downloadFile({ groupId, cid, accountId });
  } catch (error) {
    if (error instanceof NovaError) {
      switch (error.code) {
        case 'ACCESS_DENIED':
          showPurchasePrompt();
          break;
        case 'TEE_UNAVAILABLE':
          await retryWithBackoff(() =>
            nova.downloadFile({ groupId, cid, accountId })
          );
          break;
        case 'ATTESTATION_FAILED':
          showAttestationWarning();
          break;
        default:
          toast.error('An unexpected error occurred');
      }
    }
  }
}
```

**Nova Error Codes Reference:**

| Code | Description | Retryable |
|------|-------------|-----------|
| `NO_SESSION_KEY` | Session key not found in localStorage | No (requires setup) |
| `AUTH_FAILED` | Nova authentication failed | No |
| `TEE_UNAVAILABLE` | Shade Agent is down or unreachable | Yes |
| `UPLOAD_FAILED` | File upload to Nova/Crust failed | Yes |
| `FETCH_FAILED` | File fetch or decryption failed | Yes |
| `ACCESS_DENIED` | User not authorized for this content | No |
| `NOT_FOUND` | File not found on IPFS | No |
| `GROUP_CREATE_FAILED` | Group creation failed | Yes |
| `GROUP_ADD_FAILED` | Failed to add member to group | Yes |
| `INVALID_CONFIG` | Invalid Nova configuration | No |
| `NETWORK_ERROR` | Network timeout or connection error | Yes |
| `ATTESTATION_FAILED` | TEE attestation verification failed | No |

---

## Performance Optimizations

### Code Splitting with Dynamic Imports

Heavy components like the video player are loaded only when needed, reducing initial bundle size.

```typescript
import dynamic from 'next/dynamic';

// Only load video player when needed (no SSR -- uses browser APIs)
const IpfsPlayer = dynamic(() => import("./IpfsPlayer"), {
  loading: () => <LoadingSpinner />,
  ssr: false
});
```

### Nova SDK Singleton

The Nova SDK is instantiated once and reused across the application to avoid redundant initialization.

```typescript
// lib/nova/config.ts
let _sdkInstance: NovaSDK | null = null;

export function getNovaSdk(): NovaSDK {
  if (!_sdkInstance) {
    _sdkInstance = new NovaSDK({
      networkId: currentConfig.network,
      apiKey: currentConfig.apiKey,
      novaAccountId: currentConfig.novaAccountId,
    });
  }
  return _sdkInstance;
}
```

### Resource Cleanup

Blob URLs created for video playback are revoked on component unmount to prevent memory leaks.

```typescript
useEffect(() => {
  return () => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
  };
}, [videoUrl]);
```

### Thumbnail URL Caching

The `NovaThumbnail` component uses a module-level cache to avoid repeated URL resolution for the same thumbnail.

```typescript
// Module-level cache: resolved URLs persist across re-renders
const resolvedUrlCache = new Map<string, string>();
```

### RPC Failover

All NEAR RPC calls use automatic failover across multiple endpoints to handle network issues without user-facing errors.

```
Failover chain: fastnear.com -> rpc.mainnet.near.org -> near.lava.build
```

---

## Development Commands

```bash
# Start development server (hot reload)
npm run dev

# Production build (includes type checking)
npm run build

# Start production server
npm run start

# Run ESLint
npm run lint

# TypeScript type checking (no emit)
npx tsc --noEmit
```

---

Back to [Documentation Index](./README.md)
