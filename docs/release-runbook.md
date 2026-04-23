# YouTick Release Runbook

> Manuel deploy prosedürü. `.github/` yok — CI/CD bilinçli kaldırıldı.
> Her deploy için baştan sona bu dosyayı takip et.

## Rol ve Kapsam

| Rol | Kim | Sorumluluk |
|---|---|---|
| Release owner | 1 kişi | Tüm adımları yürütür, smoke test'i onaylar |
| On-call | 1 kişi | Deploy sırasında erişilebilir, rollback'i tetikler |

Paralel deploy yapılmaz. Release owner tek oturum içinde sıralı çalıştırır.

## Ön Koşullar (bir kez kur)

- `cargo`, `node>=20`, `npm`, `wrangler` kurulu
- NEAR CLI oturumu: `near login` → `youtick.near` ownerkey local'de
- Cloudflare: `wrangler whoami` → org doğru
- Ortam dosyaları dolu:
  - `apps/web/.env.local` (`NEXT_PUBLIC_*`, `NEXT_PUBLIC_SENTRY_DSN`)
  - `workers/youtick-kms/wrangler.toml` içindeki KV ID'ler production değerinde
  - Wrangler secrets 5 operatör için yüklü (`OPERATOR_SHARE_SECRET`, `REGISTRY_OPERATOR_ACCOUNT_ID` her env için)

## 0. Pre-Flight (K1) — Her Deploy Öncesi

```bash
# Repo temiz mi
git status                    # clean çalışma ağacı
git branch                    # doğru branch

# Kontrat testleri
(cd contracts/nft-ticket && cargo test --release)
(cd contracts/access-control && cargo test --release)
(cd contracts/operator-registry && cargo test --release)

# Frontend
(cd apps/web && npm ci && npm test -- --run && npm run build)

# Worker tip check
(cd workers/youtick-kms && npm ci && npx tsc --noEmit)
(cd workers/web4-proxy && npm ci && npx tsc --noEmit)
```

**Beklenen:** 41/41 kontrat testi, 179/179 frontend testi, 17 sayfa Next build, 0 TS hatası.
Başarısızsa deploy etme.

## Deploy Sırası (Asla Bozma)

```
1. Kontratlar (değiştiyse)
   ↓
2. Operator-registry güncellemesi (operatör/relayer ekle-çıkar varsa)
   ↓
3. KMS workers (5 operatör sırayla)
   ↓
4. web4-proxy
   ↓
5. Web app (Next.js)
   ↓
6. Smoke test
```

Gerekçe: web uygulaması worker endpoint'lerini ve kontrat ID'lerini çağırır. Worker'lar kontrat state'ini okur. Önce alt katman deploy edilir.

## 1. Kontrat Deploy (sadece kontrat değiştiyse)

⚠️ Kontrat deploy'u **yarı-yarıya geri alınamazdır.** State'e dokunan değişikliklerde migration kodu gerekir. Sadece kod değişikliği varsa `near deploy` yeterli.

```bash
# nft-ticket (market)
cd contracts/nft-ticket
cargo build --release --target wasm32-unknown-unknown
near deploy youtick.near target/wasm32-unknown-unknown/release/youtick_nft.wasm

# access-control (genelde stabil, nadiren güncellenir)
cd ../access-control
cargo build --release --target wasm32-unknown-unknown
near deploy access.youtick.near target/wasm32-unknown-unknown/release/youtick_access_control.wasm

# operator-registry
cd ../operator-registry
cargo build --release --target wasm32-unknown-unknown
near deploy registry.youtick.near target/wasm32-unknown-unknown/release/youtick_operator_registry.wasm
```

**Migration gerekli mi?** Eğer storage layout değiştiyse (yeni field, enum varyantı, Map<Key> değişikliği) mutlaka migration metodu çağır — aksi halde deserialization panic ile tüm kontrat kilitlenir.

```bash
# örnek migration çağrısı (kontrattan kontrat-spesifik)
near call youtick.near migrate '{}' --accountId youtick.near --gas 300000000000000
```

