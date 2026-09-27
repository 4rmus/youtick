# Compact kaynak entegrasyonu adayı

Gate: `NEAR_AUTH_COMPACT_SOURCE_INTEGRATION` — 17 Eylül 2026.
Sonuç: **COMPLETED_WITH_WARNINGS**. Yerel entegrasyon adayı hazır;
commit, push, PR, merge veya GitHub CI başlatılmadı.
[Güncel plan](./near-auth-integration-status.md).

## Aday ve kapsam

GitHub main yeniden okundu: `72a96c78635265b4506259ded38f8bf24058bbc2`.
Asıl checkout `f71178263c5d264bef647feaae8a2b54618b1333` üzerinde korunur.
Güncel main'den **ayrı Git deposu**, detached HEAD ve temiz index ile
başlandı. Sadece dosya manifestindeki farklar aktarıldı; eski checkout
güncellenmedi, temizlenmedi veya topluca başka bir dala taşınmadı.

Önceki dört dosya main ile byte-for-byte aynıydı; tekrar değişiklik olarak
alınmadı: `release-metadata.mjs`, onun testi, `cloudflare-release.test.mjs`
ve `near-auth-local-testnet-access.md`. İlk transfer **98** dosyaydı.
Bu kapanış raporuyla nihai aday **99 dosya** içerir. Önceki compact/auth,
freshness, UX ve yayın korumaları tek adayda birleştirildi. Runtime import,
paket/lock, ortak fixture, Rust modülü ve ABI listesinde eksik dosya yoktur.

Aday: `tmp/near-auth-source-integration-cbvh5c8f/candidate/`.
Dosyalar yalnız bu ayrı adayın index'ine explicit manifest ile alındı;
asıl checkout'un index'i değişmedi. Git tree kimliği ve her dosyanın
SHA-256'sı `evidence/final-manifest.json` içinde; tam staged fark
`staged-diff.patch` içinde saklandı. Git tree bir commit veya deploy
artifact'i değildir. Hazır PR metni `proposed-pr.md` dosyasındadır;
GitHub'a gönderilmedi.

## Temiz kurulumda bulunan iki test sorunu

İkisi de mevcut `apps/web/scripts/near-auth-ux-browser-check.mjs` içinde
düzeltildi; uygulama davranışı değişmedi:

1. Betik ignored `tmp/` dizininin varlığını varsayıyordu. Temiz adayda gerçek
   komut `ENOENT` ile kaldı. Betik artık üst dizini gerektiğinde oluşturur.
2. Processing durumundaki dosya yeniden seçilince IndexedDB'deki taslak
   asenkron yükleniyor. Test, taslak dönmeden onay kutusunu etkin sanıyor;
   tıklayacağı sırada kutu kilitleniyordu. Processing-reload senaryosu
   artık aynı dosyayı seçip mevcut **Resume / check existing upload**
   düğmesini bekliyor. Aynı job ve Google/sponsor/relay/PATCH sayılarının
   **1/1/1/1** kalması şartı korunuyor; ikinci ödeme assertion'ı kaldırılmadı.

Alt ajan salt-okunur son incelemede 98 başlangıç yolunun eksiksiz taşındığını
ve tek beklenen hash farkının bu test düzeltmesi olduğunu doğruladı.
Kapanış belgeleri dahil final manifest ayrıca yeniden üretildi.

## Yeni doğrulama

Web, Bridge, docs ve sentetik handoff paketleri adayın kendi dizininde
`npm ci` ile kilit dosyalarından kuruldu. Gerçek `.env`, sırlar veya kullanıcı
cüzdan/cihaz verileri kopyalanmadı. Rust için mevcut derleme önbelleğinin
ayrı kopyası kullanıldı; adayın Market ve Access kodları yeniden derlendi.
Rust **1.86.0**, önceden doğrulanmış izole cargo-near **0.17.0** kullanıldı.
Global araç kurulumu ve mevcut NEAR CLI config dosyası korunmuştur.

