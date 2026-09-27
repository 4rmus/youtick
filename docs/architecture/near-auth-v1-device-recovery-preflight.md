# NEAR Auth V1 — cihaz kurtarma ön kontrolü

Gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_PREFLIGHT`.
26 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

**Mevcut izleme hakkı yeniden satın alınmadan kullanılabilir; gerekli Market
metodu kaynakta zaten var.** Eksik olan Google/passkey oturumundan bu dar
işlemi onaylatıp, mevcut private MPC yolu üzerinden kesinleştiren bağlantıdır.
Yalnız oynatıcıdaki bir düğmeyi açmak yeterli değildir. Önce bozuk cihaz
kaydının başka hesapları da temizlemesi sorunu giderilmelidir.

Bu gate yalnız bu rapor ve ana planı değiştirir. Gerçek cihaz anahtarı üretme,
tarayıcı deposunu okuma/temizleme, provider girişi, imza, ödeme, cihaz
etkinleştirme, runtime/config veya deploy yok. Kabul: mevcut akış, yeniden
kullanılacak parçalar, kaynak engelleri, korunacak kurallar ve tek sonraki adım.
Skill'ler: `youtick-near-auth`, `youtick-contract-review`, `near-api-js`.

## Giriş kimliği ve izleme cihazı ayrı

Google/passkey hesabı NEAR kimliğini belirler. İzleme anahtarı ise ayrı,
tarayıcının IndexedDB deposundaki dışarı çıkarılamayan Ed25519 anahtarıdır.
V3 sertifikası hesap, ağ, Market, origin ve cihaz public key'ine bağlıdır.
Auth0 passkey'i, eski tarayıcının bu izleme anahtarını otomatik taşımaz.

`device-session.ts:228–299`: süresi dolan zincir yetkisi için `getDeviceSession`
null döner; geçerli yerel V3 anahtarı korunur. `preparePlaybackDevice` aynı
anahtarı yeniden kullanabilir. Yeni tarayıcıda kayıt yoksa açık hazırlık
eyleminde yeni cihaz anahtarı gerekir. Sayfa açılışı/Play/token yenileme
otomatik imza veya yeni satın alma başlatmamalıdır.

## Var olan doğru yol

| Katman | Korunacak davranış |
| --- | --- |
| Market `activate_playback_device` (`lib.rs:1581`) | Mevcut bilet sahibi veya creator; tam 1 yoctoNEAR, doğrudan kullanıcı işlemi, signer=predecessor ve Ed25519. Yeni bilet/USDC tahsilatı yok. |
| Hak/erişim | Bridge frozen veya takedown reddedilir. Satış durması / yeni satın alımların durması mevcut hakkı olanın aktivasyonunu engellemez. |
| Cihaz kaydı | 30 gün; aynı geçerli key/certificate/authorizing-key no-op. Süresi dolan veya değişen kayıt açık işlemle yenilenebilir. |
| Sınır | Hesap başına en fazla üç aktif cihaz; dördüncü kayıt en eski yetkiyi çıkarır. Okuma/izleme süre uzatmaz. |
| Web `activatePlaybackDevice` | Yalnız açık düğme; hesap/hak/yayın/freeze kontrolü, mevcut cihaz hazırlığı, tek Market çağrısı ve kayıp cevapta aynı cihazı okuma. |
| Bridge playback | Cihaz ve mevcut NEAR hakkından sonra medya erişimi. Auth0 girişinin kendisi izleme yetkisi değildir. |

İşlem **USDC bilet ücreti gerektirmez**, fakat 1 yoctoNEAR ve ağ gideri vardır.
Mevcut düzenle MPC dış çağrısının gideri sponsor, doğrudan iç Market çağrısının
gideri kullanıcı hesabı tarafındadır. “Tamamen ücretsiz/gasless” kabulü yok.
Mevcut `FullAccess` yolu korunur; ordinary FunctionCall anahtarıyla deposit
ekleme varsayımı yapılmaz. [NEAR erişim anahtarları](https://docs.near.org/protocol/accounts-contracts/access-keys)
bu yetki ayrımını açıklar. Fonlama veya bütçe artırımı bu gate'te yapılmadı.

## Kaynak engelleri

1. **Bozuk kayıt diğer hesapları siliyor — öncelikli kaynak bulgusu.**
   `device-session.ts:341` catch yolu `clearDeviceSession()` çağırıyor;
   hesapsız çağrı ortak store'u temizliyor. İki sentetik V3 hesabı kurulup
   yalnız ilk sertifika bozulduğunda, ilk hesabın okunması ikinci hesabın
   cihaz kaydını da sildi. Bu **LOCAL_TEST**; gerçek kullanıcı deposu okunmadı.
   En küçük düzeltme mevcut temizliği hedef hesapla sınırlamak ve diğer
   hesap/ilerleme kayıtlarını koruyan regresyon eklemektir. Eksik/geçersiz
   kayıtlarla yeni imza/ödeme başlamadan önce mevcut işlem kilitleri okunmalı.
2. **Sosyal oynatıcıda aktivasyon girişi yok.** `LivepeerPlayer.tsx:29–31`
   near-auth oturumunda `getWallet` vermiyor; `164–208` içindeki aktivasyon
   yolu bu yüzden açılmıyor. `WalletProvider.getWallet` guard'ını kaldırmak
   yanlış cüzdanı kullanmaya yol açar; genel wallet adapter'ına sessiz fallback yok.
3. **Private MPC yalnız ticket/upload kabul ediyor.** Protocol DTO'su ve
   `validateMpcCommand` yalnız bu iki purpose'u, USDC alıcısını ve
   `ft_transfer_call` yöntemini kabul eder. Geçerli tek Market aktivasyon
   işlemi hem yeni `device` purpose'uyla hem ticket diye sunulunca reddedildi;
   iki izole kontrolde RPC/send yok. Mevcut sınırlama korunarak dar cihaz
   purpose'u eklenmeli; generic signer endpoint'i açılmamalı.
4. **Cihaz etkinleştirme bilet satın alma ön kontrolü değildir.**
   `readTicketState` hakkın olmamasını, ACTIVE satışı ve USDC bakiyesini ister;
   recovery buna bağlanamaz. Mevcut sertifika kontrolü `ticketRequest`, yayın,
   hak ve cihaz okuma yardımcıları yeniden kullanılabilir. Ticket/upload
   `first_device_only` kontrolleri kaldırılmaz; etkinleştirilmiş aynı geçerli
   cihaz bu mevcut kontrollerden geçebilir.

## Kurtarma bağlantısının en küçük kapsamı

Kayıt koruma düzeltmesinden sonra yapılacak kaynak çalışmasının sınırı:

- Mevcut oynatıcı + `activatePlaybackDevice` akışı ve dar işlem adapter'ı.
  Yalnız mevcut hesabın `activate_playback_device` çağrısı; başka receiver,
  method, ek action, key ekleme veya FT işlemi reddedilir. Yeni wallet context,
  SDK, servis ya da kontrat migration'ı öngörülmez.
- Ayrı ürün `/api/auth/device` prepare/submit/execute/status yolu; mevcut
  HttpOnly session, origin ve hesabı sunucuda türetme düzeni. Browser'ın
  gönderdiği hesap/sponsor/ham transaction'a güvenilmez. Sertifika hash'i,
  origin, yayın/hak, kullanıcı public key'i, güncel nonce/block ve süre bağlanır.
- Mevcut `authorizeNear` transaction onayı ve Auth0'nun exact-byte `fatxn`
  doğrulaması korunur. Device scope bilet fiyatı/USDC miktarı taşımaz;
  mevcut DTO'daki amount alanı korunacaksa yalnız bu purpose için **0** olur,
  ticket/upload pozitif miktar kuralları gevşetilmez.
- Aynı Bridge/DO nonce, bütçe, tek gönderim ve hesap kilidi. Dar `device`
  purpose'u, `DEVICE_SUBMITTED` / `DEVICE_SETTLED`, ayrı `executeDevice`
  metodu; iç işlem kullanıcının doğrudan Market çağrısıdır. Mevcut upload
  delegate/relay yolu cihaz etkinleştirmeye zorlanmaz.
- Cihaz gönderimi Web ve Bridge'de ayrı varsayılan-kapalı izinlere bağlanır;
  mevcut MPC izin/bütçesi de gerekir. Önceki test bütçeleri yeni cihaz işlemi
  onayı değildir; fonlama veya limit değişikliği otomatik yapılmaz.
- Başarı: exact inner hash ve başarılı final receipts + aynı hak + doğru
  cihaz public key/sertifika/authorizing-key/süre. MPC imzası tek başına
  başarı değildir. Status/reload yalnız mevcut işlemi uzlaştırır; yeni imza
  veya broadcast üretmez. `isMpcSettled` ve bütün ticket/upload tüketicileri
  yeni terminal durumu tanımalı; cihaz işlemi “bilet satın alma” diye gösterilmez.

Üç cihaz sınırı kullanıcıya açıklanmalı; ilk canlı kabulde boş slot seçilmeli.
Üç aktif kayıtta yeni cihaz eklemek eski yetkiyi kaldırabilir; ayrı açık
replacement onayı olmadan dördüncü cihaz denenmez. Liste hazırlık ve gönderim
öncesinde tekrar okunur. Bu ön kontroller kontrattaki olası eşzamanlı kayıt
değişimine karşı atomik bir garanti değildir; ilk kabul paralel cihaz işlemi
içermez, kontratın mevcut eviction davranışı gizlenmez.

Önceden pending ekonomik işlem varsa yeni cihaz işlemi başlatılmaz. Ayrıca
`reconcileTicket` ve `reconcileUpload` güncel, süresi geçmemiş cihaz kaydını
başarı koşulu yapıyor. Ödeme final olsa bile cihazın süresi dolduktan sonra
gecikmiş uzlaştırma bloke olabilir (**LOCAL_STATIC risk**, bu tur yeniden
üretilmedi). Kilit silerek/ödeme tekrarlayarak aşılmaz. İlk recovery kabulü
önceki işlemleri settled hesapla sınırlanmalı; pending + expired-device yolu
ayrı doğrulanmadan genel kurtarma tamamlandı denmemeli.

## Test ve canlı kabul planı

Kaynak kapsamı; ortak cihaz deposu ve testleri, mevcut oynatıcı/WalletProvider,
dar cihaz client/server/API, private MPC protocol/Web/Bridge tüketicileri ve
ilgili mevcut testlerdir. Kontrat değişimi/deploy yok; canlı Market metodunun
güncel dağıtımda bulunduğu ayrı read-only kanıtla doğrulanmadan gönderim açılmaz.

Gereken senaryolar: başka tarayıcı, aynı anahtarla süre yenileme, aynı geçerli
kayıtta no-op, bozuk bir kaydın diğer hesapları etkilememesi, yanlış hesap/
origin/sertifika/hak, satış durması ile takedown farkı, dolu cihaz listesi,
kayıp cevap/reload/çift tıklama, closed flags ve eski ticket/upload uyumu.
Play/reload/token renewal yeni onay istememeli; yalnız açık cihaz eylemi
onay isteyebilir. Gerçek Google/passkey aktivasyonu, NEAR gider bütçesi ve
oynatma ayrı yetkili kabul gerektirir.

## Bu turdaki kanıt

- **LOCAL_TEST:** 55 mevcut Web testi (device-session, activation, playback-v2)
  ve dört Rust `explicit_device_activation` testi PASS. Rust 1.86.0 / SDK
  5.5.0, Web/Bridge near-api-js 7.3.0 ve Auth0 SPA 2.26.0 korundu.
- Üç izole teşhis kontrolü PASS: bir global temizleme yeniden üretimi ve
  iki MPC aktivasyon reddi. Bunlar eksikleri gösterir; yeni recovery kabulü
  değildir. Geçici kopyalardaki diğer testler isim filtresiyle çalıştırılmadı.
- **LOCAL_STATIC:** kaynak/kontrat/tüketici analizi; doküman build/kapsam
  kontrolü PASS, mevcut 500 kB bundle uyarısı sürer. Uygulama/config ve index aynı.
- **EXTERNAL_NOT_RUN / UNPROVEN:** canlı cihaz deposu, yeni key, provider
  login/onay, chain sorgusu veya gönderimi, cihaz evict/yenileme, ödeme,
  runtime değişikliği, yeni oynatma, CI/deploy. Mevcut deployed ABI, aktif
  cihaz sayısı, bakiye ve gerçek recovery henüz bu gate'in kanıtı değildir.

Kanıt: `/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-device-preflight-827evjci/`.
Ön kontrol tamamlandı; uygulamaya geçmeden giderilecek somut kayıt koruma
bulgusu var. **Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_STORAGE_GUARD_SOURCE`
— başlatılmadı.** Yalnız hesapla sınırlı temizleme, ilgili regresyon ve plan;
MPC cihaz entegrasyonu veya gerçek cihaz değişikliği otomatik başlamaz.
