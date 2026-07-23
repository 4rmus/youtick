# StorageManifestV1

`StorageManifestV1`, YouTick paid-media ciphertext envanterinin sağlayıcıdan
bağımsız persistence sözleşmesidir. `job_id`, quote/policy, bucket/key, ETag,
provider receipt ve signed URL bu manifestin dışında kalır.

## Canonical byte ve kökler

Şema yalnız sabit ASCII alan adları, ASCII protokol stringleri, `null` ve
`Number.MAX_SAFE_INTEGER` sınırındaki tam sayıları kabul eder. Float ve dinamik
map yoktur. `network_id` yalnız `mainnet|testnet`; `nft_contract_id` canonical
NEAR account ID'dir. Alanlar RFC 8785 sırasıyla yazılıp boşluksuz UTF-8 JSON
üretilir. Canonical readback, parse edilen değeri yeniden yazmakla yetinmez;
gelen byte'ı üretilen byte ile birebir karşılaştırır. Canonical manifest en
fazla 16 MiB, object envanteri en fazla 10.000 kayıttır. Bu sınır L3 multipart
limiti değil, private-beta manifest compute limiti ve ayrıca job quote/policy
kapısıdır.

Provider/replica readback doğrulaması TypeScript'te yalnız
`parseCanonicalStorageManifestV1`, Rust'ta yalnız
`StorageManifestV1::from_canonical_json` kullanmalıdır. Gevşek object/JSON
parserları yalnız sunucunun doğrulanmış envanterden manifest kurma yolundadır.

```text
manifest_root = SHA256(canonical StorageManifestV1 bytes)
leaf(i)       = SHA256(0x00 || canonical objects[i] bytes)
node(l, r)    = SHA256(0x01 || l || r)
```

`inventory_root`, RFC 9162 §2.1.1 ağacıdır: yapraklar `ordinal` sırasındadır,
`n` yaprak `n`den küçük en büyük ikinin kuvvetinde bölünür ve tek kalan yaprak
kopyalanmaz. Kökler lowercase hex olarak manifest dışında taşınır.
`asset_root_cid`, aynı canonical manifest byte'ının persistence sonrası CID'sidir;
kendi kendine referansı önlemek için manifestte bulunmaz.

## Ciphertext zarfı ve AAD

Her object ayrı AES-256-GCM mesajıdır. `nonce_b64`, 12 byte nonce'un canonical
standard Base64 karşılığıdır. Object byte'ı yalnız `ciphertext || 16-byte tag`
olduğundan `byte_length = plaintext_length + 16` olmalıdır.

`youtick.media-object-aad.v1`, aşağıdaki sabit alanların aynı canonical JSON
kurallarıyla üretilen UTF-8 byte'ıdır:

```text
aad_version, content_id, duration_ms, encryption_generation, network_id,
nft_contract_id, ordinal, path, plaintext_length, rendition, role, sequence,
start_ms, track_id, version_id
```

Nonce aynı encryption generation içinde tekrar edemez. `objects[]` sırası
kesintisiz `ordinal` değeridir; path benzersiz ve normalize ASCII relative
POSIX path olmalıdır. Track listesi `track_id` artan sıradadır. V1 yalnız
audio/video `init|segment` nesnelerini taşır. Tek global init (`track_id=null`)
veya her track için tam bir init seti gerekir; ikisi karıştırılmaz. Her track en
az bir segment taşır. Segment sequence değerleri kesintisiz, zamanları
monotonic/non-overlap ve bitişleri media duration sınırı içindedir.

CID yalnız canonical lowercase CIDv1/base32; codec `raw` veya `dag-pb`, multihash
`sha2-256/32-byte` ise kabul edilir. Lighthouse L3'ün object ve manifest byte'ı
için hangi codec'i döndürdüğü gerçek-hesap canary'sinde sabitlenene kadar
`asset_root_cid` üretimi ve signer katmanı production kapısıdır.
