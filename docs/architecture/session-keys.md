# Session Key Management

> Signless Transactions on NEAR Protocol

**Location**: `apps/web/lib/session-manager.ts`

---

## Overview

Session Keys enable "signless" transactions by:

1. Creating a Function Call Access Key stored locally
2. Depositing funds into a prepaid "Gas Tank"
3. Using the local key for future transactions

Users only sign once during setup, then enjoy popup-free interactions.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Session Key System                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐                                           │
│  │   Wallet Popup   │  ← Only during setup                      │
│  │   (One-time)     │                                           │
│  └────────┬─────────┘                                           │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │  Generate        │    │  Add as          │                   │
│  │  ed25519 KeyPair │───▶│  Access Key      │                   │
│  └──────────────────┘    └────────┬─────────┘                   │
│                                   │                              │
│           ┌───────────────────────┼───────────────────────┐     │
│           │                       ▼                       │     │
│           │    ┌──────────────────────────────────┐       │     │
│           │    │       NEAR Blockchain            │       │     │
│           │    │                                  │       │     │
│           │    │  Account Access Keys:            │       │     │
│           │    │  ┌────────────────────────────┐  │       │     │
│           │    │  │ ed25519:ABC... (FullAccess)│  │       │     │
│           │    │  │ ed25519:XYZ... (FunctionCall)│◄───────┘     │
│           │    │  │   receiver: v1.utick.testnet │              │
│           │    │  │   methods: *                  │              │
│           │    │  └────────────────────────────┘  │              │
│           │    └──────────────────────────────────┘              │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────┐                                           │
│  │  Browser Storage │  localStorage                              │
│  │  ┌──────────────┐│                                           │
│  │  │ Session Key  ││  near-api-js:keystore:{account}:{network} │
│  │  │ (Private)    ││                                           │
│  │  └──────────────┘│                                           │
│  └──────────────────┘                                           │
│                                                                  │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────┐                                           │
│  │  Future          │  No wallet popup!                          │
│  │  Transactions    │  Sign locally with stored key              │
│  └──────────────────┘                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Prepaid Balance (Gas Tank)

The contract maintains a prepaid balance per user:

```
User deposits NEAR → Contract stores in user_deposits map
Session Key calls → Contract deducts from user's balance
No attached deposit needed → Enables FunctionCall keys
```

### Deposit Flow

```typescript
// Deposit funds to Gas Tank
await wallet.signAndSendTransaction({
    receiverId: CONTRACT_ID,
    actions: [
        actions.functionCall(
            'deposit_funds',
            {},
            BigInt('30000000000000'), // 30 TGas
            BigInt(nearToYocto(1))    // 1 NEAR deposit
        )
    ]
});
```

### Withdrawal Flow

```typescript
// Signless withdrawal (max 0.1 NEAR)
await sessionManager.withdrawFundsSilent('0.1');

// Wallet withdrawal (no limit)
await sessionManager.withdrawFunds(wallet, '5');
```

---

## SessionManager Class

### Constructor

```typescript
class SessionManager {
    constructor(accountId: string) {
        this.accountId = accountId;
        this.keyStore = new BrowserKeyStore();
    }
}
```

### Key Management

```typescript
// Check if valid session key exists
async hasSessionKey(): Promise<boolean>

// Create new session key with gas deposit
async createSessionKey(wallet: any, gasAmount: string = '1'): Promise<void>

// Create minimal session key (for PKP users)
async createSessionKeyMinimal(wallet: any): Promise<void>

// Save existing key pair
async saveSessionKey(keyPair: KeyPair): Promise<void>
```

### Contract Calls

```typescript
// Call single method
async callMethod(
    method: string,
    args: any,
    gas: string = '300000000000000'
): Promise<any>

// Send batch transaction
async sendBatchTransaction(
    txActions: any[],
    gas: string = '300000000000000'
): Promise<any>
```

### Balance Management

```typescript
// Get prepaid balance
async getAccountBalance(nodeUrl: string): Promise<number>

// Check if balance is sufficient
async hasSufficientGas(nodeUrl: string, minAmount: number = 1.0): Promise<boolean>

// Ensure minimum balance (auto top-up)
async ensureGas(wallet: any, nodeUrl: string, minAmount: number = 1.0): Promise<void>

// Top up with wallet signature
async topUpGas(wallet: any, amount: string): Promise<void>

// Withdraw with wallet signature
async withdrawFunds(wallet: any, amount: string): Promise<void>

// Withdraw without wallet (signless, max 0.1 NEAR)
async withdrawFundsSilent(amount: string): Promise<any>
```

---

## Setup Flow

### Standard Setup (1 NEAR)

```typescript
const sessionManager = new SessionManager(accountId);

// Check if already setup
const hasKey = await sessionManager.hasSessionKey();
if (!hasKey) {
    // Creates key + deposits 1 NEAR
    await sessionManager.createSessionKey(wallet, '1');
}
```

### Minimal Setup (PKP Users)

```typescript
// For users with PKP (less gas needed)
await sessionManager.createSessionKeyMinimal(wallet);
// Deposits 0.5 NEAR (MPC + mint + event margin)
```

### Batch Setup

Uses a single transaction for key addition + deposit:

