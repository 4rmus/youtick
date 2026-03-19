# Mainnet Task Owners

> Ana launch checklist için basit görev ve sahiplik listesi

## Amaç

Bu dokuman, mainnet acilisi sirasinda kimin hangi isi takip edecegini sade sekilde anlatir. Her rolun bitis tarifi de burada yer alir.

## Roller

### 1. Launch Owner

- Tum akisin genel sorumlusudur.
- Siralamayi takip eder.
- Engelleri toplar ve karar ister.

Done when:

- Launch kapsamı nettir.
- Acik kalan riskler yazilmistir.
- Bir sonraki adim herkes icin bellidir.

### 2. Web Owner

- Web uygulamasinin mainnet ayarlarini kontrol eder.
- Build, test ve release hazirligini takip eder.
- Cross-chain yolunun kapali oldugunu dogrular.

Done when:

- `npm run lint`, `npm test -- --run`, `npm run build`, `npm run build:web4` yesildir.
- Prod env degerleri mainnet ile uyumludur.
- Core-only akis calisir.

### 3. Worker Owner

- KMS worker ve proxy ayarlarini kontrol eder.
- Secret, domain ve health durumunu dogrular.
- Yanlis ayarla calisma durumunu engeller.

Done when:

- Worker health `ready` doner.
- Registry kaydi dogrudur.
- `www` ve ana domain davranisi netlestirilmistir.

### 4. Contract Owner

- Sözleşme tarafini ve dagitimi kontrol eder.
- Ana contract, access contract ve registry contract uyumunu dogrular.
- Gerekli testlerin yesil oldugunu takip eder.

Done when:

- Tumu `cargo test` ile gecer.
- Contract adresleri mainnet ile uyumludur.
- Degisiklik gerekiyorsa onceden yazilmistir.

### 5. Trial Owner

- Onboarding key, trial pool ve relayer durumunu takip eder.
- Trial acilisinin gerçekten calistigini kontrol eder.
- Fallback yolunun gerekli olup olmadigini netlestirir.

Done when:

- Trial create calisir.
- Relayer gerekiyorsa registry kaydi aktiftir.
- Trial pool yeterlidir.

### 6. Docs and Ops Owner

- Runbook, checklist ve kisa notlari gunceller.
- Canary ve rollback adimlarini yazili tutar.
- Launch sonrasi notlari toplar.

Done when:

- Runbook gunceldir.
- Checklist herkese ayni dili anlatir.
- Rollback yolu yazilidir.

## Handoff Order

1. Launch Owner scope’u sabitler.
2. Web Owner build ve env kontrolunu bitirir.
3. Contract Owner adres ve test uyumunu dogrular.
4. Worker Owner secret, registry ve health durumunu bitirir.
5. Trial Owner trial ve relayer akisini kontrol eder.
6. Docs and Ops Owner son notlari ve runbook’u yayina hazirlar.
7. Launch Owner son yesil isaretlerden sonra canary baslatir.

## Kisa Launch Kuralı

- Once ayar, sonra deploy.
- Once health, sonra smoke test.
- Once canary, sonra public acilis.
- Bir rol bitmeden digeri tam acilmaz.
