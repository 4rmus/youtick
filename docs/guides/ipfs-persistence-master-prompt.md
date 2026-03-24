# IPFS Kalıcı Depolama — Master Prompt

> Bu prompt, YouTick'te yüklenen videoların Crust/IPFS üzerinde **kalıcı ve güvenilir** şekilde saklanmasını sağlamak için kullanılacak kapsamlı bir çalışma rehberidir.

---

## 1. Bağlam: YouTick Nedir?

YouTick, NEAR Protocol üzerinde çalışan, yaratıcı-odaklı premium video platformudur. Videolar tarayıcıda AES ile şifrelenir, segmentlere ayrılır ve Crust IPFS'e yüklenir. İçerik anahtarı Shamir Secret Sharing ile 5 KMS operatörüne dağıtılır. Bilet sahipleri threshold share reconstruction ile anahtarı yeniden oluşturup videoyu izler.

## 2. Mevcut Upload Akışı (Kaynak Kod Referansları)

```
Browser → AES encrypt → MP4 segment → Crust /api/v0/add (W3Auth) → CID
                                                ↓
                                    fire-and-forget PSA pin (manifest only)
```

### Dosya Haritası

| Dosya | Sorumluluk |
|-------|-----------|
| `apps/web/components/UploadForm.tsx` | Upload orchestration, UI |
| `apps/web/lib/crust/client.ts` | `uploadToCrust()` — XHR ile dosya upload, 3 fallback endpoint |
| `apps/web/lib/crust/config.ts` | Endpoint URL'leri, timeout sabitleri |
| `apps/web/lib/crust/w3auth.ts` | `generateW3AuthToken()` — NEAR session key ile W3Auth |
| `apps/web/lib/crust/storage-order.ts` | `placeStorageOrder()`, `checkStorageOrderStatus()` |
| `apps/web/lib/crust/gateway.ts` | `fetchFromGateways()`, hedged multi-gateway read |
| `apps/web/lib/crust/types.ts` | `CrustPsaPinResult`, `StorageOrderTrack`, vs. |
| `apps/web/lib/crust/index.ts` | Barrel export |
| `apps/web/lib/upload-session-manager.ts` | NEAR upload session key yönetimi |
| `apps/web/lib/video-delivery.ts` | Segment packaging, warmup |
| `apps/web/lib/batch-transactions.ts` | NEAR kontrat çağrıları (mint, event) |

### Mevcut Upload Adımları (UploadForm.tsx)

1. Kullanıcı dosya seçer → `handleUpload()` tetiklenir
2. `UploadSessionManager.createSession()` — NEAR session key oluştur
3. `packageVideoForDelivery()` — Video segmentlere ayrılır
4. Her segment/blob için → `uploadToCrust(blob, accountId)` çağrılır
5. `warmupGatewayCids()` — CID'ler gateway'lerde önceden yüklenir
6. `storeEncryptionKey()` — AES key KMS'lere dağıtılır
7. `batchUploadActionsSignless()` — NEAR'da NFT mint + event oluştur
8. **Başarılı mint sonrası** → `placeStorageOrder(manifestCid, 0, accountId)` fire-and-forget

### W3Auth Mekanizması (w3auth.ts)

```
NEAR Session Key → sign(publicKeyBytes) → "near-{pubkey}:{sig_hex}" → Basic base64
```

- Upload session key tercih edilir (in-memory)
- Yoksa BrowserKeyStore'dan (localStorage) okunur
- Token 30 dakika cache'lenir

### Crust Endpoint'leri (config.ts)

| Amaç | URL |
|------|-----|
| Upload | `https://crustipfs.xyz/api/v0/add` + 2 fallback |
| Read | `https://crustipfs.xyz/api/v0/cat` |
| PSA (Storage Order) | `https://crustipfs.xyz/psa/pins` |

---

## 3. Tespit Edilen Sorunlar (Kritikten Düşüğe)

### KRITIK-1: Sadece Manifest CID için Storage Order Veriliyor

```typescript
// UploadForm.tsx — satır ~663
await placeStorageOrder(manifestCid, 0, accountId);
```

Video bir delivery asset olarak birden fazla CID içerir:
- Poster image CID
- Init segment CID
- N adet media segment CID'leri
- Manifest JSON CID (sadece bu için sipariş veriliyor)
- Thumbnail CID (ayrı)

**Sonuç:** Manifest pin'li kalsa bile, segment CID'leri GC'ye maruz kalabilir.

