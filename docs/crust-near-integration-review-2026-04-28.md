# YouTick — Crust Network, W3Auth & NEAR Protocol Tekrar Değerlendirme Raporu

**Tarih:** 2026-04-28  
**Kapsam:** Crust Network IPFS entegrasyonu, W3Auth kimlik doğrulama, NEAR Protocol akıllı kontrat ve cüzdan entegrasyonu  
**Yöntem:** 4 bağımsız uzman subagent ile kod tabanlı derinlemesine inceleme  

---

## 1. Önceki Analizden Düzeltilmesi Gereken Yargılar

### ❌ YANLIŞ: "W3Auth Basic vs Bearer kritik tutarsızlık"

**Gerçek:** Bu **bilinçli ve doğru** bir ayrımdır.

| Servis | Endpoint | Beklenen Auth |
|--------|----------|---------------|
| IPFS Upload Gateway | `*/api/v0/add` | `Basic <base64(...)>` |
| IPFS Pinning Service (PSA) | `*/psa/pins` | `Bearer <base64(...)>` |

Resmi Crust dokümantasyonu bu ayrımı doğrulamaktadır. `w3auth.ts` `Basic` üretir, `client.ts` bunu upload için olduğu gibi kullanır, `storage-order.ts` PSA için `Bearer`'a çevirir — hepsi **doğrudur**.

**Ancak:** Test dosyaları (`test-crust.mjs`, `test-psa-post.mjs`, `test-psa-endpoints.mjs`) PSA için `Basic` kullanmaktadır. Bu testler **eski** ve spesifikasyona uygun değildir.

---

## 2. Kritik Sorunlar (🔴)

### 🔴 CR-1: Upload Session Key Sayfa Yenilenince Kalıcı Olarak Kayboluyor

**Dosya:** `apps/web/lib/upload-session-manager.ts`

```typescript
const uploadSessionKeys = new Map<string, KeyPair>(); // Bellekte!
```

- Kullanıcı "Wallet & Balance" adımından sonra sayfayı yenilerse, özel anahtar **silinir**.
- On-chain kontratta 0.2 NEAR kilitli kalır (15 dk TTL bitene kadar).
- `callMethod` hatası verir: `"No active upload session..."`
- Projedeki `BrowserKeyStore` (localStorage) kullanılmıyor.

**Risk:** Signless UX temelde bozuktur. Sayfa yenileme = upload ölümü + para kilitlenmesi.

**Çözüm:** Session key'i `BrowserKeyStore`'a yaz veya `sessionStorage`'a TTL ile kaydet.

---

### 🔴 CR-2: `withRpcFailover` State-Changing Transaction'larda Kullanılıyor → Double-Spend Riski

**Dosya:** `apps/web/lib/upload-session-manager.ts` → `callMethod()`

```typescript
return withRpcFailover(async (rpcUrl) => {
    const account = new Account(..., rpcUrl, signer);
    const outcome = await account.signAndSendTransaction({...});
});
```

- RPC timeout alırsa, `withRpcFailover` **sonraki RPC'ye geçip aynı transaction'ı tekrar gönderir**.
- Nonce artar, **iki ayrı transaction** oluşabilir.
- `nft_mint_prepaid` için kontrat içi state makinesi (`remaining_calls`) race condition'a bağlı koruma sağlar ama bu **güvenilir değildir**.

**Risk:** Çift NFT mint, çift event oluşturma veya kullanıcıya "hata" gösterilip aslında başarılı transaction.

**Çözüm:** `signAndSendTransaction` asla `withRpcFailover` içinde olmamalıdır. Tek RPC + status polling kullanılmalıdır.

---

### 🔴 CR-3: `placeStorageOrder` 15 Dakika Boyunca Asılı Kalabilir

**Dosya:** `apps/web/lib/crust/storage-order.ts`

```typescript
const timer = setTimeout(() => controller.abort(), CRUST_CONSTANTS.UPLOAD_TIMEOUT);
// UPLOAD_TIMEOUT = 15 * 60 * 1000 (15 dakika!)
```

Hafif bir JSON POST için 15 dakika timeout kullanılmaktadır. `FETCH_TIMEOUT` (30 sn) olmalıydı.

Ek olarak `clearTimeout(timer)` `fetch()` sonrası hemen çağrılır ama `response.text()` hâlâ askıda kalabilir.

**Risk:** Bir storage order worker'ı 15 dakika boyunca bloklu kalır, diğer batch işlemler aksar.

---

### 🔴 CR-4: MediaSource `QuotaExceededError` Handling Yok → Player Kalıcı Takılma

**Dosya:** `apps/web/lib/video-delivery-player.ts`

