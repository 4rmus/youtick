# USDC-Native Multi-Token Payment Plan (Revize v2)

**Tarih:** 2026-04-28  
**Kapsam:** Creator'ların USDC cinsinden fiyat belirlemesi; alıcıların BTC, ETH, NEAR, USDC, USDT ile ödemesi.  
**Mevcut Branch:** `local-updates-2026-04-28`  
**Revizyon Nedeni:** v1 planında contract-level Rhea auto-swap ve NEAR Intents callback mekanizmaları NEAR'ın async execution modeliyle uyumsuz bulunmuştur.
**Durum:** HISTORICAL ANALYSIS. Aktif public-alpha kodu BTC/ETH checkout sunmaz; deneysel EVM yol Arbitrum + Base uzerinde USDC/USDT ile sinirlidir ve `NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT=true` gerektirir.

---

## 1. Executive Summary

### Vizyon
> Tarihsel vizyon notu: Creatorlar platformda **USDC** cinsinden fiyat belirler, alıcılar farklı varlıklarla ödeme yapabilir ve netice USDC settlement olur. Bu public-alpha kodunun aktif durumu değildir.

### Temel İlkeler
1. **Creator sabit USD geliri alır** — volatiliteden korunur.
2. **Alıcı herhangi varlıkla öder** — en iyi UX.
3. **Swap işi frontend yapar, settlement contract yapar** — contract asla DEX'e XCC swap yapmaz.
4. **Backend azaltımı hedefi** — NEAR Intents, Rhea SDK (frontend) ve NEP-141 callback'leri ile merkezi servis ihtiyacını azaltma hedefi.

---

## 2. Mimari Genel Bakış

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CREATOR DASHBOARD                               │
│  Price Input: "$5.00 USDC" → stored as 5_000_000 (6 decimals) on-chain     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         YOUTICK NFT CONTRACT (Rust)                          │
│  Event.price_usdc: U128  ← birincil fiyat alanı                             │
│  Event.price_near: Option<U128> ← legacy NEAR fiyat (backward compat)       │
│                                                                              │
│  Giriş Noktaları:                                                            │
│  ├─ ft_on_transfer(USDC/USDT) → process_stablecoin_purchase()               │
│  ├─ ft_on_transfer(wNEAR)     → unwrap → process_near_purchase()            │
│  └─ [KALDIRILDI: buy_ticket_near auto-swap — mimari olarak imkansız]       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │
    ┌─────────────────────────────────┼─────────────────────────────────┐
    │                                 │                                 │
    ▼                                 ▼                                 ▼
┌─────────────┐              ┌─────────────────┐              ┌─────────────────┐
│ NEP-141     │              │ Rhea Swap       │              │ NEAR Intents    │
│ USDC/USDT   │              │ Widget / SDK    │              │ (1Click/Defuse) │
│ wNEAR       │              │ (FRONTEND)      │              │                 │
└─────────────┘              └────────┬────────┘              └────────┬────────┘
                                      │                                 │
    ┌─────────────────────────────────┘                                 │
    │                                                                   │
    ▼                                                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BUYER (FRONTEND)                                │
│                                                                              │
│  USDC/USDT: ft_transfer_call → Contract (tek adım)                         │
│  NEAR:      Rhea Swap Widget → USDC → ft_transfer_call → Contract (iki adım)│
│  ETH/BTC:   1Click Quote → Deposit → Poll → ft_transfer_call → Contract    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Neden v1 Planı Değiştiriyoruz?

### 3.1 v1'deki Kritik Hatalar

