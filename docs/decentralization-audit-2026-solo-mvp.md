# YouTick Decentralization Audit 2026 — Solo MVP Revizyonu

**Guncelleme tarihi:** 2026-04-24  
**Kapsam:** `apps/web`, `contracts/*`, `workers/*`  
**Hedef:** Tek geliştiriciyle MVP'yi çıkarırken kullanıcı fonu, video erişimi ve anahtar güvenliği için en kritik riskleri kapatmak.

> Not: Bu rapor ağırlıklı olarak kaynak koddaki güvenlik düzeltmelerini
> değerlendirir. Canlı mainnet durumu, KMS operator aktivasyonu ve runbook/script
> tutarlılığı için güncel üst değerlendirme:
> `docs/decentralization-assessment-2026-04-25.md`.

---

## 1. Kısa Sonuç

Raporun ana fikri doğru: MVP aşamasında DAO ve staking gibi ağır konuları erteleyip, doğrudan ürünü bozabilecek güvenlik açıklarını kapatmak daha doğru.

Başlangıç kontrolünde planın şu noktaları öne çıktı:

1. **Session grant problemi gerçekten kritikti.** Frontend normal kullanıcının grant oluşturmasını bekliyordu, ama kontrat bunu sadece owner/market/registry için açıyordu.
2. **Timelock vardı ama güvenlik sağlamıyordu.** Çünkü aynı hassas işlemler owner tarafından doğrudan da çağrılabiliyordu.
3. **KMS fallback vardı.** `NEXT_PUBLIC_KMS_URL` registry dışı bir endpoint'i güvenilir gibi sıraya alıyordu.
4. **Relayer kodu yalnızca "deprecated"; tamamen kalkmamış.** API 410 dönüyor ama kontrat, registry ve bazı frontend/test izleri duruyor.
5. **`nft-ticket` ownership transferi rapordaki kadar küçük iş değil.** Mevcut kontrat state'i nedeniyle migration veya ayrı storage anahtarı planı gerekiyor.
6. **CSP zaten var, ama üretim için gevşek.** Plan "CSP ekle" değil, "CSP'yi sıkılaştır" demeli.
7. **KMS replay/nonce için KV tek başına yeterli değil.** Cloudflare KV eventually-consistent çalışır; güçlü tek-kullanımlık kontrol gerekiyorsa Durable Object daha doğru.

**MVP CDI hedefi:** 5.0/10 makul. Ancak MVP çıkış şartı "decentralized" olmaktan çok "kullanıcı akışı bozulmuyor ve tek anahtar hatası anında yıkım yaratmıyor" olmalı.

---

## 2. Kodla Tutarlılık Kontrolü

| Konu | Başlangıç durumu | Uygulama durumu | Karar |
|---|---|---|---|
| Session grant auth | Non-owner kullanıcı grant alamıyordu | **Tamamlandı.** Kullanıcı kendi grant'ini `session_pok` ile oluşturuyor. | **P0 kapandı** |
| Timelock bypass | Hassas owner işlemleri doğrudan çalışıyordu | **Tamamlandı.** Withdraw, ban, pause, onboarding key değişimi gibi işlemler timelock yoluna alındı. | **P0 kapandı** |
| KMS fallback | `NEXT_PUBLIC_KMS_URL` registry dışı endpoint ekliyordu | **Tamamlandı.** Client sadece registry operatorlerini kullanıyor. | **P0 kapandı** |
| `reset_v11` | Üretimde callable kalıyordu | **Tamamlandı.** Normal production build'de yok; sadece `migration` feature veya test build'inde var. | **P0 kapandı** |
| Relayer cleanup | Dead code kalmış | **Kısmen tamamlandı.** `nft-ticket` ve web fallback yüzeyi kaldırıldı; `operator-registry` relayer kayıtları migration gerektirdiği için legacy/Phase 2 olarak duruyor. | **P1 kısmi** |
| Event creator TTL | 1800s | Doğru. KMS worker'da 1800 saniye. | **P2** |
| `originHash` fallback | `btoa` fallback var | **Tamamlandı.** `crypto.subtle` yoksa base64 üretmiyor; hassas session grant için erken hata veriyor. | **P2 kapandı** |
| CSP | Eksik | **Kısmen tamamlandı.** Production CSP'de `unsafe-eval` yok; `unsafe-inline` nonce/hash çalışmasına kaldı. | **P1 kısmi** |
| Ownership transfer | `nft-ticket` immutability | **Tamamlandı.** İki adımlı aktarım eklendi; pending owner ayrı storage key ile tutuluyor, ana state layout değişmedi. | **P1 kapandı** |

