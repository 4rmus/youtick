# YouTick Developer Guide

> Repoya hizli adapte olmak isteyen gelistiriciler icin kisa rehber

---

## Once neye bakmali?

Aktif urun gercegi icin once su dosyalari oku:

- `apps/web/components/UploadForm.tsx`
- `apps/web/components/IpfsPlayer.tsx`
- `apps/web/components/TicketPurchaseCard.tsx`
- `apps/web/lib/kms/*`
- `apps/web/lib/crust/*`
- `workers/youtick-kms/src/index.ts`
- `contracts/nft-ticket/src/lib.rs`

Eski belgelerle kod celisirse kodu baz al.

---

## Lokal kurulum

```bash
cd apps/web
npm install
cp .env.example .env.local
npm run dev
```

Contract calismasi yapacaksan:

```bash
cd contracts/nft-ticket
cargo build --target wasm32-unknown-unknown --release
cargo test
```

---

## En onemli urun akisleri

### Upload

- sifreleme tarayicida
- upload Crust/IPFS'e
- anahtar KMS'e
- publish zincirde

### Watch

- sahiplik kontrolu
- KMS key retrieval
- IPFS playback ve fallback

### Gift / Trial

- claim key akisi
- onboarding key akisi

### Cross-chain

- 1Click
- MetaMask
- implicit NEAR hesap

---

## Kod duzeni

| Alan | Nerede |
|------|--------|
| UI akislari | `apps/web/components` |
| Route'lar | `apps/web/app` |
| Domain mantigi | `apps/web/lib` |
| Anahtar korumasi | `workers/youtick-kms` |
| Zincir mantigi | `contracts/nft-ticket` |

---

## Calisma prensibi

1. Eski dokumana degil, calisan dosyaya bak.
2. Medya akisinda KMS ve IPFS fallback'lerini bozma.
3. Gift ve trial yollarinda tek kullanimlik key mantigini zayiflatma.
4. Satin alma basarisi demek sadece tx basarisi degil, kullanicinin icerigi acabilmesidir.

---

## Test aliskanligi

Frontend:

```bash
cd apps/web
npm run lint
npm test -- --run
npm run build
```

Contract:

```bash
cd contracts/nft-ticket
cargo test
```

Degisiklik yaptigin akis icin en az bir mutlu yol ve bir hata yolu kontrol et.
