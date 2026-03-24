# Upload Sessions

> YouTick'te dusuk popup'li yetkilendirme modeli

---

## Aktif yol

Tercih edilen publish yolu **upload session** modelidir.

Bu modelde frontend:

1. Gecici bir public key uretir
2. `create_upload_session` ile kontratta kisa omurlu bir yetki acar
3. Kullanicinin hesabina sadece `nft_mint_prepaid` ve `create_event_prepaid` icin function-call key ekler
4. Yukleme bitince bu oturumu kapatir

Bu akisin ana kodu:

- `apps/web/lib/upload-session-manager.ts`
- `apps/web/components/UploadForm.tsx`

---

## Neden upload session?

Bu model tek bir uzun omurlu anahtara dayanmaz. Daha dar kapsamlidir:

- sadece upload icin acilir
- sadece iki metoda izin verir
- belirli bir butce ve sure ile sinirlanir
- is bitince temizlenir

Bu sayede hem daha az popup olur hem de yetki alani daha kucuk kalir.

---

## Akis

```mermaid
sequenceDiagram
    participant U as User
    participant W as Wallet
    participant B as Browser
    participant C as Contract

    U->>B: Upload baslat
    B->>B: Gecici key uret
    B->>W: create_upload_session + add access key
    W->>C: Upload session ac
    W->>U: Tek onay
    B->>C: nft_mint_prepaid
    B->>C: create_event_prepaid
    B->>C: Session kapanir
```

---

## Guvenlik sinirlari

Upload session modelinde yetki dar tutulur:

- method listesi sabittir
- allowance sinirlidir
- TTL vardir
- kontratta kalan butce izlenir

Bu model, "bir kere izin ver ve uzun sure kullan" mantigindan daha guvenlidir.

---

## Dikkat edilmesi gerekenler

1. Upload session kontratta yoksa frontend hata verir ve upload'a izin vermez.
2. KMS auth cache temizligi ile wallet durumunun birlikte dusunulmesi gerekir.
3. Upload akisinda hata olursa session temizligi unutulmamalidir.

---

## Ilgili Dosyalar

- `apps/web/lib/upload-session-manager.ts`
- `apps/web/lib/batch-transactions.ts`
- `apps/web/components/UploadForm.tsx`
