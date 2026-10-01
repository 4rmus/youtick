# YouTick geçmiş tarayıcısı — hedefli tarama tasarımı

**Gate:** `YOUTICK_HISTORY_TARGETED_SCAN_DESIGN` — **PASS (tasarım)**; kod, migration ve canlı geçiş yok.
**Tarih:** 1 Ekim 2026. **Hedef:** public-testnet read-model (`youtick-market-read-model-public-testnet`).

## Sorun

Geçmiş tarayıcısı her final bloğu `neardata.xyz` üzerinden tek tek okur: dakikalık cron, en fazla 50 s,
istekler arası en az 350 ms (`read-model/worker.mjs`). 1 Ekim 20:05–20:08 UTC ölçümü:

| | Dakikada |
| --- | --- |
| NEAR testnet final blok | ~102 |
| Tarayıcı | ~64 |

Gecikme ~250 bin bloktur ve günde ~55 bin blok **artar**; tasarım gereği yetişemez. Keşfet ve Profil
`catalog_mode=current` ile tarayıcıdan bağımsızdır; bakiye ve bilet hakkı doğrudan NEAR'dan okunur.
Tarayıcının doldurduğu `chain_events`, `media_jobs`, `publications`, `sale_ledger`, `viewer_entitlements`,
`withdrawal_history`, `governance_audit` bugün hiçbir API'de sunulmaz; geri dönüş (`catalog_mode=off`) ve
gelecekteki satış/çekim raporları için tutulur.

## Karar

Her bloğu okumak yerine yalnız market kontratında makbuz (receipt) çalışan blokları oku. Market 267602884'te
açıldığından beri **124 işlem** aldı (FastNEAR, 1 Ekim); bunlar birkaç yüz bloğa karşılık gelir.
NEAR otorite olarak kalır: indeks yalnız "hangi bloklara bakılacağını" söyler; olaylar yine final blok
verisinden (`fetchNeardataMarketBlock`) ve mevcut yazıcıdan (`applyFinalMarketBlockBatch`) geçer.

## Veri kaynağı

| Adım | Kaynak | Doğrulanan (1 Ekim, salt-okunur) |
| --- | --- | --- |
| Market'a dokunan işlemler | FastNEAR `POST https://tx.{network}.fastnear.com/v0/account` `{account_id}` | 124 işlem, 267602884–271043170; giriş başına `tx_block_height`, `is_receiver`, `is_predecessor`, `is_event_log`, `is_success` |
| İşlemin makbuz blokları | FastNEAR `POST /v0/transactions` `{tx_hashes}` | Her makbuz için alıcı hesap ve `execution_outcome.block_height`; ör. 271043170 işleminin market makbuzları 271043171 ve 271043173'te |
| Olay içeriği | Mevcut `neardata.xyz` final blok okuyucusu | Değişmez; aynı olay kataloğu ve normalizasyon |

Aday blok kümesi: alıcısı market olan makbuzların blok yükseklikleri. `is_event_log` yalnız ipucudur;
olay olmayan makbuzlu bloklar da okunur (yazıcı olaysız bloğu zararsız işler).

## Ardışıklık ve kayıt

`finality_watermarks` tetikleyicisi (`0005`) `NEW.block_height > OLD.block_height` iken
`NEW.prev_block_height = OLD.block_height` şartıyla ileri atlamaya izin verir. Bugün `prev_block_*` zincirdeki
gerçek öncüldür. Hedefli modda bir atlama, "aradaki bloklarda market makbuzu yok" iddiasıdır; bu iddia
izlenebilir olmalıdır:

- **Yeni eklemeli tablo** (`0010_targeted_scan_ranges`):
  `(network, contract_id, from_height, to_height, source, index_tx_count, index_head_height, recorded_at_ms)`.
  Her atlanan `(from, to)` aralığı, kaynağı (`fastnear-tx-v0`) ve indeksin o anki başıyla kaydedilir.
  Watermark güncellemesi ve aralık kaydı aynı D1 batch'inde yazılır.