| Hata | v1 İddiası | Gerçek | Etki |
|------|-----------|--------|------|
| **Contract auto-swap** | "Contract Rhea'ya XCC yapar, NEAR'ı USDC'ye çevirir" | Rhea V1 AMM swap output'u **`ft_transfer`** (basit transfer) ile gönderir. **`ft_on_transfer` callback trigger edilmez.** `.then()` callback'i swap bitmeden önce çalışır. | Faz 2 tamamen çöker. |
| **NEAR Intents callback** | "`intent_settled` callback'i contract'ta NFT mint eder" | 1Click deposit address modeli kullanır. Settlement **doğrudan kullanıcının cüzdanına** gider. Smart contract callback **yok.** | Faz 3 temelden yanlış. |
| **Pyth adresi** | `pyth.near` | Doğrusu: `pyth-oracle.near` | Yanlış contract call. |
| **Gas tahmini** | 80 TGas | Ref SDK 180 TGas allocate eder. | Transaction OOM (out of gas). |

### 3.2 Yeni Paradigma: "Frontend Swap, Contract Settlement"

| İşlem | Kim Yapar? | Neden? |
|-------|-----------|--------|
| **Token swap (NEAR→USDC, ETH→USDC, vb.)** | **Frontend** (Rhea SDK / 1Click) | Contract DEX'e XCC yapamaz (async callback sorunu). Kullanıcı kendi cüzdanında swap yapar. |
| **Fiyat oracle (NEAR/USD)** | **Frontend** (Pyth SDK) | Contract'ta oracle kullanmak gereksiz; frontend quote hesaplar. |
| **NFT mint + commission split** | **Contract** (on-chain) | Trustless ve atomic. USDC varlığı kesinleştikten sonra çalışır. |
| **Creator ödemesi (USDC)** | **Contract** (on-chain) | `ft_transfer` ile doğrudan creator'a. |

---

## 4. Contract Değişiklikleri (Rust)

### 4.1 Event Struct Güncellemesi

```rust
pub struct Event {
    pub title: String,
    pub description: String,
    pub creator_id: AccountId,
    pub created_at: u64,
    pub content_type: ContentType,
    // YENİ: Birincil fiyat USDC cinsinden (6 decimals)
    pub price_usdc: U128,
    // ESKİ/LEGACY: NEAR fiyat (opsiyonel, mevcut event'lar için)
    pub price_near: Option<U128>,
}

pub struct EventResponse {
    pub title: String,
    pub description: String,
    pub creator_id: AccountId,
    pub created_at: u64,
    pub content_type: String,
    pub access_mode: String,
    pub banned: Option<bool>,
    pub ban_reason: Option<String>,
    // Fiyat artık USDC cinsinden döndürülür
    pub price_usdc: U128,
    pub price_near: Option<U128>, // legacy display
}
```

### 4.2 NEP-141 `ft_on_transfer` Genişletmesi

Contract sadece **doğrudan token kabulü** yapar. Swap yapmaz.

```rust
#[near_bindgen]
impl Contract {
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let token = env::predecessor_account_id();
        let action: FtOnTransferMsg = serde_json::from_str(&msg)
            .unwrap_or_else(|_| env::panic_str("Invalid msg format"));

        match token.as_str() {
            WRAP_NEAR => self.process_wnear_purchase(sender_id, amount, action),
            USDT_CONTRACT => self.process_stablecoin_purchase(sender_id, amount, action, 6),
            USDC_CONTRACT => self.process_stablecoin_purchase(sender_id, amount, action, 6),
            _ => env::panic_str("Unsupported token"),
        }
    }

    fn process_stablecoin_purchase(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: FtOnTransferMsg,
        decimals: u8,
    ) -> PromiseOrValue<U128> {
        let event = self.events.get(&msg.encrypted_cid)
            .expect("Event not found");
        
        // Normalize to 6 decimals (USDC/USDT already 6)
        let amount_usdc = amount.0;
        let price_usdc = event.price_usdc.0;
        
        require!(amount_usdc >= price_usdc, "Insufficient USDC payment");
        
        // Komisyon kes
        let (creator_amount, commission) = self.apply_commission_usdc(amount_usdc);
        
        // Storage deposit kontrolü (creator USDC contract'ta kayıtlı mı?)
        // Eğer değilse, storage deposit yapılması gerekir.
        // NOT: Bu planın §6.3'ünde detaylandırılmıştır.
        
        // Creator'a USDC gönder
        Promise::new(USDC_CONTRACT)
            .function_call(
                "ft_transfer".to_string(),
                json!({
                    "receiver_id": event.creator_id,
                    "amount": creator_amount.to_string()
                }).to_string().into_bytes(),
                1, // 1 yoctoNEAR
                Gas(10_000_000_000_000),
            );
        
        // Komisyon havuzlarına USDC gönder
        self.distribute_commission_usdc(commission);
        
        // NFT mint
        self.mint_ticket_nft(sender_id, msg.encrypted_cid);
        
        // Fazla ödemeyi iade et (eğer varsa)
        let refund = amount_usdc.saturating_sub(price_usdc);
        if refund > 0 {
            Promise::new(token)
                .function_call(
                    "ft_transfer".to_string(),
                    json!({
                        "receiver_id": sender_id,
                        "amount": refund.to_string()
                    }).to_string().into_bytes(),
                    1,
                    Gas(10_000_000_000_000),
                );
        }
        
        PromiseOrValue::Value(U128(0))
    }
}
```

