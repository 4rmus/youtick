# NEAR Auth V1 — passkey dönüşü ve mevcut oturum kontrolü

Gate: `NEAR_AUTH_V1_PASSKEY_REDIRECT_ACCEPTANCE`.
25 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

**Mevcut passkey oturumu doğrulandı:** kullanıcı passkey ile aynı sekmede
gidip geri döndüğünü bildirdi. Tarayıcıda önce ana sayfada, ardından profil
ve reload sonrasında `9db6…d21a` hesabı görüldü. Bu, önceki passkey ürün
kabulündeki hesapla eşleşir; profil `Signed in with NEAR Auth.` gösterir.
Yeni giriş, imza veya ödeme başlatılarak durum araştırılmadı.

**Sınır:** kesinti sırasında provider → kök → callback → başlangıç hedefi
zinciri ajan tarafından kesintisiz gözlenemedi. Kullanıcının aynı-sekme
teyidi ayrı kanıttır; planlanan `/upload?job=…` hedefine otomatik dönüş ve
bu passkey denemesinde callback'in tek kez işlenmesi **UNPROVEN** kalır.
Bu sonuç tam hedef-yönlendirme kabulü olarak kullanılmamalı.

## Gözlenenler

1. Gate başlangıcında Google hesabıyla mevcut passkey yüklemesinin
   `/upload?job=lp-fddf7a11-0dca-4705-ac0f-dedbcff308a4` bağlantısı açıldı.
   Hesap değiştirme menüsünden Google/Passkey girişi başlatılırken tarayıcı
   bağlantısı kesildi; ardından kullanıcı çalışmayı durdurdu. Kök nedenin
   tarayıcı çökmesi, eklenti veya uygulama olduğu kanıtlanmadı.
2. Kullanıcı daha sonra passkey girişini tamamladığını söyledi; ek soruya
   **“Aynı sekmede gidip geri döndü”** yanıtını verdi. Kontrol yeniden
   bağlanan mevcut sekmeler üzerinden sürdü; yeni authorize isteği yok.
3. İlk gözlenen URL `/` idi ve hesap `9db6…d21a` olarak görünüyordu. Orijinal
   upload hedefinin korunduğu bu görüntüden çıkarılmadı. Bağlantı bir kez
   daha değişti; yeni tarayıcı/sekme kimliği taze envanterle bulundu.
4. Mevcut oturumla `/profile` açıldı; doğru hesap ve NEAR Auth giriş metni
   görüldü. Reload sonrası aynı hesap geri geldi; callback query'si yoktu.
5. Gate başlangıcından sonraki filtrelenmiş logda iki session POST 200 ve
   son kontrolde 11 account POST 200 vardı. Profil/reload kontrolü boyunca
   session POST sayısı iki olarak kaldı. Kesintili aralıktaki iki oturum
   yazımının nedeni bu kayıttan ayrıştırılamaz; tek-callback iddiası yoktur.

## Güvenlik ve ekonomik işlem sınırı

Çalışan Web origin/client aynı: `http://localhost:3000` ve ortak testnet
client `np8paqIpMWmNbzT4xAvOOapZBjsOpptl`. Web MPC/ticket/upload bayrakları
`false`. Bridge'in kayıtlı üç bayrağı `false`; önceki kontrolde yerel Bridge
kapalıydı ve bu gate'te başlatılmadı. Sekiz runtime config/kalıcı Bridge
dosyasının gate başlangıcına göre hash'leri değişmedi.

Yükleme sayfasının üç `/api/auth/upload` isteği 422 döndü; başlangıçta UI
ödeme durumunun okunamadığını gösteriyordu. Gönderimler kapalıyken bu uyarı
passkey giriş hatası veya yapılmış bir ödemenin başarısızlığı sayılmaz.
Bilet endpoint isteği yok; ajan ödeme, imza, dosya seçme veya yeni upload
başlatmadı. Tarayıcı verileri, cihaz anahtarları ve bekleyen kayıtlar silinmedi.

## Kanıt ve sonuç

- **PROVIDER / kullanıcı teyidi:** passkey ve aynı sekmede gidip dönüş.
- **Yerel gerçek runtime:** doğru passkey hesabı, doğrulanmış profil,
  reload'da oturumun korunması; yeni session POST olmaması.
- **LOCAL_STATIC:** yalnız bu kayıt ve ana plan değişti; kaynak ve Git index
  korundu. Doküman build/kapsam kontrolü PASS; mevcut 500 kB bundle uyarısı
  sürer. Kaynak testleri yeniden çalıştırılmadı.
- **UNPROVEN:** kesintisiz passkey callback zinciri, upload/watch başlangıç
  hedefinin korunması, tek callback write, tarayıcı bağlantı kesintisinin
  kök nedeni; mobil/Safari/hosted/Production.
- **EXTERNAL_NOT_RUN:** bu kontrol sırasında yeni login/authorize, provider
  ayarı veya iletişim, hesap taşıma, imza, ödeme/upload, runtime restart,
  CI/GitHub/deploy. Kullanıcının tamamladığı giriş yukarıda ayrı belirtilmiştir.

Kanıt dizini: `/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-passkey-redirect-bvvfrv2f/`.
Mevcut passkey profil oturumu açık bırakıldı.

Passkey oturumunu engelleyen bir sorun gözlenmedi. Tam redirect-hedef kabulü
için gözlem eksiği sürer. **Tek sonraki gate:
`NEAR_AUTH_V1_REDIRECT_TARGET_ACCEPTANCE` — başlatılmadı.** Aynı kapalı
gönderim sınırında, başlangıç upload/watch bağlantısından gerçek dönüş tek
kesintisiz girişle ayrıca gözlenecek; bu kontrol yeni giriş yetkisi sayılmaz.
