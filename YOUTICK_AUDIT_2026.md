# YouTick — Baştan Sona Kapsamlı Denetim ve Yol Haritası Raporu

> **Tarih:** 23 Nisan 2026  
> **Denetim Türü:** Statik kod analizi, mimari değerlendirme, doküman tutarlılık kontrolü, teknoloji doğrulaması  
> **Yöntem:** 5 paralel uzman ajan ile kod, güvenlik, merkeziyetsizlik, altyapı ve doküman incelemesi; ardından teknoloji resmi dokümanlarıyla teyit  
> **Kapsam:** `apps/web/`, `contracts/`, `workers/`, `scripts/`, `docs/`

---

## 1. Yönetici Özeti

| Alan | Puan | Derece |
|------|------|--------|
| **Kod Kalitesi & Tutarlılık** | 6.5/10 | C+ |
| **Güvenlik** | 5.5/10 | D+ |
| **Merkeziyetsizlik** | 4.0/10 | D+ |
| **Döküman Tutarlılığı** | 4.5/10 | D |
| **Genel Proje Sağlığı** | 5.1/10 | D+ |

**Tek Cümle Değerlendirme:** YouTick, kriptografik açıdan sofistike ve mimari olarak iddialı bir projedir. Ancak kritik güvenlik açıkları, tutarsız dökümantasyon ve operasyonel merkeziyetsizlik eksikliği, onu "production-ready" bir merkeziyetsiz platform olmaktan uzak tutuyor.

---

## 2. Doğrulama Metodolojisi

Bu rapordaki bulgular aşağıdaki yöntemlerle teyit edilmiştir:

1. **Doğrudan kaynak kod okuma:** Her bulgu ilgili dosya ve satır üzerinden doğrulanmıştır.
2. **Teknoloji resmi dokümanları:**
   - NEAR SDK 5.x (`docs.rs/near-sdk/latest/`) — `#[private]`, `#[init]`, `#[near]` macro davranışları
   - Cloudflare Workers KV dokümanları — CAP teoremi, eventual consistency, rate limit davranışı
   - Cloudflare Durable Objects best practices
3. **Matematiksel/teknik analiz:** Free ticket drain, `saturating_sub` double-ban, bellek patlaması hesaplamaları

> **Önemli Not:** Önceki taslak raporda `#[private]`'ın "ölü kod" olarak nitelendirilmesi, NEAR SDK resmi dokümanlarıyla yapılan teyit sonrası **revize edilmiştir.** `#[private]` owner = contract account (`youtick.near`) durumunda direct call'a izin verir. Ancak semantik olarak state-wipe için yanlış pattern'dir; explicit owner check daha güvenlidir.

---

## 3. Güvenlik Değerlendirmesi

### 3.1 Kritik Güvenlik Açıkları

#### 🔴 NFT-CRIT-1: Free Ticket ile Contract Bakiyesi Boşaltma
- **Dosya:** `contracts/nft-ticket/src/lib.rs:1511-1517`
- **Durum:** ❌ Açık (Doğrulandı)
- **Açıklama:** `buy_ticket`'ın free-event (`price == 0`) kolunda:
  ```rust
  require!(
      deposit >= storage_cost || env::account_balance() > storage_cost,
      "Insufficient deposit for storage"
  );
  ```
  Kullanıcı 0 NEAR gönderirse, `deposit >= storage_cost` false olur. `env::account_balance()` (~7,357 Ⓝ) > 0.01 NEAR olduğundan ikinci koşul true olur. Contract'ın genel bakiyesinden storage masrafı ödenir. Sınırsız tekrarlanabilir.
- **Etki:** Trial pool, commission pool ve tüm gelirler eritilebilir.
- **Çözüm:** `env::account_balance()` fallback'ini kaldır. Free ticket'ta da `deposit >= storage_cost` zorunlu olsun.

