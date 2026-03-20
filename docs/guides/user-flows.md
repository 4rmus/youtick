# YouTick User Flows

> Uygulamada gercekten calisan temel kullanici yolculuklari

---

## 1. Upload and publish

Creator tarafindaki aktif akis:

1. Cuzdan baglanir
2. Video ve metadata secilir
3. Upload yetkisi acilir
4. Video browser'da sifrelenir
5. Sifreli medya Crust/IPFS'e yuklenir
6. AES anahtari KMS'e kaydedilir
7. `nft_mint_prepaid` ve `create_event_prepaid` ile yayin tamamlanir

### Onemli not

Tercih edilen publish yolu `create_upload_session` tabanlidir. Eğer canli contract bu methodu desteklemiyorsa frontend eski session-key fallback'ini deneyebilir.

### Kullanicinin gordugu adimlar

- yetkilendirme
- thumbnail/poster olusturma
- sifreleme
- IPFS upload
- KMS key storage
- mint ve event olusturma

---

## 2. Watch flow

Viewer `/watch` sayfasina gelir.

### Ticket varsa

1. Event bilgisi okunur
2. Sahiplik durumu kontrol edilir
3. KMS'den anahtar istenir
4. Player IPFS'ten manifest veya media ceker
5. Browser videoyu cozer ve oynatir

### Ticket yoksa

1. `TicketPurchaseCard` gosterilir
2. Kullanici odeme yontemi secer
3. Satin alma tamamlanir
4. Sahiplik tekrar kontrol edilir
5. Izleme akisi acilir

---

## 3. Buy ticket

Su anki aktif satin alma yolları:

### NEAR wallet

- kullanici `buy_ticket` cagirir
- odeme zincirde tamamlanir
- NFT mint edilir

### Cross-chain checkout (deneysel)

- kullanici Arbitrum/Base + token secer
- 1Click quote alinir
- gerekirse MetaMask ile transfer onaylanir
- implicit NEAR hesaba NEAR gelir
- satin alma NEAR tarafinda tamamlanir

Bu yol `TicketPurchaseCard.tsx` icinde yonetilir.

---

## 4. Gift flow

Creator bir event icin birden fazla hediye linki uretebilir.

### Uretim

1. Browser yeni key pair'ler uretir
2. Public key'ler contract'a gonderilir
3. Contract `create_gift_drop` ile claim yetkilerini kaydeder
4. Secret key'lerden paylasilabilir linkler olusur

### Claim

Alici iki yol arasindan birini secer:

- mevcut hesaba claim
- yeni hesap olusturarak claim

Claim basarili olunca ilgili gift key tek kullanimlik olarak kapanir.

---

## 5. Trial onboarding

Yeni kullanici icin bugun ana yol relayer uzerinden trial olusturmaktir.

### Primary: relayer path

- browser `/api/trial/sponsored` akisini cagirir
- server-side relayer kontratta `create_sponsored_trial` cagirir
- yeni alt hesap olusur

### Legacy local fallback

- sadece kontrollu local/test durumlari icin
- local onboarding key varsa `create_sponsored_trial_direct` kullanilabilir

Bu iki yolun amaci aynidir: kullaniciyi ilk adimda agir wallet kurulumu ile yormamak. Canli akista tercih edilen yol relayer'dir.

---

## 6. Erişim kararinin nerede verildigi

Bu akislarda en kritik konu su:

- UI tek basina erisim vermez
- son karar contract + KMS worker birlikte verir

Pratikte:

1. frontend sahiplik durumunu okur
2. KMS ayni icerik icin on-chain kontrolu tekrar yapar
3. sadece yetkili isteklerde anahtar doner

---

## 7. Eski uyumluluk notlari

Repoda bazi eski uyumluluk alanlari ve eski session-key yardimcilari duruyor olabilir. Bunlar yeni dokumanlarda ana akis sayilmaz.

Bugun esas alman gereken yol:

- browser sifreleme
- KMS key custody
- Crust/IPFS delivery
- upload session tabanli publish
- gift ve onboarding key akislari
