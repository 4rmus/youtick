---
title: Frontend Module Card
status: live
area: module-card
last_checked: 2026-05-19
confidence: high
sources:
  - apps/web/app
  - apps/web/components
  - apps/web/lib
  - docs/frontend.md
---

# Frontend Module Card

## Ne yapar?

Next.js uygulamasi, creator upload yuzeyi, discover/profile sayfalari, watch player, wallet baglantisi ve satin alma arayuzunu tasir.

## Ilk oku

1. [[../agent-router|Agent router]]
2. [[../flows/purchase-and-watch|Purchase and watch flow]] veya [[../flows/upload|Upload flow]]
3. `apps/web/app/**`
4. `apps/web/components/**`
5. `apps/web/lib/**`

## En sik kaynak dosyalar

| Konu | Dosya |
|---|---|
| Landing/discover | `apps/web/app/page.tsx`, `apps/web/components/discover/**` |
| Upload UI | `apps/web/app/upload/page.tsx`, `apps/web/hooks/useUpload.ts` |
| Watch UI | `apps/web/app/watch/page.tsx`, `apps/web/components/IpfsPlayer.tsx` |
| Wallet | `apps/web/components/providers/WalletProvider.tsx` |
| Purchase | `apps/web/components/TicketPurchaseCard.tsx`, `apps/web/components/PaymentMethodSelector.tsx` |
| Copy/i18n | `apps/web/lib/translations.ts` |

## Dar dogrulama

```bash
cd apps/web && npm test -- --run
cd apps/web && npm run build
```

## Dikkat

- Watch sirasinda hedef UX yeni wallet popup acmamak; signless Play grant onemlidir.
- Guest/trial ve paid checkout birbirine karistirilmamali.
- UI copy repo gerceginden ileri claim yapmamali: public alpha, hybrid decentralized.
- Buyuk frontend refactor yerine degisen akisla ilgili en kucuk test tercih edilir.
