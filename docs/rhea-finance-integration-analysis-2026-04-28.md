# Rhea Finance × Youtick Entegrasyon Değerlendirme Raporu

**Tarih:** 2026-04-28  
**Yazar:** Kod Analizi (Paralel Agentlar)  
**Kapsam:** Rhea Finance'in Youtick'e entegrasyon potansiyeli, USD-native ödeme tasarımı ve teknik uyum analizi  
**Durum:** HISTORICAL ANALYSIS. Bu dosya karar gecmisi icindir; aktif public-alpha checkout kapsami NEAR odeme ve env ile acilan deneysel USDC/USDT yoludur.

---

## 1. Executive Summary

**Rhea Finance**, NEAR Protocol üzerindeki en derin likiditeye sahip DEX ve lending protokolüdür (eski Ref Finance + Burrow Finance birleşmesi). Youtick'in mevcut ödeme mimarisi **native NEAR** üzerine kuruludur; USD fiyatları yalnızca metadata olarak saklanır ve creator upload anındaki kur ile **sabit NEAR fiyatına** dönüştürülür.

Bu raporun ana bulguları:

| Konu | Bulgu |
|------|-------|
| **USD-native ödeme mümkün mü?** | **Evet**, ancak contract seviyesinde değişiklik ve oracle entegrasyonu gerektirir. Mevcut mimari sadece "USD giriş + NEAR sabitleme" yapar; gerçek USD-native settlement (USDC/USDT) contract'a NEP-141 genişletmesi ister. |
| **Rhea entegrasyon avantajları** | Daha iyi swap fiyatları (smart routing), native USDC/USDT havuzları, cross-chain likidite, embeddable Swap Widget, NEAR Intents uyumu. |
| **Rhea entegrasyon riskleri** | Nisan 2026'da $18.4M margin trading exploit'i yaşandı. Spot swaplar yeniden açık ancak lending hâlâ durdurulmuş durumda. Güvenlik denetimi devam ediyor. |
| **Öneri** | **Kısa vadede** Rhea Swap Widget'ı A/B testi olarak deneyin; **orta vadede** Pyth oracle ile dinamik USD→NEAR fiyatlandırması ekleyin; **uzun vadede** native USDC settlement desteği getirin. |

---

## 2. Rhea Finance Teknik Profili

### 2.1 Kimdir?

Rhea Finance, Mart 2025'te NEAR ekosisteminin iki devi olan **Ref Finance** (DEX/AMM) ve **Burrow Finance** (lending)'in stratejik birleşmesiyle doğmuştur. Zirve döneminde NEAR DeFi TVL'sinin %95'inden fazlasını tek başına yönetmiştir.

**Ürün ailesi:**

