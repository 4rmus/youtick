# Chain Signatures (MPC)

> NEAR Chain Signatures for Cross-Chain Operations

**Location**: `apps/web/lib/chain-signatures.ts`
**MPC Contract**: `v1.signer-prod.testnet`

---

## Overview

NEAR Chain Signatures enable:

- **ETH Address Derivation**: Get deterministic ETH addresses from NEAR accounts
- **Cross-Chain Signing**: Sign EVM transactions using NEAR
- **PKP Compatibility**: Use derived addresses with Lit Protocol

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Chain Signatures Flow                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐                                               │
│  │ NEAR Account │                                               │
│  │ user.testnet │                                               │
│  └──────┬───────┘                                               │
│         │                                                        │
│         │ Derivation Path: "lit/pkp-minting"                    │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────────────────────────────┐                   │
│  │         MPC Master Public Key             │                   │
│  │         (Fetched from v1.signer)          │                   │
│  └──────────────────┬───────────────────────┘                   │
│                     │                                            │
│                     │ SHA3-256 Derivation                        │
│                     │                                            │
│                     ▼                                            │
│  ┌──────────────────────────────────────────┐                   │
│  │         Child Public Key                  │                   │
│  │         (Derived mathematically)          │                   │
│  └──────────────────┬───────────────────────┘                   │
│                     │                                            │
│                     │ Keccak-256 (last 20 bytes)                │
│                     │                                            │
│                     ▼                                            │
│  ┌──────────────────────────────────────────┐                   │
│  │         ETH Address                       │                   │
│  │         0x1234...abcd                     │                   │
│  └──────────────────────────────────────────┘                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Address Derivation

### Deterministic Derivation

ETH addresses are derived mathematically without any signing:

```typescript
export async function deriveEthAddress(
    accountId: string,
    path: string,
    wallet?: any  // Optional, not used for derivation
): Promise<string> {
    // Check cache first
    const cacheKey = `mpc_address_v8_${accountId}_${path}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) return cached;

    // 1. Fetch MPC Master Public Key (View Call)
    const provider = new JsonRpcProvider({ url: rpcUrl });
    const result = await provider.query({
        request_type: "call_function",
        account_id: MPC_CONTRACT,
        method_name: "public_key",
        args_base64: Buffer.from("{}").toString("base64"),
        finality: "final"
    });
    const masterKey = JSON.parse(String.fromCharCode(...result.result));

    // 2. Derive Child Public Key
    const CONTRACT_ID = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID;
    const compositePath = `${accountId}/${path}`;
    const derivedKey = deriveChildKey(masterKey, CONTRACT_ID, compositePath);

    // 3. Convert to ETH Address
    const address = ethers.computeAddress('0x' + derivedKey);

    // Cache and return
    localStorage.setItem(cacheKey, address);
    return address;
}
```

### Derivation Algorithm

```typescript
function deriveChildKey(
    masterKeyStr: string,
    accountId: string,
    path: string
): string {
    const ec = new EC('secp256k1');

    // Decode master key
    const masterKeyBase58 = masterKeyStr.replace('secp256k1:', '');
    const masterKeyBytes = baseDecode(masterKeyBase58);

    // Handle 64-byte raw format
    let masterKeyHex = Buffer.from(masterKeyBytes).toString('hex');
    if (masterKeyHex.length === 128) {
        masterKeyHex = '04' + masterKeyHex; // Uncompressed prefix
    }

    const masterPoint = ec.keyFromPublic(masterKeyHex, 'hex').getPublic();

    // Standard NEAR MPC Derivation Path
    const derivation_path = `near-mpc-recovery v0.1.0 epsilon derivation:${accountId},${path}`;

    // Hash with SHA3-256 (IMPORTANT: not SHA256 or Keccak)
    const scalarHex = sha3_256(derivation_path);

    // Point multiplication and addition
    const scalar = new BN(scalarHex, 16);
    const pointToAdd = ec.g.mul(scalar);
    const derivedPoint = masterPoint.add(pointToAdd);

    return derivedPoint.encode('hex', false); // Uncompressed
}
```

### Important: Contract as Caller

When using the proxy contract pattern (e.g., calling MPC via nft-ticket contract):

```typescript
// The MPC sees the CONTRACT as the caller
// So the derivation must use:
// - accountId: CONTRACT_ID (not user's account)
// - path: "{userAccount}/{derivationPath}"

const CONTRACT_ID = 'v1.utick.testnet';
const compositePath = `${accountId}/${path}`; // "user.testnet/lit/pkp-minting"
const derivedKey = deriveChildKey(masterKey, CONTRACT_ID, compositePath);
```

---

## MPC Signing

### Sign Message

```typescript
export async function signWithMPC(
    wallet: any,
    accountId: string,
    path: string,
    message: string
): Promise<any> {
    // Hash the message (EIP-191)
    const messageHash = ethers.hashMessage(message);
    const payload = Array.from(ethers.getBytes(messageHash));

    const args = {
        request: {
            payload,
            path,
            key_version: 0
        }
    };

    // Call MPC contract
    const result = await wallet.signAndSendTransaction({
        receiverId: MPC_CONTRACT,
        actions: [
            actions.functionCall(
                'sign',
                args,
                BigInt('300000000000000'), // 300 TGas
                BigInt('100000000000000000000000') // 0.1 NEAR
            )
        ]
    });

    // Parse signature
    const successValue = result.status.SuccessValue;
    return JSON.parse(Buffer.from(successValue, 'base64').toString());
}
```

### Signature Format

```typescript
// MPC returns:
{
    big_r: {
        affine_point: "04{x}{y}"  // 65 bytes hex
    },
    s: {
        scalar: "{s}"  // 32 bytes hex
    },
    recovery_id: 0 | 1
}

