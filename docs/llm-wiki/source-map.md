---
title: Source Map
status: live
area: maintenance
last_checked: 2026-05-19
confidence: high
sources:
  - docs/llm-wiki.md
  - docs/llm-wiki/agent-router.md
  - docs/README.md
  - docs/frontend.md
---

# Source Map

## Kisa ozet

Bu sayfa LLM/AI agent'in hangi soruda hangi kaynaga bakacagini gosterir. Dokumanlar tek basina yeterli degildir; riskli sorularda kod ve canli check gerekir.

## Kaynak onceligi

1. Aktif kaynak kodu ve testler.
2. Canli check: RPC, Worker health, Web4, browser smoke.
3. Kilitli plan ve runbook: `docs/launch-plan-2026-05.md`, `docs/release-runbook.md`, `docs/operations/known-issues.md`.
4. Mimari dokumanlar: `docs/architecture/**`, `docs/overview.md`, `docs/README.md`.
5. Eski analizler, audit notlari, sohbet gecmisi ve memory.

## Token optimizasyon kurali

1. Once [[agent-router|agent-router.md]] oku.
2. Ilgili module card'i ac.
3. Kaynak kodda sadece kartin isaret ettigi 3-6 dosyaya in.
4. Gerekirse `rg` ile dar arama yap.
5. Sonuca gitmeden once iddia riskliyse [[claims|claims.md]] ve canli check gerekliligini kontrol et.

## Ana kaynaklar

| Konu | Kaynak |
|---|---|
| Urun ve public alpha durusu | `docs/README.md`, `docs/overview.md` |
| Sistem mimarisi | `docs/architecture/README.md` |
| Storage ve delivery | `docs/architecture/storage.md`, `workers/storage-api/src/index.ts`, `workers/media-delivery/src/index.ts` |
| Frontend akislar | `docs/frontend.md`, `apps/web/components/**`, `apps/web/hooks/**`, `apps/web/lib/**` |
| Upload | `apps/web/hooks/useUpload.ts`, `apps/web/lib/storage/**`, `apps/web/lib/upload-session-manager.ts` |
| Playback | `apps/web/app/watch/page.tsx`, `apps/web/components/IpfsPlayer.tsx`, `apps/web/lib/kms/**`, `apps/web/lib/video-delivery*.ts` |
| Wallet ve signless playback | `docs/architecture/wallet-integration.md`, `docs/architecture/session-keys.md`, `apps/web/components/providers/WalletProvider.tsx` |
| NFT market contract | `contracts/nft-ticket/src/**`, `docs/architecture/smart-contract.md` |
| Access grants | `contracts/access-control/src/lib.rs`, `apps/web/lib/access-grants.ts` |
| Operator registry | `contracts/operator-registry/src/lib.rs`, `apps/web/lib/registry.ts` |
| Launch gates | `docs/launch-plan-2026-05.md`, `docs/release-runbook.md` |
| Bilinen riskler | `docs/operations/known-issues.md` |

## Module card girisleri

| Agent lens | Wiki karti |
|---|---|
| Frontend | [[module-cards/frontend|Frontend module card]] |
| Contracts | [[module-cards/contracts|Contracts module card]] |
| KMS | [[module-cards/kms|KMS module card]] |
| Storage | [[module-cards/storage|Storage module card]] |
| Wallet/playback | [[module-cards/wallet-playback|Wallet playback module card]] |
| Payments | [[module-cards/payments|Payments module card]] |
| Devops/release | [[module-cards/devops-release|Devops release module card]] |
| Security | [[module-cards/security|Security module card]] |

## Dar dogrulama komutlari

```bash
git status -sb
rg -n "production-ready|fully decentralized|NEXT_PUBLIC_KMS_URL|Lighthouse|Crust|KMS|upload|has_ticket" .
(cd apps/web && npm test -- --run)
(cd workers/storage-api && npm run check && npm test -- --run)
(cd workers/youtick-kms && npm run check && npm test -- --run)
(cd contracts/nft-ticket && cargo test --lib)
```

Tum monorepo testleri otomatik kosulmaz. Once degisen alan secilir.

## Sonraki check

- Canli domain/Web4/RPC check komutlari ayri bir runbook sayfasina eklenmeli.
