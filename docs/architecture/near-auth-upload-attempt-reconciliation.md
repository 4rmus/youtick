# Mevcut Google upload denemesi — salt-okunur uzlaştırma

Gate: `NEAR_AUTH_UPLOAD_ATTEMPT_RECONCILIATION` — 21 Eylül 2026.
Sonuç: **BLOCKED**. Bulunan sponsor işlemi doğrulandı; son kullanıcı
denemesiyle eşleşme teyidi bekleniyor. Yeni imza, teklif, ödeme, relay veya
upload başlatılmadı.

## Kapsam

Yazılabilir dosyalar yalnız bu rapor ve `near-auth-integration-status.md`.
Uygulama/kontrat/Bridge kaynakları, bağımlılıklar, config, kullanıcı logları,
tarayıcı/cüzdan depoları ve Git index korunur. Ana ajan tek başına çalıştı;
yeni alt ajan açılmadı. NEAR Auth, ödeme akışı ve NEAR API skill sınırları
uygulandı. Kabul: aynı denemenin hesap/sponsor/job/delegate özeti/outer hash
bağını göstermek; sponsor imzası, USDC ödeme ve yayın sonucunu ayrı kaydetmek.

## Kimlik kaynağı ve tarayıcı sınırı

Kullanıcı Meteor işlem hash'inin elinde olmadığını bildirdi. Mevcut Brave
`http://localhost:3000/auth-lab` sekmesinin görünür arayüzü salt-okunur
incelendi; giriş başarılı, upload formu kapalı ve işlem/job kimliği görünmüyor.
Sayfa yenilenmedi, sponsor seçilmedi; DevTools, storage tablosu, token veya
özel anahtar okunmadı. Yerel attempt kaydının `delegateSha256`/`outerHash`
alanları doğrudan okunmuş değildir.

Önceki 18 Eylül public indexer kaydında aday olarak bulunan işlem, bu gate'te
arşiv NEAR RPC ile doğrulandı. Eski kayıt tek başına kanıt sayılmadı.
İlk FastNear işlem kontrolü sonuçlandırılamadı; resmi arşiv RPC kontrolü
başarılı oldu. Ham işlem yanıtı (kimlik tokenı içerebilir) dosyaya veya araç
çıktısına yazılmadı; yalnız aşağıdaki güvenli alanlar saklandı.

## PROVIDER — sponsor/MPC sonucu

- Dış işlem: `G6vD1z5Z7g4nwww3GosR3JbrK2Gv8Se9AZ4jf89D71BX`.
- Sponsor: `utick2.testnet`; alıcı: `fast-auth.testnet`; tek `sign` çağrısı.
- Sonuç: **FINAL + başarılı**; makbuzlarda Failure yok.
- İmzalanan delegate'in göndereni ve Ed25519 açık anahtarından oluşan hesap:
  `37729f76f581ce6e2cc9cc08e48b9f098158cf4bd044d62fe2a9f4bfd06c23d9`.
  Bu, önceki ön kontrol raporundaki Google hesabıyla eşleşir.
- Delegate özeti:
  `ceaac01e6e659891ec968764710cc9aaf5881ae0c50ff0144b5a21dce023fc8d`.
- Orijinal delegate baytlarının yeniden kodlanması birebir aynı; dönen MPC
  imzası aynı baytların SHA-256 özeti ve hesap açık anahtarıyla doğrulandı.
  Tokenın işlem baytları da aynı payload ile eşleşti. Token tekrar kullanım
  için kabul edilmedi; geçmiş saate çekilmiş uygulama doğrulaması yapılmadı.
- İç çağrı: Circle testnet USDC `ft_transfer_call`, 100 TGas, 1 yoctoNEAR;
  hedef `video-market-v1-260907.youtick-dev-v3.testnet`.
