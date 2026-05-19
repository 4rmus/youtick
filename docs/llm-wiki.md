# YouTick LLM Wiki

> YouTick icin LLM tarafindan bakimi yapilacak, kanita dayali ve yasayan bilgi tabani modeli.

Bu dosya, Karpathy'nin LLM Wiki fikrinin YouTick'e uyarlanmis halidir. Amac
RAG gibi her soruda ham kaynaklari bastan taramak degil; kod, dokuman, log,
canli check ve kullanici notlarindan olusan bilgiyi kalici bir markdown wiki'ye
derleyip guncel tutmaktir.

## Temel fikir

YouTick hizli degisen bir public-alpha urun. Ayni anda frontend, NEAR
kontratlari, Cloudflare Worker'lari, KMS operatorleri, storage provider'lari,
Web4 deploy'u, launch planlari ve urun dili birlikte hareket ediyor.

Bu yuzden wiki'nin isi su:

1. Ham kaynaklari degistirme.
2. Kaynaklardan kanitli bilgi cikar.
3. Bilgiyi konu sayfalarina yerlestir.
4. Eski iddialar yeni kanitla celisiyorsa isaretle.
5. Cevap verirken once wiki'yi oku, riskli veya canli durumlarda kaynaga geri don.

Wiki, sohbet gecmisi degil; projenin sade, aranabilir ve surekli guncellenen
hafizasidir.

## Katmanlar

### 1. Ham kaynaklar

LLM bunlari okur ama degistirmez:

- repo kaynak kodu
- `README.md`
- `docs/**`
- `apps/web/**`
- `workers/**`
- `contracts/**`
- test ciktisi
- browser/console loglari
- canli endpoint/RPC check sonuclari
- kullanicinin analiz, karar ve operasyon notlari

### 2. Wiki

LLM'in urettigi markdown sayfalari. Onerilen kok:

```text
docs/llm-wiki/
  index.md
  agent-router.md
  log.md
  overview.md
  source-map.md
  claims.md
  module-cards/
    frontend.md
    contracts.md
    kms.md
    storage.md
    wallet-playback.md
    payments.md
    devops-release.md
    security.md
  product/
    positioning.md
    target-users.md
    pricing-and-payments.md
  architecture/
    system.md
    storage-and-delivery.md
    kms-and-access.md
    wallet-and-signless-flow.md
    contracts.md
    workers.md
  flows/
    upload.md
    purchase-and-watch.md
    gift-and-trial.md
    release.md
  operations/
    launch-status.md
    live-health-gates.md
    known-risks.md
    runbooks.md
  audits/
    open-items.md
    ui-ux.md
    security.md
  decisions/
    index.md
```

### 3. Schema

Bu dosya schema'nin baslangicidir. Wiki buyudukce kurallar burada veya
`llm-wiki/schema.md` icinde guncellenebilir.

## YouTick icin kaynak onceligi

Bir iddia celiskili gorunurse su sirayi kullan:

1. Aktif kaynak kodu ve testler.
2. Canli check: RPC, Worker health, Web4, browser smoke.
3. Kilitli plan ve runbook: `docs/launch-plan-2026-05.md`,
   `docs/release-runbook.md`, `docs/operations/known-issues.md`.
4. Mimari dokumanlar: `docs/architecture/**`, `docs/overview.md`,
   `docs/README.md`.
5. Eski analizler, audit notlari, sohbet gecmisi ve memory.

Canli sistem bilgisi zamanla degisebilir. KMS health, contract hash, worker
deploy, storage provider, domain ve launch gate iddialarini cevaplamadan once
ucuzsa yeniden check et.

## Sabit dil ve iddia kurallari

- Varsayilan dil Turkce olsun.
- Teknik terimleri sade anlat.
- YouTick'i "production-ready" diye anlatma; dogrulanmadikca "public alpha" de.
- "Tam merkeziyetsiz" deme; dogru ifade "hybrid decentralized".
- Lighthouse aktif birincil write path'tir; Crust legacy compatibility ve
  diagnostik/fallback yuzeyidir.
- KMS endpointlerini env fallback gibi anlatma; normal akista registry discovery
  ve fail-closed davranis vurgulanir.
