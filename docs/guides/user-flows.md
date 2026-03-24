# YouTick User Flows

> Uygulamada gercekten calisan temel kullanici yolculuklari

---

## 1. Upload and publish

Creator tarafindaki aktif akis:

1. Cuzdan baglanir
2. Video ve metadata secilir
3. Upload session acilir (dar kapsamli, kisa omurlu)
4. Video browser'da AES-CTR ile sifrelenir
5. Sifreli medya Crust/IPFS'e yuklenir
6. AES anahtari Shamir ile paylara bolunur, her pay bir KMS operator'e gonderilir
7. `nft_mint_prepaid` ve `create_event_prepaid` ile yayin tamamlanir

### Kullanicinin gordugu adimlar

- yetkilendirme (tek popup)
- thumbnail/poster olusturma
- sifreleme
- IPFS upload
- share dagitimi
- mint ve event olusturma

---

## 2. Watch flow

Viewer `/watch` sayfasina gelir.

### Ticket varsa

1. Event bilgisi okunur
2. Sahiplik durumu kontrol edilir
3. Access-control kontratinda Play grant olusturulur
4. Operator registry'den aktif operator'ler ve threshold config okunur
5. KMS operator'lerden paylara paralel istenir
6. Yeterli pay gelince AES anahtari browser'da reconstruct edilir
7. Player IPFS'ten manifest/media ceker
8. Browser videoyu cozer ve oynatir

### Ticket yoksa

1. `TicketPurchaseCard` gosterilir
2. Kullanici odeme yontemi secer
3. Satin alma tamamlanir
4. Sahiplik tekrar kontrol edilir
5. Izleme akisi acilir

---

## 3. Buy ticket

Su anki aktif satin alma yollari:

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
4. Secret key'lerden paylasilabilir linkler olusur (hash-based URL)

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

### Local fallback

- sadece kontrollu local/test durumlari icin
- local onboarding key varsa `create_sponsored_trial_direct` kullanilabilir

Bu iki yolun amaci aynidir: kullaniciyi ilk adimda agir wallet kurulumu ile yormamak. Canli akista tercih edilen yol relayer'dir.

---

## 6. Erisim kararinin nerede verildigi

Bu akislarda en kritik konu su:

- UI tek basina erisim vermez
- son karar contract + access-control + KMS operator'ler birlikte verir

Pratikte:

1. Frontend sahiplik durumunu okur
2. Access-control kontratinda Play grant olusturulur
3. Her KMS operator, grant ve sahiplik dogrulamasi yapar
4. Sadece yetkili isteklerde operator kendi payini doner
5. Browser yeterli payi alinca anahtari reconstruct eder
