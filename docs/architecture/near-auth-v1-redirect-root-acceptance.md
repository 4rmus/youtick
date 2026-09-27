# NEAR Auth V1 — gerçek kök yönlendirme kabulü

Gate: `NEAR_AUTH_V1_REDIRECT_ROOT_ACCEPTANCE`.
25 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

**Google ile gerçek yönlendirmeli giriş başarılı:** ortak testnet client,
ürünün kök dönüş adresiyle giriş ekranına ulaştı; kullanıcı Google girişini
tamamladı ve `/profile` sayfasına `2944…324c` hesabıyla döndü. Bu hesap önceki
Google ürün kabulündeki hesapla eşleşir. Callback parametreleri son URL'de yok;
reload aynı hesabı ve doğrulanmış oturumu korudu. Provider ayarı veya iletişim
gerekmedi. Passkey ve diğer başlangıç hedefleri bu turda canlı denenmedi.

## Yerel çalışma ortamı ve sınırlı yeniden başlatma

İlk kontrolde 3000 portundaki eski Next sunucusu yanıt vermiyordu; listener
PID 37973 sürekli CPU kullanıyordu. `/api/auth/session` zaman aşımına uğradı.
Kayıtlı yerel Bridge `127.0.0.1:52559` adresinde dinleyen süreç yoktu. Bu
gözlemler Auth0 callback hatası değildir; sunucunun takılma kök nedeni ayrıca
kanıtlanmadı.

Kullanıcı yalnız Web sunucusunun yeniden başlatılmasını açıkça onayladı.
Yalnız doğrulanmış Web süreç grubu durduruldu; mevcut ortam bellekte alınarak
aynı ayarlarla yeniden açıldı. Yeni Next CLI PID 69538; oturum anahtarının
aynı kaldığı içerik açıklanmadan hash eşitliğiyle doğrulandı. Bridge
başlatılmadı; sponsor anahtarına veya ödeme/yükleme kayıtlarına dokunulmadı.
Yeni yerel log gözeticisi auth ayrıntılarını kaydetmeden filtreler.

| Kontrol | Bu turdaki kanıt |
| --- | --- |
| Web origin/client | Çalışan CLI ortamında `http://localhost:3000` ve `np8paqIpMWmNbzT4xAvOOapZBjsOpptl` doğrulandı. |
| Ağ/ürün | testnet/public-testnet, ürün açık, lab kapalı. |
| Üç Web gönderim bayrağı | MPC/ticket/upload `false`; yeniden başlatmada korundu. |
| Üç Bridge gönderim bayrağı | Kayıtlı yapılandırmada MPC/ticket/upload `false`; çalışan Bridge yok, gönderim hizmeti aktif değil. Bu üç değer canlı Worker içinden okunmuş gibi raporlanmaz. |
| Yerel kök aktarımı | Cookiesiz sentetik hata query'si, gerçek Next'te `/auth/callback` hedefine 307; no-store ve no-referrer doğrulandı. Auth0 isteği değildir. |
| Kayıt bütünlüğü | Sekiz runtime yapılandırma/kalıcı Bridge dosyasının başlangıç ve son hash'leri aynı. |

## Gerçek giriş zinciri

1. Mevcut ürün `/profile` sayfasında Google/Passkey popup'ı açıldı ve hiçbir
   kimlik bilgisi girilmeden kapatıldı. Bu, gerçek UI'de `Continue in this tab`
   seçeneğini görünür yaptı; başarısız popup yeniden ödeme veya imza üretmedi.
2. Aynı sekmede bu seçenek kullanıldı. Kaynaktaki tek kök redirect adayıyla
   `login.testnet.fast-auth.com` giriş ekranı açıldı; callback mismatch görülmedi.
3. Giriş kullanıcıya bırakıldı. Kullanıcı Google ile giriş yaptığını bildirdi;
   tarayıcı `/profile` üzerinde doğru hesap ve `Signed in with NEAR Auth.`
   metnini gösterdi. Hesap fingerprint'i `2944…324c`.
4. Filtrelenmiş Web logunda **1 adet `POST /api/auth/session 200`** ve ilk
   hesap doğrulaması görüldü. Reload sonrasında aynı hesap geri geldi;
   oturum POST sayısı **1** kaldı, hesap POST 200 sayısı **2** oldu.
5. Bu aralıkta `/api/auth/ticket` ve `/api/auth/upload` isteği **0**. Gerçek
   sponsor/ödeme/upload başlatılmadı; kapalı ayarlar ve kalıcı kayıtlar korundu.

## Kanıt ve kalan sınır

- **PROVIDER + yerel gerçek runtime:** Google hosted login, kök dönüşünün
  tamamlanması, sunucunun doğruladığı ürün oturumu, doğru hesap ve reload.
  Bu deneme ortak client ile kök dönüşün çalıştığını gösterir; yönetim izin
  listesinin tamamı okunmadı ve eski `/auth/callback` provider adresi yeniden
  denenmedi.
- **LOCAL_STATIC:** yalnız bu rapor ve ana plan değişti; kaynak ve Git index
  başlangıca göre korundu. Doküman build/kapsam kontrolü PASS; mevcut 500 kB
  bundle uyarısı sürer. Önceki 1009 kaynak testi bu canlı gate'te tekrarlanmadı.
- **UNPROVEN / çalıştırılmayanlar:** gerçek passkey redirect, upload/watch
  başlangıç hedeflerinden canlı dönüş, mobil/Safari, hosted/Production kabulü.
  Tüm hedefler ve hata yolları için önceki yerel testler canlı kabul sayılmaz.
- **EXTERNAL_NOT_RUN:** provider ayarı/Management API/iletişim, hesap taşıma,
  imza, ödeme, yeni upload, Bridge restart, CI/GitHub/deploy. Uygulama kaynak
  düzeltmesi yapılmadı; onaylı tek Web restart yukarıda ayrı kaydedildi.

Güvenli kanıt ve filtrelenmiş runtime log dizini:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-root-acceptance-yv9_q3y4/`.
Tarayıcıdaki Google oturumu ve Web sunucusu açık bırakıldı.

Google kök dönüşünü durduran blocker yok. Bridge'in kapalı olması bu login
kabulünü engellemedi; yeni ekonomik işlem kabulü değildir.
**Tek sonraki gate: `NEAR_AUTH_V1_PASSKEY_REDIRECT_ACCEPTANCE` — başlatılmadı.**
Bu gate aynı client/origin ve kapalı gönderimlerle passkey dönüşünü, tercihen
mevcut bir upload/watch hedefinden, ayrı kullanıcı girişiyle doğrulayacak.
