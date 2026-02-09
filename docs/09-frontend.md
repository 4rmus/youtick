# Frontend Implementation

> **Next.js 16 Application with App Router**

## Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Framework | Next.js (App Router) | 16.0.10 |
| UI Library | React | 19.2.3 |
| Styling | Tailwind CSS | 4.x |
| Language | TypeScript | 5.x |
| Icons | Lucide React | Latest |
| Dialogs | Radix UI | Latest |

## Project Structure

```
apps/web/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Landing page
│   ├── upload/
│   │   └── page.tsx        # Video upload
│   ├── discover/
│   │   └── page.tsx        # Browse events
│   ├── watch/
│   │   └── page.tsx        # Video playback
│   ├── profile/
│   │   └── page.tsx        # User dashboard
│   ├── claim/
│   │   └── page.tsx        # Gift claiming
│   ├── ticket/
│   │   └── [cid]/
│   │       └── page.tsx    # Purchase page
│   └── api/                # API routes
│       ├── near-rpc/
│       └── video/access/
├── components/
│   ├── IpfsPlayer.tsx      # Decrypted video player
│   ├── UploadForm.tsx      # Upload wizard
│   ├── Navigation.tsx      # Header navigation
│   ├── WalletButton.tsx    # Wallet connection
│   └── ui/                 # Reusable UI components
├── hooks/
│   ├── useNear.ts          # NEAR wallet hook
│   ├── useNova.ts          # Nova Protocol hook
│   └── useSession.ts       # Session key management
├── lib/
│   ├── near.ts             # NEAR configuration
│   ├── nova/               # Nova SDK integration
│   ├── session-manager.ts  # Session keys
│   └── gift-service.ts     # Gift system
└── public/
    └── locales/            # i18n files
        └── en.json
```

## Key Components

### UploadForm.tsx

Handles the complete upload workflow:

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
1. `session` - Creating session key
2. `group` - Creating Nova group
3. `encrypt` - Encrypting and uploading video
4. `mint` - Minting NFT
5. `complete` - Success

### IpfsPlayer.tsx

Decrypted video player for ticket holders:

```typescript
function IpfsPlayer({ eventCid, groupId }: { eventCid: string, groupId: string }) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadVideo() {
      // 1. Check ownership
      const hasAccess = await verifyOwnership(accountId, eventCid);
      if (!hasAccess) {
        setError("You don't own a ticket for this video");
        return;
      }

      // 2. Verify Nova membership
      const isMember = await nova.verifyMembership({ groupId, accountId });
      if (!isMember) {
        setError("Not authorized to view this content");
        return;
      }

      // 3. Download and decrypt via Nova
      const decryptedVideo = await nova.downloadFile({
        groupId,
        cid: eventCid,
        accountId
      });

      // 4. Create blob URL
      setVideoUrl(URL.createObjectURL(decryptedVideo));
    }

    loadVideo();

    // Cleanup
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [eventCid, groupId]);

  if (error) return <ErrorDisplay message={error} />;
  if (!videoUrl) return <LoadingSpinner />;

  return <video src={videoUrl} controls />;
}
```

## Hooks

### useNear.ts

```typescript
export function useNear() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);

  async function signIn() {
    const selector = await setupWalletSelector(nearConfig);
    const wallet = await selector.wallet("my-near-wallet");
    const accounts = await wallet.signIn({ contractId: CONTRACT_ID });

    setWallet(wallet);
    setAccountId(accounts[0].accountId);
  }

  async function signOut() {
    await wallet?.signOut();
    setWallet(null);
    setAccountId(null);
  }

  return { wallet, accountId, signIn, signOut };
}
```

### useNova.ts

```typescript
export function useNova() {
  const [nova, setNova] = useState<NovaSDK | null>(null);

  useEffect(() => {
    const sdk = new NovaSDK({
      networkId: 'testnet',
      contractId: 'nova.testnet',
      shadeAgentUrl: 'https://shade-testnet.phala.network'
    });
    setNova(sdk);
  }, []);

  return nova;
}
```

### useSession.ts

```typescript
export function useSession(wallet: Wallet) {
  const [hasSession, setHasSession] = useState(false);

  async function setupSession() {
    const manager = new SessionManager();
    await manager.createSession(wallet);
    setHasSession(true);
  }

  async function signWithSession(method: string, args: object) {
    const manager = new SessionManager();
    return manager.signWithSession(method, args);
  }

  return { hasSession, setupSession, signWithSession };
}
```

## Error Handling

### Retry Mechanism

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

      // Exponential backoff
      await delay(Math.pow(2, i) * 1000);
    }
  }

  throw lastError!;
}
```

### Nova Error Handler

```typescript
import { NovaError, ErrorCode } from 'nova-sdk-js';

async function handleNovaOperation() {
  try {
    await nova.downloadFile({ groupId, cid, accountId });
  } catch (error) {
    if (error instanceof NovaError) {
      switch (error.code) {
        case ErrorCode.UNAUTHORIZED:
          showPurchasePrompt();
          break;
        case ErrorCode.SHADE_AGENT_ERROR:
          await retryWithBackoff(() => nova.downloadFile({ groupId, cid, accountId }));
          break;
        default:
          toast.error('An unexpected error occurred');
      }
    }
  }
}
```

## Performance Optimizations

### Code Splitting

```typescript
// Only load video player when needed
const IpfsPlayer = dynamic(() => import("./IpfsPlayer"), {
  loading: () => <LoadingSpinner />,
  ssr: false
});
```

### Nova SDK Singleton

```typescript
// lib/nova/index.ts
let novaInstance: NovaSDK | null = null;

export function getNovaSDK(): NovaSDK {
  if (!novaInstance) {
    novaInstance = new NovaSDK({
      networkId: process.env.NEXT_PUBLIC_NOVA_NETWORK,
      contractId: process.env.NEXT_PUBLIC_NOVA_CONTRACT_ID,
      shadeAgentUrl: process.env.NEXT_PUBLIC_NOVA_SHADE_AGENT_URL
    });
  }
  return novaInstance;
}
```

### Resource Cleanup

```typescript
// Clean up blob URLs after video playback
useEffect(() => {
  return () => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
  };
}, [videoUrl]);
```

## Development Commands

```bash
# Start development server
npm run dev

# Production build
npm run build

# Start production server
npm run start

# Run linter
npm run lint

# Type checking
npx tsc --noEmit
```

---

**Previous**: [← Security](./08-security.md) | **Back to**: [Documentation Index](./README.md)