#### 🔴 NFT-CRIT-2: `reset_v11()` ve `migrate()` Yanlış Access Control Pattern
- **Dosya:** `contracts/nft-ticket/src/lib.rs:372` ve `migrate.rs:40`
- **Durum:** ⚠️ Revize Edildi (Doğrulandı)
- **Açıklama:** Her iki fonksiyon da `#[private] #[init(ignore_state)]` ile işaretlenmiş. NEAR SDK dokümanına göre `#[private]`, `predecessor_account_id == current_account_id` kontrolü yapar. YouTick'te owner = contract account (`youtick.near`) olduğundan, owner direct call yapabilir.
- **Ancak:** `#[private]`'ın semantiği "sadece internal callback"dir. State-wipe gibi kritik operasyonlar için explicit owner check (`require!(env::predecessor_account_id() == self.tokens.owner_id)`) daha doğru ve güvenlidir.
- **Etki:** `#[private]` semantik olarak yanlış kullanılmıştır. Gelecekte cross-contract call zincirlerinde beklenmedik çağrılara açık olabilir.
- **Çözüm:** `#[private]`'ı kaldır, explicit owner check ekle.

#### 🔴 SCR-CRIT-1, SCR-CRIT-2, SCR-CRIT-3: Hardcoded Private Key
- **Dosya:** `scripts/deploy-nft-sub.js:9`, `scripts/archive/deploy-nft-dev.js:8`, `scripts/archive/bootstrap-registry-testnet.js:9`
- **Durum:** ❌ Açık (Doğrulandı)
- **Açıklama:** Aynı testnet private key (`REDACTED`) üç ayrı dosyada kaynak kodda görünür durumda.
- **Etki:** Git history'de kalıcı. Key hemen rotate edilmeli ve git history temizlenmeli (`git filter-repo` / BFG).
- **Çözüm:** Tüm hardcoded key'leri `process.env`'e taşı. Archive dosyalardaki fallback'leri kaldır.

---

### 3.2 Yüksek Güvenlik Açıkları

#### 🟠 NFT-HIGH-1: `ban_event` Double-Ban Counter Corruption
- **Dosya:** `contracts/nft-ticket/src/lib.rs:809-825`
- **Durum:** ❌ Açık (Doğrulandı)
- **Açıklama:** `ban_event`, event'in zaten banlı olup olmadığını kontrol etmeden `active_event_count.saturating_sub(1)` yapar. `saturating_sub` negatife gitmez ama sayacı gereğinden fazla azaltır. `unban_event` ise doğru kontrol ediyor (`removed.is_some()`).
- **Çözüm:** Ban öncesi `self.lazy_banned_events().get(&encrypted_cid).is_none()` kontrolü ekle.

#### 🟠 NFT-HIGH-2: `gift_ticket` Banned Event Bypass
- **Dosya:** `contracts/nft-ticket/src/lib.rs:2723-2773`
- **Durum:** ❌ Açık (Doğrulandı)
- **Açıklama:** `gift_ticket` hiçbir şekilde `lazy_banned_events()`'i kontrol etmez. Banlanmış bir event'in creator'ı yine de hediye bileti dağıtabilir.
- **Çözüm:** Mint öncesi banned event kontrolü ekle.

#### 🟠 NFT-HIGH-3: `admin_remove_events` Unbounded Iteration
- **Dosya:** `contracts/nft-ticket/src/lib.rs:859-897`
- **Durum:** ❌ Açık (Doğrulandı)
- **Açıklama:** Her CID için tüm `video_metadata` (`UnorderedMap`) üzerinden linear scan yapar. Büyük koleksiyonlarda gas limit aşımı.
- **Çözüm:** `encrypted_cid → Vec<token_id>` reverse index ekle veya paginate et.

#### 🟠 NFT-HIGH-4: `active_event_count` Migrate Sonrası 0 Kalıyor
- **Dosya:** `contracts/nft-ticket/src/migrate.rs:54`
- **Durum:** ❌ Açık (Doğrulandı)
- **Açıklama:** Yorumda "rebuilt via rebuild_event_counter after migration" yazıyor ama böyle bir fonksiyon yok.
- **Çözüm:** `migrate()` içinde counter'ı rebuild et veya ayrı bir admin fonksiyonu ekle.

#### 🟠 KMS-HIGH-1: Rate Limit Race Condition (KV Non-Atomic)
- **Dosya:** `workers/youtick-kms/src/index.ts:742-759`
- **Durum:** ❌ Açık (Doğrulandı)
- **Açıklama:** Cloudflare KV eventual consistent'tir (AP model, CAP teoremi). `get` + `put` iki ayrı operasyon. Eşzamanlı request'lerde aynı `current` değeri okunup limit aşılabilir.
- **Çözüm:** Durable Objects veya compare-and-swap retry loop kullan.

