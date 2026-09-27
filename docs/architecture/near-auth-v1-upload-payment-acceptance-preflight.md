# NEAR Auth V1 — ürün yükleme kabul ön kontrolü

Gate: `NEAR_AUTH_V1_UPLOAD_PAYMENT_ACCEPTANCE_PREFLIGHT`.
23 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

**Ön kontrol tamamlandı; gerçek upload kabulü henüz hazır değil.** En küçük
sonraki adım mevcut localhost ürün uygulaması ve aynı yerel MPC Bridge için
upload kurulumudur. İki aday creator'ın USDC'si sıfır; teklif doğrulama
anahtarının yerel bağlantısı ve upload bayrakları başlatıcıda eksiktir.
Önceki biletlerin günlük rezervi yeni upload bütçesi sayılamaz.

Bu gate yalnız bu raporu ve ana planı değiştirir. Kod, env/secret, anahtar,
SQLite kayıtları, tarayıcı, çalışan sunucu ve feature flag'ler korunur.
Quote oluşturma, fonlama, imza, ödeme, upload, provider ayarı, CI/GitHub ve
deploy yapılmadı. Kabul ölçütü: ortam, aday kimlikler/dosya sınırı, bütçe,
eksik hazırlıklar ve tek sonraki gate'in somutlaştırılmasıdır.

## Taze salt-okunur kanıt — PROVIDER / testnet

23 Eylül 2026 **13:00:50 UTC**'de başlayan okuma, final blok **269890707**,
hash `CqcgUo4SXSXhrZUZnKrdhSuXUoM1HM8ipjFFdb4ix7Af`.
Hesap, USDC/storage, access key, Market ve FastAuth sorguları aynı bloğa bağlandı.

| Rol | Hesap | USDC | Storage/locked sonrası kullanılabilir test NEAR |
| --- | --- | --- | --- |
| Google creator adayı | `29445f46f23551e48c99869c2e34e3acb283902db8196da32cb3f6625872324c` | **0** | **0,1264953344786178** |
| Passkey creator adayı | `9db6cbd959c2ad427dc68b77b905edd0b8470431e3a3a9abebf0ee41a659d21a` | **0** | **0,1256421474193754** |
| MPC sponsoru | `e582a5e0dece7b0a61b37384d6dc9a4e46bc539ba8d0439803606c7fbe1f975c` | Sorgulanmadı | **0,7888978083669574** |

İki creator'ın implicit Ed25519 anahtarı **FullAccess**; nonce'lar sırasıyla
`269642727000003` / `269761632000004`. Sponsorun kayıtlı public key'i
`ed25519:GSuuhDkM9sqnvvF3MwkHmDgeN3znpbuvvv6jN79fengB`, FullAccess,
nonce `269862673000002`; toplam bakiye 0,7907178083669574 test NEAR.
Private key veya Anahtar Zinciri açılmadı. Creator'lar ve Market için USDC
storage kaydı var. Tarayıcıdaki aktif hesap/cihaz bu gate'te okunmadı;
Google/passkey etiketleri önceki gerçek kabul kaydındaki aday kimliklerdir.

- Market: `video-market-v1-260907.youtick-dev-v3.testnet`; token
  `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`.
  `bridge_frozen=false`, `new_purchases_paused=false`, quote key version **1**,
  compact upload version **1**.
- Protokol **87**, gas price `100000000`, minimum gas purchase price
  `1000000000`, storage byte fiyatı `10000000000000000000` yocto.
  FastAuth `paused=false`, MPC adresi `v1.signer-prod.testnet`, domain **1**.
