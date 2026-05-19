---
title: Gift and Trial Flow
status: live
area: flows
last_checked: 2026-05-19
confidence: medium
sources:
  - docs/overview.md
  - docs/frontend.md
  - docs/architecture/wallet-integration.md
  - contracts/nft-ticket/src/gift.rs
  - contracts/nft-ticket/src/onboarding.rs
  - contracts/nft-ticket/src/treasury.rs
---

# Gift and Trial Flow

## Kisa ozet

Gift ve trial akislarinin hedefi dusuk surtunmeli free access saglamak; paid checkout'u guest/trial ile baslatmak degildir.

## Aktif gercek

Gift:

- Creator gift link uretir.
- Recipient mevcut wallet'a claim edebilir veya guest implicit account kullanabilir.
- Entitlement yine market contract tarafinda tutulur.

Trial:

- Server-issued onboarding key ve Turnstile production gate ile implicit account yaratilir.
- Trial account local managed account olarak calisir.
- Paid purchase icin real NEAR wallet'a gecis gerekir.

## Kanitlar

- `docs/frontend.md`: gift claim ve trial onboarding flow.
- `docs/architecture/wallet-integration.md`: guest/trial boundary.
- Contract gift/onboarding/treasury modules.

## Celiskiler veya dikkat noktalar

- Legacy named-subaccount methodlari kalabilir; yeni ana yol implicit account variants.
- Onboarding key private materyali wiki'ye yazilmaz.
- Trial pool funding canli durumdur; release oncesi check gerekir.

## Sonraki check

- Guest free-ticket watch smoke.
- Paid ticket guest account CTA davranisi.
- Onboarding key inventory ve allowlist canli check.
