# YouTick büyük video yükleme ve güvenli dönüştürme değerlendirmesi

> **SUPERSEDED — 22 Temmuz 2026:** Bu belgedeki R2/Livepeer ağırlıklı hedef
> mimari artık aktif karar değildir. Kanonik hedef mimari için
> [mevcut YouTick merkeziyetsiz storage ve streaming nihai mimari planına](./decentralized-storage-streaming-architecture-evaluation-2026-07-21.md)
> bakın. Bu belgedeki mevcut repo sınırlamaları tarihsel araştırma kanıtı olarak
> korunmuştur.

**Tarih:** 18 Temmuz 2026<br>
**Kapsam:** Konser, film ve uzun video master dosyalarının yüklenmesi, dönüştürülmesi, şifrelenmesi, kalıcı saklanması ve oynatılması<br>
**Karar durumu:** `SUPERSEDED`; kod, deploy ve canlı ortam değişikliği yapılmadı

## Yönetici özeti

Mevcut uygulamada yalnızca dosya boyutu sabitini yükseltmek güvenli değildir. Güncel çalışma ağacındaki akış videonun tamamını tarayıcı belleğine alıyor, MP4Box ile yalnızca yeniden paketliyor, bütün segmentleri bellekte tutuyor ve 4 MiB parçaları Cloudflare Worker üzerinden Lighthouse'a taşıyor. Bu yol 5-50 GB film dosyalarında sekme çökmesi, süre aşımı, binlerce istek ve yarım kalmış içerik üretir. Ayrıca gerçek bir transcode veya adaptif bitrate (ABR) üretmez.

Net öneri şudur:

> **R2 Standard doğrudan multipart yükleme + değiştirilebilir dönüştürme arka ucu + YouTick kontrollü streaming AES-GCM “sealer” + Lighthouse şifreli kalıcılık + isteğe bağlı R2 şifreli sıcak kopya + KMS/NEAR erişim gerçeği.**

Dönüştürme arka ucu iki hatlı olmalıdır:

1. **Livepeer processing-only:** 30 GB altı, 1080p SDR ağırlıklı ve üçüncü tarafın açık videoyu işlemesinin sözleşmesel olarak kabul edildiği içerikler.
2. **Özel GPU/FFmpeg hattı:** 30 GB üstü master, 4K/HDR, çok kanallı ses, AB içinde kalma şartı veya yüksek değerli lisanslı içerik.

Livepeer, Lighthouse, KMS veya NEAR'ın yerine geçmemelidir. Livepeer'in kendi encrypted asset modeli AES-CBC kullanır ve içerik anahtarını Livepeer'in anahtarına sarar; bu durumda YouTick KMS tek çözme otoritesi olmaktan çıkar. Cloudflare Stream de ana film hattı için önerilmez: 30 GB sınırı, en fazla 1080p H.264, HDR'ın SDR'a dönüşmesi ve çok kanallı sesin stereo'ya indirilmesi konser/film master sözleşmesiyle uyumlu değildir.

En önemli güvenlik gerçeği şudur: **Genel amaçlı bir dönüştürücü şifreli videoyu dönüştüremez.** Livepeer kullanılırsa Livepeer açık içeriği görür. Bu kabul edilemiyorsa çözüm Livepeer değil; uploader tarafında native dönüştürme veya YouTick'in kontrolündeki izole dönüştürücüdür.

## 1. Kapsam, varsayımlar ve doğruluk sınırı

Bu rapor şu varsayımlarla hazırlanmıştır:

- Lighthouse kalıcı, şifreli medya deposu olmaya devam edecek.
- YouTick KMS anahtar paylaşımı ve çözme izni için tek uygulama otoritesi olacak.
- NEAR sahiplik, bilet, creator ve ban kararının zincir üstü kaynağı olarak kalacak.
- R2 kalıcı doğruluk kaynağı değil; yükleme tamponu, işlem alanı ve ölçüme bağlı sıcak kopya olacak.
- Büyük dosya desteği tarayıcı sekmesi açık kalmadan, saatler sürebilen asenkron iş olarak tasarlanacak.
- Fiyatlar 18 Temmuz 2026 tarihindeki herkese açık liste fiyatlarıdır; vergi, kur, kurumsal indirim, destek, KMS operatör maliyeti ve sağlayıcılar arası gizli/özel trafik ücretleri dahil değildir.

Repo çalışma ağacı çok kirli. Bu nedenle rapor iki gerçeği ayırır:

| Yüzey | `HEAD` | Güncel çalışma ağacı |
|---|---:|---:|
| Ücretli/ücretsiz UI limiti | 500 MB / 100 MB | 64 MB / 64 MB |
| Storage API varsayılan body limiti | 100 MiB | 8 MiB |
| Segment şifreleme | AES-CTR | AES-GCM değişiklikleri mevcut |

Aşağıdaki kod bulguları güncel, commitlenmemiş çalışma ağacını anlatır. Bunlar deploy edilmiş production gerçeği olarak kabul edilmemelidir.

## 2. Mevcut repo gerçeği

### 2.1 Bugünkü akış

1. UI yalnız MP4/MOV kabul ediyor ve güncel çalışma ağacında 64 MB sınırı uyguluyor (`apps/web/components/UploadForm.tsx:27-31`, `:104-117`, `:479-483`).
2. MP4Box tarayıcıda dört saniyelik CMAF benzeri segmentler üretiyor (`apps/web/lib/video-delivery.ts:16-24`, `:378-383`).
3. Worker dosyanın tamamını `file.arrayBuffer()` ile belleğe alıyor ve bütün init/segment buffer'larını tek mesajda ana threade aktarıyor (`apps/web/lib/video-delivery.worker.ts:82-87`, `:96-102`).
4. Worker 64 MB üzerinde hata verirse kod main-thread paketlemeye düşüyor; bu ikinci yolun kendi boyut koruması yok (`apps/web/lib/video-delivery.ts:249-262`, `:378-383`).
5. Bütün segmentler önce şifrelenip `preparedSegments` içinde tutuluyor, yükleme daha sonra başlıyor (`apps/web/hooks/useUpload.ts:239-280`).
6. Lighthouse yolunda payload'lar 4 MiB parçalara bölünüyor (`apps/web/hooks/useUpload.ts:23`, `:311-349`).
7. Her parça Storage API Worker'a geliyor, `request.formData()` ile açılıyor ve yeni FormData olarak Lighthouse'a aktarılıyor (`workers/storage-api/src/index.ts:527-600`).
8. Medya yüklendikten sonra anahtar KMS'e yazılıyor ve geri okunarak doğrulanıyor (`apps/web/hooks/useUpload.ts:582-592`).
9. NEAR publish bundan sonra yapılıyor; kalıcı storage order ve doğrulama ise publish işleminden sonra çalışıyor (`apps/web/hooks/useUpload.ts:594-647`, `:649-710`).

