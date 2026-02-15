# W3Bucket NFT Storage Reference

## Overview

W3Bucket is an ERC-721 NFT-based storage product. Each W3Bucket token represents a storage capacity tier that the holder can use to store files on Crust/IPFS. Deployed on Ethereum, Optimism, and Base.

## Contract Architecture

W3Bucket inherits from:
- ERC721Enumerable (token listing)
- ERC721URIStorage (metadata)
- ERC721Burnable (token destruction)
- Pausable (emergency stop)
- AccessControl (role management)
- UUPSUpgradeable (proxy upgrade)

## Edition System

Storage buckets come in editions with configurable capacity, pricing, and supply.

```solidity
struct BucketEditionParams {
    uint256 editionId;              // 1-100
    uint256 capacityInGigabytes;    // 0 = unlimited
    uint256 maxMintableSupply;      // max 1,000,000 per edition
}
```

**Token ID scheme**: `editionId * 1_000_000 + sequentialIndex`

Example: Edition 3, 5th mint = Token ID `3_000_005`

## Minting

```solidity
function mint(
    address to,
    uint256 editionId,
    address currency,    // address(0) for native token, ERC20 address otherwise
    string calldata uri  // metadata URI (IPFS CID)
) external payable nonReentrant
```

### Mint Example (ethers.js)

```typescript
import { ethers } from 'ethers';

const W3BucketABI = [
    "function mint(address to, uint256 editionId, address currency, string uri) external payable",
    "function editionPrice(uint256 editionId, address currency) external view returns (uint256)",
];

const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const w3bucket = new ethers.Contract(contractAddress, W3BucketABI, signer);

// Get edition price (native token)
const price = await w3bucket.editionPrice(1, ethers.ZeroAddress);

// Mint a bucket
const tx = await w3bucket.mint(
    await signer.getAddress(), // recipient
    1,                          // edition ID
    ethers.ZeroAddress,         // native token payment
    'ipfs://QmMetadata...',     // metadata URI
    { value: price }
);
await tx.wait();
```

## Roles

| Role | Permission |
|------|-----------|
| `DEFAULT_ADMIN_ROLE` | Full admin access |
| `PAUSER_ROLE` | Pause/unpause contract |
| `UPGRADER_ROLE` | Upgrade proxy implementation |
| `EDITIONS_ADMIN_ROLE` | Manage editions and pricing |
| `WITHDRAWER_ROLE` | Withdraw funds |

## Deployment Chains

- Ethereum Mainnet
- Optimism Mainnet / Sepolia
- Base Mainnet / Sepolia
- Goerli (deprecated)

## Events

```solidity
event PermanentURI(string _value, uint256 indexed _id);
// Emitted on mint - follows OpenSea frozen metadata standard
```

## Integration with Crust Storage

W3Bucket holders use their token capacity to store files:

```
Mint W3Bucket NFT → Get storage capacity
                          ↓
                    Upload files to IPFS (W3Auth)
                          ↓
                    Files count against bucket capacity
                          ↓
                    Crust guarantees persistence
```