// Convert to ethers format:
const r = '0x' + mpcSig.big_r.affine_point.substring(2, 66);
const s = '0x' + mpcSig.s.scalar;
const v = mpcSig.recovery_id + 27;

const signature = ethers.Signature.from({ r, s, v }).serialized;
```

---

## MPCSigner Classes

### Ethers v6 (MPCSigner)

```typescript
export class MPCSigner extends ethers.AbstractSigner {
    constructor(
        wallet: any,
        nearAccountId: string,
        derivationPath: string = 'lit/pkp-minting',
        provider?: ethers.Provider
    )

    async getAddress(): Promise<string>
    connect(provider: ethers.Provider): MPCSigner
    async signTransaction(tx: ethers.TransactionRequest): Promise<string>
    async signMessage(message: string | Uint8Array): Promise<string>
    async signTypedData(
        domain: ethers.TypedDataDomain,
        types: Record<string, ethers.TypedDataField[]>,
        value: Record<string, any>
    ): Promise<string>
}
```

### Ethers v5 (MPCSignerV5)

For LitContracts compatibility:

```typescript
export class MPCSignerV5 extends ethers5.Signer {
    constructor(
        wallet: any,
        nearAccountId: string,
        derivationPath: string = 'lit/pkp-minting',
        provider?: ethers5.providers.Provider
    )

    async getAddress(): Promise<string>
    connect(provider: ethers5.providers.Provider): MPCSignerV5
    async signTransaction(tx: ethers5.providers.TransactionRequest): Promise<string>
    async signMessage(message: ethers5.Bytes | string): Promise<string>
}
```

---

## Usage Examples

### Derive Address (Free)

```typescript
import { deriveEthAddress } from '@/lib/chain-signatures';

// No gas cost - mathematical derivation
const ethAddress = await deriveEthAddress(
    accountId,
    'lit/pkp-minting'
);
console.log('ETH Address:', ethAddress);
```

### Sign with MPC

```typescript
import { signWithMPC } from '@/lib/chain-signatures';

// Costs ~0.1 NEAR
const signature = await signWithMPC(
    wallet,
    accountId,
    'lit/pkp-minting',
    'Sign this message'
);
```

### Use as Ethers Signer

```typescript
import { MPCSigner } from '@/lib/chain-signatures';
import { ethers } from 'ethers';

const signer = new MPCSigner(
    wallet,
    accountId,
    'lit/pkp-minting',
    provider
);

// Sign message
const signature = await signer.signMessage('Hello');

// Sign transaction
const signedTx = await signer.signTransaction({
    to: '0x...',
    value: ethers.parseEther('0.1')
});
```

---

## V-Flip Recovery

Sometimes the recovery_id needs to be flipped:

```typescript
let v_val = mpcSig.recovery_id + 27;
const signature = ethers.Signature.from({ r: r_val, s: s_val, v: v_val }).serialized;

// Verify
let recoveredAddr = ethers.verifyMessage(message, signature);

if (recoveredAddr.toLowerCase() !== derivedAddress.toLowerCase()) {
    // Try flipping v
    const flippedV = v_val === 27 ? 28 : 27;
    const flippedSig = ethers.Signature.from({ r: r_val, s: s_val, v: flippedV }).serialized;
    recoveredAddr = ethers.verifyMessage(message, flippedSig);

    if (recoveredAddr.toLowerCase() === derivedAddress.toLowerCase()) {
        // Use flipped signature
        return flippedSig;
    }
}
```

---

## Caching

Derived addresses are cached to avoid redundant RPC calls:

```typescript
const cacheKey = `mpc_address_v8_${accountId}_${path}`;

// Check cache
const cached = localStorage.getItem(cacheKey);
if (cached) return cached;

// Derive and cache
const address = deriveEthAddress(...);
localStorage.setItem(cacheKey, address);
```

---

## Cost Comparison

| Operation | Gas Cost |
|-----------|----------|
| Address Derivation | Free (view call) |
| MPC Sign | ~0.1 NEAR |
| PKP Sign (Lit) | Free (after setup) |

**Recommendation**: Use address derivation for setup, PKP for ongoing signing.

---

## Environment Variables

```env
# MPC Contract (default included)
NEXT_PUBLIC_MPC_CONTRACT=v1.signer-prod.testnet

# Contract ID (required for derivation path)
NEXT_PUBLIC_NFT_CONTRACT_ID=v1.utick.testnet
```

---

## Related Documentation

- [Lit Protocol](./lit-protocol.md) - Using derived addresses with Lit
- [Session Keys](./session-keys.md) - Signless operations
- [Smart Contract](./smart-contract.md) - sign_with_mpc proxy method