#### 🟠 PROXY-HIGH-1: Web4 Proxy 404 Failover
- **Dosya:** `workers/web4-proxy/src/index.ts:112`
- **Durum:** ❌ Açık (Doğrulandı)
- **Açıklama:** `if (!originResponse.ok)` 404'ü de içerir. Primary origin'deki gerçek 404, fallback'e yönlendirilir ve farklı içerik dönebilir.
- **Çözüm:** Sadece 5xx ve network hatalarında failover yap.

---

## 4. Kod Kalitesi & Tutarlılık Değerlendirmesi

### 4.1 Kritik Kod Kalitesi Sorunları

#### 🔴 FE-CRIT-1: Module-Level Bellek Sızıntısı
- **Dosya:** `apps/web/lib/upload-session-manager.ts:19`
- **Durum:** ❌ Açık
- **Açıklama:** `const uploadSessionKeys = new Map<string, KeyPair>()` hiç temizlenmiyor. Next.js Fast Refresh ve production singleton pattern'de state app lifetime boyunca kalır.
- **Çözüm:** LRU cache veya TTL eviction ekle.

#### 🔴 FE-CRIT-2: `createDecryptedBlobUrl` Bellek Patlaması
- **Dosya:** `apps/web/lib/kms/streaming.ts:284-334`
- **Durum:** ❌ Açık
- **Açıklama:** Tüm video chunk'larını `ArrayBuffer[]` içinde tutup `Blob` oluşturur. 500MB video = ~1GB anlık bellek. Tarayıcı çöker.
- **Çözüm:** MSE-based `video-delivery-player.ts`'e tam geçiş yap veya max file size limit ekle (örn. 50MB).

### 4.2 Yüksek Kod Kalitesi Sorunları

#### 🟠 Monolitik Bileşenler
| Bileşen | Satır | Sorun |
|---------|-------|-------|
| `components/UploadForm.tsx` | 1,323 | Şifreleme, segmentasyon, upload, storage order, thumbnail — hepsi bir dosyada |
| `components/IpfsPlayer.tsx` | 929 | MSE, seek, fullscreen, satın alma kartı — ayrıştırılması gerek |
| `app/claim/page.tsx` | 638 | Blockchain tx logic page içinde |
| `lib/gift-service.ts` | 960 | Hediye, trial, onboarding, sponsorship — birbirine girmiş |

#### 🟠 Tutarsızlıklar
- **Dil karmaşası:** `lib/translations.ts` var ama birçok yerde inline Türkçe string (örn. `UploadForm.tsx:1001`)
- **Duplicate utility'ler:** `sleep`, `extractIpfsCid`, `runWithConcurrency`, `concatenateArrayBuffers` en az 2'şer dosyada tekrar tanımlanmış
- **Contract ID tanımları:** `CONTRACT_ID`, `NFT_CONTRACT`, `NFT_CONTRACT_ID`, `configuredMarketContractId` — farklı isimlerle aynı değer
- **Ölü kod:** `lib/crypto/aes-gcm.ts` hiç import edilmiyor

---

## 5. Merkeziyetsizlik Değerlendirmesi (4.0/10 — D+)

### Bileşen Bazında Puanlama

| Bileşen | Puan | Açıklama |
|---------|------|----------|
| **NEAR Settlement** | 8/10 | Kamu, izinsiz blockchain. Tek başına merkeziyetsiz. |
| **Smart Contract'lar** | 4/10 | Owner tek başına her şeyi yapabiliyor. DAO, timelock, multi-sig yok. |
| **KMS / Anahtar Emaneti** | 5/10 | 3-of-5 Shamir **yapısal olarak** sağlam ama 5 operator de muhtemelen aynı Cloudflare hesabında. |
| **IPFS / Medya** | 7/10 | Crust merkeziyetsiz pinning. Gateway'ler engellenebilir. |
| **Frontend / Web4** | 3/10 | `youtick.net` domain merkezi. Cloudflare hizmeti durdurursa domain ölür. |
| **Erişim Kontrolü** | 5/10 | Session grant'ler iyi tasarlanmış ama owner global pause atabilir. |

