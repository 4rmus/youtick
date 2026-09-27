# YouTick V1 — pilot yayın ön kontrolü

27 Eylül 2026 · Gate: `YOUTICK_V1_PILOT_RELEASE_PREFLIGHT`
**Ön kontrol tamamlandı; yayın kararı: NO-GO / BLOCKED.**

## Amaç ve sınır

Yerel cüzdan V1 adayının korumalı testnet yayın yoluna uygunluğunu ölçmek.
Değiştirilebilir tek dosya bu rapordur; mevcut 339 aday dosyası, kaynak checkout,
Git, ayarlar/env/secret, çalışan hizmetler, tarayıcı ve kullanıcı kayıtları yasaktır.
Kabul: kesin kaynak/CI/konfigürasyon gereklilikleri, güncel sınırlı servis/kontrat okumaları,
koşullu kontrat ihtiyacı ve açık engeller. Bu gate yayın/işlem onayı değildir.

Aday: `1169120503081a2ab1ab6b715afd70df49aae634`, dal `codex/youtick-ver-1`,
dizin `/Users/arair/works/youtick-ver-1`. `origin` yalnız yerel
`/Users/arair/works/youtick-lp-main` dizinine işaret eder.
GitHub main: `6739ec743850afe08b6bc1cade18091c71c723d4`; aday GitHub commit sorgusunda
`HTTP 422 / No commit found`. Yerel kayıt uzak entegrasyon değildir.
Yerel geçmiş karşılaştırması main tarafında 2, aday tarafında 1 ayrı commit gösteriyor.
Adayın doğrudan ağacı main'deki auth-lab route/lib ve Auth0/jose bağımlılıklarını içermez;
f711 tabanına hiç eklenmemişlerdi. Kör merge/cherry-pick bunları main'de bırakabilir.
Sonraki uzak entegrasyon hedef son ağacı açıkça incelemeli, cüzdan-only kapsamı doğrulamalı ve
ayrı kaydedilmiş sosyal giriş çalışmasını korumalı; bu gate birleştirme/push yapmadı.

## Yayın kararı matrisi

| Alan | Kanıt sınıfı ve sonuç | Karar |
|---|---|---|
| Yerel aday | Önceki tarihli yerel kod/test/build/ABI sonuçları korunuyor | Hazırlık PASS; yayın kanıtı değil |
| GitHub kaynak | Aday uzak repoda yok; main 6739ec7 | NO-GO: entegrasyon ve açık push/PR/merge onayı eksik |
| Aday CI/artifact | Aday için exact-SHA main/push CI ve yayıma bağlı artifact yok | NO-GO |
| CodeQL | 22 Eylül 35705557607 JS/Rust Analyze “code scanning not enabled” mesajıyla başarısız; bugün çözülüp çözülmediği UNPROVEN | Yeni adayın zorunlu CI'sı ve owner doğrulaması gerekir; bulunan açık sonucu değildir |
| Koruma | Main korumalı; public-testnet required reviewer 1 ve protected-branch policy var | Mekanizma var; bu aday için yayın onayı yok |
| Güncel release config | Aday doğrulayıcısı gerçek config'i bellekte reddetti: public_testnet_origins_invalid | NO-GO: yerel kaynak/konfigürasyon uyumu |
| Çalışan servisler | Üç sınırlı GET başarılı; mevcut Bridge/read-model ENABLED | Mevcut runtime korunmalı; aday yayında değil |
| Compact/kontrat | Compact=1, source yöntemleri ve güncel dar policy/state okumaları uyumlu | Sınırlı uyum PASS; tüm deployed ABI ve uçtan uca kabul değil |
| Eski code-update policy | BwX8…/376382 ile güncel 9Fv… uyuşmuyor; maintenance beklentileri de güncel açık durumla uyuşmuyor | Yalnız kontrat güncelleme yolunda NO-GO; otomatik redeploy gerekçesi değil |
| Gizlilik | Amaç/dayanak, provider/retention/transfer/hak bilgileri hâlâ açık | Kamuya açık pilotta veri toplamadan önce tamamlanmalı |
| Bütçe ve yetkiler | Bu gate bakiye/access-key/secret/hesap kayıtlarını okumadı | Sponsor/ağ/Livepeer bütçesi ve anahtar yetkisi UNPROVEN |
| Gerçek kullanıcı kabulü | Adayla cüzdan ödeme→entitlement→oynatma/yükleme denenmedi | UNPROVEN; ayrı onaylı kapsam gerekir |

## Kesin workflow gereklilikleri — LOCAL_STATIC

`.github/workflows/deploy-public-testnet.yml` workflow'u main üzerinden başlatılır.
Seçilen 40 karakter SHA için aynı repo `.github/workflows/ci.yml` **push/main** koşusu,
tamamlanmış başarılı durum ve exact `head_sha` gerekir.
`compare SHA...main` kontrolü `ahead|identical` kabul eder: SHA main'in atası da olabilir;
burada “exact kaynak” aynı HEAD olmak zorunda değildir, fakat CI seçilen SHA'ya tam bağlıdır.
Branch/PR CI veya eski 6739 başarısı yeni adayı karşılamaz.

