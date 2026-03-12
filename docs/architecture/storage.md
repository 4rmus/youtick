# Storage and Delivery

> Sifrelenmis videolarin browser'dan IPFS'e gidip tekrar player'a donus yolu

---

## Aktif Yol

YouTick bugun su modelle calisir:

1. Browser AES-256-CTR anahtari uretir.
2. Video chunk'lara veya segmentlere ayrilarak sifrelenir.
3. Sifreli cikti Crust/IPFS'e yuklenir.
4. AES anahtari KMS worker'da saklanir.
5. Oynatma sirasinda anahtar KMS'den cekilir, medya IPFS'ten okunur ve browser'da cozulur.

Bu sayede:

- IPFS sadece sifreli veri gorur.
- Anahtar ile medya ayni yerde tutulmaz.
- Seek ve akici oynatma icin AES-CTR kullanilir.

---

## Upload Akisi

### 1. Sifreleme

`apps/web/lib/kms/encryption.ts` modulu:

- AES-256-CTR kullanir
- Varsayilan `1 MB` chunk boyutu ile calisir
- Rastgele erisim ve seek icin uygundur

MP4 tabanli dosyalarda uygulama ek olarak segmentli delivery manifesti uretebilir. Bu sayede player tum dosyayi beklemeden daha hizli baslar.

### 2. IPFS yukleme

Medya su parcalardan biri ya da birkaci olarak yuklenir:

- sifreli ana video blob'u
- chunk manifesti
- segmentli delivery manifesti
- init segment ve media segmentleri
- thumbnail ve poster dosyalari

Yukleme Crust uzerinden yapilir. Okuma tarafinda birden fazla IPFS gateway kullanilir.

### 3. Anahtar saklama

KMS worker iki ana endpoint sunar:

- `POST /store`
- `POST /retrieve`

Kayit ve cekme istekleri imzalanir. Worker ayrica contract tarafinda erisim kontrolu yapar.

---

## Playback Akisi

1. Player event bilgisini ve medya referanslarini cozer.
2. Kullaniciya ait bilet varsa KMS'den anahtar ister.
3. KMS contract'ta erisim kontrolu yapar.
4. Player manifest varsa segmentli oynatimi dener.
5. Gerekirse eski chunk manifestine veya duz okuma yoluna duser.

Bu fallback yapisi `apps/web/components/IpfsPlayer.tsx` icinde tutulur.

---

## Gateway Stratejisi

Okuma zinciri tek bir gateway'e bagli degildir:

- once Crust okuma endpointleri denenir
- sonra public IPFS gateway'lerine gecilir
- range request desteklenirse parca parca okuma yapilir
- range desteklenmezse tam dosya fallback'i kullanilir

Bu tasarim yavas ya da sorunlu gateway durumlarinda oynatimi daha dayanikli hale getirir.

---

## Kontratta Ne Saklanir

Kontrat ham video veya AES anahtari saklamaz. Esas olarak sunlari tutar:

- `encrypted_cid`
- event baslik ve aciklama bilgisi
- fiyat
- video metadata
- `storage_type`

Aktif yeni yol `StorageType::Kms` olarak yazilir. `StorageType::Nova` sadece eski veriler icin gorulebilir.

---

## Neden Bu Tasarim

| Ihtiyac | Cozum |
|--------|-------|
| Ham videoyu korumak | Browser'da sifreleme |
| Anahtari ayri tutmak | KMS worker |
| Tek bir depoya bagli kalmamak | Crust + IPFS gateway failover |
| Seek ve daha hizli baslangic | AES-CTR + segmentli delivery |

---

## Ilgili Dosyalar

- `apps/web/lib/kms/encryption.ts`
- `apps/web/lib/kms/streaming.ts`
- `apps/web/lib/video-delivery.ts`
- `apps/web/lib/crust/*`
- `workers/youtick-kms/src/index.ts`
