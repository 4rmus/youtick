# YouTick Teknik Rapor Master Prompt

> **Amaç:** Bu master prompt, YouTick uygulamasının teknik mimarisini, güvenlik modelini, protokol entegrasyonlarını ve performans özelliklerini detaylı bir şekilde dokümante eden profesyonel teknik raporlar oluşturmak için kullanılır.

---

## 📋 Rapor Türleri ve Kullanım Alanları

| Rapor Türü | Hedef Kitle | Kullanım Alanı |
|------------|-------------|----------------|
| **Teknik Mimari Raporu** | Geliştiriciler, CTO'lar | Kod incelemesi, onboarding |
| **Güvenlik Denetim Raporu** | Güvenlik ekipleri, yatırımcılar | Due diligence, audit |
| **Protokol Entegrasyon Raporu** | Partner ekipleri, blockchain takımları | Entegrasyon dokümantasyonu |
| **Performans Analiz Raporu** | DevOps, sistem mimarları | Optimizasyon, kapasite planlaması |
| **Yatırımcı Teknik Özet** | Yatırımcılar, VC'ler | Pitch deck eki |

---

## 🏗️ BÖLÜM 1: Teknik Mimari Raporu

### Prompt Şablonu:

```
"YouTick platformunun kapsamlı bir teknik mimari raporunu oluştur.

## KAPSAM:
- Sistem bileşenleri ve sorumlulukları
- Protokol entegrasyonları (NEAR, Lit Protocol, IPFS)
- Veri akışı diyagramları
- API yapısı

## DAHİL EDİLECEK BÖLÜMLER:

### 1. Yönetici Özeti (Executive Summary)
- Tek paragrafta mimari özet
- Kullanılan temel teknolojiler
- Mimari kararların gerekçeleri

### 2. Sistem Mimarisi Genel Bakış
```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  Next.js 16 + React 19 + TypeScript + Tailwind CSS          │
├─────────────────────────────────────────────────────────────┤
│                    BLOCKCHAIN KATMANI                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ NEAR Protocol│  │ Lit Protocol │  │    IPFS      │       │
│  │ (Ödeme+NFT)  │  │ (Şifreleme)  │  │ (Depolama)   │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### 3. Bileşen Detayları

#### 3.1 Frontend Katmanı
- **Framework**: Next.js 16 (App Router)
- **State Yönetimi**: React hooks + Context API
- **Stil**: Tailwind CSS + NEAR Brand Guidelines
- **Cüzdan Bağlantısı**: NEAR Wallet Selector

#### 3.2 Blockchain Katmanı

##### NEAR Protocol
| Bileşen | İşlev |
|---------|-------|
| Smart Contract | NFT minting, event yönetimi, ödeme dağıtımı |
| Session Keys | İmzasız işlem deneyimi |
| Chain Signatures | MPC tabanlı çapraz zincir imza |

##### Lit Protocol
| Bileşen | İşlev |
|---------|-------|
| PKP (Programmable Key Pairs) | Şifreleme anahtarı yönetimi |
| Access Control Conditions | NFT tabanlı erişim kontrolü |
| Lit Actions | Sunucusuz şifreleme/çözme mantığı |

##### IPFS (Lighthouse)
| Bileşen | İşlev |
|---------|-------|
| Encrypted Storage | Şifrelenmiş video depolama |
| CID Adreslemesi | İçerik bazlı adresleme |
| Perpetual Storage | Kalıcı depolama garantisi |

### 4. Veri Akış Diyagramları

#### 4.1 Video Yükleme Akışı
```
Sanatçı → [Tarayıcı Şifreleme] → [Lit PKP] → [IPFS Upload] 
        → [NFT Mint] → [Event Create] → Tamamlandı
```

#### 4.2 Video İzleme Akışı
```
İzleyici → [NFT Kontrolü] → [Lit ACC Doğrulama] 
        → [Şifre Çözme] → Video Oynatma
```

### 5. Akıllı Sözleşme Spesifikasyonu

