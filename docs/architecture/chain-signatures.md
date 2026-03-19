# Cross-Chain Checkout Notes

> Bu sayfa eski baglantilar bozulmasin diye ayni path'te tutulur

---

## Bugunku durum

Uygulamanin aktif cross-chain odeme yolu **1Click + MetaMask + implicit NEAR account** kombinasyonudur.

Temel akıs:

1. Kullanici Arbitrum veya Base tarafinda token secer
2. 1Click quote alinir
3. Gerekirse MetaMask ile transfer onaylanir
4. Cikan NEAR, implicit hesaba gelir
5. Satin alma NEAR tarafinda tamamlanir

Bu davranisin ana kodu:

- `apps/web/components/TicketPurchaseCard.tsx`
- `apps/web/components/PaymentMethodSelector.tsx`
- `apps/web/lib/intents/*`
- `apps/web/lib/evm/*`

---

## Neden bu not var?

Eski belgelerde "chain signatures" anlatimi daha merkeziydi. Mevcut repo yapisinda kullaniciya gorunen checkout deneyimi daha cok intents ve implicit account akisi ile sekilleniyor.

Bu nedenle bu sayfa artik bir MPC derin dalis sayfasi degil, mevcut checkout yoluna dair kisa bir referanstir.