Paket closed temel config'ten üretilir; mode yalnız `closed`, `acceptance` veya `drain`.
Web/Bridge aynı testnet ve Market/Access kimliğini kullanmalı; bağımsız public-testnet worker,
origin, Queue/DLQ/D1 kaynakları gerekir. Multi-asset kapalı, operator job/creator allowlist boş kalır.
closed tüm ilgili kapıları kapatır; acceptance yeni upload/relay ve oynatma/işlem kapılarını açar;
drain yeni upload'ı kapatıp mevcut iş/oynatma akışını sürdürür.
Mode flag'leri tek tutarlı paket olarak eşleşmeli; bu rapor hiçbir flag değiştirmedi.

Workflow build, lock/manifest/checksum, kaynak provenance/attestation ve runtime SBOM
paketini oluşturur; deploy required reviewer ve artifact/mode tekrar doğrulaması ister.
`DEPLOY_PUBLIC_TESTNET_ENABLED=true` deploy job için ayrıca gerekir.
Bugünkü değer **false**; bu değer mevcut çalışan runtime'ın kapalı olduğu anlamına gelmez.

Kontrat kod güncelleme workflow'u daha dar: seçilen SHA **güncel main tip'iyle aynı** olmalı,
run attempt=1, başarılı exact-main CI içindeki zorunlu test/quality/audit/CodeQL/artifact job'ları,
saklanan exact artifact/provenance, protected environment, deploy-switch=false ve kapalı Bridge gerekir.
Fresh state/policy/WASM özetleri tekrar kontrol edilir. Bugünkü açık runtime ve eski policy bu yolu
karşılamaz; yeni kontrat işlemi başlatılmaz.

## Güncel GitHub ve config kanıtı — CI / sağlayıcı okuması

