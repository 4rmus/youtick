# Configuration Reference

> Environment variables and configuration for YouTick

---

## Environment Variables

Create `apps/web/.env.local` from the template:

```bash
cp apps/web/.env.example apps/web/.env.local
```

### Network Configuration

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `NEXT_PUBLIC_NEAR_NETWORK` | Yes | — | NEAR network (`mainnet` or `testnet`) |
| `NEXT_PUBLIC_NFT_CONTRACT_ID` | Yes | — | NFT ticket contract account ID |

```env
# Mainnet
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near

# Testnet
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_NFT_CONTRACT_ID=v1.utick.testnet
```

### Nova Protocol

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `NEXT_PUBLIC_NOVA_NETWORK` | Yes | — | Nova network (`mainnet` or `testnet`) |
| `NEXT_PUBLIC_NOVA_CONTRACT_ID` | Yes | — | Nova SDK contract ID |
| `NEXT_PUBLIC_NOVA_API_KEY` | Yes | — | Nova API authentication key |
| `NEXT_PUBLIC_NOVA_ACCOUNT_ID` | Yes | — | Nova service account ID |

```env
# Mainnet
NEXT_PUBLIC_NOVA_NETWORK=mainnet
NEXT_PUBLIC_NOVA_CONTRACT_ID=nova-sdk.near

# Testnet
NEXT_PUBLIC_NOVA_NETWORK=testnet
NEXT_PUBLIC_NOVA_CONTRACT_ID=nova-sdk-6.testnet
```

### Trial Account System (Optional)

| Variable | Required | Default | Description |
|----------|:--------:|---------|-------------|
| `RELAYER_ACCOUNT_ID` | No | — | Relayer account for sponsored transactions |
| `RELAYER_PRIVATE_KEY` | No | — | Relayer private key (`ed25519:...`) |

```env
RELAYER_ACCOUNT_ID=relayer.youtick.near
RELAYER_PRIVATE_KEY=ed25519:...
```

> Trial accounts can also be created without a relayer using Onboarding Keys (client-side).

---

## RPC Endpoints

YouTick uses multi-endpoint failover for NEAR RPC:

**Mainnet (in priority order):**
1. `https://free.rpc.fastnear.com`
2. `https://rpc.mainnet.near.org`
3. `https://near.lava.build`

**Testnet:**
1. `https://rpc.testnet.near.org`
2. `https://rpc.testnet.pagoda.co`

RPC failover is automatic — no configuration needed.

---

## IPFS Gateways

YouTick uses multi-gateway failover for IPFS content retrieval:

1. `crustipfs.xyz` (Crust API, POST — primary)
2. `ipfs.io` (IPFS Foundation)
3. `dweb.link` (IPFS Foundation)
4. `trustless-gateway.link`
5. `4everland.io`
6. `gateway.lighthouse.storage`
7. `w3s.link`

Gateway failover is automatic — no configuration needed.

---

## Development vs Production

| Setting | Development (Testnet) | Production (Mainnet) |
|---------|----------------------|---------------------|
| Network | `testnet` | `mainnet` |
| Contract | `v1.utick.testnet` | `youtick.near` |
| Nova Contract | `nova-sdk-6.testnet` | `nova-sdk.near` |
| Wallet | Testnet wallets | Mainnet wallets |
| NEAR Faucet | Available | N/A |

### Minimal Testnet Configuration

```env
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_NFT_CONTRACT_ID=v1.utick.testnet
NEXT_PUBLIC_NOVA_NETWORK=testnet
NEXT_PUBLIC_NOVA_CONTRACT_ID=nova-sdk-6.testnet
NEXT_PUBLIC_NOVA_API_KEY=your-testnet-api-key
NEXT_PUBLIC_NOVA_ACCOUNT_ID=your-testnet-account
```

### Minimal Mainnet Configuration

```env
NEXT_PUBLIC_NEAR_NETWORK=mainnet
NEXT_PUBLIC_NFT_CONTRACT_ID=youtick.near
NEXT_PUBLIC_NOVA_NETWORK=mainnet
NEXT_PUBLIC_NOVA_CONTRACT_ID=nova-sdk.near
NEXT_PUBLIC_NOVA_API_KEY=your-mainnet-api-key
NEXT_PUBLIC_NOVA_ACCOUNT_ID=your-mainnet-account
```

---

**Next:** [Architecture Overview](../architecture/README.md)