### 4.3 USDC-Native Commission Modeli

```rust
const COMMISSION_RATE_BPS: u128 = 200;      // 2%
const COMMISSION_DENOMINATOR: u128 = 10000; // basis points

fn apply_commission_usdc(amount_usdc: u128) -> (u128, u128) {
    let commission = amount_usdc * COMMISSION_RATE_BPS / COMMISSION_DENOMINATOR;
    let creator_amount = amount_usdc - commission;
    (creator_amount, commission)
}

fn distribute_commission_usdc(&mut self, commission: u128) {
    let trial_share = commission / 2;
    let platform_share = commission - trial_share;
    
    // USDC cinsinden havuzlara ekle
    self.trial_pool_usdc += trial_share;
    self.commission_pool_usdc += platform_share;
}
```

### 4.4 Legacy NEAR Ödeme Desteği (Backward Compatibility)

Mevcut `buy_ticket` (native NEAR) korunur ancak **deprecate** edilir. Yeni öneri: kullanıcı NEAR ile ödemek istiyorsa, frontend Rhea Swap Widget ile USDC'ye çevirir ve `ft_transfer_call` yapar.

Eğer `buy_ticket` korunacaksa:
- Creator NEAR alır (eski davranış).
- Yeni event'lar için `buy_ticket` disabled olabilir.

---

## 5. Frontend Değişiklikleri (Next.js / React)

### 5.1 Yeni PaymentMethodSelector

```typescript
// apps/web/components/PaymentMethodSelector.tsx

const PAYMENT_METHODS = [
  { id: 'usdc',  label: 'USDC',  chain: 'near', token: USDC_CONTRACT },
  { id: 'usdt',  label: 'USDT',  chain: 'near', token: USDT_CONTRACT },
  { id: 'near',  label: 'NEAR',  chain: 'near', token: 'native', requiresSwap: true },
  { id: 'eth',   label: 'ETH',   chain: 'ethereum', token: 'eth', requiresBridge: true },
  { id: 'btc',   label: 'BTC',   chain: 'bitcoin', token: 'btc', requiresBridge: true },
] as const;
```

### 5.2 Ödeme Akışları (Per Token)

#### A. USDC / USDT (En Basit — Tek Adım)

```typescript
async function payWithUsdc(event: Event, buyerAccountId: string) {
  const amount = event.price_usdc; // zaten 6 decimals
  
  const tx = await wallet.signAndSendTransaction({
    receiverId: USDC_CONTRACT,
    actions: [actions.functionCall(
      'ft_transfer_call',
      {
        receiver_id: CONTRACT_ID,
        amount: amount.toString(),
        msg: JSON.stringify({
          action: 'buy_ticket',
          encrypted_cid: event.cid,
          buyer_id: buyerAccountId,
        }),
      },
      GAS_CONSTANTS.highGas,
      1 // 1 yoctoNEAR
    )]
  });
  
  return tx;
}
```