### 2.2 Neden bu transcode değildir?

MP4Box mevcut codec'i yeniden encode etmiyor; mevcut ses/video örneklerini farklı bir konteynere ve segment düzenine taşıyor. Repo'da FFmpeg, Livepeer, TUS, rendition ladder veya ABR manifest üreticisi bulunmuyor. Sonuç olarak:

- ProRes içeren bir MOV yüklenebilir ama tarayıcıda oynatılamayabilir.
- 4K yüksek bitrate kaynak mobil kullanıcıya aynı bitrate ile gider.
- Codec, GOP, renk alanı, ses kanalı ve bitrate normalizasyonu yapılmaz.
- Tek codec ve tek segment dizisi vardır; bağlantı hızına göre rendition değişimi yoktur.

### 2.3 Film ölçeğinde kırılacak noktalar

| Risk | Repo kanıtı | Film ölçeğindeki sonuç |
|---|---|---|
| Bellek büyümesi | Tam kaynak `arrayBuffer`, bütün çıktı segmentleri bellekte | Sekme/Worker OOM, UI donması |
| Worker fallback | 64 MB Worker reddi limitsiz main-thread yoluna düşüyor | UI sabiti artırılınca koruma atlanır |
| Çok küçük parçalar | 4 MiB Lighthouse parçaları | 20 GiB dosyada yaklaşık 5.120 parça ve en az iki kat control-plane çağrısı |
| Rate limit | Storage API varsayılanı 1.000 intent/saat | 20 GiB dosya varsayılan kuralda bitmez |
| Kısa yetki | Upload session 15 dk, storage token 10 dk, intent 15 dk | Saatler süren iş ortada yetki kaybeder |
| Resume yok | Kalıcı part ledger/job state yok | Sekme yenileme veya ağ kesintisi başa döndürür |
| Yanlış publish sırası | Persistence kontrolü NEAR publish sonrasında | Zincirde var ama kalıcılığı kanıtlanmamış içerik |
| Orphan kayıtlar | Storage -> KMS -> NEAR ardışık ve rollback yok | Hata türüne göre blob veya KMS share artığı |
| Sıfır maliyet varsayımı | Uygulama storage maliyetini sıfır kabul ediyor | Ürün fiyatı gerçek maliyeti yansıtmaz |

Sonuç: **Dosya limiti ancak yeni asenkron pipeline üretime girdikten sonra yükseltilmelidir.** Mevcut koddaki sabitleri değiştirmek bir çözüm değildir.

## 3. Mimari karar

### 3.1 Sağlayıcıların doğru rolleri

| Katman | Önerilen rol | Rol dışı kullanım |
|---|---|---|
| Cloudflare R2 | Doğrudan resumable ingest, kısa ömürlü plaintext işlem alanı, şifreli hot mirror | Transcode motoru veya tek kalıcı kaynak |
| Livepeer | Uygun dosyalarda geçici ABR/fMP4 dönüştürme | KMS, kalıcı Lighthouse deposu veya erişim gerçeği |
| Özel GPU/FFmpeg | Büyük, HDR, çok sesli, hassas veya bölgesel kısıtlı master | İlk günden bütün trafik için zorunlu kapasite |
| Lighthouse | Hazır ciphertext segmentleri ve isteğe bağlı şifreli master arşivi | Tarayıcıdan çok GB tek-sefer şifreleme veya plaintext transcode output |
| YouTick KMS | Playback/archive anahtar share'leri ve kısa ömürlü çözme grant'i | Medya byte taşıma veya transcode |
| NEAR | Sahiplik, bilet, ban ve publish yetkisi | Büyük job state veya medya metadata deposu |
| Media Delivery | Yalnız şifreli segment cache/fallback | Anahtar veya plaintext görme |

### 3.2 Hedef veri akışı

```text
Creator + NEAR imzası
        |
        v
Upload Control Worker ---- quota / job / kısa ömürlü R2 yetkisi
        |                             |
        | metadata                    | video byte doğrudan
        v                             v
Durable job state                 Private R2 ingest (Standard)
        |                             |
        +-------- Queue/event --------+
                      |
                      v
              Probe + quarantine
                      |
             +--------+--------+
             |                 |
             v                 v
   Livepeer processing    Özel GPU/FFmpeg
   <=30 GB / uygun hak     >30 GB / HDR / hassas
             |                 |
             +--------+--------+
                      |
                      v
             Private R2 output
                      |
                      v
            YouTick streaming sealer
            - doğrula
            - segment bazlı AES-GCM
            - manifest imzala
            - KMS share yaz/doğrula
                      |
             +--------+--------+
             |                 |
             v                 v
       Lighthouse          R2 encrypted hot mirror
       ciphertext          ölçüme/politikaya bağlı
             |                 |
             +--------+--------+
                      |
                      v
             READY_TO_PUBLISH
                      |
              Creator final imzası
                      |
                      v
                NEAR publish
```

### 3.3 İki güven profili

#### Standart profil

- Kaynak TLS ile private R2 bucket'a yüklenir.
- R2 sağlayıcı tarafından at-rest şifrelenir; fakat uygulama açısından kaynak plaintext'tir.
- Livepeer presigned GET ile kaynağı okur ve açık videoyu işler.
- Plaintext source ve renditions kısa lifecycle ile silinir.
- Yalnız YouTick AES-GCM ciphertext'i kalıcı depoya gider.

Bu profil en düşük operasyon yüküne sahiptir. Karşılığında Cloudflare ve Livepeer veri işleyen alt yüklenici güven sınırına girer.

#### Yüksek güven profili

- Creator source'u istemcide ayrı bir ingest anahtarıyla stream ederek şifreler.
- R2 yalnız ciphertext görür.
- YouTick'in kontrolündeki izole dönüştürücü job'a özgü, kısa ömürlü KMS grant'iyle stream içinde çözer.
- Plaintext diske veya loga yazılmaz; çıktı anında yeniden şifrelenir.
- Livepeer bu hatta kullanılmaz.

