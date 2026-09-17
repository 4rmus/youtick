# Google upload — yerel güvenlik gate'i

> Gate 2 kapanışının tarihsel kaydıdır. Sonraki gate'lerin güncel durumu:
> [entegrasyon durumu](./near-auth-integration-status.md).

Gate: `NEAR_AUTH_UPLOAD_SAFETY`. Tarih: 16 Eylül 2026.
Sonuç: **COMPLETED_WITH_WARNINGS**. Yerel kaynak/test kabulü tamamlandı;
sağlayıcı prompt düzeltmesi ve canlı upload/playback kabulü **UNPROVEN**.
Güncel gate sırası: [entegrasyon durumu](./near-auth-integration-status.md).

## Değişiklik

- `verifyApproval` yalnız doğrulanmış token ve onun milisaniye cinsinden son
  geçerlilik zamanını döndürür. Diğer imza çağrıları aynı tokenı kullanır.
- Mevcut `authorize-upload` yanıtına `approvalExpiresAtMs` eklendi. Zincir
  kontrollerinin sonunda token ve inceleme/teklif süresi yeniden denetlenir.
  İstemci sponsor hesabı/cihaz kontrollerinden sonra süreyi tekrar denetler;
  metadata'yı cüzdanın işlem nesnesine aktarmaz.
- Sponsor çağrısından önce deneme kaydı hesap, sponsor, job ve delegate SHA-256
  özetini içerir; cevap geldiğinde outer hash eklenir. JWT, inceleme bileti ve
  özel anahtar kopyası bu kayda yazılmaz.
- Durumlar `outer_pending`, `outer_submitted`, `mpc_verified` olarak ayrılır.
  Son durum yalnız MPC imzasının doğrulandığını gösterir; relay hazırlığı veya
  upload ödemesi kabulü değildir. Mevcut uploader imzayı ayrıca kaydeder.
- Sponsor cevabından sonraki süre aşımı/belirsizlik ayrı mesajla gösterilir.
  Kilit korunur; tekrar Google onayı, sponsor ödemesi veya relay başlatılmaz.
  JWT'nin zaman kontrolü gevşetilmedi ve geçmiş saatle doğrulama eklenmedi.
- Google upload formunda sahibi ve seçilen sponsor birlikte gösterilir.
  NEAR fonlama paneli mevcut ortak meşguliyet kilidini kullanır; başka işlem
  sırasında açılmaz, hata veya tamamlanmada kilidi bırakır.
- `allowUploadKeyReplacement` formdan mevcut resume fonksiyonuna aktarılır.
  Normal cüzdanın varsayılan davranışı korunur; Google lab'de `false` olur.
  Mevcut ücretli işte anahtar yoksa, eşleşmiyorsa veya süresi geçmişse yeni
  anahtar üretilmeden ve upload kayıtları değiştirilmeden durulur. Geçerli
  olmayan veya süresi geçmiş yerel upload kaydı da inceleme için korunur.
  Geçerli
  anahtar olsa bile mevcut V3 cihaz yetkisi doğrulanmadan devam edilmez.
  Ödenmemiş ilk taslağın başlangıç anahtarı oluşturma yolu değişmedi.

## Belirsiz işlemde salt-okunur operatör kontrolü

Bu bir otomatik kurtarma endpoint'i değildir. Yeni imza/ödeme göndermeden:

1. Aynı taslağı ve tarayıcı depolarını koru. Yalnız
   `youtick:auth-lab:upload:testnet:<market>:<account>:<job>` kaydındaki hesap,
   sponsor, job, state, `delegateSha256` ve varsa `outerHash` bilgisini incele.
   Diğer storage anahtarlarını, JWT'yi veya cüzdan özel anahtarını dışa aktarma.
2. Hash varsa NEAR RPC `tx` okumasını o hash ve sponsorla `wait_until: FINAL`
   kullanarak yap. Gönderen, `fast-auth.testnet` alıcısı, tek `sign` çağrısı,
   payload özeti, receipt durumları ve giderleri karşılaştır. Hash yoksa mevcut
   sponsor cüzdan geçmişinden ilgili işlemi bul; bulunamadı diye yeniden imzalama.
   Zincirdeki ham imza çağrısı token içerebilir; ham yanıtı loglama/paylaşma.
3. Aynı job için `get_media_job` ve varsa publication kaydını oku. Bir sponsor
   işleminin başarılı olması USDC upload ödemesinin gerçekleştiğini göstermez.