#### B. NEAR (İki Adım: Swap + Pay)

```typescript
async function payWithNear(event: Event, buyerAccountId: string) {
  // ADIM 1: Kullanıcı cüzdanında NEAR → USDC swap (Rhea SDK)
  const swapTx = await rheaSdk.instantSwap({
    tokenIn: WRAP_NEAR,
    tokenOut: USDC,
    amountIn: requiredNearAmount, // Frontend Pyth/Rhea spot fiyatı ile hesaplar
    slippageTolerance: 0.5, // %0.5
  });
  
  // ADIM 2: Swap sonrası otomatik ft_transfer_call
  const payTx = {
    receiverId: USDC_CONTRACT,
    actions: [actions.functionCall(
      'ft_transfer_call',
      {
        receiver_id: CONTRACT_ID,
        amount: event.price_usdc.toString(),
        msg: JSON.stringify({ action: 'buy_ticket', encrypted_cid: event.cid }),
      },
      GAS_CONSTANTS.mediumGas,
      1
    )]
  };
  
  // Kullanıcı tek onayla her ikisini imzalar
  await wallet.signAndSendTransactions({
    transactions: [swapTx, payTx]
  });
}
```

#### C. ETH / BTC (Cross-Chain — Üç Adım)

```typescript
async function payWithEth(event: Event, buyerNearAccountId: string) {
  // ADIM 1: 1Click quote al (destination: USDC on NEAR)
  const quote = await getSwapQuote({
    fromAsset: 'ETH',
    toAsset: USDC_NEAR_ASSET_ID,
    amountUsd: event.price_usdc / 1_000_000,
    recipient: buyerNearAccountId, // Settlement önce kullanıcı cüzdanına
    refundAddress: buyerNearAccountId,
  });
  
  // ADIM 2: Kullanıcı MetaMask ile ETH gönderir
  await sendEthViaMetaMask(quote.depositAddress, quote.amountIn);
  
  // ADIM 3: Poll et, settlement sonrası ft_transfer_call
  await pollSwapStatus(quote.depositAddress, {
    onSuccess: async () => {
      await payWithUsdc(event, buyerNearAccountId); // USDC artık cüzdanda
    }
  });
}
```

### 5.3 Fiyat Gösterimi ve Quote Motoru

| Ödeme Yöntemi | Quote Kaynağı | Hesaplama |
|---------------|--------------|-----------|
| **USDC** | 1:1 | `price_usdc` doğrudan |
| **USDT** | 1:1 (nominal) | `price_usdc` doğrudan |
| **NEAR** | Pyth NEAR/USD + Rhea slippage buffer | `required_near = price_usdc / near_usdc_rate * 1.005` |
| **ETH** | 1Click API | `getSwapQuote('ETH', 'USDC', amount)` |
| **BTC** | 1Click API | `getSwapQuote('BTC', 'USDC', amount)` |

---

## 6. Güvenlik ve Risk Yönetimi

### 6.1 Kritik Riskler ve Önlemler

| ID | Risk | Önlem | Priority |
|----|------|-------|----------|
| **R1** | `ft_on_transfer` reentrancy (NEAR async callback manipulation) | `#[private]` callback'ler; promise chain validation; state mutation öncesi `require!` | Critical |
| **R2** | `ft_transfer` öncesi creator'ın USDC storage deposit'ı yok | `storage_deposit` **önce** yap, `.then()` ile `ft_transfer` **sonra** yap. Veya creator'dan önceden kaydolmasını iste. | Critical |
| **R3** | Pyth fiyat manipülasyonu / stale data | Staleness check (`publish_time` < 60s); circuit breaker %5; confidence ratio < %1 | High |
| **R4** | NEAR fiyatı quote ile execution arasında çöküş | `min_amount_out` Rhea spot fiyatından hesaplansın; kullanıcıya slippage toleransı gösterilsin; tx revert olsun. | High |
| **R5** | 1Click settlement double-spend / replay | `settled_swaps: LookupSet<String>` ile deposit address/memo deduplication | High |
| **R6** | Storage deposit griefing (1000 farklı creator) | Creator'ın kendi storage deposit'ini kendisinin ödemesini zorunlu tut. | Medium |
| **R7** | Minimum ticket price gas maliyetini aşar | `MIN_TICKET_PRICE_USDC = 500_000` ($0.50) olarak sınırlandır. | Medium |

