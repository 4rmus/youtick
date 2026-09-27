# NEAR Auth V1 — ürün bilet ödeme kabulü

Gate: `NEAR_AUTH_V1_TICKET_PAYMENT_ACCEPTANCE`.
23 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

**Google ve passkey ile gerçek testnet bilet satın alma/izleme geçti.** İki
ayrı kullanıcı, ana uygulamada birer 2 test USDC bilet aldı. MPC dış isteğini
ayrı yerel sponsor gönderdi; alıcılar sponsor cüzdanı seçmedi. Hak, ödeme ve
cihaz zincirde doğrulandı; iki hesapta da 1080p oynatma, kullanıcı tarafından
ses/görüntü onayı ve reload sonrası tekrar erişim alındı. Kapanışta dört
NEAR Auth gönderim bayrağı false yapıldı; kalıcı işlem kayıtları korundu.

Bu sonuç yerel ürün + gerçek testnet/provider kabulüdür. Hosted/Production,
CI/deploy, kart, yeni hesap onboarding'i, yeni cihaz/yenileme veya ürün upload
kabulü değildir. Commit/push yapılmadı.

## Gerçek işlemler

İki kabul de **Player V2 1080 landscape** üzerinde tamamlandı:
`lp-f263096b-8992-4fd8-afc4-7b4c758cfc82`, creator `utick2.testnet`, fiyat
`2000000` mikro USDC. Her iki alıcı da creator'dan farklı ve başlangıçta
haksızdı. Sponsor:
`e582a5e0dece7b0a61b37384d6dc9a4e46bc539ba8d0439803606c7fbe1f975c`.

| Kanıt | Passkey | Google |
| --- | --- | --- |
| Alıcı | `9db6cbd959c2ad427dc68b77b905edd0b8470431e3a3a9abebf0ee41a659d21a` | `29445f46f23551e48c99869c2e34e3acb283902db8196da32cb3f6625872324c` |
| Operation ID | `8aa3c9f47fc0d70e5f490a6125952f1e7aaf93678039138eb05bb985d35790e6` | `7ceb02902626cdfd5c487382e58956f53ce6abc67182b2186bf69c27a3237c51` |
| Dış MPC hash | `BkH3ja9cHqkHFAjoiU7UsjksX2MPmtQWxbfQy1wn4gJ1` | `EMQtotwFvwuUjnEFhPofV6iaoE3m8Ud3upzsnF9evr1S` |
| İç bilet hash | `D2YdchcEcREFsFVjSktAbUHfkDB3Jk72VXPSgodzcj5T` | `EPabFgmSjHaUF2PfriFUo31qwoSS2JrkFwyQ7nvCDYeS` |
| Durum | `TICKET_SETTLED`, FINAL | `TICKET_SETTLED`, FINAL |
| Son entitlement | true | true |
| Son USDC | 0 | 0 |
| Bağımsız son kontrol bloğu | 269876479 | 269878526 |
| Kullanıcı onayı | “Evet, passkey ile onayladım; görüntü ve ses düzgün” | “Evet, Google ile onayladım; görüntü ve ses düzgün” |

Bridge gerçek receipt/action/signature, Market olayı, alıcı hakkı ve cihaz
bağını doğruladı. Buna ek olarak final iç işlemde kullanılan tutar dönüşü
`"2000000"`, doğru signer, son entitlement ve bakiye salt okunur kontrol edildi.
Sponsor hak sahibi yapılmadı.

İki tarayıcı kabulünde de decoder **1920×1080**, readyState 4, error null;
30,037333 saniyelik klip açıldı. Kullanıcı her iki onay yöntemini ve ses/görüntüyü
ayrı ayrı doğruladı. Reload sonrasında tekrar satın alma/onay gerekmeksizin
aynı biletle oynatıcı açıldı ve tekrar oynatıldı. Aynı operation ve iç hash
korundu. Bu kısa klip testi uzun süreli HLS/renewal kabulü sayılmaz.

Passkey onayı sırasında kullanıcı “tekrar başlat”, hemen ardından “onayladım”
dedi. Yeni imza başlatılmadı; kayıt okunarak mevcut işlemin zaten
`TICKET_SETTLED` olduğu görüldü. Google tarafında kullanıcı mevcut Player V2
incelemesinden ilerledi; başka video için ikinci ödeme başlatılmadı.

## Google hesabı ve ek fonlama

