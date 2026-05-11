# YouTick Overview

> Creator-first video platform with encrypted delivery and on-chain access

---

## YouTick nedir?

YouTick, creator'larin videolarini sifreli sekilde yukleyip NFT ticket ile satabildigi bir platformdur.

Temel fikir cok basit:

1. Creator videoyu yukler.
2. Uygulama videoyu browser'da sifreler.
3. Sifreli medya Storage API uzerinden Lighthouse/IPFS'e gider.
4. AES anahtari Shamir ile paylara bolunur ve birden fazla KMS operator'e dagitilir.
5. Izleyici ticket satin alir ya da hediye/trial ile erisim kazanir.
6. Access-control kontratinda Play grant olusturulur.
7. Player, operator'lerden yeterli payi toplayip anahtari reconstruct eder ve videoyu acar.

---

## Neden farkli?

| Alan | YouTick yaklasimi |
|------|-------------------|
| Gelir payi | Ucretli bilet bedelinin `%98`i creator'a gider; storage, mint ve yayin kaydi maliyetleri ayridir |
| Medya korumasi | Video browser'da sifrelenir |
| Erisim | NFT ticket sahipligi ile belirlenir |
| Depolama | Lighthouse/IPFS uzerinden sifreli medya |
| Anahtar korumasi | Shamir threshold shares + multi-operator KMS |
| Erisim yetkilendirme | Access-control kontrati + operator registry |
| Onboarding | Gift links ve trial hesaplar |

---

## Ana akislari

### Upload

- video secilir
- thumbnail/poster uretilir
- medya AES-CTR ile sifrelenir
- IPFS'e yuklenir
- anahtar paylara bolunup KMS operator'lere dagitilir
- contract'ta NFT + event olusur

### Purchase and watch

- kullanici event sayfasina gelir
- ticket yoksa satin alma karti gorur
- odeme sonrasi sahiplik zincirde yazilir
- access-control'da Play grant olusur
- operator'lerden paylar paralel istenir
- browser reconstruct + decrypt + oynatma yapar

### Gift ve trial

- creator paylasilabilir hediye linki uretir
- alici mevcut hesaba ya da yeni hesaba claim eder
- trial hesap olusturma icin ana yol onboarding key'dir (Function Call Access Key);
  relayer akisi deprecate edilmistir

---

## Sistemin aktif parcalari

- `apps/web` : frontend
- `workers/youtick-kms` : multi-operator share storage
- `workers/storage-api` : Lighthouse provider secret, upload guard ve CID status yuzeyi
- `workers/media-delivery` : encrypted IPFS manifest/segment routing ve gateway fallback
- `contracts/nft-ticket` : ticket, gift, trial ve odeme mantigi
- `contracts/access-control` : playback grant yonetimi
- `contracts/operator-registry` : operator ve threshold konfigurasyonu

Kontratta eski uyumluluk alanlari gorulebilir (Nova, Prepaid). Bunlar yeni akisin parcasi degil, yalnizca Borsh uyumlulugi icindir.