### 6.2 Pyth Entegrasyonu (Doğru Adresler)

```typescript
const PYTH_CONTRACT = 'pyth-oracle.near';
const PYTH_NEAR_USD_PRICE_ID = 'c415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750';

// Price struct: { price: i64, conf: u64, expo: i32, publish_time: i64 }
async function getPythNearUsdcPrice(): Promise<number> {
  const price = await viewContract(PYTH_CONTRACT, 'get_price', {
    price_identifier: PYTH_NEAR_USD_PRICE_ID,
  });
  
  // Staleness check
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - price.publish_time > 60) {
    throw new Error('Pyth price is stale');
  }
  
  // Confidence check (%1'den fazla ise reddet)
  const confidenceRatio = price.conf / Math.abs(price.price);
  if (confidenceRatio > 0.01) {
    throw new Error('Pyth confidence too low');
  }
  
  return price.price * Math.pow(10, price.expo);
}
```

### 6.3 Storage Deposit Yönetimi

NEP-141 token transfer'leri için alıcının token contract'ta `storage_deposit` yapması gerekir.

**Öneri:** Creator, dashboard'da "USDC ile ödeme al" seçtiğinde, frontend otomatik olarak `storage_deposit` transaction'ı imzalatır. Youtick contract bunu **kullanıcı adına** yapabilir, ama maliyet kullanıcıya aittir.

```typescript
async function ensureCreatorUsdcStorage(creatorId: string) {
  const isRegistered = await viewContract(USDC_CONTRACT, 'storage_balance_of', {
    account_id: creatorId,
  });
  
  if (!isRegistered) {
    await wallet.signAndSendTransaction({
      receiverId: USDC_CONTRACT,
      actions: [actions.functionCall(
        'storage_deposit',
        { account_id: creatorId },
        Gas(5_000_000_000_000),
        1250000000000000000000 // ~0.00125 NEAR
      )]
    });
  }
}
```

---

## 7. Gift / Trial Sistemi (NEAR Kalıyor)

NEAR protocol'ünde account creation ve storage **NEAR token** gerektirir. Bu, altyapı maliyeti katmanıdır ve USDC-native ödeme sisteminden bağımsızdır.

| Bileşen | Değişim | Açıklama |
|---------|---------|----------|
| `DEPOSIT_PER_LINK` | Semantik | `0.15 NEAR` kalır, ama frontend `~$0.15 USD` olarak gösterir. |
| `trial_pool` | Semantik | NEAR cinsinden kalır. Trial account oluşturmak NEAR gerektirir. |
| `create_gift_drop` | Yok | Gift link'ler NEAR deposit ister. Bu değişmez. |

**Karar:** Gift/Trial sistemi **NEAR cinsinden kalır**. Creator'lar ödeme alırken USDC görür, ama platform altyapı maliyetleri NEAR ile ödenir.

---

## 8. Implementation Fazları (Revize Edilmiş)

### Faz 0: Temel Hazırlık (2 hafta)
- [ ] Yeni branch: `feature/usdc-native-payments`
- [ ] Contract'ta `Event` struct'a `price_usdc: U128` ekle (backward compat ile).
- [ ] `ft_on_transfer` genişlet: USDC + USDT kabul et.
- [ ] `apply_commission_usdc` ve `distribute_commission_usdc` implementasyonu.
- [ ] Testnet deploy.

### Faz 1: USDC/USDT Native Ödeme (3-4 hafta)
- [ ] Frontend `PaymentMethodSelector`'a USDC/USDT ekle.
- [ ] `ft_transfer_call` ile doğrudan USDC/USDT ödeme akışı.
- [ ] Creator upload flow: USD input → `price_usdc` olarak contract'a kaydet.
- [ ] Storage deposit yönetimi (creator self-registration).
- [ ] Testnet'te end-to-end USDC ile bilet alma testi.

