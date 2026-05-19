---
title: Wallet Playback Module Card
status: live
area: module-card
last_checked: 2026-05-19
confidence: high
sources:
  - docs/architecture/wallet-integration.md
  - docs/architecture/session-keys.md
  - apps/web/app/watch/page.tsx
  - apps/web/components/providers/WalletProvider.tsx
  - apps/web/lib/access-grants.ts
---

# Wallet Playback Module Card

## Ne yapar?

Wallet/playback siniri connect, managed account, signless Play grant, KMS auth ve watch UX arasindaki hassas bolgedir.

## Ilk oku

1. [[../flows/purchase-and-watch|Purchase and watch flow]]
2. [[../architecture/wallet-and-signless-flow|Wallet and signless flow]]
3. `apps/web/app/watch/page.tsx`
4. `apps/web/components/IpfsPlayer.tsx`
5. `apps/web/lib/kms/client.ts`
6. `apps/web/lib/access-grants.ts`

## En sik kaynak dosyalar

| Konu | Dosya |
|---|---|
| Wallet provider | `apps/web/components/providers/WalletProvider.tsx` |
| Session grant | `apps/web/lib/access-grants.ts` |
| Managed account | `apps/web/lib/managed-near-account.ts`, `apps/web/lib/trial-wallet.ts` |
| KMS retrieve | `apps/web/lib/kms/client.ts` |
| Watch entry | `apps/web/app/watch/page.tsx` |
| Watch player | `apps/web/components/IpfsPlayer.tsx`, `apps/web/lib/video-delivery-player.ts`, `apps/web/lib/video-delivery.ts` |

## Dar dogrulama

```bash
cd apps/web && npm test -- --run __tests__/unit/kms-client.test.ts
cd apps/web && npm test -- --run __tests__/unit/gift-service.test.ts
```

## Dikkat

- Izleme sirasinda yeni wallet popup acilmasi regresyon sayilir.
- Cached Play grant reddedilirse wallet signing'e sessiz fallback yapma davranisi risklidir.
- Guest/trial, free collectible ve paid ticket akislari ayni kefeye konmaz.