- Storage provider, bandwidth/media delivery ve KMS access ayni sey degildir;
  ayri sayfalarda takip et.
- Ticket ownership ve entitlement source of truth NEAR tarafidir.
- Odeme kanali degisse bile access modeli NFT/dijital bilet sahipligidir.
- Gizli anahtar, real operator config, `.env.local`, `.near-credentials` veya
  secret materyali wiki'ye yazma.

## Sayfa formati

Her wiki sayfasi kisa frontmatter ile baslasin:

```markdown
---
title: Storage and Delivery
status: live
area: architecture
last_checked: 2026-05-19
confidence: high
sources:
  - docs/architecture/storage.md
  - apps/web/lib/storage/storage-api.ts
---
```

`status` degerleri:

- `live`: kodda veya canli operasyonda aktif
- `target`: hedef mimari, henuz tam aktif degil
- `legacy`: geriye donuk uyumluluk veya eski iz
- `experimental`: flag, pilot veya operator kararina bagli
- `stale`: yeni kanitla gecersizlesmis

Her sayfada su bolumler tercih edilir:

```markdown
## Kisa ozet
## Aktif gercek
## Kanitlar
## Celiskiler veya dikkat noktalar
## Ilgili sayfalar
## Sonraki check
```

## Claim register

`docs/llm-wiki/claims.md`, kritik iddialarin tek tablo halinde tutuldugu yerdir.

```markdown
| Claim | Status | Evidence | Last checked | Risk |
|---|---|---|---|---|
| Playback 3-of-5 KMS share threshold kullanir | live | docs/architecture/storage.md; registry check gerekli | 2026-05-19 | live drift |
```

Claim eklemeden once sor:

- Bu iddia urun, guvenlik, para, launch veya canli sistem kararini etkiliyor mu?
- Cevap evetse kanit yolu var mi?
- Kanit eskiyse "needs check" olarak isaretlendi mi?

## Ingest workflow

Yeni kaynak geldiginde:

1. Kaynak tipini yaz: code, doc, log, live-check, audit, market-research,
   user-decision.
2. Kaynagin tarihini ve kapsamini kaydet.
3. Bir kaynak ozeti cikar.
4. Etkilenen wiki sayfalarini bul.
5. Gerekli sayfalari guncelle.
6. `index.md` icindeki ilgili satirlari guncelle.
7. Kritik iddia varsa `claims.md` tablosuna ekle veya mevcut satiri degistir.
8. `log.md` icine append-only kayit gir.
9. Celiski varsa silme; once `Celiskiler veya dikkat noktalar` bolumune yaz.

Log formati:

```markdown
## [2026-05-19] ingest | docs/architecture/storage.md
- type: doc
- touched: architecture/storage-and-delivery.md, claims.md
- result: Lighthouse primary write path and media-delivery boundary updated.
```

## Query workflow

Kullanici soru sordugunda:

1. Once `docs/llm-wiki/index.md` oku.
2. `docs/llm-wiki/agent-router.md` ile ilgili module card'i sec.
3. Ilgili wiki sayfalarini oku.
4. Soru canli durum, guvenlik, odeme, deploy veya launch ile ilgiliyse repo veya
   live check ile dogrula.
5. Cevapta "kontrol edildi" ve "kontrol edilmedi" ayrimini acik soyle.
6. Cevap yeni bir sentez uretiyorsa bunu wiki'ye yeni sayfa veya log kaydi
   olarak eklemeyi oner.

## Lint workflow

Periyodik olarak wiki'yi saglik kontrolunden gecir:

- `production-ready`, `fully decentralized`, eski KMS URL fallback gibi
  desteklenmeyen iddialari ara.
- Lighthouse/Crust rollerinin karisip karismadigini kontrol et.
- Storage API, media-delivery ve KMS sorumluluklarinin tek sayfada ezilip
  ezilmedigini kontrol et.
- `target` iddialarin yanlislikla `live` diye yazilip yazilmadigini kontrol et.
- Orphan sayfalari ve eksik cross-linkleri bul.
- `claims.md` icinde `needs check` kalan kritik iddialari listele.
- `docs/launch-plan-2026-05.md` ile `operations/launch-status.md` celisiyor mu
  bak.