### Faz 2: NEAR ile Ödeme (Frontend Swap) (2-3 hafta)
- [ ] Rhea Swap Widget entegrasyonu (`TicketPurchaseCard`).
- [ ] Pyth NEAR/USD fiyat entegrasyonu (frontend).
- [ ] Batch transaction: Rhea swap + `ft_transfer_call` tek imza ile.
- [ ] Slippage toleransı UX'i (%0.5 seçenekli).
- [ ] Testnet'te NEAR ile ödeme → creator USDC alma testi.

### Faz 3: Cross-Chain (ETH/BTC) (4-6 hafta)
- [ ] 1Click `destinationAsset` parametresini dinamik yap (USDC'ye settlement).
- [ ] ETH/BTC token config'leri ekle (`intents/config.ts`).
- [ ] MetaMask/bitcoin cüzdan entegrasyonu.
- [ ] Settlement polling ve otomatik `ft_transfer_call` akışı.
- [ ] Testnet'te ETH ile ödeme testi.

### Faz 4: Creator Gelir Koruması (Opsiyonel) (2-3 hafta)
- [ ] Creator dashboard'da "Birikmiş NEAR'ımı USDC'ye çevir" butonu.
- [ ] `convert_my_revenue_to_usdc()` contract method'u (creator-initiated, gas creator'dan).
- [ ] Bu, v1 planındaki "auto-swap" yerine creator'ın kendi isteğiyle yaptığı conversion'dur.

### Faz 5: Optimization & Audit (3-4 hafta)
- [ ] Circuit breaker, emergency pause, slippage limitleri.
- [ ] Security audit (FT callback handling, commission math).
- [ ] Mainnet deploy ve state migration.
- [ ] Creator analytics: USDC cinsinden gelir raporu.

---

## 9. Alternatif Mimari: "Pure NEAR Intents"

Eğer contract karmaşıklığını minimize etmek istenirse, **Alternatif A** değerlendirilebilir:

| Özellik | Revize Plan (Bu Döküman) | Alternatif: Pure Intents |
|---------|--------------------------|--------------------------|
| Contract giriş noktası | `ft_on_transfer` + `process_stablecoin_purchase` | Tek callback: `intent_settled` |
| NEAR-native USDC ödeme | `ft_transfer_call` (direct) | 1Click üzerinden |
| NEAR ile ödeme | Frontend Rhea swap | 1Click NEAR→USDC |
| ETH/BTC ödeme | 1Click (mevcut) | 1Click (mevcut) |
| Contract complexity | Orta | Çok düşük |
| NEAR Intents bağımlılığı | Sadece cross-chain için | Her şey için |
| Centralization risk | Düşük | Orta (Intents relayer) |

**Öneri:** Revize plan (bu döküman) ile devam edin. Pure Intents, mevcut 1Click entegrasyonunu tüm ödemeler için zorunlu kılar ve platformu tek bir third-party'e bağımlı hale getirir. Direct `ft_transfer_call` daha merkeziyetsizdir.

---

## 10. Sonuç

Bu revize plan, v1'deki **kritik mimari hataları** (contract-level Rhea auto-swap, NEAR Intents callback yanlış anlaşılması) düzelterek, **gerçekçi ve güvenli bir yol haritası** sunar.

**Temel fark:** Swap işi **kullanıcının cüzdanında (frontend)** yapılır; contract sadece **USDC settlement** ve **NFT mint** işlemlerini yönetir. Bu, NEAR'ın async XCC modeliyle uyumludur ve kritik race-condition bug'larını ortadan kaldırır.

**Hemen başlanabilecek en düşük riskli adım:** Faz 0 + Faz 1 — `Event` struct'ına `price_usdc` eklemek ve `ft_on_transfer`'ı USDC/USDT için genişletmek.
