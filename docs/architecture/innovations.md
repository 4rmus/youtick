# Product Differentiators

> YouTick'i siradan bir video sitesi olmaktan ayiran aktif ozellikler

---

## 1. Browser-first encrypted delivery

Video once browser'da sifrelenir, sonra depolamaya gider. Bu, ham medyanin merkezi bir sunucuda acik halde dolasmamasini saglar.

## 2. Threshold share-based playback access

IPFS tek basina yetmez. AES anahtari Shamir Secret Sharing ile paylara bolunur ve birden fazla KMS operator'e dagitilir. Oynatma icin yeterli sayida operatorun (threshold, orn. 3/5) pay dondurmesi gerekir. Tek bir operator anahtari tek basina reconstruct edemez.

## 3. Short-lived upload authorization

Upload akisi uzun sureli bir tam yetkiye dayanmak yerine, dar kapsamli ve kisa omurlu upload session kullanir.

## 4. Gift links that can create access

Creator link uretir, alici ise ister mevcut hesabina ister yeni hesaba claim eder. Bu, paylasimi dogrudan urunun parcasina cevirir.

## 5. Trial onboarding without heavy wallet friction

Onboarding key modeli sayesinde yeni kullanici once denemeye baslar, sonra isterse hesabini buyutur.

## 6. Cross-chain checkout path

Deneysel odeme yolunda kullaniciya ilk adimda NEAR wallet zorlamadan Arbitrum/Base ve MetaMask tarafindan giris imkani verilir.

---

## Neden onemli?

Bu parcilar birlikte su sonucu verir:

- creator icin yuksek gelir payi
- izleyici icin daha kolay ulasim
- urun icin daha az merkezi bagimlilik
- playback aninda daha guvenli anahtar akisi (tek noktali basarisizlik yok)
