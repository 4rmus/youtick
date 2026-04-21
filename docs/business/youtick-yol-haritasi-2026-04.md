# YouTick Solo Kurucu Yol Haritası

> Tarih: 2026-04-18
> Branch: `fix/security-hardening-and-code-quality`
> Kapsam: Mainnet yayın güvenliği + solo kurucu için 3 aylık uygulama sırası
> Okuyucu: Tek geliştirici + kurucu. Bu dokümanı kendine hatırlatma ve yatırımcı konuşması kaynağı olarak kullan.
> Destek belgeleri: `trial-account-maliyet-analizi-ve-yol-haritasi-2026-04.md` (unit economics), `youtick-avrupa-sirketlesme-raporu-2026-04.md` (hukuki zemin)

---

## 0. Tek Sayfa Özet

**Teknik hazırlık yeterli. Yayına çıkabilirsin. Tek kişilik gerçeklik altında ürünü değil dağıtımı ve unit economics'i önceliklendir.**

- Mainnet kontratları canlı (`youtick.near`, `access.youtick.near`, `registry.youtick.near`).
- 40+ kontrat testi, 179 frontend testi, 40 KMS worker testi temiz.
- 8 kritik/yüksek güvenlik bulgusu kapalı. Sert deploy engeli yok.
- Audit yok — **soft launch + bug bounty doğru karar.** Custody yok (%98 creator'a doğrudan), launch anındaki honey pot riski minimum.
- Gerçek zayıflık kod değil **operasyon:** tek kişi on-call, monitoring kritik.
- Yatırımcı eşiği **trial maliyeti $0.44 → $0.048** (Strategy A). Bu yapılmadan ciddi fon konuşması yok.

---

## 1. Yayına Çıkış Güvenlik Durumu

### 1.1 Doğrulanmış durumlar

| Katman | Durum |
|---|---|
| Kontratlar | 3 kontrat release build temiz, 40+ test geçiyor |
| Frontend | TypeScript 0 hata, 179/179 test, Next.js prod build temiz |
| KMS worker | 40 Vitest testi (config, crypto, NEP-413), 5 operatör aktif, secret'lar yüklü |
| Güvenlik hardening | AC-1, KV-1, S-3, OW-1, OR-1, CORS-1, RL-1, AG-1 kapalı |
| Observability | Sentry instrumentation (Next.js 16 pattern), DSN dolu |
| Dokümantasyon | `docs/release-runbook.md`, `docs/kms-key-rotation.md` yazılı |
| Deprecated kod | `workers/guest-relayer` silindi |

### 1.2 Bilinen açık riskler (yönetilebilir)

| Risk | Gerçek etki | Azaltma |
|---|---|---|
| Üçüncü parti kontrat audit yok | Launch'ta düşük (0 user = 0 exposure). GMV büyüdükçe yükselir. | Bug bounty + düşük-hacim soft launch + GMV $50K'da audit |
| E2E test yok | Düşük (<500 user manuel test kabul edilebilir) | Manuel test + Sentry error rate izleme |
| `near-sdk` upgrade bloke | Düşük — workspaces/cargo-near-build toolchain uyumsuzluğu dışarıdan çözülecek | Takip et, kendin çözme |
| Tek kişilik on-call | Orta — operasyonel süreklilik zayıflığı | Sentry alert → telefon/Discord; runbook baş ucunda |
| Trial pool drenajı | Orta — $0.44/user × 3K user/ay = $1.320/ay | Strategy A (Aşama 2'de zorunlu) |

**Değerlendirme:** Kod tabanı soft launch için yeterli. Geriye kalan risk zamanla ve yük arttıkça yönetilmeli.

---

## 2. Solo Kurucu Önceliklendirme Prensipleri

Bu prensipleri sık sık unutulacak — her sprint başında okunmalı.

1. **Her saat ya ürüne ya dağıtıma gider.** İkisini aynı anda yapma.
2. **"Bir özellik daha" tuzağı.** Mevcut ürün iyi. 3 hafta sadece dağıtım.
3. **Pazarlama = ürün.** Solo'da kod değil, hikaye ve insan ilişkisi traction getirir.
4. **Traction → pitch, tersi değil.** Veri olmadan yatırımcı görüşmesi erken.
5. **Unit economics yatırımcı eşiği.** Strategy A yapılmadan fon konuşması havada kalır.
6. **Audit, E2E suite, tam a11y: yatırım/gelir sonrası.** Şimdi değil.
7. **Mükemmel değil güvenli yeterli.** Ship, prove, pitch.

---

## 3. Üç Aşamalı Yol Haritası

### Aşama 1 — Ship (Bu hafta, 3-5 gün)

**Neden:** Kod %85 hazır, kalan %15 piyasa verisi olmadan kendini kandırır.
**Amaç:** Mainnet'te gerçek URL, gerçek kullanıcı, gerçek veri.

| İş | Tahmini süre | Öncelik |
|---|---|---|
| Gift drop 50 anahtar gas testi (mainnet, küçük event) | 2 saat | Yüksek |
| Web4 proxy rate limit | 1 gün | Yüksek |
| Bug bounty sayfası aç (HackenProof/Immunefi, $500-2K havuz) | 2 saat | Orta |
| Sentry alert kuralları: error rate > threshold → telefon/Discord | 1 saat | Yüksek |
| Relayer private key'leri `.env` dışı, git'te yok doğrulama | 15 dk | Kritik |
| Release runbook'u bir kez kuru çalıştır (staging'e yalandan deploy) | 2-3 saat | Orta |
| İlk 10 davetli creator'ı elle onboard et | 1-2 hafta (paralel) | Yüksek |

**Agent kullanımı:** `@contract` (gas testi), `@devops` (rate limit + runbook).

### Aşama 2 — Prove (2-4 hafta)

**Neden:** Yatırımcı "kaç kullanıcı, kaç video, birim maliyet?" diye sorar. Şu an cevap "0/0/$0.44 sürdürülemez." Bu aşamada hepsi değişmeli.

**Amaç:** Pitch-ready metrikler + yatırımcı-ready unit economics.

| İş | Süre | Amaç |
|---|---|---|
| İlk 30-50 kullanıcı, 20+ video, 5-10 ödeme işlemi | 2-3 hafta | Traction sinyali |
| **Strategy A** — `STORAGE_COST_ACCOUNT` 0.1 → 0.012 NEAR | 2 gün kod + test | $0.44 → $0.048 |
| Sentry'de 30 gün temiz error rate | 30 gün gözlem | "Stable" denebilir |
| 1-2 OG-optimize edilmiş demo video (Twitter/LinkedIn paylaşılabilir) | 1 gün | Organic funnel |
| Landing page polish + creator onboarding funnel | 3-5 gün | Conversion |

**Strategy A detayı:** `contracts/nft-ticket/src/lib.rs:54`'te `STORAGE_COST_ACCOUNT` sabiti 0.1 NEAR'dan 0.012 NEAR'a düşürülecek. NEAR protokol minimum (0.00183 NEAR) üzerine 6x buffer bırakır. Test etkisi: sandbox test'te yeni değerle tüm flow'ların geçtiğini doğrula.

**Agent kullanımı:** `@contract` + `@security` (Strategy A), `@frontend` (landing), Tavily MCP (rakip analiz, creator outreach araştırma).

### Aşama 3 — Pitch & Grow (1-3 ay)

**Neden:** Aşama 2'de traction varsa konuşacak şey var. Yoksa pitch erken.
**Amaç:** Pre-seed/seed turu aç veya organic growth'u çarp.

- Pitch deck: güçlü teknik hikaye + Strategy A ile güçlenmiş unit economics
- Creator outreach: manuel, 20-50 creator hedefi (solo'da tek yol)
- İlk 30 gün metriklerini herkese açık paylaş (transparency güçlü sinyal)
- Strategy B planı hazır (yatırım sonrası uygulanacak — virtual trial access)
- Estonya OÜ konumlandırması yatırım alınınca tekrar gündeme
- GMV $50K'ya yaklaşınca üçüncü parti kontrat audit

---

## 4. Explicitly Defer Edilen Kalemler

Bu kalemler bilinçli ertelendi. Her sprint tekrar açma dürtüsüne karşı buraya yazıldı.

| Kalem | Ertelendi çünkü | Gündeme dönüş şartı |
|---|---|---|
| Üçüncü parti kontrat audit | $30-80K + 4-8 hafta, solo için oransız | GMV $50K+ |
| E2E Playwright suite | <500 user manuel test yeterli | 500+ aktif user |
| Tam a11y sprint | Solo kapasite dışı, iteratif ekle | Yatırım sonrası QA bütçesi |
| Migration testleri | Migration yapılmıyor | Gerçek migration gerektiğinde |
| `near-sdk` 5.5 → 5.26 upgrade | Toolchain bloke, dış bağımlılık | `near-workspaces` + `cargo-near-build` uyumu gelince |
| Strategy B/C/D | Sırayla uygulanmalı, A önce | Strategy A ile 1 ay canlı metrik |
| Dinamik OG / JSON-LD tam otomasyon | İlk 2-3 video elle yaz | 10+ video yayımlandıktan sonra |

---

## 5. Sürekli Önemli Operasyonel Riskler

Solo dev için kod risklerinden daha kritik.

| Risk | Azaltma |
|---|---|
| Relayer private key git'e/public'e sızar | `.env` git-ignore doğrulaması, quarterly rotation |
| Sentry alert'leri kaçar | Mobil push + Discord webhook; tatilde fallback kontağı |
| Cloudflare/NEAR faturası ödenmez | Otomatik ödeme + calendar reminder |
| Tek makine/disk ölür | Repo git remote'ta, secrets password manager'da (1Password/Bitwarden) |
| Trial pool kurur | Balance alert eşiği + otomatik Strategy A rollout planı |
| Crust pin süresi dolar | DSM otomatik yenileme + gateway health monitoring |

---

## 6. Unit Economics (Yatırımcı Eşiği)

Kaynak: `docs/business/trial-account-maliyet-analizi-ve-yol-haritasi-2026-04.md`

| Senaryo | Maliyet/user | 3K user/ay | Rakip seviye |
|---|---|---|---|
| Şu an | $0.44 | $1.320 | NEAR minimumdan 55x |
| Strategy A | $0.048 | $144 | Polygon seviyesi |
| Strategy B (orta vade) | $0.008 | $24 | Solana seviyesi |
| Strategy C (uzun vade) | ~$0.001 | ~$3 | Lens/Farcaster seviyesi |

**Strategy A ön şart.** Aşama 2'de mutlaka.

---

## 7. Agent ve MCP Kullanım Rehberi

Solo'da her iş kendi sorumluluğunda ama doğru agent doğru çağrıldığında hızlandırır.

| İş alanı | Birincil agent | Destek agent | Faydalı MCP |
|---|---|---|---|
| Kontrat değişikliği (Strategy A dahil) | `@contract` | `@security`, `@integrator` | Sequential (risk) |
| KMS worker iş | `@kms` | `@security` | Chrome DevTools (perf) |
| Frontend/UI | `@frontend` | `@integrator` | Playwright, Magic |
| Deploy/rollback | `@devops` | — | Wrangler CLI |
| Landing/SEO/Content | `@frontend` | — | Tavily (rakip), WebFetch |
| Güvenlik incelemesi | `@security` | Domain agent | Sequential |

---

## 8. "Pazartesi Sabahı Ne Yaparsın?"

1. **Bu sabah:** Gift drop gas testi + Web4 rate limit başlat
2. **Bu hafta:** Bug bounty yayında, Sentry alert'ler telefonunu çalıyor, 10 creator davet
3. **Gelecek hafta:** İlk kullanıcılar aktif, data toplanıyor
4. **2 hafta sonra:** Strategy A implementasyonu başla
5. **3-4 hafta sonra:** 30 günlük metriklerle yatırımcı listesi

Teknik iş bitti sayılır. Geri kalanı kod değil, insan işi.

---

## 9. Referanslar

### Proje içi
- `docs/release-runbook.md` — deploy ve rollback prosedürü
- `docs/kms-key-rotation.md` — anahtar rotasyon prosedürü
- `docs/business/trial-account-maliyet-analizi-ve-yol-haritasi-2026-04.md` — Strategy A/B/C/D detay
- `docs/business/youtick-avrupa-sirketlesme-raporu-2026-04.md` — hukuki zemin
- `CLAUDE.md` — runtime gerçeklik ve agent tanımları
- `.claude/agents/*.md` — agent kontrol listeleri

### Dış
- [Next.js 16](https://nextjs.org/blog/next-16)
- [near-sdk-rs releases](https://github.com/near/near-sdk-rs/releases)
- [Cloudflare Workers Best Practices](https://developers.cloudflare.com/changelog/post/2026-02-15-workers-best-practices/)
- [HackenProof](https://hackenproof.com/) · [Immunefi](https://immunefi.com/) — bug bounty platformları
