# Lit Protocol Integration

> **Encryption Layer: Client-Side Security and Access Control**

## Overview

Lit Protocol provides YouTick's encryption and access control layer:
- **Client-side encryption** using AES-256-GCM
- **Programmable Key Pairs (PKP)** for key management
- **Access Control Conditions (ACC)** for NFT-gated access
- **Lit Actions** for on-chain ownership verification

## Configuration

```typescript
// lib/lit.ts
export const litConfig = {
  network: "datil-dev",           // Testnet network
  chain: "ethereum",              // ACC chain (maps from NEAR)
  debug: process.env.NODE_ENV === "development",
  
  // Session settings
  sessionDuration: 7 * 24 * 60 * 60 * 1000,  // 7 days
  
  // PKP minting options
  mintingMethod: "relay" | "direct"
};
```

## SDK Dependencies

```json
{
  "@lit-protocol/lit-node-client": "^7.3.1",
  "@lit-protocol/encryption": "^7.3.1",
  "@lit-protocol/auth-helpers": "^7.3.1",
  "@lit-protocol/contracts-sdk": "^7.3.1",
  "@lit-protocol/constants": "^7.3.1"
}
```

## Encryption Flow

### 1. Initialize Lit Client

```typescript
import { LitNodeClient } from "@lit-protocol/lit-node-client";

const litClient = new LitNodeClient({
  litNetwork: "datil-dev",
  debug: false
});

await litClient.connect();
```

### 2. Generate Session Signatures

```typescript
import { createSiweMessage, generateAuthSig } from "@lit-protocol/auth-helpers";

async function getSessionSigs(wallet: Wallet, nearAccountId: string) {
  // Derive Ethereum address via NEAR Chain Signatures
  const ethAddress = await deriveEthAddress(nearAccountId);
  
  // Create SIWE message
  const siweMessage = await createSiweMessage({
    domain: window.location.hostname,
    address: ethAddress,
    statement: "Sign in to YouTick",
    uri: window.location.origin,
    version: "1",
    chainId: "1",
    expirationTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  });
  
  // Sign with MPC
  const signature = await signWithMPC(wallet, siweMessage);
  
  return litClient.getSessionSigs({
    chain: "ethereum",
    authNeededCallback: async () => ({
      sig: signature,
      derivedVia: "near_mpc",
      signedMessage: siweMessage,
      address: ethAddress
    }),
    resourceAbilityRequests: [{
      resource: new LitActionResource("*"),
      ability: LitAbility.LitActionExecution
    }]
  });
}
```

### 3. Encrypt Video

```typescript
import { encryptFile } from "@lit-protocol/encryption";

interface EncryptedContent {
  ciphertext: string;
  dataToEncryptHash: string;
  unifiedAccessControlConditions: any[];
  chain: string;
  metadata: {
    title: string;
    description: string;
    fileType: string;
  };
}

async function encryptVideo(
  file: File,
  creatorAddress: string,
  contractId: string
): Promise<EncryptedContent> {
  // Define access conditions (NFT ownership required)
  const accessControlConditions = [{
    conditionType: "evmBasic",
    contractAddress: "", // Will be verified via Lit Action
    standardContractType: "",
    chain: "ethereum",
    method: "",
    parameters: [":userAddress"],
    returnValueTest: {
      comparator: "=",
      value: creatorAddress // Creator always has access
    }
  }];
  
  // Encrypt the file
  const { ciphertext, dataToEncryptHash } = await encryptFile(
    { file },
    litClient,
    accessControlConditions
  );
  
  return {
    ciphertext: Buffer.from(ciphertext).toString("base64"),
    dataToEncryptHash,
    unifiedAccessControlConditions: accessControlConditions,
    chain: "ethereum",
    metadata: {
      title: file.name,
      description: "",
      fileType: file.type
    }
  };
}
```

### 4. Decrypt Video

```typescript
import { decryptFile } from "@lit-protocol/encryption";

async function decryptVideo(
  encryptedContent: EncryptedContent,
  sessionSigs: SessionSigs,
  eventCid: string
): Promise<Blob> {
  // Execute Lit Action for ownership verification
  const result = await litClient.executeJs({
    sessionSigs,
    ipfsId: process.env.NEXT_PUBLIC_LIT_ACTION_IPFS_CID,
    jsParams: {
      eventCid,
      contractId: process.env.NEXT_PUBLIC_NFT_CONTRACT_ID,
      userAddress: sessionSigs.authSig.address
    }
  });
  
  if (!result.response.hasAccess) {
    throw new Error("No access: User does not own ticket NFT");
  }
  
  // Decrypt the file
  const decrypted = await decryptFile(
    {
      ciphertext: Buffer.from(encryptedContent.ciphertext, "base64"),
      dataToEncryptHash: encryptedContent.dataToEncryptHash,
      chain: "ethereum"
    },
    litClient,
    sessionSigs
  );
  
  return new Blob([decrypted], { type: encryptedContent.metadata.fileType });
}
```

## PKP (Programmable Key Pairs)

### Relay Method (Gas-free, centralized)

```typescript
async function mintPKPWithRelay(nearAccountId: string): Promise<PKP> {
  const response = await fetch("/api/lit/mint-pkp", {
    method: "POST",
    body: JSON.stringify({ nearAccountId })
  });
  
  return response.json();
}
```

### Direct Method (User pays, decentralized)

```typescript
import { LitContracts } from "@lit-protocol/contracts-sdk";

async function mintPKPDirect(signer: ethers.Signer): Promise<PKP> {
  const contracts = new LitContracts({ signer, network: "datil-dev" });
  await contracts.connect();
  
  const mintCost = await contracts.pkpNftContract.read.mintCost();
  
  const tx = await contracts.pkpNftContract.write.mintNext(2, {
    value: mintCost
  });
  
  const receipt = await tx.wait();
  return extractPKPFromReceipt(receipt);
}
```

## Lit Actions

Lit Actions are JavaScript code that runs on Lit nodes for on-chain verification:

```javascript
// check_near_ownership.js (pinned to IPFS)
const go = async () => {
  const { eventCid, contractId, userAddress } = params;
  
  // Query NEAR contract for ownership
  const response = await Lit.Actions.call({
    url: `https://test.rpc.fastnear.com`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: "verify_ownership",
        args_base64: btoa(JSON.stringify({
          account_id: userAddress,
          cid: eventCid
        }))
      }
    })
  });
  
  const result = JSON.parse(response.body);
  const hasAccess = Boolean(result.result.result);
  
  Lit.Actions.setResponse({ 
    response: JSON.stringify({ hasAccess, timestamp: Date.now() })
  });
};

go();
```

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `NodeNotReady` | Lit nodes not connected | Retry connection |
| `InvalidAuthSig` | Expired or invalid signature | Refresh session |
| `AccessControlConditionFailed` | User doesn't own NFT | Purchase ticket first |
| `PKPMintFailed` | Insufficient funds or network issue | Use relay or retry |

---

**Previous**: [← NEAR Integration](./04-near-integration.md) | **Next**: [IPFS & Lighthouse →](./06-ipfs-lighthouse.md)
