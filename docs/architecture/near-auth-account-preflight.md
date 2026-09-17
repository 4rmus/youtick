# NEAR Auth hesap ön kontrolü

Gate: `NEAR_AUTH_ACCOUNT_BINDING_PREFLIGHT` — **PASS / kapalı**.
Gerçek Google oturumuyla salt okunur kontrol tamamlandı; kontrol edilen adreslerde FullAccess hesap eşleşmesi yok. Bu sonuç hesabın küresel olarak hiç bulunmadığı iddiası değildir.

## Amaç ve sınır

Doğrulanmış Google oturumundan NEAR açık anahtarını türetmek ve bu anahtarı
FullAccess olarak içeren hesapları salt okunur biçimde kontrol etmek.
Bu adım bir hesabı uygulamaya bağlamaz ve işlem imzalayabildiğini kanıtlamaz.

Değiştirilen yollar:

- `apps/web/lib/near-auth-lab-session.ts`: mevcut şifreli oturum okuması iki API için ortaklaştırıldı.
- `apps/web/app/api/auth-lab/session/route.ts`: aynı oturum doğrulamasını kullanır.
- `apps/web/lib/near-auth-account-preflight.ts`: sınırlı testnet sorguları.
- `apps/web/app/api/auth-lab/account/route.ts`: yalnız mevcut oturuma dayanan kontrol.
- `apps/web/components/NearAuthLab.tsx`: kullanıcının başlattığı hesap kontrolü ve sonuç.
- `apps/web/__tests__/unit/near-auth-account.test.ts`: güven sınırları ve hesap eşleştirme testleri.
- `apps/web/tsconfig.near-auth.json`: yeni API için sıkı tip kontrolü.
- Bu rapor.

Önceki gate'lerin kirli dosyaları korunur. WalletProvider, ödeme, medya,
kontratlar, Bridge, D1, provider ayarları ve paket sürümleri değiştirilmez.
Commit, push, deploy, hesap oluşturma, fonlama ve işlem imzalama bu gate'te yoktur.

## Yöntem ve kabul ölçütleri

1. Development + açık lab flag + testnet + loopback host + aynı origin şartları.
2. Hesap kontrolü otomatik çalışmaz. Kullanıcı bilgilendirmeyi görüp düğmeye basar.
3. POST gövdesi boş olmalıdır. Kullanıcıdan hesap, subject, token veya anahtar kabul edilmez.
4. Mevcut HttpOnly oturumun şifresi ve süre/issuer/audience/client denetimleri doğrulanır.
5. Son kesinleşmiş blokta `fast-auth.testnet` paused=false,
   MPC=`v1.signer-prod.testnet`, domain=1 kontrol edilir.
6. Aynı blokta MPC `derived_public_key` çağrılır. Yol:
   `jwt#https://login.testnet.fast-auth.com/#<verified-subject>`;
   predecessor=`fast-auth.testnet`, domain=1. Sonuç gerçek v7 PublicKey ile okunur.
7. FastNear testnet FullAccess indeksi en fazla beş aday verir. Anahtarın 64 haneli
   implicit adresi de adaydır; bu adres tek başına hesabın var olduğunu göstermez.
8. Tüm adayların aynı blokta `view_access_key` sonucu kontrol edilir.
   Yalnız FullAccess eşleşmeleri gösterilir. Birden fazla eşleşmede seçim yapılmaz.
9. Eksik hesap/anahtar ile servis hatası ayrılır. İndeks boşsa dünyada hiçbir
   hesap yok denmez. Yapılandırma/blok/servis/yanıt hatasında eşleşme verilmez.
10. Tüm dış sorguların toplam süresi 20 saniye ile sınırlıdır. Yanıtlar no-store'dur.

Kimlik referansı MPC view çağrısının içinde NEAR RPC işletmecisine gider;
bu referans gizli/anonim kabul edilmez. FastNear'a yalnız açık anahtar gider.
E-posta, ID tokenı, oturum çerezi bu servislere gönderilmez. View çağrısı
işlem yayınlamaz. İmza akışının kimlik verisi etkileri ayrı değerlendirilmelidir.
Sunucu hata yanıtları provider gövdesi veya kullanıcı kimliğini yansıtmaz.

## Kanıt — 16 Eylül 2026

- `LOCAL_TEST`: 37 dosyada 479 test geçti (hesap kontrolünde 21 test).
  Gerçek jose şifreleme/oturum doğrulaması ve gerçek v7 anahtar ayrıştırması;
  dış hesap cevapları testlerde sahtedir.