```typescript
// lib/batch-transactions.ts
export async function batchInitialSetup(
    wallet: any,
    accountId: string,
    contractId: string,
    publicKey: string,
    gasAmount: string
): Promise<void> {
    await wallet.signAndSendTransaction({
        receiverId: contractId,
        actions: [
            // Add Function Call Access Key
            {
                type: 'AddKey',
                params: {
                    publicKey,
                    accessKey: {
                        permission: {
                            receiverId: contractId,
                            methodNames: [],  // All methods
                            allowance: '0'    // No gas allowance (uses prepaid)
                        }
                    }
                }
            },
            // Deposit funds
            {
                type: 'FunctionCall',
                params: {
                    methodName: 'deposit_funds',
                    args: {},
                    gas: '30000000000000',
                    deposit: nearToYocto(parseFloat(gasAmount))
                }
            }
        ]
    });
}
```

---

## On-Chain Verification

Session key validity is verified against the blockchain:

```typescript
async hasSessionKey(): Promise<boolean> {
    const keyPair = await this.keyStore.getKey(NETWORK_ID, this.accountId);
    if (!keyPair) return false;

    // Verify key exists on-chain
    const account = new Account(this.accountId, rpcUrl);
    const accessKeyList = await account.getAccessKeyList();
    const publicKey = keyPair.getPublicKey().toString();

    const accessKeyInfo = accessKeyList.keys.find(
        (k: { public_key: string }) => k.public_key === publicKey
    );

    if (!accessKeyInfo) {
        // Key not on chain - remove from local storage
        await this.keyStore.removeKey(NETWORK_ID, this.accountId);
        return false;
    }

    // Verify correct contract
    const permission = accessKeyInfo.access_key.permission;
    if (typeof permission === 'object' && 'FunctionCall' in permission) {
        if (permission.FunctionCall.receiver_id !== CONTRACT_ID) {
            await this.keyStore.removeKey(NETWORK_ID, this.accountId);
            return false;
        }
    }

    return true;
}
```

---

## RPC Failover

Multiple RPC endpoints for reliability:

```typescript
// lib/rpc-failover.ts

const RPC_ENDPOINTS = [
    'https://test.rpc.fastnear.com',    // Primary
    'https://rpc.testnet.near.org',     // Secondary
    'https://near-testnet.lava.build'   // Tertiary
];

export async function withRpcFailover<T>(
    operation: (rpcUrl: string) => Promise<T>
): Promise<T> {
    for (const rpcUrl of RPC_ENDPOINTS) {
        try {
            return await operation(rpcUrl);
        } catch (error) {
            console.warn(`RPC ${rpcUrl} failed, trying next...`);
        }
    }
    throw new Error('All RPC endpoints failed');
}
```

---

## Browser Key Storage

```typescript
// lib/keystore-v7.ts

export class BrowserKeyStore {
    private prefix = 'near-api-js:keystore';

    async setKey(networkId: string, accountId: string, keyPair: KeyPair): Promise<void> {
        const key = `${this.prefix}:${accountId}:${networkId}`;
        localStorage.setItem(key, keyPair.toString());
    }

    async getKey(networkId: string, accountId: string): Promise<KeyPair | null> {
        const key = `${this.prefix}:${accountId}:${networkId}`;
        const value = localStorage.getItem(key);
        if (!value) return null;
        return KeyPair.fromString(value as KeyPairString);
    }

    async removeKey(networkId: string, accountId: string): Promise<void> {
        const key = `${this.prefix}:${accountId}:${networkId}`;
        localStorage.removeItem(key);
    }
}
```

---

## Security Considerations

### Function Call Key Restrictions

- **No NEAR transfers**: Keys cannot move funds directly
- **Contract-scoped**: Only calls to specified contract
- **Method restrictions**: Can be limited to specific methods

### Withdrawal Limits

```rust
// Contract enforces 0.1 NEAR max for signless withdrawals
let max_signless_withdraw = NearToken::from_millinear(100);
require!(
    current_bal <= max_signless_withdraw,
    "Amount exceeds signless limit (0.1 NEAR)"
);
```

### Key Compromise Mitigation

If a session key is compromised:

1. Max loss limited to prepaid balance
2. Cannot transfer from main account
3. User can add new full access key to revoke
4. Contract withdrawal limits reduce exposure

---

## Usage Examples

### Mint NFT (Signless)

```typescript
const sessionManager = new SessionManager(accountId);

await sessionManager.callMethod('nft_mint_prepaid', {
    receiver_id: accountId,
    token_metadata: { title: 'My Video' },
    video_metadata: { encrypted_cid: 'Qm...' }
});
```

### Buy Ticket (Signless)

```typescript
await sessionManager.callMethod('buy_ticket_prepaid', {
    receiver_id: accountId,
    encrypted_cid: eventCid
});
```

### Create Event (Signless)

```typescript
await sessionManager.callMethod('create_event_prepaid', {
    encrypted_cid: cid,
    title: 'Concert',
    description: 'Live show',
    price: '1000000000000000000000000' // 1 NEAR
});
```

---

## Exports

```typescript
export class SessionManager { ... }

// Re-exports
export { getCurrentRpcUrl, withRpcFailover, NETWORK_ID, CONTRACT_ID };
```

---

## Related Documentation

- [Smart Contract](./smart-contract.md) - Prepaid methods
- [Lit Protocol](./lit-protocol.md) - Session sigs
- [User Flows](../guides/user-flows.md) - End-to-end flows