| Ürün | Açıklama | Durum |
|------|----------|-------|
| **Rhea DEX (Spot)** | Classic Pools, Stable Pools, DCL (V3 tarzı) ve Smart Routing | ✅ Açık |
| **Rhea Lending** | Aşırı teminatlı borç verme/alma | ⏸️ Durdurulmuş (Mayıs 2026'da aşamalı açılma planlanıyor) |
| **rNEAR** | Likid staking tokeni | ✅ Aktif |
| **Margin Trading** | Kaldıraçlı işlem | ❌ Kalıcı olarak kapatıldı |
| **Cross-Chain Gateway** | NEAR Intents üzerinden BTC, EVM, Solana erişimi | ✅ Aktif |

### 2.2 Geliştirici Araçları

Rhea, üçüncü taraf dApp'ler için kapsamlı SDK ve API seti sunar:

| SDK / API | Paket / Endpoint | Amaç |
|-----------|-----------------|------|
| **Ref SDK** | `@ref-finance/ref-sdk` | V1/V2 swap, havuz sorguları, embeddable Swap Widget |
| **Cross-Chain Aggregation SDK** | `@rhea-finance/cross-chain-aggregation-dex` | Cross-chain DEX agregasyonu + NearIntents köprüsü |
| **Smart Router V1** | `https://smartrouter.rhea.finance/findPath` | Optimal swap rotası bulma |
| **Smart Router V2** | `https://smartx.rhea.finance/swapMultiDexPath` | Multi-DEX rotalama |
| **Indexer** | `https://indexer.ref.finance` | Zincir üstü veri sorguları |

**Swap Widget**, React tabanlı, özelleştirilebilir tema ve referans ücret desteği ile en hızlı UI entegrasyon yoludur.

### 2.3 USD Stablecoin Desteği

Rhea, NEAR üzerindeki en likit USD stablecoin havuzlarına ev sahipliği yapar:

| Token | NEAR Contract | Decimals | Havuz Türü |
|-------|--------------|----------|------------|
| **USDT** | `usdt.tether-token.near` | 6 | Stable Pool (düşük slippage) |
| **USDC** | `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` | 6 | Stable Pool (düşük slippage) |
| **FRAX** | Destekleniyor | — | Stable Pool |

NEAR ↔ USDC/USDT swap'leri:
- Doğrudan havuzlar (mümkün olduğunda)
- Multi-hop smart routing (örn. NEAR → wNEAR → USDC)
- Stable pool'lar sayesinde stablecoin çiftlerinde çok düşük slipaj

### 2.4 On-Chain Swap Mekaniği

Rhea swap'leri standart **NEP-141 `ft_transfer_call`** ile gerçekleşir:

**V1 AMM:** `v2.ref-finance.near`  
**V2 DCL:** `dclv2.ref-labs.near`

```javascript
// SDK ile örnek akış
import { estimateSwap, instantSwap } from '@ref-finance/ref-sdk';

const swapInfo = await estimateSwap({
  tokenIn: WRAP_NEAR,
  tokenOut: USDC,
  amountIn: '1000000000000000000',
  enableSmartRouting: true,
});

const transactions = await instantSwap({ swapInfo, slippageTolerance: 0.5 });
await wallet.signAndSendTransactions({ transactions });
```

### 2.5 Mevcut Operasyonel Durum ve Riskler

> **⚠️ Kritik Uyarı:** 16 Nisan 2026'da Rhea Finance'in Margin Trading modülünde **$18.4M'lık exploit** yaşandı.

| Bileşen | Etki |
|---------|------|
| **Spot DEX** | Vulnerable değildi; önlem olarak kapatıldı, fake havuzlar temizlendi, **yeniden açıldı**. |
| **Lending** | Durduruldu; Mayıs 2026'da denetim sonrası aşamalı açılma planlanıyor. |
| **Margin Trading** | Kalıcı olarak kapatıldı. |
| **rNEAR** | Etkilenmedi; aktif. |

- **Kurtarma:** ~$18M geri alındı/donduruldu; saldırgan fonları gönüllü olarak iade etti. ~$0.4M açık kaldı, Rhea takımı tarafından karşılandı.
- **Güvenlik yanıtı:** Harici denetim devam ediyor, gerçek zamanlı izleme botları devreye alınıyor.
- **Öneri:** Spot swap entegrasyonu teknik olarak güvenli (vulnerable kontrat `contract.main.burrow.near` idi), ancak denetim raporları yayınlanana kadar temkinli olunmalı.

---

## 3. Youtick Ödeme Mimarisi Özeti

### 3.1 Mevcut Fiyatlandırma Modeli

Youtick'te her event için iki fiyat alanı bulunur:

| Alan | Tür | Anlamı |
|------|-----|--------|
| `price` | `U128` (yoctoNEAR) | **Birincil fiyat.** On-chain tüm ödemeler bu miktara göre yapılır. |
| `price_usd` | `Option<u128>` (USD cents) | **Metadata.** Yalnızca görüntüleme amaçlı. Contract bunu enforce etmez. |

**Upload akışı:**
1. Creator USD girer (örn. `$5.00`).
2. Frontend, Binance/CoinGecko/CryptoCompare üzerinden anlık NEAR/USD kurunu çeker.
3. `usdToNear(5.00, nearPrice)` hesaplanır.
4. `nearAmountToYocto()` ile yoctoNEAR'a dönüştürülür.
5. Hem `price` (yoctoNEAR) hem `price_usd` (500 cents) contract'a gönderilir.

**Sonuç:** Fiyat, upload anındaki kur ile **NEAR cinsinden sabitlenir**. NEAR fiyatı yükselse bile bilet fiyatı aynı yoctoNEAR miktarında kalır. Creator'ın aldığı USD değeri dalgalanır.

### 3.2 Mevcut Ödeme Kanalları

```
┌──────────────────────────────────────────────────────────────────────┐
│                    KANAL 1: Native NEAR (Ana Kanal)                   │
│  Buyer → buy_ticket(price + 0.01 NEAR) → 98% Creator, 2% Commission │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                    KANAL 2: wNEAR (İkincil)                           │
│  Buyer → ft_transfer_call(wNEAR) → unwrap → native NEAR → buy_ticket│
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                    KANAL 3: Cross-Chain Stablecoin (Kapalı)           │
│  Buyer → USDC/USDT (NEAR/Arb/Base) → 1Click API → native NEAR       │
│  Feature flag: NEXT_PUBLIC_ENABLE_CROSS_CHAIN_CHECKOUT               │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                    KANAL 4: Gift/Trial (Sponsorlu)                    │
│  Onboarding key → trial_pool fonlarıyla ücretsiz bilet / hesap      │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.3 Mevcut Sınırlamalar

1. **On-chain USD enforce edilmiyor:** Contract `price_usd`'yi yalnızca metadata olarak görür. Ödemeler `price` (yoctoNEAR) üzerinden yapılır.
2. **Oracle yok:** NEAR/USD kuru frontend'deki merkezi borsa API'lerine bağımlıdır.
3. **Stablecoin kapalı:** 1Click entegrasyonu feature flag arkasında ve aktif olarak kullanılmıyor.
4. **NEAR volatilitesi:** Creator'lar NEAR fiyat dalgalanmalarına maruz kalır.
5. **wNEAR dışında NEP-141 desteği yok:** Contract USDC/USDT'yi doğrudan kabul etmez.

---

## 4. USD-Native Ödeme Tasarımı: Mümkün mü?

**Evet, üç farklı derinlikte uygulanabilir:**

### 4.1 Seviye 1: Frontend-Native USD (Mevcut Durumun İyileştirilmesi)

**Tanım:** Creator USD girer; frontend swap entegrasyonu ile anlık kur üzerinden NEAR elde eder; contract hâlâ NEAR ödemesi alır.

**Mevcut Durum:** Upload anında sabitlenmiş NEAR fiyatı kullanılıyor.

**Rhea ile İyileştirme:** Satın alma anında frontend, Pyth oracle veya merkezi API'den NEAR/USD kurunu çeker. Kullanıcı bilet fiyatını USD olarak görür, ama ödemeyi yine NEAR cinsinden yapar. Bu sadece bir **görüntüleme iyileştirmesidir**; settlement hâlâ NEAR'dır.

| Avantaj | Dezavantaj |
|---------|------------|
| Contract değişikliği minimal | Creator hâlâ NEAR alır (volatilite devam eder) |
| Daha iyi fiyat (Rhea smart routing) | Kullanıcı deneyimi iki adımlı (swap + satın alma) |

### 4.2 Seviye 2: Oracle-Backed Dynamic Pricing (Önerilen Orta Vade)

**Tanım:** Contract, satın alma anında NEAR/USD kurunu on-chain oracle'dan (Pyth veya Rhea havuz fiyatı) çeker ve `price_usd`'yi enforce eder.

**Mimari:**
```rust
// Contract pseudo-kod
fn buy_ticket(receiver_id, encrypted_cid) {
    let event = self.events.get(&encrypted_cid);
    let usd_cents = self.price_usd.get(&encrypted_cid).expect("No USD price");
    let near_price_usd = self.pyth.get_price("NEAR/USD"); // örn. $5.00 → 50000 (5-decimal)
    let required_near = usd_cents * 10^24 / (near_price_usd * 10^2 / 10^5);
    assert!(attached_deposit >= required_near + STORAGE_COST);
    // ... devamı aynı
}
```

| Avantaj | Dezavantaj |
|---------|------------|
| Kullanıcıya USD cinsinden sabit fiyat gösterilir | Contract değişikliği + redeploy gerekir |
| Creator'ın alacağı NEAR miktarı, USD değere göre dinamiktir | Oracle maliyeti ve güvenilirliği |
| NEAR fiyatı yükselince daha az NEAR ödenir (kullanıcı kazanır) | **Creator hâlâ NEAR alır; volatilite riski devam eder** |

**Pyth Network**, Rhea'nın resmi oracle partneri olup NEAR/USD feed'i sağlar. Bu, hem Rhea hem Youtick için doğal bir sinerji yaratır.

### 4.3 Seviye 3: Native USDC/USDT Settlement (Uzun Vade)

**Tanım:** Kullanıcı doğrudan USDC veya USDT öder. Contract NEP-141 `ft_on_transfer` ile stablecoin kabul eder ve creator'a stablecoin veya NEAR olarak aktarır.

**Mimari Değişiklikleri:**
1. Contract `ft_on_transfer` genişletilir: `wrap.near` yanında `usdt.tether-token.near` ve USDC contract'ı da kabul edilir.
2. Commission split, creator ödemesi ve havuz fonlaması USDC/USDT cinsinden yapılır.
3. (Opsiyonel) Creator tercihine göre auto-swap: Creator'a USDC yerine NEAR aktarılması isteniyorsa, Rhea DEX üzerinden otomatik swap yapılır.

```rust
fn ft_on_transfer(sender_id, amount, msg) {
    let token = env::predecessor_account_id();
    match token.as_str() {
        "wrap.near" => self.process_wnear_purchase(...),
        "usdt.tether-token.near" => self.process_stablecoin_purchase(..., 6),
        "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1" => self.process_stablecoin_purchase(..., 6), // USDC
        _ => panic!("Unsupported token"),
    }
}
```

| Avantaj | Dezavantaj |
|---------|------------|
| Kullanıcı deneyimi en basit haliyle USD ödeme | Contract'ta önemli değişiklik + audit gerekir |
| **Creator USD cinsinden sabit gelir alır; volatiliteden tamamen korunur** | Gas maliyetleri FT transfer'lerinde daha yüksek olabilir |
| Cross-chain kullanıcılar (EVM, Solana) için en doğal akış | USDC/USDT deposit'leri için storage deposit yönetimi gerekir |
| **Tamamen merkeziyetsiz ve backend kullanmadan** çalışır | Kullanıcının cüzdanında USDC/USDT olması gerekir |

> **🔑 Kritik Nokta:** Bu model, kullanıcının **doğrudan stablecoin göndermesini** gerektirir. Kullanıcı NEAR gönderirse creator NEAR alır. Eğer kullanıcı NEAR ödeyip creator'ın USDC almasını istiyorsanız, bkz. **4.3.1** (Contract-Level Auto-Swap).

---

### 4.3.1 Contract-Level Auto-Swap: Kullanıcı NEAR Öder, Creator USDC Alır (Backend Yok)

Bu senaryo, raporun kapağındaki "kullanıcının stablecoin almasını merkeziyetsiz backend kullanmadan" sorusunun doğrudan cevabıdır.

**Soru:** Kullanıcı NEAR gönderdiğinde, creator'ın otomatik olarak USDC almasını, merkezi bir API veya backend sunucusu kullanmadan, tamamen on-chain yapabilir miyiz?

**Cevap: Evet.** NEAR'ın **Cross-Contract Call (XCC)** mekanizması ile Youtick contract'ı, aldığı NEAR'ı kendi kendine Rhea DEX'te swap edip creator'a USDC olarak aktarabilir.

#### Mimari (Backend Kullanılmadan)

```
Kullanıcı → buy_ticket(attach: price + storage NEAR)
  ↓
Youtick Contract
  ├── Step 1: wrap.near::near_deposit(NEAR → wNEAR)
  ├── Step 2: wrap.near::ft_transfer_call(
  │            receiver: v2.ref-finance.near,
  │            msg: { action: Swap { token_out: USDC, ... } }
  │           )
  ├── Step 3: Rhea swap yapar → USDC'yi Youtick contract'ına gönderir
  │           (ft_on_transfer callback trigger edilir)
  └── Step 4: Youtick, USDC'yi creator'a ft_transfer ile gönderir
              (komisyon kesildikten sonra)
```

**Rust pseudo-kod:**

```rust
fn buy_ticket_with_auto_swap(&mut self, receiver_id: AccountId, encrypted_cid: String) {
    let deposit = env::attached_deposit();
    let event = self.events.get(&encrypted_cid).expect("Event not found");
    
    // Step 1: NEAR → wNEAR (wrap)
    let wrap_deposit_promise = Promise::new(WRAP_NEAR_CONTRACT)
        .function_call(
            "near_deposit".to_string(),
            vec![],
            deposit, // attached NEAR
            Gas(5_000_000_000_000),
        );
    
    // Step 2: wNEAR → Rhea DEX (swap to USDC)
    let swap_msg = json!({
        "force": 0,
        "actions": [{
            "pool_id": 1234, // NEAR-USDC pool ID
            "token_in": WRAP_NEAR_CONTRACT,
            "token_out": USDC_CONTRACT,
            "amount_in": deposit.to_string(),
            "min_amount_out": min_amount_out.to_string()
        }]
    });
    
    let swap_promise = Promise::new(WRAP_NEAR_CONTRACT)
        .function_call(
            "ft_transfer_call".to_string(),
            json!({
                "receiver_id": RHEA_V1_CONTRACT,
                "amount": deposit.to_string(),
                "msg": swap_msg.to_string()
            }).to_string().into_bytes(),
            1, // 1 yoctoNEAR
            Gas(50_000_000_000_000),
        );
    
    // Callback zinciri devam eder...
    // Rhea swap sonucunda USDC Youtick contract'ına gelir.
    // ft_on_transfer(USDC) trigger olur.
}

fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
    let token = env::predecessor_account_id();
    if token == USDC_CONTRACT {
        // Komisyon kes
        let (creator_amount, commission) = self.apply_commission_usdc(amount.0);
        
        // Creator'a USDC gönder
        Promise::new(self.get_creator(&msg)).function_call(
            "ft_transfer".to_string(),
            json!({"receiver_id": self.get_creator(&msg), "amount": creator_amount.to_string()}).to_string().into_bytes(),
            1,
            Gas(10_000_000_000_000),
        );
        
        return PromiseOrValue::Value(U128(0)); // Hepsi kullanıldı
    }
    // ... diğer token'lar
}
```

#### Neden Bu Backend Kullanmaz?

| Bileşen | Nasıl Çalışır? |
|---------|----------------|
| **Swap Quote** | Frontend Rhea SDK ile `estimateSwap()` çağrır, `min_amount_out` hesaplar. Bu sadece kullanıcı koruması içindir; gerçek swap contract tarafından yapılır. |
| **Swap Execution** | NEAR'ın native XCC (Promise::new) ile Rhea DEX'e doğrudan çağrı. Merkezi sunucu yok. |
| **USDC Transfer** | NEP-141 `ft_transfer` ile creator'a doğrudan on-chain transfer. |
| **Slippage Koruması** | `min_amount_out` parametresi ile korunur. Eğer swap beklenen USDC'den az verirse transaction revert olur. |

#### Dezavantajlar ve Riskler

| Risk | Açıklama | Önlem |
|------|----------|-------|
| **Slippage** | Swap sırasında fiyat hareketi olursa creator daha az USDC alabilir veya tx revert olur. | Frontend `min_amount_out` hesaplasın; kullanıcıya slippage toleransı gösterilsin (%0.5 - %1). |
| **Swap Başarısızlığı** | Havuzda yetersiz likidite veya anlık fiyat değişimi | Transaction atomik olduğu için revert olur; kullanıcı NEAR'ı geri alır. |
| **Gas Limiti** | 3-4 XCC adımı gas limitine yaklaşabilir | Testnet'te detaylı gas profiling yapılmalı. |
| **wNEAR Wrap Maliyeti** | Native NEAR önce wNEAR'a çevrilmelidir | Bu ek bir adımdır; gas maliyeti artar. |
| **Rhea DEX XCC Arayüzü** | Rhea'nın V1 AMM'i `ft_transfer_call` bekler; doğrudan `swap` metodu yoktur | Wrap + ft_transfer_call zinciri doğru kurulmalıdır. |

#### Karşılaştırma: 4.2 vs 4.3 vs 4.3.1

| Kriter | 4.2 Oracle Dynamic | 4.3 Native USDC | 4.3.1 Contract Auto-Swap |
|--------|-------------------|-----------------|--------------------------|
| **Kullanıcı öder** | NEAR | USDC/USDT | NEAR |
| **Creator alır** | NEAR | USDC/USDT | USDC/USDT |
| **Settlement varlığı** | NEAR | USDC/USDT | USDC/USDT |
| **Backend gerekir mi?** | Hayır | Hayır | Hayır |
| **Merkeziyetsiz mi?** | Evet | Evet | Evet |
| **Creator volatiliteden korunma** | ❌ Hayır | ✅ Evet | ✅ Evet |
| **Swap riski** | Yok | Yok | Var (slippage, revert) |
| **Contract karmaşıklığı** | Orta | Orta | Yüksek |
| **Kullanıcı UX** | Basit (tek adım) | Basit (tek adım) | Basit (tek adım) |
| **Gas maliyeti** | Düşük | Orta | Yüksek |

> **💡 Net Öneri:** Eğer kullanıcılarınızın çoğu NEAR tutuyorsa ve creator'ın USDC almasını istiyorsanız, **4.3.1** teknik olarak mümkündür. Ancak **daha temiz ve güvenli olan Yol A'dır**: Kullanıcıya Rhea Swap Widget'ı ile NEAR → USDC swap'ini yaptırın; ardından `ft_transfer_call` ile Youtick contract'ına USDC gönderilsin. Bu, contract karmaşıklığını ve slippage riskini ortadan kaldırır, ama sonuçta creator yine **USDC alır**.

---

## 5. Rhea Entegrasyon Senaryoları ve Avantajlar

### 5.1 Senaryo A: Rhea Swap Widget Embed (Hızlı Kazanım)

**Uygulama:** Ticket satın alma ekranına Rhea'nın React Swap Widget'ı eklenir. Kullanıcının cüzdanında yeterli NEAR yoksa, "Swap with Rhea" butonu belirir.

**Akış:**
1. Kullanıcı bilet almak ister.
2. Cüzdanında yeterli NEAR yok ama USDC/USDT var.
3. Swap Widget açılır; kullanıcı USDC → NEAR swap'ini onaylar.
4. Swap sonrası otomatik `buy_ticket` çağrılır.

**Avantajlar:**
- **En hızlı entegrasyon** (birkaç gün).
- Kullanıcılar mevcut stablecoin'lerini kullanabilir.
- Rhea'nın smart routing'i en iyi fiyatı garanti eder.
- Referans ücret geliri elde edilebilir.

**Risk:** Kullanıcı iki işlem imzalar (swap + satın alma). UX'te sürtünme vardır.

### 5.2 Senaryo B: Programmatic Swap (Gelişmiş UX)

**Uygulama:** Frontend, Rhea SDK (`@ref-finance/ref-sdk`) ile arka planda quote alır ve tek bir `signAndSendTransactions()` çağrısıyla swap + satın alma işlemlerini batch eder.

**Akış:**
```typescript
const swapTx = await rheaSdk.instantSwap({ ...USDC_to_NEAR... });
const buyTx = {
  receiverId: CONTRACT_ID,
  actions: [functionCall('buy_ticket', ...)]
};
await wallet.signAndSendTransactions({ transactions: [swapTx, buyTx] });
```

**Avantajlar:**
- Kullanıcı tek onay ile hem swap hem satın alma yapar.
- Daha akıcı UX.
- Smart routing sayesinde düşük slippage.

**Dezavantaj:** İlk işlem başarısız olursa ikincisi de başarısız olur (batch atomikliği).

### 5.3 Senaryo C: Rhea Likiditesiyle 1Click Alternatifi (Stratejik)

**Uygulama:** Mevcut 1Click (Defuse) entegrasyonuna paralel olarak, NEAR-native kullanıcılar için Rhea üzerinden doğrudan USDC → NEAR swap'i sunulur. 1Click cross-chain (Arbitrum/Base) kullanıcıları için kalır; NEAR-native kullanıcılar için Rhea kullanılır.

**Avantajlar:**
- NEAR-native kullanıcılar için **daha düşük fee** (1Click aracılığı yok).
- Rhea'nın NEAR üzerindeki en derin likiditesi kullanılır.
- NEAR Intents uyumu sayesinde gelecekte Bitcoin/EVM/Solana kullanıcıları da Rhea üzerinden yönlendirilebilir.

### 5.4 Senaryo D: Creator Auto-Swap (Gelir Koruması)

**Uygulama:** Creator, dashboard'da "Gelirimi NEAR olarak al" veya "Gelirimi USDC olarak al" seçer. Eğer kullanıcı NEAR öderse ve creator USDC isterse, Rhea üzerinden anlık swap yapılır.

**Avantajlar:**
- Creator'lar tercih ettikleri varlıkta gelir alır.
- Platform, creator çekmek için güçlü bir argüman sunar.

---

## 6. Potansiyel Avantajlar Özeti

| Avantaj | Açıklama | Etki Seviyesi |
|---------|----------|---------------|
| **Daha İyi Swap Fiyatları** | Rhea'nın smart routing ve derin havuzları, kullanıcıların stablecoin → NEAR dönüşümünde daha az kayba uğramasını sağlar. | 🔴 Yüksek |
| **Native USDC/USDT Ödeme** | Contract NEP-141 genişletmesi ile kullanıcılar doğrudan stablecoin ödeyebilir. | 🔴 Yüksek |
| **Cross-Chain Erişim** | Rhea'nın NEAR Intents entegrasyonu, Bitcoin, EVM ve Solana kullanıcılarının Youtick'e sorunsuz girişini sağlar. | 🟡 Orta |
| **Creator Gelir Koruması** | Oracle-backed dynamic pricing veya auto-swap ile creator'lar USD cinsinden sabit gelir elde eder. | 🔴 Yüksek |
| **Swap Widget ile UX** | Embeddable widget, mevcut kullanıcı deneyimine minimal müdahale ile büyük işlev katar. | 🟡 Orta |
| **Referans Geliri** | Rhea Swap Widget ve SDK kullanımından platform komisyonu elde edilebilir. | 🟢 Düşük (fakat ek gelir) |
| **Pyth Oracle Sinerjisi** | Rhea'nın Pyth partnerliği, Youtick'in dinamik fiyatlandırması için güvenilir oracle altyapısı sağlar. | 🟡 Orta |

---

## 7. Riskler ve Uyarılar

| Risk | Şiddet | Açıklama | Öneri |
|------|--------|----------|-------|
| **Nisan 2026 Exploit Sonrası Güven** | 🔴 Yüksek | Rhea Lending durduruldu. Spot swaplar güvenli olsa da kullanıcı algısı olumsuz etkilenebilir. | Denetim raporu yayınlanana kadar temkinli olun. Sadece spot swap (lending hariç) entegre edin. |
| **Contract Değişikliği Maliyeti** | 🟡 Orta | USD-native settlement için contract redeploy, state migration ve potansiyel v11/v12 güncellemesi gerekir. | Önce testnet'te kapsamlı test yapın. |
| **Oracle Bağımlılığı** | 🟡 Orta | Pyth veya Rhea havuz fiyatları manipülasyona açık olabilir. | Pyth'in güvenilir NEAR/USD feed'ini kullanın; circuit breaker mekanizması ekleyin. |
| **1Click ile Çakışma** | 🟢 Düşük | Mevcut 1Click entegrasyonuyla Rhea arasında kullanıcı kafası karışabilir. | İki çözümü birleştirin: cross-chain için 1Click, NEAR-native için Rhea. |
| **Gas Maliyetleri** | 🟢 Düşük | FT transfer'leri ve swap'lar native transfer'e göre daha pahalıdır. | Kullanıcıya şeffaf fee gösterimi yapın. |
| **Regülasyon** | 🟡 Orta | Stablecoin ödemeleri, bazı yargı bölgelerinde ek regülasyona tabi olabilir. | Hukuki danışmanlık alın. |

---

## 8. Öneriler ve Yol Haritası

### Faz 0: Hazırlık (1-2 Hafta)
- [ ] Rhea'nın Swap Widget'ını `apps/web/components/` altında proof-of-concept olarak entegre edin.
- [ ] Testnet'te (`@ref-finance/ref-sdk` + `testnet` config) swap akışını test edin.
- [ ] Pyth NEAR/USD feed'ini (testnet + mainnet) inceleyin.

### Faz 1: Swap Widget Entegrasyonu (2-3 Hafta)
- [ ] **TicketPurchaseCard.tsx** içine "Yetersiz NEAR" durumunda Rhea Swap Widget modal'ı ekleyin.
- [ ] Kullanıcı cüzdanındaki USDC/USDT bakiyesini otomatik tespit edin (`viewContract` ile NEP-141 balanceOf).
- [ ] Swap sonrası `buy_ticket`'ı otomatik tetikleyen batch transaction akışını uygulayın.
- [ ] A/B testi ile conversion rate etkisini ölçün.

### Faz 2: Oracle-Backed Dynamic Pricing (4-6 Hafta)
- [ ] Contract'a `pyth.get_price("NEAR/USD")` entegrasyonu ekleyin.
- [ ] `price_usd` (USD cents) artık on-chain enforce edilsin.
- [ ] Creator dashboard'da "Sabit NEAR" veya "Sabit USD" fiyatlandırma modu seçeneği sunun.
- [ ] Frontend `price.ts`'i Pyth feed'ini de kullanacak şekilde güncelleyin (merkezi API'ye fallback).

### Faz 3: Native USDC/USDT Settlement (8-12 Hafta)
- [ ] Contract `ft_on_transfer`'ı genişletin: USDT + USDC kabul etsin.
- [ ] Commission split ve creator ödemesini stablecoin cinsinden yapın.
- [ ] (Opsiyonel) Creator tercihi: "USDC al" veya "auto-swap ile NEAR al".
- [ ] Security audit (özellikle FT callback handling için).

### Faz 4: Cross-Chain Genişleme (Stratejik)
- [ ] Rhea Cross-Chain Aggregation SDK ile NEAR Intents üzerinden Bitcoin/EVM/Solana kullanıcılarına doğrudan Youtick ödeme akışı sunun.
- [ ] `PaymentMethodSelector.tsx`'i genişletin: Chain seçimi (NEAR, Arbitrum, Base, Solana, Bitcoin).

---

## 9. Sonuç

**Evet, Youtick'te bütün ödemeleri USD olarak dizayn edebilirsiniz.** Ancak bu, mevcut mimaride kademeli bir evrim gerektirir:

1. **Anında kazanım:** Rhea Swap Widget'ı ile kullanıcıların mevcut stablecoin'lerini NEAR'a çevirmesini sağlayarak conversion'ı artırabilirsiniz.
2. **Gerçek USD-native deneyim:** Bunun için contract seviyesinde Pyth oracle entegrasyonu ve dinamik fiyatlandırma gerekir.
3. **En ideal deneyim:** Native USDC/USDT settlement, kullanıcı ve creator için en şeffaf ve volatiliteden arınmış çözümdür; ancak en uzun geliştirme sürecini ve audit'i gerektirir.

**Rhea Finance**, NEAR üzerindeki en derin likiditeye sahip olduğu için teknik olarak ideal bir partnerdir. Ancak Nisan 2026 exploit'inin ardından **sadece spot swap fonksiyonelliği** ile sınırlı, dikkatli bir entegrasyon yaklaşımı önerilir. Lending ve margin trading modüllerine dokunulmamalıdır.

**Hemen başlayabileceğiniz en düşük riskli, en yüksek etkili adım:** Rhea Swap Widget'ını testnet'te prototipleyip, TicketPurchaseCard akışına "Yetersiz bakiye → Swap with Rhea" olarak entegre etmektir.
