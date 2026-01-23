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
│       ├── lighthouse/upload/
│       └── video/access/
├── components/
│   ├── IpfsPlayer.tsx      # Decrypted video player
│   ├── UploadForm.tsx      # Upload wizard
│   ├── Navigation.tsx      # Header navigation
│   ├── WalletButton.tsx    # Wallet connection
│   └── ui/                 # Reusable UI components
├── hooks/
│   ├── useNear.ts          # NEAR wallet hook
│   ├── useLit.ts           # Lit Protocol hook
│   └── useSession.ts       # Session key management
├── lib/
│   ├── near.ts             # NEAR configuration
│   ├── lit.ts              # Lit Protocol service
│   ├── lighthouse.ts       # IPFS uploads
│   ├── session-manager.ts  # Session keys
│   ├── chain-signatures.ts # MPC signing
│   └── access-conditions.ts # Lit ACCs
└── public/
    └── locales/            # i18n files
        ├── en.json
        └── tr.json
```

## Key Components

### UploadForm.tsx

Handles the complete upload workflow:

```typescript
// Simplified upload flow
async function handleUpload(file: File, metadata: EventMetadata) {
  setStep("session");
  const sessionKey = await setupSession();
  
  setStep("address");
  const ethAddress = await deriveEthAddress(accountId);
  
  setStep("encrypt");
  const encrypted = await encryptVideo(file, ethAddress);
  
  setStep("upload");
  const cid = await uploadToIPFS(encrypted.ciphertext);
  
  setStep("mint");
  await mintNFT(cid, metadata);
  
  setStep("complete");
}
```

**Progress States:**
1. `session` - Creating session key
2. `address` - Deriving MPC address
3. `encrypt` - Encrypting video
4. `upload` - Uploading to IPFS
5. `mint` - Minting NFT
6. `complete` - Success

### IpfsPlayer.tsx

Decrypted video player for ticket holders:

```typescript
function IpfsPlayer({ eventCid }: { eventCid: string }) {
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
      
      // 2. Fetch encrypted content
      const encrypted = await fetchFromIPFS(eventCid);
      
      // 3. Decrypt
      const decrypted = await decryptVideo(encrypted, sessionSigs, eventCid);
      
      // 4. Create blob URL
      setVideoUrl(URL.createObjectURL(decrypted));
    }
    
    loadVideo();
  }, [eventCid]);
  
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

## Internationalization

YouTick supports Turkish and English:

```typescript
// hooks/useLocale.ts
export function useLocale() {
  const [locale, setLocale] = useState("en");
  const [messages, setMessages] = useState<Record<string, string>>({});
  
  useEffect(() => {
    import(`../public/locales/${locale}.json`)
      .then(setMessages);
  }, [locale]);
  
  function t(key: string): string {
    return messages[key] || key;
  }
  
  return { locale, setLocale, t };
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

### Popup Blocked Handler

```typescript
async function handleRetrySign() {
  // For MPC operations that might fail due to popup blocking
  try {
    const result = await signWithMPC(wallet, payload);
    return result;
  } catch (error) {
    if (error.message.includes("popup")) {
      // Show manual retry button
      showRetryButton();
    }
    throw error;
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

### Session Caching

```typescript
// Cache session signatures for 7 days
const SESSION_CACHE_KEY = "lit_session_cache";
const SESSION_EXPIRY = 7 * 24 * 60 * 60 * 1000;

function getCachedSession(): SessionSigs | null {
  const cached = localStorage.getItem(SESSION_CACHE_KEY);
  if (!cached) return null;
  
  const { sigs, timestamp } = JSON.parse(cached);
  if (Date.now() - timestamp > SESSION_EXPIRY) {
    localStorage.removeItem(SESSION_CACHE_KEY);
    return null;
  }
  
  return sigs;
}
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