### KRITIK-2: fileSize Her Zaman 0 Gönderiliyor

```typescript
await placeStorageOrder(manifestCid, 0, accountId);
//                                   ^ her zaman 0
```

PSA endpoint'i dosya boyutunu fiyatlama ve sipariş doğrulama için kullanır. Sıfır göndermek siparişin doğru işlenip işlenmeyeceğini belirsiz kılar.

### KRITIK-3: Fire-and-Forget — Hata Yutulur

```typescript
void (async () => {
    try {
        const { placeStorageOrder } = await import('@/lib/crust/storage-order');
        await placeStorageOrder(manifestCid, 0, accountId);
    } catch {
        // Non-blocking: storage order failure doesn't affect the user
    }
})();
```

- Kullanıcıya hiçbir geri bildirim yok
- Retry mekanizması yok
- Başarısızlık loglanıyor ama toplanmıyor

### YÜKSEK-4: Session Key Race Condition

```
handleUpload() → processSignatureAndUpload() → mint başarılı
  ↓                                               ↓
placeStorageOrder() başlıyor (async)        finally → cleanup() → clearSession()
  ↓
W3Auth token üretmeye çalışıyor → session key silindi!
```

W3Auth token cache'i (30dk) genelde kurtarır ama cache miss olursa auth başarısız olur.

### ORTA-5: `pinOnCrust()` Hiç Çağrılmıyor

`client.ts`'de tanımlı, ama projede hiçbir yerden çağrılmıyor. Upload sonrası doğrulama yapılmıyor.

### ORTA-6: Gateway'den Okunamama Riski

Crust-operated `/ipfs/` gateway'leri CORS/TLS sorunları yüzünden devre dışı. Okuma tamamen 3. parti gateway'lere bağlı (ipfs.io, 4everland, w3s, lighthouse, dweb). Bunlar Crust pin propagasyonu ile senkronize değil.

---

## 4. Crust Teknik Referans

### PSA (Pinning Service API)

Crust'un IPFS Pinning Service API'si, standart IPFS PSA spesifikasyonuna uyar:

```
POST https://crustipfs.xyz/psa/pins
Authorization: Basic <w3auth_token>
Content-Type: application/json

{
  "cid": "QmXxx...",
  "name": "youtick-QmXxx..."
}
```

Yanıt:
```json
{
  "requestid": "abc123",
  "status": "queued",
  "created": "2026-03-24T...",
  "pin": { "cid": "QmXxx..." }
}
```

**Durum kontrol:**
```
GET https://crustipfs.xyz/psa/pins/{requestid}
Authorization: Basic <w3auth_token>
```

### Crust Storage Order Anlamı

PSA üzerinden pin isteği → Crust chain üzerinde storage order → Crust node'ları dosyayı replike eder → MPoW (Meaningful Proof of Work) ile doğrulanır → Dosya kalıcı hale gelir.

**Dikkat:** PSA isteği başarılı olsa bile, chain üzerindeki sipariş bir süre "queued" veya "pinning" durumunda kalabilir. "pinned" durumu gerçek kalıcılığı ifade eder.

---

## 5. Hedef Mimari

```
Browser → AES encrypt → segment → uploadToCrust() → CID + size
                                         ↓
                          CID'leri biriktir (collector)
                                         ↓
                          mint + event başarılı
                                         ↓
                     ┌─────────────────────────┐
                     │   placeStorageOrders()   │
                     │   - manifest CID         │
                     │   - tüm segment CID'leri │
                     │   - thumbnail CID        │
                     │   - poster CID           │
                     │   fileSize ile birlikte   │
                     └────────────┬────────────┘
                                  ↓
                     retry (max 3, exp backoff)
                                  ↓
                     ┌────────────────────────┐
                     │  verifyStorageOrders()  │
                     │  status polling (30s)   │
                     │  → "pinning" veya       │
                     │    "pinned" = başarılı   │
                     └────────────┬────────────┘
                                  ↓
                    kullanıcıya sonuç göster
                    (başarılı / kısmi / uyarı)
```

---

## 6. Uygulama Planı

### Adım 1: CID Collector Oluştur

Upload sırasında tüm CID ve boyut bilgilerini toplayan bir yapı oluştur.

**Dosya:** `apps/web/lib/crust/cid-collector.ts` (yeni)

