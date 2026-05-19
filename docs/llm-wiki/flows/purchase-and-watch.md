---
title: Purchase and Watch Flow
status: live
area: flows
last_checked: 2026-05-19
confidence: high
sources:
  - docs/frontend.md
  - docs/architecture/storage.md
  - docs/architecture/session-keys.md
  - apps/web/app/watch/page.tsx
  - apps/web/components/TicketPurchaseCard.tsx
  - apps/web/components/IpfsPlayer.tsx
---

# Purchase and Watch Flow

## Kisa ozet

Viewer once entitlement kazanir; sonra player access grant ve KMS share'lerle sifreli videoyu browser'da acar.

## Aktif gercek

Purchase:

- Event bilgisi contract'tan okunur.
- Ticket ownership on-chain yazilir.
- Paid checkout guest/trial account ile baslamaz; real NEAR wallet ister.

Watch:

1. Event metadata ve encrypted CID cozulur.
2. Ticket ownership, creator entitlement veya gift/trial claim kontrol edilir.
3. `access.youtick.near` uzerinde 10 dakikalik Play grant uretilir.
4. Operator registry'den aktif operatorler ve threshold okunur.
5. KMS share'leri paralel istenir.
6. Threshold saglaninca AES key browser'da reconstruce edilir.
7. Sifreli media okunur, decrypt edilir ve oynatilir.

## Kanitlar

- `docs/frontend.md`: playback ve ticket purchase flow.
- `docs/architecture/storage.md`: playback sequence.
- `docs/architecture/session-keys.md`: signless access grant.

## Celiskiler veya dikkat noktalar

- Session grant reject olursa UI reconnect ister; sessizce gecilmez.
- KMS threshold ve operator health canli check gerektirir.
- Full upload-buy-watch smoke bu wiki kurulumunda calistirilmadi.

## Ilgili sayfalar

- [[architecture/kms-and-access|KMS ve access]]
- [[architecture/wallet-and-signless-flow|Wallet ve signless flow]]
- [[operations/live-health-gates|Live health gates]]
