# YouTick Open Source Readiness Report

> Tarih: 2026-04-25  
> Kapsam: uygulama, kontratlar, KMS worker, dokumanlar ve yayin oncesi riskler

---

## Kisa sonuc

YouTick teknik olarak acik kaynak yayina yaklasmis durumda, fakat repo bugun
dogrudan public yapilacaksa once bazi kararlar ve temizlikler tamamlanmali.
En onemli konu lisans secimi, eski deploy script'lerindeki key aliskanliklari,
mainnet bilinen sorunlari ve yeni katkicilar icin giris yolunun netlesmesi.

**Tavsiye edilen yayin durumu:** Once "public alpha" olarak yayinla. Mainnet
icin ise "production-ready" iddiasi kullanma; bilinen sorunlari acikca linkle.

---

## Uygulama ozeti

YouTick, creator'larin video yukleyip NFT ticket ile erisim sattigi bir NEAR
uygulamasidir. Aktif mimari su sekildedir:

- Next.js web app: upload, discover, watch, gift, trial ve profil akislari
- NEAR kontratlari: ticket, access-control ve operator registry
- Cloudflare KMS worker: video anahtar paylarini saklar ve yetkili izleyiciye verir
- Crust/IPFS: sifreli medya depolama ve gateway fallback
- Browser sifreleme: video tarayicida AES-CTR ile sifrelenir
- Shamir share yapisi: tek bir worker tam anahtari tutmaz

---

## Guclu taraflar

| Alan | Degerlendirme |
|------|---------------|
| Mimari | KMS, registry ve access-control ayrimi dogru yonde |
| Guvenlik | Browser sifreleme, share tabanli key custody ve replay korumasi var |
| Testler | Web tarafinda unit/integration testleri, kontrat tarafinda Rust testleri var |
| Dokuman | Mimari, kurulum, konfigurasyon ve operasyon dokumanlari mevcut |
| Urun | Upload, satin alma, izleme, gift link ve trial akislari tek urunde birlesmis |

---

## Yayindan once cozulmesi gerekenler

| Oncelik | Konu | Tavsiye |
|---------|------|---------|
| P0 | Lisans yok | MIT, Apache-2.0 veya Business Source License gibi bir lisans sec ve root `LICENSE` dosyasi ekle |
| P0 | Mainnet bilinen sorunlari | `docs/operations/known-issues.md` public rapor olarak tutulmali ve README'den linklenmeli |
| P0 | Secret hygiene | Eski deploy script'leri dahil tum key fallback'leri env zorunlu olacak sekilde kalmali |
| P1 | CI eklendi, ilk run dogrulanmali | GitHub Actions ilk public push/PR'da takip edilmeli |
| P1 | Security policy eklendi, iletisim kanali netlesmeli | Root `SECURITY.md` icinde e-posta veya GitHub Security Advisory tercihi kesinlestir |
| P1 | Katki yolu root'tan docs'a baglandi | `docs/contributing.md` yeni katkicilarla test edilmeli |
| P1 | Issue/PR sablonlari eklendi | Etiketler ve iyi ilk issue listesi repo acildiktan sonra duzenlenmeli |
| P2 | E2E test eksigi | Upload -> purchase -> watch icin en az bir Playwright veya benzeri E2E senaryosu ekle |
| P2 | Demo verisi yok | Yeni gelenlerin local/testnet deneyimi icin ornek event veya fixture hazirla |

---

## Guvenlik notlari

Acik kaynak yayin oncesi su kontroller tekrar calismali:

```bash
rg -n "PRIVATE_KEY|SECRET_KEY|MASTER_SECRET|ed25519:|sk-|AKIA|BEGIN .*PRIVATE" .
```

Yanlis pozitifler test dosyalarinda olabilir, fakat deploy script'lerinde
gercek ya da tekrar kullanilabilir key kalmamali.

Mainnet icin:

- onboarding key rotate edilmeli
- KMS operator secret'lari rotate edilmeli
- production env dosyalari repo disinda tutulmali
- bilinen mainnet state tutarsizligi public notta kalmali
- patched contract ve worker kodlari deploy edilmeden "production ready" denmemeli

---

## Lisans tavsiyesi

Karar urun stratejisine bagli:

| Secenek | Ne zaman iyi |
|---------|--------------|
| MIT | Maksimum benimsenme ve dusuk bariyer istiyorsan |
| Apache-2.0 | Patent dili ve kurumsal kullanim netligi istiyorsan |
| AGPL-3.0 | Hosted fork'larin da degisikliklerini paylasmasini istiyorsan |
| BSL | Kodu acip ticari kullanimda daha kontrollu ilerlemek istiyorsan |

Benim tavsiyem: eger amac ekosistem guveni ve katkici kazanmaksa **Apache-2.0**.
Eger rekabetci hosted servislerden cekiniyorsan **AGPL-3.0** veya **BSL** daha uygun.

---

## Yayin stratejisi

1. **Public alpha**: repo acilir, README'de mimari ve bilinen riskler net yazilir.
2. **Security window**: ilk 2-4 hafta issue/PR yerine security advisory kanali yakindan izlenir.
3. **Mainnet hardening**: patched kontratlar ve worker'lar deploy edilir.
4. **Contributor sprint**: docs, tests, UI polish ve gateway/KMS dayanıklılığı icin iyi ilk issue'lar acilir.
5. **Stable beta**: CI yesil, lisans net, mainnet sorunlari cozulmus ve E2E testler eklenmis olur.

---

## Yol haritasi onerisi

### Faz 0: Public alpha hazirlik

- Lisans sec ve `LICENSE` ekle
- Root `SECURITY.md`, `CONTRIBUTING.md`, issue/PR template kontrol et
- GitHub Actions ilk calismasini dogrula
- Secret scan sonucu temiz olsun
- README'e bilinen sorunlar ve public alpha durumu ekle

### Faz 1: Guvenli mainnet sertlestirme

- Patched kontratlari deploy et
- KMS worker ve web app'i ayni release penceresinde deploy et
- Onboarding ve KMS operator key rotation tamamla
- Known issues dokumaninda durumlari guncelle

### Faz 2: Katkici deneyimi

- Tek komutla local setup hedefle
- Demo/testnet fixture hazirla
- "good first issue" listesi olustur
- CI'da lint, test, build ve Rust testleri calissin

### Faz 3: Urun dayanıklılığı

- Upload recovery
- Watch fallback ve hata metinleri
- Gift/trial operasyon gorunurlugu
- Segmentli playback icin daha fazla test

### Faz 4: Buyume

- Creator dashboard
- Arama ve filtreleme
- Analytics
- PWA/mobil iyilestirme
- Cross-chain checkout readiness review

---

## Genel not

Kod tabani ciddi ve iddiali bir urune ait. En buyuk risk teknik vizyon degil,
yayin disiplini: lisans, secret temizligi, CI, guvenlik bildirimi ve bilinen
mainnet sorunlarinin seffaf anlatimi tamamlanirsa acik kaynak yayin icin iyi
bir zemin var.
