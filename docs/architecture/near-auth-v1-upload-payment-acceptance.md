# NEAR Auth V1 — ürün upload kabulü

Gate: `NEAR_AUTH_V1_UPLOAD_PAYMENT_ACCEPTANCE`.
24 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

**Google ve passkey ile gerçek ürün upload/yayın/creator oynatma geçti.**
İki bağımsız hesap aynı dosyayı birer kez, toplam **1,20 test USDC** ile
yayımladı. İki kalıcı kayıt `UPLOAD_SETTLED`; iki job `Published`, publication
`ACTIVE`. İki creator için 720p oynatma ve kullanıcı teyidi; Google yeniden
giriş sonrası erişim, passkey reload/resume geçti. Kapanışta altı gönderim
bayrağı false, kayıtlar/key epoch korundu. Yeni imza/ödeme ile retry yapılmadı.

Sonuç localhost ürün + gerçek testnet/provider kabulüdür. Hosted/Production,
yeni cihaz/recovery, Safari/mobile, uzun süreli renewal, kart veya yeni hesap
fonlama kabulü değildir. Provider redirect fallback hatası ayrıca açıktır.

## Gerçek işlemler

| Kanıt | Google | Passkey |
| --- | --- | --- |
| Creator | `29445f46f23551e48c99869c2e34e3acb283902db8196da32cb3f6625872324c` | `9db6cbd959c2ad427dc68b77b905edd0b8470431e3a3a9abebf0ee41a659d21a` |
| Tarih | 23 Eylül | 24 Eylül |
| Başlık | Distance — Google ürün kabulü | Distance — Passkey ürün kabulü |
| Job/publication | `lp-969b04b0-f205-492d-a6a8-156b18030561` | `lp-fddf7a11-0dca-4705-ac0f-dedbcff308a4` |
| Operation | `fefa14afd82bc009eed09c5fcfc359b233cda9bf767f29d828291dd8e9ba9cd4` | `0f9e0e067f33393b4451ff24a6037b9df1638879e22bd06545623fa3e9c61444` |
| Outer MPC hash | `GPeVrUUj8ZLCdX59gvgigfTTxBgrSv8kYdf6s55ExtfW` | `7PdNdydhcK3WtQY91KUQpn9DptXQjW3WacLBe7QXRvEo` |
| Son durum | `UPLOAD_SETTLED` / FINAL outer | `UPLOAD_SETTLED` / FINAL outer |
| Upload bedeli | **0,60 test USDC** | **0,60 test USDC** |
| Son USDC bakiyesi | **1,40** | **1,40** |
| Bilet fiyatı | **2 test USDC**, ayrıca bilet alınmadı | **2 test USDC**, ayrıca bilet alınmadı |
| Kullanıcı onayı | “Google onayını verdim” | “Passkey ile onayladım” |
| Kullanıcı izleme teyidi | “Görüntü ve ses harika”; yeniden girişte “giriş yaptım video açtım izledim herşey harika” | “Video açıldı her şey yolunda” |

Bağımsız son zincir kontrolü: final **270080471**, aynı blokta iki job
`Published` ve iki publication `ACTIVE`, generation 1, adaptive 360p+720p;
creator, boyut ve **600000** mikro USDC ücretler eşleşti. İki dış MPC işlem
FINAL ve başarılı. Private MPC status'u exact payload, quote/job, cihaz ve
sertifika bağını ayrıca doğruladı. Relay transaction hash'leri ayrıca elde
edilmedi; outer MPC hash'leri relay hash'i gibi sunulmaz.

Seçilen kaynak: `/Users/arair/Desktop/youtick/Soterii - Distance.mp4`,
**9.452.298 bayt**, SHA-256
`cbbb9ffacab55e8a9890d887330491941f9a9e099934fb9df52f0031d2e43a47`.
H.264 1920×1080/AAC, yaklaşık 3:56; dosya değiştirilmedi. İki formda kullanıcı
hak sahipliği kutusunu kendisi işaretledi. Ödeme seçeneklerinde 0,50 medya;
son onay özetinde +0,10 relay ile **0,60** toplam görüldü. Sponsor cüzdanı
seçtirilmedi; provider imza onaylarını kullanıcı verdi.

## Ayrı tarihlerdeki harcama onayları ve gider

23 Eylül'de kullanıcı iki yeni upload için toplam 1,20 test USDC / ek 0,70
NEAR rezervi ve o günkü eski iki bileti de kapsayan 1,40 günlük tavan / hesap
başı 2 denemeyi onayladı. O gün yalnız Google upload'ı yapıldı. 24 Eylül'e
geçilince eski açık çalışma modu kapatıldı; eski “bugün” izni uzatılmadı.

