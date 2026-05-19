---
title: Wallet and Signless Flow
status: live
area: architecture
last_checked: 2026-05-19
confidence: high
sources:
  - docs/architecture/wallet-integration.md
  - docs/architecture/session-keys.md
  - apps/web/components/providers/WalletProvider.tsx
  - apps/web/lib/signless-access-key.ts
  - apps/web/lib/access-grants.ts
---

# Wallet and Signless Flow

## Kisa ozet

Wallet connect bir kez yapilir; paid playback sirasinda tekrar tekrar wallet popup acilmamasi hedeflenir.

## Aktif gercek

- Standard NEAR wallet connector layer: `@hot-labs/near-connect`.
- `@near-wallet-selector/*` app'in direct dependency'si degil.
- Connect sirasinda `access.youtick.near` icin dar kapsamli function-call access key kurulur.
- Bu key sadece `issue_session_grant` icin kullanilir.
- Playback icin 10 dakikalik Play grant uretilir.
- Guest/trial managed accountlar local key ile calisir; paid checkout real NEAR wallet ister.

## Kanitlar

- `docs/architecture/wallet-integration.md`: HOT Connect, guest/trial ve paid checkout sinirlari.
- `docs/architecture/session-keys.md`: upload session ile signless access key ayrimi.
- `apps/web/lib/signless-access-key.ts`: dar scope key tanimi.
- `apps/web/lib/access-grants.ts`: grant lifecycle.

## Celiskiler veya dikkat noktalar

- Upload session ve signless playback ayni sey degildir.
- Guest/trial free access destekler; paid purchase real wallet CTA'sina cekilir.
- Wallet UX compile/build ile bitmis sayilmaz; manual wallet smoke gerekir.

## Sonraki check

- Modal open/sign in/sign out.
- Connect sonrasi limited access key kurulumu.
- Paid playback sirasinda wallet popup acilmamasi.
