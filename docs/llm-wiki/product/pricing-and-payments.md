---
title: Pricing and Payments
status: live
area: product
last_checked: 2026-05-19
confidence: medium
sources:
  - docs/architecture/smart-contract.md
  - apps/web/components/TicketPurchaseCard.tsx
  - contracts/nft-ticket/src/market.rs
  - contracts/nft-ticket/src/treasury.rs
---

# Pricing and Payments

## Kisa ozet

Paid access modeli bilet satisina dayanir. Contract dokumanina gore paid ticket price split: %98 creator, %2 commission.

## Aktif gercek

- Viewer bilet satin alinca ownership on-chain kaydedilir.
- Access modeli payment kanalindan bagimsiz olarak NFT/dijital bilet sahipligidir.
- Stablecoin ve cross-chain checkout yuzeyleri vardir, ancak feature flag ve wallet sinirina baglidir.
- Guest/trial hesaplar paid checkout baslatmaz; real NEAR wallet CTA'sina yonlenir.

## Kanitlar

- `docs/architecture/smart-contract.md`: economy model ve method aileleri.
- `docs/frontend.md`: TicketPurchaseCard ve cross-chain checkout siniri.
- `contracts/nft-ticket/src/market.rs`: `buy_ticket` ve market akisi.
- `contracts/nft-ticket/src/treasury.rs`: USDC/USDT pool ve treasury methodlari.

## Celiskiler veya dikkat noktalar

- Payment provider degisse bile entitlement source of truth NEAR ownership kalir.
- Canli fiyat/fee davranisi icin contract source ve mainnet view ayrica check edilmeli.

## Ilgili sayfalar

- [[flows/purchase-and-watch|Satin alma ve izleme]]
- [[architecture/contracts|Contracts]]
- [[claims|Claims]]
