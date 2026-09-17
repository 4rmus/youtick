# Google hesabına test USDC hazırlığı

> Bu belge kaynak gate'inin tarihsel sonucudur. Sonraki salt-okunur kontrol
> aynı Google hesabında 0,60 test USDC bulunduğunu gösterdi; aşağıdaki fonlama
> adımı güncel tekrar ödeme talimatı değildir. Güncel değerlendirme:
> [entegrasyon durumu](./near-auth-integration-status.md).

Gate: `NEAR_AUTH_USDC_FUNDING_SOURCE` — **COMPLETED_WITH_WARNINGS / kapalı**.
16 Eylül 2026. Yerel kod, testler ve başlangıç UI kontrolü tamamlandı.
Gerçek kayıt, token aktarımı, imza veya upload yapılmadı.

## Amaç, kapsam ve değişen dosyalar

Kullanıcının kabul ettiği akış: seçilen testnet cüzdanından, doğrulanmış Google
hesabına tam **0,60 test USDC** aktarımını hazırlamak; gerekiyorsa USDC
kaydını aynı cüzdan işleminin ilk eylemi yapmak. İmzaları kullanıcı verir.

- `apps/web/lib/near-auth-usdc-server.ts` — kayıt/bakiye/ücret kontrolü,
  şifreli inceleme, yeniden doğrulama ve kesinleşmiş transfer kontrolü.
- `apps/web/lib/near-auth-usdc.ts` — mevcut sabitlenmiş testnet cüzdanıyla
  tek gönderim, kalıcı tekrar koruması ve doğrulama isteği.
- `apps/web/components/NearAuthUsdcFunding.tsx` — elle başlatılan inceleme,
  açık tutarlar, onay kutusu ve cüzdan onay düğmesi.
- `apps/web/components/NearAuthUpload.tsx` — yeni bölüm mevcut formun sonuna
  eklendi; video seçimi ve taslak oluşturma davranışı değiştirilmedi.
- `apps/web/app/api/auth-lab/signing/route.ts` — mevcut korumalı API'ye
  `prepare-usdc`, `authorize-usdc`, `verify-usdc` eylemleri eklendi.
- `apps/web/__tests__/unit/near-auth-usdc-server.test.ts`
- `apps/web/__tests__/unit/near-auth-usdc-client.test.ts`
- Bu rapor; kanıtlar `tmp/near-auth-usdc-funding/evidence/` altında.

Kontratlar, Bridge, paketler, ana WalletProvider, eski fonlama/imza kilitleri,
cihaz anahtarları ve mevcut video taslağı değiştirilmedi. Canlı config,
commit/push/PR/CI/deploy yapılmadı. Tek yazan katılımcı ana agent'tı.

## Davranış ve sınırlar

1. Ekran kendiliğinden cüzdan seçmez veya işlem göndermez. Kullanıcı
   **Gönderen cüzdanı seç ve bakiyeyi kontrol et** düğmesini kullanır.
2. Hedef hesap istemciden alınmaz. Mevcut HttpOnly Google oturumundan türetilen
   implicit hesap ve FullAccess anahtarı kullanılır. Gönderen ayrı ve açıkça
   gösterilir; eski sponsor bağlantısı otomatik fonlama izni sayılmaz.
3. Aynı kesinleşmiş blokta Google anahtarı, token metadata/kayıt/bakiyeleri,
   storage minimumu ve gönderenin NEAR bakiyesi okunur. Yalnız mevcut sabit
   testnet USDC kontratı kabul edilir; altı ondalık doğrulanır.
4. Kayıt zaten varsa `storage_deposit` eklenmez. Kayıt ve en az 0,60 USDC
   zaten varsa işlem hazırlanmaz. Bakiye daha azsa fark yerine kullanıcıya
   açıkça gösterilen sabit **0,60 USDC** aktarılır.
5. Eksik kayıt için `storage_deposit({account_id, registration_only:true})`,
   ardından `ft_transfer({receiver_id, amount:"600000", memo})`. İkisi aynı
   token kontratına tek cüzdan isteğindedir. `ft_transfer_call`, Market satın
   alma, yeni medya işi veya Google/MPC imzası bu hazırlığın parçası değildir.
6. Her çağrı 30 TGas; transfer deposit'i 1 yoctoNEAR. Storage deposit'i
   zincirdeki minimumdur ve **0,002 test NEAR** üst sınırını aşamaz.
   Gönderenin kayıt + ağ gideri için toplam sınır **0,08 test NEAR**.
   Protokol 85 ve mevcut gas satın alma fiyatı tavanı dışında hazırlık durur.
   Gönderenin kendi hesap depolama rezervi de bakiyeden düşülür.
