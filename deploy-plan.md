# YouTick Deploy Plan

> Tarih: 2026-04-25  
> Durum: Public alpha hazirlik + mainnet sertlestirme

---

## Kisa durum

Bu dosya eski guvenlik analiz raporunun yerine guncel deploy planini tutar.
Detayli risk ve yayin degerlendirmesi icin:

- [Known Issues](./docs/operations/known-issues.md)
- [Open Source Readiness](./docs/open-source-readiness.md)
- [Roadmap](./docs/roadmap.md)

---

## Deploy oncesi zorunlu kontroller

1. Web app build ve testler gecer.
2. KMS worker testleri ve type-check gecer.
3. Kontrat testleri gecer.
4. Secret scan temizdir.
5. Production env dosyalari repo disindadir.
6. Onboarding key server-side `ONBOARDING_KEY` veya `ONBOARDING_KEYS` ile verilir.
7. KMS operator endpointleri web env'den degil, registry kontratindan okunur.
8. Known issues dokumani son deploy durumunu yansitir.

Komutlar:

```bash
cd apps/web
npm run lint
npm test -- --run
npm run build

cd ../../workers/youtick-kms
npm test -- --run
npm run check

cd ../../contracts/nft-ticket
cargo test

cd ../access-control
cargo test

cd ../operator-registry
cargo test
```

Secret scan:

```bash
rg -n "PRIVATE_KEY|SECRET_KEY|MASTER_SECRET|ed25519:|sk-|AKIA|BEGIN .*PRIVATE" .
```

Test dosyalarindaki mock anahtarlar yanlis pozitif olabilir. Deploy script,
env ornegi, config ve dokumanlarda gercek ya da tekrar kullanilabilir key
kalmamalidir.

---

## Public alpha yayin adimlari

1. Lisans sec ve root `LICENSE` dosyasi ekle.
2. `README.md` icinde public alpha durumunu ve bilinen sorun linkini koru.
3. `SECURITY.md` icinde guvenlik bildirimi kanalini netlestir.
4. GitHub Actions ilk run sonucunu kontrol et.
5. Issue ve PR template'leriyle ilk katkici akisini test et.
6. `docs/open-source-readiness.md` icindeki P0/P1 maddelerini tekrar kontrol et.

---

## Mainnet sertlestirme adimlari

1. Patched kontratlari deploy et.
2. KMS worker ve web app'i ayni release penceresinde deploy et.
3. Onboarding Function Call Access Key'lerini rotate et.
4. KMS operator secret rotation prosedurunu uygula.
5. Registry operator listesini ve threshold config'i kontrol et.
6. Upload, discover, purchase, watch, gift ve trial smoke testlerini calistir.
7. `docs/operations/known-issues.md` durumlarini deploy sonucuna gore guncelle.

---

## Rollback notlari

- Web app rollback'i tek basina yapilacaksa KMS worker ile protokol uyumu kontrol edilmeli.
- KMS worker rollback'i nonce, error normalization ve share format uyumunu bozmamali.
- Kontrat rollback'i normal bir yol degildir; migration/reset gerektiren isler once
  public duyuru ve operator koordinasyonu ile planlanmali.

---

## Yayin karari

Bugunku tavsiye:

- Repo: public alpha olarak acilabilir.
- Mainnet: bilinen sorunlar kapanmadan "production ready" olarak sunulmamali.
- Lisans: karar bekliyor. Tavsiye icin `docs/open-source-readiness.md` icindeki
  lisans bolumune bak.
