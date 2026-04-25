# Development Roadmap

> YouTick icin acik kaynak yayin ve mainnet sertlestirme odakli yol haritasi

---

> ⚠️ **Operational Transparency Notice (2026-04-23)**
>
> Mainnet is live and functional, but the deployed contract has a confirmed
> state inconsistency (`nft_total_supply = 0` with 33 orphaned trie entries).
> A critical authorization bypass in `reset_v11` has been patched in source
> but not yet redeployed. Secret keys and operator endpoints have been
> sanitized from the repo as part of Faz 1 hardening.
>
> See [`docs/operations/known-issues.md`](./operations/known-issues.md) for
> the full transparency report, active risks, and required actions.

---

## Tamamlanan temel taslar

- **Mainnet launch** — `youtick.near`, `access.youtick.near`, `registry.youtick.near` uretimde
- KMS tabanli anahtar korumasi
- Browser tarafinda medya sifreleme
- Crust/IPFS uzerinden sifreli delivery
- NFT ticket satin alma ve izleme akisi
- Gift link olusturma ve claim
- Onboarding key ile trial hesap acma
- Event moderation
- Purchase loglari
- Segmentli video delivery altyapisi

---

## Yakin donem plan

### Faz 0: Acik kaynak yayin hazirligi

- lisans secimi ve root `LICENSE`
- root `SECURITY.md` ve `CONTRIBUTING.md` kontrolu
- GitHub issue / PR template'leri kontrolu
- GitHub Actions ilk calisma sonucu
- secret scan ve eski deploy script temizligi dogrulamasi
- README'de public alpha durumu ve bilinen sorun linki

### Faz 1: Mainnet sertlestirme

- patched kontratlarin mainnet deploy'u
- KMS worker + web app esit release penceresi
- onboarding key ve operator secret rotation
- known issues dokumaninin deploy sonrasi guncellenmesi

### Faz 2: Test ve CI

- GitHub Actions: web lint, web test, web build
- Rust kontrat testleri
- upload -> purchase -> watch E2E senaryosu
- gift ve trial icin E2E veya yakin entegrasyon testi

### Faz 3: Urun dayanıklılığı

- upload hata geri kazanimi
- KMS ve gateway hata metinlerini sadeleştirme
- playback fallback gozlemi
- gift/trial operasyon gorunurlugu

### Faz 4: Creator ve buyume

- creator dashboard
- satis ve gelir gorunurlugu
- arama ve filtreleme
- PWA / mobil deneyim
- cross-chain checkout readiness review

---

## Teknik borc

| Oncelik | Baslik |
|---------|--------|
| Yuksek | Akis bazli E2E test eksigi |
| Yuksek | KMS ve player hatalarinda daha net recovery |
| Yuksek | Root lisans eksigi ve CI ilk calisma dogrulamasi |
| Orta | Gift / trial operasyon gorunurlugu |
| Orta | Cross-chain checkout metin ve durumlari |
| Dusuk | Frontend modullerinin daha temiz ayrismasi |

---

## Temizlik notu

Eski mimari plan maddeleri bu sayfadan cikarildi. Aktif roadmap artik KMS, upload sessions, segmented delivery, gift/trial ve checkout deneyimi etrafinda kurulu.
