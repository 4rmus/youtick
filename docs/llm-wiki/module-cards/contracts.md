---
title: Contracts Module Card
status: live
area: module-card
last_checked: 2026-05-19
confidence: high
sources:
  - contracts/nft-ticket
  - contracts/access-control
  - contracts/operator-registry
  - docs/architecture/smart-contract.md
---

# Contracts Module Card

## Ne yapar?

NEAR tarafinda ticket, market, gift/trial, access grant ve operator registry source of truth katmanidir.

## Ilk oku

1. [[../architecture/contracts|Contracts wiki]]
2. [[../claims|Claim register]]
3. Degisen kontratin `src/**` dosyalari
4. Ilgili test dosyalari

## En sik kaynak dosyalar

| Konu | Dosya |
|---|---|
| Ticket/market | `contracts/nft-ticket/src/lib.rs`, `contracts/nft-ticket/src/market.rs` |
| Gift/trial | `contracts/nft-ticket/src/gift.rs` |
| Treasury/stablecoin | `contracts/nft-ticket/src/treasury.rs` |
| Views | `contracts/nft-ticket/src/views.rs` |
| Access grant | `contracts/access-control/src/lib.rs` |
| Registry/threshold | `contracts/operator-registry/src/lib.rs` |

## Dar dogrulama

```bash
cd contracts/nft-ticket && cargo test --lib
cd contracts/access-control && cargo test
cd contracts/operator-registry && cargo test
```

## Dikkat

- Ticket ownership ve entitlement source of truth NEAR tarafidir.
- Contract behavior degisirse frontend call signature ve worker config de kontrol edilir.
- Migration/timelock kodu aktif user path gibi yorumlanmaz.
- Mainnet hash iddialari canli RPC ile yeniden dogrulanmadan kesin yazilmaz.
