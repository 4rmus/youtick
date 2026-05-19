---
title: Agent Router
status: live
area: maintenance
last_checked: 2026-05-19
confidence: high
sources:
  - docs/llm-wiki/source-map.md
  - docs/llm-wiki.md
  - .gitignore
---

# Agent Router

## Kisa ozet

Bu dosya AI agentlar icin token azaltan ilk yonlendirme katmanidir.

Kural: once ilgili wiki kartini oku, sonra sadece gerekli kaynak dosyalara in.
Wiki kaynak kodun yerine gecmez; dogru dosyaya giden kisa haritadir.

## Baslangic sirasi

1. [[index|LLM Wiki index]]
2. [[agent-router|Agent router]]
3. Ilgili [[module-cards/frontend|module card]] veya flow sayfasi
4. Kaynak kod ve dar test

## Degisen alana gore oku

| Is alani | Once oku | Sonra kaynak dosyalar |
|---|---|---|
| Landing, discover, profil, UI copy | [[module-cards/frontend|Frontend card]] | `apps/web/app/**`, `apps/web/components/**`, `apps/web/lib/translations.ts` |
| Upload/publish | [[flows/upload|Upload flow]], [[module-cards/storage|Storage card]] | `apps/web/hooks/useUpload.ts`, `apps/web/lib/storage/**`, `apps/web/lib/upload-session-manager.ts`, `workers/storage-api/src/index.ts` |
| Watch/playback | [[flows/purchase-and-watch|Purchase and watch]], [[module-cards/wallet-playback|Wallet playback card]] | `apps/web/app/watch/page.tsx`, `apps/web/components/IpfsPlayer.tsx`, `apps/web/lib/kms/**`, `apps/web/lib/video-delivery*.ts`, `apps/web/components/providers/WalletProvider.tsx` |
| KMS/share/retrieve | [[module-cards/kms|KMS card]], [[architecture/kms-and-access|KMS and access]] | `workers/youtick-kms/src/index.ts`, `apps/web/lib/kms/client.ts`, `apps/web/lib/kms/shares.ts`, `contracts/operator-registry/src/lib.rs` |
| Storage/provider/delivery | [[module-cards/storage|Storage card]], [[architecture/storage-and-delivery|Storage and delivery]] | `workers/storage-api/src/index.ts`, `workers/media-delivery/src/index.ts`, `apps/web/lib/storage/**`, `apps/web/lib/ipfs/**` |
| Contract behavior | [[module-cards/contracts|Contracts card]], [[architecture/contracts|Contracts]] | `contracts/nft-ticket/src/**`, `contracts/access-control/src/lib.rs`, `contracts/operator-registry/src/lib.rs` |
| Payments/pricing | [[module-cards/payments|Payments card]], [[product/pricing-and-payments|Pricing and payments]] | `apps/web/components/TicketPurchaseCard.tsx`, `apps/web/components/PaymentMethodSelector.tsx`, `apps/web/lib/intents/**`, `contracts/nft-ticket/src/treasury.rs` |
| Gift/trial | [[flows/gift-and-trial|Gift and trial]], [[module-cards/contracts|Contracts card]] | `apps/web/lib/gift-service.ts`, `apps/web/app/claim/**`, `apps/web/app/trial/**`, `contracts/nft-ticket/src/gift.rs` |
| Release/deploy/live status | [[module-cards/devops-release|Devops release card]], [[operations/launch-status|Launch status]], [[operations/live-health-gates|Live health gates]] | `docs/launch-plan-2026-05.md`, `docs/release-runbook.md`, `scripts/**`, `workers/*/wrangler.toml` |
| Security review | [[module-cards/security|Security card]], [[audits/security|Security audit]] | Changed files first; then KMS, contracts, workers, env docs |

## Ajan secimi

| Degisiklik | Birincil lens | Ikincil lens |
|---|---|---|
| `apps/web/**` | frontend | integrator |
| `contracts/**` | contract | security |
| `workers/youtick-kms/**` | kms | security |
| `workers/storage-api/**` veya `workers/media-delivery/**` | storage | integrator |
| `scripts/**`, deploy veya config | devops | security |
| Birden fazla katman | integrator | ilgili domain kartlari |

## Token kurali

- Ilk pass'te tum repoyu okuma.
- Once 1-2 wiki sayfasi, sonra en fazla 3-6 kaynak dosya oku.
- `rg` ile sadece ilgili terimleri ara.
- Canli durum, para, deploy, security ve launch iddialarinda wiki yetmez; kaynak veya live check gerekir.
- Kod kopyalarini wiki'ye alma. Wiki dosya yolu, karar ve risk tutsun.

## Is sonu ingest

Is bittiginde sadece gerekliyse:

1. Ilgili module card veya flow sayfasini guncelle.
2. Kritik iddia degistiyse [[claims|claims.md]] icine isle.
3. [[log|log.md]] icine kisa append-only kayit ekle.
4. `node scripts/check-llm-wiki.mjs` calistir.

## Sonraki check

- `.claude/agents/**` local-only oldugu icin kalici kural burada tutulur.
- Yeni bir ana modul eklendiginde once router'a satir ekle.