İlk planlanan `38aa…902d` Google hesabının hangisi olduğunu kullanıcı
hatırlamadı. Önce passkey testi tamamlandı; sonra kullanıcı erişebildiği
Google hesabını seçti. Aktif hesap `2944…324c` olarak doğrulandı. Bu hesap
Distance'ın creator'ıdır; Distance'a bilet aldırılmadı.

Yeni hesabın kullanılabilir NEAR'ı 0,0973450104625, USDC'si 0 idi. Kullanıcı,
önceki fonlamaya **ek** 0,03 test NEAR ve 2 test USDC'yi soteri.testnet
cüzdanında onayladı. Her iki transferin exact hedef/action/tutarı ve FINAL
receipt'leri doğrulandı:

- NEAR: `DeHypivfNMrt4xVoLfc1qCMwydtZqacrdkpG5ZNWZqAz`
- USDC: `rJBdHmvzyzKzyeZj8hFDVvUG4BFXWLMqHtKnuGvb7Kq`

Fonlama kontrol bloğu 269878011; alıcı toplam NEAR'ı 0,1291650104625, USDC'si
2 idi. İlk Google planı için kullanılan `38aa…902d` hesabındaki önceki 2 test
USDC yeni hesaba taşınmadı/çekilmedi; o hesapla bu gate'te MPC veya bilet
başlatılmadı. Hesaplar bağlanmadı.

Planlanan Google yayını youtick-promo-test idi; gerçek kullanıcı onayı ve
kesinleşmiş işlem Player V2 1080 landscape içindir. Rapor ve kanıtlar gerçek
publication ID'sine dayanır; planlanan yayının satın alındığı iddia edilmez.

## Canlıda bulunan protokol 87 sınırı ve dar düzeltme

Başlangıç kontrolü 269866525 bloğunda protokol 85'ti. Ön inceleme sırasında
269874989 bloğunda protokol **87** gözlendi. Bakiyeler yeterliyken kaynakta
`protocol_version === 85` koşulu `budget_not_verified` ile hazırlığı durdurdu.
Bu aşamada ödeme/nonce kaydı oluşmadı ve MPC gönderilmedi.

