# YouTick Launch Plan — 2026-04

> Tarih: 2026-04-26
> Durum: Tek geçerli plan kaynağı (single source of truth)
> Kapsam: Public alpha + ilk ödemeli kullanıcılar + investor demo (30 gün)

Bu doküman YouTick'in tüm planlarını birleştirir. Eski plan ve yol haritası
dosyaları (`roadmap.md`, `deploy-plan.md`, `business/*-plani-*`,
`business/*-yol-haritasi-*`, `open-source-readiness.md`) **silindi**. Geçerli
referanslar:

- Mevcut durum: [`mainnet-open-source-readiness-2026-04-26.md`](./mainnet-open-source-readiness-2026-04-26.md)
- Risk log: [`operations/known-issues.md`](./operations/known-issues.md)
- Deploy runbook: [`operations/mainnet-deploy-runbook.md`](./operations/mainnet-deploy-runbook.md)
- Sürüm akışı: [`release-runbook.md`](./release-runbook.md)

---

## 1. Hedef

**30 günde:**

1. Mainnet'te public alpha — gerçek ödemeli kullanıcı kabul ediyor
2. Investor demo materyali — canlı mainnet metrikleri ile

**Kabul edilemez başarısızlık:** Bir kullanıcı bilet alıp izleyememesi.
Bu yüzden E2E smoke test launch gate'tir; geçilmeden gerçek kullanıcı
kabul edilmez.

---

## 2. Kararlar (Sabit)

| Konu | Karar |
|---|---|
| İçerik kontrolü | Üretici videoyu silemez. `nft-ticket` kontratında **owner-only takedown**. Pornografik / yasadışı içerik koruması. |
| Takedown timelock | **Timelock'suz** (acil müdahale gerekli). Her takedown `TakedownLog` event yayınlar. |
| Yetki devri | Owner-only takedown geçici. **2026 Q4 (Aralık sonu)** itibariyle DAO/multisig'e devir. ADR-009 ile taahhüt. |
| Trial pool | Mainnet'te **1 NEAR** ile başla. Tükenince Telegram alert + UI "satın al" mesajı. |
| State reset | Mainnet öncesi **`reset_v11`** ile temiz state. 33 orphaned trie kaydı temizlenecek. |
| Cross-chain checkout | NEAR Intents + 1Click API. **Faz 2** (alpha sonrası). Alpha'da kapalı. |
| Operasyon | Self-hosted VPS: Uptime Kuma + Grafana + Prometheus + Sentry + Telegram bot. |

---

## 3. 14 Günlük Plan

### Hafta 1 — Temizlik + içerik kontrolü + state reset

**Gün 1-2 — Takedown mekanizması**

- `nft-ticket` kontratına `takedown_event(event_id, reason)` ekle
  - Sadece `owner_id` çağırabilir
  - `TakedownLog` event yayınlar
  - `is_takedown` flag'i event struct'a eklenir
  - View metodları `is_takedown == true` olanları filtreleyebilir
- Unit test (yetki, double-takedown, log)
- Frontend: `is_takedown` rendering, `IpfsPlayer` çağrı engeli, "Removed by platform" mesajı
- ADR-009 yaz: "Owner-only content takedown — alpha; Q4 2026 DAO devri"
- ToS / Acceptable Use Policy taslak (yasal zemin)

**Gün 3 — Trial maliyet kontrolü (NO-OP)**

Kod incelemesi: `TRIAL_ACCOUNT_STORAGE_COST` zaten **0.002 NEAR**. Trial flow
(`lib.rs:2516, 2627`) bu sabiti kullanıyor — eski rapordaki "0.1 NEAR'da takılı"
varsayımı geçersiz. Mevcut trial maliyeti `0.002 + 0.01 = 0.012 NEAR/user`,
yani 1 NEAR ≈ 83 trial. Hedef zaten karşılanıyor.

`STORAGE_COST_ACCOUNT` (0.1 NEAR) ise **creator upload session deposit**'i
(trial değil). Düşürmek storage refund yetersizliğine yol açabilir. Dokunma.

Kazanılan zaman Gün 4-5'e (state reset) transfer edilir.

**Gün 4-5 — State reset koordinasyonu**

- 5 KMS operatör key rotation prosedürü (operatör ayrı KV namespace)
- Patched WASM build (`nft-ticket`, `access-control`, `operator-registry`)
- `reset_v11` çağrısı (timelock + duyuru)
- Tüm kontratları aynı release penceresinde deploy
- Doğrulama: `nft_total_supply == 0`, trie kayıtları temizlendi

**Gün 6-7 — Onboarding key + Web4 deploy**

- Eski Function Call Access Key revoke
- Yeni key `ONBOARDING_KEY` (server-only) env'e
- `apps/web/.env.local` temizliği (eski `NEXT_PUBLIC_KMS_URL` sil)
- Web4 timelock proposal `0` execute (24h beklendikten sonra)
- IPFS root + `/watch/` smoke

