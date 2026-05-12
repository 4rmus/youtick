# YouTick Launch Plan — 2026-05-12

> 30 günlük public alpha + pre-seed pitch. Solo founder. Tek geçerli plan kaynağı.
> Önceki plan (`launch-plan-2026-04.md`) commit `917e6cb`'de silinmişti; bu dosya onun yerini alır.

## Kaynak

Bu plan 2026-05-12 tarihli 4-agent senteziyle üretildi (`system-architect`, `security-engineer`, `socratic-mentor`, `pm-agent`). 4 iterasyonluk loophole hunt sonrası locked.

Ilgili dokümanlar:
- `docs/mainnet-open-source-readiness-2026-04-26.md` — readiness report (kapsam ve gate'lerin başlangıcı)
- `docs/operations/known-issues.md` — bilinen sorunlar tracker'ı
- `docs/architecture/README.md` — sistem mimarisi
- `AGENTS.md` — geliştirme prensipleri

## Özet

| Boyut | Değer |
|---|---|
| Public alpha açılış | Gün 23 (soft launch, warm network) |
| Pitch hedefi | Gün 30 (pre-seed $100-500K) |
| Toplam aktif iş | ~95-105 saat |
| Günlük yük | ~3.3h ortalama |
| Ship-blocker'lar | 3 (SB-1, SB-2, SB-3) |
| Mimari refactor'lar | 3 (R1, R2, R3); R2 batch upgrade |
| Mainnet contract upgrade | 1 batch (Gün 8), R2 module split odaklı |

## Sabit Kararlar (Locked 2026-05-12)

| # | Karar | Gerekçe |
|---|---|---|
| 1 | Pitch angle: **pre-seed** ($100-500K) | N=5-20 user signal yeterli; architecture + thesis sat |
| 2 | SB-2: **hard cutover** (overlap window yok) | Pre-launch, gerçek user yok; eski bundle riski minimal |
| 3 | Upgrade strategy: R2 **batch** (tek mainnet deploy) | Daha az risk penceresi; testnet'te soak |
| 4 | DAO design Q3'e ertelendi; sadece **transparency page** yazılıyor | Owner+ban-log+pre-staged pause kombinasyonu Q4'e kadar yeterli |
| 5 | Trial cost: `TRIAL_ACCOUNT_STORAGE_COST` zaten 0.002 NEAR; **baseline counter** telemetri ekle | Falsifiable abuse threshold için veri toplama başlasın |
| 6 | Monitoring stack: Sentry + Uptime Kuma + Telegram | VPS/Grafana erteleme; minimum viable monitor |

If/Then otomatik-karar kuralları (gelecek kararlar için):
1. Bir özellik alpha'yı >3 gün geciktirir VE WAU/retention'ı direkt etkilemezse → post-alpha'ya defer.
2. Bir on-chain parametre protokol minimumunun >5× üstünde VE falsifiable abuse threshold yazılmamışsa → 1 hafta içinde threshold yaz veya protokol min'e indir.
3. "Decentralized" dili kullanılıyor VE bir bileşen kurucu yokken sistemi durdurabiliyorsa → o bileşeni transparency page'inde merkezi olarak işaretle.

## Ship-Blocker'lar

### SB-2 — Mainnet onboarding key hâlâ rotate edilmemiş (HIGH, Gün 1)

**Sorun**: `NEXT_PUBLIC_ONBOARDING_KEY` eski public bundle'da yayımlanmıştı. Kod fix'i (server endpoint'e taşıma) yapıldı ama mainnet'teki Function Call Access Key hâlâ aktif. Saldırı vektörü canlı:
- `claim_free_ticket_direct` ile trial_pool drain (0.01 NEAR/call)
- `create_sponsored_trial_direct` ile sponsor drain (0.1 NEAR/call)
- `daily_limit` slot tüketimi → günün geri kalanı yasal trial kapalı

**Referanslar**: `docs/operations/known-issues.md:87-118`; `contracts/nft-ticket/src/lib.rs:3391-3447`

**Hard cutover runbook (Gün 1, ~2h, 6 adım)**:
1. Yeni keypair üret (offline). Private'ı yedekle.
2. `near call youtick.near add_onboarding_key '{"public_key":"ed25519:NEW..."}'` — yeni key kontrata eklendi, eski hâlâ aktif.
3. `apps/web/app/api/onboarding-key/` env var'ı yeni private/public ile güncelle. Local build koş.
4. Local'de yeni bundle'la trial flow E2E doğrula.
5. Web4 bundle deploy: `scripts/deploy-crust.mjs` veya `scripts/deploy-web4.sh`. Deploy başarılı mı doğrula: `curl <web4-url>/_next/.../bundle.js | grep <yeni-public-key-prefix>`.
6. **Ancak doğrulama PASS sonrası**: `near call youtick.near remove_onboarding_key '{"public_key":"ed25519:OLD..."}'`.

**Doğrulama**: Eski key ile çağrı `Unauthorized` döner.

**Risk**: Adım 5 başarısız ve adım 6 yapılırsa 24h boyunca trial kırık. Pre-launch dönem olduğu için gerçek kullanıcı etkisi yok.

### SB-1 — `/uploads/intent` auth'suz — Lighthouse budget DoS (HIGH, Gün 2)

**Sorun**: `workers/storage-api/src/index.ts:232-301 handleUploadIntentRequest` NEAR imzası istemiyor; `accountId` JSON'da self-declared. Default rate limit 1000 upload/saat per (accountId, IP). Saldırgan IP+accountId rotasyonu ile sınırsız intent mint eder, `/uploads/file` üzerinden Lighthouse'a 100 MiB encrypted garbage yükler, API key budget'ını saatler içinde tüketir.

**Referanslar**: `workers/storage-api/src/index.ts:232-301`, `:303`, `:347`, `:62`, `:735`, `:823`, `:872`, `:887`

**Fix**: `youtick-kms`'te zaten implement edilmiş challenge/verify pattern'i kopyala.

- Kopyalanacak: `workers/youtick-kms/src/index.ts:1285-1428` (NEP-413 challenge → verify → token)
- Eklenecek: `/uploads/auth/challenge` + `/uploads/auth/verify` endpoint'leri.
- `/uploads/intent` istek için `Authorization: Bearer <NEP-413 token>` zorunlu olsun. `claims.accountId` token'dan gelsin; JSON body'deki self-declared `accountId` artık kabul edilmesin.

**Süre**: 4-6h, test dahil. ~40 LOC.

**Doğrulama**: `curl -X POST <intent-url>` (Authorization header'sız) → 401 Unauthorized.

### SB-3 — `access-control` pause + `operator-registry` deactivate 24h timelock arkasında (HIGH, Gün 3)

**Sorun**: KMS operatörü compromise olursa `operator-registry` içindeki `deactivate_decryption_operator` çağrısı 24 saat bekler. `access-control` contract seviyesinde pause destekler; `operator-registry` ise `Pause` action'ı destekler, `PauseContract` değil. İncident anında 24h kayıp = ek share leakage.

**Referanslar**:
- `contracts/access-control/src/lib.rs:68-81`, `:514-563`
- `contracts/operator-registry/src/lib.rs:33-64`, `:269-329`

**Fix yolu**: Owner-direct pause kontrat upgrade (3-4h kod + 48h+ timelock window) yerine **pre-stage proposals** seçildi.

**Komutlar (Gün 3, ~1h aktif + 24h passive wait)**:
```bash
# access-control pause
near call access.youtick.near propose_action '{"action":"PauseContract"}'

# operator-registry pause
near call registry.youtick.near propose_action '{"action":"Pause"}'

# Her 5 KMS operatörü için deactivate proposal:
for op in a b c d e; do
  near call registry.youtick.near propose_action \
    "{\"action\":{\"DeactivateDecryptionOperator\":{\"account_id\":\"$op.youtick.near\"}}}"
done
```

Toplam 7 proposal. İncident anında `execute_action(<id>)` çağrısı 0-saniye etki.

**Doğrulama**: `near view <contract> get_timelock '{"id":<n>}'` — her birinin pending olduğunu gösterir.

**Bakım**: Kodda `TimelockProposal` sadece `action`, `proposer`, `proposed_at` tutuyor; 7 günlük expire window görünmüyor. Bu yüzden haftalık yenileme iddiası yok.

## Mimari Refactor'lar

### R1 — `lib/crust/gateway.ts` → `lib/ipfs/gateway.ts` (Gün 3-4, 4h)

**Sorun**: Dosya isim "Crust" ama içerik 5 public IPFS gateway + Lighthouse + `media-delivery` worker'ı route ediyor. Crust kaldırılmak istenirse yanlış dosya silinir. Investor/audit reaksiyonu kötü.

**Hedef yapı**:
```
apps/web/lib/
  ipfs/
    gateway.ts        # was lib/crust/gateway.ts
    config.ts         # gateway listesi + MEDIA_DELIVERY config
    media-ref.ts      # extractIpfsCid, normalizeIpfsRef
    index.ts
  crust/              # yalnızca write path
    client.ts         # uploadToCrust, pinOnCrust, uploadDirectoryToCrust
    config.ts         # Crust-specific endpoints + W3Auth
    w3auth.ts
    storage-order.ts
    cid-collector.ts
    types.ts
    index.ts
```

**4 chunk migration (her biri ~1h)**:
1. `lib/ipfs/` skeleton kopya (orijinal silinmez).
2. 5 consumer import rewrite: `apps/web/lib/ipfs-media.ts:1`, `lib/video-delivery.ts:3`, `lib/video-delivery-player.ts:1`, `lib/crust/client.ts:11`.
3. Eski `lib/crust/gateway.ts` ve `CRUST_GATEWAYS` block'unu sil. `tsc` + `vitest` koş.
4. `lib/kms/streaming.ts` (462 satır dead code) sil. `kms/index.ts:36-41` exports'tan temizle.

**Doğrulama**: `npm run build && npm test -- --run` green; bundle size delta ölç (~462 LOC + dead path).

**Rollback**: Chunk 3-4'ü `git revert`.

### R2 — `contracts/nft-ticket/src/lib.rs` Module Split (Gün 5-6, 6-8h)

**Sorun**: 5,664 satır, 130 public fonksiyon, tek dosya. Investor/auditor "wow modular" hikâyesi için zayıf. Kod kalitesi sorunu değil; **algılanan** kalite sorunu.

**Hedef yapı** (file-level split, logic DEĞİŞMEZ):
```
contracts/nft-ticket/src/
  lib.rs                  # entry + struct + global constants
  nft.rs                  # NFT standard impl
  market.rs               # buy_ticket, ft_on_transfer
  gift.rs                 # create_gift_drop, claim_gift_*
  onboarding.rs           # trial keys, claim_free_ticket_direct
  trial_invites.rs
  web4.rs
  moderation.rs           # ban/takedown
  treasury_stablecoin.rs  # USDC/USDT routes
  timelock.rs
```

**Bütünlük garantisi**: Her bölüm zaten kendi `impl Contract {}` bloğunda. Borsh serialization struct seviyesinde — fonksiyonlar farklı dosyada olsa da ABI değişmez. `near abi` veya `cargo expand` ile pre/post diff al, fark olmadığını doğrula.

**Risk**: Pure split olduğu için fonksiyonel risk düşük. Test suite (`cargo test`) tüm public path'leri kapsamalı.

**Trial cost notu**: `TRIAL_ACCOUNT_STORAGE_COST` kaynakta zaten `NearToken::from_millinear(2)` yani 0.002 NEAR. Bu R2 batch'i `STORAGE_COST_ACCOUNT` düşürme işiyle birleştirilmemeli; o sabit upload/event session maliyetinde kullanılıyor ve ayrı analiz gerektirir.

### R3 — `lib/constants.ts` Split (Gün 11, 2h, opsiyonel)

**Sorun**: 227 satırda security-critical config (contract IDs, gas, deposits) + Tailwind class string'leri (COLORS, ANIMATION) karışık. Diff hygiene için kötü.

**Hedef**:
```
apps/web/lib/
  config/
    near.ts         # NEAR_CONFIG, FEATURE_FLAGS, GAS, DEPOSIT, RATE_LIMITS
    app.ts          # APP_CONFIG, IPFS_CONFIG
    index.ts        # re-export
  design/
    tokens.ts       # COLORS, ANIMATION
```

İlk chunk additive: `lib/constants.ts` re-export'la backward compat sağla. İkinci chunk import sweep.

## Trial Cost Baseline (Strategy A)

**Repo gerçeği**: `contracts/nft-ticket/src/lib.rs` içinde trial account maliyeti
zaten `TRIAL_ACCOUNT_STORAGE_COST = NearToken::from_millinear(2)` yani 0.002
NEAR. `STORAGE_COST_ACCOUNT = NearToken::from_millinear(100)` yani 0.1 NEAR
ise `create_event`, `create_event_prepaid` ve `nft_mint_prepaid` upload/event
session yolunda kullanılıyor.

**Değişiklik**: Bu plan kapsamında contract constant değişikliği yok. İlk güvenli
iş baseline counter eklemek ve gerçek trial kullanım verisi toplamaktır.

**Baseline counter (Gün 19, 2h)**: Her trial claim'inde:
- `accountId`, `timestamp`, `referrer_ip_hash`, `trial_pool_balance` log'la.
- Cloudflare KV veya append-only file.
- Hedef: 7-14 gün sonra falsifiable abuse threshold yaz (örn. "haftalık aynı IP'den >3 trial → flag").

**Side-effect kontrolü**: Trial akışının hangi sabiti kullandığını karıştırma:
- `sponsor_implicit_guest_direct`
- `create_sponsored_trial_direct`
- `claim_free_ticket_direct` (`STORAGE_COST_NFT`, 0.01 NEAR ticket storage)

`STORAGE_COST_ACCOUNT` düşürülecekse bunu bu planın dışında, event/upload session
depozit etkisiyle birlikte ayrıca tasarla.

## Dokümantasyon

### Pre-launch (Gün 9-11, ~10h)

1. **`docs/public/architecture-overview.md`** — investor + due diligence one-pager.
   - TOC: What it is / Trust model / NEAR layer / IPFS layer / 5-of-3 KMS / Browser-side / Failure modes / Takedown policy / Public-alpha status.
   - Mermaid diagram reuse `docs/architecture/README.md`'den.
   - <600 kelime.
   - Decentralization score'u **sayı vermeden** tablo formatında yaz (centralized/decentralized today vs. plan).

2. **`docs/operations/incident-kms-operator-down.md`** — 1 operatör 5xx döndüğünde runbook.
   - Detect: Uptime Kuma alert
   - Triage: log inspect, registry view
   - Mitigate: pre-staged `DeactivateDecryptionOperator` proposal'ını execute
   - Recover: yeni operator endpoint deploy, registry update

3. **`docs/operations/incident-takedown.md`** — CSAM/copyright runbook.
   - Detect: report intake mekanizması
   - Onchain action: `near call youtick.near takedown_event '{"encrypted_cid":"...","reason":"..."}'`
   - IPFS unpin: Lighthouse + Crust unpin where provider tooling supports it
   - KMS share delete: public worker delete endpoint yok; operator/admin KV süreci olarak yaz
   - Post-mortem log: `docs/operations/takedowns/<date>.md`

4. **Line-number drift fix**:
   - `docs/kms-key-rotation.md:200` — 937 → 1090, 196 → 242-265
   - `docs/operations/known-issues.md` §6 — 1553 → 2326, 2090 → 3087

5. **`docs/operations/known-issues.md` §1 status flip**: V11 migration sonrası `nft_total_supply()=0` artık anomali değil, **clean-launch state**. "Critical anomaly" → "Resolved by V11 migration".

6. **`docs/public/economics.md`** — unit economics, post mainnet deploy.
   - 0.002 NEAR cost per trial
   - 98% creator payout
   - 2% platform commission
   - NEAR + USDC + USDT payment rails

7. **`docs/public/transparency.md`** — If/Then Kural 3 uygulaması.
   - Centralized: owner key (single), Cloudflare hosting, Lighthouse write, takedown authority
   - Decentralized: NEAR contract state, NFT ownership, payment settlement, Shamir share threshold
   - DAO plan: Q3-Q4 2026, scope tartışılıyor

## Backup + Monitoring

### KMS KV Snapshot (Gün 12, 2.5h)

**Cron worker veya manuel script**:
```bash
# Her operatör için:
wrangler kv:bulk get --namespace-id <id> > snapshot-<op>-<date>.json
# Encrypt with founder PGP/age key
age -r <pubkey> snapshot-<op>-<date>.json > snapshot-<op>-<date>.json.age
# Push to R2/S3
```

**Kadans**: Haftalık manuel. Otomasyon Q3.

**Recovery**: Operator KV kaybolursa, snapshot'tan restore. Threshold (3-of-5) tek bir operator loss'ü tolere eder ama 2+ loss = kayıp video access.

### Monitoring Stack (Gün 15-17, ~8h)

| Bileşen | Görev | Süre |
|---|---|---|
| Sentry frontend | JS exception + transaction tracing | 2h |
| Uptime Kuma | 5 KMS `/health` + storage-api + media-delivery + RPC failover | 3h |
| Telegram bot | Critical alert delivery | 2h |
| Grafana basic | RPC failover rate, KMS health histogram | 1h |

VPS gerekli mi? Cloudflare Workers + Uptime Kuma SaaS yeterli; VPS opsiyonel post-launch.

## 30-Day Day-by-Day Plan

### Hafta 1 — Security + Architecture (Gün 1-7)

| Gün | İş | Saat |
|---|---|---|
| 1 | SB-2 hard cutover (6-step runbook) | 2 |
| 1 | Personal network warm-up başlat (DM 5 kişi, "coming Day 23") | 0.5 |
| 2 | SB-1 storage-api NEP-413 auth | 4-6 |
| 3 | SB-3 pre-stage 7 proposals (1h aktif + 24h wait) | 1 |
| 3 | R1 chunk 1-2 (ipfs/ skeleton + import rewrite) | 4 |
| 4 | Testnet env doğrula; yoksa setup | 0-3 |
| 4 | R1 chunk 3-4 (eski sil + kms/streaming.ts sil) | 1 |
| 5 | R2 module split source change (Rust) | 3 |
| 6 | Testnet deploy + smoke test (R2+SB-1) | 4 |
| 7 | Hard cutover doğrulama + personal network DM (5 kişi daha) | 1.5 |

**Hafta 1 toplam**: ~21-25h

### Hafta 2 — Mainnet + Docs + Backup (Gün 8-14)

| Gün | İş | Saat |
|---|---|---|
| 8 | Mainnet batch deploy (TR sabahı, low traffic) + 4h monitor | 6 |
| 9 | Architecture one-pager + 2 incident runbook | 4 |
| 10 | Line-drift fix + known-issues §1 + unit economics doc | 3 |
| 11 | Transparency page + R3 (constants.ts split) | 3 |
| 12 | KMS KV snapshot script + PGP encryption + cron | 2.5 |
| 13 | Legal pages content review (/privacy /terms AUP) | 1 |
| 14 | Mid-checkpoint: 3-currency smoke (NEAR+USDC+USDT × upload-buy-watch) | 3 |

**Hafta 2 toplam**: ~22-25h

### Hafta 3 — Monitoring + Polish (Gün 15-21)

| Gün | İş | Saat |
|---|---|---|
| 15-16 | Sentry frontend + Uptime Kuma | 5 |
| 17 | Telegram alert bot + Grafana basic | 3 |
| 18 | Cross-chain flag prod-assert + build script guard | 1 |
| 19 | Trial baseline counter (abuse data collection) | 2 |
| 20-21 | Buffer + network warm-up DM final tur (5+ kişi) + bug bounty page stub | flex (4-6) |

**Hafta 3 toplam**: ~15-17h

### Hafta 4 — Launch + Marketing + Investor (Gün 22-30)

| Gün | İş | Saat |
|---|---|---|
| 22 | GO/NO-GO Launch Gate (8 madde) | 2 |
| 23 | Public alpha **AÇIK** — soft launch (warm network + NEAR Discord) | reactive |
| 24 | Pre-recorded demo video (90-sec, mainnet upload-buy-watch) | 2 |
| 25 | Day-1/2 monitor + hot fix capacity | reactive |
| 26 | Investor materials final paketleme (one-pager + economics + transparency + traction snapshot) | 4 |
| 27-28 | Marketing burst (Twitter thread + NEAR forum post + 1 demo video) | 6 |
| 29 | Investor outreach (warm intros first; 5-10 hedef) | 4 |
| 30 | Pitch hazırlığı + ilk meeting'ler | reactive |

**Hafta 4 toplam**: ~18-20h aktif + reactive

## GO/NO-GO Launch Gate (Gün 22)

Her madde binary. Bir tane FAIL = launch ertelenir.

- [ ] Mainnet onboarding key rotated; eski key `Unauthorized` döndürüyor
- [ ] `/uploads/intent` auth gerektiriyor (`curl` Authorization'suz → 401)
- [ ] Pre-staged pause/deactivate proposals 7 adet, `get_timelock` ile görünür
- [ ] Trial baseline counter captures claim events without changing `STORAGE_COST_ACCOUNT`
- [ ] R2 module split deploy verified (`near abi youtick.near` pre/post diff = empty)
- [ ] Smoke test: 3 currency × upload-buy-watch = 9/9 PASS
- [ ] 5 KMS operatör `/health` ready döndürüyor
- [ ] Sentry + Uptime Kuma + Telegram alert canlı, test alarmı geçti

## Residual Risks (Plan Dışı)

| Risk | Plan B |
|---|---|
| N=5-20 user gelmemesi (cold start) | Day 26-28 "thesis + architecture" odaklı pitch'i hazır tut; traction signal değil arch signal sat |
| Mainnet batch upgrade bug | Önceki WASM elinde rollback, monitor window 4h, gerekirse rollback Gün 8 akşam |
| Audit yapılmadan bilinmeyen kontrat zaafı | Bug bounty page Gün 20, başlangıç $1K signal pool |
| Cloudflare deplatform riski | Multi-CDN migration path documented (implement etme, plan tut) |
| Yatırımcı "come back at N=50" der | Plan B: kişisel network'ten 30 gün daha kullanıcı, Day 60-90 pitch |
| Lighthouse outage demo day | Crust fallback feature flag prod-on hazır; demo video pre-recorded |

## Bilinçli Olarak DOKUNMA Listesi

| Tempting | Defer rationale |
|---|---|
| `nft-ticket`'ı 3+ ayrı kontrata bölmek | Module-split (R2) yeterli "modular" hikâyesi; full extraction Q3-Q4. |
| `hooks/useUpload.ts` rewrite (777 satır) | En yüksek revenue path; refactor = upload bug riski. |
| `lib/rate-limiter.ts` Redis migration | Onchain counter gerçek savunma; user yok. |
| Turbopack migration | Worker compat rough edge'leri; 30 günde bahis koyma. |
| `lib/translations.ts` code-split | Bundle pressure varsa post-launch; SEO blocker değil. |
| Server-side rate-limiter `/tmp/` fix | Web4 static deploy bu path'i kullanmıyor. |
| Full DAO design | Q3-Q4 ertelendi; sadece transparency page. |
| KMS operator multi-tenant separation | Şu an tek hesap altında 5 namespace; alpha sonrası bağımsız operatör onboarding. |

## Cadence

**Daily** (≤5dk): `docs/operations/known-issues.md` glance, sadece bir issue açtın/kapattıysan dokun.

**Weekly Friday** (30dk): Launch Gate reconcile. >2 checkbox flip = yeni dated readiness report aç.

**Once before launch** (Hafta 1-2): bu plan'ın Hafta 1-2 bölümü.

**Once during launch** (Hafta 4): Day 23 soft launch + Day 26-28 marketing.

**Once after launch** (Day +3): yeni dated readiness report (`docs/mainnet-open-source-readiness-2026-06-DD.md`) — actual deploy CIDs, worker versions, smoke-test outcome.

**Yapmıyoruz**: Sprint board, doc-coverage metric, weekly architecture review, wiki, CHANGELOG bot. Tek kişi var.

## Plan Sahipliği ve Güncelleme

- Sahibi: kurucu (solo)
- Bu dosya rotates: Hafta 4 sonu (Gün 30) yeni dated dosya açılır, bu arşivlenir.
- Değişiklik prosedürü: alt karar tartışmaları bu dosyaya işle, paralel plan dosyası açma.
- Memory pointer: `~/.claude/projects/-Users-arair-works-youtick/memory/launch-plan.md`
