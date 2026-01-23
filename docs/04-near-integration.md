# NEAR Protocol Integration

> **Blockchain Layer: Identity, Payments, and NFT Management**

## Overview

YouTick uses NEAR Protocol as its primary blockchain layer, handling:
- User authentication via NEAR Wallet
- NFT ticket minting and transfers
- Payment processing with 98/2 split
- Session keys for signless transactions
- Chain Signatures for cross-chain MPC

## Configuration

```typescript
// lib/near.ts
export const nearConfig = {
  networkId: process.env.NEXT_PUBLIC_NEAR_NETWORK || "testnet",
  contractId: process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || "v1.utick.testnet",
  
  // RPC Endpoints with failover
  nodeUrls: [
    "https://test.rpc.fastnear.com",
    "https://rpc.testnet.near.org",
    "https://near-testnet.lava.build"
  ],
  
  walletUrl: "https://testnet.mynearwallet.com",
  helperUrl: "https://helper.testnet.near.org",
  explorerUrl: "https://testnet.nearblocks.io"
};
```

## Wallet Connection

Using `@near-wallet-selector/core` (v10.1.2):

```typescript
import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";

const selector = await setupWalletSelector({
  network: "testnet",
  modules: [setupMyNearWallet()]
});

const wallet = await selector.wallet("my-near-wallet");
const accounts = await wallet.signIn({
  contractId: "v1.utick.testnet",
  methodNames: [] // Full access
});
```

## Smart Contract Methods

### View Methods (Free)

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `nft_metadata` | - | `NFTContractMetadata` | Contract metadata |
| `nft_tokens` | `from_index`, `limit` | `Token[]` | List all tokens |
| `nft_tokens_for_owner` | `account_id`, `from_index`, `limit` | `Token[]` | User's tokens |
| `get_event` | `encrypted_cid` | `Event` | Event details |
| `get_events` | `from_index`, `limit` | `Event[]` | List events |
| `get_user_balance` | `account_id` | `U128` | Prepaid balance |
| `verify_ownership` | `account_id`, `cid` | `bool` | Check NFT ownership |

```typescript
// Example: Get event details
const event = await contract.get_event({
  encrypted_cid: "QmXyz..."
});
// Returns: { title, description, price, creator, tickets_sold }
```

### Change Methods (Requires Gas)

| Method | Deposit | Gas | Description |
|--------|---------|-----|-------------|
| `nft_mint` | Varies | ~10 TGas | Mint video NFT |
| `create_event` | 0.1 NEAR | ~5 TGas | Create ticketed event |
| `buy_ticket` | Ticket Price | ~15 TGas | Purchase ticket |
| `buy_ticket_prepaid` | - | ~10 TGas | Buy with prepaid balance |
| `deposit_funds` | Amount | ~5 TGas | Add to prepaid balance |
| `withdraw_funds` | - | ~5 TGas | Withdraw prepaid balance |
| `create_gift_drop` | Tickets × Price | ~20 TGas | Create gift links |
| `claim_gift` | - | ~10 TGas | Claim gifted ticket |

```typescript
// Example: Buy a ticket
await wallet.signAndSendTransaction({
  receiverId: "v1.utick.testnet",
  actions: [{
    type: "FunctionCall",
    params: {
      methodName: "buy_ticket",
      args: { event_cid: "QmXyz..." },
      gas: "15000000000000",
      deposit: "500000000000000000000000" // 0.5 NEAR
    }
  }]
});
```

## Session Keys

Session keys enable signless transactions after initial setup:

```typescript
// lib/session-manager.ts
export class SessionManager {
  private static readonly SESSION_KEY = "near_session_key";
  private static readonly MAX_ALLOWANCE = "0.1"; // NEAR
  
  async createSession(wallet: Wallet): Promise<KeyPair> {
    const keyPair = KeyPair.fromRandom("ed25519");
    
    // Add access key to contract
    await wallet.signAndSendTransaction({
      receiverId: CONTRACT_ID,
      actions: [{
        type: "AddKey",
        params: {
          publicKey: keyPair.getPublicKey().toString(),
          accessKey: {
            permission: {
              FunctionCall: {
                receiverId: CONTRACT_ID,
                methodNames: ["buy_ticket_prepaid", "nft_mint"],
                allowance: parseNearAmount(this.MAX_ALLOWANCE)
              }
            }
          }
        }
      }]
    });
    
    // Cache session key
    localStorage.setItem(this.SESSION_KEY, keyPair.toString());
    return keyPair;
  }
  
  async signWithSession(methodName: string, args: object): Promise<void> {
    const keyPair = this.getStoredSession();
    // Sign transaction with session key (no wallet popup)
  }
}
```

## Chain Signatures (MPC)

NEAR Chain Signatures enable cross-chain signing for Lit Protocol:

```typescript
// lib/chain-signatures.ts
const MPC_CONTRACT = "v1.signer-prod.testnet";

export async function deriveEthAddress(
  nearAccountId: string,
  path: string = "ethereum,1"
): Promise<string> {
  // Derive Ethereum address via MPC
  const result = await near.view(MPC_CONTRACT, "derive_address", {
    account_id: nearAccountId,
    path: path
  });
  
  return result; // 0x...
}

export async function signWithMPC(
  nearWallet: Wallet,
  payload: Uint8Array
): Promise<Signature> {
  // Sign payload using NEAR as the root of trust
  const result = await nearWallet.signAndSendTransaction({
    receiverId: MPC_CONTRACT,
    actions: [{
      type: "FunctionCall",
      params: {
        methodName: "sign",
        args: { payload: Array.from(payload) },
        gas: "250000000000000", // 250 TGas
        deposit: "250000000000000000000000" // 0.25 NEAR
      }
    }]
  });
  
  return parseSignature(result);
}
```

## Gas Costs Summary

| Operation | Gas | NEAR Cost | USD (approx) |
|-----------|-----|-----------|--------------|
| NFT Mint | 10 TGas | ~0.001 | ~$0.005 |
| Buy Ticket | 15 TGas | ~0.0015 | ~$0.007 |
| Create Event | 5 TGas | ~0.0005 | ~$0.002 |
| MPC Sign | 250 TGas | ~0.25 | ~$1.25 |
| Session Key | 5 TGas | ~0.0005 | ~$0.002 |

## Error Handling

```typescript
try {
  await buyTicket(eventCid);
} catch (error) {
  if (error.message.includes("Not enough balance")) {
    // User doesn't have enough NEAR
  } else if (error.message.includes("Event not found")) {
    // Invalid CID
  } else if (error.message.includes("Already owns ticket")) {
    // Duplicate purchase attempt
  }
}
```

---

**Previous**: [← Architecture](./03-architecture.md) | **Next**: [Lit Protocol →](./05-lit-protocol.md)