4. Eşleşen ücretli iş oluşmuşsa mevcut resume yolu yalnız aynı dosya, eşleşen
   geçerli upload anahtarı ve doğrulanmış mevcut V3 cihazla kullanılabilir.
   Anahtar eksikse Google pilotu anahtar değiştirmez. Yalnız MPC tamamlanmışsa,
   işlem bilinmiyorsa veya yetkiler geçmişse sonucu kaydet ve dur.

Public-testnet'in saklanan delegate'i yeniden göndermeme kuralı korunur. Yeni
quote, yeni job, kilit silme, eski delegate'i gönderme veya tekrar ödeme bu
kontrolün parçası değildir. Tam relay kurtarma ayrı bir tasarım/gate gerektirir.

## Doğrulama

**LOCAL_TEST:** 46 dosyada **710 test PASS**. Yeni kontroller önce eski kodda
7 başarısız testle açığı gösterdi. Nihai koşuda bütün Web testleri geçti.

- Tokenın veya 120 saniyelik incelemenin zincir sorguları sırasında bitmesi.
- Eksik/geçersiz expiry metadata'sı; sponsor hesabı beklenirken token/inceleme
  süresinin bitmesi; sponsor çağrısına metadata sızmaması.
- 60 saniyelik gerçek RSA onayı ve Ed25519 imzası; başarılı sentetik MPC
  sonucunda bile expired JWT'nin hâlâ reddedilmesi.
- Çift tıklama/ikinci sekme, belirsiz sponsor cevabı, completion hatası,
  expiry ve cihaz iptalinde ikinci imzanın engellenmesi; kayıtların korunması.
- Kayıp, farklı veya süresi geçmiş upload anahtarında ve bozuk yerel kayıtta kayıtların korunması;
  geçerli anahtar+cihazla resume; cihaz eksikse durma; normal cüzdanın mevcut
  anahtar yenileme regresyonlarının geçmesi.
- Fonlama seçimi sürerken ortak meşguliyet; iptal/hata sonrası kilidin
  bırakılması; başka işlem meşgulken fonlama penceresinin açılmaması.

**LOCAL_STATIC:** `npm run test:near-auth-types`, lint ve Web build PASS.
Build, ayrı kaynak kopyasında sentetik testnet kontrat ayarları ve kapalı lab
ile çalıştı; çalışan yerel sunucunun `.next` çıktısı değiştirilmedi.
Vite config ve middleware adlandırması uyarıları var. İlk izole derlemede
Edge Runtime için MessageChannel / process.cwd uyarıları da görüldü; son
artımlı derlemede tekrar basılmadı. Bu sonuç gerçek Edge/Cloudflare kabulü değildir.

Komutlar [testing.md](../testing.md) içinden seçildi. Testler sahte ağ/cüzdan
yanıtları kullanır; gerçek giriş/imza/ödeme yapılmadı. Kanıt kaydı:
`tmp/near-auth-upload-safety-gate2/evidence/result.json`.

## Dosya kapsamı ve sınır

Kaynak değişiklikleri:

- `apps/web/lib/near-auth-signing-server.ts`
- `apps/web/lib/near-auth-upload-server.ts`
- `apps/web/lib/near-auth-upload-wallet.ts`
- `apps/web/lib/livepeer-upload.ts`
- `apps/web/components/LivepeerPaidUploadForm.tsx`
- `apps/web/components/NearAuthUpload.tsx`
- `apps/web/components/NearAuthFunding.tsx`
- `apps/web/components/NearAuthLab.tsx`

Test değişiklikleri `near-auth-signing-server`, `near-auth-upload-wallet`,
`near-auth-funding`, `livepeer-upload`, `livepeer-upload-status` unit dosyalarıyla
sınırlıdır. Bu rapor ve güncel entegrasyon durumu da güncellendi.
Yeni endpoint veya uygulama bağımlılığı eklenmedi; eski kullanıcı değişiklikleri
korundu. Bu gate sürerken oluşan değişiklikler önceki dirty kaynak işlerinden
ayrı değerlendirilmelidir.

**EXTERNAL_NOT_RUN:** yeni Google/sponsor onayı, NEAR/USDC ödemesi, upload,
playback, provider ayarı, CI, deploy, commit/push/PR. Sağlayıcının prompt hatası
bu yerel değişikliklerle düzelmiş sayılmaz.

**Tek sonraki gate:** Gate 3 — Google hesabıyla mevcut V2 oynatıcı. Başlatılmadı.
