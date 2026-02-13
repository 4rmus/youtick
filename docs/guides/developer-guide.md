# Developer Guide

> Development workflow and patterns for YouTick contributors

---

## Project Architecture

```
youtick/
├── apps/web/              # Frontend (Next.js 16 App Router)
│   ├── app/               # Pages and API routes
│   ├── components/        # React components (54+)
│   ├── hooks/             # Custom React hooks
│   └── lib/               # Business logic
│       ├── nova/          # Nova Protocol SDK integration
│       ├── crust/         # Crust Network storage
│       ├── crypto/        # Encryption utilities
│       └── *.ts           # Session, gift, batch, utils
├── contracts/nft-ticket/  # NEAR smart contract (Rust)
└── docs/                  # Documentation
```

### Key Directories

| Directory | Purpose | Key Files |
|-----------|---------|-----------|
| `app/` | Next.js App Router pages | `layout.tsx`, `page.tsx`, route groups |
| `components/` | Reusable React components | `UploadForm`, `IpfsPlayer`, `TicketPurchaseCard` |
| `hooks/` | Data fetching hooks | `useAllVideos`, `useOwnedTokens`, `useNearPrice` |
| `lib/nova/` | Nova TEE encryption | `client.ts`, `groups.ts`, `auth.ts`, `config.ts` |
| `lib/crust/` | IPFS storage | `client.ts`, `gateway.ts`, `storage-order.ts` |
| `lib/crypto/` | Encryption primitives | `aes-gcm.ts`, `aes-ctr-chunked.ts` |
| `contracts/` | Rust smart contract | `lib.rs` (2400+ lines) |

---

## Development Workflow

### 1. Start Development

```bash
cd apps/web
npm install
cp .env.example .env.local   # Configure env vars
npm run dev                   # localhost:3000
```

### 2. Make Changes

- **Components**: Edit files in `components/`
- **Business logic**: Edit files in `lib/`
- **Pages/routes**: Edit files in `app/`
- **Hooks**: Edit or create files in `hooks/`

### 3. Test Changes

```bash
npm test                      # Run test suite
npm run lint                  # Lint check
npm run build                 # Verify production build
```

### 4. Submit PR

```bash
git checkout -b feature/your-feature
git add <files>
git commit -m "feat(frontend): add new feature"
git push origin feature/your-feature
```

---

## Key Patterns

### Data Fetching (React Query)

All blockchain data fetching uses TanStack React Query:

```typescript
import { useQuery } from '@tanstack/react-query';

const { data, isLoading, error } = useQuery({
  queryKey: ['event', cid],
  queryFn: () => viewContract(provider, contractId, 'get_event', { encrypted_cid: cid }),
  staleTime: 60_000,      // Cache for 1 min
  gcTime: 5 * 60_000,     // Keep in cache for 5 min
});
```

**Query key patterns:**
- `['walletBalance', accountId]`
- `['createdEvents', accountId]`
- `['ownedTokens', accountId]`
- `['allVideos', page]`
- `['event', cid]`

### NEAR Wallet Integration

Access wallet state via the `useWallet` hook from `WalletProvider`:

```typescript
const { accountId, isTrial, signIn, signOut } = useWallet();

// Call view method (read-only, no signature)
const result = await viewContract(provider, contractId, 'get_event', { encrypted_cid });

// Call change method (requires signature or session key)
await callContract(wallet, contractId, 'buy_ticket', {
  receiver_id: accountId,
  encrypted_cid: cid,
}, deposit);
```

### Nova Integration Pattern

The standard flow for Nova-encrypted content:

```typescript
// 1. Create group (upload time)
import { createNovaGroup } from '@/lib/nova/groups';
const groupId = await createNovaGroup(accountId, videoUuid);

// 2. Encrypt file (upload time)
import { encryptWithNova } from '@/lib/nova/client';
const encryptedBlob = await encryptWithNova(groupId, fileBuffer);

// 3. Add member (purchase time)
import { addBuyerToNovaGroup } from '@/lib/nova/post-purchase';
await addBuyerToNovaGroup(eventCid, buyerAccountId);

// 4. Decrypt file (playback time)
import { decryptWithNova } from '@/lib/nova/client';
const decryptedBuffer = await decryptWithNova(groupId, encryptedBlob);
```

### Session Key Management

```typescript
import { getOrCreateSessionKey } from '@/lib/session-manager';

// Check for cached session key, create if needed
const sessionKey = await getOrCreateSessionKey(wallet, contractId);
// Returns: { publicKey, privateKey, expiry }

// Session keys enable signless transactions
await callContractWithSessionKey(sessionKey, contractId, 'create_event_prepaid', args);
```

### Error Handling

Non-blocking error pattern for Nova operations:

```typescript
import { pendingAccessQueue } from '@/lib/nova/pending-access-queue';

try {
  await addBuyerToNovaGroup(cid, accountId);
} catch (error) {
  // Queue for retry — don't block the purchase flow
  pendingAccessQueue.add(cid, accountId);
  console.warn('[Nova] Queued for retry:', error.message);
}
```

### i18n Translation Pattern

```typescript
import { useLanguage } from '@/components/providers/LanguageContext';

const { t } = useLanguage();

// Access translations
<h1>{t.discover_page.title}</h1>
<p>{t.discover_page.subtitle}</p>

// Translations defined in lib/translations.ts
// Supports: 'en' | 'tr'
```

---

## Common Tasks

### Adding a New Page

1. Create directory in `app/`:
```
app/your-page/
├── page.tsx        # Main page component
└── layout.tsx      # Optional layout wrapper
```

2. Use `'use client'` directive for interactive pages:
```typescript
'use client';

import { useWallet } from '@/components/providers/WalletProvider';

export default function YourPage() {
  const { accountId } = useWallet();
  // ...
}
```

### Creating a New Component

1. Create file in `components/`:
```typescript
// components/YourComponent.tsx
'use client';

interface YourComponentProps {
  title: string;
  onAction: () => void;
}

export function YourComponent({ title, onAction }: YourComponentProps) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <button onClick={onAction} className="btn-primary mt-4">
        Action
      </button>
    </div>
  );
}
```

### Adding a Contract Method Call

```typescript
// View method (read-only)
const events = await viewContract(
  provider,
  contractId,
  'get_events',
  { from_index: '0', limit: 50 }
);

// Change method (with attached deposit)
const result = await wallet.callMethod({
  contractId,
  method: 'buy_ticket',
  args: { receiver_id: accountId, encrypted_cid: cid },
  deposit: parseNearAmount('1.02'),
  gas: '100000000000000',  // 100 TGas
});
```

### Implementing a New Hook

```typescript
// hooks/useYourHook.ts
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/components/providers/WalletProvider';

export function useYourHook() {
  const { accountId } = useWallet();

  return useQuery({
    queryKey: ['yourData', accountId],
    queryFn: async () => {
      // Fetch data
      return data;
    },
    enabled: !!accountId,  // Only fetch when wallet connected
    staleTime: 60_000,
  });
}
```

### Adding Translations

Edit `lib/translations.ts`:

```typescript
export const translations = {
  en: {
    your_page: {
      title: "Your Page Title",
      description: "Your page description",
    },
  },
  tr: {
    your_page: {
      title: "Sayfa Başlığınız",
      description: "Sayfa açıklamanız",
    },
  },
};
```

---

## Smart Contract Development

### Safety Rules

1. **Never modify `lib.rs` without understanding the full impact**
2. **Always test on testnet dev accounts** — never production
3. **State migrations require 2+ maintainer review**
4. **All changes require integration tests**

### Contract Method Pattern

```rust
// View method (read-only, no gas cost)
pub fn get_event(&self, encrypted_cid: String) -> Option<EventResponse> {
    self.events.get(&encrypted_cid).map(|event| EventResponse {
        title: event.title.clone(),
        // ...
    })
}

// Change method (requires gas + deposit)
#[payable]
pub fn create_event(&mut self, encrypted_cid: String, title: String, /* ... */) {
    require!(env::attached_deposit() >= NearToken::from_millinear(100), "Deposit required");
    // ...
}
```

### Testing Contract Changes

```bash
# 1. Build
cd contracts/nft-ticket
cargo build --target wasm32-unknown-unknown --release

# 2. Create dev account
near create-account dev-$(date +%s).testnet --useFaucet

# 3. Deploy
near deploy dev-xxx.testnet target/wasm32-unknown-unknown/release/nft_ticket.wasm \
  --initFunction new --initArgs '{"owner_id":"dev-xxx.testnet"}'

# 4. Test methods
near view dev-xxx.testnet nft_metadata '{}'
```

---

## Provider Hierarchy

Understanding the provider stack is essential for component development:

```
<ThemeProvider>          # Dark/light theme
  <QueryProvider>       # React Query client
    <EvmProvider>       # EVM chain support
      <LanguageProvider> # i18n context
        <WalletProvider> # NEAR wallet state
          <NovaAccessSync>   # Auto-sync Nova memberships
          <OnboardingKeyInit> # Trial account keys
          <Navbar />
          {children}         # Page content
        </WalletProvider>
      </LanguageProvider>
    </EvmProvider>
  </QueryProvider>
</ThemeProvider>
```

**Access patterns:**
- `useWallet()` — Account ID, trial status, sign in/out
- `useLanguage()` — Translation strings, language toggle
- `useTheme()` — Theme mode toggle
- `useQueryClient()` — Query cache management

---

**Related:** [Testing Guide](../testing.md) · [Contributing](../contributing.md) · [Architecture](../architecture/README.md)