- Son [main/push CI 35276310906](https://github.com/4rmus/youtick/actions/runs/35276310906): 17 Eylül, success, **6739ec7**.
  Dört artifact (Market/Access/SBOM/public-testnet Market) 17 Ekim'e kadar saklanıyor.
  Bu adayın CI'sı/contract artifact'i değildir.
- Son [Public Testnet Video 35360921254](https://github.com/4rmus/youtick/actions/runs/35360921254): 18 Eylül success; receipt 18 Ekim'e kadar saklanıyor.
  Bugünkü V1 metin/kod paketinin dağıtıldığı anlamına gelmez.
- Son [scheduled CodeQL 35705557607](https://github.com/4rmus/youtick/actions/runs/35705557607)
  22 Eylül “code scanning not enabled” sunucu mesajıyla başarısız. Bugün analyses API 200 ve
  17 Eylül 21:33:46 tarihli 6739ec7 analysis `1796121042` kaydı görülebiliyor.
  Bu, yeni analiz yükleme/izin sorununun çözüldüğünü kanıtlamaz; bugünkü çözüm UNPROVEN.
  Default setup “not-configured” mevcut custom workflow'un kapalı olduğu anlamına gelmez;
  custom job'larda security-events:write zaten var. Kör izin/default-setup eklemesi önerilmez.
  Yeni aday CI'sında CodeQL zorunlu bağımlılık; tarihi başarısızlık bir güvenlik açığı bulgusu değildir.
- GitHub `PUBLIC_TESTNET_RELEASE_CONFIG` 16 Eylül güncellenmiş closed paket.
  İzinli origin alanı `http://localhost:3000,https://public-testnet.youtick.net`.
  Tam alınmış config **yalnız bellekte**, adayın `validatePublicTestnetConfig` kontrolünde
  `public_testnet_origins_invalid` verdi. Config SHA-256:
  `b47849704e184dd5764e178939a4b34f30ba6c3d67e97cf557a539ddd023f015`.
  Sosyal giriş hazırlığı öncesi temel, 72a96c7'deki dar localhost istisnasını dışlamıştı.
  Bu gerçek kaynak/config uyumsuzluğudur; R&D origin'i sessizce silinmedi, repo değişkeni güncellenmedi.
  Koordinatör yalnız bellek kopyasında origin'i public URL'ye indirince doğrulama PASS oldu:
  reddin nedeni bu dar origin kuralı. Bu deney gerçek değişkeni değiştirme önerisi/onayı değildir.

## Güncel sınırlı runtime/NEAR kanıtı — PROVIDER

27 Eylül UTC 15:42:26: Web `/`, Bridge ve read-model `/__health` olmak üzere **3 GET**.
Web 200; yalnız erişilebilirlik/başlık kontrolü, aday içerik veya artifact kabulü değil.
Bridge 200, version `df4609b5-82cc-49b7-8993-62f3e15db700`, ENABLED;
compact=1/testnet/doğru Market; playback/v2 ve sponsored quote/relay ready=true.
Read-model 200, version `75da37cf-1be1-4980-b65b-b0acfbc8d8ef`, ENABLED/testnet.

27 Eylül UTC 15:43:02.491, resmî `rpc.testnet.near.org`: **6 okuma**
(1 final blok + 5 query), sabit final blok `270490567`,
hash `8GrveTnUPt3H5tcjFe1dUtGmcqx52T7jRXhcjnVyN1rZ`.
Market `video-market-v1-260907.youtick-dev-v3.testnet` code hash:
`9FvV8rRn1FQg15jHG4fNZPXjskdMTr6jZBVgNFZyb731`; storage_usage=421203; compact getter=1.
Governance state=2, bridge_frozen=false, new_purchases_paused=false; aktif operator eşleşiyor.
Access state=2, Market bağı eşleşiyor, paused=false, grant_issuance_enabled=true.
Public upload policy=1/public-testnet/testnet, max_source_bytes=5.000.000.000,
TTL=86.400.000 ms, signed quote gerekli; yalnız adaptive ve legacy profiller var.
Full HD varsayılanı veya 120 dakika süre limiti çıkarılmaz.

Bu okumalar aktif deployment'ın bütün 48/26 ABI yöntemini, cüzdan/Livepeer varlığını veya private MPC
kabulünü kanıtlamaz. Kod/view_state/access keys/bakiyeler/bekleyen kullanıcı kayıtları okunmadı.
Bütün uzak işlemler koordinatörün salt-okunur GitHub GET / 3 health GET / 6 RPC okumasıdır;
yeni işlem, imza, ödeme, upload, ayar veya governance yazımı yok.

## Kontrat gerekliliği ve kanıt sınırı

Yerel adayın taze önceki build'inde Market **48**, Access **26** ABI yöntemi kontrolü PASS.
`6739ec7 → 1169120` karşılaştırmasında `compact_upload.rs` ve Access runtime kaynağı aynı;
Market `lib.rs` farkı yalnız `cfg(test)` içindeki başlık vektörü testidir.
Dolayısıyla cüzdan arayüzü seçimi kendi başına yeni kontrat davranışı veya redeploy gerektirmiyor.
Yerel WASM/ABI kaynak uyumu, deployed byte eşitliği veya tüm state uyumu demek değildir.

Eski `market-code-update-public-testnet-policy.json` normal Web/Bridge deploy workflow'unda
tüketilmez. Onu yenilemek veya kontrat deploy etmek otomatik ön koşul yapılmaz.
Kontrat güncelleme ayrıca seçilirse güncel kapalı state/kimlik/anahtar/bütçe/policy ve exact CI artifact'i
yeniden onaylanmalı; eski policy kopyalanıp çalıştırılmaz. Mevcut ENABLED runtime korunur.

## Yerel kapanış ve tek sonraki gate

[Yerel hazırlık](./youtick-v1-isolated-preparation.md), [ürün/gizlilik kapsamı](./youtick-v1-product-scope.md)
ve [gönderilmemiş sağlayıcı paketi](./youtick-v1-provider-enquiry.md) önceki gate kanıtlarıdır.
Uygulama testleri/cargo-near yeniden çalıştırılmadı; deploy paketi oluşturulmadı.
Doküman build PASS (Vitepress 1.6.4; engellemeyen 500 kB bundle uyarısı).
Başlangıçtaki 339 aday dosya, HEAD/index/dal/tag/remote kayıtları ve global near-cli ayar özeti aynı.
Eski kaynak checkout'un 502 dosyası ve HEAD/index/dal/tag/remote kayıtları da aynı kaldı.
Bağlantılar ve boşluk kontrolü PASS; yalnız bu rapor eklendi, staging/commit yapılmadı.
Bu gate'in tek yeni dosyası bu rapordur; diğer kaynak/config/Git/global ayarlar korunur.

**Tek sonraki gate:** `YOUTICK_V1_RELEASE_SOURCE_ALIGNMENT` — yalnız yerel, exact localhost
opsiyonel release-config desteğini 72a96c7'deki dar davranış ve testlerle uzlaştırma.
Sosyal UI veya CI/güvenlik kontrolü zayıflatması eklenmez;
localhost:3000 dışına ek origin/port/joker izin eklenmez, GitHub değişkeni değiştirilmez.
CodeQL izin/durum çözümü yeni zorunlu aday CI'sı ve owner doğrulamasıyla ölçülmeli;
gerekli olursa GitHub ayar değişikliği ayrıca açık onay ister ve bu kaynak gate'iyle çözülmüş sayılmaz.
Entegrasyon/CI/artifact, gizlilik, bütçe ve canlı kabul engelleri kapanmadan yayın NO-GO kalır.