7. Bu rakam kesin son ücret veya protokol tarafından imzalanmış maxFee
   garantisi değildir; hazırlık için muhafazakâr ret sınırıdır. İmzadan önce
   cüzdandaki tutar da kontrol edilir; yüksekse kullanıcı reddetmelidir.
   Sonraki upload/MPC sponsor bütçesi bundan ayrıdır.
8. İnceleme subject ve origin'e bağlı JWE içinde beş dakika geçerlidir.
   Onaydan hemen önce aynı kimlik yeniden türetilir; kayıt, bakiye ve fiyat
   tekrar okunur. Hedef, anahtar, gönderen, token, kayıt deposit'i veya hedefin
   mevcut bakiyesi değişmişse eski incelemeyle gönderilmez.
9. Cüzdan hesabı ve server'ın döndürdüğü eylemler incelenen değerlerle
   karşılaştırılır. Cüzdan isteğinden önce kalıcı tek-deneme kaydı yazılır.
   Çift tıklama/diğer sekme Web Lock ile engellenir. Timeout, iptal veya
   belirsiz cevap sonrasında ikinci transfer başlatılmaz.
10. Başarı için FINAL sonuç, tam gönderen/alıcı/eylemler, başarılı receipt'ler,
    gider sınırı ve doğru token kontratından tam 600000 transfer olayı gerekir.
    Ayrıca güncel Google kaydı ve en az 600000 bakiye doğrulanır.

Kilit tarayıcı profili ve Google hesabı başına tek denemeyle sınırlıdır;
dağıtık tekilleştirme veya genel cüzdan değildir. İnceleme/token yalnız
bellektedir. Yenileme sonrası yalnız durum/hash kaydı kalır; otomatik
transfer tekrarı yoktur. **Bakiyeyi tekrar kontrol et** salt okunur çalışır.
Yeterli bakiye başka yoldan oluşmuşsa bu gösterilebilir; eski işlemin
ayrıntıları doğrulanmadan o işleme başarı atfedilmez.

Standart dayanakları: [NEP-145 storage yönetimi](https://github.com/near/NEPs/blob/master/neps/nep-0145.md),
[NEP-141 transfer](https://github.com/near/NEPs/blob/master/neps/nep-0141.md),
[NEP-300 token olayları](https://github.com/near/NEPs/blob/master/neps/nep-0300.md).
Storage minimumu sabit bir standart ücreti olarak varsayılmadı; her hazırlıkta
sözleşmeden okunur. Canlı kontratın tam işlem sonucu manuel kabulde sınanacak.

## Kanıt

- `LOCAL_TEST`: **45 dosya / 674 test PASS**; yeni iki dosyada **41 test**.
  Gerçek JWE/oturum doğrulaması kullanılır; RPC/cüzdan sonuçları sentetiktir.
  Yanlış hedef/hesap, kayıt değişimi, ücret tavanı, yetersiz bakiye,
  hazır hesapta tekrar transfer, belirsiz cevap, yanlış/eksik transfer olayı,
  başarısız receipt, kesinleşmemiş sonuç ve kalıcı tekrar kilidi sınandı.
- `LOCAL_STATIC`: lint, sıkı auth tip kontrolü ve Web build PASS. Mevcut
  middleware adlandırma uyarısı sürüyor; gerçek deploy/Edge kabulü değildir.
- `LOCAL_TEST`: production modunda lab flag açıkken üç yeni eylem de
  **404**, Set-Cookie yok. Anonim 401, çapraz origin 403 ve istemcinin
  ek hedef/tutar alanlarının 400 ile reddi unit testte doğrulandı.
- `LOCAL_TEST` / yerel Brave UI: yeni **Test bakiyesini hazırla** bölümü ve
  başlangıç düğmesi görüldü. Cüzdan seçimi veya onay düğmesine basılmadı.
  Aynı video dosyası, `social login test video` başlığı, 2 USDC bilet fiyatı
  ve `lp-85827ca5-1d4a-4ce5-9dc4-814cac141d1d` taslağı ekranda korundu.
- `EXTERNAL_NOT_RUN`: gerçek sender seçimiyle yeni inceleme, cüzdan popup'ı,
  storage deposit, USDC aktarımı, yeni ödeme/yükleme, CI/deploy.

## Tek sonraki gate

`NEAR_AUTH_USDC_FUNDING_ACCEPTANCE`: kullanıcı yeni bölümde göndereni seçer,
tam Google hedefini, 0,60 test USDC tutarını ve 0,08 test NEAR gider sınırını
kontrol eder; onay kutusu ve cüzdan imzasını kendisi verir. Agent imzalamaz.
Sonuç aynı hash üzerinden kontrol edilir; bilinmeyen cevapta yeniden gönderim
yoktur. Fonlama doğrulanınca aynı video taslağının ödeme seçenekleri yeniden
okunabilir. Bu kaynak gate'i upload'u veya sonraki ücretli işi başlatmadı.

Kaynakta blocker yok; canlı fonlama ve yükleme henüz kanıtlanmadı.
