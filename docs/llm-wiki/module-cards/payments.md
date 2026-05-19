---
title: Payments Module Card
status: live
area: module-card
last_checked: 2026-05-19
confidence: medium
sources:
  - apps/web/components/TicketPurchaseCard.tsx
  - apps/web/components/PaymentMethodSelector.tsx
  - apps/web/lib/intents
  - contracts/nft-ticket/src/treasury.rs
---

# Payments Module Card

## Ne yapar?

Payment katmani paid ticket checkout, NEAR/stablecoin secimi, Intents/Rhea entegrasyonu ve contract treasury davranisini kapsar.

## Ilk oku

1. [[../product/pricing-and-payments|Pricing and payments]]
2. [[../flows/purchase-and-watch|Purchase and watch flow]]
3. `apps/web/components/TicketPurchaseCard.tsx`
4. `contracts/nft-ticket/src/treasury.rs`

## En sik kaynak dosyalar

| Konu | Dosya |
|---|---|
| Purchase UI | `apps/web/components/TicketPurchaseCard.tsx` |
| Payment method | `apps/web/components/PaymentMethodSelector.tsx` |
| Stablecoin/Intents | `apps/web/lib/intents/**`, `apps/web/lib/hooks/useStablecoinPayment.ts` |
| Rhea quote/swap | `apps/web/lib/rhea/client.ts` |
| Contract payout | `contracts/nft-ticket/src/treasury.rs`, `contracts/nft-ticket/src/market.rs` |

## Dar dogrulama

```bash
cd apps/web && npm test -- --run __tests__/unit/one-click-client.test.ts
cd apps/web && npm test -- --run __tests__/unit/rhea-client.test.ts
cd contracts/nft-ticket && cargo test --lib
```

## Dikkat

- Free access korunur; paid checkout gercek wallet CTA'sina cekilir.
- Minimum price veya fee iddialari contract ve frontend source-of-truth ayrimi yapilarak anlatilir.
- Para akisi canli veya test kaniti olmadan kesin "calisiyor" diye yazilmaz.