- `LOCAL_STATIC`: sıkı tip kontrolü, lint ve üretim derlemesi geçti.
- `LOCAL_TEST`: yerel production sunucusunda flag açık olsa da sayfa GET,
  oturum GET/POST/DELETE ve hesap POST uçları 404 döndü; çerez üretilmedi.
  Development sunucusunda oturumsuz boş POST 401 döndü.
  Next boş gövdeyi stream olarak sunduğu için ilk 400 yanıtı düzeltildi
  ve boş stream regresyon testi eklendi. Bu yerel production-mode testidir,
  canlı production kanıtı değildir.
- `PROVIDER`: gerçek testnet sözleşme yapılandırması okundu. Sentetik kimlikle
  gerçek MPC + FastNear + NEAR anahtar sorgusu tamamlandı; eşleşme bulunmadı.
  Bu sentetik sonuç gerçek Google hesabı kanıtı değildir.
- `PROVIDER` + yerel Brave UI: gerçek Google oturumu korundu; hesap kontrolü
  düzeltmeden sonra HTTP 200 döndü (13.6 saniye). Ekranda kontrol edilen adreslerde
  bu anahtara bağlı hesap doğrulanamadığı görüldü. E-posta/subject/token/çerez
  ve gerçek açık anahtar/adres kanıt dosyalarına kaydedilmedi.
- `UNPROVEN`: MPC imza yeteneği, kullanılabilir bir NEAR hesabı ve medya akışları.
- `EXTERNAL_NOT_RUN`: imza, fonlama, hesap oluşturma, cihaz kaydı, satın alma,
  upload/playback, CI ve deploy.

Yerel kanıtlar: `tmp/near-auth-account-preflight/evidence/`.
Gerçek kullanıcı subject/token/çerezleri kanıt dosyalarına yazılmaz.
İlk derleme denemesinde gerekli public contract ortam değişkenleri eksikti;
yerel testnet placeholder ayarlarıyla tekrar derlendi. Canlı yapılandırma değişmedi.

## Resmî dayanaklar

- [NEAR Auth Browser SDK](https://docs.auth.near.org/sdks/browser-sdk):
  getPublicKey view yöntemi, Ed25519 domain=1; createAccount yalnız action üretir.
- [Sabitlenmiş SDK kaynağı](https://github.com/Peersyst/fast-auth/blob/38dc894afbc94c198c207f52e6d01d695199eaa1/packages/sdks/browser/src/signers/signer.ts).
- [Sabitlenmiş FastAuth sözleşmesi](https://github.com/Peersyst/fast-auth/blob/38dc894afbc94c198c207f52e6d01d695199eaa1/contracts/fa/src/lib.rs):
  guard ve subject birleşiminden imza yolu; kaynağın incelenmesi deployed bytecode eşitliği kanıtı değildir.
- [FastNear API](https://github.com/fastnear/fastnear-api-server-rs):
  testnet public-key FullAccess hesap keşfi. Ekonomik otorite olarak kullanılmaz.

## Gerçek oturumda bulunan hata ve düzeltme

İlk gerçek kontrolde HTTP 503 ve `invalid_permission` oluştu. Sabit, kişisel veri
barındırmayan tanı kodlarıyla yanıtın `result.error` alanını içerdiği belirlendi.
Aynı durum sentetik hesap/anahtar sorgusunda bağımsız olarak yeniden üretildi.
Bazı RPC yanıtları eksik anahtarı üst düzey `error.cause.name` yerine şu eski
biçimde bildiriyor: `result.error = "access key <requested-key> does not exist while viewing"`.

Ortak RPC okuyucusu yalnız sorgulanan anahtarla birebir eşleşen bu yanıtı
"eşleşme yok" olarak kabul eder. Yanıtın blok bilgisi kontrol edilir; farklı
anahtar, farklı blok veya başka gömülü hata hâlâ reddedilir. Dört regresyon
senaryosu eklendi. Geçici tanı logları kaldırıldı. Bu hata düzeltmesinde değişen
kaynaklar yalnız `lib/near-auth-account-preflight.ts`,
`__tests__/unit/near-auth-account.test.ts` ve bu rapordur.

## Tek sonraki gate

`NEAR_AUTH_ACCOUNT_PROVISIONING_PLAN`: bu kimlik için test hesabının nasıl
oluşturulacağını ve gerekli test bakiyesini belirlemek. Hesap oluşturma/fonlama
bu gate'te yapılmadı. Kullanılabilir hesap doğrulanmadan imza, izleme veya
upload kabul testine geçilmez. Sonraki gate otomatik açılmadı.