- Bu tablo yokken hedefli yazıcı çalışmaz (fail-closed).
- Mevcut tetikleyiciler ve tablolar değişmez; `0010` yalnız ekler.

## Akış (cron başına)

1. `READ_MODEL_INGESTION_MODE=targeted` değilse bugünkü ardışık tarama aynen çalışır (varsayılan).
2. Final yükseklik `F`, D1 watermark `W` okunur. İndeks başı `I` = indeksteki en yeni işlemin bloğu ile
   FastNEAR'ın bildirdiği baş (varsa) arasındaki güvenli değer; `T = min(F, I) - güvenlik_payı`.
3. `W < height ≤ T` aralığındaki market işlemleri sayfalanarak alınır (`max_block_height` ile geriye).
   Her işlem için makbuz blokları `/v0/transactions` ile toplanır; işlemin makbuzları `T`'yi aşıyorsa o işlem
   ve sonrası bir sonraki cron'a bırakılır (yarım işlem yazılmaz).
4. Aday bloklar artan sırayla `fetchNeardataMarketBlock` ile okunur, mevcut sorgu bütçesiyle
   `applyFinalMarketBlockBatch` uygulanır. Her uygulamada önceki watermark'tan adaya atlama ve aralık kaydı
   aynı batch'tedir.
5. Aday kalmadıysa watermark `T`'ye bağlanır (son aralık kaydıyla).
6. İstek sınırı: cron başına en fazla N indeks + M blok isteği; sınır dolunca kalan sonraki cron'a.

Beklenen yük: indekse dakikada 1–3 istek, blok okuması yalnız işlem olduğunda.

## Doğruluk güvenceleri

| Risk | Önlem |
| --- | --- |
| İndeks bir işlemi kaçırır | **Uzlaştırma** (aşağıda); fark varsa hedefli mod durur, `targeted_scan_reconcile_mismatch` alarmı, aralık tablosundan şüpheli aralık ardışık taramayla yeniden okunabilir |
| İndeks gecikir | `T ≤ I - güvenlik_payı`; indeks başı ilerlemiyorsa watermark ilerlemez, alarm |
| İndeks erişilemez / şema değişir | Fail-closed: watermark ilerlemez; ardışık moda manuel dönüş |
| Çapraz kontrat makbuzları | Aday blok, işlemin tüm makbuzlarından alıcısı market olanlar; USDC `ft_on_transfer` sonrası market makbuzları dahil |
| Yarım işlem | Bir işlemin market makbuzlarının tamamı `T` içinde değilse işlem ertelenir |
| Yeniden işleme | `chain_events` makbuz/olay anahtarıyla idempotent; aynı bloğun tekrar okunması çift kayıt üretmez |

**Uzlaştırma (saatlik ve yetişme sonunda), aynı final blokta NEAR view'ları ile:**

- `get_publications_count` / `get_publications` ↔ D1 `publications` (kimlik, durum, fiyat).
- `get_platform_balance` ↔ D1'den türetilen platform toplamı (komisyon + upload ücreti − platform çekimi).
- D1'de görülen her üretici için `get_creator_balance` ↔ `sale_ledger.creator_amount` toplamı − çekimler.
- Örneklem: D1'deki her `viewer_entitlements` satırı için `has_entitlement = true`.

Kaçırılan satış, upload ücreti veya çekim bakiyeleri bozar ve uzlaştırmada görünür. Kaçırılan olay
yalnız durum değişikliğiyse (ör. `publication_sales_suspended`) yayın durumu karşılaştırması yakalar.

## Yetişme planı

1. Hedefli yazıcı önce **yerel bir script** olarak (`scripts/`), canlı D1'e karşı `--dry-run` ile aday blokları
   ve beklenen olay sayısını listeler (salt-okunur).
2. Owner onayıyla D1 bookmark → `0010` → aynı script `--apply` ile `W=270873059`'dan güncel bloğa yetişir.
   Tahmin: <200 aday blok, dakikalar.