### Hafta 2 — Smoke test + monitoring + investor demo + launch

**Gün 8-9 — Live E2E smoke test**

- Test event: yükle → Shamir share dağıt (5 operatör) → satın al → izle
- 3-of-5 share reconstruction canlı doğrula
- Gift link üret → claim → izle
- Trial flow: onboarding key → sponsored account → free claim → izle
- Hata bulunursa Hafta 1'e dön; gate burada

**Gün 10-11 — Monitoring stack (VPS, ~$5-10/ay)**

| Katman | Araç | İzlenen |
|---|---|---|
| Uptime | Uptime Kuma | 5 KMS `/health`, 3 contract view, RPC, web4 root |
| Metrics | Grafana + Prometheus | KMS latency, share retrieval başarı %, RPC fail %, IPFS gateway |
| Hata | Sentry (mevcut) | Frontend + worker hataları |
| On-chain | Custom Node poller (5 dk) | `trial_pool_balance`, `paused`, timelock execute deadline, takedown count |
| Alert | Telegram bot | Tüm yukarıdakiler → tek kanal |

Eşikler:

- KMS share retrieval başarı < %95 → uyarı
- Trial pool < 0.2 NEAR → uyarı
- Herhangi bir contract paused → kritik
- Timelock execute deadline < 6h → hatırlatma

**Gün 12 — Trial pool fonlama**

- `youtick.near` üzerinden 1 NEAR yatır
- Daily limit kontrol (mevcut `daily_trial_limit`)
- Pool depletion alert test et
- Pool 0 olduğunda UI "satın al" fallback test

**Gün 13 — Investor demo materyali**

- 3-5 örnek paid event (creator partner ile)
- Public Grafana dashboard (read-only): canlı KMS, satış, trial sayıları
- Pitch noktaları (gerçek sayılarla):
  - 5/3 KMS threshold aktif
  - %98 creator pay
  - Browser-side encryption + Shamir SSS
  - Faz 2: NEAR Intents + 1Click cross-chain checkout
  - Q4 2026: DAO/multisig content governance

**Gün 14 — Launch gate review**

Aşağıdakilerin hepsi ✅ olmadan public duyuru yok:

- [ ] Patched WASM 3 kontrat mainnet'te
- [ ] `nft_total_supply == 0`, state temiz
- [ ] 5 KMS `/health` ok + redeploy edildi
- [ ] Web4 timelock #0 execute edildi
- [ ] Onboarding key rotated
- [ ] E2E smoke test (upload + purchase + watch + gift + trial) geçti
- [ ] 3-of-5 share reconstruction doğrulandı
- [ ] Monitoring + Telegram alert canlı
- [ ] Trial pool fonlanmış
- [ ] Takedown mekanizması test edildi
- [ ] ToS yayında
- [ ] `known-issues.md` güncel

Hepsi ✅ → public alpha duyurusu.

---

## 4. Faz 2 Roadmap (Alpha sonrası)

Alpha stabil olduktan sonra (yaklaşık 30+ gün):

- **Cross-chain checkout** — NEAR Intents + 1Click API entegrasyonu
- **Creator dashboard** — satış / gelir / takedown geçmişi görünürlüğü
- **Search & filtering** — discover sayfası iyileştirmesi
- **PWA / mobile** — mobil deneyim
- **Virtual trial** — account'suz trial (bellekte rapor mevcut, B/C stratejisi)
- **Cache invalidation Faz 3** — contract-event driven instant revoke

## 5. Q4 2026 — DAO Geçişi

Aralık 2026 sonu:

- Multisig veya DAO ile content governance
- Owner-only takedown → topluluk / panel kararı
- ADR-009 güncellemesi
- Geçiş runbook'u

---

## 6. Bu Plana Bağlı Açık Riskler

| Risk | Etki | Önlem |
|---|---|---|
| Takedown timelock'suz olduğu için kötüye kullanım | Yüksek | Tüm takedown event'leri public log; aylık takedown raporu |
| 1 NEAR trial pool hızlı tükenir | Orta | Telegram alert + otomatik UI fallback |
| Solo ops yorgunluğu | Yüksek | VPS monitoring + Telegram = 7/24 erişim, manuel poll yok |
| State reset sırasında orphaned share | Orta | KV namespace migration runbook'u + dry-run |
| Investor demo'da canlı bug | Yüksek | Demo öncesi 3 gün freeze; sadece monitoring değişikliği |

---

## 7. Doküman Hijyeni

- Bu dosya **tek geçerli plandır**. Yeni hedef eklenmek istenirse buraya işlenir, paralel plan dosyası açılmaz.
- Statü güncellemeleri: hafta sonunda checkbox güncelle.
- 14 gün dolduğunda bu dosya arşivlenir, yeni plan dosyası tarihli ad ile (`docs/launch-plan-2026-05.md`) açılır.