#### Contract: `youtick_nft`
- **Dil**: Rust
- **SDK**: NEAR SDK 5.1.0
- **Standart**: NEP-171 (NFT)

| Fonksiyon | Tür | Gas | Açıklama |
|-----------|-----|-----|----------|
| nft_mint | Payable | ~10 TGas | Video NFT oluşturma |
| create_event | Payable | ~5 TGas | Etkinlik oluşturma |
| buy_ticket | Payable | ~15 TGas | Bilet satın alma |
| buy_ticket_prepaid | Call | ~10 TGas | Ön ödemeli bilet |

### 6. Güvenlik Modeli
- Client-side encryption
- NFT ownership verification
- MPC-based key derivation
- Zero-knowledge access control

### 7. Ölçeklenebilirlik Değerlendirmesi
- Durum senkronizasyonu
- İşlem throughput limitleri
- Depolama maliyet projeksiyonları

GÖRSEL STİL:
- Mermaid diyagramları
- Teknik tablolar
- Kod blokları (syntax highlighted)
- Profesyonel, minimalist tasarım
"
```

---

## 🔐 BÖLÜM 2: Güvenlik Denetim Raporu

### Prompt Şablonu:

```
"YouTick platformunun kapsamlı bir güvenlik denetim raporunu oluştur.

## HEDEF:
- Potansiyel güvenlik açıklarının belirlenmesi
- Risk değerlendirmesi ve önceliklendirme
- Düzeltme önerileri

## DAHİL EDİLECEK BÖLÜMLER:

### 1. Yönetici Özeti
- Genel güvenlik durumu (Kritik/Yüksek/Orta/Düşük)
- Tespit edilen toplam bulgu sayısı
- Öncelikli düzeltme önerileri

### 2. Kapsam ve Metodoloji

#### 2.1 İncelenen Bileşenler
| Bileşen | Versiyon | İnceleme Durumu |
|---------|----------|-----------------|
| Smart Contract (Rust) | v1.0.1 | ✅ Tamamlandı |
| Frontend (Next.js) | 16.x | ✅ Tamamlandı |
| Lit Protocol Entegrasyonu | Datil Dev | ✅ Tamamlandı |
| IPFS/Lighthouse | - | ✅ Tamamlandı |

#### 2.2 Değerlendirme Kriterleri
- OWASP Web3 Top 10
- NEAR Security Best Practices
- Lit Protocol Security Guidelines

### 3. Bulgu Detayları

#### 3.1 Kritik Bulgular 🔴
```
[BULGU-001] Başlık
Şiddet: Kritik
Etki: [Açıklama]
Kod Lokasyonu: [dosya:satır]
Düzeltme Önerisi: [Detay]
```

#### 3.2 Yüksek Şiddetli Bulgular 🟠
#### 3.3 Orta Şiddetli Bulgular 🟡
#### 3.4 Düşük Şiddetli Bulgular 🟢

### 4. Güvenlik Kontrol Matrisi

| Kontrol | Durum | Notlar |
|---------|-------|--------|
| Input Validation | ✅ | Tüm kullanıcı girdileri doğrulanıyor |
| Access Control | ✅ | NFT tabanlı erişim kontrolü |
| Reentrancy Protection | ✅ | NEAR SDK'da yerleşik |
| Integer Overflow | ✅ | Rust'ta yerleşik kontrol |
| Front-running Protection | ⚠️ | Değerlendirme gerekli |

### 5. Protokol Bazlı Analiz

#### 5.1 NEAR Protocol Güvenliği
- Sözleşme storage yönetimi
- Cross-contract call güvenliği
- Gas limit yönetimi

#### 5.2 Lit Protocol Güvenliği
- PKP key management
- ACC (Access Control Conditions) doğruluğu
- Session signature güvenliği

#### 5.3 IPFS/Lighthouse Güvenliği
- Şifreleme algoritması (AES-256-GCM)
- CID integrity
- Perpetual storage garantisi