3. Uzlaştırma PASS ise korumalı deploy'da `READ_MODEL_INGESTION_MODE=targeted` seçilir; worker cron'u
   aynı mantıkla devam eder.

## Geri dönüş

- Mod değişkeni `contiguous`'a döndürülür; watermark olduğu yerden ardışık devam eder.
- Şüpheli aralık için D1 bookmark'a dönmek yerine, aralık tablosundan aralığın başına ardışık yeniden tarama
  yapılır (idempotent yazıcı). Satır silme veya geçmişi yeniden yazma normal yol değildir.

## Kapsam dışı

- Veri API'si veya rapor ekranı (ayrı ürün kararı).
- Mainnet geçişi (FastNEAR mainnet uç noktaları aynıdır; ayrı gate).
- İkinci bağımsız indeks (nearblocks API 30 Eylül'de günlerce geride görüldü; güvenilir ikinci kaynak yok,
  bu yüzden güvence uzlaştırmadadır).

## Kabul ve test planı

| Test | Beklenen |
| --- | --- |
| Sahte indeks + sahte neardata; 3 işlem, çapraz makbuzlar | Yalnız market makbuz blokları okunur; watermark ve aralık kayıtları tek batch'te; olaylar ardışık modla aynı satırları üretir |
| Aynı veri ardışık ve hedefli modda | D1 projeksiyonları birebir eşit |
| İndeks yarım işlem döndürür (makbuz `T` sonrası) | İşlem ertelenir; watermark işlemin ilk bloğundan önce kalır |
| İndeks erişilemez / bozuk yanıt / şema farkı | Watermark ilerlemez; açık hata kodu |
| İndeks bir satışı kaçırır | Uzlaştırma bakiye farkını yakalar, mod durur |
| `0010` yokken hedefli mod | Fail-closed |
| Sorgu ve istek bütçeleri | Mevcut 995 sorgu ve cron süresi korunur |
| Canlı dry-run | Aday blok listesi ve olay sayısı; 124 işlemle tutarlı |

**Kanıt:** veri kaynağı yanıtları 1 Ekim'de salt-okunur denendi (PRODUCTION okuma); tasarımın kendisi
LOCAL_STATIC. Hiçbir kod, migration, ayar veya canlı veri değişmedi.

## Dry-run — 1 Ekim 2026

**Gate:** `YOUTICK_HISTORY_TARGETED_SCAN_DRYRUN` — **PASS**. `scripts/history-targeted-scan.mjs --dry-run`
yalnız okur; D1'e, ayarlara veya canlı veriye yazmaz. FastNEAR'da `/v0/account` `limit` + `resume_token`
ile sayfalanır (`max_block_height` yok sayılır); `/v0/transactions` en fazla 20 hash ile denendi.

| Ölçüm (PRODUCTION okuma) | Değer |
| --- | --- |
| D1 watermark → hedef (`final − 600`) | 270873515 → 271123319 |
| Atlanan blok | 249.786 |
| İncelenen işlem / ertelenen | 16 / 0 |
| Okunacak aday blok | **18** (hepsinde olay var) |
| Olaylar | `media_job_authorized` 6, `publication_finalized` 4, `entitlement_purchased` 3, `creator_balance_withdrawal_started` 2, `creator_balance_withdrawal_succeeded` 2, `media_job_upload_key_replaced` 1 |
| Yazma | 0 |

Sayılar, aynı dönemde canlı kabulde gözlenen işlemlerle birebir eşleşir (6 upload ödemesi, 4 yayın,
3 bilet, 2 çekim, 1 Resume anahtar değişimi). Ardışık tarayıcı bu aralığı ~2,7 günde okuyamazken
hedefli yol 18 blok okur.

**Tek sonraki gate:** `YOUTICK_HISTORY_TARGETED_SCAN_WRITER` — `0010_targeted_scan_ranges`, hedefli
yazıcı ve uzlaştırma; yerel testlerle (canlı D1 yazımı ayrı onaylı gate).
