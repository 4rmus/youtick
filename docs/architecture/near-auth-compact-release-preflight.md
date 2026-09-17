# NEAR Auth compact yayın ön kontrolü

Gate: `NEAR_AUTH_COMPACT_RELEASE_PREFLIGHT` — 17 Eylül 2026.
Sonuç: **COMPLETED_WITH_WARNINGS**. Yayın kararı: **BLOCKED**.
İnceleme ve kaynak adayının hazırlanması tamamlandı; aday henüz yayına hazır değil.

## Kapsam

Ana ajan kaynak mutabakatı, aday paket ve son doğrulamayı yaptı. İki
salt-okunur alt ajan CI/yayın yolunu ve kademeli uyum/geri dönüş sınırını
ayrı inceledi. Uygulama, workflow ve kontrat politikası değiştirilmedi.
Yalnız bu rapor ve [güncel plan](./near-auth-integration-status.md) değişti.
Yerel aday ve kanıtlar ignored `tmp/` dizinine yazıldı; index korunuyor.

## İncelenebilir kaynak adayı

- Yerel HEAD: `f71178263c5d264bef647feaae8a2b54618b1333`.
- GitHub main, `ls-remote` ve mevcut `origin/main` aynı:
  `72a96c78635265b4506259ded38f8bf24058bbc2`. Checkout bir commit geride.
- Başlangıçta staged **0**, unstaged **21**, untracked **75** dosya var.
  Bunların **4** tanesi main ile byte-for-byte aynı; yeni değişiklik değildir:
  `scripts/release-metadata.mjs`, `scripts/release-metadata.test.mjs`,
  `scripts/cloudflare-release.test.mjs`,
  `docs/architecture/near-auth-local-testnet-access.md`.
- Main üzerine ayrı dizinde hazırlanan aday farkı **92 dosya**:
  **18** mevcut dosya değişikliği, **74** yeni dosya. Bunlar 59 kaynak/test,
  27 dokümantasyon, 6 yerel doğrulama/handoff dosyasıdır. Handoff provider
  yaması yayın talimatı değildir; seçilen compact yolun karşılaştırma kanıtıdır.
- Aday ağacı **371 dosya** içerir. SHA-256:
  `78399fbb7c147a22b24de9d3036d4584f14ade795f5258b0d53dda499f59f684`.
  Bu bir **dosya ağacı özeti**; Git commit SHA veya yayın artifact'i değildir.

Aday, önceki gate'lerdeki lab API/oturum/UI, funding, imzalama, ortak uploader
ve playback bağlarını da içerir. Compact decoder bunların üzerine kurulur;
yalnız yeni codec dosyasını taşımak yeterli değildir. Market/Bridge decoder,
ortak vektörler, Web istemcisi ve ilgili testler aynı adayda tutuldu. Paket
kilitleri mevcut yerel halleriyle alındı; yeni bağımlılık kurulmadı.

Paket: `tmp/near-auth-release-preflight-2608gefi/` altında `candidate/`,
`candidate.patch`, `evidence/candidate-manifest.json` ve `candidate-files.json`.
Manifest her dosyanın baz/adayı hash'ini, boyutunu ve kategorisini içerir.
Bu sabit snapshot bu gate raporu yazılmadan önce alındı. Sonraki source
düzeltmeleri ve gate belgeleri nihai commit'e ayrıca dahil edilmelidir.
Asıl checkout taşınmadı, güncellenmedi veya temizlenmedi.

## Yayın engelleri

### 1. Ortak protokol değişikliğinde iki tüketicinin CI'ı atlanıyor

`.github/workflows/ci.yml:153` içindeki protocol dalı yalnız `protocol=true`
ve `bridge=true` üretiyor. Aynı codec Web tarafından, ortak JSON vektörleri
Rust integration testi tarafından tüketiliyor. Workflow'un gerçek `case`
bölümü iki compact dosya yolu ile çalıştırıldı: ikisinde de `web=false`,
`contracts=false`. Bu dosyaları tek başına değiştiren gelecekteki bir commit
Web/Market kontrollerini ve Market artifact üretimini atlayabilir.

Bu aday Web ve kontrat yollarını da değiştirdiği için kendi tam diff'i bu
iki işi tetikler; bulunan boşluk protocol-only değişiklikler içindir.
Mevcut 16 CI koruma testi geçiyor, fakat bu durumu henüz kapsamıyor.

En küçük düzeltme: mevcut protocol dalına Web/Contracts seçimlerini ekle;
mevcut `scripts/ci-security.test.mjs` içinde iki compact yolu için regresyon
koy. Yeni CI altyapısı veya Ubuntu'ya macOS Brave kurulumu gerekmez.
Auth tip kontrolü zaten Web `prebuild` üzerinden çalışır.

