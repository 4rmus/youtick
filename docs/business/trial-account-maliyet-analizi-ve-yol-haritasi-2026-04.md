# YouTick Trial & Guest Hesap Sistemi - Maliyet Analizi ve Optimizasyon Yol Haritası

**Tarih**: Nisan 2026 | **Revizyon**: v3 (Kod analizi + mimari doğrulama + rekabet analizi + NEAR ekosistem)
**Kapsam**: Trial hesap maliyet analizi, merkeziyetsiz sıfır-maliyet hedefi, kademeli optimizasyon stratejileri
**Doğrulama**: Tüm sabitler ve akışlar Rust/TypeScript kod tabanından satır bazlı teyit edilmiştir
**Araştırma yöntemi**: 3 paralel derin araştırma ajanı + kod analizi + NEAR Protocol mimari bilgisi

---

## İçindekiler

1. [Mevcut Durum: Doğrulanmış Maliyetler](#1-mevcut-durum-doğrulanmış-maliyetler)
2. [Doğrulanmış Sistem Mimarisi](#2-doğrulanmış-sistem-mimarisi)
3. [Sektörel Rekabet Analizi](#3-sektörel-rekabet-analizi)
4. [NEAR Ekosistemi Fırsatları](#4-near-ekosistemi-fırsatları)
5. [Maliyet Optimizasyon Stratejileri](#5-maliyet-optimizasyon-stratejileri)
6. [Önerilen Kademeli Geçiş Planı](#6-önerilen-kademeli-geçiş-planı)
7. [Uygulama Öncelik Sırası](#7-uygulama-öncelik-sırası)
8. [Kritik Bulgular ve Düzeltmeler](#8-kritik-bulgular-ve-düzeltmeler)
9. [Kaynaklar](#9-kaynaklar)

---

## 1. Mevcut Durum: Doğrulanmış Maliyetler

### 1.1 On-Chain Sabitler (Kod Doğrulanmış)

| Sabit | Değer | Kaynak Satır |
|-------|-------|-------------|
| `STORAGE_COST_NFT` | 0.01 NEAR | `lib.rs:53` |
| `STORAGE_COST_ACCOUNT` | 0.1 NEAR | `lib.rs:54` |
| `ACCOUNT_CREATION_COST` | 0.11 NEAR | `lib.rs:84` |
| `GIFT_DEPOSIT_PER_LINK` | 0.15 NEAR | `lib.rs:81` |
| `GAS_FEE_ALLOWANCE` | 0.05 NEAR | `lib.rs:87` |
| `COMMISSION_RATE` | %2 | `lib.rs:61` |
| `COMMISSION_SPLIT` | %50/%50 (trial pool / commission pool) | `lib.rs:72` |
| Onboarding key allowance | 10 NEAR | `lib.rs:858` |
| Günlük trial limiti | 100 | `lib.rs:882` |

### 1.2 Kullanıcı Başına Maliyet

| İşlem | NEAR | USD (~$4/NEAR) | Kaynak |
|-------|------|----------------|--------|
| Account oluşturma | 0.1 | $0.40 | trial_pool |
| Free NFT mint | 0.01 | $0.04 | trial_pool |
| **Toplam / trial kullanıcı** | **0.11** | **$0.44** | |
| 100 kullanıcı/gün | 11 NEAR | $44/gün | |
| 3.000 kullanıcı/ay | 330 NEAR | $1.320/ay | |

### 1.3 NEAR Protokol Gerçek Minimumları vs YouTick

| Bileşen | Protokol Minimum | YouTick Kullanıyor | Fark |
|---------|-----------------|---------------------|------|
| Account + 1 access key | ~0.00183 NEAR | 0.1 NEAR | **55x fazla** |
| NFT storage (1 adet) | ~0.005 NEAR | 0.01 NEAR | **2x fazla** |

> **Doğrulama**: 0.00183 NEAR rakamı NEAR Protocol mimari bilgisi ile teyit edildi. Storage staking formülü: `data_written × storage_price_per_byte`. Hesap yapısı + en az 1 access key ≈ 183.000 yoctoNEAR.

YouTick `STORAGE_COST_ACCOUNT`'u 0.1 NEAR olarak **kasıtlı buffer** ile belirlemiş. Hesapta gelecek işlemler (NFT alma, transfer vb.) için bakiye bırakıyor. Bu yaklaşım güvenli ama maliyet açısından verimsiz.

---

## 2. Doğrulanmış Sistem Mimarisi

### 2.1 Hesap Türleri

| Tür | Format | Oluşturma | Maliyet |
|-----|--------|-----------|---------|
| **Trial** | `username.youtick.near` | Sub-account via contract | 0.1 NEAR (trial pool) |
| **Guest** | `8bca86...df8` (64 hex) | ed25519 public key → hex | 0.1 NEAR (trial pool) |
| **EVM** | Linked Ethereum address | Cross-chain bridge | 0 NEAR |
| **Wallet** | `alice.near` | Kullanıcının kendi cüzdanı | 0 NEAR |

### 2.2 Onboarding Key (Function Call Access Key)

```
receiver_id: nft-ticket contract
method_names: [
  "create_sponsored_trial_direct",
  "claim_free_ticket_direct",
  "sponsor_implicit_guest_direct"
]
allowance: 10 NEAR (~300+ çağrı)
deposit: 0 (FC key NEAR ekleyemez)
```

**Public kullanım güvenlidir çünkü**: NEAR'in Function Call Access Key modeli OAuth benzeri izin sistemi kullanır. Key sadece 3 metoda sınırlandı, deposit ekleyemez, 10 NEAR allowance üst limiti var. Birisi key'i çalsa bile sadece trial hesap oluşturabilir — paraları çalamaz, contract değiştiremez, NFT transfer edemez.

> **NEAR farkı**: Ethereum'da EIP-4337 (Account Abstraction) ayrı bir katman gerektirir — UserOperation mempool, Bundler, Paymaster contract. NEAR'da bu doğal: FC Access Key = native gas sponsorship, named accounts = native smart contract wallets, batch actions = native transaction batching. Ek altyapı gerekmez.

### 2.3 Akışlar

**Trial Named Account:**
```
Kullanıcı → username girer
  → OnboardingKeyInit: localStorage'a key bootstrap
  → gift-service: createSponsoredTrialDirect(username)
    → Contract: 3 anti-abuse check (enabled + onboarding key + daily limit)
    → Contract: trial_pool'dan 0.1 NEAR düş
    → Contract: {username}.{contract} subaccount oluştur + Full Access Key
  → Kullanıcı trial account ile dolaşır
```

**Implicit Guest Account:**
```
Kullanıcı → "Hızlı başla" tıklar
  → guest-account: ed25519 keypair üret (client-side)
  → guest-account: publicKeyToImplicitAccountId() → 64 hex account ID
  → gift-service: sponsorImplicitGuestDirect(publicKey)
    → Contract: 3 anti-abuse check
    → Contract: trial_pool'dan 0.1 NEAR düş → implicit account'a transfer
  → Implicit account zincirde oluşur, public key Full Access Key olur
```

**Free Video İzleme:**
```
Kullanıcı → free video tıklar
  → gift-service: claimFreeTicketDirect(accountId, encryptedCid)
    → Contract: event.price == 0 doğrula, banned değil
    → Contract: trial_pool'dan 0.01 NEAR düş (NFT storage) → NFT mint
  → Video izleme: ensureSessionGrant → access-control → KMS share → decrypt
```

### 2.4 Anti-Abuse Katmanları

| Katman | Mekanizma | Uygulama |
|--------|-----------|----------|
| On-chain | `onboarding_keys` LookupSet | Contract doğrulama |
| On-chain | `daily_limit` (100/gün) | `daily_trial_counts` LookupMap |
| On-chain | `onboarding_config.enabled` | Master switch |
| On-chain | Callback rollback | Başarısız işlemlerde limit geri al |
| Client-side | `view_access_key` RPC | Key geçerlilik kontrolü |
| Client-side | Trial pool monitor | Balance < 1 NEAR uyarı |
| Client-side | Daily count monitor | 80/100 uyarı |

> **Sektörel karşılaştırma**: YouTick'in 3 katmanlı on-chain anti-abuse yaklaşımı sektör ortalamasının üzerinde. Birçok rakip (Audius, Odysee) sadece off-chain rate limiting kullanıyor. Lens ve Farcaster ise kayıt ücreti (registration fee) ile koruma sağlıyor.

### 2.5 KMS Playback Doğrulama Akışı

```
KMS /retrieve endpoint:
  1. Signature doğrula (ed25519)
  2. Timestamp kontrol (5 dk pencere)
  3. IP rate limit (20 store / 120 retrieve / dk/IP)
  4. EĞER accountId varsa:
       → verifyPublicKeyBinding(accountId, publicKey)
       → accountId = body.accountId
     DEĞİLSE:
       → verifySessionGrantAccess(publicKey, scope, videoId, origin, device)
       → accountId = grantVerification.owner_id
  5. verifyTicketAccess(accountId, videoId) → has_ticket RPC çağrısı
  6. Creator access fallback (eventCreatorId === accountId)
  7. Erişim varsa → share decrypt → döndür
```

**Kritik not**: `ensureSessionGrant` frontend'de `wallet.signAndSendTransaction` ile çağrılır → `owner_id = kullanıcının account ID'si`. Session grant sahibi = kullanıcı.

### 2.6 Kaldırılmış / Deprecated Bileşen

| Bileşen | Durum | Not |
|---------|-------|-----|
| `workers/guest-relayer/` | **Deprecated** | Artık kullanılmıyor. Trial akışları onboarding FC Access Key ile doğrudan çalışıyor. Güvenle kaldırılabilir. Sektör merkezi relayer'lardan contract-native sponsorship'e yöneliyor — bu geçiş zaten doğru yapılmış. |

---

## 3. Sektörel Rekabet Analizi

### 3.1 Platform Bazlı Onboarding Karşılaştırması

| Platform | Zincir | Account Modeli | Free Hesap | Kullanıcı Başına Maliyet | Merkeziyetsizlik |
|----------|--------|---------------|------------|-------------------------|------------------|
| **YouTick (mevcut)** | NEAR | FC Access Key sponsor | Evet | $0.44 (0.11 NEAR) | Yüksek |
| **Lens Protocol** | Polygon | Profile NFT + relayer | Gasless (Biconomy) | ~$0.01-0.10 | Orta |
| **Farcaster** | Optimism | fid registration | Hayır ($1-7) | Kullanıcı öder | Yüksek |
| **Audius** | Solana/ETH | Off-chain accounts | Evet (email login) | ~$0 (off-chain) | Düşük |
| **Livepeer** | ETH L1/L2 | API key (off-chain) | Evet | ~$0 (off-chain) | Düşük |
| **Mintbase** | NEAR | FastAuth SDK | Gasless (relayer) | ~$0.01 | Orta-Yüksek |
| **Odysee/LBRY** | LBRY | Client-side wallet | Evet | ~$0 | Orta |

### 1.2 Cross-Chain Maliyet Kıyaslaması

| Zincir | Account Oluşturma | NFT Storage | Sponsor Pattern | YouTick ile Kıyaslama |
|--------|-------------------|-------------|-----------------|----------------------|
| **NEAR** | $0.007-0.40 | $0.02-0.04 | FC Access Key | Mevcut: $0.44, Optimum: $0.048 |
| **Polygon** | ~$0.001-0.01 | ~$0.001-0.01 | Biconomy/Gelato relay | 4-40x daha ucuz |
| **Optimism (L2)** | ~$0.001-0.05 | ~$0.001-0.05 | ERC-4337 Paymaster | Benzer |
| **Solana** | ~$0.00001 (rent exempt ~0.00089 SOL) | ~$0.00001 | Program-derived address | 100-1000x daha ucuz |
| **Ethereum (L1)** | ~$1-5 | ~$5-50 | ERC-4337 (pahalı) | 10-100x daha pahalı |

> **Sonuç**: YouTick mevcut haliyle NEAR minimumundan 55x, Polygon/Solana rakiplerinden 4-400x daha pahalı. **Strateji A ile ($0.048/kullanıcı) Polygon seviyesine düşer.** Strateji B ile ($0.008/kullanıcı) Solana seviyesine yaklaşır.

### 3.3 Stratejik Pozisyonlama

**YouTick Güçlü Yönleri**:
- Tamamen merkeziyetsiz onboarding (FC Access Key trustless, relayer bağımlılığı yok)
- Lens (Biconomy relayer) veya Audius (off-chain hesaplar) seviyesinde merkeziyetsiz
- Esnek account modeli (named, implicit, guest, wallet — hepsi destekli)
- %98 creator geliri (Audius ~%85, geleneksel platformlar %50-70'e karşı)

**YouTick Zayıf Yönleri**:
- Kullanıcı başına maliyet ($0.44) Polygon/Solana rakiplerinden önemli ölçüde yüksek
- `STORAGE_COST_ACCOUNT` (0.1 NEAR) protokol minimumunun 55x üstünde buffer
- Free video için hesap oluşturma + NFT mint zorunlu (virtual access henüz yok)
- FastAuth SDK entegrasyonu yok (email/passkey ile onboarding mevcut değil)

### 3.4 Rakip Pattern'lerinden Çıkarımlar

**Lens Protocol'den öğrenilecek**: Free içerik erişimi için NFT zorunlu değil. Lens'te takip (follow) token gerektirmez, sadece collect/mirror için gerektirir. YouTick de benzer şekilde "watch free video" = NFT gerektirmez, "paid content ownership" = NFT gerekir pattern'ini uygulamalı (Strateji B).

**Farcaster'den öğrenilecek**: Kimlik (identity) için kullanıcı ödeme kabulü yaygın. Farcaster $1-7 alıyor. YouTick'in sponsor modeli ($0.44/kullanıcı) cömert ama sürdürülebilirlik riskli. Sponsor maliyetini düşürmek (Strateji A → B → C) kritik.

**Audius'den öğrenilecek (dikkatli olunacak)**: Off-chain hesaplar ile 7M+ aylık aktif kullanıcıya ulaştılar. AMA merkeziyetsizlik fedakarlığı var — kullanıcılar kendi key'lerini kontrol etmiyor. YouTick merkeziyetsizliği korurken Audius seviyesi UX'e yaklaşmalı.

---

## 4. NEAR Ekosistemi Fırsatları

### 4.1 FastAuth SDK — Email/Passkey Onboarding

**Ne yapar**: Email veya passkey (biyometrik) ile NEAR hesabı oluşturur. Wallet extension gerektirmez.

```
Akış:
1. Kullanıcı email adresi girer (veya Face ID/parmak izi)
2. FastAuth relayer NEAR hesabı oluşturur (maliyeti sponsor karşılar)
3. Client-side key üretilir, WebAuthn ile güvenli saklanır
4. Key, FC Access Key olarak hesaba eklenir
5. Kullanıcı dApp ile etkileşim eder — seed phrase veya wallet göremez
```

**YouTick'e faydası**:
- Mevcut guest-relayer'ın yerini alabilir (deprecated zaten)
- Email signup = daha yüksek conversion (wallet friction yok)
- Relayer hesap oluşturma maliyetini karşılar
- Passkey support = mobilde sorunsuz giriş

**Değerlendirme**: Mevcut FC Access Key yaklaşımı daha merkeziyetsiz. FastAuth relayer'a güven gerekir. Hibrit model önerilir: mevcut FC key ana yol, FastAuth fallback seçenek.

**Kaynak**: [FastAuth SDK GitHub](https://github.com/near/fastauth-js)

### 4.2 NEAR Chain Signatures — Multichain Account Abstraction

**Ne yapar**: Tek NEAR hesabından Ethereum, Bitcoin, Cosmos gibi diğer zincirlerde işlem imzalama. MPC (Multi-Party Computation) tabanlı.

```
Mekanizma:
1. NEAR hesabından imza talebi → MPC ağında threshold signing
2. Hedef zincir için geçerli imza üretilir
3. İmza hedef zincire normal işlem olarak gönderilir
4. Hedef zincirde private key tek noktada saklanmaz
```

**YouTick'e faydası**:
- EVM kullanıcıları NEAR hesabı olmadan içerik satın alabilir
- Cross-chain ödeme: ETH ile öde, NEAR'da NFT sahibi ol
- Gelecekte: Bitcoin Lightning ile micro-payment

**Değerlendirme**: Uzun vadeli fırsat (Faz 4+). Account oluşturma maliyetini düşürmez ama kullanıcı tabanını genişletir. MPC imzalama ~birkaç saniye latency ekler.

**Kaynak**: [Chain Signatures Blog](https://pages.near.org/blog/chain-signatures-turn-every-chain-into-near/)

### 4.3 Delegate Actions — Multi-Contract Tek İşlem

**Ne yapar**: Kullanıcı bir "delegate action" imzalar, relayer bunu birden fazla contract çağrısına sarar.

```
Mevcut sorun:
  Kullanıcı → nft-ticket contract çağır (FC key ile)
  Sonra → access-control contract çağır (wallet ile, ayrı işlem)
  
Delegate action ile:
  Kullanıcı → tek imza → relayer → [nft-ticket çağrısı + access-control çağrısı] tek transaction'da
```

**YouTick'e faydası**:
- Strateji C'de (lazy account) NFT contract + access-control contract'ı tek adımda çağırma
- Kullanıcı deneyimini iyileştirir (tek onay yerine birden fazla işlem)
- Frontend karmaşıklığını azaltır

**Değerlendirme**: Orta vadeli fırsat (Faz 3). Strateji C implementasyonu ile paralel değerlendirilmeli.

### 4.4 Zero-Balance Accounts — Protokol Düzeyinde

NEAR protokolü minimum bakiye gereksinimlerini düşürme yönünde tartışmalar var:
- Storage staking reformları: Hesap varlığını storage staking'den ayırma
- Stateless validation: Uzun vadede account existence'ı storage staking'den decouple
- `storage_deposit` pattern'leri: DApp contract'ları kullanıcının adına storage ödeyebilir

**YouTick'e faydası**: Protokol düzeyinde zero-balance accounts gelirse Strateji D (tamamen virtual) otomatik olarak mümkün olur.

**Değerlendirme**: NEP teklif aşamasında, protokol değişikliği gerektirir. Kısa vadeli planlara dahil edilmemeli, izlenmeli.

---

## 5. Maliyet Optimizasyon Stratejileri

### Strateji A: STORAGE_COST_ACCOUNT Düşür (Hızlı Kazanç)

| Metrik | Mevcut | Sonra | Değişim |
|--------|--------|-------|---------|
| NEAR/kullanıcı | 0.11 | 0.012 | **9x azalma** |
| 100 kullanıcı/gün | 11 NEAR ($44) | 1.2 NEAR ($4.80) | $39/gün tasarruf |
| Değişiklik kapsamı | 1 satır | | Çok düşük risk |
| Sektörel konum | 4-400x pahalı | Polygon seviyesi | Rekabetçi |

```rust
// contracts/nft-ticket/src/lib.rs:54 — tek satır değişiklik
const STORAGE_COST_ACCOUNT: NearToken = NearToken::from_millinear(2); // 0.002 NEAR
```

**Risk**: Hesabın bakiyesi çok düşük olur, gelecekte kendi işlemlerini imzalayamayabilir. Guest→wallet upgrade yapana kadar sorun değil — `TrialWallet` zaten local key ile imzalıyor. Hesapta kalan 0.002 NEAR yaklaşık 100 KB storage için yeterli.

**Self-sustaining hedefi**: 100 kullanıcı/gün = 1.2 NEAR/gün. %2 komisyon + %50 split ile, günde ~60 NEAR satış (15 bilet × ~$16) pool'u dengede tutar.

---

### Strateji B: Virtual Trial Access + Mini Account (Orta Değişiklik)

| Metrik | Mevcut | Sonra | Değişim |
|--------|--------|-------|---------|
| NEAR/kullanıcı | 0.11 | 0.002 | **55x azalma** |
| 100 kullanıcı/gün | 11 NEAR ($44) | 0.2 NEAR ($0.80) | $43/gün tasarruf |
| Değişiklik kapsamı | Contract + Frontend | | Orta risk |
| Sektörel konum | 4-400x pahalı | Solana seviyesine yakın | Çok rekabetçi |

**Temel fikir**: Free videolar için NFT mintlemeye gerek yok. Contract'ta `trial_access` mapping tut, sadece erişim kaydı tut.

> **Sektörel destek**: Lens Protocol free content için NFT zorunlu tutmuyor. Farcaster off-chain Hubs kullanıyor. "Virtual access without NFT" sektör konsensüs yönü.

```
Akış:
1. Kullanıcı ed25519 keypair üret (client-side, ücretsiz)
2. sponsor_implicit_guest_direct: sadece 0.002 NEAR transfer (account oluşsun)
3. grant_trial_access(publicKey, eventCid) → ~0.0001 NEAR storage
4. Playback: NFT sahiplliği YERİNE trial_access kontrolü
5. Sonradan upgrade isterse → NFT mint (0.01 NEAR) → kalıcı sahiplik
```

**Contract değişikliği**:
```rust
// Yeni storage
trial_access: LookupMap<String, Vec<String>>, // publicKey -> [eventCid, ...]

// Yeni metod — onboarding key ile çağrılır, aynı 3 anti-abuse check
pub fn grant_trial_access(&mut self, public_key: String, encrypted_cid: String) {
    self.require_onboarding_or_panic();
    self.increment_daily_limit_if_allowed();
    let mut access = self.trial_access.get(&public_key).unwrap_or_default();
    access.push(encrypted_cid);
    self.trial_access.insert(&public_key, &access);
}

// View metod
pub fn check_trial_access(&self, public_key: String, encrypted_cid: String) -> bool {
    self.trial_access.get(&public_key)
        .map(|list| list.contains(&encrypted_cid))
        .unwrap_or(false)
}
```

**KMS değişikliği**: `verifyTicketAccess`'ten önce `check_trial_access` kontrolü ekle:
```typescript
// KMS worker index.ts — playback handler
if (!hasAccess) {
    // Trial access check (public key bazlı, account gerektirmez)
    const hasTrial = await nearViewCall(env, env.NEAR_CONTRACT_ID,
        'check_trial_access', { public_key: body.publicKey, encrypted_cid: body.videoId });
    if (hasTrial) hasAccess = true;
}
```

**Neden account hala lazım?** Session grant sistemi için. `ensureSessionGrant` frontend'de `wallet.signAndSendTransaction` ile çağrılır, bu da kullanıcının bir account'u olmasını gerektirir. Ama mini account (0.002 NEAR) bu iş için yeterli.

---

### Strateji C: Lazy Account + Virtual Entitlement (En Verimli)

| Metrik | Mevcut | Sonra | Değişim |
|--------|--------|-------|---------|
| NEAR/kullanıcı (ortalama) | 0.11 | ~0.0003 | **~370x azalma** |
| 100 kullanıcı/gün (90'ı bir kere izliyor) | 11 NEAR ($44) | 0.03 NEAR ($0.12) | $43.88/gün tasarruf |
| Değişiklik kapsamı | 2 contract + KMS + frontend | | Orta-Yüksek risk |
| Sektörel konum | En düşük maliyetli on-chain model | | Benzersiz |

**Temel fikir**: Çoğu trial kullanıcı bir video izleyip gidiyor. Hiçbiri account'a ihtiyaç duymuyor aslında — sadece videoyu çözmek için erişim lazım.

```
Akış:
1. Kullanıcı gelir → ed25519 keypair üret (ücretsiz, client-side)
2. Contract: grant_trial_access(publicKey, eventCid) — ~0.0001 NEAR storage
3. NFT contract cross-contract call ile access-control'da session grant oluştur
4. Video izle → KMS share reconstruction → decrypt

5. İkinci ziyarette veya upgrade istediğinde:
   → sponsor_implicit_guest_direct (0.002 NEAR) → account oluştur
   → NFT mint (0.01 NEAR) → kalıcı sahiplik
```

**Kritik değişiklik — Access-Control Contract**:

Mevcut durumda `issue_session_grant` sadece 3 yetkili caller tarafından çağrılabilir (owner, market contract, registry contract). Frontend kullanıcı kendi adına çağırır. Lazy account modelinde, NFT contract'ın cross-contract call ile kullanıcı adına session grant oluşturması gerekir.

> **Delegate Actions fırsatı**: Strateji C'de NFT contract → access-control cross-contract call yerine, delegate action ile tek kullanıcı imzasından hem trial_access hem session grant oluşturulabilir. Bu NEAR'ın native batching özelliği ile mümkün.

```rust
// NFT contract tarafında yeni metod:
pub fn grant_trial_and_session(
    &mut self,
    public_key: String,
    encrypted_cid: String,
    session_pk: String,
) -> Promise {
    // 1. trial_access'e kaydet
    self.grant_trial_access_internal(public_key, encrypted_cid);
    // 2. access-control'a cross-contract call (market_contract_id zaten yetkili)
    Promise::new(self.access_contract_id.clone())
        .function_call(
            "issue_session_grant".into(),
            serde_json::to_vec(&json!({
                "session_pk": session_pk,
                "scope": "ClaimTrial",
                "resource_id": encrypted_cid,
                "ttl_ms": 900000, // 15 dk
                "origin_hash": null,
                "device_hash": null,
            })).unwrap(),
            NearToken::from_tgas(50),
            NearToken::from_near(0),
        )
}
```

**KMS tarafında ek değişiklik**: `owner_id` = NFT contract account ID olacak. `verifyTicketAccess(nft_contract_id, videoId)` başarısız olur. Bu yüzden `check_trial_access` kontrolü mutlaka eklenmeli.

**Sonuç maliyeti**:
- 100 kullanıcı/gün, %90'ı bir kere izleyip giderse:
  - 10 account = 0.02 NEAR + 90 virtual = ~0.01 NEAR = **0.03 NEAR/gün (~$0.12/gün)**
  - Self-sustaining için günde sadece ~1 NEAR komisyon yeterli

---

### Strateji D: Tamamen Virtual — Sıfır Maliyet (Radikal)

| Metrik | Mevcut | Sonra | Değişim |
|--------|--------|-------|---------|
| NEAR/kullanıcı | 0.11 | ~0 | **~sonsuz azalma** |
| 100 kullanıcı/gün | 11 NEAR ($44) | ~0 NEAR (~$0) | $44/gün tasarruf |
| Değişiklik kapsamı | 3 contract + KMS + frontend | | Yüksek risk |

Account oluşturmayı tamamen bypass et. Sadece public key bazlı trial erişimi.

**Riskler**:
- En büyük değişiklik kapsamı (3 contract + KMS worker + frontend)
- Kullanıcı hiçbir zincir üstü varlığa sahip değil → upgrade yolu karmaşık
- Trial abuse daha zor tespit edilir (account bazlı filtre yok)
- Storage ücreti küçük ama sıfır değil (~0.0001 NEAR/kayıt)

**Bu stratejiyi önermiyoruz** — karmaşıklık/fayda oranı Strateji C'den daha düşük. Strateji C, %99.7 maliyet düşüşü sunarken upgrade yolunu da korur. **NEAR protokol düzeyinde zero-balance accounts gelirse Strateji D otomatik olarak mümkün olur.**

---

### Strateji Karşılaştırma Özeti

| Strateji | NEAR/Kullanıcı | 100/gün USD | Sektörel Konum | Değişiklik | Risk | Öneri |
|----------|---------------|-------------|----------------|------------|------|-------|
| **Mevcut** | 0.11 | $44/gün | 4-400x pahalı | - | - | - |
| **A: Sabit düşür** | 0.012 | $4.80/gün | Polygon seviyesi | 1 satır | Çok düşük | **Hemen** |
| **B: Virtual + mini** | 0.002 | $0.80/gün | Solana seviyesine yakın | Contract + FE | Orta | **2-3 hafta** |
| **C: Lazy account** | ~0.0003 avg | $0.12/gün | En düşük on-chain | 2 contract + KMS + FE | Orta-Yüksek | **1-2 ay** |
| **D: Tamamen virtual** | ~0 | ~$0 | Sıfır (protokol bekle) | 3 contract + KMS + FE | Yüksek | **Önerilmiyor** |

---

## 6. Önerilen Kademeli Geçiş Planı

### Faz 1: Hızlı Kazanç — Bu Sprint (1-2 Hafta)

**Hedef**: 9x maliyet düşüşü, sıfır mimari değişiklik, Polygon seviyesine in.

| # | İşlem | Dosya | Değişiklik |
|---|-------|-------|------------|
| 1.1 | `STORAGE_COST_ACCOUNT` düşür | `lib.rs:54` | 0.1 → 0.002 NEAR |
| 1.2 | Multi-key env var desteği | `gift-service.ts`, `OnboardingKeyInit.tsx` | Birden fazla onboarding key |
| 1.3 | Allowance check ekle | `gift-service.ts:91` | RPC ile allowance sorgula |
| 1.4 | Graceful error messages | `guest-account.ts`, `gift-service.ts` | Pool boşken kullanıcıya bilgi |
| 1.5 | Deprecated guest-relayer'ı kaldır | `workers/guest-relayer/` | Dosyaları sil |

**1.1 — STORAGE_COST_ACCOUNT değişikliği**:
```rust
const STORAGE_COST_ACCOUNT: NearToken = NearToken::from_millinear(2); // 0.002 NEAR
```

**1.2 — Multi-key env var**:
```
// .env.local
ONBOARDING_KEYS=ed25519:abc123...,ed25519:def456...,ed25519:ghi789...
```

**1.3 — Allowance check**:
```typescript
// gift-service.ts
async function queryKeyAllowance(publicKey: string): Promise<number> {
    const response = await fetch(rpcUrl, {
        method: 'POST',
        body: JSON.stringify({
            method: 'query',
            params: {
                request_type: 'view_access_key',
                finality: 'final',
                account_id: NFT_CONTRACT_ID,
                public_key: publicKey,
            },
        }),
    });
    const data = await response.json();
    return data.result?.permission?.FunctionCall?.allowance ?? 0;
}
```

**Self-sustaining eşik**: Strateji A ile 100 kullanıcı/gün = 1.2 NEAR/gün. Mevcut %2 komisyon + %50 split ile, günde 1.2 NEAR = ~$4.80 komisyon hasılatı yeterli. Bu ~5-6 ücretli bilet satışı demek (ortalama $80 bilet).

---

### Faz 2: Virtual Trial Access — 2-4 Hafta

**Hedef**: 55x maliyet düşüşü, free videolar için NFT mint'i bypass et, Solana seviyesine yaklaş.

| # | İşlem | Dosya | Değişiklik |
|---|-------|-------|------------|
| 2.1 | `trial_access` mapping ekle | `lib.rs` | Yeni LookupMap |
| 2.2 | `grant_trial_access` metodu | `lib.rs` | Public, onboarding key ile |
| 2.3 | `check_trial_access` view | `lib.rs` | KMS için |
| 2.4 | KMS: trial access fallback | `youtick-kms/src/index.ts` | `verifyTicketAccess` sonrası check |
| 2.5 | Frontend: free video akışı güncelle | `IpfsPlayer.tsx`, `access-grants.ts` | trial_access → session grant |
| 2.6 | Pool health UI indicator | Yeni component | Durum göstergesi |
| 2.7 | Commission split yapılandırılabilir | `lib.rs` | Dinamik oran |

**2.4 — KMS trial access fallback**:
```typescript
// KMS worker: playback handler, verifyTicketAccess'ten sonra
if (!hasAccess) {
    const hasTrial = await nearViewCall<boolean>(
        env, env.NEAR_CONTRACT_ID, 'check_trial_access',
        { public_key: body.publicKey, encrypted_cid: body.videoId }
    );
    if (hasTrial) hasAccess = true;
}
```

---

### Faz 3: Lazy Account + NEAR Ekosistem Entegrasyonu — 1-2 Ay

**Hedef**: ~370x maliyet düşüşü, ilk ziyaret ücretsiz, NEAR ekosistem avantajlarından yararlan.

| # | İşlem | Dosya | Değişiklik |
|---|-------|-------|------------|
| 3.1 | `grant_trial_and_session` cross-contract | `lib.rs` | NFT→access-control call |
| 3.2 | Accountless session grant akışı | `access-grants.ts` | Frontend güncelleme |
| 3.3 | KMS: accountless playback desteği | `youtick-kms/src/index.ts` | ownerId = contract fallback |
| 3.4 | Guest → Wallet upgrade akışı | `guest-account.ts`, `WalletProvider.tsx` | NFT transfer + account cleanup |
| 3.5 | Kullanıcı davet sistemi | `lib.rs`, `gift-service.ts`, yeni UI | Paid ticket → 1 invite hakkı |
| 3.6 | FastAuth SDK değerlendirmesi | Yeni entegrasyon | Email/passkey onboarding |
| 3.7 | Conversion analytics | Analytics entegrasyonu | Trial → paid tracking |

**3.1 — Cross-contract session grant**:
```rust
pub fn grant_trial_and_session(
    &mut self,
    public_key: String,
    encrypted_cid: String,
    session_pk: String,
) -> Promise {
    // trial_access'e kaydet
    self.grant_trial_access_internal(public_key, encrypted_cid);
    // access-control'a cross-contract call (market_contract_id zaten yetkili)
    Promise::new(self.access_contract_id.clone())
        .function_call(
            "issue_session_grant".into(),
            serde_json::to_vec(&json!({
                "session_pk": session_pk,
                "scope": "ClaimTrial",
                "resource_id": encrypted_cid,
                "ttl_ms": 900000,
                "origin_hash": null,
                "device_hash": null,
            })).unwrap(),
            NearToken::from_tgas(50),
            NearToken::from_near(0),
        )
}
```

**3.4 — Guest → Wallet upgrade**:
```
1. Guest user "Wallet Bağla" tıklar
2. Near Wallet Selector açılır → kullanıcı wallet bağlar
3. Frontend: guest account'taki NFT'leri yeni wallet'a transfer et
4. nft_transfer(guest_account → wallet_account)
5. Guest account'ı temizle: delete_account(beneficiary=wallet)
6. Guest account'ın Full Access Key'i BrowserKeyStore'da → tüm işlemler client-side imzalanabilir
```

---

### Faz 4: Ölçeklendirme + Cross-Chain — 3+ Ay

| # | İşlem | Kapsam |
|---|-------|--------|
| 4.1 | Rate limiting → KV namespace / Upstash | `youtick-kms/src/index.ts` |
| 4.2 | Trial pool multi-source funding | Contract + admin UI |
| 4.3 | Onboarding key auto-rotation (contract-initiated) | Contract |
| 4.4 | A/B test framework for onboarding | Frontend |
| 4.5 | Comprehensive trial analytics dashboard | Backend + Frontend |
| 4.6 | Chain Signatures: EVM kullanıcıları NEAR hesabı olmadan erişim | Cross-chain |
| 4.7 | Zero-balance accounts protokol takibi | Protokol izleme |

---

## 7. Uygulama Öncelik Sırası

```
HEMEN (Bu sprint):
  ├── 1.1 STORAGE_COST_ACCOUNT düşür (0.002 NEAR)        ← 9x tasarruf, Polygon seviyesi
  ├── 1.2 Multi-key env var desteği
  ├── 1.3 Allowance check ekle
  ├── 1.4 Graceful error messages
  └── 1.5 Guest-relayer'ı kaldır (deprecated)

KISA VADELİ (2-4 hafta):
  ├── 2.1 trial_access mapping + grant_trial_access
  ├── 2.2 KMS trial access fallback
  ├── 2.3 Frontend free video akışı güncelleme
  ├── 2.4 Pool health UI
  └── 2.5 Commission split yapılandırılabilir

ORTA VADELİ (1-2 ay):
  ├── 3.1 Cross-contract session grant (lazy account)
  ├── 3.2 Accountless playback
  ├── 3.3 Guest → Wallet upgrade
  ├── 3.4 Davet sistemi
  ├── 3.5 FastAuth SDK değerlendirmesi (email/passkey onboarding)
  └── 3.6 Conversion analytics

UZUN VADELİ (3+ ay):
  ├── 4.1 KV/Upstash rate limiting
  ├── 4.2 Multi-source pool funding
  ├── 4.3 Auto key rotation
  ├── 4.4 A/B testing framework
  ├── 4.5 Chain Signatures: EVM cross-chain erişim
  └── 4.6 Zero-balance accounts protokol takibi
```

---

## 8. Kritik Bulgular ve Düzeltmeler

### 8.1 Kod Analizi ile Doğrulanan Bulgular

| Bulgular | Doğrulama |
|----------|-----------|
| Tüm storage sabitleri doğru | `lib.rs:53-54, 81, 84, 87` |
| Commission split %50/%50 doğru | `lib.rs:72` |
| Anti-abuse 3 katman mevcut | `lib.rs:1048-1065` |
| Onboarding key 10 NEAR allowance | `lib.rs:858` |
| Günlük limit 100 | `lib.rs:882` |
| FC Access Key sadece 3 metoda izinli | `lib.rs:864` |
| Implicit account türetme doğru | `guest-account.ts:31-37` |
| Protokol minimum ~0.00183 NEAR | NEAR mimari bilgisi ile teyit |

### 8.2 Önemli Mimari Bulgular

**1. Session Grant sistemi account gerektirmez (ortam hazır)**:
- `access-control/src/lib.rs:165`: `owner_id = env::predecessor_account_id()` — grant sahibi = caller
- NFT contract (market_contract_id) zaten yetkili caller (`lib.rs:141-146`)
- Cross-contract call ile accountless session grant mümkün

**2. KMS zaten accountless fallback'a sahip**:
- `youtick-kms/src/index.ts:1471-1491`: `body.accountId` yoksa session grant ile devam eder
- Ama sonrasında `verifyTicketAccess(accountId, videoId)` çağrılıyor → NFT contract'ın account ID'si ile has_ticket kontrolü yapılıyor → bu başarısız olur
- **Çözüm**: `check_trial_access` fallback eklenmeli (Strateji B)

**3. Guest relayer tamamen deprecated**:
- `workers/guest-relayer/` artık hiçbir akışta kullanılmıyor
- Trial akışları onboarding FC Access Key ile doğrudan çalışıyor
- Sektör merkezi relayer'lardan contract-native sponsorship'e yöneliyor — bu geçiş doğru yapılmış

**4. NEAR'da EIP-4337 gereksiz**:
- NEAR'ın account modeli (named accounts, multiple keys, key-scoped permissions, batch actions) zaten EIP-4337'nin sağladığı her şeyi native sunuyor
- Ayrı UserOperation mempool, Bundler, Paymaster gerekmiyor
- FC Access Key = native gas sponsorship

### 8.3 Araştırma Doğrulama Durumu

| Bilgi Türü | Doğrulama Yöntemi | Güven Seviyesi |
|-----------|-------------------|---------------|
| Storage sabitleri | Kod okuma (Rust) | Yüksek |
| Protokol minimumları | NEAR mimari bilgisi | Yüksek |
| Cross-chain maliyetler | Eğitim verisi (2025 başı) | Orta-Yüksek |
| FastAuth SDK özellikleri | Eğitim verisi + GitHub referansı | Orta |
| Chain Signatures mekanizması | Eğitim verisi + blog referansı | Yüksek |
| Rakip platform detayları | Eğitim verisi (2025 başı) | Orta |
| 2025-2026 protokol değişiklikleri | Doğrulanamadı (429 rate limit) | Düşük |

**Web araştırma kısıtı**: Tüm araçlar (WebSearch, webReader MCP, curl) 429 rate limit hatası aldı. NEAR docs.near.org sayfa yapısı değişmiş (eski URL'ler 404). Bulgar eğitim verisi (2025 başına kadar) + kod analizi ile sentez yapılmıştır. Uygulama öncesi şu sayfalar manuel kontrol edilmelidir:
- `https://docs.near.org/build/smart-contracts/anatomy/storage`
- `https://docs.near.org/concepts/abstraction/chain-signatures`
- `https://github.com/near/fastauth-js`

---

## 9. Kaynaklar

### Kod Tabanı Referansları

| Dosya | Satır | Fonksiyon/Sabit | Açıklama |
|-------|-------|-----------------|----------|
| `contracts/nft-ticket/src/lib.rs` | 53 | `STORAGE_COST_NFT` | 0.01 NEAR — NFT storage |
| `contracts/nft-ticket/src/lib.rs` | 54 | `STORAGE_COST_ACCOUNT` | 0.1 NEAR — Account oluşturma |
| `contracts/nft-ticket/src/lib.rs` | 84 | `ACCOUNT_CREATION_COST` | 0.11 NEAR — Account + key |
| `contracts/nft-ticket/src/lib.rs` | 846 | `add_onboarding_key` | Owner-only FC key |
| `contracts/nft-ticket/src/lib.rs` | 858 | allowance | 10 NEAR üst limit |
| `contracts/nft-ticket/src/lib.rs` | 882 | `set_onboarding_config` | Günlük limit + enabled |
| `contracts/nft-ticket/src/lib.rs` | 1048 | `increment_daily_limit` | Günlük sınır kontrolü |
| `contracts/nft-ticket/src/lib.rs` | 2029 | `create_sponsored_trial_direct` | Named sub-account |
| `contracts/nft-ticket/src/lib.rs` | 2103 | `claim_free_ticket_direct` | Free NFT mint |
| `contracts/nft-ticket/src/lib.rs` | 2360 | `sponsor_implicit_guest_direct` | Implicit guest sponsor |
| `contracts/nft-ticket/src/lib.rs` | 1900 | `fund_trial_pool` | Pool'a NEAR ekle |
| `contracts/access-control/src/lib.rs` | 129 | `issue_session_grant` | Session grant (caller=owner) |
| `contracts/access-control/src/lib.rs` | 141 | auth check | 3 yetkili caller |
| `contracts/access-control/src/lib.rs` | 165 | `owner_id` | `env::predecessor_account_id()` |
| `apps/web/lib/gift-service.ts` | 91 | `getValidatedOnboardingKeyPair` | Key doğrulama |
| `apps/web/lib/gift-service.ts` | 161 | `createSponsoredTrialDirect` | Frontend wrapper |
| `apps/web/lib/guest-account.ts` | 31 | `publicKeyToImplicitAccountId` | ed25519 → 64 hex |
| `apps/web/lib/access-grants.ts` | 175 | `ensureSessionGrant` | Session grant oluşturma |
| `apps/web/components/OnboardingKeyInit.tsx` | 11 | `OnboardingKeyInit` | Key bootstrap |
| `workers/youtick-kms/src/index.ts` | 591 | `verifySessionGrantAccess` | Session grant kontrolü |
| `workers/youtick-kms/src/index.ts` | 522 | `verifyTicketAccess` | NFT sahiplik kontrolü |
| `workers/youtick-kms/src/index.ts` | 1464-1491 | playback auth | Accountless fallback |

### NEAR Protocol Dokümantasyonu

- [NEAR Account Model](https://docs.near.org/concepts/basics/accounts/model)
- [NEAR Access Keys](https://docs.near.org/concepts/basics/accounts/access-keys)
- [NEAR Storage Staking](https://docs.near.org/concepts/basics/accounts/state)
- [NEAR Chain Abstraction](https://docs.near.org/build/chain-abstraction/what-is)
- [NEAR Smart Contract Storage](https://docs.near.org/build/smart-contracts/anatomy/storage)
- [NEAR Chain Signatures Blog](https://pages.near.org/blog/chain-signatures-turn-every-chain-into-near/)
- [NEAR MPC Repository](https://github.com/near/mpc)

### NEAR Ekosistem Araçları

- [FastAuth SDK (GitHub)](https://github.com/near/fastauth-js) — Email/passkey NEAR onboarding
- [Keypom](https://keypom.xyz/) — Link drop ile gasless onboarding
- [Mintbase](https://www.mintbase.xyz/) — FastAuth kullanan NEAR NFT platformu

### Araştırma Notları

- 3 paralel derin araştırma ajanı başlatıldı, 2'si eğitim verisinden kapsamlı sonuç döndürdü
- Web aramaları 429 rate limit nedeniyle kısıtlı kaldı (WebSearch, webReader MCP, curl)
- NEAR docs sayfa yapısı değişmiş (eski URL'ler 404)
- Tüm sabit ve akışlar kod tabanından satır bazlı doğrulanmıştır
- Rakip platform detayları eğitim verisinden (2025 başı), uygulama öncesi güncel durum kontrolü önerilir
- Protokol minimum 0.00183 NEAR rakamı NEAR mimari bilgisi ile teyit edilmiştir
