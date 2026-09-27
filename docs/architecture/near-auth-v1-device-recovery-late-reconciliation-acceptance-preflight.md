# NEAR Auth V1 — gecikmiş uzlaştırma kabul ön kontrolü

Gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_LATE_RECONCILIATION_ACCEPTANCE_PREFLIGHT`.
26 Eylül 2026 — **COMPLETED_WITH_WARNINGS / kabul NO-GO**.

**Yalıtılmış kabul paketi hazırlandı; gerçek eski işlem okuması yeni bir
RPC sınırı gösterdi.** Mevcut primary RPC eski bilet sonucunu 15 saniyede
getiremedi. Aynı hash resmî arşiv endpoint'inden FINAL ve başarılı receipts
ile geldi. Ödeme kayıp değil; kaynakta tarihsel işlem için yedek okuma yolu
yok. Bu sınır giderilmeden kabul tamamlandı denmeyecek.

## Kapsam ve korunma

Yalnız bu rapor ve ana plan değişebilir. Repo kaynağı, runtime/config,
canlı actor, tarayıcı, oturum ve özel anahtarlar değişmez. Servis restart,
provider ayarı, deploy, yeni imza/ödeme/cihaz veya canlı kaydı pending'e
çevirme yok. `youtick-near-auth`, `youtick-payment-flow`, `near-api-js` ve
`youtick-contract-review` yönergeleri izlendi.

Actor'ın WAL olmayan, kopyalama boyunca sabit dosyası yalnız geçici kopya
olarak read-only/immutable SQLite ile açıldı. Integrity **ok**. Önceki
cihaz kabulünden kalan **11 MPC kaydı aynı**, aktif kilit yok; beş operation
zaten terminal. Bu nedenle canlı kayıtta gerçek bir geçiş denenemez.

## Somut kabul paketi

Eski Google hesabı `29445f46…72324c` için iki kayıt seçildi:

| Amaç | Mevcut kayıt | Salt-okunur kanıt |
| --- | --- | --- |
| Bilet | `7ceb0290…37c51`, TICKET_SETTLED | Inner hash `EPabFgmSjHaUF2PfriFUo31qwoSS2JrkFwyQ7nvCDYeS`; yayın `lp-f263096b-8992-4fd8-afc4-7b4c758cfc82` |
| Upload | `fefa14af…a9cd4`, UPLOAD_SETTLED | İş `lp-969b04b0-f205-492d-a6a8-156b18030561`; orijinal signed delegate ve quote bağlı ücretli job |

İki kaydın payload SHA-256 ve Ed25519 imzası, hesabın public key'iyle yerelde
tekrar doğrulandı. Kayıtlar özel anahtar/JWT içermez; Keychain veya tarayıcı
cookie/tokenı okunmadı. near-api-js kurulu/lock sürümleri Web/Bridge **7.3.0**.

Geçici paket şunları içerir:

- `records.json`: yalnız seçilen iki operation'ın kopyası; canlı state'e
  yazma bağlantısı yok. Dosya özel geçici dizindedir.
- `core.cjs`: güncel kaynak aynı mantıkla derlendi; yalnız
  `reconcileTicket` ve `reconcileUpload` dışa açılır. Repo dosyası değişmedi.
  `mpcStatus`/Web oturumu/private binding girişlerinin kabulü değildir.
- `manifest.json`: kaynak, derlenmiş çekirdek, kayıtlar ve runner hash'leri
  sabitlenir. Kaynak değişirse paket yeniden hazırlanmalı.
- `acceptance.mjs`: `check`, `probe`, `acceptance-approved` ayrımı. Asıl
  kabul modunda sadece bellek içi kopya TICKET_SUBMITTED/MPC_VERIFIED
  başlangıcına alınabilir; yalnız kendi operation key'ine terminal state
  yazılabilir. Gerçek sayaç, nonce ve user pointer'a erişim yok.
- Ağ koruması sadece **üç tam istek** kabul eder: seçili ticket hash'i için
  `tx / FINAL`, seçili hesap/yayın için final `has_entitlement`, seçili
  upload için final `get_media_job`. Başka hesap/hash/host, cihaz/access-key
  sorgusu ve bütün gönderim metotları reddedilir; en fazla 12 okuma.
- Bu gate'te uzlaştırma fonksiyonları çağrılmadı. `acceptanceReady:false`
  nedeniyle `acceptance-approved` modu ağ/çekirdek çalışmadan reddedilir.
  Hazırlanmış paket varlığı kabul sonucu sayılmaz.

Bu yöntem ileride gerçek ekonomik kanıtla, **benzetilmiş gecikmiş yerel
başlangıç** üzerinden çekirdek davranışı doğrulayabilir. Gerçekte 30 gün
geçmiş cihaz, canlı pending actor, browser/oturum veya hosted kabul yerine
geçmez. Cihaz okumasını tamamen yasaklayan koruma, ödemenin güncel cihaz
verisine bağımlı olmamasını ayrıca denetler.

## Taze sağlayıcı kontrolü ve engel

26 Eylül 2026 **08:49 UTC** civarında yalnız public kimlik/hash'lerle okuma:

| Okuma | Sonuç |
| --- | --- |
| `test.rpc.fastnear.com` / eski ticket `tx`, `FINAL` | İlk paket probe'u proof_unavailable; ayrı 15 s sınırlı teşhis TimeoutError. Geçerli makbuz elde edilemedi. |
| `archival-rpc.testnet.near.org` / **aynı hash ve sender**, `FINAL` | HTTP 200, FINAL, hash eşleşiyor, receipts başarılı. |
| Primary / aynı ticket `has_entitlement` | HTTP 200, **true**. |
| Primary / aynı upload `get_media_job` | HTTP 200, doğru creator/job, **Published**, generation 1, USDC, **600000**. |

Timeout, işlemin başarısızlığı veya primary'den kalıcı olarak silindiği
kanıtı değildir. Yalnız bu kontrol anında yapılandırılmış süre içinde
okunamadığı doğrulandı. [Resmî RPC listesi](https://docs.near.org/api/rpc/providers)
FastNear testnet public endpoint'ini arşiv erişimi için ücretli, NEAR testnet
arşiv endpoint'ini public ve ciddi hız sınırlı olarak listeliyor. Tek
başarılı arşiv okuması servis garantisi veya yük kapasitesi kanıtı değildir.

`workers/livepeer-bridge/src/mpc-sponsor.ts` içindeki `rpc` sabit primary'ye
ve 15 s timeout'a bağlı; alternatif yok. `reconcileTicket`, tx okunamazsa
aynı TICKET_SUBMITTED kaydını döndürerek doğru biçimde kapalı kalır. Ancak
geçmiş kanıt elde edilemediğinden gecikmiş tamamlanma ilerleyemez. Upload'ın
final job okuması şu anda erişilebilir; iki yolu tek kabul gibi başarılı
saymak doğru olmaz.

Arşiv isteği bu gate'te sadece tanı amacıyla ayrı yapıldı. Uygulamanın
endpoint'i değiştirilmedi; paket fetch'i arşive gizlice yönlendirilmedi.

## Gereken en küçük sonraki kaynak işi

**Tek sonraki gate: `NEAR_AUTH_V1_DEVICE_RECOVERY_ARCHIVAL_RPC_SOURCE`
— başlatılmadı.** Eski transaction sonuçları için sabit, salt-okunur ve
sınırlı arşiv yedeği eklemek; ardından kabul paketini yeni kaynak hash'iyle
hazırlamak.

- `tx` durum okumasında aynı hash/sender/FINAL korunmalı. Primary zaman
  aşımı veya açık RPC erişim hatasında en fazla bir arşiv denemesi;
  süre/gövde boyutu sınırları olmalı. Başarısız veya çelişkili ödeme kanıtı
  başka sağlayıcı aranarak başarıya çevrilmemeli.
- Final işlem/receipt, tam action/amount/event/hak ve upload quote kanıtı
  kontrolleri korunmalı. Her iki okuma da başarısızsa aynı pending kayıt
  kalmalı; yeni onay/broadcast veya sayaç reset'i olmamalı.
- `submit`/broadcast/sign yollarına yedek gönderim eklenmemeli. Giriş,
  Auth0, provider credential veya ücretli servis aboneliği değiştirilmez.
- Mevcut `mpcStatus` outer, ticket inner ve device inner transaction
  okuyucuları aynı dar tarihsel okuma davranışını kullanmalı. Device
  uzlaştırmasının ayrıca geçmiş bloktan yaptığı view okumaları farklı
  bağımlılıktır; yalnız tx yedeğiyle tüm tarihsel state kabulü yapılmış
  sayılmamalı. Bu gate'te o view'lar sorgulanmadı.
- Testler: primary başarılıysa yedek yok; timeout/okunamayan eski hash için
  tek read fallback; yanlış hash/sender/receipt reddi; iki provider
  erişilemezse pending; hiçbir broadcast fallback'i veya canlı kayıt yazımı
  yok. Arşiv endpoint'i kullanıcı girdisinden seçilmemeli.

## Doğrulama ve sonuç

**LOCAL_STATIC / LOCAL_TEST:** iki gerçek kaydın payload/imza doğrulaması,
iki-export sınırı, hash kilitleri, üç izinli istek ve **7 yasak istek
kontrolü PASS**. `check` ağ isteği sayısı **0**. Kabul NO-GO koruması PASS;
uzlaştırma çekirdeği çalıştırılmadı. Kaynak test paketleri değişmediği için
önceki 540 Bridge/1038 Web sonucu bu tur yeniden çalıştırılmadı.

**PROVIDER / salt-okunur:** primary timeout, arşivde başarılı aynı ticket
hash'i; güncel hak ve ücretli upload işi. Tam uçtan uca uzlaştırma kabulü
**UNPROVEN**. Canlı kayıt, kaynak, index ve runtime/config korunması,
doküman build ve iki dosyalık kapsam kontrolü **PASS**. Mevcut doküman
500 kB bundle uyarısı sürer.

Kanıt ve paket:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-late-acceptance-preflight-6fkl7szy/`.
`manifest.json`, `provider-probes-safe.json`, kopya actor/hash kayıtları,
`prepare-packet.mjs`, `core.cjs` ve korumalı runner bu dizindedir.
`acceptance-safe.json` oluşmadı; kabul henüz yürütülmedi.