### 2. Market yayın politikası canlı kod ve allowance ile eşleşmiyor

**PROVIDER / salt-okunur:** 17 Eylül **20:21:26 UTC** civarında final blok
**269043709**, hash `5C7q7meDJ2FSLzv7JXhXz3oLGhkaB7Sk7Wn5jVQ3WFS2`:

| Kontrol | Kaynak policy | Gözlenen |
| --- | --- | --- |
| Market code hash | `BwX8m9esvWniSeE2VrWk5byRBSqAD313DYsVERZshVoY` | `5DsjPD8zDFjhMWF8ro1ATi9xWY1YjGATfw31hVc7H7y` |
| Mevcut WASM boyutu | 376382 | 376382 |
| Sınırlı Bridge key allowance, yoctoNEAR | `95517196951751100000000` | `95143292519868900000000` |
| `bridge_frozen` / `new_purchases_paused` | true / true | false / false |
| Access state | Kilitli beklenen state | Aynı |

Hedef `video-market-v1-260907.youtick-dev-v3.testnet`.
Mevcut kodun SHA-256'sı
`0114e17392701d422570183b3bb9a0822d6b83bfb38928c07b55d2bf981f8774`.
Market `get_compact_upload_version` çağrısı `MethodNotFound` döndü.
Bridge `ENABLED`, yeni upload/playback hazır, `compactUpload` alanı yok.
Bu durum eski sürümleri doğrular; yeni adayın çalıştığını göstermez.

En küçük düzeltme: `market-code-update-public-testnet-policy.json` içindeki
mevcut kod/anahtar beklentilerini taze, doğrulanmış snapshot ile yenile ve
mevcut policy testlerinde eski snapshot reddini koru. Bakım bayrakları
**true kalır**; gözlenen false değerler policy'ye kopyalanmaz. Roller,
hedefler, anahtar kapsamı ve **0,1 NEAR** azami deploy maliyet sınırı
genişletilmez. Bu tutar mevcut source sınırıdır, harcama onayı değildir.
Allowance sonraki kullanımlarda değişebilir; yayından hemen önce tekrar okunur.
Ham state hash'i bu aktif ortam incelemesinde onaylanmadı; bakımda alınmalıdır.

## Güncel GitHub ve runtime kanıtı