```typescript
sourceBuffer.appendBuffer(operation.buffer); // try/catch YOK
```

- Tarayıcı buffer limiti dolduğunda `QuotaExceededError` fırlatır.
- `updateend` event'i hiç fire etmez.
- `activeOperation` null olmaz.
- **Kuyruk sonsuza dek tıkanır.** Video izlenemez hale gelir, kullanıcı sayfayı yenilemek zorunda kalır.

**Risk:** Uzun video izleyen kullanıcılarda player ölür.

**Çözüm:** `flushQueue` içine `try/catch` eklenmeli, `QuotaExceededError`'da agresif prune + retry yapılmalıdır.

---

## 3. Yüksek Öncelikli Sorunlar (🟠)

### 🟠 HI-1: `addSourceBuffer` Codec Hatası Yönetilmiyor

`video-delivery-player.ts`'te codec desteklenmiyorsa senkron throw olur. `sourceOpened = true` set edilmiştir ama session kullanılamaz durumdadır.

### 🟠 HI-2: `viewContract` Unicode/Base64 Bug'ı

```typescript
args_base64: btoa(JSON.stringify(args))
```

`btoa()` emoji veya Türkçe karakterlerde (ç,ğ,ı,ş) **DOMException** fırlatır. NEAR metadata argümanlarında video başlığı varsa patlar.

### 🟠 HI-3: `READ_ENDPOINT_FALLBACK` Boş, Testler Yanlış Güven Veriyor

- Prod: `READ_ENDPOINT_FALLBACK: ''` (boş string)
- Test: `'https://crust-fallback/api/v0/cat'` ile test ediliyor
- Prod'da fallback hiç çalışmaz ama testler "çalışıyor" gösterir.

### 🟠 HI-4: CIDv1 Format Desteği Eksik

`ipfs-media.ts`'te sadece `bafy...` (base32) destekleniyor. CIDv1 base58btc (`z...`), base36 (`k...`) desteklenmiyor.

### 🟠 HI-5: Web4 Proxy CORS + Auth = CSRF Benzeri Risk

```typescript
respHeaders.set('Access-Control-Allow-Origin', '*');
respHeaders.set('Access-Control-Allow-Headers', '*');
```

`authorization` header'ı Crust upstream'e forward ediliyor. Herhangi bir origin, geçerli/çalınmış W3Auth token ile PSA isteği yapabilir.

### 🟠 HI-6: Web4 Proxy OPTIONS Preflight Handle Etmiyor

`/api/crust/` için gelen `OPTIONS` preflight istekleri doğrudan Crust'a iletiliyor. Crust 405 dönerse browser PSA çağrısı başarısız olur.

### 🟠 HI-7: Upload-Flow "Integration" Testleri Production Kodu Test Etmiyor

`__tests__/integration/upload-flow.test.ts` **hiçbir production modülünü import etmiyor.** Inline helper fonksiyonlar test ediliyor. Gerçek upload akışının (`uploadToCrust` → `CidCollector` → `placeStorageOrders`) entegrasyon testi **sıfır**.

### 🟠 HI-8: `rate_limited` Semantiği Tutarsız

- `placeStorageOrders`: `rate_limited` → **failed** sayar
- `verifyStorageOrders`: `rate_limited` → **pending** sayar

Aynı batch için iki farklı rapor.

### 🟠 HI-9: `verifyCrustAvailability` HEAD Kullanıyor

Bazı IPFS gateway'leri `HEAD` isteğine `405 Method Not Allowed` döner. Yanlış "unavailable" raporu oluşur.

### 🟠 HI-10: `mapPsaStatus` Bilinmeyen Durumları `queued` Yapıyor

Crust yeni bir status eklerse (örn. `"rejected"`), kod sonsuza dek poll eder.

---

## 4. Orta ve Düşük Öncelikli Sorunlar (🟡)

| Kod | Sorun | Dosya |
|-----|-------|-------|
| MD-1 | `deploy-crust.mjs` upload URL'si `?cid-version=1&wrap-with-directory=true` kullanıyor, `client.ts` kullanmıyor | `client.ts` / `deploy-crust.mjs` |
| MD-2 | `pinOnCrust` tüm dosyayı `blob()` ile belleğe alıyor, `response.body?.cancel()` olmalı | `client.ts` |
| MD-3 | `extractIpfsCid` `useUpload.ts`'te duplicate implemente edilmiş | `useUpload.ts` / `ipfs-media.ts` |
| MD-4 | `warmupGatewayCids` sadece 1 segment ve sadece Crust API'yi ısıtıyor | `video-delivery.ts` |
| MD-5 | `deploy-crust.mjs` hardcoded mainnet (testnet yok) | `deploy-crust.mjs` |
| MD-6 | `btoa` Node.js/SSR'de mevcut değil | `w3auth.ts` |
| MD-7 | `withRpcFailover` bir kez fallback'e düşünce asla primary'ye dönmez | `rpc-failover.ts` |
| MD-8 | `isRpcError` `"DB Not Found"`, `"shard not found"`, `"500"` gibi yaygın hataları yakalamıyor | `rpc-failover.ts` |
| MD-9 | PSA endpoint build-time static, runtime değiştirilemez | `config.ts` |
| MD-10 | `standardGas` 300 TGas (sınırda), 250 TGas daha güvenli | `constants.ts` |