### Kritik Risk: KV Data Loss
Cloudflare KV'deki Shamir shares silinirse (hesap kapatma, operatör hatası vs.), **içerik kalıcı olarak okunamaz**. Çünkü:
- Kullanıcı tarafında share yedeği yok
- On-chain recovery mekanizması yok
- Shares operator secret'leriyle şifrelenmiş

### Verdict
> **YouTick bugün "merkeziyetsiz" değil, "kriptografik olarak güçlendirilmiş, geliştirici tarafından işletilen bir platform"dur.** Mimari merkeziyetsizliğe giden yolu açmış ama operasyonel olarak henüz o yolda değil.

---

## 6. Döküman Tutarlılığı Değerlendirmesi (4.5/10 — D)

### 🚨 Kritik: `docs/api/contract-methods.md` Tamamen Yanlış
- **Durum:** ❌ Açık
- `publish_event`, `update_event_metadata`, `grant_moderator`, `has_access_pass` gibi method'lar **yok**
- `propose_owner`, `accept_ownership`, `check_trial_access`, `ft_on_transfer` gibi method'lar **var ama dokümanda yok**
- "Target v1 / not live runtime" etiketli ama ana dokümanlardan linkleniyor

### 🔴 `docs/release-runbook.md` Yanlış Referanslar
- `near view access.youtick.near get_config` → Method **yok**
- `near view registry.youtick.near get_active_operators` → Method **yok**
- `near call youtick.near pause '{}'` → Method **yok** (sadece `pause_scope` var)
- `docs/release-log.md` → Dosya **yok**

### 🟠 Dil Karmaşası
Teknik dokümanlar İngilizce ve Türkçe karışık. Politika yok.

---

## 7. Yol Haritası (Roadmap)

### 🚨 P0 — Acil (Bu Hafta)
| # | Görev | Beklenen Etki | Tahmini Süre |
|---|-------|---------------|--------------|
| 1 | `buy_ticket` free path: `env::account_balance()` fallback'ini kaldır | Contract drain riskini ortadan kaldırır | 15 dk |
| 2 | `reset_v11` ve `migrate`: `#[private]` → explicit owner check | State recovery için güvenli access control | 30 dk |
| 3 | Hardcoded private key'leri sil (`deploy-nft-sub.js`, `archive/`) | Secret hygiene | 30 dk |
| 4 | Git history'den private key'leri temizle (BFG / `git filter-repo`) | Kalıcı secret exposure'u engeller | 30 dk |
| 5 | `ban_event`'e `already banned?` kontrolü ekle | Counter sapmasını engeller | 10 dk |
| 6 | `gift_ticket`'a banned event kontrolü ekle | Moderasyon bypass'ını kapatır | 10 dk |
| 7 | `docs/api/contract-methods.md`'yi sil veya gerçek koddan yeniden yaz | Geliştirici kafa karışıklığını önler | 2 saat |

### 🔴 P1 — Kısa Vadeli (2-3 Hafta)
| # | Görev | Beklenen Etki | Tahmini Süre |
|---|-------|---------------|--------------|
| 8 | `uploadSessionKeys` Map'e TTL/LRU ekle | Bellek sızıntısını önler | 2 saat |
| 9 | `createDecryptedBlobUrl`'ü kaldır veya max size limit ekle | Tarayıcı çöküş riskini ortadan kaldırır | 2 saat |
| 10 | `admin_remove_events`'e reverse index (`cid → token_ids`) ekle | Gas limit aşımını önler | 4 saat |
| 11 | `active_event_count`'u `migrate()` içinde rebuild et | State consistency | 1 saat |
| 12 | `docs/release-runbook.md`'deki olmayan method/dosya referanslarını sil | Operasyonel hata riskini azaltır | 1 saat |
| 13 | `lib/utils.ts` oluştur; duplicate utility'leri birleştir | Kod bakımını kolaylaştırır | 3 saat |
| 14 | Turkish inline string'leri `lib/translations.ts`'e taşı | i18n tutarlılığı | 3 saat |
| 15 | `components/UploadForm.tsx`'i 400 satır altına indir (extract sub-modules) | Bakılabilirlik | 8 saat |