### 6. Risk Değerlendirmesi
```
┌─────────────────────────────────────────┐
│ RİSK MATRİSİ                            │
├──────────┬──────────────────────────────┤
│ Kritik   │ Düzeltme: Hemen              │
│ Yüksek   │ Düzeltme: 7 gün içinde       │
│ Orta     │ Düzeltme: 30 gün içinde      │
│ Düşük    │ Düzeltme: Sonraki sürümde    │
└──────────┴──────────────────────────────┘
```

### 7. Düzeltme Önerileri ve Önceliklendirme

| Öncelik | Bulgu | Tahmini Süre | Kaynak |
|---------|-------|--------------|--------|
| 1 | [Bulgu-001] | 2 gün | 1 geliştirici |
| 2 | [Bulgu-002] | 3 gün | 1 geliştirici |

### 8. Sonuç ve Genel Değerlendirme
- Güvenlik olgunluk seviyesi
- Önerilen iyileştirme yol haritası
- Periyodik denetim takvimi

FORMAT:
- Profesyonel audit raporu formatı
- Renk kodlu şiddet seviyeleri
- Kod örnekleri ile bulgu açıklamaları
"
```

---

## 🔗 BÖLÜM 3: Protokol Entegrasyon Raporu

### Prompt Şablonu:

```
"YouTick'in üç temel protokol entegrasyonunu detaylandıran teknik rapor oluştur.

## PROTOKOLLER:
1. NEAR Protocol
2. Lit Protocol
3. IPFS (Lighthouse Storage)

## HER PROTOKOL İÇİN:

### [Protokol Adı] Entegrasyon Detayları

#### 1. Genel Bakış
- Protokolün amacı ve YouTick'teki rolü
- Entegrasyon türü (SDK, API, Smart Contract)

#### 2. Teknik Spesifikasyon

##### Bağlantı Yapılandırması
```typescript
// Örnek yapılandırma kodu
const config = {
  network: "testnet",
  contractId: "xxx.testnet",
  ...
};
```

##### Kullanılan Fonksiyonlar
| Fonksiyon | Parametre | Dönüş | Kullanım |
|-----------|-----------|-------|----------|
| ... | ... | ... | ... |

#### 3. Veri Akışı
```
[Kaynak] → [İşlem] → [Hedef]
```

#### 4. Hata Yönetimi
| Hata Kodu | Açıklama | Çözüm |
|-----------|----------|-------|
| ... | ... | ... |

#### 5. Güvenlik Hususları
- Kimlik doğrulama mekanizması
- Şifreleme yöntemleri
- Erişim kontrolü

#### 6. Performans Metrikleri
| Metrik | Değer | Benchmark |
|--------|-------|-----------|
| Latency | ~X ms | ... |
| Throughput | ~X TPS | ... |

## ÜÇ PROTOKOLÜN BİRLEŞİK ÇALIŞMASI:

### Unified Architecture Diagram
```
┌─────────────────────────────────────────────────────────────┐
│                    KULLANICI (Tarayıcı)                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐                                            │
│  │    NEAR     │ ◄─── Kimlik + Ödeme + NFT Sahipliği       │
│  │  Wallet     │                                            │
│  └──────┬──────┘                                            │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │    NEAR     │────▶│     Lit     │────▶│    IPFS     │   │
│  │  Contract   │     │   Protocol  │     │ (Lighthouse)│   │
│  │             │     │             │     │             │   │
│  │ • NFT Mint  │     │ • Şifreleme │     │ • Video     │   │
│  │ • Ödeme     │     │ • ACC       │     │   Depolama  │   │
│  │ • Event     │     │ • PKP       │     │ • CID       │   │
│  └─────────────┘     └─────────────┘     └─────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘

ENTEGRASYON AKIŞI:
1. NEAR → Kimlik doğrulama (Wallet Selector)
2. NEAR Chain Signatures → Lit PKP türetimi (MPC)
3. Lit Protocol → Video şifreleme/çözme
4. IPFS → Şifreli içerik depolama
5. NEAR Contract → NFT sahiplik doğrulama
6. Lit ACC → Erişim kontrolü (NFT bazlı)
```