```typescript
interface UploadedAsset {
  cid: string;
  size: number;
  type: 'manifest' | 'init-segment' | 'media-segment' | 'thumbnail' | 'poster';
}

class CidCollector {
  private assets: UploadedAsset[] = [];

  add(cid: string, size: number, type: UploadedAsset['type']): void { ... }
  getAll(): UploadedAsset[] { ... }
  getTotalSize(): number { ... }
  getManifestCid(): string | undefined { ... }
  clear(): void { ... }
}
```

### Adım 2: `placeStorageOrders()` Batch Fonksiyonu

Tüm CID'ler için paralel storage order veren yeni fonksiyon.

**Dosya:** `apps/web/lib/crust/storage-order.ts` (güncelle)

```typescript
interface StorageOrderBatchResult {
  total: number;
  succeeded: number;
  failed: number;
  results: CrustPsaPinResult[];
}

async function placeStorageOrders(
  assets: UploadedAsset[],
  accountId: string,
  options?: { concurrency?: number; retries?: number }
): Promise<StorageOrderBatchResult> { ... }
```

Gereksinimler:
- Her CID için `placeStorageOrder(cid, size, accountId)` çağır
- fileSize parametresini gerçek boyutla geç
- Paralel (max 3 concurrent)
- Her çağrı max 3 retry (exponential backoff: 2s, 4s, 8s)
- Partial success destekle (bazıları başarısız olabilir)

### Adım 3: `verifyStorageOrders()` Durum Doğrulama

Storage order'ların "pinned" veya "pinning" durumuna geçtiğini doğrula.

**Dosya:** `apps/web/lib/crust/storage-order.ts` (güncelle)

```typescript
async function verifyStorageOrders(
  results: CrustPsaPinResult[],
  accountId: string,
  options?: { timeoutMs?: number; pollIntervalMs?: number }
): Promise<{ verified: number; pending: number; failed: number }> { ... }
```

Gereksinimler:
- Sadece "queued" durumundakileri poll et
- 30 saniye timeout
- 5 saniye poll aralığı
- "pinning" veya "pinned" = başarılı sayılır

### Adım 4: UploadForm.tsx Entegrasyonu

`UploadForm.tsx`'i güncelle:
- CidCollector'ı oluştur ve her upload çağrısından sonra CID ekle
- Mint başarısından sonra `placeStorageOrders()` çağır — **AWAIT et**
- Sonucu kullanıcıya göster
- Race condition'ı çöz: W3Auth token'ını storage order bitene kadar canlı tut

**Upload steps UI güncellemesi:**
```
[1/5] Şifreleme...
[2/5] IPFS'e yükleniyor...
[3/5] Bilet oluşturuluyor...
[4/5] Kalıcı depolama siparişi...  ← YENİ
[5/5] Doğrulama...                  ← YENİ
```

Başarı senaryoları:
- **Tam başarı:** Tüm CID'ler "pinned" → yeşil onay
- **Kısmi başarı:** Bazıları "pinning" → sarı uyarı: "Depolama işleniyor"
- **Kısmi başarısızlık:** Bazıları "failed" → turuncu uyarı: "Bazı dosyalar kalıcı depolama sırasına alınamadı"
- **Tam başarısızlık:** Hiçbiri başarılı değil → kırmızı uyarı ama işlem yine de tamamlanır (video erişilebilir ama kalıcılık garanti edilemez)

### Adım 5: Session Key Temizleme Zamanlaması

`UploadForm.tsx`'deki `cleanup()` çağrısını, storage order tamamlandıktan **sonraya** taşı:

```typescript
// ÖNCE (sorunlu):
finally {
  cleanup(); // session key siliniyor, ama placeStorageOrder hala çalışıyor olabilir
}

// SONRA (güvenli):
// storage order tamamlandıktan sonra cleanup
await placeAndVerifyStorageOrders(collector.getAll(), accountId);
cleanup(); // artık güvenle silinebilir
```

### Adım 6: Test Yazımı

**Dosya:** `apps/web/__tests__/unit/storage-order.test.ts` (yeni)

Test senaryoları:
1. `placeStorageOrders()` — tüm CID'ler başarılı
2. `placeStorageOrders()` — kısmi başarısızlık + retry
3. `placeStorageOrders()` — tam başarısızlık
4. `verifyStorageOrders()` — queued → pinned geçişi
5. `verifyStorageOrders()` — timeout
6. CidCollector — doğru toplama ve temizleme
7. fileSize'ın doğru geçtiğinin doğrulanması
8. W3Auth token'ın storage order süresince geçerli olduğunun doğrulanması

---

