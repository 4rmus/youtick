# W3Auth Multi-Chain Authentication Reference

## Overview

W3Auth (Web3 Authentication) allows users from any supported blockchain to authenticate with Crust IPFS gateways. Authentication uses a standard HTTP Basic auth header with chain-specific cryptographic signatures.

## Auth Header Format

```
Authorization: Basic <base64(ChainType-PubKey:SignedMessage)>
```

- **ChainType**: Chain identifier prefix (e.g., `eth`, `near`, `sol`)
- **PubKey**: Chain-specific public key or address
- **SignedMessage**: Signature of the PubKey using the corresponding private key

## Supported Chains

| Chain | Type Keys | Key Format | Signature Method |
|-------|-----------|------------|-----------------|
| Substrate/Crust | `sub`, `substrate`, `crust`, `cru` | SS58 address | SR25519 |
| Ethereum | `eth`, `ethereum` | 0x address | EIP-191 personal sign |
| Polygon | `pol`, `polygon` | 0x address | EIP-191 personal sign |
| Solana | `sol`, `solana` | BS58 pubkey | ed25519 nacl |
| **NEAR** | `nea`, `near` | BS58 pubkey | ed25519 nacl |
| Avalanche | `ava`, `avalanche` | X/P chain | Custom (no chainID) |
| Aptos | `apt`, `aptos` | ed25519 pubkey | ed25519 |
| Algorand | `algo`, `algorand` | Address | Custom |
| TON | `ton` | Address | Custom |
| Flow | `flo`, `flow` | Address | Custom |
| Elrond | `elr`, `elrond` | Address | Custom |
| XX Network | `xx` | Address | Custom |

## NEAR Protocol Auth

NEAR uses ed25519 keys (same cryptographic family as Solana).

```typescript
import { KeyPair } from 'near-api-js';
import { u8aToHex } from '@polkadot/util';
import { create } from 'ipfs-http-client';

// Generate or load NEAR key pair
const keyPair = KeyPair.fromRandom('ed25519');
const addressRaw = keyPair.getPublicKey().toString(); // "ed25519:ABC..."
const address = addressRaw.substring(8); // Strip "ed25519:" prefix

// Sign the address with the private key
const { signature } = keyPair.sign(Buffer.from(address));
const sig = u8aToHex(signature).substring(2); // Hex without 0x prefix

// Build auth header
const authHeaderRaw = `near-${address}:${sig}`;
const authHeader = Buffer.from(authHeaderRaw).toString('base64');

// Use with IPFS client
const ipfs = create({
    url: 'https://crustipfs.xyz/api/v0',
    headers: { authorization: `Basic ${authHeader}` }
});

// Upload files
const { cid } = await ipfs.add('Hello from NEAR!');
```

**Key points for NEAR auth:**
- Strip `ed25519:` prefix from public key
- Signature is hex-encoded without `0x` prefix
- Uses nacl ed25519 verification internally

## Ethereum Auth

```typescript
import { ethers } from 'ethers';

const wallet = ethers.Wallet.createRandom();
const sig = await wallet.signMessage(wallet.address);

const authHeaderRaw = `eth-${wallet.address}:${sig}`;
const authHeader = Buffer.from(authHeaderRaw).toString('base64');
```

## Substrate Auth

```typescript
import { Keyring } from '@polkadot/keyring';
import { u8aToHex } from '@polkadot/util';

const keyring = new Keyring({ type: 'sr25519' });
const pair = keyring.addFromUri('//Alice');
const sig = u8aToHex(pair.sign(pair.address));

const authHeaderRaw = `sub-${pair.address}:${sig}`;
const authHeader = Buffer.from(authHeaderRaw).toString('base64');
```

## Solana Auth

```typescript
import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const keypair = Keypair.generate();
const address = bs58.encode(keypair.publicKey.toBytes());
const sig = Buffer.from(
    nacl.sign.detached(Buffer.from(address), keypair.secretKey)
).toString('hex');

const authHeaderRaw = `sol-${address}:${sig}`;
const authHeader = Buffer.from(authHeaderRaw).toString('base64');
```

## Using W3Auth Gateway

### Upload Files (Write API)

```bash
curl -X POST \
    -F file=@myfile.txt \
    -u "eth-0xABCD...:0xSignature..." \
    "https://crustipfs.xyz/api/v0/add"
```

### Retrieve Files (Read API)

```bash
# Public read (no auth required on most gateways)
curl "https://gw.crustgw.work/ipfs/QmCID..."

# Authenticated read (if gateway requires it)
curl -H "Authorization: Basic $AUTH_HEADER" \
    "https://gw.crustgw.work/ipfs/QmCID..."
```

### IPFS Remote Pinning Service

W3Auth also works with the standard IPFS Remote Pinning API:

```bash
# Add Crust as remote pinning service
ipfs pin remote service add crustpinner \
    http://localhost:3000/psa \
    $(echo -n "near-PubKey:SignedMsg" | base64)

# Pin a CID
ipfs pin remote add --service=crustpinner QmCID...

# Check pin status
ipfs pin remote ls --service=crustpinner --cid=QmCID...
```

## Gateway Endpoints

| Gateway | Location | URL |
|---------|----------|-----|
| crustipfs.xyz | Global | `https://crustipfs.xyz` |
| crustgw.work | US (Seattle) | `https://gw.crustgw.work` |
| crustgw.org | CN (Shanghai) | `https://gw.crustgw.org` |
| crust-gateway.xyz | DE (Berlin) | `https://gw.crust-gateway.xyz` |
| crust-gateway.com | SG (Singapore) | `https://gw.crust-gateway.com` |

## Auth Verification Flow

```
Client                    W3Auth Gateway              IPFS Node
  │                            │                          │
  │  Authorization: Basic ...  │                          │
  ├───────────────────────────▶│                          │
  │                            │  Parse header            │
  │                            │  Extract chainType       │
  │                            │  Route to auth provider  │
  │                            │  Verify signature        │
  │                            │                          │
  │                            │  (if valid)              │
  │                            │  Forward request         │
  │                            ├─────────────────────────▶│
  │                            │                          │
  │    Response (CID/data)     │    IPFS response         │
  │◀───────────────────────────┤◀─────────────────────────│
```

## Self-Hosting W3Auth Gateway

```bash
# Clone the gateway
git clone https://github.com/crustio/ipfs-w3auth-gateway.git
cd ipfs-w3auth-gateway

# Configure .env
IPFS_GATEWAY=http://localhost:8080
PORT=5050
AUTH_REQUIRED=write  # 'write', 'read', or 'both'

# Run
yarn install && yarn start
```