### 🟡 P2 — Orta Vadeli (1 Ay)
| # | Görev | Beklenen Etki | Tahmini Süre |
|---|-------|---------------|--------------|
| 16 | **2-3 bağımsız KMS operator'ü** devreye al (farklı infra sağlayıcı) | Merkeziyetsizlik D+ → B- | 1-2 hafta |
| 17 | Critical owner fonksiyonlarına **timelock** ekle (24-48 saat) | Kullanıcı güveni ve insider threat azaltımı | 1 hafta |
| 18 | Contract **pause/emergency stop** mekanizması ekle | Kriz yönetimi | 3 gün |
| 19 | **Reproducible build + IPFS CID publish** pipeline'ı | Frontend şeffaflığı | 3 gün |
| 20 | KMS worker'ı modüle ayır (`crypto.ts`, `auth.ts`, `routes.ts`) | Bakılabilirlik | 1 hafta |
| 21 | Cloudflare Durable Objects ile atomic rate limit | Race condition çözümü | 3 gün |
| 22 | `web4-proxy`'de 404 failover'ını düzelt (sadece 5xx/network) | Proxy davranışı düzeltimi | 2 saat |
| 23 | Sentry/Logpush entegrasyonu — Worker hata takibi | Gözlemlenebilirlik | 2 gün |
| 24 | `access-control` ve `operator-registry`'e migration path ekle | Gelecekteki upgrade güvenliği | 2 gün |

### 🟢 P3 — Uzun Vadeli (1-3 Ay)
| # | Görev | Beklenen Etki | Tahmini Süre |
|---|-------|---------------|--------------|
| 25 | **User-controlled share backup** mekanizması | Operator kaybına karşı dayanıklılık | 2 hafta |
| 26 | On-chain IPFS persistence verification (oracle veya cron) | Medya erişilebilirlik garantisi | 2 hafta |
| 27 | **DAO treasury** modeline geçiş (SputnikDAO / AstroDAO) | Ekonomik merkeziyetsizlik | 1 ay |
| 28 | Multi-sig veya council-based content moderation | Sansür direnci | 2-3 hafta |
| 29 | Non-Cloudflare operator infrastructure (Deno Deploy, Fly.io) | Vendor lock-in azaltımı | 2 hafta |
| 30 | Formal security audit (OtterSec, BlockSec vb.) | Üçüncü taraf güven doğrulaması | 2-4 hafta (dış kaynak) |

---

## 8. Sonuç ve Tavsiyeler

### Neleri Çok İyi Yapmışsın?
1. **Kriptografik mimari** gerçekten sofistike — browser AES, Shamir SSS, session grants, MSE streaming hepsi doğru yerde
2. **%98 creator payout** — Sektörde neredeyse eşi benzeri yok
3. **İki-adımlı ownership transfer** — `propose_owner` + `accept_ownership` iyi güvenlik pratiği
4. **RPC failover** — NEAR altyapısına karşı dayanıklı
5. **Saturating arithmetic** ve `overflow-checks = true` — Kontrat seviyesinde overflow güvenliği

### Öncelikli 3 Aksiyon (Eğer Sadece 3 Şey Yapacaksan)
1. **NFT-CRIT-1'i düzelt** (`env::account_balance()` fallback'ini kaldır) — 15 dk, contract'ı kurtarır
2. **Hardcoded private key'leri sil ve rotate et** — 1 saat, reputation riskini önler
3. **2 bağımsız KMS operator'ü bul** — 1-2 hafta, merkeziyetsizlik iddiasını gerçekleştirir

### Nihati Tavsiye
YouTick, **teknik yetkinlik açısından çok güçlü bir solo projedir.** Kriptografi, Web3 entegrasyonu ve streaming mimarisi konusundaki bilgi birikiminiz bariz. Ancak solo geliştirici olmanın getirdiği **kör noktalar** var — kod review yok, security audit yok, operasyonel redundancy yok.

**Bir sonraki adımınız şu olmalı:** Yukarıdaki P0 listesini bu hafta bitirin. Ardından P1 listesini 2-3 hafta içinde tamamlayın. Bu iki sprint sonrası projeniz D+ → **B-** seviyesine çıkar.

---

*Bu rapor, statik kod analizi ve açık kaynak teknoloji dokümanları üzerinden hazırlanmıştır. Üretim ortamında çalışan bir sistemin tam güvenlik denetimi için dinamik fuzzing, formal verification ve canlı ağ testleri de önerilir.*