## 7. Güvenlik ve Sağlamlık Kuralları

1. **Storage order başarısızlığı upload'u engellemez** — Video erişilebilir kalır, sadece kalıcılık garantisi azalır.
2. **Retry mantığı agresif olmamalı** — 3 retry, exponential backoff. Crust PSA'yı DDoS etmeyin.
3. **W3Auth token'ı taze tutulmalı** — Storage order bitene kadar session key temizlenmemeli.
4. **fileSize doğru olmalı** — `uploadToCrust()` zaten `{ cid, size }` dönüyor, bu size'ı kullanın.
5. **Loglama** — Her storage order sonucu `[DECENTRALIZATION_METRIC]` prefix'i ile loglanmalı.
6. **Kullanıcı bilgilendirme** — Başarısızlık gizlenmemeli, ama upload başarılı gösterilmeli.
7. **Mevcut export API'yi bozmayın** — `index.ts`'deki barrel export'ları koruyun.
8. **Türkçe + İngilizce UI copy paritesi** — Yeni mesajlar her iki dilde de olmalı.
9. **Gateway health tracking bozulmamalı** — `gateway.ts`'deki hedged read sistemi değişmemeli.

---

## 8. Doğrulama Kontrol Listesi

Uygulama tamamlandıktan sonra şunları doğrula:

- [ ] `uploadToCrust()` her çağrıda CID + size dönüyor
- [ ] CidCollector tüm segment, thumbnail, poster, manifest CID'lerini topluyor
- [ ] `placeStorageOrders()` her CID için gerçek fileSize ile order veriyor
- [ ] Retry mantığı çalışıyor (3 deneme, exponential backoff)
- [ ] Kısmi başarısızlık graceful handle ediliyor
- [ ] `verifyStorageOrders()` "queued" CID'leri poll ediyor
- [ ] Kullanıcıya 4. ve 5. adım UI'da gösteriliyor
- [ ] Session key, tüm storage order'lar tamamlanana kadar temizlenmiyor
- [ ] `vitest --run` — tüm testler geçiyor
- [ ] `tsc --noEmit` — tip hatası yok
- [ ] Mevcut upload akışı bozulmamış (mint + event hala çalışıyor)
- [ ] `[DECENTRALIZATION_METRIC]` logları her order için yazılıyor

---

## 9. Araştırma Gereksinimleri

Uygulamaya başlamadan önce şu konuları araştır:

1. **Crust PSA recursive pinning davranışı** — Manifest CID pin'lendiğinde, manifest içindeki referans CID'ler otomatik olarak pin'lenir mi? Eğer evet ise, sadece manifest için order yeterli olabilir.

2. **Crust PSA rate limit** — Tek W3Auth token ile dakikada kaç pin isteği gönderilebilir? 100+ segment'li bir video için burst limit nedir?

3. **Crust PSA fiyatlama** — fileSize 0 ile gönderilen order'lar nasıl işleniyor? Minimum dosya boyutu var mı?

4. **W3Auth token ömrü** — Crust tarafındaki token validasyon süresi ne kadar? 30 dakikalık cache yeterli mi?

5. **Alternatif pin stratejileri** — Tüm segment'leri tek bir DAG altında gruplama (IPFS MFS/DAG) ve sadece root CID için order verme mümkün mü?

---

## 10. Referans: Mevcut Dosya İçerikleri

Bu çalışmada değiştirilecek veya referans alınacak dosyaların tam yolları:

```
apps/web/components/UploadForm.tsx          — upload orchestration (değişecek)
apps/web/lib/crust/storage-order.ts         — storage order (değişecek)
apps/web/lib/crust/client.ts                — upload client (CID+size dönüşü kullanılacak)
apps/web/lib/crust/w3auth.ts                — auth token (race condition düzeltmesi)
apps/web/lib/crust/types.ts                 — tipler (yeni tipler eklenecek)
apps/web/lib/crust/config.ts                — sabitler (referans)
apps/web/lib/crust/gateway.ts               — okuma (değişmeyecek)
apps/web/lib/crust/index.ts                 — barrel export (güncellenecek)
apps/web/lib/upload-session-manager.ts      — session key (cleanup zamanlaması)
apps/web/lib/video-delivery.ts              — segment packaging (CID toplama noktası)
apps/web/lib/batch-transactions.ts          — NEAR txs (değişmeyecek)
```

---

**Bu prompt ile başla, araştırma yap, analiz et, adım adım güvenli şekilde inşa et.**
