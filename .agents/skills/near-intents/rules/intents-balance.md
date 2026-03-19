---
title: Intents Balance Mode
impact: MEDIUM
tags: intents, balance, architecture
---

Alternative architecture where your app operates with `INTENTS` balances instead of always settling back to an external chain. Choose one operating mode intentionally.

## Deposit to Intents Balance

```typescript
const quote = await fetch('https://1click.chaindefuser.com/v0/quote', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    dry: false,
    swapType: 'EXACT_INPUT',
    originAsset: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near',
    destinationAsset: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near', // Same
    depositType: 'ORIGIN_CHAIN',
    recipientType: 'INTENTS',
    recipient: 'user.near',
    refundTo: '0xUserAddress',
    amount: '1000000',
  })
}).then(r => r.json());
```

## Withdraw from Intents Balance

```typescript
const quote = await fetch('https://1click.chaindefuser.com/v0/quote', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    dry: false,
    swapType: 'EXACT_INPUT',
    originAsset: 'nep141:sol-EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v.omft.near',
    destinationAsset: 'nep141:sol-EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v.omft.near', // Same
    depositType: 'INTENTS',
    recipientType: 'DESTINATION_CHAIN',
    recipient: 'SolanaAddress...',
    refundTo: 'user.near',
    refundType: 'INTENTS',
    amount: '1000000',
  })
}).then(r => r.json());
```

## Query Balance

```typescript
import { JsonRpcProvider } from 'near-api-js';

const provider = new JsonRpcProvider({
  url: 'https://rpc.mainnet.near.org',
});

const response = await provider.query({
  request_type: 'call_function',
  account_id: 'intents.near',
  method_name: 'mt_balance_of',
  args_base64: Buffer.from(JSON.stringify({
    account_id: accountId,
    token_id: tokenId,
  })).toString('base64'),
  finality: 'final',
}) as { result: number[] };

const balance = JSON.parse(Buffer.from(response.result).toString());
```
