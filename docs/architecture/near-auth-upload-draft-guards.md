# Upload taslağı için imza öncesi kontroller

Gate: `NEAR_AUTH_UPLOAD_DRAFT_GUARDS_SOURCE` — 19 Eylül 2026.
Sonuç: **PASS / LOCAL_STATIC + LOCAL_TEST**. Canlı kabul veya mevcut
işlemin ödeme uzlaştırması değildir.

## Amaç ve kapsam

Son kullanıcı denemesinde Google ve Meteor onayları sonrası `wallet_signature`
tamamlandı; `payment_relay` aşaması 0,8 ms içinde başarısız oldu. Arayüzdeki
`livepeer_draft_unavailable` mesajı eksik, bozuk, okunamayan, başka işe ait veya
yazılamayan taslağı ayırmıyordu. Kullanıcı yalnız bir yükleme/sekme kullandığını
doğruladı. Taslağın gerçek denemede neden okunamadığı hâlâ **UNPROVEN**.

Yetki yalnız yerel kaynak düzeltmesi ve doğrulamaydı. Değişen yollar:

- `apps/web/lib/livepeer-upload.ts`: ortak zorunlu taslak kontrolü ve sabit hata nedenleri.
- `apps/web/lib/near-auth-upload-wallet.ts`: Meteor çağrısından hemen önce aynı kontrol.
- `apps/web/components/LivepeerPaidUploadForm.tsx`: nedene uygun, ödeme sonucunu varsaymayan mesajlar.
- Mevcut `livepeer-upload`, `livepeer-upload-status`, `near-auth-upload-wallet`
  ve `near-auth-compact-flow` birim testleri.
- Bu rapor ve `near-auth-integration-status.md`.

Kontrat, Bridge, bağımlılıklar, feature flag, secret/config, kullanıcı logu ve
tarayıcı kayıtları kapsam dışındaydı; değiştirilmedi. Tek yazan ana ajan oldu;
alt ajan salt-okunur inceleme yaptı.

## Davranış

Public V1 yeni ödeme yolunda taslak önce zorunlu okunur: geçerli kayıt,
aynı job ve henüz gönderilmemiş ödeme şartı aranır. Aynı kontrol teklif
beklemesinden sonra, imza akışına girmeden tekrarlanır. Google adaptörü ayrıca
Google onayı ve cihaz/süre denetimleri sonrası, sponsor attempt kaydı ve
Meteor çağrısı öncesinde aynı kontrolü çalıştırır.

Yazma kontrolü gerçek taslağı yeniden kaydetmez. Taslak anahtarına eklenen
`:write-check` anahtarına yalnız sabit `1` yazılır, geri okunur ve temizlenir.
Sonra gerçek taslağın job/ödeme durumu yeniden okunur. Böylece kontrol eski
taslak snapshot'ını başka bir kaydın üzerine yazmaz. Temizleme hatası önceki
hatayı maskelemez; yalnız temizleme başarısızsa güvenli yazma hatası döner.

Hata nedenleri yalnız sabit kodlardır: `livepeer_draft_missing`,
`livepeer_draft_invalid`, `livepeer_draft_job_mismatch`,
`livepeer_draft_read_failed`, `livepeer_draft_write_failed`,
`livepeer_draft_readback_failed`. Ham tarayıcı hatası, cause, depolama içeriği,
token veya anahtar hata mesajına eklenmez. Mevcut nullable okuyucu dosya
seçimi/geri yükleme için korunur.

`paymentAttempted` erken işaretlenmez; gerçek relay öncesi taslak/bayrak yazma
kontrolü yerinde kalır. Kesin relay reddindeki bayrak geri alma, anahtar
yenileme kurtarması ve zincirdeki mevcut ücretli job'ın eşleşmesine dayanan
erken dönüş korunur. Otomatik tekrar imza, yeniden ödeme veya relay tekrarı yok.

## Doğrulama

- **817 Web testi / 48 dosya PASS**; başlangıçtaki 784 teste 33 regresyon eklendi.
- Tip kontrolü ve lint **PASS**.
- Ayrı kopyada Web build **PASS**. İlk build sentetik sözleşme ayarları eksik
  olduğu için durdu; `market.testnet` / `access.testnet` ile tekrar geçti.
  Çalışan sunucu yeniden başlatılmadı; build onun `.next` dizinine yazmadı.
- Doküman build **PASS**.

Regresyonlar başlangıçta, teklif beklemesinde ve imza sonrasında altı taslak
hatasını; bekleyen ödeme korumasını; Google beklemesi sonrası sponsorun
çağrılmamasını; kontrol sırasında değişen gerçek taslağın korunmasını;
mevcut ücretli job uzlaştırmasını ve güvenli UI mesajlarını kapsar.
Google/Meteor, depolama ve ağ bu testlerde sentetiktir.

Bağımsız incelemede ilk tasarımın snapshot'ı yeniden yazma sorunu saptanıp
düzeltildi. Son incelemede yeni bulgu yok. Kanıt ve başlangıç dosyaları:
`tmp/near-auth-draft-guards-gvblcm3c/`. Kullanıcı logu, index ve kapsam dışındaki
başlangıç dosyalarının hash'leri korundu.

## Sınırlar ve sonraki gate

Küçük yazma kontrolü gelecekteki kota yeterliliği veya sekmeler arası atomiklik
garantisi değildir. Mevcut hesap başına tek taslak tasarımı değiştirilmedi.
Son relay kontrolü bu nedenle korunur. Bu değişiklik önceki canlı hatanın
kök nedenini veya mevcut imzalı denemenin ödeme durumunu kanıtlamaz.

**EXTERNAL_NOT_RUN:** gerçek tarayıcı/storage incelemesi, Google/Meteor onayı,
ödeme, relay/upload veya tekrar gönderim; provider, NEAR/D1, config işlemi;
CI/deploy ve commit/push/PR/merge. Bridge/kontrat kodu değişmedi; onların
testleri bu source gate'te yeniden çalıştırılmadı.

**Tek sonraki gate: `NEAR_AUTH_UPLOAD_ATTEMPT_RECONCILIATION`.** Mevcut
denemenin halka açık job/işlem kimliğiyle sponsor işlemi ve video bedelinin
durumunu salt-okunur uzlaştırmak. Yeni imza veya ödeme önermek için bu
source gate'in geçmesi tek başına yeterli değildir. Sonraki gate açılmadı.