**Doğrulama:**
```bash
# Kontrat storage okuma — panic yoksa deploy temiz
near view youtick.near get_events_count
near view access.youtick.near list_session_grants '{"owner_id":"youtick.near"}'
near view registry.youtick.near list_decryption_operators
```

## 2. Operatör Registry Güncellemesi (varsa)

Operatör/relayer ekleme-çıkarma:
```bash
near call registry.youtick.near upsert_operator '{"account_id":"kms-f.youtick.near","active":true,"threshold":3}' --accountId youtick.near --deposit 0.01
```

Değişiklik sonrası tüm client'lar yeni operatör listesini cache'den bir sonraki okuma turunda alır (frontend TTL ~5dk, KMS worker cache'i 60sn).

## 3. KMS Worker Deploy (5 operatör, sırayla)

⚠️ Her operatör **kendi izole KV namespace'ine** deploy olur. Namespace karıştırma Shamir güvenlik modelini bozar.

```bash
cd workers/youtick-kms

# Sırayla, her birinin deploy'u tamamlanmadan diğerine geçme
npx wrangler deploy --env operator_a
npx wrangler deploy --env operator_b
npx wrangler deploy --env operator_c
npx wrangler deploy --env operator_d
npx wrangler deploy --env operator_e
```

**Deploy sonrası her operatör için smoke:**
```bash
curl -s https://youtick-kms-a.<your-subdomain>.workers.dev/health
# Beklenen: {"status":"ok","operator":"kms-a.youtick.near",...}
```

Bir operatör başarısızsa dur, o operatörü rollback et, diğerlerini deploy etme (Shamir threshold altına düşersek playback kilitlenir).

## 4. web4-proxy Deploy

```bash
cd workers/web4-proxy
npx wrangler deploy
```

**Doğrulama:**
```bash
curl -I https://youtick.net/
# Beklenen: 200, Cloudflare headers, X-Youtick-Origin: pages veya near
```

## 5. Web App Deploy

### 5a. Cloudflare Pages (standart)
```bash
cd apps/web
npm run build                 # Next.js standalone
# Pages CI'siz ise manuel upload veya wrangler pages deploy
npx wrangler pages deploy .next --project-name youtick-static
```

### 5b. Web4 (on-chain static, opsiyonel)
```bash
cd apps/web
npm run build:web4            # output: export → dist/
# scripts/deploy-web4.sh → NEAR sub-account üzerine yükler
../../scripts/deploy-web4.sh
```

Her iki hedef de eş zamanlı güncelleyin ya da sadece aktif olanı.

## 6. Smoke Test (deploy sonrası zorunlu)

Kullanıcı bazlı manuel akış. Release owner browser'da koşturur:

- [ ] Ana sayfa açılıyor, Sentry init hatası yok (DevTools Console)
- [ ] Cüzdan bağlantısı (Meteor veya MyNearWallet)
- [ ] Upload: 30 sn'lik test videosu yükleniyor, Crust CID dönüyor
- [ ] Purchase: trial veya ödemeli ticket alınıyor
- [ ] Watch: video decrypt olup oynatılıyor (Shamir reconstruction OK)
- [ ] Gift: 2-anahtarlı gift drop oluşturuluyor, başka account claim edebiliyor
- [ ] Sentry: bilinçli bir hata (console'dan `throw new Error("smoke")`) Sentry'ye düşüyor

Bir adım düşerse bkz. §8 Rollback.

## 7. Post-Deploy

- Sentry release tag'i otomatik düşer (`SENTRY_AUTH_TOKEN` set ise)
- Cloudflare Analytics'te 5xx spike izle (ilk 30 dk)
- KMS worker log: `npx wrangler tail --env operator_a`
- Bir sonraki deploy'a kadar `docs/CHANGELOG.md` (yoksa oluştur) içine tarih + commit SHA + değişenler notu ekle

## 8. Rollback Prosedürü

### 8a. Web App (kolay — 1 dk)
Cloudflare Pages veya Vercel üzerinde `previous deployment → Promote`. Bir önceki build'e dönüş otomatik.

### 8b. Worker (orta — 2 dk)
```bash
# Wrangler versiyon geçmişi
npx wrangler deployments list --env operator_a

# Önceki versiyona dön
npx wrangler rollback --env operator_a <deployment-id>
```
5 operatör için tekrarla.

### 8c. Kontrat (zor — dikkat)
Kontrat deploy'u otomatik geri alınamaz. Seçenekler:
1. **Önceki WASM'i yeniden deploy et** (eğer storage layout uyumluysa)
2. **Hotfix kontratı deploy et** (storage bozulduysa yeni method ile onar)
3. **Kontrat pause** — `access.youtick.near` ve `youtick.near` pause metodları var; kullanıcı akışlarını durdur, kod düzelt, tekrar deploy

Üçüncü seçenek için:
```bash
near call access.youtick.near pause_scope '{"scope":"Play"}' --accountId access.youtick.near
near call access.youtick.near pause_scope '{"scope":"Publish"}' --accountId access.youtick.near
# Düzeltme deploy'u sonrası
near call access.youtick.near unpause_scope '{"scope":"Play"}' --accountId access.youtick.near
near call access.youtick.near unpause_scope '{"scope":"Publish"}' --accountId access.youtick.near
```

⚠️ Pause sırasında kullanıcı iletişimi: status page / Twitter duyurusu hazır olsun.

## 9. Secret ve Key Rotation

### Wrangler Secrets
```bash
# Listele (değer görünmez)
npx wrangler secret list --env operator_a

# Güncelle (stdin'den değer)
npx wrangler secret put OPERATOR_SHARE_SECRET --env operator_a
```

### Operatör Share Rotation
Detaylı prosedür için bkz. `docs/kms-key-rotation.md` — 6 fazlı zero-downtime rotation (hazırlık → PREVIOUS set → yeni secret deploy → doğrulama → grace period → PREVIOUS sil).
Özet: `OPERATOR_SHARE_SECRET_PREVIOUS` set → yeni `OPERATOR_SHARE_SECRET` yükle → worker fallback log'unu izle → grace period bitince PREVIOUS sil. 5 operatör sıralı, paralel değil.

### NEAR Account Keys
Owner key (`youtick.near`) sızarsa:
```bash
near keys youtick.near                                      # mevcut keyler
near add-key youtick.near <new-public-key> --accountId youtick.near
near delete-key youtick.near <old-public-key> --accountId youtick.near
```

## 10. Acil Durum Escalation

| Sınıf | Örnek | Aksiyon |
|---|---|---|
| 🔴 P0 | Owner key sızıntısı, kontrat panic, tüm worker'lar 5xx | Immediate: pause contracts → rotate keys → incident doc |
| 🟡 P1 | 1-2 operatör down, Sentry error spike | 15 dk içinde rollback veya fix-forward |
| 🟢 P2 | Smoke test'te tek akış bozuk (örn. gift drop) | Saatler içinde hotfix |

## 11. Checklist Kopyala-Yapıştır

Her deploy için kopyala:

```
- [ ] §0 pre-flight: tüm testler yeşil
- [ ] Git clean, branch doğru
- [ ] §1 contracts (varsa) → view method doğrulama
- [ ] §2 registry güncelleme (varsa)
- [ ] §3 KMS workers: a → b → c → d → e, her biri /health OK
- [ ] §4 web4-proxy deploy
- [ ] §5 web app deploy
- [ ] §6 smoke: upload ✓ purchase ✓ watch ✓ gift ✓ sentry ✓
- [ ] §7 release log güncellendi
- [ ] On-call'a bilgi: deploy complete
```

## Referanslar

- `CLAUDE.md` — proje mimarisi özeti
- `workers/youtick-kms/wrangler.toml` — KV ve env mapping
- `scripts/create-operator-kv-namespaces.sh` — ilk kurulum
- `docs/security.md` — güvenlik modeli