## Baslangic kaynak haritasi

En onemli repo girisleri:

- `README.md` - genel urun ve mimari ozet
- `docs/README.md` - dokuman indeksi ve okuma sirasi
- `docs/overview.md` - sade sistem ozetleri
- `docs/architecture/README.md` - aktif mimari
- `docs/architecture/storage.md` - storage, IPFS, KMS share playback
- `docs/release-runbook.md` - release ve health gate kurallari
- `docs/launch-plan-2026-05.md` - public alpha icin kilitli plan
- `docs/operations/known-issues.md` - riskler ve cozulmus olaylar
- `apps/web/hooks/useUpload.ts` - upload zinciri
- `apps/web/components/IpfsPlayer.tsx` - playback yuzeyi
- `apps/web/components/TicketPurchaseCard.tsx` - satin alma yuzeyi
- `apps/web/components/providers/WalletProvider.tsx` - wallet siniri
- `apps/web/lib/kms/**` - encryption, share, retrieve client
- `apps/web/lib/storage/**` - Storage API client
- `apps/web/lib/ipfs/**` - IPFS read path
- `workers/storage-api/src/index.ts` - Lighthouse secret ve upload guard siniri
- `workers/media-delivery/src/index.ts` - hot encrypted media delivery siniri
- `workers/youtick-kms/src/index.ts` - KMS auth ve share storage
- `workers/web4-proxy/src/index.ts` - Web4 ve same-origin proxy
- `contracts/nft-ticket/src/**` - ticket, market, gift, trial, moderation
- `contracts/access-control/src/lib.rs` - short-lived grants
- `contracts/operator-registry/src/lib.rs` - operator registry ve threshold

## Ilk kurulacak sayfalar

Ilk LLM pass'inde su sirayla ilerle:

1. `overview.md`
2. `agent-router.md`
3. `source-map.md`
4. `module-cards/frontend.md`
5. `module-cards/contracts.md`
6. `module-cards/kms.md`
7. `module-cards/storage.md`
8. `module-cards/wallet-playback.md`
9. `flows/upload.md`
10. `flows/purchase-and-watch.md`
11. `operations/launch-status.md`
12. `operations/known-risks.md`
13. `claims.md`

## Basit komut seti

Wiki bakimi sirasinda once hizli arama kullan:

```bash
git status -sb
rg -n "production-ready|fully decentralized|NEXT_PUBLIC_KMS_URL|Lighthouse|Crust|KMS|upload|has_ticket" .
rg --files docs apps/web workers contracts
```

Dar dogrulama ornekleri:

```bash
(cd apps/web && npm test -- --run)
(cd workers/storage-api && npm run check && npm test -- --run)
(cd workers/youtick-kms && npm run check && npm test -- --run)
(cd contracts/nft-ticket && cargo test --lib)
```

Tum monorepo testlerini otomatik kosma. Once degisen alanla ilgili en kucuk
dogrulamayi sec.

## Cevap standardi

YouTick wiki'den cevap veren LLM:

- once sade sonucu soyler
- sonra kaniti verir
- canli check yapilmadiysa bunu saklamaz
- belirsizse "bunu bilmiyoruz" der
- eski bilgiye dayaniyorsa "bu bilgi stale olabilir" der
- gereksiz buyuk refactor veya spekulatif ozellik onermez

## Ornek promptlar

```text
Yeni console-log.md dosyasini ingest et. Once aktif semptomu ayir, sonra
playback/KMS/wallet sayfalarini gerekiyorsa guncelle.
```

```text
Storage mimarisi wiki'sini lint et. Lighthouse, Crust, Storage API,
media-delivery ve KMS rollerinin karisip karismadigini kontrol et.
```

```text
Launch status sayfasini repo ve docs/launch-plan-2026-05.md ile karsilastir.
Canli check yapilmayan maddeleri needs check diye isaretle.
```

```text
YouTick'i yatirimciye anlatan sade bir ozet uret. Sadece wiki'deki live ve
public-alpha uyumlu iddialari kullan.
```