---

## 3. Güncel Doküman Uyumu

Kontrol edilen kaynaklar:

- [NEAR Access Keys](https://docs.near.org/protocol/access-keys)
- [NEAR RPC Access Keys](https://docs.near.org/api/rpc/access-keys)
- [near-sdk `ed25519_verify`](https://docs.rs/near-sdk/latest/near_sdk/env/fn.ed25519_verify.html)
- [Next.js headers](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers)
- [Next.js CSP guide](https://nextjs.org/docs/pages/guides/content-security-policy)
- [Cloudflare Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [Cloudflare KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)

### NEAR

- Function-call access key modeli raporla uyumlu: key sadece belirli kontrat/metotlara ve gas allowance'a bağlanabiliyor.
- Session grant için `session_pok` fikri uygulanabilir. `near-sdk` içinde `env::ed25519_verify` var.
- Kontratlar `near-sdk = 5.5.0` kullanıyor; güncel crate `5.26.1`. Bu doğrudan güvenlik açığı demek değil, ama MVP güvenlik yamalarından sonra ayrı bir "SDK upgrade dry-run" işi açılmalı. Güvenlik fixleri ile SDK upgrade aynı PR'a konmamalı.

### Next.js

- `headers()` ile CSP vermek güncel Next.js yaklaşımıyla uyumlu.
- Mevcut CSP üretimde fazla gevşek: `script-src 'unsafe-inline' 'unsafe-eval'` var. Development için anlaşılır, production için nonce/hash tabanlı CSP hedeflenmeli.

### Cloudflare Workers / KV

- WebCrypto ve `crypto.subtle.digest` Workers tarafında destekleniyor. Browser tarafında da modern hedef için `crypto.subtle` beklenebilir.
- KV cache ve kısa TTL için uygun, ama tek-kullanımlık nonce/replay kilidi için güçlü garanti vermez. KV değişiklikleri farklı bölgelerde gecikebilir. Replay koruması gerçekten önemliyse Durable Object veya tek bölgeye yönlenen tutarlı bir kontrol kullanılmalı.

---

## 4. MVP Öncelikleri

### P0 — Yayından Önce

| # | İş | Durum |
|---|---|---|
| 1 | Session grant self-issuance + proof-of-key | **Tamamlandı** |
| 2 | Timelock'u gerçek zorunlu yol yap | **Tamamlandı** |
| 3 | KMS fallback'i kaldır | **Tamamlandı** |
| 4 | `reset_v11` üretimden kaldır veya 7 gün timelock'a bağla | **Tamamlandı: production build'de kapalı** |

### P1 — MVP İçinde, P0 Sonrası

| # | İş | Neden |
|---|---|---|
| 5 | `nft-ticket` ownership transfer | **Tamamlandı.** Key kaybı için iki adımlı çıkış yolu eklendi. |
| 6 | Relayer yüzeyini temizle | **Kısmen tamamlandı.** Ürün kontratı ve web fallback temizlendi; registry cleanup ayrı migration işi. |
| 7 | CSP production hardening | **Kısmen tamamlandı.** `unsafe-eval` production'dan çıktı; nonce/hash ayrı iş. |
| 8 | Onboarding key saklama ve rotasyon | `sessionStorage` çıplak kalmasın, kullanım süresi net olsun. |

### P2 — MVP Sonrası

| # | İş | Neden |
|---|---|---|
| 9 | VSS/share integrity | Kötü operatör bozuk share dönerse sebep bulunamıyor. |
| 10 | Storage provider diversity | Crust tek nokta olarak kalıyor. |
| 11 | Operator staking/slashing | DAO veya tarafsız karar mekanizması olmadan erken. |
| 12 | Browser WASM sandbox | Değerli ama MVP için ağır. |
| 13 | DAO/multisig ownership | TVL veya ciddi creator geliri oluşunca gerekli. |

---

## 5. İyileştirilmiş Yol Haritası

### Hafta 1 — Session Grant

**Amaç:** Kullanıcı kendi session grant'ini güvenli şekilde oluşturabilsin.

Yapılacaklar:

- `issue_session_grant` içine açık `target_owner_id` parametresi ekle.
- Yetki kuralı: `caller == target_owner_id || caller == owner || caller == market || caller == registry`.
- `session_pok` ekle: session private key, sabit formatlı challenge'ı imzalasın.
- Kontrat `session_pk` ile imzayı `env::ed25519_verify` üzerinden doğrulasın.
- Challenge içine en az şunlar girsin: contract id, caller, target owner, scope, resource id, ttl, origin hash, device hash.
- Frontend `ensureSessionGrant` bu imzayı üretip transaction'a eklesin.

Kabul kriteri:

- Normal kullanıcı owner key kullanmadan `Play` grant alabiliyor.
- Başkasının adına grant basma denemesi reddediliyor.
- Aynı `session_pk` başka owner'a bağlanamıyor.
- Unit test + worker access test geçiyor.

### Hafta 2 — Timelock Enforcement

**Amaç:** Hassas owner işlemleri doğrudan çalışmasın.

Yapılacaklar:

- Hassas işlemleri public direct metotlardan ayır:
  - dışarı açık yol: `propose_action` ve `execute_action`
  - iç uygulama: doğrudan owner kontrolü yapmayan private/internal helper
- Doğrudan çağrı kapatılacak işlemler:
  - `withdraw_trial_pool`
  - `withdraw_commission`
  - `admin_remove_events`
  - `ban_event`
  - `unban_event`
  - `set_next_token_id`
  - `add_onboarding_key`
  - `remove_onboarding_key`
  - `set_onboarding_config`
  - `pause`
  - `unpause`
  - `web4_set_static_url`
- `create_trial_invite_drop` için karar ver: migration/operasyon aracı mı, normal ürün fonksiyonu mu? Eğer admin operasyonuysa timelock'a ekle.
- `cancel_action` owner-only kalabilir.

Kabul kriteri:

- Owner'ın doğrudan withdraw/ban/pause çağrıları başarısız.
- Aynı işlemler timelock süresi dolunca başarılı.
- Pending proposal'lar view ile görülebiliyor.

### Hafta 3 — KMS Trust

**Amaç:** Client yalnızca registry'deki aktif operatörlere konuşsun.

Yapılacaklar:

- `DEFAULT_KMS_BASE_URL` ve `NEXT_PUBLIC_KMS_URL` kullanımını kaldır.
- README ve `.env.example` içinden `NEXT_PUBLIC_KMS_URL` önerisini sil.
- Local dev için ayrı, açık isimli bir flag kullan: örnek `NEXT_PUBLIC_KMS_DEV_ENDPOINTS`. Production build'de bu flag kabul edilmesin.
- Registry boşsa client hard fail versin; sessiz fallback yapmasın.
- Testleri "env fallback yok" davranışına göre güncelle.

Kabul kriteri:

- `rg "NEXT_PUBLIC_KMS_URL|DEFAULT_KMS_BASE_URL" apps/web` sonucu boş.
- Registry dışı endpoint'e `/store` veya `/retrieve` isteği gitmiyor.

### Hafta 4 — Reset ve Ownership

**Amaç:** Yanlış deploy veya key kaybı kalıcı hasar vermesin.

Yapılacaklar:

- `reset_v11` üretim kontratından çıkar veya sadece açık migration build'inde derle.
- Eğer kalacaksa timelock + çok daha uzun delay + net event log zorunlu olsun.
- `nft-ticket` ownership transfer için state migration planı yaz:
  - ya yeni state versiyonu ve migration
  - ya ayrı storage key ile `pending_owner_id`
- `propose_owner` / `accept_ownership` testlerini ekle.

Kabul kriteri:

- Production wasm içinde `reset_v11` yok veya doğrudan çağrılamıyor.
- Ownership transfer iki adımlı ve testli.

### Hafta 5 — Relayer Cleanup

**Amaç:** Eski onboarding yolu karışıklık ve saldırı yüzeyi yaratmasın.

Yapılacaklar:

- `nft-ticket` içinden `add_trial_relayer`, `remove_trial_relayer`, `is_trial_relayer`, relayer sponsor metotları ve helper'ları kaldır.
- `operator-registry` içinde relayer kayıtları gerçekten kullanılmıyorsa kaldır; kullanılacaksa Phase 2 dokümanına taşı.
- `gift-service` içindeki relayer fallback fonksiyonunu kaldır veya sadece migration/test helper olarak izole et.
- Testleri yeni direct onboarding yoluna göre sadeleştir.

Kabul kriteri:

- `rg "trial_relayer|createSponsoredTrialRelayer|Relayer" contracts apps/web/lib apps/web/app/api` yalnızca doküman veya açık legacy notlarında sonuç verir.

### Hafta 6 — CSP ve Browser Hardening

**Amaç:** XSS etkisini azaltmak.

Yapılacaklar:

- Production CSP'de `unsafe-eval` kaldır.
- Mümkünse script nonce/hash düzenine geç.
- `originHash` için `crypto.subtle` yoksa `null` veya hata dön; `btoa` fallback'i kaldır.
- Onboarding/session key storage için süre, temizleme ve görünür hata akışı ekle.

Kabul kriteri:

- Production header'da `unsafe-eval` yok.
- `originHash` base64 fallback üretmiyor.

### Hafta 7-8 — Pre-launch Drill

**Amaç:** Gerçek kullanıcı akışı ve güvenlik akışı aynı anda çalışsın.

Yapılacaklar:

- Non-owner wallet ile upload, mint, playback uçtan uca test.
- Owner key compromise drill: doğrudan withdraw/ban/pause dene, başarısız olmalı.
- KMS registry drill: registry dışı endpoint env'e yazılsa bile kullanılmamalı.
- KMS replay için önce tehdit modeli netleştir:
  - auth challenge zaten verify sonrası siliniyor.
  - request-level replay için KV yerine Durable Object veya token idempotency tasarımı değerlendir.

Kabul kriteri:

- Creator akışı testnet üzerinde geçiyor.
- Timelock bypass testleri geçiyor.
- KMS fallback testi geçiyor.

---

## 6. Güncellenmiş Scorecard

| Alan | Bugünkü durum | MVP hedefi | Not |
|---|---:|---:|---|
| Governance | 2/10 | 2/10 | Single owner kalabilir, ama timelock gerçek olmalı. |
| Key Management | 4/10 | 6/10 | KMS fallback kaldırılırsa ciddi iyileşir. |
| Storage | 5/10 | 5/10 | Crust MVP için kabul edilebilir. |
| RPC Resilience | 6/10 | 6/10 | Şimdilik yeterli. |
| Frontend Hosting | 3/10 | 4/10 | CSP sıkılaştırılırsa bir puan artar. |
| Session/Auth | 4/10 | 7/10 | Session grant fix ana kazanım. |
| Operator Liveness | 5/10 | 5/10 | Trusted operator modeli MVP'de kabul. |
| Browser Security | 3/10 | 4/10 | CSP + origin hash düzeltmesi düşük maliyetli. |

**MVP CDI hedefi:** 5.0/10 korunabilir.

---

## 7. Düzeltilmiş Exit Criteria

MVP çıkışı için:

- [ ] Normal kullanıcı owner key olmadan upload, mint ve playback yapabiliyor.
- [ ] Session grant başkasının adına üretilemiyor.
- [ ] Owner doğrudan withdraw, ban, pause, onboarding key değişimi yapamıyor; timelock gerekiyor.
- [ ] Client bundle içinde hardcoded KMS endpoint yok.
- [ ] Production wasm içinde `reset_v11` yok veya timelock/migration koruması var.
- [ ] Relayer API kapalı kalmakla yetinmiyor; kullanılmayan kontrat yüzeyi de temizleniyor.
- [ ] Production CSP'de `unsafe-eval` yok.
- [ ] `cargo test` ve ilgili `vitest` testleri geçiyor.

---

## 8. Ertelenen Riskler

MVP'de bilinçli olarak ertelenebilir:

- DAO/multisig ownership
- Operator staking/slashing
- VSS share integrity
- Çoklu storage provider
- Browser WASM sandbox
- Doğrudan NEAR Web4 ana dağıtım modeli

Bu erteleme ancak şu şartla kabul edilebilir: P0 maddeler kapatılmış olmalı. Aksi halde "MVP hızı" güvenlik borcunu değil, kırık core flow'u saklamış olur.

---

## 9. Son Değerlendirme

Planın yönü iyi, ama eski hali birkaç şeyi olduğundan basit gösteriyordu. En önemli düzeltme şu: Bu bir "DAO'ya geçelim mi?" problemi değil. Önce core flow'u çalışır ve owner key hatasına dayanıklı yapmak gerekiyor.

Önerilen sıra:

1. Session grant
2. Timelock enforcement
3. KMS registry-only
4. `reset_v11` kapatma
5. Ownership transfer (**tamamlandı**)
6. Relayer cleanup
7. CSP/browser hardening

Bu sırayla gidilirse MVP hem daha hızlı çıkar, hem de creator onboarding başlamadan en tehlikeli açıklar kapanmış olur.
