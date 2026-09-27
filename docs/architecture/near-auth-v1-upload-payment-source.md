# NEAR Auth V1 — ürün yükleme ödeme kaynağı

Gate: `NEAR_AUTH_V1_UPLOAD_PAYMENT_SOURCE`.
23 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

**Ana uygulamanın Google/passkey yükleme yolu mevcut forma ve özel MPC
sponsoruna bağlandı.** Kullanıcı sponsor cüzdanı seçmez. İmza, ücretli job ve
medya yayını ayrı izlenir; kayıp cevap sonrası aynı işlem okunur. Kaynak
hazırdır, gerçek ödeme/yükleme kabulü değildir. Gönderim varsayılanları kapalıdır.

## Kapsam ve kabul

[Ön kontrol](./near-auth-v1-upload-payment-preflight.md) uygulandı. Değişiklik
Web ürün upload adaptörü/API'si, mevcut uploader'ın toparlanma bağlantısı,
Bridge MPC doğrulaması/durumu, ilgili testler ve bu plan kaydıyla sınırlıdır.
Kontrat/ABI, SDK/bağımlılık, kalıcı env/wrangler/secret, geçmiş kullanıcı
kayıtları, gerçek provider, fonlama/ödeme/upload ve deploy kapsam dışıdır.

Kabul: bağımsız kapalı izinler, ürün kimliği ve exact onay bağlama; eski veya
belirsiz denemede yeni ödeme engeli; protokol 87 legacy delegate sınırı;
restart/reload sonrası aynı operation/imza; yalnız final job/cihaz kanıtıyla
kilit kapanması; wallet/lab/ticket regresyonları. Bunlar aşağıdaki yerel
kanıtlarla doğrulandı. Üretim veya gerçek testnet kabulü iddia edilmez.

## Son davranış

- Ürün oturumu hazır olduktan sonra mevcut form gösterilir. Google/passkey
  yalnız delegate onayını verir; genel wallet işlemi veya sponsor seçimi yok.
  Dosya, başlık, bilet fiyatı ve toplam upload ücreti onayda gösterilir.
- Yeni `/api/auth/upload` yalnız `prepare`, `submit`, `status` kabul eder.
  Origin, ürün cookie/hesap, body boyutu/alanları, review ve Auth0 onayı
  doğrulanır. Lab review veya istemci tarafından seçilen sponsor/hesap yok.
- Web `NEAR_AUTH_V1_UPLOAD_ENABLED` + `NEAR_AUTH_V1_MPC_ENABLED`, Bridge
  `NEAR_AUTH_UPLOAD_ENABLED` + `NEAR_AUTH_MPC_ENABLED` ister. Yeni upload
  bayraklarının eksikliği ret demektir; ticket izni upload yetkisi vermez.
  Bu gate hiçbir gerçek bayrağı açmadı.
- Private Bridge girişinde mevcut relay teklifinin kriptografik imzası
  **MPC bütçesi harcanmadan önce** doğrulanır. Geçerli tutar/şekil veya quote
  hash'i tek başına yetmez. Aynı Bridge'in mevcut teklif anahtarı ve sürümü
  kullanılır; yeni anahtar üretilmez veya Web'e verilmez.
- Web ve Bridge 85/87'yi incelenmiş ticket/legacy upload bağlamında kabul eder.
  Demo bilinçli olarak 85'e bağlı kalır. Ed25519 FullAccess, canonical domain
  bytes, nonce, hedef, tek `ft_transfer_call`, 100 Tgas/1 yocto, outer 300 Tgas
  ve sponsor bütçe sınırları korunur. Bilinmeyen sürüm/gas key reddedilir.
- MPC sonucu `MPC_VERIFIED` olduğunda status kayıtlı payload ve imzadan aynı
  signed delegate'i geri verir. Status ödeme/relay başlatmaz. Açık kullanıcı
  devamı, mevcut upload relay'ini kullanır; ikinci relay sistemi eklenmedi.
- Sonucu bilinmeyen submit için ayrı ürün deneme işareti korunur. Lab deneme
  kayıtları silinmez veya ürün işlemi olarak yeniden gönderilmez. İptal,
  logout, cihaz/hesap değişimi gönderim öncesinde durur; local kayıtta JWT,
  review tokenı veya yeni private key tutulmaz.
