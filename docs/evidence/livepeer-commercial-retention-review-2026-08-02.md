# Livepeer ticari, saklama ve silme incelemesi — 2026-08-02

Durum: `PARTIAL / PUBLIC_SOURCE_REVIEW / LEGAL_AND_PROVIDER_CONFIRMATION_OPEN /
RUNTIME_DISABLED`.

Bu kayıt yalnız Livepeer'ın herkese açık resmi sayfalarının 2026-08-02
incelemesidir. Sağlayıcı hesabı, medya varlığı, anahtar, Worker, NEAR veya
çalışma zamanı değiştirilmedi. Kamuya açık kaynakta bulunmayan bir sözleşmeyi
veya taahhüdü yok saymaz; yalnız bu kanıt paketinde doğrulanmadığını gösterir.

## Doğrulanabilenler

| Konu | Kamuya açık kaynakta doğrulanan | Bu kaydın kanıtlamadığı |
|---|---|---|
| Fiyat | Sandbox için aylık 1.000 transcode dk., 60 storage dk., 5.000 delivery dk. ve minimum harcama yok. Growth için transcode `$0.33/60 dk.`, storage `$0.09/60 dk.`, delivery `$0.03/60 dk.` ve aylık `$100` minimum yazıyor. | Proje başına sert bütçe limiti, başarısız upload ücretinin hesabı veya gelecekte fiyatın sabit kalması. |
| Faturalama | Koşullar, iptal tarihine kadar oluşan kullanımın faturalandırılacağını; ücretlerin değişebileceğini ve ücretlerin kural olarak iade edilmediğini söylüyor. | Kısmi, başarısız, iptal edilmiş veya yeniden denenmiş TUS upload'ın hangi kullanım kalemini oluşturduğu; credit/iade yolu. |
| Yedek | Koşullar düzenli yedek alındığını, fakat kayıp/bozulmama ve geri yükleme garantisi olmadığını; bağımsız kopya tutulması gerektiğini söylüyor. | Asset silmenin CDN, önbellek, çoğaltılmış kopya ve yedekten ne zaman kalkacağı; geri döndürülemez silme veya saklama süresi. |
| Silme API'si | Güncel doküman dizini `Delete Asset` yönetim işlemini listeliyor. | Silme isteğinin yayılım süresi, yedek saklama, legal hold veya silme SLA'sı. |
| Kullanılabilirlik | Durum sayfası gözlenen servis durumunu, 90 günlük uptime görünümünü ve küresel ingest/playback noktalarını gösteriyor. | Sözleşmesel SLA, hizmet kredisi, RTO/RPO veya veri ikameti. Koşullar hizmeti `AS IS`/`AS AVAILABLE` sunar ve kesintisiz performans ya da güvenilirlik standardını garanti etmez. |

Kaynaklar:

- [Livepeer Studio fiyatlandırma](https://livepeer.studio/pricing)
- [Livepeer Studio kullanım koşulları](https://livepeer.studio/terms-of-service)
- [Güncel Livepeer doküman dizini](https://docs.livepeer.org/llms.txt)
- [Livepeer Studio durum sayfası](https://status.livepeer.studio/)

## Kamuya açık kaynakla kanıtlanamayanlar

| P0 kapısı | Eksik yazılı kanıt |
|---|---|
| DPA ve alt işleyenler | Studio medya varlıklarını kapsayan imzalı DPA, alt işleyen listesi, hukuki aktarım mekanizması ve değişiklik bildirimi. |
| Bölge / veri ikameti | Kaynak, transcode, HLS/CDN çoğaltmaları ve yedekler için bölge sınırları; bölge değişikliği ve istisna politikası. |
| Saklama ve silme | Asset, TUS kaynağı, CDN/önbellek, çoğaltılmış kopya ve yedek için silme sırası, en geç yayılım süresi, saklama ve legal-hold davranışı. |
| Kullanılabilirlik | Sözleşmesel SLA, ölçüm yöntemi, bakım istisnaları, RTO/RPO, ihlal bildirimi ve hizmet kredisi. |
| Başarısız upload faturası | Başarısız, iptal edilen, yeniden denenen ve yetim kalan upload için transcode/storage/delivery tahakkuku ve iade/credit kuralı. |

`https://livepeer.studio/privacy-policy` kayıt sitesi/LPT kapsamındadır; kişisel
verinin ABD dahil ülke dışına aktarılabileceğini söylese de Studio medya
varlıkları için DPA veya veri-ikameti taahhüdü olarak kullanılmamalıdır.

## Plan etkisi

Bu inceleme P0(6) (silme, saklama, DPA, bölge ve SLA) ve P0(7) (başarısız/
iptal/retry upload faturası ile bütçe kontrolü) kapılarını kapatmaz. Durumları
`PARTIAL` kalır. Üretim onayından önce yukarıdaki her satır için tarihli yazılı
sağlayıcı veya sözleşme kanıtı alınmalıdır. Yerel D5 kabul/kota/bütçe koruması
bu sağlayıcı sözleşmesi yerine geçmez.

Bu kayıt, runtime aktivasyonu, deploy, testnet veya yeni Livepeer mutasyonu için
izin değildir.