### Cross-Protocol İşlem Örneği
```
VIDEO YÜKLEME SENARYOSU:

Adım 1: NEAR Session Key oluşturma
        └── Contract: add_session_key()

Adım 2: Lit PKP türetimi (MPC)
        └── Chain Signatures ile Ethereum adresi

Adım 3: Video şifreleme (Lit Protocol)
        └── PKP ile AES-256-GCM

Adım 4: IPFS'e yükleme (Lighthouse)
        └── Şifrelenmiş blob → CID

Adım 5: NFT minting (NEAR)
        └── Contract: nft_mint(metadata)

Adım 6: Event oluşturma (NEAR)
        └── Contract: create_event(cid, price)
```

FORMAT:
- Teknik diyagramlar
- Kod örnekleri
- API referansları
- Hata kodları tablosu
"
```

---

## 📊 BÖLÜM 4: Performans Analiz Raporu

### Prompt Şablonu:

```
"YouTick platformunun kapsamlı performans analiz raporunu oluştur.

## ANALİZ ALANLARI:
- Frontend performansı
- Blockchain işlem süreleri
- IPFS yükleme/indirme hızları
- Şifreleme/çözme süreleri

## DAHİL EDİLECEK METRIKLER:

### 1. Frontend Performansı

#### Core Web Vitals
| Metrik | Değer | Hedef | Durum |
|--------|-------|-------|-------|
| LCP (Largest Contentful Paint) | X.X s | < 2.5s | ✅/⚠️/❌ |
| FID (First Input Delay) | X ms | < 100ms | ✅/⚠️/❌ |
| CLS (Cumulative Layout Shift) | X.XX | < 0.1 | ✅/⚠️/❌ |
| TTFB (Time to First Byte) | X ms | < 600ms | ✅/⚠️/❌ |

#### Bundle Analizi
| Chunk | Boyut | Sıkıştırılmış |
|-------|-------|---------------|
| Main | X KB | X KB |
| Vendors | X KB | X KB |
| ... | ... | ... |

### 2. Blockchain İşlem Performansı

#### NEAR Protocol
| İşlem | Ortalama Süre | Gas Maliyeti | TPS |
|-------|---------------|--------------|-----|
| NFT Mint | ~X s | X TGas | ~Y |
| Buy Ticket | ~X s | X TGas | ~Y |
| Session Key | ~X s | X TGas | ~Y |

#### İşlem Maliyet Analizi
```
ÖRNEK: 5 NEAR Bilet Satışı

┌────────────────────────────────────────────┐
│ MALIYET DAĞILIMI                           │
├────────────────────────────────────────────┤
│ Bilet Fiyatı:        5.000000 NEAR         │
│ Gas Ücreti:         ~0.001000 NEAR         │
│ Storage Deposit:    ~0.010000 NEAR         │
│ ──────────────────────────────────────     │
│ Toplam Maliyet:     ~0.011000 NEAR         │
│ ──────────────────────────────────────     │
│ Sanatçı Geliri:      4.900000 NEAR (%98)   │
│ Platform Payı:       0.100000 NEAR (%2)    │
└────────────────────────────────────────────┘
```

### 3. IPFS/Lighthouse Performansı

| Dosya Boyutu | Yükleme Süresi | İndirme Süresi | Maliyet |
|--------------|----------------|----------------|---------|
| 100 MB | ~X s | ~X s | ~$0.40 |
| 500 MB | ~X s | ~X s | ~$2.00 |
| 1 GB | ~X s | ~X s | ~$4.00 |

### 4. Şifreleme Performansı

| İşlem | Dosya Boyutu | Süre | Algoritma |
|-------|--------------|------|-----------|
| Şifreleme | 100 MB | ~X s | AES-256-GCM |
| Şifre Çözme | 100 MB | ~X s | AES-256-GCM |

### 5. End-to-End Kullanıcı Deneyimi