Eski/yeni blokların runtime config'leri karşılaştırılıp
[nearcore 2.14.0-rc.1 notları](https://github.com/near/nearcore/releases/tag/2.14.0-rc.1)
incelendi. İlgili gaz ücret katsayıları, minimum gaz alış fiyatı ve storage
birim fiyatı değişmedi. Gas reward 30%'dan 0'a indi; receipt input/proof
sınırları sıkılaştı. Yeni imza/state-init özellikleri ve kaldırılan DelegateV2,
bu kabulün normal Ed25519 ticket transaction'ında kullanılmıyor. Yeni sınırlar
hatayı başarıya dönüştürmez; final receipt/hak kontrolleri korundu.

Yalnız **ticket** yolunda açıkça 85 veya 87 kabul edildi. Diğer sürümler hâlâ
reddediliyor; upload/delegate ve self-transfer demo yardımcıları 85'e bağlı
kaldı. SDK/kontrat/komisyon/tutar/gas/rezerv sınırı değişmedi. Canlı protokol 87
ödemeleri bu düzeltmeden sonra, kullanıcı onayıyla yapıldı.

Mevcut gaz fiyatı 100000000, minimum alış fiyatı 1000000000 ve storage byte
fiyatı 10000000000000000000 yocto olarak gözlendi. 0,35 sponsor ve 0,12 alıcı
bütçe tavanları gevşetilmedi. Ayrıntılı config farkları yerel kanıt dizinindedir.

## Ölçülen zincir gideri

Aşağıdakiler iki gerçek **testnet** örneğinin receipt ölçümüdür; production
fiyatı, USD maliyeti veya tüm YouTick işletim gideri değildir.

| Kalem | Passkey (test NEAR) | Google (test NEAR) |
| --- | --- | --- |
| MPC dış receipt tokens_burnt | 0,0046406561523199 | 0,0046415354807227 |
| Bilet iç receipt tokens_burnt | 0,0008508429033662 | 0,0008496759838822 |

Sponsorun toplam bakiye farkı **0,0092821916330426 test NEAR**: başlangıç
0,80 → kapanış 0,7907178083669574. Bu fark dış receipt toplamına eşit; dış
isteklerdeki 1'er yocto attach için ek net kayıp gözlenmedi. Bu, 0,70 NEAR
**rezerve günlük tavanın** tamamının harcanması demek değildir. Alıcıların
bilet bedeli ayrı ayrı 2 test USDC'dir; tablo platform fee/USDC tahsilatı değildir.

Sponsor nonce'u `269862673000000` → `269862673000002`. Yalnız iki dış
transaction ve iki ayrı iç bilet hash'i var; yenilemeler ek sponsor gönderimi
üretmedi. Günlük rezerv/sayaçlar sıfırlanmadı.

## Kapanış ve korunan kayıtlar

Yerel launcher `start-approved` kapalı moduyla yeniden başlatıldı.
`NEAR_AUTH_V1_MPC_ENABLED`, `NEAR_AUTH_V1_TICKET_ENABLED`,
`NEAR_AUTH_MPC_ENABLED`, `NEAR_AUTH_TICKET_ENABLED` false.
Kapalı Bridge üzerinde iki terminal kayıt aynı operation/iç hash ile yeniden
okundu. Aynı SQLite dizini, sponsor key/epoch ve Anahtar Zinciri girdisi korunur.

Session anahtarı yalnız bellekte üretildiği için bu yerel restart yeniden
giriş gerektirir. Bu, bilet veya cihaz kaydının silinmesi değildir. Runtime session anahtarı diske yazılmadı; gerekli yeniden girişler kullanıcı
tarafından yapıldı. Son erişim/reload testleri kapatma restart'ından önce tamamlandı;
restart sonrası yeni kullanıcı girişi ayrıca denenmedi.

## Değişen dosyalar ve testler

- `apps/web/lib/near-auth-signing-server.ts`: ticket'a özgü 87 desteği;
  mevcut storage-reserve bayrağı ticket bağlamı olarak adlandırıldı.
- `workers/livepeer-bridge/src/mpc-sponsor.ts`: aynı dar ticket protokol sınırı.
- İlgili `near-auth-signing-server.test.ts`, `mpc-sponsor.test.ts`: 87 ticket,
  bilinmeyen sürüm reddi, eski demo/upload sınırı ve yüksek gaz fiyatı reddi.
- `workers/livepeer-bridge/scripts/near-auth-ticket-runtime.mjs`: sentetik
  native ticket fixture'ı protokol 87 ile çalıştırıldı.
- `apps/web/app/api/auth/ticket/route.ts`: yalnız development'ta mevcut güvenli
  allowlist'ten hata aşaması/kodu; raw token, subject veya review loglanmaz.
- Bu rapor ve ana plan. Geçici launcher/fonlama/observer yardımcıları yalnız
  `tmp/` altında; gerçek private key bu dosyalarda değildir.

**LOCAL_TEST:** Web **936 PASS / 49 dosya**, Bridge **471 PASS / 3 skip**,
odaklı 116 Web / 35 Bridge, native Worker **12 PASS**. Strict auth tip,
Bridge tip ve Web lint PASS. Protokol 87 native testi gerçek ağ/provider
kabulü yerine sayılmadı; iki gerçek işlem ayrıca yukarıda kaydedildi.
Doküman build PASS; mevcut 500 kB chunk uyarısı sürer. Git index/kapsam dışı dirty dosyalar
korundu. CI/deploy, Rust testi ve GitHub yayını yapılmadı.

Yerel kanıt dizini:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-ticket-acceptance-81aq1qbm/`.
İçerik: başlangıç snapshot'ı, protokol config karşılaştırması, iki işlem
status/chain/browser kanıtı, ek Google fonlaması, kapanış ve test logları.
JWT/private key/cookie içermez.

## Kalan kapsam ve tek sonraki gate

Bilet akışı aynı cihazdaki fonlanmış Google/passkey hesapları için kabul edildi.
Yeni kullanıcı fonlama/onboarding, yeni cihaz ve süre yenileme/recovery,
Safari/mobile/uzun video, hosted binding/release ve kart V1 hedefi açıktır.
Protokol 87 için **upload/delegate yolu henüz kabul edilmedi**; önceki protokol
85 upload kanıtı bu yeni runtime için güncel kabul sayılmaz.

**Tek sonraki gate: `NEAR_AUTH_V1_UPLOAD_PAYMENT_PREFLIGHT`.** Mevcut upload
adaptörünü özel MPC göndericisine bağlama ve protokol 87'nin legacy delegate /
ücretli job yoluna etkisini ön kontrol etmek. Yeni upload, ücret, flag açma
ve deploy bu sonraki ön kontrolün otomatik parçası değildir.
