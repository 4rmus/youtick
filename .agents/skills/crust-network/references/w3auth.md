# W3Auth Authentication

Use this reference when working on Crust authenticated upload or PSA pinning.

## Auth Modes

| Surface | Typical endpoint shape | Header | Payload |
|---|---|---|---|
| Gateway | `/api/v0/add`, `/api/v0/cat` | `Basic` | `base64(ChainType-PubKey:SignedMsg)` |
| PSA pinning | `/psa/pins` | `Bearer` | `base64(ChainType-PubKey:SignedMsg)` |

Crust's hosted examples are not perfectly consistent across old docs. Treat the pinning-service docs as the default for new work, but confirm target endpoint behavior before changing a live integration.

## Chain Tags Used In Practice

- NEAR: `near` or `nea`
- Substrate / Crust: `sub`
- Ethereum-compatible: `eth`
- Polygon: `pol`
- Solana: `sol`

## Repo-Aligned NEAR Example

The current app stores a NEAR session key in the browser and builds a Crust auth header from that key.

```typescript
import { generateW3AuthToken } from '@/lib/crust/w3auth';

const token = await generateW3AuthToken(accountId);

await fetch('https://crustipfs.xyz/api/v0/add', {
  method: 'POST',
  headers: {
    Authorization: token.header,
  },
  body: formData,
});
```

`generateW3AuthToken()` currently returns a header shaped like:

```text
Basic base64("near-<raw-ed25519-pubkey>:<signature-hex>")
```

That matches the gateway upload flow used by the repo today.

## Manual NEAR Header Construction

```typescript
import { KeyPair } from 'near-api-js';

const keyPair = KeyPair.fromString(secretKey);
const publicKey = keyPair.getPublicKey().toString().replace('ed25519:', '');
const signature = Buffer.from(keyPair.sign(Buffer.from(publicKey)).signature).toString('hex');

const payload = `near-${publicKey}:${signature}`;
const gatewayHeader = `Basic ${Buffer.from(payload).toString('base64')}`;
const psaHeader = `Bearer ${Buffer.from(payload).toString('base64')}`;
```

## When To Use Which Header

- Use `Basic` when talking to Crust's IPFS-compatible gateway API.
- Use `Bearer` when the target truly implements the IPFS Pinning Service API.
- If a hosted PSA endpoint already works with `Basic`, treat that as deployment-specific legacy behavior and document it locally.

## Operational Notes

- Gateway auth proves control of a Web3 key; it does not prove a storage order exists.
- Token caches should be short-lived and easy to invalidate.
- Browser code should only use user or session keys, never embedded service secrets.
