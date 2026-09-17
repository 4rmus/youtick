# NEAR Auth kısa yükleme mesajı — yerel uyumluluk planı

Gate: `NEAR_AUTH_PAYLOAD_COMPATIBILITY_PLAN`. Tarih: 17 Eylül 2026.
Sonuç: **COMPLETED_WITH_WARNINGS**. Sağlayıcı değişikliği gerektirmeyen aday,
izole kaynak kopyasında üç katman üzerinden doğrulandı. Çalışan uygulamaya
bağlanmadı; gerçek Google onayı, ödeme, upload ve HLS kabulü yapılmadı.
Güncel sıra: [entegrasyon durumu](./near-auth-integration-status.md).

## Karar ve kapsam

Sponsorluğu koruyan `yt:u1:` kısa mesaj biçimini sonraki kaynak gate'ine taşı.
Kısa JSON yeterli boyut payı bırakmadı. Seçilen aday, NEAR'ın kullandığı Borsh
alan düzeni ve standart Base64 ile yalnız YouTick ödeme mesajını taşır.
Auth0 issuer/audience, MPC anahtar türetimi ve tam işlem baytlarının onayı
değişmez. Yeni servis veya bağımlılık eklenmedi.

Ana ajan tek yazardı; üç salt-okunur alt ajan veri biçimi, kimlik/imza ve
sağlayıcı onay ekranını inceledi. Prototip, `f71178263c5d264bef647feaae8a2b54618b1333`
tabanı **ve mevcut yerel değişikliklerin** dosya hash'leri alınmış kopyasında
hazırlandı. Temiz main veya yayın adayı değildir.

Ana çalışma alanında yalnız bu rapor ve güncel durum belgesi değişir. İzole
kopyadaki kaynak değişiklikleri geri taşınmaz. Ortam dosyaları, bayraklar,
provider/kontrat ayarları, tarayıcı/cihaz verileri ve önceki işler korunur.
Kabul: açık boyut kontrolleri, aynı imzalı örneklerin Web/Bridge/Market kabulü,
bozuk veri retleri, tek ödeme ve mevcut playback kanıtının korunması.

## Aday veri biçimi

Standart `ft_transfer_call` dış alanları `receiver_id`, `amount`, `msg` olarak
kalır. İsteğe bağlı `memo` yalnız yeni biçimde gönderilmez. `msg`, `yt:u1:`
öneki ve aşağıdaki sırayla Borsh kodlanmış verinin kanonik Base64 karşılığıdır.
Tamsayılar little-endian; fiyatın tam sayı hassasiyeti korunur.

| Alan | Tel biçimi / anlam |
| --- | --- |
| Job kimliği, başlık | Borsh string; en fazla 128 ASCII karakter / 200 UTF-8 bayt |
| Bilet fiyatı, kaynak dosya baytı | `u128`, `u64`; mevcut fiyat ve 5 GB sınırları |
| Profil | `u8`; legacy/adaptive/full-HD için değişmez üç hash eşlemesi |
| Upload public key | Tam 32 bayt Ed25519 |
| Upload anahtarı bitişi | Quote başlangıcından itibaren gerçek fark, `u32`; toplam taşma kontrollü |
| Cihaz public key ve sertifika özeti | Tam 32 + 32 bayt |
| Cihaz süresi | `u32`; mevcut 2.592.000.000 ms değeri |
| Quote başlangıcı ve gerçek ömrü | `u64` + `u32`; 119.123 ms örneği aynen korunur, 120 saniyeye uzatılmaz |
| Quote başlangıç bloğu ve pencere | `u64` + `u8`; mevcut 200 blok kuralı korunur |
| Quote anahtar sürümü ve imza | `u32` + tam 64 bayt |

Creator, doğrulanmış delegate göndereninden / USDC `sender_id` değerinden;
ağ, Market ve USDC adresleri güvenilir bağlamdan gelir. Sabit protokol alanları,
ücretler, canonical request hash'i ve quote ID yeniden hesaplanır. Sonrasında
**mevcut quote imzası ve ekonomi kontrolleri** çalışır. Google/MPC imzası ise
geri açılan uzun JSON'a değil **orijinal kısa delegate baytlarına** aittir.

Profil tablosu değişebilir `profiles.json` değerlerinden anlık okunmaz; TS ve
Rust'ta aynı literal hash'ler sabitlenmiştir. Yeni profil eski kimliği yeniden
tanımlayamaz. Bütün baytlar tüketilir; fazla bayt, bozuk UTF-8/Base64, yanlış
sürüm, taşma, bilinmeyen profil ve kayıplı veri dönüşümü reddedilir.

## Yeni kanıt

**LOCAL_TEST:** 5 başlık türü × 2 job uzunluğu × 4 gerçek test anahtar grubu ×
3 Market adresi uzunluğu × 3 token zarfı = **360 boyut senaryosu**, tümü geçti.
Gerçek RSA JWT, yerel Ed25519 quote/delegate imzaları ve değiştirilmemiş
sabit upstream Action kullanıldı. Kimlik ve zincir verileri sentetiktir.

| Ölçüm | En büyük gözlem | Kontrol sınırı |
| --- | ---: | ---: |
| Delegate | 1.098 bayt | 4.096 |
| Auth0 form `fields` | 12.041 bayt | 24.576 |
| Tam sentetik JWT | 6.673 bayt | 7.168 |
| `fatxn` + ayrılmış 2.048 bayt token bütçesi | 7.130 bayt | 7.168 |
| Base64 upload args | 1.144 karakter | 5.500 |
| Şifreli inceleme bileti | 2.735 karakter | 16.384 |
| Signing API toplam gövdesi | 9.460 bayt | 32.768 |
| MPC dış çağrısının Base64 argümanları | 14.116 karakter | 32.768 |