#### Video Yükleme Süreci
```
TOPLAM SÜRE DAĞILIMI (100 MB video):

Session Setup:     ████░░░░░░  ~15%  (~X s)
PKP Recovery:      ██░░░░░░░░  ~10%  (~X s)
Şifreleme:         ████████░░  ~40%  (~X s)
IPFS Upload:       ██████░░░░  ~30%  (~X s)
NFT Mint:          █░░░░░░░░░  ~5%   (~X s)
────────────────────────────────────────────
TOPLAM:            ██████████  100%  (~X s)
```

#### Video İzleme Süreci
```
First Paint → Content Visible: ~X s
- NFT Verification: ~X ms
- Lit ACC Check: ~X ms  
- Decryption Start: ~X ms
- First Frame: ~X ms
```

### 6. Ölçeklenebilirlik Projeksiyonu

| Kullanıcı Sayısı | Tahmini TPS | Gerekli Kaynak |
|------------------|-------------|----------------|
| 100 | X | Mevcut yeterli |
| 1,000 | X | ... |
| 10,000 | X | ... |

### 7. Optimizasyon Önerileri

| Alan | Öneri | Beklenen İyileşme |
|------|-------|-------------------|
| Frontend | Code splitting | %X LCP iyileşmesi |
| IPFS | CDN entegrasyonu | %X indirme hızı |
| Contract | Batch işlemler | %X gas tasarrufu |

FORMAT:
- Sayısal tablolar
- İlerleme çubukları (ASCII)
- Karşılaştırma grafikleri
- Benchmark sonuçları
"
```

---

## 💼 BÖLÜM 5: Yatırımcı Teknik Özeti

### Prompt Şablonu:

```
"Yatırımcılara yönelik kısa ve etkili teknik özet raporu oluştur.

## HEDEF:
- Teknik karmaşıklığı sadeleştirerek sunmak
- Rekabet avantajlarını vurgulamak
- Ölçeklenebilirliği göstermek

## FORMAT: Tek sayfa (A4 veya 16:9 slide)

### BÖLÜM 1: Teknoloji Özeti (1 paragraf)
```
YouTick, NEAR Protocol üzerine inşa edilmiş, Lit Protocol 
ile uçtan uca şifreleme ve IPFS ile dağıtık depolama 
kullanan yeni nesil bir video-on-demand platformudur.
```

### BÖLÜM 2: Mimari Avantajlar (3 madde)
┌─────────────────────────────────────────────────────┐
│ 🔐 GÜVENLİK: Tarayıcı içi şifreleme, hiçbir sunucu │
│    şifresiz içerik görmez                          │
├─────────────────────────────────────────────────────┤
│ ⚡ PERFORMANS: Sub-second işlemler, NEAR'ın düşük  │
│    gas maliyetleri (~$0.001/işlem)                 │
├─────────────────────────────────────────────────────┤
│ 🌐 ÖLÇEKLENEBİLİRLİK: Sunucusuz mimari, sınırsız  │
│    kullanıcı kapasitesi                            │
└─────────────────────────────────────────────────────┘

### BÖLÜM 3: Maliyet Karşılaştırması
```
GELENEKSEL VOD PLATFORMU vs YOUTICK

Aylık 10,000 kullanıcı için:

AWS/Sunucu:      $5,000/ay    →  YouTick: $0/ay
CDN:             $2,000/ay    →  IPFS: Tek seferlik
Depolama:        $1,000/ay    →  ~$4/GB tek seferlik
────────────────────────────────────────────────
TOPLAM:          $8,000/ay    →  ~$200 tek seferlik
```

### BÖLÜM 4: Teknik Metrikler
| Metrik | Değer |
|--------|-------|
| İşlem Süresi | < 2 saniye |
| Gas Maliyeti | ~$0.001 |
| Uptime | %99.9 (blockchain garantisi) |
| Sanatçı Payı | %98 |