- Final NEAR job'ında creator/job, başlık, fiyat, boyut, profil, upload key/
  süre, generation, durum, USDC ücret ve quote hash'i; aynı final blokta
  doğru cihaz/sertifika/yetkilendiren anahtar doğrulanır. Yalnız bundan sonra
  **`UPLOAD_SETTLED`** kaydedilir. Final blok hash'i saklanır. Relay geçici
  kaydının silinmesi veya `tx_hash: null` dönmesi bu kanıtı bozmaz.
- `UPLOAD_SETTLED` hesap ekonomik kilidini bırakır; kayıt ve sponsor rezervi
  silinmez. Ticket hazırlığı da bu terminal durumu tanır. TUS/işleme/yayın
  ayrıca takip edilir; medya hatası yeni ücret doğurmaz.

## Kesinti ve ilk medya isteği

İmza sonrası cevap kaybı ile medya yüklemesi sonrası kesinti aynı durum değildir.
Yeni ürün taslağında `intentAttempted: false` tutulur; ilk provider isteğinden
**önce** true yazılır ve geri false'a çevrilmez. Böylece ödenmiş fakat henüz
medya isteği gönderilmemiş job, kullanıcı aynı dosyayı seçince ilk upload
intent'ini alabilir. Daha önce istek gönderildiyse mevcut resume yolu kullanılır.
Eski taslakta alan yoksa “hiç gönderilmedi” varsayılmaz.

Devam adımı taslak, dosya bilgisi, aynı upload private key ve cihaz kanıtını
korur. Anahtar kayıp/geçersizse yenisini oluşturarak devam etmez. Relay daha
önce denenmişse tekrar çağrılmaz; mevcut job'ın sonucunu kontrol etmek gerekir.
Gönderim ile kayıt/cevap arasındaki belirsiz durum otomatik yeniden ödeme veya
yeni provider asset'i oluşturarak çözülmez.

## Değişen dosyalar

| Alan | Dosyalar |
| --- | --- |
| Ürün API ve istemci | `apps/web/app/api/auth/upload/route.ts` (yeni), `apps/web/lib/near-auth-upload-client.ts` (yeni), `near-auth-mpc-sponsor.ts`, `near-auth-upload-attempt.ts` |
| Ortak mevcut akış | `apps/web/lib/livepeer-upload.ts`, `near-auth-upload-server.ts`, `near-auth-signing-server.ts` |
| UI ve kimlik | `apps/web/components/LivepeerPaidUploadForm.tsx`, `components/providers/WalletProvider.tsx` |
| Ortak terminal durumu | `protocol/paid-media-livepeer-v1/mpc-sponsor.ts`, `apps/web/lib/near-auth-ticket-client.ts`, `apps/web/components/NearAuthTicketPayment.tsx` |
| Bridge | `workers/livepeer-bridge/src/mpc-sponsor.ts`, `workers/livepeer-bridge/src/index.ts` (yalnız private MPC girişinde teklif doğrulaması) |
| Birim testler | `apps/web/__tests__/unit/near-auth-upload-client.test.ts` (yeni), `near-auth-signing-server.test.ts`, `livepeer-upload.test.ts`, `wallet-provider.test.ts`; `workers/livepeer-bridge/src/mpc-sponsor.test.ts` |
| Yerel doğrulama | `apps/web/tsconfig.near-auth.json`, `apps/web/scripts/near-auth-ux-browser-check.mjs`, `workers/livepeer-bridge/scripts/near-auth-ticket-runtime.mjs` (`--upload`) |
| Belgeler | Bu rapor, `near-auth-integration-status.md`, `docs/testing.md` |