24 Eylül'de kalan **tek passkey upload'ı**, 0,60 test USDC ve en fazla **0,35
test NEAR rezervi** için kullanıcı ayrıca “onaylıyorum” dedi. Yalnız MPC/upload
açıldı; o günkü global rezerv tavanı 0,35, hesap başı deneme 1. Bilet/lab kapalı
kaldı. Kayıt/nonce/key epoch sıfırlanmadı; UTC günlük hesaplama doğal olarak
24 Eylül'e geçti. Ek fonlama yapılmadı; önceden manuel aktarılan 2'şer USDC kullanıldı.

| Ölçüm | Test NEAR |
| --- | --- |
| Google MPC outer receipt gideri | **0,0046458130881108** |
| Passkey MPC outer receipt gideri | **0,0046456913162873** |
| İki outer toplamı | **0,0092915044043981** |

Sponsorun bakiye farkı aynı toplama eşit: **0,7907178083669574 →
0,7814263039625593**. Sponsor nonce'u **269862673000002 → 269862673000004**;
yalnız iki yeni dış işlem. Bu ölçüm rezervin tamamının harcandığı anlamına
gelmez; USDC medya/relay bedeli, iç relayer gas'i, Production veya USD maliyeti
olarak sunulmaz. Sponsor hesabı
`e582a5e0dece7b0a61b37384d6dc9a4e46bc539ba8d0439803606c7fbe1f975c`.

## Canlıda bulunan tamamlanma hatası ve dar kaynak düzeltmesi

Google upload yayımlandıktan sonra status hata verdi. Salt-okunur kontrolde
job, fee ve device certificate alanları eşleşti; yalnız
`authorizing_public_key` **null** idi. Kontratın `authorize_playback_device`
metodu, dış signer creator'dan farklıysa alanı boş bırakır; sponsored delegate'in
dış signer'ı relayer'dır. Yeni upload completion kodu yanlışlıkla normal
bilet işlemindeki dolu creator anahtarını bekliyordu.

Acceptance kapsamı bu zorunlu dar consumer düzeltmesine genişletildi:

- `workers/livepeer-bridge/src/mpc-sponsor.ts`: yalnız upload completion'da
  **null** aranır. Creator doğrulanmış MPC delegate'i ve exact final job ile,
  cihaz ise key/certificate/süre bağlarıyla kanıtlanır. Kontrol kaldırılmadı;
  ticket anahtar kontrolü değişmedi.
- `workers/livepeer-bridge/src/mpc-sponsor.test.ts`: gerçek null fixture'ı
  önce **2 FAIL** ile hatayı üretti; eksik/creator/relayer anahtar metadata
  reddi de eklendi.
- `workers/livepeer-bridge/scripts/near-auth-ticket-runtime.mjs`: upload
  fixture'ı gerçek null alanını kullanır; ticket fixture'ı dolu kalır.

**LOCAL_TEST:** tam Bridge **508 PASS / 3 skip**, native upload **14 PASS**;
Bridge tip kontrolü PASS. Kontrat/ABI, fee, nonce, approval/quote imzası ve
bağımlılık değişmedi. Gerçek Google kaydı 24 Eylül'de düzeltme yüklü kapalı
runtime'da **aynı operation ve outer hash ile UPLOAD_SETTLED** oldu. Nonce ve
bütçe değişmedi; süresi geçmiş review için yeni imza/quote/ödeme istenmedi.
Passkey aynı düzeltilmiş yol üzerinden doğrudan tamamlandı.

## Oynatma ve yenileme kanıtı

Google creator: **1280×720**, readyState 4, error null, muted false;
yaklaşık 3,89 → 59,00 saniye ilerleme gözlendi. Kullanıcı hem görüntü/sesi
hem 24 Eylül'deki yeniden giriş/izlemeyi teyit etti; bağlı Google hesap
kimliği ayrıca görüldü. Yeni bilet veya ödeme yok.

Passkey creator: **1280×720**, readyState 4, error null, ses açık; yaklaşık
**2:27** izlendi. Sayfa yenilendi; aynı hesapla player ve **Continue from 2:27**
geri geldi. Devam sonrası **147,30 → 215,85 saniye** ilerleme, 720p ve hata
olmaması gözlendi. Yeni ödeme veya provider imzası gerekmedi. Kullanıcı
“Video açıldı her şey yolunda” diye teyit etti. İki klibin decoder süresi
236,518449 saniye; uzun süreli HLS/yenileme veya yeni cihaz testi değildir.

