# YouTick Overview

> Creator-first video platform with encrypted delivery and on-chain access

---

## YouTick nedir?

YouTick, creator'larin videolarini sifreli sekilde yukleyip NFT ticket ile satabildigi bir platformdur.

Temel fikir cok basit:

1. Creator videoyu yukler.
2. Uygulama videoyu browser'da sifreler.
3. Sifreli medya IPFS'e gider.
4. Izleyici ticket satin alir ya da hediye/ trial ile erisim kazanir.
5. Player anahtari KMS'den alir ve videoyu browser'da acar.

---

## Neden farkli?

| Alan | YouTick yaklasimi |
|------|-------------------|
| Gelir payi | Odemenin `%98`i creator'a gider |
| Medya korumasi | Video browser'da sifrelenir |
| Erisim | NFT ticket sahipligi ile belirlenir |
| Depolama | Crust/IPFS uzerinden sifreli medya |
| Anahtar korumasi | Cloudflare KMS worker |
| Onboarding | Gift links ve trial hesaplar |

---

## Ana akislari

### Upload

- video secilir
- thumbnail/poster uretilir
- medya sifrelenir
- IPFS'e yuklenir
- KMS'e anahtar kaydedilir
- contract'ta NFT + event olusur

### Purchase and watch

- kullanici event sayfasina gelir
- ticket yoksa satin alma karti gorur
- odeme sonrasi sahiplik zincirde yazilir
- player KMS + IPFS uzerinden videoyu acmaya calisir

### Gift ve trial

- creator paylasilabilir hediye linki uretir
- alici mevcut hesaba ya da yeni hesaba claim eder
- trial hesap olusturma icin ana yol relayer'dir; local onboarding key yalnizca kontrollu fallback olarak dusunulmelidir

---

## Sistemin aktif parcalari

- `apps/web` : frontend
- `workers/youtick-kms` : anahtar korumasi
- `contracts/nft-ticket` : ticket, gift, trial ve odeme mantigi

Kontratta eski uyumluluk alanlari gorulebilir. Bunlar yeni akisin parcasi degil, yalnizca eski verilerle uyum icindir.

---

## Kisa gerceklik notu

Eski belgelerde farkli bir sifreleme mimarisi anlatiliyordu. Bugun aktif calisan yol KMS tabanlidir. Bu dokuman seti o yeni duruma gore temizlenmistir.