Eski lab upload adaptörü değiştirilmedi. Manifest/lock/kurulu sürümler aynı:
near-api-js **7.3.0**, Auth0 SPA **2.26.0**, jose **6.2.12**.
[Resmî NEAR Auth açıklaması](https://docs.auth.near.org/) ve
[nearcore 2.14.0-rc.1 notları](https://github.com/near/nearcore/releases/tag/2.14.0-rc.1)
incelendi; SDK/ağ geçişi yapılmadı. Legacy Delegate ile kaldırılan DelegateV2
ayrımı kaynak ve sentetik test kanıtıdır; gerçek 87 upload kanıtı değildir.

## Kanıt

- **LOCAL_TEST:** tam Web **972 PASS / 50 dosya**; tam Bridge **489 PASS / 3 skip**.
  Yanlış quote/hesap/cihaz/tutar, expired onay, duplicate, kayıp cevap,
  protokol reddi, geçmiş kayıt koruması ve ilk provider isteği sınırı kapsandı.
  Son sınır kontrolü sonrası odaklı uploader paketi **113 PASS**; ilk provider
  isteği öncesinde güncel taslak yeniden okunur ve ikinci ilk-istek reddedilir.
- **LOCAL_TEST:** native Worker upload **13 kontrol PASS**, tek outer gönderim,
  **0 inner gönderim**. Gerçek ürün upload API + kurulu OpenNext bağlamı +
  named Service RPC + SQLite DO kullanıldı. Provider/zincir sentetik;
  bu test upload relay veya Livepeer çalıştırmaz. Geçersiz teklif imzası
  harcamadan önce reddedildi; restart ve flag-off status, imza geri alma,
  yanlış job reddi ve terminal durum kalıcılığı geçti.
- **LOCAL_TEST:** native ticket regresyonu **12 kontrol PASS**, 1 outer/1 inner.
- **LOCAL_TEST:** izole Brave **29 senaryo PASS**. Ürün normal yükleme ve
  kayıp submit cevabı → reload → açık devam → aynı dosya → yayın yollarında
  1 Google/passkey çağrısı, 1 ürün submit, 1 relay, 1 TUS PATCH; sponsor cüzdanı
  çağrısı 0. Provider/relay/TUS cevapları mock; gerçek Google/passkey ayrımı,
  canlı medya veya ses/görüntü kabulü değildir.
- **LOCAL_STATIC:** auth strict tip, tüm Web tip, Bridge tip ve Web lint PASS.
  UI/OpenNext route'u mevcut proje tip ayarıyla kontrol edildi; strict helper
  listesine yalnız yeni istemci eklendi. Üçüncü taraf declaration sorunları
  için SDK yükseltmesi veya `skipLibCheck` gevşetmesi yapılmadı.
- **LOCAL_STATIC:** ayrı kaynak kopyasında Web build **flag off/on PASS**;
  `/api/auth/upload` iki durumda da derlendi. Gerçek `.next` ve env dosyaları
  kullanılmadı/değişmedi. İlk kopyadaki eksik hooks/middleware dosyaları
  kopyaya tamamlandı; uygulama için ek bir düzeltme gerekmedi.
- **LOCAL_STATIC:** doküman build PASS; mevcut 500 kB bundle uyarısı sürer.
  Git diff whitespace kontrolü PASS. Başlangıç dosya hash'leriyle yalnız
  yukarıdaki kapsamın değiştiği doğrulandı; dosya silinmedi ve index'e ekleme yok.

Yerel kanıtlar: `tmp/near-auth-payment-runtime-uGKr6g/result.json` (upload),
`tmp/near-auth-payment-runtime-bDq6HX/result.json` (ticket),
`tmp/near-auth-ux-run-Kb1ctB/result.json` (tarayıcı).
Bu koşulardan sonra runner çıktı adı ticket/upload ayrımına uyarlandı;
gelecek koşular `tmp/near-auth-ticket-runtime-*` / `tmp/near-auth-upload-runtime-*` kullanır.
Başlangıç kaynak özetleri ve izole derleme kopyası:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-upload-source-8qv9kpj1/`.

## Kalan sınırlar ve tek sonraki gate

**EXTERNAL_NOT_RUN:** gerçek Google/passkey upload, fonlama/NEAR/USDC,
Livepeer upload/yayın/oynatma, provider/config işlemi, CI/Preview/Production,
commit/push ve deploy. Çalışan yerel uygulama ve kullanıcı tarayıcısı korunur.

**UNPROVEN:** gerçek protokol 87 ücretli upload ve gideri; hosted binding/env,
quote anahtarı yetkisi, yeni kullanıcı fonlama/onboarding ve kart hedefi.
Mevcut yerel ticket MPC kurulumu upload için hazır varsayılmaz: private MPC
örneğinin aynı upload quote yetkisini doğrulayabilmesi, hesap/bakiye, provider
hazırlığı, exact dosya/ücret ve ayrı harcama tavanı önce kontrol edilmelidir.

Belirsiz outer kayıt veya kayıp upload key otomatik onarılmadı. Eski taslakta
provider isteği bilgisi yoksa veya gönderim belirsizse güvenli duruş sürer.
256 kayıt/DO sınırı, sponsor key epoch taşıması ve uzun süreli recovery ayrı
kısıtlardır. Bunlar bu gate'te canlı onarım veya otomatik tekrar yetkisi değildir.

Kaynak gate'ini durduran blocker yok; gerçek kabul için yukarıdaki hazırlık
ve kullanıcı onayı gerekir. **Tek sonraki gate:
`NEAR_AUTH_V1_UPLOAD_PAYMENT_ACCEPTANCE_PREFLIGHT` — başlatılmadı.**