Bu profil daha pahalıdır ama hassas lisans, AB veri yerleşimi veya “üçüncü taraf plaintext görmesin” şartı için gereklidir. Tarayıcı içinde çok saatlik 4K transcode bunun güvenilir alternatifi değildir.

## 4. Yükleme kontrolü

### 4.1 Doğrudan multipart R2

R2 tek nesnede yaklaşık 4.995 TiB, multipart yüklemede 10.000 parça destekler. Parça boyutu 5 MiB ile 5 GiB arasındadır. Büyük video byte'ı Next.js, Web4 proxy veya Worker üzerinden geçmemelidir. Workers'ın plan bazlı body limitleri ve 128 MB bellek sınırı bu kullanım için uygun değildir. Kaynaklar: [R2 limits](https://developers.cloudflare.com/r2/platform/limits/), [R2 multipart upload](https://developers.cloudflare.com/r2/objects/upload-objects/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

Başlangıç ayarı:

- Parça boyutu: 64-128 MiB.
- Paralellik: masaüstünde 3-4, mobilde 1-2.
- Her parça için checksum; tamamlanınca toplam source SHA-256.
- `uploadId`, tamamlanmış part listesi ve ETag'ler IndexedDB + sunucu job ledger'da.
- Refresh/offline sonrası `ListParts` ile devam.
- Başarısız multipart 24 saat sonra abort/lifecycle ile temizlenir.

Control Worker yalnız şu verileri taşır: `jobId`, `accountId`, `objectKey`, beklenen boyut, content type, source hash ve part durumu. Video gövdesi taşımaz.

### 4.2 Yetki modeli

Cloudflare R2 geçici kimlikleri kısa ömürlü, bucket ve prefix/nesne kapsamlı olabilir; multipart eylemleri ayrıca sınırlandırılabilir. Üç bileşenlidir: access key, secret key ve session token. Kaynak: [R2 temporary credentials](https://developers.cloudflare.com/r2/api/s3/temporary-credentials/).

İstemci yetkisi:

- Tek `accountId/jobId/` prefix'i.
- Yalnız multipart oluşturma, part yazma, listeleme, tamamlama ve abort.
- En kısa uygulanabilir TTL; yenileme job sahipliği tekrar doğrulanarak yapılır.
- Parent secret hiçbir zaman istemciye verilmez.
- Kullanıcı ve tenant başına byte/duration/job kotası upload başlamadan rezerve edilir.

Tek presigned PUT film için iyi değildir; bağlantı kopunca tüm nesne tekrar gider. Presigned URL kullanılacaksa yalnız indirme veya tekil küçük parça için kullanılmalıdır.

### 4.3 Uzun iş yetkisi

Mevcut 10-15 dakikalık storage/KMS/upload session zinciri film işlemi için kullanılamaz. Geniş bir 24 saatlik access key vermek yerine job'a bağlı bir yetki oluşturulmalıdır:

- Creator `assetId`, `sourceHash`, azami maliyet/byte, izin verilen iş adımları ve expiry'yi NEP-413 ile imzalar.
- KMS operatörleri pipeline'ın share yazma isteğinde bu grant'i ve job durumunu doğrular.
- Grant playback anahtarı okumaya izin vermez.
- Publish için en güvenli ilk sürüm, iş `READY_TO_PUBLISH` olduğunda creator'ın tekrar gelip final NEAR işlemini imzalamasıdır.

Bu model saatler süren işi kullanıcı sekmesine veya geniş kapsamlı uzun ömürlü session key'e bağlamaz.

## 5. Dönüştürme sözleşmesi

### 5.1 Ön doğrulama

Dosya uzantısı veya tarayıcı MIME değeri yeterli değildir. İzole probe işi şu kontrolleri yapmalıdır:

- Gerçek konteyner ve codec.
- Süre, çözünürlük, bitrate, frame rate, renk alanı ve ses kanalları.
- Boyut/süre oranı ve decode sınırları; bozuk veya kötü niyetli medya.
- Source SHA-256 ve multipart toplam boyutu.
- Kabul edilen codec/profile matrisi.
- Hak sahipliği beyanı, içerik moderasyonu ve duplicate/hash blocklist.

Probe/transcode container non-root, salt okunur root filesystem, kısıtlı ağ, sınırlı CPU/RAM/süre ve secretsiz log ile çalışmalıdır. Queue en az bir kez teslim edebileceği için iş anahtarı `assetId + sourceHash + profileVersion` ile idempotent olmalıdır.

### 5.2 İlk rendition profili

İlk üretim sürümünde geniş cihaz uyumluluğu için:

| Rendition | Yaklaşık video bitrate | Kullanım |
|---|---:|---|
| 360p | 0.7-1.0 Mbps | Zayıf bağlantı / mobil |
| 720p | 2.2-3.0 Mbps | Varsayılan orta kalite |
| 1080p | 4.5-6.0 Mbps | Wi-Fi / TV / masaüstü |

- Codec: H.264 + AAC-LC, CMAF/fMP4.
- Segment/GOP: hizalı 4 saniye; mevcut oynatıcı yaklaşımıyla uyumlu ve istek maliyetini makul tutar.
- Kaynaktan büyük çözünürlüğe upscale yapılmaz.
- 4K/HDR ve 5.1 ses ayrı profile version ve gerçek cihaz testi sonrası açılır.
- Master korunacaksa playback anahtarından ayrı archive anahtarıyla şifrelenir; viewer archive anahtarını alamaz.

Konser ve film için HDR, çoklu ses, 5.1/7.1, altyazı ve chapter korunumu “daha sonra bakılır” ayrıntısı değildir. Her profil için açık kabul/red/preserve kuralı olmalıdır; sessiz downmix veya renk dönüşümü yapılmamalıdır.

### 5.3 Livepeer adaptörü

Livepeer Transcode API asenkron çalışır, HTTP/S3 uyumlu input ve S3/Web3 output ile HLS, MP4 ve fMP4 üretebilir. Bu nedenle R2 ile teknik olarak uyumludur. Kaynak: [Livepeer Transcode API](https://docs.livepeer.org/v1/api-reference/transcode/create).

Ancak üç üretim kapısı vardır:

1. VOD dosya sınırı 30 GB'dır. 2 saatlik 30 GB dosya yaklaşık 33 Mbps, 3 saatlik dosya yaklaşık 22 Mbps ortalamaya denk gelir. Yüksek kaliteli master kolayca aşar. Kaynak: [Livepeer support matrix](https://docs.livepeer.org/v1/references/api-support-matrix).
2. Livepeer S3 credential şeması `accessKeyId` ve `secretAccessKey` gösterir; R2 geçici kimliği için gerekli `sessionToken` belgelenmemiştir. Üretimde destek teyit edilmeden geçici R2 credential'ın doğrudan çalıştığı varsayılmamalıdır.
3. Livepeer açık video işler. “Provider plaintext görmesin” şartıyla uyumlu değildir.

En dar PoC bağlantısı:

- Input: R2'den 6-24 saatlik job'a özel presigned GET.
- Output: yalnız transient plaintext rendition içeren ayrı R2 bucket ve yalnız o bucket'a bağlı token.
- Token düzenli döndürülür; source bucket'a erişemez.
- Livepeer webhook imzası, timestamp, event/job eşleşmesi ve replay kontrolü yapılır.
- Sealer tamamlanınca Livepeer task/asset ve R2 plaintext output silinir.

İdeal üretim çözümü Livepeer'in R2 session token desteğini yazılı olarak doğrulaması veya eklemesidir. Aksi halde paylaşılan uzun ömürlü output token riski sözleşme ve rotasyonla yönetilmek zorundadır.

### 5.4 Livepeer encrypted asset neden kullanılmamalı?

Livepeer'in resmi encrypted asset akışı yalnız AES-CBC'yi destekler. İçerik anahtarı Livepeer'in RSA public key'iyle şifrelenip `encryptedKey` olarak Livepeer'e gönderilir. Bu, Livepeer erişim politikasını ikinci çözme otoritesi yapar ve YouTick'in mevcut segment bazlı AES-GCM/KMS modelini değiştirir. Kaynak: [Livepeer encrypted assets](https://docs.livepeer.org/v1/developers/guides/encrypted-asset).

Bu yüzden Livepeer:

- depolama sahibi olmamalı,
- playback policy sahibi olmamalı,
- final içerik anahtarını tutmamalı,
- yalnız geçici plaintext -> plaintext renditions işlemcisi olmalıdır.

### 5.5 Özel dönüştürücü hattı

Şu durumlardan biri varsa özel GPU hattına yönlendirilmelidir:

- Source >30 GB.
- 4K/HDR/10-bit, 5.1/7.1 veya birden fazla ses track'i korunacaksa.
- Sözleşme açık içeriğin yalnız belirli ülkede/hesapta işlenmesini istiyorsa.
- Livepeer DPA, subprocessor, retention veya breach şartlarını karşılamıyorsa.
- Film stüdyosu denetimli altyapı veya forensic watermark istiyorsa.

Cloudflare Containers FFmpeg PoC için kullanılabilir; fakat herkese açık limitler 4 vCPU, 12 GiB RAM ve 20 GB disk, belgelenmiş GPU ise yoktur. 4K film ana hattı için önce gerçek dosyalarla benchmark gerekir. Kaynak: [Cloudflare Containers limits](https://developers.cloudflare.com/containers/platform-details/limits/).

## 6. Streaming şifreleme ve kalıcı saklama

### 6.1 Sealer

Sealer, dönüştürücüden bağımsız ve YouTick kontrolünde olmalıdır. Görevi:

1. Çıktı manifestini ve her rendition'ın codec/GOP/süre/segment dizisini doğrulamak.
2. Her asset için 256-bit delivery DEK üretmek.
3. Her segmenti stream halinde AES-256-GCM ile şifrelemek; tüm dosyayı belleğe almamak.
4. Her segmentte benzersiz 96-bit nonce kullanmak ve retry sırasında nonce tekrarını engellemek.
5. AAD içine `assetId`, `profileVersion`, `renditionId`, `sequence`, plaintext uzunluğu ve pipeline run kimliği koymak.
6. Ciphertext hash, boyut, nonce ve codec bilgisini manifest v3'e yazmak.
7. Manifesti pipeline signing key ile imzalamak ve mümkünse creator grant'ine bağlamak.
8. DEK share'lerini KMS'e yazıp threshold readback ile doğrulamak.

Media Delivery Worker, Lighthouse ve R2 yalnız ciphertext görür. IV/nonce ve manifest gizli değildir; asıl sır DEK'tir.

### 6.2 Manifest v3 ihtiyacı

Mevcut manifest v2 tek rendition içindir. Büyük video çalışması şunları taşıyan v3 gerektirir:

- Birden fazla rendition ve bandwidth/resolution bilgisi.
- Rendition bazlı init segment ve segment dizisi.
- Audio/subtitle track bilgisi.
- `profileVersion`, `sourceHash`, `pipelineRunId`.
- AES-GCM nonce/AAD sürümü ve ciphertext hash'i.
- R2/Lighthouse lokasyonları değil, içerik kimliği ve fallback sırası.
- Manifest imzası ve readiness/persistence kanıtı referansı.

NEAR üzerinde büyük manifest tutulmamalıdır. Stable `videoUuid` ve final üst manifest CID'i bağlamak yeterlidir.

### 6.3 Lighthouse rolü

Lighthouse'a yalnız hazır ciphertext gönderilmelidir. Lighthouse'ın Kavach/chain gating akışı eklenmemelidir; bu ikinci bir anahtar ve erişim otoritesi yaratır, ayrıca resmi desteklenen zincir listesinde NEAR bulunmuyor. Kaynaklar: [Lighthouse encrypted data](https://docs.lighthouse.storage/how-to/upload-encrypted-data/), [supported chains](https://docs.lighthouse.storage/how-to/encryption-features/chains-supported).

Lighthouse'ın güncel S3 katmanında nesne başına 5 GiB sınırı, tek aktif keypair ve IAM/bucket policy eksikliği belgeleniyor. Bir Livepeer output token'ını doğrudan Lighthouse'a vermek en az yetki ilkesini bozar. Ciphertext segmentleri 5 GiB'den küçük olacağından sealer'ın segment bazlı yazması uygundur. Kaynaklar: [Lighthouse L3 limits](https://docs.lighthouse.storage/s3/reference/limits), [supported S3 operations](https://docs.lighthouse.storage/s3/reference/supported-operations).

Lighthouse JS SDK'nın encrypted upload yolu güncel kaynakta Node tarafında `readFileSync`, tarayıcıda `readAsArrayBuffer` kullanır. Çok GB master için bu API kullanılmamalıdır. YouTick stream şifreleyip hazır ciphertext yüklemelidir. Kaynaklar: [Node encrypted upload](https://github.com/lighthouse-web3/lighthouse-package/blob/9b35c67d7f1aa8a2f8827c40e6e68b8ece83bb79/src/Lighthouse/uploadEncrypted/encrypt/file/node.ts), [browser encrypted upload](https://github.com/lighthouse-web3/lighthouse-package/blob/9b35c67d7f1aa8a2f8827c40e6e68b8ece83bb79/src/Lighthouse/uploadEncrypted/encrypt/file/browser.ts).

Master saklanacaksa tek dev blob yerine sabit boyutlu şifreli bloklar + kök manifest/CAR kullanılmalı ve delivery anahtarından ayrı archive DEK korunmalıdır.

### 6.4 R2 hot mirror

R2'de yalnız şifreli init/segment/manifest tutulursa bunlar custom domain üzerinden cache edilebilir. KMS/NEAR kontrolü her dört saniyelik segmentte değil, playback session başında yapılmalıdır. Viewer kısa ömürlü key grant'i aldıktan sonra ciphertext doğrudan cache'den gelebilir.

Hot mirror politikası:

- Yeni yayınlar: 7-30 gün.
- Son 30 günde izlenen içerik: uzat.
- Soğuk içerik: Lighthouse-only; ilk istekle R2'ye yeniden ısıt.
- Takedown: R2 purge + KMS deny + NEAR ban + Lighthouse unpin/delete birlikte.

IPFS üzerinde ciphertext'in üçüncü taraf kopyaları kalabilir. Güvenli silme, anahtarın geri verilmemesi ve ciphertext'in baştan itibaren anlamsız olmasıyla sağlanır. Lighthouse da public kopyaların tümünün silineceğini garanti etmez. Kaynaklar: [Lighthouse pricing/FAQ](https://lighthouse.storage/), [Lighthouse terms](https://gateway.lighthouse.storage/ipfs/bafkreidx6qtkebzxqjgcei5vhbfsfk2uf7iyaypppgvmhophv7q255x6x4).

## 7. Publish sırası ve job durumları

Tek `ready: true/false` alanı yeterli değildir:

```text
DRAFT
  -> UPLOADING
  -> UPLOADED
  -> VALIDATING
  -> TRANSCODING
  -> SEALING
  -> KMS_VERIFIED
  -> LIGHTHOUSE_UPLOADED
  -> DURABILITY_VERIFIED
  -> READY_TO_PUBLISH
  -> PUBLISHED

Yan durumlar: FAILED, QUARANTINED, ABANDONED, REVOKED
```

Kurallar:

- R2 event/Queue mesajı yalnız metadata taşır ve tekrar gelebilir.
- Her adım idempotent ve compare-and-set durum geçişli olur.
- `READY_TO_PUBLISH` öncesi manifest readback, segment örnek doğrulaması, KMS threshold ve Lighthouse gateway kontrolü zorunludur.
- Lighthouse upload ile Filecoin deal hazır durumu aynı kabul edilmez. Paid satış başlamadan durability seviyesi açıkça doğrulanmalıdır. Kaynak: [Lighthouse Filecoin deal status](https://docs.lighthouse.storage/how-to/check-for-filecoin-deals).
- Creator final publish'i imzalamazsa reaper R2 plaintext'i hemen, ciphertext staging'i politika süresi sonunda temizler; KMS share'leri revoke eder.
- Publish sonrası plaintext source/output ve Livepeer asset silinme kanıtı audit loga yazılır.

## 8. Tehdit modeli ve kontroller

| Tehdit | Kontrol | Kabul kriteri |
|---|---|---|
| Sahte/çok büyük upload ile maliyet saldırısı | NEAR auth, byte/duration quota, cost reservation, prefix-scoped credential | Yetkisiz kullanıcı multipart başlatamaz |
| Credential çalınması | Kısa TTL, tek prefix, yalnız gerekli multipart actions | Başka job/bucket okunamaz veya silinemez |
| MIME spoof/bozuk medya | İzole ffprobe/decode probe, süre/codec limitleri | Kötü dosya transcode queue'ya geçmez |
| Plaintext sızıntısı | Private bucket, kısa lifecycle, secretsiz log, ayrı source/output token | Başarıdan sonra belirlenen süre içinde plaintext kalmaz |
| Dönüştürücü ele geçirilmesi | Tek job erişimi, egress allowlist, ayrı sealer, output doğrulama | Transcoder KMS share veya final DEK göremez |
| Segment değiştirme/replay | AES-GCM, benzersiz nonce, AAD, ciphertext hash, signed manifest | Bir byte değişikliği playback öncesi reddedilir |
| Queue/webhook replay | HMAC/signature, timestamp, event ID, idempotency | Tek job yalnız bir final sonuç üretir |
| Publish-before-ready | Durum makinesi ve NEAR final gate | Durability/KMS başarısızsa satış başlayamaz |
| Orphan blob/share | Reaper, lifecycle, revoke/unpin | Hata enjeksiyonundan sonra artıklar SLA içinde temizlenir |
| Takedown | NEAR ban, KMS deny, R2 purge, Lighthouse unpin/delete | Yeni session anahtar alamaz; hot copy temizlenir |
| Sağlayıcı kesintisi | R2/Lighthouse encrypted fallback ve circuit breaker | Anahtar katmanı medya fallback'ten bağımsız kalır |

### DRM sınırı

Segment AES-GCM + KMS, depolama sağlayıcısının ve yetkisiz kullanıcının plaintext'e erişimini engeller. Ancak yetkili izleyicinin tarayıcısı anahtarı alır ve videoyu çözer. Bu yüzden mevcut model:

- Widevine/FairPlay/PlayReady değildir,
- ekran kaydını engellemez,
- studio-grade HDCP veya hardware-backed key iddiası taşımaz.

Yüksek değerli film lisansı bunları istiyorsa ayrı bir CMAF/CENC multi-DRM lisans katmanı gerekir. NEAR entitlement kararı DRM lisans isteğini besleyebilir; YouTick KMS mimarisi tek başına DRM diye pazarlanmamalıdır.

## 9. Sağlayıcı uyum karşılaştırması

| Seçenek | Büyük master | KMS/NEAR uyumu | Kalite kontrolü | Operasyon | Karar |
|---|---|---|---|---|---|
| Mevcut tarayıcı yolunda limiti artır | Çok zayıf | Mevcut | Transcode/ABR yok | İlk bakışta düşük, gerçekte hata yüksek | Reddet |
| Cloudflare Stream end-to-end | <30 GB | İkinci access truth yaratır | 1080p SDR/stereo sınırı | Çok düşük | Fragman/UGC dışında ana hat değil |
| Livepeer VOD end-to-end | <30 GB | Livepeer key/policy ekler | Yönetilen ABR | Düşük | Reddet |
| R2 + Livepeer processing-only + sealer | <30 GB | Yüksek | Profil kontrollü, vendor sınırları var | Orta | Varsayılan pilot |
| R2 + özel GPU + sealer | R2 limitlerine kadar | En yüksek | En yüksek | Yüksek | Premium/büyük dosya hattı |
| İki hatlı model | En iyi kapsama | En yüksek | İçerik politikasına göre | Orta-yüksek | Nihai öneri |

Cloudflare Stream'in mevcut resmi özellikleri; dosya <30 GB, 200 MB üzerinde TUS, H.264 360p-1080p, HDR -> SDR ve ikiden fazla ses kanalında stereo dönüşümüdür. Depolama 5 USD/1.000 dakika, delivery 1 USD/1.000 dakika ve encoding/ingress ücretsizdir. Kaynaklar: [Stream pricing](https://developers.cloudflare.com/stream/pricing/), [upload limits](https://developers.cloudflare.com/stream/uploading-videos/), [Stream FAQ](https://developers.cloudflare.com/stream/faq/).

Bu nedenle Cloudflare Stream, ana film/konser kataloğu yerine fragman, kısa UGC veya düşük riskli 1080p SDR içerik için ayrı ürün seçeneği olabilir.

## 10. Maliyet modeli

### 10.1 Birim fiyatlar

| Hizmet | 18 Temmuz 2026 liste fiyatı | Not |
|---|---:|---|
| R2 Standard storage | 0,015 USD/GB-ay | 10 GB free |
| R2 Class A | 4,50 USD/milyon | 1 milyon free |
| R2 Class B | 0,36 USD/milyon | 10 milyon free |
| R2 internet egress | 0 USD | Her storage class için |
| Livepeer transcode | 0,33 USD/60 dk | Growth minimum 100 USD/ay |
| Livepeer storage | 0,09 USD/60 dk | Süre bazlı |
| Livepeer delivery | 0,03 USD/60 viewer-dk | İzlenme büyüdükçe ana gider |
| Cloudflare Stream storage | 5 USD/1.000 dk | Encoding/ingress dahil |
| Cloudflare Stream delivery | 1 USD/1.000 viewer-dk | Süre bazlı |
| Lighthouse Lite | 12 USD/ay / 500 GB | Add-on/gateway/aşım açık değil |
| Lighthouse Pro | 20 USD/ay / 1 TiB | Aynı belirsizlikler |
| Lighthouse Premium | 49 USD/ay / 2,5 TB | Daha büyük katalog için quote |

Kaynaklar: [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Livepeer pricing](https://livepeer.studio/pricing), [Stream pricing](https://developers.cloudflare.com/stream/pricing/), [Lighthouse pricing](https://lighthouse.storage/).

Livepeer Growth minimumu yalnız transcode kullanımında yaklaşık `100 / 0,0055 = 18.182` transcode dakikasına, yani yaklaşık 151 adet iki saatlik filme kadar liste kullanımını gölgeler. Düşük hacimli pilotta “film başı 0,66 USD” görünse de fatura en az 100 USD olacaktır.

### 10.2 Örnek büyüme senaryosu

Varsayımlar:

- Ayda 100 yeni film.
- Film başına 120 dakika ve 20 GB source.
- Toplam source ingest: 2 TB/ay.
- R2 plaintext staging: ortalama 2 gün.
- Katalogdaki bu 100 film için toplam şifreli rendition boyutu: yaklaşık 720 GB.
- Ayda 5.000 tam izleme = 600.000 viewer-dakika.
- Dört saniyelik segment: audio düzenine göre yaklaşık 9-18 milyon segment GET.

#### Önerilen processing-only model

| Kalem | Yaklaşık aylık maliyet |
|---|---:|
| R2 source staging | 2.000 GB x 2/30 x 0,015 = 2 USD |
| R2 encrypted hot mirror | (720-10) x 0,015 = 10,65 USD |
| R2 Class B | 0-2,88 USD |
| Livepeer transcode | 12.000 dk x 0,0055 = 66 USD; minimum nedeniyle 100 USD |
| Lighthouse, yalnız 720 GB delivery bundle | Pro plan liste fiyatıyla 20 USD |
| Workers tabanı | En az yaklaşık 5 USD; CPU/Queue ek olabilir |
| **Görünen taban** | **Yaklaşık 137,65-140,53 USD/ay** |

Bu toplam şunları içermez: sealer compute, özel GPU işleri, KMS operatörleri, observability, Livepeer retry/profile katsayısı, Lighthouse gateway/add-on/aşım, destek, vergiler ve kurumsal SLA. R2 source staging 2 USD bu tabloda ayrıca gösterilmiştir; taban toplamın içindedir.

Source master da Lighthouse'ta tutulursa 2 TB master + yaklaşık 720 GB rendition = 2,72 TB olur ve halka açık 2,5 TB Premium planını aşar. Bu durumda enterprise quote gerekir. Master korunmayacaksa future re-encode olanağı kaybolur; ürün kararı açık verilmelidir.

#### Cloudflare Stream end-to-end

- Storage: `100 x 120 / 1.000 x 5 = 60 USD`.
- Delivery: `600.000 / 1.000 x 1 = 600 USD`.
- Toplam: yaklaşık **660 USD/ay**.

Encoding ve bandwidth dahildir; fakat KMS/Lighthouse modeli, >30 GB master, 4K/HDR ve çoklu ses gereksinimi karşılanmaz.

#### Livepeer end-to-end

- Transcode: 66 USD.
- Storage: `12.000 x 0,0015 = 18 USD`.
- Delivery: `600.000 x 0,0005 = 300 USD`.
- Toplam: yaklaşık **384 USD/ay**.

Bu seçenek Stream'den ucuz görünür ama Livepeer erişim ve key modeli devreye girer; YouTick KMS tek otorite olmaktan çıkar. Önerilen modelde Livepeer delivery/storage kullanılmadığı için izlenme maliyeti R2/Lighthouse tarafına taşınır.

### 10.3 Maliyet kararı

- Geçici source/output bucket için **R2 Standard** kullan. Infrequent Access minimum 30 gün ve retrieval ücreti yüzünden birkaç günlük staging için pahalıdır.
- Livepeer'i yalnız transcode dakikası için kullan; storage/delivery'yi kalıcı mimarinin parçası yapma.
- R2 hot mirror bütün katalog için sabit değil, yeni/popüler içerik için dinamik olsun.
- Gerçek maliyet telemetry'sinde `sourceGB`, `outputGB`, `transcodeMin`, `retryMin`, `viewerMin`, `segmentRequests`, `hotGBDays` ve `lighthouseBytes` ayrı tutulmalı.
- Ürün upload ücreti veya creator quota bu ölçülerden türetilmeli; storage maliyeti sıfır varsayılmamalı.

## 11. Veri yerleşimi, sözleşme ve telif

R2 EU jurisdiction, nesnelerin AB içinde saklanıp işlenmesini garanti eder; location hint yalnız performans ipucudur. R2 bucket oluşturulduktan sonra jurisdiction değişmez. Kaynak: [R2 data location](https://developers.cloudflare.com/r2/reference/data-location/).

Bu garanti Livepeer processing için otomatik geçerli değildir. Livepeer kullanılmadan önce yazılı olarak şu maddeler alınmalıdır:

- DPA ve subprocessor listesi.
- Plaintext'in işlendiği bölgeler.
- Source/output retention ve backup davranışı.
- Job tamamlanınca silme kanıtı.
- Incident/breach bildirim süresi.
- SLA, retry ve veri kaybı sorumluluğu.
- 30 GB, codec, rendition ve çoklu audio sınırları.
- Transcode fiyatının her rendition/profile ile çarpılıp çarpılmadığı.

Lighthouse'ın herkese açık şartları “permanent/forever” ifadesini sonsuz saklama garantisi saymıyor; üçüncü taraf IPFS/Filecoin ağlarına ve hizmetin devamına bağlıyor. Hassas içerik baştan şifrelenmeli ve tek kopya/tek SLA gibi kabul edilmemelidir. Kaynak: [Lighthouse terms](https://gateway.lighthouse.storage/ipfs/bafkreidx6qtkebzxqjgcei5vhbfsfk2uf7iyaypppgvmhophv7q255x6x4).

Film/konser telif akışında:

- Uploader rights attestation zorunlu.
- Moderasyon/hash kontrolü immutable persistence ve satıştan önce.
- Takedown runbook zincir banı, KMS deny, R2/cache purge ve Lighthouse unpin/delete'i tek olay altında yürütür.
- Lighthouse/IPFS üçüncü taraf ciphertext kopyalarının tamamının silineceği vaat edilmez.
- En yüksek telif riski olan katalog için Lighthouse Permanent yerine silinebilir sözleşme/plan ve yazılı SLA seçilmelidir.

## 12. Uygulama yol haritası

### Faz 0 - Ürün ve güvenlik sözleşmesi

- Azami source boyutu, süre, codec, HDR/audio ve arşiv politikası belirlenir.
- Standart ve yüksek güven profilinin hangi içeriklere uygulanacağı yazılır.
- Livepeer/Lighthouse DPA, SLA, retention ve kota cevapları alınır.
- “KMS DRM değildir” ürün ve hukuk belgelerine girer.

**Çıkış ölçütü:** Desteklenen master matrisi ve sağlayıcı kabul/red kapıları imzalıdır.

### Faz 1 - R2 resumable ingest

- Job kaydı, quota reservation ve NEAR creator grant.
- Prefix-scoped temporary credential.
- Multipart uploader + IndexedDB/server resume ledger.
- Checksum, abort, lifecycle ve orphan reaper.
- Mevcut 64 MB yolu büyük dosya için açılmaz.

**Çıkış ölçütü:** 5/20/50 GB dosya ağ kesintisi ve refresh sonrası devam eder; video byte hiçbir Worker'dan geçmez.

### Faz 2 - Livepeer processing-only PoC

- 5 GB, 20 GB, 29 GB ve >30 GB test matrisi.
- Presigned GET input, ayrı R2 output bucket.
- 360p/720p/1080p fMP4, aligned GOP.
- Webhook signature/replay, retry ve deletion kanıtı.
- 30 GB üstü açıkça özel hatta route edilir.

**Çıkış ölçütü:** R2 -> Livepeer -> R2 byte/codec/hash doğrulaması ve film başı gerçek maliyet raporu vardır.

### Faz 3 - Sealer, KMS ve Lighthouse

- Bounded-memory stream encryption.
- Manifest v3 ve ABR integrity.
- Job-scoped KMS share write/readback grant.
- Lighthouse ciphertext upload, gateway readback ve durability state.
- Plaintext lifecycle/deletion audit.

**Çıkış ölçütü:** Değiştirilmiş segment reddedilir; KMS/Lighthouse başarısızken publish mümkün değildir.

### Faz 4 - ABR playback ve encrypted hot mirror

- Manifest v3 player ve bandwidth-based rendition switching.
- R2 custom domain/cache; yalnız ciphertext.
- Lighthouse fallback ve hot-cache policy.
- NEAR ban/KMS revoke/takedown testi.

**Çıkış ölçütü:** Mobil, masaüstü ve TV/browser matrisinde rendition geçişi; provider outage fallback; erişim revoke SLA ölçülür.

### Faz 5 - Büyük/premium özel hat

- EU GPU compute veya sözleşmeli encoder.
- >30 GB, 4K/HDR, 5.1 ve subtitle testleri.
- Gerekliyse CMAF/CENC multi-DRM ve forensic watermark.
- Capacity/autoscaling ve job cost guardrail.

**Çıkış ölçütü:** 50 GB+ gerçek konser master'ı bounded memory ile işlenir ve profil sözleşmesi kayıpsız doğrulanır.

## 13. Üretim öncesi zorunlu test matrisi

En az şu gerçek medya örnekleri kullanılmalıdır:

- 5 GB standart H.264/AAC.
- 20 GB iki saatlik film.
- 29 GB Livepeer sınır altı master.
- 30 GB üstü 4K/HDR uzun konser.
- ProRes MOV.
- 5.1 sesli film.
- Bozuk/truncated dosya ve yanlış MIME.

Başarı ölçütleri:

- Upload refresh/offline sonrası byte kaybetmeden devam eder.
- Peak browser ve sealer belleği dosya boyutuyla doğrusal büyümez.
- Duplicate Queue/webhook tek final asset üretir.
- Credential başka prefix/bucket'a erişemez.
- Livepeer output profilleri ve R2 credential davranışı gerçek hesapta doğrulanır.
- Transcode crash sonrası retry aynı job'ı güvenli tamamlar.
- Bir bit değiştirilen segment AES-GCM doğrulamasından geçmez.
- KMS threshold eksikse publish durur.
- Lighthouse upload/readback/deal ayrımı ölçülür.
- R2 ve Lighthouse fallback seek/Range performansı ölçülür.
- Source/output plaintext başarı ve hata yollarında SLA içinde silinir.
- NEAR ban/KMS revoke yeni playback session'ı hedef sürede keser.
- 2 saatlik içerik ve 1.000 tam izleme başına gerçek maliyet dashboard'da görünür.

## 14. Açık kararlar ve tedarikçi soruları

Kod başlamadan şu cevaplar gereklidir:

1. Ürün limiti 30 GB mı olacak, yoksa ilk günden özel >30 GB hat zorunlu mu?
2. Source master Lighthouse'ta şifreli arşivlenecek mi; ne kadar süre tutulacak?
3. 4K/HDR, 5.1, çoklu audio ve subtitle ilk sürüm şartı mı?
4. Hangi içerik sınıfında Livepeer'in plaintext işlemesi kabul edilebilir?
5. Livepeer R2 `sessionToken` destekliyor mu; output credential prefix/job kapsamına daraltılabiliyor mu?
6. Livepeer transcode dakikası rendition sayısı, codec, 4K ve retry ile nasıl faturalandırılıyor?
7. Livepeer DPA, processing region, subprocessor ve deletion SLA nedir?
8. Lighthouse gateway bandwidth/API/aşım/add-on fiyatları nedir?
9. Lighthouse Annual/Permanent silme ve Filecoin deal SLA'sı hangi sözleşmeyle garanti edilir?
10. Lisanslı katalog gerçek DRM/HDCP/forensic watermark gerektiriyor mu?

## 15. Nihai öneri

1. **Bugün limit sabitini yükseltme.** Mevcut 64 MB koruması yeni pipeline hazır olana kadar güvenlik bariyeridir; ayrıca Worker hata fallback'i main-thread'e düşmeyecek şekilde ileride kapatılmalıdır.
2. **R2 Standard'ı evrensel ingest ve transient çalışma alanı yap.** Doğrudan multipart, kısa ömürlü ve job-scoped yetki kullan; büyük body'yi Worker'dan geçirme.
3. **Livepeer'i yalnız processing-only adaptör olarak kullan.** 30 GB altı, uygun codec/hak profilinde maliyet ve hız avantajı sağlar; KMS/storage/delivery ona verilmez.
4. **30 GB üstü ve premium içerik için özel GPU hattını aynı job sözleşmesine bağla.** Bu, konser/film ürününün gerçek büyük master ihtiyacını karşılar.
5. **Çıktıyı YouTick sealer'da stream ederek AES-GCM ile şifrele.** KMS/NEAR tek erişim gerçeği olarak kalır; Lighthouse yalnız ciphertext kalıcılığı sağlar.
6. **R2'yi encrypted hot mirror olarak ölçüme bağlı kullan.** Livepeer/Stream dakika bazlı delivery yerine R2'nin ücretsiz egress ve düşük request maliyeti ölçek avantajı sağlar.
7. **KMS doğrulama ve Lighthouse durability tamamlanmadan paid publish/satış başlatma.** Job state ve orphan cleanup zorunludur.
8. **Studio-grade içerikte DRM gereksinimini ayrıca kararlaştır.** Bugünkü browser KMS çözümü erişim kontrolüdür, kopya koruması değildir.

Bu yaklaşım mevcut Lighthouse + KMS + NEAR yatırımını korur, R2 ile büyük yüklemeyi güvenli ve ucuz hale getirir, Livepeer'i değiştirilebilir bir maliyet optimizasyonu olarak kullanır ve Livepeer'in 30 GB/güven sınırının YouTick ürün limitine dönüşmesini engeller.

## Resmi kaynaklar

### Cloudflare

- [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [R2 limits](https://developers.cloudflare.com/r2/platform/limits/)
- [R2 multipart uploads](https://developers.cloudflare.com/r2/objects/upload-objects/)
- [R2 temporary credentials](https://developers.cloudflare.com/r2/api/s3/temporary-credentials/)
- [R2 lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
- [R2 data security](https://developers.cloudflare.com/r2/reference/data-security/)
- [R2 data location](https://developers.cloudflare.com/r2/reference/data-location/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Stream pricing](https://developers.cloudflare.com/stream/pricing/)
- [Cloudflare Stream uploads](https://developers.cloudflare.com/stream/uploading-videos/)
- [Cloudflare Stream FAQ](https://developers.cloudflare.com/stream/faq/)
- [Cloudflare Containers limits](https://developers.cloudflare.com/containers/platform-details/limits/)

### Livepeer

- [Pricing](https://livepeer.studio/pricing)
- [API support matrix](https://docs.livepeer.org/v1/references/api-support-matrix)
- [Transcode API](https://docs.livepeer.org/v1/api-reference/transcode/create)
- [Upload/resumable asset](https://docs.livepeer.org/v1/developers/guides/upload-video-asset)
- [Encrypted assets](https://docs.livepeer.org/v1/developers/guides/encrypted-asset)
- [JWT access control](https://docs.livepeer.org/v1/developers/guides/access-control-jwt)
- [Webhook access control](https://docs.livepeer.org/v1/developers/guides/access-control-webhooks)
- [Terms](https://livepeer.studio/terms-of-service)

### Lighthouse

- [Pricing and FAQ](https://lighthouse.storage/)
- [L3 S3 limits](https://docs.lighthouse.storage/s3/reference/limits)
- [L3 supported operations](https://docs.lighthouse.storage/s3/reference/supported-operations)
- [Supported chains](https://docs.lighthouse.storage/how-to/encryption-features/chains-supported)
- [Encrypted upload](https://docs.lighthouse.storage/how-to/upload-encrypted-data/)
- [Delete file](https://docs.lighthouse.storage/how-to/delete-file)
- [Filecoin deal status](https://docs.lighthouse.storage/how-to/check-for-filecoin-deals)
- [Terms](https://gateway.lighthouse.storage/ipfs/bafkreidx6qtkebzxqjgcei5vhbfsfk2uf7iyaypppgvmhophv7q255x6x4)