### BÖLÜM 5: Teknoloji Stack
```
┌──────────────────────────────────────────────────┐
│ Next.js 16 │ NEAR Protocol │ Lit Protocol │ IPFS │
└──────────────────────────────────────────────────┘
```

STİL:
- Minimalist, profesyonel
- Büyük rakamlar, az metin
- İkon kullanımı
- NEAR yeşili (#00EC97) vurgular
"
```

---

## 📝 BÖLÜM 6: Rapor Oluşturma Kontrol Listesi

Herhangi bir teknik rapor oluşturmadan önce bu kontrol listesini kullanın:

### Ön Hazırlık
- [ ] Kod tabanı güncel mi? (`git pull`)
- [ ] Akıllı sözleşme versiyonu doğru mu?
- [ ] Test ortamı aktif mi?
- [ ] Metrikler güncel mi?

### Rapor Kalite Kontrolü
- [ ] Tüm teknik terimler açıklanmış mı?
- [ ] Diyagramlar tutarlı mı?
- [ ] Kod örnekleri çalışıyor mu?
- [ ] Güvenlik bilgileri gizlilik politikasına uygun mu?

### Son Kontrol
- [ ] Hedef kitleye uygun dil kullanılmış mı?
- [ ] Sayfa/slide sayısı uygun mu?
- [ ] Görsel kalite yeterli mi?
- [ ] İletişim bilgileri eklenmiş mi?

---

## 🎨 Görsel Stil Rehberi

Tüm teknik raporlarda uygulanacak stil:

| Öğe | Değer |
|-----|-------|
| **Ana Renk** | NEAR Yeşil #00EC97 |
| **İkincil Renk** | NEAR Mor #9D65FF |
| **Uyarı Rengi** | NEAR Kırmızı #FF585D |
| **Arka Plan** | Koyu #000000 veya Beyaz #FFFFFF |
| **Kod Arka Plan** | #0D0D0D veya #F5F5F5 |
| **Font (Başlık)** | Inter Bold |
| **Font (Gövde)** | Inter Regular |
| **Font (Kod)** | JetBrains Mono |

---

## 📁 Çıktı Formatları

| Rapor Türü | Format | Önerilen Uzunluk |
|------------|--------|------------------|
| Teknik Mimari | PDF/MD | 15-25 sayfa |
| Güvenlik Denetim | PDF | 10-20 sayfa |
| Protokol Entegrasyon | MD | 20-30 sayfa |
| Performans Analiz | PDF/HTML | 10-15 sayfa |
| Yatırımcı Özeti | PDF/PPTX | 1-3 sayfa |

---

## 🔧 Rapor Jeneratörü Parametreleri

Rapor oluştururken kullanılabilecek JSON yapılandırması:

```json
{
  "report_type": "technical_architecture | security_audit | protocol_integration | performance_analysis | investor_summary",
  "target_audience": "developer | investor | partner | auditor",
  "language": "tr | en",
  "format": "pdf | markdown | html | pptx",
  "include_sections": {
    "executive_summary": true,
    "diagrams": true,
    "code_samples": true,
    "metrics": true,
    "recommendations": true
  },
  "style": {
    "theme": "dark | light",
    "brand_colors": true,
    "icons": true
  },
  "confidentiality": "public | internal | confidential"
}
```

---

## 📚 Referans Veriler

Raporlarda kullanılacak güncel teknik veriler:

### Contract Bilgileri
- **Network**: NEAR Testnet
- **Contract ID**: `v1.utick.testnet`
- **SDK Version**: NEAR SDK 5.1.0
- **NFT Standard**: NEP-171

### Protokol Versiyonları
- Lit Protocol: Datil Dev
- Lighthouse Storage: Latest
- Next.js: 16.x
- React: 19.x

### Ekonomik Parametreler
- Platform Fee: %2
- Sanatçı Payı: %98
- Ortalama Gas: ~0.01 NEAR
- Depolama Maliyeti: ~$4/GB

---

*Bu master prompt, YouTick teknik dokümantasyonu için standart bir çerçeve sağlar. Ocak 2026*
