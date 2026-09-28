# YouTick V1 katalog eşitleme kaynak düzeltmesi

**Gate:** `YOUTICK_V1_CATALOG_SYNC_FIX` — **COMPLETED_WITH_WARNINGS**.
Kaynak düzeltmesi ve yerel regresyonlar hazır; canlı katalog **henüz
düzeltilmedi**. 28 Eylül 2026; kod, SQL ve test değişiklikleri bu gate'te
commit/stage edilmedi, D1'e uygulanmadı ve Worker yayımlanmadı.

## Kök neden ve dar düzeltme

Zincirde `lp-877b7f80-f832-4da5-ac2b-cc80bfb9a433` yayını `ACTIVE`, fakat
read-model watermark `270420307`, exact katalog detayı 404 ve canlı Discover
listesinde eser yoktu. Cron her dakika çalışıyordu; gözlenen ardışık
`catching_up` loglarında `block_count=0`, `remaining_blocks` yaklaşık
`227958/227874/227789` idi. Neardata exact sonraki `270420308/309/310` ve
`270420457/458` yüksekliklerini `null` döndürdü; eski anchor
`270420307` provider hash'iyle eş. Daha yeni `270644313` gerçek blok ve
Market olayı vardı. `read-model/worker.mjs:87-116` her koşuda en çok 150
yükseklik/50 saniye/350 ms tarıyor, fakat hiç gerçek blok bulamadığında
scan konumunu saklamayıp her dakika watermark+1'e dönüyordu. HTTP 200 health,
veri güncelliği kanıtı değildi.

`read-model/d1/0006_scan_cursor.sql` mevcut `finality_watermarks` satırına
**tentative** `scan_height` ve CAS için `scan_revision` ekler; final blok
watermark'ı veya ekonomik kayıtları ileri taşımaz. Bir final blok gerçekten
uygulandığında SQL trigger cursor'ı aynı D1 batch'inde sıfırlar.
`scripts/run-market-read-model-once.mjs` anchor yükseklik/hash, revision ve
stored cursor eşleşmesiyle koşullu ilerletme/sıfırlama yapar; eski veya yarışan
Worker yazısı yeni cursor'ı geriye çekemez. `read-model/worker.mjs` null
yüksekliklerde konumu koşular arasında sürdürür; provider'ın final yükseklik
ötesine varıp sonra geç veri sunması halinde anchor'dan bounded yeniden
tarar. İlk gerçek blok mevcut watermark'ın **aynı height/hash predecessor**
kanıtını geçmeden projection/watermark yazılamaz; yanlış `null` sonrası
bağlantı uyuşmazlığında D1 batch atomik başarısız olur, cursor CAS ile
resetlenir. 150 istek/50 saniye/350 ms sınırları değişmedi. Sağlayıcı gerçek
bir bloğu kalıcı vermezse sistem sessizce olay atlamaz; katalog gecikmesi
operatör incelemesi gerektirebilir.

## Yerel doğrulama ve canlı sınır

- Önce eklenen uzun boşluk testleri eski worker'da `scan_height: null` yerine
  `250` bekleyerek **2 FAIL** verdi. Düzeltme sonrası ilgili altı regresyon
  **6/6 PASS**: >150 `null` üzerinden devam, geç/yanlış predecessor reseti,
  anchor+revision CAS yarışı, final sabitken geç gelen final/ara blok ve
  sonraki koşularda cursor ilerlemesi.
- `docs/testing.md` Read-model yerel komutundaki altı test dosyası **72/72
  PASS**. Bağımsız inceleyici 150. yükseklikte geç veri ve final hâlâ `null`
  karşıörneğini SQLite ile doğruladı; watermark `150`, 150 istek, revision 3;
  event-loss engeli bulmadı. `git diff --check` **PASS**.
- Bunlar `LOCAL_TEST` ve `LOCAL_STATIC` kanıtıdır. Mevcut read-model
  `681fb1e8-c072-4d15-8de1-2eb621d5ccb7` için yeni kod/migration
  çalıştırılmadı; watermark/katalogun canlıda ilerlediği iddia edilmez.
  `0006` migration'ı ayrı D1 yazma onayıyla **önce**, ardından exact kaynaklı
  korumalı workflow yayını ve aynı yayın için watermark, exact eser detayı,
  Discover/Profile görünürlüğü **sonra** doğrulanmalıdır. Release paketi SQL
  migration'ı otomatik uygulamaz.

## Onaya hazır yerel kayıt kapsamı

Mevcut dal `codex/youtick-v1-pilot-policy-20260927`, HEAD
`8f263b2ce366d6301cdf0269b6664882ec553816`. Yalnız aşağıdaki **6**
explicit path bu düzeltmenin ileride onaylanacak yerel checkpoint kapsamıdır:

```text
M read-model/worker.mjs
A read-model/d1/0006_scan_cursor.sql
M scripts/run-market-read-model-once.mjs
M scripts/apply-market-read-model-d1.test.mjs
M scripts/fastnear-dev.test.mjs
A docs/architecture/youtick-v1-catalog-sync-fix.md
```

Önerilen commit mesajı: `fix: preserve read-model progress across missing testnet heights`.
Önceden mevcut diğer raporlar/dirty dosyalar korunur, bu altı path dışında
stage edilmez. **Tek sonraki gate:** `YOUTICK_V1_CATALOG_SYNC_CHECKPOINT_COMMIT`;
yerel commit için ayrı açık onay gerekir. Push/PR/CI yeniden koşusu, canlı D1
migration veya deploy bu kayıt onayına dahil değildir.