Main'in [CI kaydı](https://github.com/4rmus/youtick/actions/runs/35116082045)
başarılıdır. O commit'te Web/Bridge/Protocol/Contracts ve Market artifact işi
atlanmıştı; bu CI yeni adayın veya yeni Market WASM'ının kanıtı değildir.
Mevcut [public-testnet yayın kaydı](https://github.com/4rmus/youtick/actions/runs/35117620498)
aynı main SHA'sına ait, `acceptance` modunda ve başarılıdır.
İndirilen receipt'teki Bridge sürümü
`843cec7d-3ccf-4766-9499-f7c657106b65` canlı health ile eşleşir.
Receipt'te Web `36244bf4-a427-4139-8554-a439e0c8b3ac` kayıtlıdır;
bu gate Web'in servis edilen sürümünü bağımsız olarak doğrulamadı.

Salt-okunur GitHub kontrolünde `DEPLOY_PREVIEW_ENABLED=false` ve
`DEPLOY_PUBLIC_TESTNET_ENABLED=false`; ilgili environment'lar korumalı
branch ve bir reviewer şartına sahip. Bunlar runtime'ın kapalı olduğu
anlamına gelmez: son yayın acceptance modundadır. Kapalı kaynak config'inde
`http://localhost:3000,https://public-testnet.youtick.net` origin listesi vardır.
Merge/dispatch öncesinde değişkenler tekrar okunmalı; Preview switch açılırsa
başarılı CI sonrasında otomatik Preview yayını tetiklenebilir.

## Yetkilendirilecek yayın sırası

1. Aşağıdaki tek source gate'inde iki engeli gider. Nihai main adayı için
   ayrı commit/push/merge yetkisi ve başarılı aynı SHA push CI gerekir.
   Market WASM/ABI/manifest/checksum ve attestation o CI'dan alınır;
   yerel build veya yukarıdaki dosya ağacı özeti kullanılmaz.
2. Bakım etkisini ayrıca onaylat: mevcut işleri önce sorgula/uzlaştır,
   yeni upload'ları durdur. Market için yönetici `bridge_frozen=true` ve
   `new_purchases_paused=true` işlemleri, public-testnet için korumalı
   `closed` yayını gerekir. Yalnız `drain` yeterli değildir: Market update
   workflow'u playback, webhook ve mutation hazır olma durumlarını da
   kapalı ister. İzleme/işleme kesintisi ve açık işler önceden kaydedilir.
3. Bakım altında taze raw-state/code/key snapshot al. Exact main SHA,
   başarılı CI run, yeni WASM hash, state hash, policy hash ve maliyet
   sınırı kullanıcıya sunulur. Korumalı `Public Testnet Market Code Update`
   yalnız bir `DeployContract` yapar; init/migrate veya Access değişimi yoktur.
   Code hash eşleşmesi ve raw state'in byte-for-byte korunması zorunludur.
4. Compact Bridge ve Web'i korumalı Public Testnet Video workflow'uyla
   kapalı modda doğrula. Yardımcı Bridge'i Web'den önce geçirir. Receipt,
   servis edilen versionId, ağ/Market kimliği, Market version=1 ve Bridge
   `compactUpload.version=1` ayrıca kontrol edilir. Genel release smoke
   bu yeni yetenekleri özel olarak denetlemez; health 200 tek başına yetmez.
5. Ayrı yetkiyle bakım bayrakları ve acceptance durumu açılır; Google upload
   ön kontrolünde iki servis ve upload readiness tekrar doğrulanır.
   İlk gerçek kabul **localhost:3000 lab + yayımlanmış Bridge/Market** olur.
   `/auth-lab` development-only kalır; Web deploy Google girişini halka açmaz.
   Mevcut hesap/sponsor/dosya/taslak/Brave cihazıyla, eski işlemleri önce
   uzlaştırarak, güncel token ve quote ile tek kontrollü deneme yapılır.
   Gerçek JWT boyutu, Google/MPC sonucu, yayın, creator playback ve reload
   o ayrı gate'in kanıtıdır. Passkey veya uzak ürün açılışı bu paketin vaadi değildir.

### Durdurma ve geri dönüş sınırı

Kontrat veri alanları değişmedi; compact decoder mevcut `TransferMessage`
üretir ve eski JSON desteklenir. Buna rağmen code update sonrası otomatik
Market rollback yapılmaz: belirsiz sonuç önce okunarak uzlaştırılır,
gerekiyorsa yeni düzeltme yayımlanır.

**İlk compact işlem/proof sonrası eski Bridge rollback hedefi olamaz.**
Eski relay ve delegated-device playback okuyucuları compact biçimi tanımaz.
Quote'in bitmesi bu bağımlılığı bitirmez; cihaz kanıtı daha uzun yaşar.
Yeni Google başlangıçları durdurulurken compact okuyucu, mevcut job/proof
uzlaştırması ve Web completion/recovery uyumu korunur. `outer_pending`,
`outer_submitted`, `mpc_verified`, cihaz anahtarları veya eski imzalar silinmez.
Genel otomatik sürüm geri dönüşü bu şema uyumunu kanıtlamaz; önceki sürümün
compact desteği ayrıca doğrulanmadan trafiğe dönülmez.

## Yerel doğrulama ve tek sonraki gate

**LOCAL_TEST:** izole adayda Web **775**, Bridge **429** geçti; Bridge'de
önceden koşullu **3** test atlandı. İki tarafın tip kontrolü geçti.
Mevcut yayın araçları **173**, Market update **29**, CI korumaları **16**
test geçti. CI yol denemesi yukarıdaki iki eksik seçimi ayrıca kanıtladı.
Doküman build ve kaynak/index koruma kontrolü geçti.

Yeni Rust/WASM, OpenNext/Cloudflare build, boyut matrisi veya Brave kabulü
bu gate'te tekrarlanmadı; önceki source/UX kanıtları yeni CI gibi sunulmaz.
**EXTERNAL_NOT_RUN:** yeni CI tetikleme, commit/push/PR/merge, deploy,
provider/config/key değişikliği, bakım/NEAR işlemi, ödeme veya gerçek upload/HLS.
Salt-okunur zincir/GitHub/health çağrıları bunlardan ayrıdır.

**Tek sonraki gate: `NEAR_AUTH_COMPACT_RELEASE_GUARDS_SOURCE`.** Yalnız
`.github/workflows/ci.yml`, `scripts/ci-security.test.mjs`,
`workers/livepeer-bridge/scripts/market-code-update-public-testnet-policy.json`,
ilgili mevcut policy testleri ve gate belgeleri. CI tüketici seçimini ve
güncel policy beklentilerini düzelt; bakım retlerini ve maliyet/anahtar
sınırlarını koru. Bu source gate'i henüz açılmadı; yayın yetkisi değildir.
