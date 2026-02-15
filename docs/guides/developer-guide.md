# YouTick Developer Guide

> Complete onboarding and workflow reference for YouTick contributors.
> YouTick is a decentralized video-on-demand platform built on NEAR Protocol,
> using Nova Protocol for TEE-based encryption and IPFS for storage.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Repository Setup](#2-repository-setup)
3. [Environment Configuration](#3-environment-configuration)
4. [Development Workflow](#4-development-workflow)
5. [Smart Contract Development](#5-smart-contract-development)
6. [Project Architecture](#6-project-architecture)
7. [Key Development Patterns](#7-key-development-patterns)
8. [Testing](#8-testing)
9. [Deployment](#9-deployment)
10. [Common Tasks](#10-common-tasks)
11. [Troubleshooting](#11-troubleshooting)
12. [Code Style and Conventions](#12-code-style-and-conventions)

---

## 1. Prerequisites

Install the following tools before setting up the project.

### Required Software

| Tool | Version | Purpose | Install |
|------|---------|---------|---------|
| **Node.js** | 20+ (LTS) | Frontend runtime | [nodejs.org](https://nodejs.org/) |
| **npm** | 10+ | Package manager | Included with Node.js |
| **Rust** | Latest stable | Smart contract development | [rustup.rs](https://rustup.rs/) |
| **NEAR CLI** | Latest | Blockchain interaction | `npm i -g near-cli-rs` |
| **Git** | 2.30+ | Version control | [git-scm.com](https://git-scm.com/) |

### Rust Toolchain Setup

After installing Rust via `rustup`, add the WebAssembly compilation target:

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add the WASM target for NEAR smart contracts
rustup target add wasm32-unknown-unknown

# Install cargo-near for contract builds (optional but recommended)
cargo install cargo-near
```

### Verify Installation

```bash
node --version       # v20.x or higher
npm --version        # 10.x or higher
rustc --version      # 1.75+ recommended
cargo --version      # Matches rustc version
near --version       # near-cli-rs
git --version        # 2.30+
```

> [!NOTE]
> The Rust toolchain is only required if you plan to work on the smart contract.
> Frontend-only contributors can skip the Rust installation.

---

## 2. Repository Setup

### Clone and Install

```bash
# Clone the repository
git clone https://github.com/AirCloudy/youtick-demo.git
cd youtick-demo

# Install frontend dependencies
cd apps/web
npm install

# Return to project root
cd ../..
```

### Build the Smart Contract (Optional)

Only needed if you are working on the Rust contract:

```bash
cd contracts/nft-ticket

# Standard build
cargo build --target wasm32-unknown-unknown --release

# Or use cargo-near (generates reproducible WASM)
cargo near build

# Return to project root
cd ../..
```

### Run the Setup Script

A helper script is provided for initial environment preparation:

```bash
./scripts/setup-claude-dev.sh
```

This script creates skill directories, builds MCP servers, and configures tooling settings.

---

## 3. Environment Configuration

Create the file `apps/web/.env.local` by copying the example:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Then edit `apps/web/.env.local` with your configuration values.

### Environment Variable Reference

#### NEAR Configuration (Required)

```bash
# The NEAR network to connect to. Use "mainnet" for production.
NEXT_PUBLIC_NEAR_NETWORK=mainnet

# The NFT smart contract account ID.
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
```

These two variables are **required** for the application to start. The `validateEnv()` function in `lib/env.ts` checks for their presence at startup and throws an error if they are missing.

#### Nova Protocol (TEE Encryption)

```bash
# Network for Nova SDK operations.
NEXT_PUBLIC_NOVA_NETWORK=mainnet

# The Nova smart contract account ID.
NEXT_PUBLIC_NOVA_CONTRACT_ID=nova-sdk.near

# Nova API key. SERVER-ONLY -- never exposed to the browser.
# Injected via a Cloudflare Worker proxy at runtime.
NOVA_API_KEY=<your-secret-nova-api-key>

# Set to "enabled" to indicate Nova is configured.
# This is NOT the real API key -- it is a boolean flag for the client.
NEXT_PUBLIC_NOVA_API_KEY=enabled

# Your Nova account ID for SDK authentication.
NEXT_PUBLIC_NOVA_ACCOUNT_ID=<your-nova-account>

# (Optional) Expected TEE enclave hash for attestation verification.
NEXT_PUBLIC_NOVA_ENCLAVE_HASH=

# (Optional) CORS proxy URL for Nova API calls (Cloudflare Worker).
NEXT_PUBLIC_NOVA_PROXY_URL=https://nova-proxy.xxx.workers.dev
```

> [!CAUTION]
> `NOVA_API_KEY` is a **server-only** secret. It must never appear in any
> `NEXT_PUBLIC_` variable. The client sends requests through a Cloudflare
> Worker proxy that injects this key at the edge. Leaking this key in
> client-side code exposes your Nova account to unauthorized usage.

#### Onboarding Key (Trial Accounts)

```bash
# Function Call Access Key for client-side trial account creation.
# This key is scoped to two contract methods only:
#   - create_sponsored_trial_direct
#   - claim_free_ticket_direct
# It cannot transfer funds or call other methods.
NEXT_PUBLIC_ONBOARDING_KEY=ed25519:<key>
```

> [!NOTE]
> The onboarding key is intentionally client-exposed. Its permissions are
> restricted to trial-creation methods only, with no ability to transfer
> NEAR or call arbitrary contract functions. This enables fully decentralized
> onboarding without a backend relayer.

#### Variable Naming Convention

| Prefix | Visibility | Usage |
|--------|-----------|-------|
| `NEXT_PUBLIC_` | Client + Server | Safe to expose in the browser bundle |
| No prefix | Server only | API keys, secrets, private keys |

Every `NEXT_PUBLIC_` variable is inlined into the JavaScript bundle at build time and visible to anyone inspecting the source. Treat these as public information.

---

## 4. Development Workflow

### Start the Development Server

```bash
cd apps/web
npm run dev
```

The application starts at [http://localhost:3000](http://localhost:3000).

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Next.js development server with hot reload |
| `npm run build` | Create a production build |
| `npm run build:web4` | Create a static export for Web4 decentralized hosting |
| `npm start` | Start the production server (requires `npm run build` first) |
| `npm run lint` | Run ESLint checks |
| `npm test` | Run the Vitest test suite |
| `npm run test:ui` | Run tests with the interactive Vitest UI |
| `npm run test:coverage` | Run tests and generate a coverage report |

### Branch Strategy

| Branch Pattern | Purpose | Base Branch |
|---------------|---------|-------------|
| `main` | Production-ready code | -- |
| `feature/*` | New features | `main` |
| `fix/*` | Bug fixes | `main` |

### Development Cycle

```
1. Create a feature branch
   git checkout -b feature/your-feature

2. Make changes and verify
   npm run lint
   npm test
   npm run build

3. Commit with a descriptive message
   git add <files>
   git commit -m "feat(scope): description of change"

4. Push and open a pull request
   git push origin feature/your-feature
```

### Commit Message Format

Follow the conventional commit format:

```
<type>(<scope>): <description>

Types: feat, fix, refactor, test, docs, chore, style, perf
Scopes: frontend, contract, nova, ipfs, session, gift, trial
```

Examples:

```
feat(nova): add group membership caching
fix(session): handle expired key rotation
refactor(contract): extract mint logic into helper
```

---

## 5. Smart Contract Development

### Safety Rules

> [!CAUTION]
> The YouTick smart contract manages real funds on NEAR mainnet. Follow these
> rules without exception.

1. **Never deploy to `youtick.near`** without explicit approval from the project owner.
2. **Always use testnet dev accounts** for development and testing.
3. **State migrations require review** by at least two maintainers.
4. **Test every change** with both unit tests and integration tests before proposing a merge.

### Development Workflow

```bash
# Step 1: Create a disposable testnet account
near create-account dev-$(date +%s).testnet --useFaucet

# Step 2: Build the contract
cd contracts/nft-ticket
cargo near build

# Step 3: Deploy to your dev account (NOT youtick.near)
near deploy dev-xxx.testnet \
  target/wasm32-unknown-unknown/release/youtick_nft.wasm

# Step 4: Initialize the contract
near call dev-xxx.testnet new_default_meta \
  '{"owner_id":"dev-xxx.testnet"}' \
  --accountId dev-xxx.testnet

# Step 5: Run the test suite
cargo test
cargo test -- --nocapture    # With printed output
```

### Contract Architecture

The contract is a single Rust crate at `contracts/nft-ticket/` built with:

- **NEAR SDK 5.5.0** -- Core blockchain SDK
- **near-contract-standards 5.5.0** -- NEP-171 (NFT) standard implementation

Key contract capabilities:

| Feature | Method(s) | Description |
|---------|-----------|-------------|
| Events | `create_event`, `get_event` | Video listing with metadata |
| Tickets | `buy_ticket`, `buy_ticket_prepaid` | NFT purchase (98% creator / 2% platform) |
| Prepaid | `deposit_funds`, `get_user_balance` | Session key balance management |
| Gifts | `create_gift_drop`, `claim_gift` | Access-key-based gift links |
| Trials | `create_sponsored_trial_direct` | Onboarding new users without a wallet |

### Writing a View Method

View methods are read-only and free to call:

```rust
pub fn get_event(&self, encrypted_cid: String) -> Option<EventResponse> {
    self.events.get(&encrypted_cid).map(|event| EventResponse {
        title: event.title.clone(),
        price: event.price,
        creator_id: event.creator_id.clone(),
        // ...
    })
}
```

### Writing a Change Method

Change methods modify state and require gas. Use the `#[payable]` attribute when the method accepts attached NEAR:

```rust
#[payable]
pub fn create_event(
    &mut self,
    encrypted_cid: String,
    nova_group_id: String,
    title: String,
    description: String,
    price: NearToken,
) {
    require!(
        env::attached_deposit() >= NearToken::from_millinear(100),
        "Requires 0.1 NEAR deposit"
    );
    // Implementation...
}
```

### Contract CLI Examples

```bash
# View an event
near view dev-xxx.testnet get_event '{"encrypted_cid":"Qm..."}'

# Create an event (0.1 NEAR deposit)
near call dev-xxx.testnet create_event \
  '{"encrypted_cid":"Qm...","nova_group_id":"group-123","title":"Demo","description":"A demo video","price":"1000000000000000000000000"}' \
  --accountId your-account.testnet --deposit 0.1

# Buy a ticket
near call dev-xxx.testnet buy_ticket \
  '{"receiver_id":"buyer.testnet","encrypted_cid":"Qm..."}' \
  --accountId buyer.testnet --deposit 1.01

# Check prepaid balance
near view dev-xxx.testnet get_user_balance '{"account_id":"user.testnet"}'
```

---

## 6. Project Architecture

### Directory Structure

```
youtick-demo/
├── apps/web/                    # Frontend application
│   ├── app/                     # Next.js App Router pages
│   │   ├── layout.tsx           # Root layout with providers
│   │   ├── page.tsx             # Landing page
│   │   ├── discover/            # Browse videos
│   │   ├── upload/              # Upload flow
│   │   ├── watch/               # Video playback
│   │   ├── mint/                # NFT minting
│   │   ├── profile/             # User profile
│   │   ├── ticket/              # Ticket details
│   │   ├── claim/               # Gift claim
│   │   ├── trial/               # Trial onboarding
│   │   ├── privacy/             # Privacy policy
│   │   ├── terms/               # Terms of service
│   │   └── api/                 # API routes (proxy, etc.)
│   ├── components/              # React components
│   │   ├── providers/           # Context providers (5)
│   │   │   ├── WalletProvider   # NEAR wallet state
│   │   │   ├── QueryProvider    # React Query client
│   │   │   ├── ThemeProvider    # Dark/light theme
│   │   │   ├── LanguageContext  # i18n (en/tr)
│   │   │   └── EvmProvider      # EVM chain support
│   │   ├── ui/                  # Radix UI primitives (shadcn/ui)
│   │   ├── landing/             # Landing page sections
│   │   ├── discover/            # Browse page components
│   │   ├── UploadForm.tsx       # Video upload flow
│   │   ├── IpfsPlayer.tsx       # Decrypted video playback
│   │   ├── TicketPurchaseCard   # Purchase UI
│   │   ├── VideoCard.tsx        # Video thumbnail card
│   │   └── Navbar.tsx           # Navigation bar
│   ├── hooks/                   # Custom React hooks
│   │   ├── useAllVideos.ts      # Fetch all listed videos
│   │   ├── useOwnedTokens.ts   # Fetch user's NFT tickets
│   │   ├── useNearPrice.ts     # NEAR/USD price feed
│   │   ├── useNovaAccessSync   # Auto-sync Nova memberships
│   │   └── useEventDescription # Parse event metadata
│   ├── lib/                     # Core business logic
│   │   ├── nova/                # Nova SDK integration (12 files)
│   │   ├── crypto/              # AES encryption (GCM + CTR)
│   │   ├── crust/               # IPFS storage via Crust
│   │   ├── evm/                 # EVM chain integration
│   │   ├── intents/             # One-click swap operations
│   │   ├── session-manager.ts   # NEAR session key management
│   │   ├── gift-service.ts      # Gift link generation
│   │   ├── constants.ts         # App + design system constants
│   │   ├── rpc-failover.ts      # Multi-endpoint RPC failover
│   │   ├── trial-wallet.ts      # Trial account wallet adapter
│   │   ├── translations.ts      # i18n strings (en/tr)
│   │   └── env.ts               # Environment variable validation
│   └── __tests__/               # Test files
│       ├── unit/                # Unit tests
│       ├── integration/         # Integration tests
│       ├── nova/                # Nova-specific tests
│       └── mocks/               # Test mocks and fixtures
├── contracts/                   # Smart contracts
│   └── nft-ticket/              # NFT ticket contract (Rust)
│       ├── src/lib.rs           # Contract implementation
│       ├── tests/               # Contract tests
│       ├── Cargo.toml           # Rust dependencies
│       └── Cargo.lock           # Locked dependency versions
├── docs/                        # Documentation
│   ├── architecture/            # System design documents
│   ├── guides/                  # Developer and user guides
│   └── api/                     # API reference
├── scripts/                     # Deployment and utility scripts
│   ├── deploy-web4.sh           # Web4 deployment
│   ├── deploy-nft-dev.js        # Dev contract deployment
│   └── setup-claude-dev.sh      # Development environment setup
└── mcp-servers/                 # MCP server integrations
```

### Provider Hierarchy

Components in YouTick are wrapped in a layered provider stack. Understanding this hierarchy is important when adding new components that depend on context:

```
<ThemeProvider>                  # Dark/light theme (next-themes)
  <QueryProvider>                # TanStack React Query client
    <EvmProvider>                # EVM chain support (wagmi)
      <LanguageProvider>         # i18n context (en/tr)
        <WalletProvider>         # NEAR wallet state + selector
          <NovaAccessSync />     # Auto-sync Nova group memberships
          <OnboardingKeyInit />  # Initialize trial account keys
          <Navbar />
          {children}             # Page content
        </WalletProvider>
      </LanguageProvider>
    </EvmProvider>
  </QueryProvider>
</ThemeProvider>
```

**Accessing context from components:**

| Hook | Provides | Source |
|------|----------|--------|
| `useWallet()` | `accountId`, `isTrial`, `signIn`, `signOut`, wallet instance | `WalletProvider` |
| `useLanguage()` | `t` (translation object), `language`, `setLanguage` | `LanguageContext` |
| `useTheme()` | `theme`, `setTheme` | `ThemeProvider` |
| `useQueryClient()` | Query cache management | `QueryProvider` |

### Core Data Flows

```
UPLOAD FLOW
SessionKey --> CreateGroup(Nova) --> Encrypt(Nova TEE) --> Upload(IPFS) --> Mint(NEAR)

WATCH FLOW
OwnershipCheck --> VerifyMembership(Nova) --> Decrypt(Nova TEE) --> Play

PURCHASE FLOW
buy_ticket() --> 98% Creator / 2% Platform --> AddMember(Nova) --> NFT Transfer

GIFT FLOW
create_gift_drop() --> Share Link --> claim_gift() --> AddMember(Nova) --> Trial Account
```

---

## 7. Key Development Patterns

### Session Key Pattern

Session keys enable signless transactions by creating a function-call access key stored in the browser. The first call requires a wallet popup; all subsequent calls are automatic.

```typescript
import { SessionManager } from '@/lib/session-manager';

// Create a session manager for the connected account
const session = new SessionManager(accountId);

// First time: import or create a session key (one wallet popup)
const hasKey = await session.importWalletFunctionCallKey();
if (!hasKey) {
  await session.createSessionKey(wallet);
}

// All subsequent calls are signless (no popup)
await session.callMethod('buy_ticket_prepaid', {
  receiver_id: buyerId,
  encrypted_cid: cid,
});
```

> [!TIP]
> The `SessionManager` automatically handles key caching in `localStorage`
> via `BrowserKeyStore`. Keys imported from MyNearWallet are detected
> automatically. MeteorWallet users get a one-time popup to create a
> dApp-managed key.

### Nova Integration Pattern

Nova Protocol provides TEE-based encryption for video content. The SDK is accessed through a singleton module at `lib/nova/`.

**Creating a group and uploading encrypted content:**

```typescript
import NOVA from '@/lib/nova';

// Create a Nova group for the video (creator is the first member)
const groupId = await NOVA.groups.createGroup({
  name: `video-${uuid}`,
  members: [creatorAccountId],
});

// Upload the video file (encrypted inside the TEE)
const result = await NOVA.files.uploadFile({
  groupId,
  file: videoFile,
  onProgress: (progress) => setProgress(progress),
});
```

**Adding a buyer after purchase:**

```typescript
import { addBuyerToNovaGroup } from '@/lib/nova/post-purchase';

// Grant decryption access to the buyer
await addBuyerToNovaGroup(eventCid, buyerAccountId);
```

**Decrypting content for playback:**

```typescript
import { decryptWithNova } from '@/lib/nova/client';

// Decrypt the video blob (requires group membership)
const decryptedBuffer = await decryptWithNova(groupId, encryptedBlob);
```

**Error handling with retry queue:**

Nova operations can fail due to rate limits or network issues. Use the pending access queue to avoid blocking the purchase flow:

```typescript
import { pendingAccessQueue } from '@/lib/nova/pending-access-queue';

try {
  await addBuyerToNovaGroup(cid, accountId);
} catch (error) {
  // Queue for retry -- do not block the purchase flow
  pendingAccessQueue.add(cid, accountId);
  console.warn('[Nova] Queued for retry:', error.message);
}
```

### NEAR Wallet Integration

Access the wallet state and call contract methods through the `WalletProvider`:

```typescript
import { useWallet } from '@/components/providers/WalletProvider';

function MyComponent() {
  const { accountId, isTrial, signIn, signOut } = useWallet();

  // View method (read-only, no gas cost, no wallet needed)
  const event = await viewContract(
    provider,
    contractId,
    'get_event',
    { encrypted_cid: cid }
  );

  // Change method (requires gas + optional deposit)
  await wallet.callMethod({
    contractId,
    method: 'buy_ticket',
    args: { receiver_id: accountId, encrypted_cid: cid },
    deposit: parseNearAmount('1.02'),
    gas: '100000000000000', // 100 TGas
  });
}
```

### React Query Data Fetching

All blockchain data fetching uses TanStack React Query for caching and automatic refetching:

```typescript
import { useQuery } from '@tanstack/react-query';

const { data, isLoading, error } = useQuery({
  queryKey: ['event', cid],
  queryFn: () => viewContract(provider, contractId, 'get_event', {
    encrypted_cid: cid,
  }),
  staleTime: 60_000,    // Cache for 1 minute
  gcTime: 5 * 60_000,   // Keep in garbage collection cache for 5 minutes
});
```

**Standard query key patterns used in the codebase:**

| Query Key | Data |
|-----------|------|
| `['allVideos', page]` | Paginated video listings |
| `['event', cid]` | Single event details |
| `['ownedTokens', accountId]` | User's NFT tickets |
| `['walletBalance', accountId]` | NEAR balance |
| `['createdEvents', accountId]` | Events created by user |

**Creating a custom hook:**

```typescript
// hooks/useYourHook.ts
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/components/providers/WalletProvider';

export function useYourHook() {
  const { accountId } = useWallet();

  return useQuery({
    queryKey: ['yourData', accountId],
    queryFn: async () => {
      // Fetch and return data
    },
    enabled: !!accountId, // Only fetch when wallet is connected
    staleTime: 60_000,
  });
}
```

### i18n Translation Pattern

YouTick supports English and Turkish via a context-based translation system:

```typescript
import { useLanguage } from '@/components/providers/LanguageContext';

function MyComponent() {
  const { t, language, setLanguage } = useLanguage();

  return (
    <div>
      <h1>{t.discover_page.title}</h1>
      <p>{t.discover_page.subtitle}</p>
    </div>
  );
}
```

Add new translation keys in `lib/translations.ts`:

```typescript
export const translations = {
  en: {
    your_section: {
      title: "Your Title",
      description: "Your description",
    },
  },
  tr: {
    your_section: {
      title: "Basliginiz",
      description: "Aciklamaniz",
    },
  },
};
```

---

## 8. Testing

### Frontend Tests (Vitest)

The frontend uses [Vitest](https://vitest.dev/) with test files organized under `apps/web/__tests__/`.

```bash
cd apps/web

# Run the full test suite
npm test

# Run tests with the interactive browser UI
npm run test:ui

# Generate a coverage report
npm run test:coverage

# Run a specific test file
npx vitest run __tests__/unit/your-test.test.ts

# Run tests in watch mode (re-runs on file changes)
npx vitest watch
```

**Test directory structure:**

```
__tests__/
├── unit/              # Isolated function and component tests
├── integration/       # Multi-module interaction tests
├── nova/              # Nova SDK integration tests
├── mocks/             # Shared mock factories and fixtures
└── setup.ts           # Global test setup (environment, mocks)
```

**Writing a unit test:**

```typescript
// __tests__/unit/your-module.test.ts
import { describe, it, expect } from 'vitest';
import { yourFunction } from '@/lib/your-module';

describe('yourFunction', () => {
  it('returns the expected result', () => {
    const result = yourFunction('input');
    expect(result).toBe('expected');
  });
});
```

### Smart Contract Tests (Rust)

The contract uses Rust's built-in test framework with NEAR SDK testing utilities and `near-workspaces` for integration tests.

```bash
cd contracts/nft-ticket

# Run all tests
cargo test

# Run with printed output
cargo test -- --nocapture

# Run a specific test
cargo test test_create_event

# Run only unit tests (faster, no sandbox)
cargo test --lib

# Run only integration tests (requires sandbox)
cargo test --test '*'
```

### E2E Testing (Playwright -- Planned)

End-to-end tests for the full application flow are planned using Playwright:

```bash
# When available:
npx playwright test
npx playwright test --ui    # Interactive mode
```

Target E2E scenarios:

- **Upload flow**: Group creation, TEE encryption, IPFS upload, NFT minting
- **Watch flow**: Ownership check, membership verification, decryption, playback
- **Purchase flow**: Payment, Nova member addition, NFT transfer
- **Gift flow**: Gift creation, link sharing, claim, trial account creation

---

## 9. Deployment

### Frontend Deployment

#### Standard Next.js Build

```bash
cd apps/web
npm run build
npm start
```

This produces a server-rendered Next.js application suitable for deployment on Vercel, Cloudflare Pages, or any Node.js host.

#### Web4 Decentralized Hosting

Web4 deploys the frontend as a static export to the NEAR blockchain via NEARFS:

```bash
cd apps/web

# Build the static export (temporarily moves API routes out)
npm run build:web4

# Deploy to NEARFS gateway
./scripts/deploy-web4.sh
```

> [!NOTE]
> The `build:web4` script temporarily moves `app/api/` out of the build
> directory because Web4 static exports cannot include server-side API
> routes. The directory is restored after the build completes, regardless
> of whether the build succeeds or fails.

### Contract Deployment

> [!CAUTION]
> Contract deployment to `youtick.near` (mainnet) **requires explicit
> approval** from the project owner. Never deploy to production without
> following the full approval process below.

**Full deployment process:**

```bash
# Step 1: Build the contract
cd contracts/nft-ticket
cargo near build

# Step 2: Deploy to a testnet dev account first
near deploy dev-xxx.testnet \
  target/wasm32-unknown-unknown/release/youtick_nft.wasm

# Step 3: Initialize and test thoroughly
near call dev-xxx.testnet new_default_meta \
  '{"owner_id":"dev-xxx.testnet"}' \
  --accountId dev-xxx.testnet

# Step 4: Run the full test suite
cargo test

# Step 5: Present results and get explicit approval
# Show the diff, test results, and deployment plan

# Step 6: Deploy to mainnet (only after approval)
near deploy youtick.near \
  target/wasm32-unknown-unknown/release/youtick_nft.wasm \
  --accountId owner.near
```

### Pre-Deployment Security Checklist

Before any deployment, verify every item:

- [ ] No hardcoded private keys in the codebase
- [ ] All environment variables are properly configured
- [ ] Contract storage keys use V7 format (collision-safe)
- [ ] Prepaid withdrawal limit is 0.1 NEAR maximum
- [ ] Session cache expiry is 24 hours maximum
- [ ] Gift drop access keys are properly scoped (method-restricted)
- [ ] Nova group membership is verified before decryption
- [ ] All tests pass on both frontend and contract
- [ ] `NOVA_API_KEY` is not exposed in any `NEXT_PUBLIC_` variable

---

## 10. Common Tasks

### Add a New Page

Create a directory under `app/` with a `page.tsx` file:

```typescript
// app/your-page/page.tsx
'use client';

import { useWallet } from '@/components/providers/WalletProvider';

export default function YourPage() {
  const { accountId } = useWallet();

  return (
    <main className="container mx-auto px-4 py-20">
      <h1 className="text-2xl font-bold">Your Page</h1>
      {accountId && <p>Connected as: {accountId}</p>}
    </main>
  );
}
```

Optionally, add a `layout.tsx` for page-specific layout wrapping.

### Add a New Component

Create a file in `components/` following the existing naming pattern:

```typescript
// components/YourComponent.tsx
'use client';

interface YourComponentProps {
  title: string;
  onAction: () => void;
}

export function YourComponent({ title, onAction }: YourComponentProps) {
  return (
    <div className="rounded-xl border border-white/5 bg-zinc-950 p-6">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <button
        onClick={onAction}
        className="mt-4 rounded-lg bg-near-green px-4 py-2 font-semibold text-near-black hover:bg-near-green/80"
      >
        Action
      </button>
    </div>
  );
}
```

### Add a Contract Method

1. Add the method to `contracts/nft-ticket/src/lib.rs`.
2. Write tests in the `tests/` directory.
3. Build and deploy to a testnet dev account.
4. Test via NEAR CLI.
5. Get approval before merging or deploying to mainnet.

### Add a Nova Integration

Modify or create files in `lib/nova/` following the existing module structure:

```
lib/nova/
├── index.ts              # Module entry point and NovaSDK singleton
├── types.ts              # TypeScript type definitions
├── config.ts             # Configuration and env binding
├── auth.ts               # Authentication and token management
├── client.ts             # Core SDK client wrapper
├── groups.ts             # Group CRUD operations
├── key-storage.ts        # Encryption key caching
├── costs.ts              # Operation cost calculations
├── attestation.ts        # TEE attestation verification
├── public-groups.ts      # Public group management
├── post-purchase.ts      # Post-purchase member addition
└── pending-access-queue  # Retry queue for failed operations
```

### Add an Environment Variable

When adding a new environment variable:

1. Add it to `apps/web/.env.local` with the correct value.
2. Add a placeholder entry to `apps/web/.env.example` with a comment explaining its purpose.
3. If the variable is required at startup, add it to the validation list in `lib/env.ts`.
4. If the variable needs typed access, add it to the `env` export in `lib/env.ts`.
5. If the variable configures a constant, reference it from `lib/constants.ts`.

### Add Translations

Edit `lib/translations.ts` and add entries to both language objects:

```typescript
export const translations = {
  en: {
    your_section: {
      title: "Your Title",
      cta: "Get Started",
    },
  },
  tr: {
    your_section: {
      title: "Basliginiz",
      cta: "Baslayin",
    },
  },
};
```

Then access them via `const { t } = useLanguage()` and `t.your_section.title`.

---

## 11. Troubleshooting

### RPC Connection Errors

**Symptom**: Contract calls fail with network or timeout errors.

**Cause**: The primary NEAR RPC endpoint may be temporarily unavailable.

**Solution**: YouTick includes automatic RPC failover across multiple endpoints (fastnear, near.org, lava.build). If all endpoints fail, wait and retry. Check `lib/rpc-failover.ts` for the current endpoint list.

### Nova Authentication Failures

**Symptom**: Nova operations return 401 or authentication errors.

**Solution**:
1. Clear the Nova auth cache in `localStorage` (keys prefixed with `nova_`).
2. Verify `NEXT_PUBLIC_NOVA_API_KEY` is set to `"enabled"` in `.env.local`.
3. Verify `NOVA_API_KEY` (server-only) is correctly set on the proxy worker.
4. Regenerate the Nova authentication token.

### Session Key Expired

**Symptom**: Signless transactions fail with "key not found" or "access denied".

**Solution**: Session keys expire after 24 hours. The user must reconnect their wallet to create a new session key. The `SessionManager.importWalletFunctionCallKey()` method handles this automatically on next interaction.

### IPFS Gateway Timeouts

**Symptom**: Video thumbnails or content fail to load.

**Solution**: YouTick uses multi-gateway failover (crustipfs.xyz, ipfs.io, dweb.link, w3s.link). If a specific gateway is down, the system automatically tries the next one. For persistent issues, verify the CID is pinned by checking it on [ipfs.io](https://ipfs.io).

### Storage Deposit Errors

**Symptom**: NFT minting fails with "not enough balance for storage" errors.

**Solution**: Check the account's storage balance before minting. The contract requires 0.01 NEAR per NFT for on-chain storage. Ensure the account has sufficient NEAR to cover both the ticket price and the storage deposit.

```bash
near view youtick.near get_user_balance '{"account_id":"user.near"}'
```

### Trial Pool Empty

**Symptom**: Trial account creation fails with "insufficient pool balance".

**Solution**: The trial pool needs periodic funding. Check the current balance and refund if necessary:

```bash
# Check pool balance
near view youtick.near get_trial_pool_balance '{}'

# Fund the pool (requires owner account)
near call youtick.near fund_trial_pool '{}' \
  --accountId owner.near --deposit 10
```

### Build Errors After Dependency Changes

**Symptom**: Build fails after pulling new changes.

**Solution**:

```bash
cd apps/web
rm -rf node_modules .next
npm install
npm run build
```

For contract build issues:

```bash
cd contracts/nft-ticket
cargo clean
cargo build --target wasm32-unknown-unknown --release
```

---

## 12. Code Style and Conventions

### TypeScript (Frontend)

| Convention | Rule | Example |
|-----------|------|---------|
| **Variables and functions** | camelCase | `getEventData`, `isLoading` |
| **Components** | PascalCase files and exports | `VideoCard.tsx`, `UploadForm.tsx` |
| **Hooks** | `use` prefix, camelCase | `useAllVideos`, `useNearPrice` |
| **Constants** | UPPER_SNAKE_CASE | `NEAR_CONFIG`, `GAS_CONSTANTS` |
| **Types and interfaces** | PascalCase | `EventResponse`, `NovaConfig` |
| **Directories** | lowercase or kebab-case | `components/`, `lib/nova/` |

### Rust (Contract)

| Convention | Rule | Example |
|-----------|------|---------|
| **Functions** | snake_case | `create_event`, `buy_ticket` |
| **Types and structs** | PascalCase | `EventData`, `TokenMetadata` |
| **Constants** | UPPER_SNAKE_CASE | `MAX_SUPPLY`, `STORAGE_COST` |
| **Modules** | snake_case | `mod gift_drops` |

### General Rules

- **TypeScript strict mode** is enabled. All types must be explicit; avoid `any`.
- **ESLint** is configured via `eslint-config-next`. Run `npm run lint` before committing.
- **Component files** use the `'use client'` directive when they use hooks, event handlers, or browser APIs.
- **Imports** use the `@/` alias for absolute paths from the `apps/web/` root (e.g., `@/lib/constants`).
- **Styling** uses Tailwind CSS v4 with the NEAR brand color palette defined in `constants.ts`.
- **UI primitives** use Radix UI components via shadcn/ui, located in `components/ui/`.
- **Error handling** follows a non-blocking pattern for Nova operations: queue failures for retry instead of blocking the user flow.
- **Console logging** for decentralization metrics uses the `[DECENTRALIZATION_METRIC]` prefix for tracking.

### Design System

The NEAR brand colors are available as Tailwind classes:

| Color | Class | Hex |
|-------|-------|-----|
| Green | `text-near-green`, `bg-near-green` | `#00ec97` |
| Purple | `text-near-purple`, `bg-near-purple` | `#9797ff` |
| Blue | `text-near-blue`, `bg-near-blue` | `#17d9d4` |
| Red | `text-near-red`, `bg-near-red` | `#ff7966` |

Refer to the `COLORS`, `ANIMATION`, and `LAYOUT` constants in `lib/constants.ts` for the full design system reference.

---

## Related Documentation

- [Architecture Overview](../architecture/README.md) -- System design and protocol integration details
- [API Reference](../api/contract-methods.md) -- Contract method reference and RPC documentation
- [Contributing Guidelines](../contributing.md) -- Pull request process and review standards

---

*Last updated: 2026-02-15*