- [Bridge health](https://bridge-public-testnet.youtick.net/__health): HTTP 200,
  `ok`; aynı testnet/Market ve compact version 1;
  `sponsoredUploadRelayReady=true`, `newUploadReady=true`.
  Bu health sonucu yeni quote, gerçek Livepeer erişimi veya upload kabulü değildir.
- Market politikası 5 GB / 24 saat job sınırı; mevcut profile hash'leri
  adaptive **360p+720p** ve legacy **720p**. Kaynakta bulunan full-HD profil
  bu final politika listesinde yok; bu kabulde 1080p talep edilmeyecek.

Kanıt: `/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-upload-acceptance-preflight-OM6W9r/readiness.json`.
Bu snapshot gelecekteki gönderimin bakiye/protokol garantisi değildir.

## Yerel kurulum farkı — LOCAL_STATIC

`tmp/near-auth-ticket-local-setup/start.mjs` salt-okunur incelendi;
**çalıştırılmadı**. Şu anda yalnız ticket/MPC bayraklarını geçiriyor. Upload
bayrakları ile `CREATOR_FEE_QUOTE_PRIVATE_KEY` / `CREATOR_FEE_QUOTE_KEY_VERSION`
aktarımı yok. Yerel MPC private girişinde upload teklif imzası, mevcut relay'in
quote anahtarıyla doğrulandığı için bu eksik anahtarla gönderim reddedilir.

- Mevcut `workers/livepeer-bridge/.dev.vars`, `.env`, `.env.local` dosyaları yok.
  Başka güvenli kasada anahtar olmadığı iddia edilmiyor; kullanılacak onaylı
  kaynak **belirlenmedi**. Hosted secret değerinin geri okunabileceği varsayılmıyor.
- Eşleşen mevcut quote anahtarı ve version 1 güvenli biçimde yalnız yerel
  Bridge belleğine aktarılmalı. Web'e, public config'e, argv/loga veya repoya
  yazılmamalı. Sırf testi açmak için quote key rotation veya yeni anahtar yok.
  Eşleşme kanıtlanamıyorsa kurulum durur; tahmini anahtarla MPC denenmez.
- Mevcut sponsor/account/key epoch **`local-v1`**, Worker adı ve kalıcı
  `tmp/near-auth-ticket-local-setup/state/` dizini korunmalı. Kayıt/nonce/epoch
  sıfırlayarak yeni deneme hakkı açılmaz.
- Başlatıcı Bridge'i `watch:false` ile çalıştırır. Diskteki upload source'unu
  çalışan Worker'a geçmiş sayma; ayrı onaylı restart ve kapalı bağlantı
  doğrulaması gerekir. Restart bellekteki Web session anahtarını değiştirir;
  kullanıcı yeniden giriş yapar, cihaz/taslak kayıtları silinmez.
- Port 3000'de dinleyen süreç görüldü. `runtime-public.json` kapanış kaydı
  `spendingEnabled:false` içeriyor; bu dosya canlı bütün bayrakların yeniden
  doğrulanması değildir. Özel ürün status'u için tarayıcı oturumu kullanılmadı.
- SQLite'a `mode=ro` okuma denemesi `unable to open database file` döndü.
  Kilit/izin değiştirilmedi, servis durdurulmadı. Güncel günlük sayaç ve iki
  terminal operation canlı runtime'dan yeniden okunmuş sayılmaz. Hazırlıkta
  yetkili ürün status'u üzerinden kontrol edilmelidir.

## Önerilen iki-upload paketi — henüz harcama onayı değil

Aynı mevcut iki bağımsız kimlikle **birer** yeni ürün upload'ı. Önce Google,
sonra passkey; aynı hesaplara yeniden bilet alınmaz. Kullanıcı seçtiği hesabı
ve onay yöntemini doğrular. Önceki lab upload ve ürün bilet kabulü bu yeni
ürün upload yolunun gerçek kabulü yerine geçmez.

Dosya önerisi: kullanıcının seçeceği **MP4, en fazla 30 saniye ve 20.000.000
bayt**, 720p'ye uygun kısa klip. Dosya henüz seçilmedi/okunmadı; exact yol,
boyut ve dosya özeti kurulumda kaydedilecek. Aynı klip iki bağımsız creator
kabulünde kullanılabilir; ayrı job kimlikleri ve açık onay gerekir. Bilet
fiyatı önerisi **2 test USDC**, upload sırasında bilet satın alma değildir.

| Kalem | Önerilen sınır / hazırlık |
| --- | --- |
| Upload toplamı | Creator başına **0,60 test USDC**: 0,50 medya + 0,10 mevcut relay bedeli |
| İki creator'ın bugünkü USDC açığı | **0,60 + 0,60 = 1,20 test USDC**; transfer başlatılmadı |
| MPC outer rezerv | İşlem başına **0,35 test NEAR**, iki yeni işlem toplam **0,70** |
| Sponsor minimum kalan kullanılabilir bakiye | **0,05 test NEAR** |
| İki işlem için başlangıç hedefi | En az **0,75 test NEAR** kullanılabilir; bugünkü 0,7888978 bu hedefi karşılıyor |
| Creator NEAR | Upload kaynağı ticket'a özgü 0,12 NEAR inner rezervini istemiyor; bu snapshot ek creator NEAR fonlama gerekçesi oluşturmuyor |

Kaynak formülü mikro USDC:
`max(500000, ceil(sourceBytes × 3 / 10000)) + 100000`.
Seçilen sınırdaki dosya 0,60 USDC dilimindedir. Gerçek quote bu değerden
saparsa yeni bütçe varsayılmadan durulur. MPC gideri, relay'in 0,10 USDC
kalemi ve Livepeer medya gideri ayrı kalır; yeni komisyon eklenmez.
Fonlayan cüzdanın kendi transfer gas/1 yocto giderleri bu upload bedeline
karıştırılmaz. Önceki soteri.testnet fonlamaları yeni transfer onayı değildir.

**UTC günlük sınır:** 23 Eylül bilet kapanış kaydı iki adet 0,35 rezerv ve
her aday hesapta bir deneme gösteriyor; başlatıcı sınırları günlük 0,70 /
hesap başına 1. Kaynak rezervleri gerçek gider kadar azaltmıyor. Bu kayda göre
aynı UTC gününde mevcut limitlerle upload açmak yeterli değildir; güncel
sayaç ayrıca doğrulanmalıdır.

Tercih: yeni iki denemeyi **24 Eylül 00:00 UTC / 03:00 İstanbul sonrasında**,
yeni ve açık upload onayıyla, mevcut 0,70/gün ve 1/hesap limitleriyle yapmak.
Bu bir zamanlama/otomasyon oluşturmaz ve gün değişmesi harcama yetkisi değildir.
Aynı gün istenirse ayrı açık onayla toplam günlük tavan **1,40**, hesap başı
**2** gerekir (mevcut iki bilet + en fazla iki yeni upload); kayıtlar aynen
korunur. Bu alternatif uygulanmadı ve varsayılan öneri değildir.

## Gerçek kabulde aranacak kanıt ve duruş

1. Kapalı modda Web → mevcut private Worker bağlantısı, aynı iki terminal
   bilet operation'ı ve güncel bütçe doğrulanır. Upload quote anahtarı yetkisi,
   source snapshot'ı, doğru creator/cihaz ve exact dosya/ücret kaydedilir.
2. Ayrı onaylanan hazırlıkta gerekli USDC fonlama FINAL doğrulanır. Gerçek
   kabul ayrıca onaylanınca yalnız gerekli MPC/upload gönderimleri açılır;
   ticket, lab ve multi-asset işlemleri kapalı kalır.
3. Kullanıcı başlık/boyut/ücret/creator özetini ve Google/passkey onayını
   kendisi verir. Sponsor cüzdanı seçimi veya ikinci kullanıcı bilet ödemesi yok.
4. Operation ID, outer MPC hash, exact delegate/job, varsa relay hash'i,
   final job/fee/quote hash/device bağı ve **UPLOAD_SETTLED** kaydedilir.
   İmza veya HTTP 202 başarı sayılmaz; relay hash'i yoksa tahmin edilmez.
5. Aynı job'da TUS → processing → NEAR Published / publication ACTIVE;
   aynı creator'ın 720p oynatma ve kullanıcı ses/görüntü onayı, reload sonrası
   yeni imza/ücret olmadan erişim doğrulanır. Diğer kimlikte ayrı bir kabul.
6. Gönderimler kapatılır; status, anahtar/epoch, bütçe, taslak ve kalıcı işlem
   kayıtları korunur. Gerçek gider ile ayrılmış rezerv ayrı raporlanır.

Yanlış kimlik, eski belirsiz deneme, draft/key kaybı, bütçe/quote/protokol
uyuşmazlığı, expiry veya kayıp cevapta tekrar imza/ödeme/quote yok. Bilinen
operation/job/hash salt-okunur izlenir. Gerçek kabul sırasında kasıtlı arıza
çıkartılmaz; kesinti ve tekrar koruması önceki sentetik testlerde doğrulandı.
Hosted/Production, yeni cihaz/recovery, uzun video ve yeni hesap onboarding'i
bu iki kısa creator kabulünün sonucu sayılmaz.

## Doğrulama ve tek sonraki gate

Kaynak raporunun native upload **13**, native ticket **12** ve Brave **29**
PASS artifact'ları mevcut ve okundu; **yeniden çalıştırılmadı**. Önceki 972 Web /
489 Bridge sayıları tarihsel LOCAL_TEST'tir. Bu gate yeni uygulama testi değil,
salt-okunur canlı snapshot ve hazırlık değerlendirmesidir. **Doküman build
PASS**; mevcut 500 kB bundle uyarısı sürer. Başlangıç dosya hash'leriyle
yalnız bu rapor ve ana planın değiştiği doğrulandı; dosya silinmedi.

**Tek sonraki gate: `NEAR_AUTH_V1_UPLOAD_LOCAL_ACCEPTANCE_SETUP` — başlatılmadı.**
Yalnız mevcut yerel başlatıcının upload alanlarını güvenli ve kapalı modda
hazırlama, aynı storage/key/epoch ile bağlantı/status kontrolü; matching quote
anahtarı kaynağı, dosya ve onaylı bütçeyi somutlaştırma. Kaynak/bağlantı hazır
olmadan fonlama yok. Gerçek secret aktarımı/restart ve fonlama için somut
kapsam/onay gerekir; bu ön kontrol bunların yetkisi değildir. Setup içinde
ödeme veya upload başlamaz; hosted deploy ve yeni anahtar/rotation yoktur.

Ön kontrol blocker'ı yok; **gerçek kabul engelleri:** quote anahtarı kaynağı ve
bağlantısı, kapalı upload runtime kurulumu, güncel sayaç/oturum doğrulaması,
seçili dosya ve 1,20 test USDC açığı için ayrı hazırlık/onay.