2.048 bayt ayrılan pay, sağlayıcının garanti ettiği token zarfı değildir.
7.130 yalnız bu matristeki en büyük ölçümdür; tüm olası byte/claim dağılımları
için matematiksel üst sınır değildir. Gerçek doğrulanmış JWT'ye **7.168 bayt
son kontrolü** ortak `verifyApproval` sınırında uygulandı. 7.168/7.169 bayt
gerçek yerel RSA tokenlarıyla kabul/ret sınandı; ret sonrasında sponsor çağrısı
ve ödeme denemesi kaydı sıfır, mevcut login oturumu korunur.

Altı ortak imzalı örnek Web review/parser, Bridge relay doğrulayıcısı ve Rust
`ft_on_transfer` tarafından kabul edildi. Başlık, fiyat, ücret, quote hash'i,
cihaz ve gerçek kısa quote süresi korundu. Yanlış hesap/tutar, bozuk imza,
kesilmiş/fazla bayt, bilinmeyen sürüm ve origin değişikliği ilgili sınırda
reddedildi. Aynı işin tekrarı ücreti iade etti, platform bakiyesi veya cihaz
süresi ikinci kez artırılmadı.

Bridge'de gerçek handler yolunun 202 → sonuç uzlaştırma → tekrar akışında
gönderim sayısı **1** kaldı. Eski ve compact playback proof'ları 29. günde,
quote süresi dolmuşken mevcut Market cihaz kaydıyla çalıştı. Bu testler
yerel/sahte zincir ve medya yanıtları kullanır; gerçek HLS veya browser reload
kabulü değildir.

| Yerel doğrulama | Sonuç |
| --- | --- |
| Web unit | 47 dosya / 751 test PASS |
| Bridge unit | 427 PASS, mevcut 3 koşullu test SKIPPED |
| Market | 11 lib + 41 paid-media entegrasyon testi PASS |
| Web auth tip kontrolü, lint ve build | PASS; build yalnız izole kopya ve sentetik testnet adresleriyle |
| Bridge tip kontrolü | PASS |
| Rust fmt / tüm hedeflerde clippy | PASS |
| Prototip yamasının mevcut başlangıç dosyalarına uygulanabilirliği | `git apply --check` PASS; uygulanmadı |

Mevcut Vite yapılandırma ve Next middleware adlandırma uyarıları sürer.
WASM build, NEAR sandbox uçtan uca test, gerçek Auth0 form/browser kabulü,
CI, Preview/Production ve deploy bu gate'te çalıştırılmadı.

## İncelenebilir teslim ve tekrar üretim

Yerel teslim dizini: `tmp/near-auth-payload-plan-sgamyey_/`.

- `candidate/`: mevcut kirli kaynağın izole kopyası ve prototip; Web emitter
  henüz bu biçimi üretmek üzere bağlanmış değildir.
- `prototype.patch`: yalnız 9 mevcut + 5 yeni prototip dosyası. Mevcut
  başlangıç hash'lerine bağlıdır; temiz main'e veya çalışan ortama otomatik uygulanmaz.
- `manifest.json`: explicit-path listesi ve önce/sonra SHA-256 değerleri.
- `evidence/result.json`, `size-results.json` ve test/build kayıtları.
- `candidate/scripts/near-auth-payload-compatibility.cjs`: değişmemiş provider
  Action'ını kullanan boyut/imza denemesi ve ortak örnek üreticisi.

Mevcut bağımlılık kopyalarıyla `candidate/` içinde
`node scripts/near-auth-payload-compatibility.cjs` tekrar çalıştırılır. Web,
Bridge ve Market kontrolleri `docs/testing.md` içindeki mevcut komutlardır.
Rust bu gate'te `--offline` çalıştırıldı. Yeni paket kurulmadı.

## Sınırlar ve tek sonraki gate

Kodlanmış `msg`, sağlayıcının onay ekranında açık video başlığı olarak
gösterileceği garantisini vermez. YouTick'in kendi inceleme ekranı başlık,
hesap, tutar, sponsor ve cihazı **son imzalanacak baytlardan** göstermelidir.
Hosted formun gerçek okunabilirlik/kullanım kabulü ayrıca gerekir. Aynı
Google kimliği ve aynı işlem onay protokolü korunur; provider formu değiştirilmez.

**Tek sonraki gate: `NEAR_AUTH_COMPACT_UPLOAD_SOURCE`.** Prototipi ana kaynakta
dar kapsamla uygulamak; Google upload emitter'ını yeni biçime bağlamak ve
yerel inceleme → onay → orijinal signed proof zincirini doğrulamak.
Kapsam: yeni ortak codec, Google upload adapter/server, ortak token boyut
kontrolü, Bridge relay/playback parser'ları, Market decoder/giriş bağlantısı
ve ilgili testler. Normal cüzdan, önceki pending işler ve eski proof baytları
korunur. Eski işlem otomatik dönüştürülmez, kilit silinmez, yeni ödeme başlatılmaz.

Yeni kaynak gate'i kapanınca daha önce bulunan token/inceleme ve quote blok
penceresi kontrolleri tamamlanır; ardından ayrı yerel UX ve kontrollü canlı
kabul değerlendirilir. Hiçbiri otomatik açılmadı. Canlı imza/ödeme/yayın için
bu yerel sonuç yeni yetki oluşturmaz.