---

## 5. Nihai Değerlendirme Tablosu

| Kriter | Önceki Analiz | Tekrar Değerlendirme |
|--------|---------------|----------------------|
| **Video Crust'a güvenli yükleniyor mu?** | ✅ Evet | ✅ **Evet** — Şifreleme + segmentasyon doğru |
| **Kalıcılık garantisi?** | ⚠️ Kısmen | ⚠️ **Kısmen** — PSA atılıyor ama timeout/fail handling zayıf |
| **W3Auth auth tutarlılığı** | ❌ Kritik hata (yanlış) | ✅ **Doğru** — Basic (upload) + Bearer (PSA) spec uyumlu |
| **NEAR session güvenliği** | ✅ Övgü | 🔴 **Sayfa yenileme = ölüm** |
| **NEAR tx güvenliği** | ✅ Övgü | 🔴 **withRpcFailover + write tx = double-spend riski** |
| **Player stabilitesi** | ✅ Övgü | 🔴 **QuotaExceededError = kalıcı takılma** |
| **Gateway stratejisi** | ✅ Övgü | ✅ **Övgü** — Abort handling doğru |
| **Test coverage** | ✅ Var | 🟠 **Fake integration test** — production kod test edilmiyor |

---

## 6. Öncelikli Düzeltme Planı

### Hemen (1-2 gün)
1. **CR-1:** `UploadSessionManager` session key'i `BrowserKeyStore`'a veya `sessionStorage`'a yazmalı
2. **CR-2:** `callMethod` içinden `withRpcFailover`'ı kaldır, tek RPC + status polling kullan
3. **CR-3:** `placeStorageOrder` timeout'unu `FETCH_TIMEOUT` (30 sn) yap, `response.text()`'i de timer altına al
4. **HI-2:** `viewContract`'ta `btoa()` yerine `Buffer.from(str).toString('base64')` kullan

### Kısa Vade (1 hafta)
5. **CR-4:** `video-delivery-player.ts`'te `flushQueue` içine `try/catch` ekle, `QuotaExceededError`'da agresif prune + retry yap
6. **HI-1:** `addSourceBuffer`'ı `try/catch` ile sarmala
7. **HI-7:** Gerçek bir upload entegrasyon testi yaz (`uploadToCrust` + `placeStorageOrders` mock'ları ile)
8. **HI-3:** `READ_ENDPOINT_FALLBACK`'ı prod config'e gerçek bir URL ekle veya testlerden kaldır
9. **HI-5/6:** Web4 proxy'de `OPTIONS` preflight handling ekle, CORS policy'yi daralt

### Orta Vade (2-4 hafta)
10. **HI-4:** `extractIpfsCid`'i CIDv1 tüm base'lerini destekleyecek şekilde genişlet
11. **MD-1:** `client.ts` ve `deploy-crust.mjs`'te CID version parametrelerini senkronize et
12. **MD-7/8:** RPC failover'ı per-request rotation'a çevir, `isRpcError`'ı genişlet

---

## 7. Sonuç

Önceki analiz **W3Auth token formatı konusunda yanılmıştı** — bu bilinçli bir ayrımmış. Ancak tekrar değerlendirme, çok daha ciddi ve kullanıcıyı doğrudan etkileyen sorunları ortaya çıkardı:

- **Sayfa yenileme = upload ölümü** (session key bellekte)
- **RPC failover + yazma işlemi = çift harcama riski**
- **Player uzun videoda kalıcı olarak takılıyor** (buffer quota)

YouTick'in mimarisi **kavramsal olarak mükemmel** (şifreleme, segmentasyon, gateway hedging, signless NEAR), ancak **operasyonel detaylarda** ciddi hatalar var. Bu 3 kritik sorun düzeltilmeden üretimde yüksek kullanıcı mağduriyeti riski mevcuttur.

---

*Rapor, 4 bağımsız kod inceleme subagent'ının bulgularının sentezlenmesiyle oluşturulmuştur.*
