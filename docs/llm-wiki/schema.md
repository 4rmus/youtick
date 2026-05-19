---
title: Wiki Schema
status: live
area: maintenance
last_checked: 2026-05-19
confidence: high
sources:
  - docs/llm-wiki.md
  - docs/llm-wiki/agent-router.md
---

# Wiki Schema

Her sayfa kisa frontmatter ile baslar.

```yaml
---
title: Storage and Delivery
status: live
area: architecture
last_checked: 2026-05-19
confidence: high
sources:
  - docs/architecture/storage.md
---
```

## Status degerleri

| Status | Anlam |
|---|---|
| live | Kodda veya aktif operasyonda kullanilan yuzey |
| target | Hedef mimari, henuz tam aktif degil |
| legacy | Geriye donuk uyumluluk veya eski iz |
| experimental | Flag, pilot veya operator kararina bagli |
| stale | Yeni kanitla gecersizlesmis |

## Standart bolumler

- Kisa ozet
- Aktif gercek
- Kanitlar
- Celiskiler veya dikkat noktalar
- Ilgili sayfalar
- Sonraki check

## Module card formati

Module card'lar agentlarin ilk pass'te az tokenla dogru yere gitmesi icindir.

Her module card su bolumleri tasir:

- Ne yapar?
- Ilk oku
- En sik kaynak dosyalar
- Dar dogrulama
- Dikkat

Kurallar:

- Kod kopyalama; dosya yolu ve karar bilgisi ver.
- 100-150 satiri gecme.
- Canli iddia varsa [[claims|claims.md]] icine ekle.
- Test komutunu tum monorepo yerine dar hedef olarak yaz.

## Dil ve iddia kurallari

- Varsayilan dil Turkce.
- Teknik terimler sade anlatilir.
- YouTick icin dogrulanmadikca "public alpha" denir.
- "Tam merkeziyetsiz" yerine "hybrid decentralized" kullanilir.
- Lighthouse aktif birincil write path; Crust legacy compatibility ve diagnostik/fallback yuzeyidir.
- KMS endpointleri env fallback gibi anlatilmaz; normal akista registry discovery ve fail-closed davranis vurgulanir.
- Storage provider, bandwidth/media delivery ve KMS access ayri konulardir.
- Ticket ownership ve entitlement source of truth NEAR tarafidir.
- Secret, private key, `.env.local`, `.near-credentials` veya gercek operator config'i wiki'ye yazilmaz.

## Ingest akisi

1. Kaynak tipini yaz: code, doc, log, live-check, audit, market-research, user-decision.
2. Kaynagin tarihini ve kapsamini kaydet.
3. Kaynak ozetini cikar.
4. Etkilenen sayfalari bul.
5. Ilgili module card veya flow sayfasini guncelle.
6. [[agent-router|agent-router.md]] yeni yonlendirme gerektiriyorsa satir ekle.
7. [[index|index.md]] icindeki ilgili satirlari guncelle.
8. Kritik iddia varsa [[claims|claims.md]] tablosuna ekle veya mevcut satiri degistir.
9. [[log|log.md]] icine append-only kayit gir.
10. Celiski varsa silme; once ilgili sayfadaki dikkat bolumune yaz.
11. `node scripts/check-llm-wiki.mjs` calistir.

## Lint akisi

- `node scripts/check-llm-wiki.mjs` calistir: frontmatter, kaynak varligi,
  wikilink butunlugu, orphan sayfa, `claims.md` tablo semasi ve yasakli ifadeler.
- `node scripts/wiki-freshness.mjs` calistir: kaynak `last_checked` sonrasi
  degisen sayfalari (stale aday) ve yaslanmis sayfalari listeler.
- `node scripts/wiki-live-check.mjs` calistir: salt-okuma mainnet checkleri
  (code hash, registry threshold, trial pool) `claims.md` ile karsilastirilir.
- Desteklenmeyen production, fully decentralized ve eski KMS URL fallback iddialarini ara.
- Lighthouse, Crust, Storage API, media-delivery ve KMS rollerinin karisip karismadigini kontrol et.
- `target` iddialarin yanlislikla `live` yazilip yazilmadigini kontrol et.

## Hafiza sinirlari: llm-wiki vs `.claude` memory

Iki ayri hafiza yuzeyi vardir; karistirilmaz.

| Yuzey | Icerik | Konum |
|---|---|---|
| llm-wiki | Proje gercegi: mimari, kanit, iddia, flow, operasyon | `docs/llm-wiki/` (repo, ekip-paylasimli) |
| `.claude` memory | Kullanici kimligi, calisma tercihi, feedback, oturum-otesi kisisel baglam | `.claude/` (yerel, gitignore) |

Kural:

- Proje bilgisi her zaman wiki'ye gider; `.claude` memory'ye kopyalanmaz.
- Kullanici/calisma tercihi `.claude` memory'de kalir; wiki'ye yazilmaz.
- `.claude` memory bir wiki sayfasina dosya yoluyla isaret edebilir, ama
  proje icerigini tekrar etmez. Tek kaynak ilkesi her iki yonde de gecerlidir.