Girişte bir popup denemesi tamamlanmadı; Google'ın aynı-sekme fallback'i
provider'da **Callback URL mismatch** verdi (`/auth/callback`). Provider
allowlist değiştirilmedi. Kullanıcı sonradan normal giriş/izlemeyi tamamladı;
bu, fallback hatasının giderildiği anlamına gelmez. Passkey ilk girişinde de
kullanıcı sorun bildirdi, yeniden denediğinde bağlandı; o ilk hatanın nedeni
kanıtlanmadı. Bu nedenle genel sonuç **COMPLETED_WITH_WARNINGS**.

## Kapanış ve kanıt sınırı

Kapanışta mevcut launcher `upload-setup-approved` ile yeniden başlatıldı:
`NEAR_AUTH_V1_MPC_ENABLED`, `NEAR_AUTH_V1_TICKET_ENABLED`,
`NEAR_AUTH_V1_UPLOAD_ENABLED`, `NEAR_AUTH_MPC_ENABLED`,
`NEAR_AUTH_TICKET_ENABLED`, `NEAR_AUTH_UPLOAD_ENABLED` **false**.
Quote yalnız public key/version 1 ile doğrulanır; quote private key okunmadı.
MPC için mevcut Keychain anahtarı, **local-v1** epoch ve SQLite dizini korundu.

Gönderimler kapalıyken gerçek Next → yerel private Bridge çağrısı iki kaydı
**aynı operation/outer hash ve UPLOAD_SETTLED** ile tekrar okudu. Son actor
snapshot'ı integrity **ok**; pending outer yok. 24 Eylül global rezerv **0,35**,
passkey günlük deneme **1**; Google'ın 23 Eylül günlük denemesi **2** olarak
korundu. Sayaçlar elle temizlenmedi. Canlı actor WAL varken eksik kopya
okunmadı; kapanışta kararlı DB+WAL kopyası üzerinden snapshot doğrulandı.

Web session anahtarı yalnız bellekte olduğundan kapanış restart'ı yeniden
giriş gerektirebilir. Playback/reload testleri bu son kapatma restart'ından
önce yapıldı; kapanıştan sonra yeni kullanıcı girişi ayrıca denenmedi.
Tarayıcı/cihaz/taslak kayıtları geniş biçimde temizlenmedi.

**PROVIDER / yerel runtime:** iki gerçek testnet ödeme/job/publication,
creator playback ve kullanıcı teyitleri; kapalı kayıt okuması.
**EXTERNAL_NOT_RUN:** hosted/Preview/Production, CI/deploy/commit/push,
yeni cihaz/recovery, Safari/mobile/uzun video, kart/onboarding. Tüm Web/browser
ve Rust paketleri bu dar Bridge düzeltmesi için yeniden çalıştırılmadı.
Doküman build ve diff kontrolü **PASS**; mevcut 500 kB bundle uyarısı sürer.
Kaynak hash karşılaştırmasında yalnız üç Bridge dosyası ve iki rapor/plan
dosyasının değiştiği doğrulandı; dosya silinmedi.

Değişen kaynak yukarıdaki üç Bridge dosyasıdır. Yerel ignored başlatıcı ve
kontrol yardımcılarında tarih/bütçe/kapalı mod ayarları; bu rapor ve ana plan
ayrıca güncellendi. İlgisiz dirty dosyalar ve Git index korundu.

Kanıt dizini:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-upload-acceptance-kjm7n83k/`.
Önemli kayıtlar: `approved-package.json`, `passkey-sep24-approved.json`,
`google-chain.json`, `google-reconciliation.json`, `google-settlement-proof.json`,
`both-upload-settlement.json`, `final-chain.json`, `final-state.json`,
`passkey-playback.json`, önce/sonra actor snapshot'ları ve test logları.
Native sonuç: `tmp/near-auth-upload-runtime-Scdsti/result.json`.

## Tek sonraki gate

**`NEAR_AUTH_V1_REDIRECT_CALLBACK_PREFLIGHT` — başlatılmadı.** Mevcut ürün
callback/origin ve sağlayıcı izinlerinin dar salt-okunur değerlendirmesi;
giriş fallback hatasının somut düzeltme kapsamını belirleme. Yeni ödeme,
upload, provider ayarı veya deploy bu gate'in otomatik devamı değildir.