| Kanıt | Sonuç |
| --- | --- |
| Web unit | **775 PASS** |
| Bridge unit | **429 PASS**, mevcut **3** koşullu test atlandı |
| Bridge provider/operasyon araçları, mock | **118 PASS**; Market update testleri dahil |
| Yayın araçları + CI korumaları, yerel | **190 PASS** |
| Market lib + paid-media | **11 + 41 PASS** |
| Market yerel NEAR sandbox | **1 PASS** |
| Rust fmt, tüm Market hedeflerinde clippy | PASS |
| Market ve Access WASM/ABI | PASS; **48 / 26** method |
| Compact boyut/imza matrisi | **360** sentetik örnek PASS |
| Ortak protokol kaynak kontrolü | PASS |
| Sabit provider-handoff fixture testi | **10 PASS**; yama baytları korundu |
| Ayrı Brave UX / playback | **18 / 15 PASS** |
| Web/Bridge tip kontrolü, Web lint | PASS |
| Web OpenNext Cloudflare build | PASS; sentetik testnet adresleri, kapalı varsayılanlar |
| Bridge dry-run paketleme | PASS; deploy yapılmadı |
| Docs build ve kaynak/index koruma | PASS |
| Web/Bridge/docs runtime npm audit | Bildirilen açık **0 / 0 / 0** |

Test ve build sonuçları **LOCAL_TEST / LOCAL_STATIC** kanıtıdır. npm audit
o anki registry bilgisidir; kapsamlı güvenlik denetimi anlamına gelmez.
Sandbox gerçek public testnet değildir. Browser kimlik, zincir, cüzdan,
Bridge ve medya yanıtları sahtedir; gerçek Brave profili kullanılmadı.
Next middleware/Edge ve araç güncellik uyarıları sürer. npm kurulumunda
izin verilmeyen lifecycle script uyarıları vardı; bunları açmadan gerekli
derlemeler ve kontroller geçti. İlk kaynak lint'i geçti; OpenNext build
sonrasındaki genel tekrar üretilmiş `.open-next` dosyalarını da taradı ve
hata verdi. Bu çıktılar değiştirilmeden, yalnız bu üretilmiş dizin komut
satırında dışlanarak tüm kaynak lint'i tekrar geçti.

Ham staged whitespace kontrolü iki tarihsel dosyada uyarı veriyor:
`near-auth-browser-integration.md:7` Markdown satır sonu boşlukları ve
`near-auth-prompt-size.patch:10` patch bağlamındaki boş satır. İlk dosyanın
bilinçli Markdown biçimi, ikinci dosyanın hash ile sabitlenmiş fixture
baytları korundu. Bu iki dosya dışındaki staged kaynakların kontrolü geçti;
yama uygulama/hash testi ayrıca başarılı. Bunlar yeni uygulama hatası değildir.

GitHub CI'ın bütün job'ları yerelde çalıştırılmış sayılmaz. Web'in diğer
canary matrisleri, Access unit ve CodeQL gibi CI kontrolleri bu seçimin
dışındadır; onaylı push sonrasında gerçek CI ayrıca izlenecektir.

## İnceleme ve yetki sınırı

Asıl çalışma alanında yalnız UX betiği, bu rapor ve güncel durum belgesi
değişti. Diğer başlangıç dosyaları ve Git index'i korundu. Manifest,
fark, kurulum ve test logları `tmp/near-auth-source-integration-cbvh5c8f/`
altında bulunur. Önceki gate snapshot'ları değiştirilmedi.

Source blocker'ı yok. **EXTERNAL_NOT_RUN:** commit/push/PR/merge, GitHub CI,
deploy, bakım/NEAR işlemi, config/key değişimi, gerçek Google/MPC, ödeme,
upload/HLS. Gerçek `access_denied` hatasının giderildiği henüz kanıtlanmadı.
Market policy'nin allowance beklentisi zamanla değişebilir; bakım öncesi
tekrar doğrulanır. Compact proof sonrası eski Bridge'e dönüş sınırı ve
localhost-only pilot kapsamı [yayın ön kontrolündeki gibi](./near-auth-compact-release-preflight.md) korunur.

**Tek sonraki gate: `NEAR_AUTH_COMPACT_GIT_PUBLISH`.** Bu gözden geçirilmiş
adaydan tek commit, yeni kaynak dalına push ve **taslak PR** oluşturmak;
otomatik PR CI sonuçlarını izlemek. **Merge, deploy, bakım ve ödeme kapsam
dışıdır.** Bu işlemler henüz onaylanmadı veya başlatılmadı. Repo `AGENTS.md`
commit/push/PR için açık kullanıcı onayı ister. Kontrolde Preview ve
public-testnet deploy switch'leri false idi; push öncesi tekrar okunmalıdır.