- Job: `lp-5ec847aa-e9aa-4c56-be21-e775fc6faeba`.
- Başlık: `Distance-test-`; dosya boyutu: **9.452.298 bayt**.
- Onaylanan video toplam bedeli: **600000 mikro test USDC**.
  Bu değer imzalanmış istektir; gerçekleştirilmiş transfer kanıtı değildir.
- Quote zamanı: **18 Eylül 21:37:35.603 UTC / 19 Eylül 00:37:35.603 Türkiye**.
- İşlem ve alt makbuzların toplam `tokens_burnt` değeri:
  **3832266763459300000000 yoctoNEAR = 0,0038322667634593 test NEAR**.
  Bu makbuz toplamıdır; sponsor hesabının bütün geçmiş bakiye hareketlerinin
  muhasebesi değildir.

## PROVIDER — video işi ve USDC durumu

21 Eylül **16:24:24 UTC**, final blok **269617487**,
hash `DiytfitRTs6g5Hvofs1awcbFG61JNgcpeRYS1EHGTkJs`.
Bütün aşağıdaki çağrılar aynı blok hash'ine sabitlendi:

| Sorgu | Sonuç |
| --- | --- |
| Doğrulanan delegate içindeki job için `get_media_job` | `null` |
| Aynı kimlikle `get_publication` | `null` |
| Kayıtlı Google hesabı `ft_balance_of` | **600000 mikro / 0,60 test USDC** |

Dolayısıyla bu job için mevcut zincir durumunda ücretli iş veya yayın yok.
Bu, hiç relay denenmediğini ya da geçmişte herhangi bir FT transfer/iade
olmadığını tek başına kanıtlamaz. Sponsor imzası başarısı video ödeme
başarısına eşit değildir. Tam relay/FT işlem geçmişi bu gate'te bulunmadı.

Önceki `lp-85827ca5-1d4a-4ce5-9dc4-814cac141d1d` kimliği de final blok
269617009'da null döndü; artık bulunan işlemdeki job ile karıştırılmıyor.

## Karar ve devam sınırı

Bulunan işlem için MPC imza sonucu doğrulandı. Kullanıcıya tarih, başlık,
dosya boyutu ve sponsor sunularak bunun son hata alınan deneme olup olmadığı
soruldu; teyit bekleniyor. Yerel attempt digest eşleşmesi doğrudan okunmadı.
Teyit olmadan aday işlem son deneme diye kabul edilmez.

Eski quote/delegate yeniden gönderilmez; bekleyen kayıt silinmez veya
anahtar değiştirilmez. Salt-okunur uzlaştırma yeni ücretli deneme yetkisi
vermez. Önceki hassas çıktı olayının kapanışı bu gate ile doğrulanmış değildir.

## Doğrulama ve dosyalar

Kanıt dizini:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-attempt-reconciliation-M0dJ8t/`.
`public-state.json` eski kimliğe ait ilk okumayı, `candidate-verified.json`
MPC doğrulamasını, `candidate-job-state.json` aynı bloktaki iş/yayın/bakiyeyi
saklar. Ham token, private key, imzalı delegate/proof kopyası saklanmadı.

[Mevcut uzlaştırma kılavuzu](./near-auth-upload-safety.md#belirsiz-işlemde-salt-okunur-operatör-kontrolü)
ve [resmî salt-okunur NEAR RPC yöntemi](https://docs.near.org/api/rpc/contracts)
esas alındı. Uygulama değişmediği için Web/Bridge/Market testleri yeniden
çalıştırılmadı; doküman build/bağlantı kontrolü geçti; kapsam ve Git index koruması doğrulandı.
CI, deploy, ödeme, upload ve HLS **EXTERNAL_NOT_RUN**.

**Tek sonraki adım:** aynı `NEAR_AUTH_UPLOAD_ATTEMPT_RECONCILIATION` gate’inde
bulunan işlemin son denemeye ait olduğunun teyidini tamamlamak. Yeni canlı
kabul veya kurtarma uygulaması gate’i açılmadı.
