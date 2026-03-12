# Security Model

> YouTick'te medya, anahtar ve erisim nasil korunur

---

## Katmanlar

| Katman | Ne korur | Aktif mekanizma |
|--------|----------|-----------------|
| Ulasim | Trafik | HTTPS |
| Medya | Ham video | Browser tarafinda AES-CTR sifreleme |
| Anahtar | AES key | KMS worker + KV |
| Erisim | Kim izleyebilir | Contract tabanli sahiplik kontrolu |
| Trial | Kotuye kullanim | Onboarding key + gunluk limit |
| Moderation | Sorunlu icerik | Contract uzerinden ban/unban |

---

## Medya guvenligi

Ham video backend'e acik sekilde gitmez. Upload sirasinda browser:

1. AES anahtari uretir
2. videoyu sifreler
3. sadece sifreli ciktiyi IPFS'e gonderir

Bu sayede depolama katmani ham videoyu goremez.

---

## KMS guvenligi

KMS worker iki ana gorev yapar:

1. upload sirasinda anahtari saklar
2. playback sirasinda anahtari sadece yetkili isteklere verir

Anahtar donusunde worker su kontrolleri yapar:

- istek imzali mi
- zaman damgasi gecerli mi
- istek tekrari gibi gorunuyor mu
- kullanici ilgili content icin ticket sahibi mi

Bu kontrol tek basina UI'da degil, worker tarafinda oldugu icin daha guvenlidir.

---

## On-chain erisim kontrolu

Son karar contract'tadir. Frontend bir kullanicinin sahip oldugunu dusunse bile, KMS worker contract uzerinden tekrar kontrol eder.

Pratikte kritik view kontrolu:

- `has_ticket`

Player'in gorevi sadece akisi tetiklemektir; erisim karari contract + worker tarafinda kesinlesir.

---

## Gift ve trial guvenligi

### Gift links

- claim key tek kullanimliktir
- claim sonrasi access key silinir
- claim URL'deki gizli parca sayfa acilinca temizlenir

### Trial hesaplar

- onboarding key kisitli method listesiyle calisir
- gunluk limit vardir
- trial pool dusukse yeni hesap acilmayabilir

---

## Operasyon kontrol listesi

- `NEXT_PUBLIC_KMS_URL` dogru mu
- KMS worker `ALLOWED_ORIGINS` dar mi
- `NEAR_CONTRACT_ID` dogru contract'i gosteriyor mu
- onboarding key hala yetkili mi
- trial pool yeterli mi
- IPFS gateway fallback'leri calisiyor mu
- banli eventler satin alinabiliyor mu diye test edildi mi

---

## Uyum notu

Kontratta `nova_group_id` veya `StorageType::Nova` gibi alanlar gorunse de yeni guvenlik modeli bunlara dayanmaz. Aktif koruma hattı browser sifreleme + KMS + on-chain sahiplik kontroludur.
