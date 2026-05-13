# Wallet Integration

YouTick'in normal NEAR wallet girisi `@hot-labs/near-connect` uzerinden calisir.
Paket surumu bilincli olarak exact pinlidir: `@hot-labs/near-connect@0.11.4`.

## Aktif Karar

- Normal NEAR wallet connector katmani: `@hot-labs/near-connect`.
- `@near-wallet-selector/*` dogrudan uygulama bagimliligi degildir.
- Wallet baglanirken `access.youtick.near` icin dar yetkili function-call
  access key eklenir. Bu yerel anahtar KMS'e hesap sahipligi kaniti verir;
  biletli izleme sirasinda ayrica cüzdan imzasi istenmez.
- Guest/trial hesaplar managed local account olarak desteklenir. Bu hesaplar
  cihazdaki yerel anahtarla calisir ve `WalletProvider` icinde
  `managedAccountKind` ile ayirt edilir.
- EVM-linked managed account uyumlulugu korunur, fakat ticket checkout icin
  birincil yol gercek NEAR wallet baglantisidir.

## Korunan Sozlesme

`apps/web/components/providers/WalletProvider.tsx`, uygulamanin bekledigi
`WalletInstance` arayuzunu korur:

- `signAndSendTransaction`
- `signAndSendTransactions`
- `signMessage`
- `getAccounts`

Coklu transaction sonucu bazi wallet'larda array, bazi browser tarzi akislarda
bos donebilir. Bu yuzden cagiran kod `object[] | void` toleransini korur.

## Operasyon Kapilari

Bu entegrasyon sadece compile/build ile tamamlanmis sayilmaz. Canliya almadan
once en az bir testnet wallet ile su akislar manuel dogrulanmalidir:

- modal acilisi
- sign in / sign out
- Baglanti sirasinda dar yetkili function-call access key eklenmesi
- upload session coklu transaction
- ticket purchase tek transaction
- paid playback sirasinda wallet imzasi veya transaction popup'i acilmamasi

Manifest yuklenemezse kullaniciya wallet baglanti hatasi gosterilir ve
`near_connect_error` etiketiyle log/Sentry kaydi uretilir.

## Guest / Trial Yuzeyi

Guest ve trial akislari normal wallet girisini bozmadan ayni context uzerinden
calisir. Guncel sinir su sekildedir:

- `managedNearAccount` kaydi ve local keystore anahtari varsa `WalletProvider`
  bu hesabi aktif hesap olarak acabilir.
- `TrialWallet`, `guest` ve `trial` hesaplar icin `signAndSendTransaction`,
  `signAndSendTransactions`, `signMessage` ve `getAccounts` sozlesmesini korur.
- Free-ticket claim ve free-ticket playback guest/trial hesapla calisir.
- Paid checkout guest/trial hesapla baslamaz; kullanici gercek NEAR wallet
  baglamaya yonlendirilir.
- Playback kapisi degismez: creator, ticket ownership veya confirmed claim
  olmadan KMS retrieve acilmaz.
- KMS retrieve normal wallet'ta session grant kullanir. Guest/trial hesapta
  yalniz managed local account oldugu bilindiginde yerel hesap anahtariyla
  imzali retrieve kullanilir.

Bu ayrim sayesinde guest/trial deneyimi free access icin kullanilabilir kalir;
paid purchase, creator/upload ve kalici hesap beklentileri ise gercek wallet
baglantisina tasinir.

## Smoke Test

Guest/trial yuzeyi icin Playwright smoke testi:

```bash
cd apps/web
npm run test:smoke
```

Test kontrollu mock'larla iki davranisi korur:

- Guest hesap free-ticket izleme yolunda ticket-verified player yuzeyine girer.
- Guest hesap paid ticket'ta checkout/Rhea baslatmaz; wallet baglama CTA'si
  gosterir.
