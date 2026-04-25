# YouTick Frontend ve Yaratıcı Deneyimi Planı — Güncel

> **Durum:** Mevcut uygulama ile orijinal plan arasındaki tutarlılık check edildi. Bu doküman, check sonuçlarını ve iyileştirilmiş yol haritasını içerir.
> **Son güncelleme:** 2026-04-25

---

## 0. Executive Summary

Orijinal plan (2026-04) hedefleri doğru ve uygulanabilir. Ancak mevcut uygulama ile plan arasında **ciddi tutarsızlıklar** var. En büyük 3 boşluk:

1. **Landing page tamamen İngilizce** — planın Türkçe mesaj dili hiç uygulanmamış.
2. **Yaratıcı stüdyosu gelişmemiş** — satış/gelir verisi yok, sadece eser sayısı gösteriliyor.
3. **Eser türü sistemi yok** — kontratta 4 tür var ama UI'da hiç gösterilmiyor; planın önerdiği 6 tür eksik.

Bu plan, orijinali koruyarak mevcut durumu, tutarsızlıkları, teknik bağımlılıkları ve güncellenmiş öncelikleri ekler.

---

## 1. Kısa Sonuç (Orijinal Plan + Mevcut Durum)

### Orijinal Hedef
YouTick'i "Web3 video platformu" yerine "yaratıcıların bağımsız dijital sahnesi" olarak konumlandırmak. Sinema ve konser yaratıcılarına odaklanmak. Teknik terimleri arka plana almak.

### Mevcut Durum
Frontend teknik olarak sağlam: Next.js 16, App Router, shadcn/ui, NEAR entegrasyonu, şifreli video oynatma, IPFS/Crust depolama, hediye bileti, deneme hesabı — hepsi çalışıyor. Ancak **ürün mesajı ve yaratıcı deneyimi henüz plana göre şekillenmemiş**.

| Alan | Plan Hedefi | Mevcut Durum |
|------|-------------|--------------|
| Landing mesaj dili | Türkçe, yaratıcı odaklı | Tamamen İngilizce, hardcoded |
| Yaratıcı stüdyosu | Satış, gelir, hediye linkleri | Sadece eser sayısı + hediye butonu |
| Eser türleri | 6 tür (Film, Konser, Belgesel, vb.) | Kontratta 4 tür, UI'da gösterilmiyor |
| Discover filtreleme | Tür bazlı bölümler | Tek grid, filtre yok |
| Çeviri tutarlılığı | Tek sözlük, tek ton | Siz/sen karışık, teknik terimler dağınık |
| Yaratıcı profili | Bio, sosyal link, avatar | Hiç yok |

---

## 2. Hedef Kitle (Değişiklik Yok)

### Birincil kitle: yaratıcılar
- Bağımsız film yönetmenleri
- Kısa film ve belgesel ekipleri
- Müzisyenler ve konser kaydı yayınlamak isteyen ekipler
- Festival, gösterim ve özel etkinlik düzenleyen topluluklar
- Masterclass, kamera arkası, prova kaydı üreticileri

Ana ihtiyaç: Eser üzerinde kontrol, hızlı gelir, doğrudan izleyici bağlantısı, izinsiz yayılma önleme.

### İkincil kitle: izleyiciler
- Bağımsız film izleyicileri
- Müzik ve konser takipçileri
- Festival seçkilerine erişmek isteyenler
- Sanatçıyı doğrudan desteklemek isteyen hayranlar
- Hediye bilet ile gelen yeni kullanıcılar

Ana ihtiyaç: Güvenli izleme, net fayda, cüzdan karmaşası olmadan ilerleme, satın aldığı erişimin kendisine ait olduğunu bilme.

---

## 3. Konumlandırma (Değişiklik Yok)

### Ana konum
YouTick, filmlerini ve konser kayıtlarını doğrudan izleyiciye satmak isteyen yaratıcılar için dijital biletli video yayın platformudur.

### Kısa anlatım
Filmini, konser kaydını ya da özel gösterimini doğrudan izleyicine sun. Fiyatı sen belirle, erişimi sen yönet, gelirin %98'i sana kalsın.

### Uzun anlatım
YouTick, sinema ve müzik yaratıcılarının eserlerini aracı kurumlara bağlı kalmadan yayınlamasını sağlar. Yaratıcı videoyu yükler, bilet fiyatını belirler ve erişim kuralını seçer. İzleyici dijital bilet alarak içeriğe erişir. Satış geliri anında yaratıcıya gider; platform yalnızca küçük bir kesinti alır.

---

## 4. Dil Sözlüğü — Güncellenmiş ve Genişletilmiş

Orijinal sözlük korunur. Yeni eklemeler ve düzeltmeler aşağıdadır.

| Kullanılacak ifade | Ne zaman kullanılır | Kaçınılacak ifade |
| --- | --- | --- |
| Yaratıcı | Müzisyen, yönetmen, yapımcı ve içerik sahibi için genel ad | Üretici, artist, owner, content creator |
| Eser | Film, konser kaydı, belgesel, özel video için ana ad | Video, asset, content, media |
| Dijital bilet | İzleyicinin aldığı erişim hakkı | NFT ticket, NFT, token-gated access |
| Yayına almak | Upload + publish eylemini sade anlatmak | Mint etmek, event create etmek, upload |
| İzleyici | İçeriği izleyen kişi | User, holder, consumer |
| Gelir | Satıştan gelen para | Revenue share, payout |
| Erişim | İzleme hakkı | Token-gated access, whitelist |
| Yayın | Yayındaki eserin bütünü | Event, drop, listing |
| Gösterim | Eserin izleyiciye açılma anı | Premiere, launch, drop |
| Stüdyo | Yaratıcının kontrol paneli | Dashboard, admin panel, backend |

### Teknik ifade kullanım kuralı

Teknik ifadeler tamamen yok edilmemeli, ama öncelik kullanıcı dilinde olmalı.

- **Görünen metin:** "Dijital bilet sahipleri izleyebilir."
- **Yardım metni (tooltip/ayrıntı):** "Bu bilet zincir üzerinde NFT olarak tutulur; sahipliğin kanıtı budur."
- **Görünen metin:** "Eserin güvenli biçimde saklanır."
- **Yardım metni:** "IPFS ve Crust ağı üzerinde dağıtık depolanır; tek bir sunucuya bağımlı değildir."

### Düzeltilmesi gereken tutarsızlıklar

| Mevcut metin | Olması gereken | Konum |
|--------------|----------------|-------|
| "NFT Mint" | "Dijital bilet oluşturma" | `translations.ts` — cost receipt |
| "Event Oluşturma" | "Eser kaydı" | `translations.ts` — cost receipt |
| "Upload Depozitosu" | "Yayın depozitosu" | `translations.ts` — cost receipt |
| "Prepaid Bakiye" | "Ön ödemeli bakiye" | `translations.ts` — cost receipt |
| "Claim key" | "Hediye anahtarı" | `translations.ts` — claim sayfası |
| "Trial hesabınızı" | "Deneme hesabınızı" | `translations.ts` — upgrade dialog |
| "NFT'lerinizi transfer edin" | "Dijital biletlerinizi aktarın" | `translations.ts` — upgrade dialog |
| "Free videolar" | "Ücretsiz videolar" | `translations.ts` — trial sayfası |
| "Erişim Kartı" / "Erişim Bileti" | Tekilleştir: "Erişim Bileti" | `translations.ts` — discover |
| "Yükle" / "Yayına Al" | Tekilleştir: "Yayına Al" | `translations.ts` — nav |
| "Sanatçıya" / "Yaratıcıya" | Tekilleştir: "Yaratıcıya" | `translations.ts` — gelir hesaplayıcı |

### Ton birliği: Sen dili

Tüm ürün metinleri **sen dili** ile yazılmalı (informal). Mevcutta `Hesabınızı ve biletlerinizi yönetin` gibi siz dili kalıntıları var. Düzeltilmeli:

- ❌ "Hesabınızı ve biletlerinizi yönetin" → ✅ "Hesabını ve biletlerini yönet"
- ❌ "Henüz bir bilet satın almadınız." → ✅ "Henüz bir bilet satın almadın."
- ❌ "Trial hesabınızı yükseltin" → ✅ "Deneme hesabını yükselt"

---

## 5. Ton ve Üslup (Değişiklik Yok)

### Kullanılacak ton
- Net
- Cesur
- Bağımsız
- Gelir ve kontrol odaklı
- Sinema ve konser dünyasına yakın

### Kaçınılacak ton
- Fazla teknik
- Kripto jargonuna dayalı
- Sadece yatırım/finans dili gibi duran
- Aşırı iddialı ve kanıtlanması zor cümleler

### İyi cümle örnekleri
- "Eserini doğrudan izleyicine sun."
- "Bilet fiyatını sen belirle."
- "Her satışın %98'i sana kalsın."
- "Konser kaydın arşivde kalmasın; biletli dijital gösterime dönüşsün."
- "Filmini dağıtım beklemeden kendi izleyicine aç."

### Zayıf cümle örnekleri
- "NFT-gated decentralized video streaming platform."
- "KMS ile IPFS üzerinde encrypted playback."
- "Web3 native premium media monetization."
- "Blockchain üzerinde sahipliğinizi kanıtlayın."

---

## 6. Landing Page — Güncel Durum ve İyileştirme Planı

### 6.0 Mevcut Durum Analizi

Landing page tek dosyada (`app/page.tsx`) 10 section'dan oluşuyor. **8 section tamamen İngilizce ve hardcoded.** Sadece Navigation, LandingFooter ve FinancialComparisonChart çeviri sistemini kullanıyor. FinancialComparisonChart ise tanımlı ama `page.tsx`'te render edilmiyor (orphaned).

| Section | Plan (TR) | Mevcut (EN) | Durum |
|---------|-----------|-------------|-------|
| Hero H1 | "Sahne Senin. Perde Senin." | "Your stage. Your screen." | ❌ Tutarsız |
| Hero alt başlık | "Filmlerini ve konser kayıtlarını doğrudan izleyicine sat." | "Sell films and concert recordings directly to your audience." | ❌ Tutarsız |
| Audience kartlar | "Müzisyenler", "Yönetmenler", "Etkinlik ekipleri" | "Musicians", "Directors", "Event teams" | ❌ Tutarsız |
| Problem H2 | "Eser sende, kontrol başkasında." | "The work is yours. The control often is not." | ❌ Tutarsız |
| Çözüm H2 | "Eserini dijital biletle doğrudan sat." | "Sell your work directly with a digital ticket." | ❌ Tutarsız |
| ROI senaryolar | "Kısa film", "Konser kaydı", "Festival seçkisi", "Belgesel galası" | "Short film screening", "Concert recording", "Festival selection", "Documentary premiere" | ❌ Tutarsız |
| Kullanım senaryoları | "Konser kaydı", "Film galası", "Festival seçkisi", "Kamera arkası", "Hediye bilet" | İngilizce karşılıkları | ❌ Tutarsız |
| Nasıl çalışır H2 | "3 adımda yayına al" | "Publish in three clear steps." | ❌ Tutarsız |
| Güven H2 | "Arka planda güçlü, önde sade." | "Strong behind the scenes. Simple on the screen." | ❌ Tutarsız |
| Final CTA H2 | "İlk gösterimini bugün yayına al." | "Put your first screening online today." | ❌ Tutarsız |
| Navigation | Kısmi TR desteği | Kısmi TR desteği | ⚠️ Kısmen uyumlu |
| Footer | TR desteği var | TR desteği var | ✅ Uyumlu |

### 6.1 Hero

**Amaç:** İlk ekranda sinema ve konser yaratıcılarına doğrudan seslenmek.

**Mevcut:** İngilizce, yaratıcı odaklı mesaj doğru ama dil yanlış.

**İyileştirme:**
- Küçük üst etiket: "Sinema ve konser yaratıcıları için"
- Başlık: "Sahne Senin. Perde Senin."
- Alt başlık: "Filmlerini ve konser kayıtlarını doğrudan izleyicine sat."
- Açıklama: "Stüdyo, platform ve aracı kesintileri olmadan. Her dijital bilet satışında gelirin %98'i sana kalır."
- Ana CTA: "Eserini Yayına Al" → `/upload`
- İkincil CTA: "Yayınlanan Eserleri Keşfet" → `/discover`
- Küçük izleyici hattı: "Ücretsiz içerikleri izlemek için hesap oluştur."

**Görsel yön:**
- Tek başına konser görseli yerine konser sahnesi ve sinema perdesi hissini birlikte taşıyan bir atmosfer.
- Siyah zemin korunur.
- Neon etki azaltılıp daha premium, daha sinematik ışık kullanılmalı.
- İlk ekranda markanın ne yaptığı 5 saniyede anlaşılmalı.

**Teknik not:** Landing section'lar `useLanguage()` hook'una bağlanmalı. Tüm metinler `translations.ts`'teki `landing` namespace'ine taşınmalı.

### 6.2 Kimler İçin?

**Amaç:** Kullanıcı kendini ekranda görmeli.

**Kartlar:**
- **Müzisyenler:** "Konser kaydını, prova görüntülerini veya özel performansını biletli gösterime aç."
- **Yönetmenler:** "Kısa film, belgesel veya bağımsız filmini doğrudan izleyiciye sun."
- **Etkinlik ekipleri:** "Festival seçkilerini, özel gösterimleri ve kayıtları tek yerden yayınla."

### 6.3 Eski Modelin Sorunu

**Amaç:** Yaratıcının yaşadığı temel sıkıntıyı basit anlatmak.

**Başlık:** "Eser sende, kontrol başkasında."

**Alt sorunlar:**
- Gelirin büyük kısmı aracı platformlarda kalır.
- Dağıtım ve onay süreçleri yavaştır.
- İzleyiciyle doğrudan bağ kurmak zordur.
- Konser ve festival sonrası kayıtlar çoğu zaman arşivde kalır.

Bu bölümde korku dili abartılmamalı. Sorun net, çözüm yakın olmalı.

### 6.4 YouTick Modeli

**Amaç:** Ürünün değerini sade şekilde anlatmak.

**Başlık:** "Eserini dijital biletle doğrudan sat."

**Üç ana vaat:**
- **Gelir:** "Her satışın %98'i sana kalır."
- **Kontrol:** "Fiyatı, erişimi ve yayını sen belirlersin."
- **Güven:** "Sadece bilet sahipleri izleyebilir."

Teknik karşılıklar küçük notlarda verilebilir:
- Dijital bilet = NFT erişim hakkı
- Güvenli izleme = şifreli video ve anahtar koruması
- Kalıcı yayın = IPFS + Crust depolama

### 6.5 Gelir Hesaplayıcı

**Mevcut durum:** `ROICalculator` bileşeni var, çalışıyor, ama tamamen İngilizce.

**İyileştirme:**
- Alan isimleri:
  - Bilet fiyatı
  - Tahmini satış
  - Toplam satış
  - YouTick'te sana kalan
  - Geleneksel modelde tahmini kayıp
- Örnek hazır senaryolar:
  - Kısa film gösterimi
  - Konser kaydı
  - Festival seçkisi
  - Belgesel galası

**Teknik not:** `FinancialComparisonChart.tsx` orphaned durumda. Ya `page.tsx`'e eklenmeli ya da kaldırılmalı.

### 6.6 Kullanım Senaryoları

**Amaç:** Landing'in ana anlatı yerlerinden biri olmalı.

**Senaryolar:**
- **Konser kaydı:** "Gösteri bittikten sonra da kazanmaya devam et."
- **Film galası:** "Bağımsız filmini kendi izleyicine aç."
- **Festival seçkisi:** "Sınırlı süreli dijital gösterim oluştur."
- **Kamera arkası:** "Özel içerikleri sadık hayranlarına sun."
- **Hediye bilet:** "Hayranların eseri başkalarına armağan edebilsin."

### 6.7 Uygulama Önizlemesi

**Amaç:** Landing yalnızca vaatte kalmasın, ürünün gerçek ekranları görünsün.

**Gösterilecek ekranlar:**
- Eser yükleme
- Dijital bilet fiyatı belirleme
- Keşif kartı
- İzleme ekranı
- Yaratıcı stüdyosu

**"3 adımda yayına al" akışı:**
1. Eserini yükle
2. Biletini ve fiyatını belirle
3. İzleyicine sat

### 6.8 Güven ve Altyapı

**Amaç:** Teknik gücü sade anlatmak.

**Başlık:** "Arka planda güçlü, önde sade."

**Metin örnekleri:**
- "Eserin güvenli biçimde saklanır."
- "Bilet sahibi olmayan izleyemez."
- "Yayın tek bir sunucuya bağlı kalmaz."
- "Satış ve erişim kayıtları şeffaftır."

Teknik isimler küçük açıklama olarak kullanılabilir:
- NEAR — hızlı ve düşük maliyetli işlemler
- IPFS — dağıtık dosya depolama
- Crust — kalıcı depolama garantisi
- KMS — şifreli anahtar yönetimi

### 6.9 Final CTA

**Amaç:** Yaratıcıyı doğrudan aksiyona çağırmak.

**Başlık:** "İlk gösterimini bugün yayına al."

**Alt metin:** "Konser kaydını, filmini veya özel içeriğini dijital biletle izleyicine sun."

**CTA:** "Eserini Yayına Al" → `/upload`

**İkinci bağlantı:** "Önce keşfet" → `/discover`

---

## 7. Uygulama Ekranları Planı — Güncellenmiş

### 7.1 Upload Ekranı

**Mevcut durum:** Genel yapı plana uygun. "Eserini Yayına Al", "Eser adı", "Eser açıklaması", "Dijital bilet fiyatı" etiketleri doğru. Adım etiketleri de doğru.

**Tutarsızlıklar:**
- İngilizce `setStatus` mesajları UI'a sızıyor: `"Uploading cover image..."`, `"Uploading delivery segments..."`, `"Storing encryption key on KMS..."`, `"Verifying storage status..."`
- Validasyon mesajları İngilizce: `"Please enter a title and description"`, `"Title must be 200 characters or less"`
- Preview kartta "Cüzdan bağla" ifadesi teknik

**İyileştirme planı:**
1. Tüm `setStatus()` çağrıları `getFriendlyStatus()` ile sar veya doğrudan Türkçe status objesi kullan.
2. Validasyon mesajlarını `translations.ts`'e taşı.
3. Erişim modu seçenekleri:
   - `public_free`: "Ücretsiz izleme" / "Herkes izleyebilir."
   - `free_collectible`: "Ücretsiz dijital bilet" / "İzlemek için hesabına eklenir."
   - `paid`: "Ücretli dijital bilet" / "Fiyat girince açılır."
4. Adım etiketleri (korunur):
   - Yayın izni hazırlanıyor
   - Kapak hazırlanıyor
   - Güvenli erişim kuruluyor
   - Video hazırlanıyor
   - Güvenli erişim kaydediliyor
   - Dijital bilet oluşturuluyor
   - Yayın kaydediliyor
   - Yayın kontrol ediliyor
5. Maliyet makbuzu (`cost_receipt`):
   - "NFT Mint" → "Dijital bilet oluşturma"
   - "Event Oluşturma" → "Eser kaydı"
   - "Upload Depozitosu" → "Yayın depozitosu"
   - "Prepaid Bakiye" → "Ön ödemeli bakiye"

**Yeni gereksinim — Eser türü seçimi:**
Upload formuna "Eser türü" alanı eklenmeli. Seçenekler:
- Film
- Konser Kaydı
- Belgesel
- Kısa Film
- Festival Seçkisi
- Özel İçerik

Bu bilgi kontratta `content_type` olarak saklanır. Mevcut kontrat enum'u genişletilmeli.

### 7.2 Discover Ekranı

**Mevcut durum:** Basit grid. Filtre yok. Kartlarda tür etiketi yok. "Dijital Bilet", "Ücretsiz", "Bilet Al" gibi etiketler `VideoCard`'ın içinde dağınık.

**İyileştirme planı:**
1. **Yeni bölümler:**
   - Öne çıkan eserler
   - Yeni yayınlananlar
   - Ücretsiz izlenebilenler
   - Konser kayıtları
   - Filmler ve belgeseller
2. **Kart yapısı:**
   - Poster veya kapak görseli
   - Eser adı
   - Yaratıcı adı
   - Tür etiketi: Film, Konser, Belgesel, Özel Gösterim
   - Fiyat veya ücretsiz etiketi
   - Kısa açıklama
   - "İzle" veya "Bilet Al"
3. **"NFT" etiketi kaldırılır.** Daha iyi ifade:
   - "Dijital Bilet"
   - "Ücretsiz"
   - "Sende"
4. **Filtreleme:** Tür ve fiyat (ücretsiz/ücretli) filtresi eklenmeli.

**Teknik bağımlılık:**
- Kontrat `content_type` enum'u genişletilmeli.
- `get_events_paginated` view method'u `content_type` filtresi desteklemeli.
- Eser türü UI'da gösterilmeli.

### 7.3 Watch Ekranı

**Mevcut durum:** `watch/page.tsx` sadece sahip olunan içerikleri gösteriyor (`useOwnedTokens`). Yani izleyici bileti olmadan bu sayfaya geldiğinde içerik göremiyor. Satın alma akışı başka yerde (`TicketPurchaseCard`).

**İyileştirme planı:**
1. **Birleşik izleme sayfası:**
   - İzleyicinin bileti varsa: oynatıcı + eser bilgisi
   - İzleyicinin bileti yoksa: eser bilgisi + "Bilet Al" CTA
   - Erişim durumu net görünmeli:
     - "Dijital bilet sende" → oynatıcı açık
     - "Bu eseri izlemek için dijital bilet gerekir" → satın alma kartı
     - "Ücretsiz izlenebilir" → doğrudan oynat
2. **Yeni elementler:**
   - Büyük oynatıcı
   - Eser adı
   - Yaratıcı bilgisi (yeni creator profilinden çekilecek)
   - Açıklama
   - Benzer eserler veya aynı yaratıcının eserleri
3. **Metin önerileri:**
   - "Uploaded by" yerine "Yaratıcı"
   - "Your Library" yerine "İzleme Kitaplığın"
   - "Now Playing" yerine "Şimdi İzleniyor"
   - "NFT Ticket" yerine "Dijital Bilet"

**Teknik bağımlılık:**
- Watch sayfası `cid` parametresiyle herkese açık olmalı (sadece sahiplere değil).
- `has_ticket` kontrolü yapılmalı.
- Benzer eserler için `creator_id`'ye göre `get_events` çağrısı.

### 7.4 Profile Ekranı

**Mevcut durum:** Çift panel (Biletlerim + Yaratıcı Stüdyom). "Yaratıcı Stüdyom" başlığı doğru. Ancak stüdyo sadece eser listesi; satış, gelir, analiz yok. "Published works" hardcoded İngilizce.

**Yeni yapı:**
- **Hesap** (avatar, bio, sosyal linkler — yeni)
- **İzleme kitaplığım**
- **Yaratıcı stüdyom** (genişletilmiş)
- **Hediye biletler**
- **Gelir ve satış özeti** (yeni)

**Yaratıcı stüdyosu kartları:**
- Yayındaki eser sayısı
- Toplam satış
- Tahmini gelir
- Hediye linkleri
- Yayına yeni eser al

**İzleyici tarafı:**
- Biletlerim
- İzlemeye devam et
- Hediye gelen biletler

**Teknik bağımlılık — Yeni gereksinimler:**
1. **Creator profile metadata:**
   - `creator_name`: Metin, zorunlu değil (fallback: accountId)
   - `creator_bio`: Kısa metin, maksimum 500 karakter
   - `creator_website`: URL
   - `creator_social`: { twitter, instagram, youtube }
   - `creator_avatar_url`: IPFS hash veya URL
   
   Bu veriler kontratta mı yoksa off-chain'de mi saklanacak? **Öneri:** Kontrat `creator_metadata` map'i eklensin. Anahtar `creator_id`, değer JSON string. Depolama maliyeti düşük.

2. **Creator analytics:**
   - Kontrat `get_purchase_logs` view method'u var. Creator için filtreleme eklenebilir: `get_purchase_logs_by_creator(creator_id, from_index, limit)`.
   - Alternatif: Frontend `get_purchase_logs`'u çekip client-side filtreleyebilir. Ancak büyük veri setinde verimsiz.
   - **Öneri:** Kontrata `get_creator_stats(creator_id)` ekle: `{ total_sales, total_revenue_yocto, total_gift_claims }`.

### 7.5 Claim ve Trial Ekranları

**Mevcut durum:** `claim/page.tsx` ve `trial/page.tsx` var. Hediye bilet akışı çalışıyor.

**İyileştirme planı:**
- "Hediye biletini al"
- "Ücretsiz hesabını oluştur"
- "Biletin hazır"
- "Şimdi izle"
- "Claim key" yerine "Hediye anahtarı"
- Trial hesabı için "Deneme hesabın" dili

---

## 8. Görsel Tasarım Planı (Değişiklik Yok)

### Ana görsel yön
YouTick görsel dili "sahne + perde + dijital bilet" üçlüsü üzerine kurulmalı.

**Kullanılacak his:**
- Siyah zemin
- Sinematik ışık
- Sahne spotu
- Film posteri düzeni
- Net kartlar
- Az ama güçlü renk

### Renk
Mevcut siyah zemin korunur. NEAR yeşili ana aksiyon rengi olarak kalmalı.

**Önerilen dağılım:**
- Siyah: ana zemin
- Beyaz: ana metin
- Gri: açıklamalar ve ikincil metinler
- NEAR yeşili: ana CTA, gelir, başarı
- Mor/mavi: teknoloji ve güven katmanı
- Kırmızı/turuncu: sadece uyarı veya eski model karşılaştırması

Neon küre ve yoğun gradient kullanımı azaltılmalı. Özellikle landing dışında uygulama ekranları daha sakin olmalı.

### Tipografi
- Hero dışında aşırı büyük başlık kullanılmamalı.
- Uygulama ekranlarında daha küçük, okunaklı ve düzenli başlıklar tercih edilmeli.
- Buton metinleri kısa olmalı.

### Kartlar
- Discover kartları poster gibi davranmalı.
- Upload ve profile kartları iş paneli gibi sade olmalı.
- Kart içinde kart görünümü azaltılmalı.
- Tekrarlı içerikler dışında büyük dekoratif kartlardan kaçınılmalı.

---

## 9. İçerik ve Context Planı — Güncellenmiş

### 9.1 Eser türü bilgisi

**Mevcut:** Kontrat `ContentType` enum'u: `Concert`, `Cinema`, `Exclusive`, `LiveEvent`. UI'da hiç gösterilmiyor.

**Hedef:** Upload sırasında kullanıcıdan eser türü seçimi alınmalı.

**Yeni tür listesi:**
- Film
- Konser Kaydı
- Belgesel
- Kısa Film
- Festival Seçkisi
- Özel İçerik

**Kontrat değişikliği:**
```rust
pub enum ContentType {
    Film,
    ConcertRecording,
    Documentary,
    ShortFilm,
    FestivalSelection,
    ExclusiveContent,
}
```

**Migrasyon:** Mevcut veriler `Cinema` → `Film`, `Concert` → `ConcertRecording`, `Exclusive` → `ExclusiveContent`, `LiveEvent` → `ConcertRecording` olarak map edilebilir.

### 9.2 Yaratıcı profili

**Mevcut:** Hiç yok. Sadece `creator_id` (NEAR account) var.

**Hedef:** Yaratıcı adı, kısa açıklama ve dış bağlantılar.

**Yeni alanlar:**
- Yaratıcı adı (display name)
- Kısa bio
- Web sitesi
- Sosyal bağlantılar (Twitter/X, Instagram, YouTube)
- Profil görseli

**Kontrat değişikliği önerisi:**
```rust
pub struct CreatorProfile {
    pub display_name: Option<String>,
    pub bio: Option<String>,
    pub website: Option<String>,
    pub social_links: Option<HashMap<String, String>>,
    pub avatar_cid: Option<String>,
    pub updated_at: u64,
}

// State'e ekle
pub creator_profiles: LookupMap<AccountId, CreatorProfile>,
```

**Frontend:**
- Upload form'da "Yaratıcı adı" alanı (ilk upload'ta sorulabilir).
- Profile sayfasında "Profili Düzenle" modal/dialog.
- Discover ve Watch kartlarında yaratıcı adı gösterimi.

### 9.3 Eser açıklaması şablonu

**Mevcut:** Boş textarea, placeholder var.

**İyileştirme:** Yaratıcıya boş açıklama alanı bırakmak yerine yardımcı ipuçları gösterilmeli:
- Bu eser ne hakkında?
- İzleyici neden izlemeli?
- Bu kayıt veya film ne zaman üretildi?
- Özel bir gösterim, gala veya konser kaydı mı?

**Uygulama:** Textarea altında ipucu kartları veya placeholder döngüsü.

### 9.4 Bilet bilgisi

**Mevcut:** Üç erişim modu var, temelde doğru.

**Hedef:** Her eserin bilet bilgisi açık olmalı:
- Ücretsiz
- Ücretli dijital bilet
- Hediye edilebilir
- Sınırlı erişim veya kalıcı erişim

**Not:** "Sınırlı erişim" (time-limited) kontratta henüz yok. Gelecek özellik olarak not edilmeli.

---

## 10. Ölçüm Planı (Değişiklik Yok)

Frontend değişiklikleri yalnızca güzel görünmek için değil, davranışı iyileştirmek için yapılmalı.

### Ölçülecek temel noktalar
- Landing → upload tıklama oranı
- Landing → discover tıklama oranı
- Upload başlatma oranı
- Upload tamamlama oranı
- Discover kart tıklama oranı
- Bilet satın alma veya ücretsiz erişim alma oranı
- Watch ekranında başarılı oynatma oranı
- Hediye bilet oluşturma ve claim oranı
- Yaratıcı stüdyo → yeni eser yayına alma oranı

### İlk hedef
- Landing'de yaratıcı CTA'sını netleştirerek upload tıklamasını artırmak.
- Upload ekranında sade metinlerle tamamlanma oranını artırmak.
- Discover kartlarını güçlendirerek izleme/satın alma oranını artırmak.
- Yaratıcı stüdyosunda satış/gelir görünürlüğü ile yaratıcı retention'ını artırmak.

---

## 11. Uygulama Öncelikleri — Güncellenmiş ve Genişletilmiş

### Faz 0: Çevri altyapısı ve dil tutarlılığı (YENİ — Ön şart)

**Amaç:** Tüm metinlerin tek bir kaynaktan yönetilmesini sağlamak.

**Görevler:**
1. `translations.ts` dosyasını `landing` namespace'i ile genişlet. Tüm landing section metinleri buraya taşınmalı.
2. Landing section bileşenlerini `useLanguage()` hook'una bağla.
3. Siz/sen tutarsızlıklarını düzelt.
4. Teknik terimleri sözlüğe göre düzelt (NFT Mint → Dijital bilet oluşturma, vb.).
5. Upload form'daki İngilizce `setStatus` mesajlarını `getFriendlyStatus`'a ekle veya Türkçe internal status kullan.
6. `TicketPurchaseCard` içindeki hardcoded İngilizce metinleri `translations.ts`'e taşı.
7. Profile page'deki "Published works", "Ready", "Trial Invites" gibi hardcoded İngilizce metinleri çeviri sistemine ekle.

**Beklenen sonuç:** Ürün dil olarak tek bir vücut gibi hissettirmeye başlar.

**Efor:** 2–3 gün
**Risk:** Düşük. Sadece metin değişikliği.

---

### Faz 1: Dil ve tutarlılık (Orijinal planın Faz 1'i)

**Amaç:** Ürünün ne söylediğini netleştirmek.

**Görevler:**
1. Çeviri dosyasında ortak sözlüğü oluştur (Faz 0'da tamamlanır).
2. İngilizce kalan görünür metinleri çeviri dosyasına taşı (Faz 0'da tamamlanır).
3. "NFT Ticket" görünen yerleri "Dijital Bilet" ile değiştir.
4. "Video" kelimesini form alanları dışında "eser" ile değiştir.
5. Upload, Discover, Watch, Profile ekranlarında aynı kelime setini kullan.
6. Landing sayfasındaki Türkçe metinleri (Faz 0 sonrası aktif) doğrula.

**Beklenen sonuç:** Kullanıcı ürünün ne yaptığını daha hızlı anlar.

**Efor:** 1 gün (Faz 0 sonrası)
**Risk:** Düşük.
**Bağımlılık:** Faz 0 tamamlanmalı.

---

### Faz 2: Landing yapısı (Orijinal planın Faz 2'i)

**Amaç:** Landing'i yaratıcı odaklı satış sayfasına dönüştürmek.

**Görevler:**
1. Hero mesajını Türkçe ve plana uygun hale getir ("Sahne Senin. Perde Senin.").
2. Yaratıcı/izleyici CTA ayrımını netleştir.
3. "Kimler için?" bölümünü ekle/güçlendir.
4. Kullanım senaryolarını sinema ve konser etrafında güçlendir.
5. Gelir hesaplayıcıyı daha erken ve daha anlaşılır konumlandır. Türkçe senaryolar ekle.
6. Teknik altyapıyı sade güven anlatısına çevir.
7. `FinancialComparisonChart`'ı ya kullan ya kaldır.
8. Navigation linklerini Türkçeleştir.

**Beklenen sonuç:** Landing daha az teknik, daha net ve daha ikna edici olur.

**Efor:** 2–3 gün
**Risk:** Orta. Metin değişikliği + küçük yapısal değişiklikler.
**Bağımlılık:** Faz 0 + Faz 1.

---

### Faz 3: Upload ekranı (Orijinal planın Faz 3'ü)

**Amaç:** Yayına alma akışını yaratıcı için güven veren bir sürece dönüştürmek.

**Görevler:**
1. Başlığı "Eserini Yayına Al" yap (zaten yapılmış).
2. Formu "Eser bilgileri" ve "Bilet ve erişim" olarak ayır (zaten yapılmış).
3. Önizlemeyi gerçek keşif kartına benzet.
4. Durum metinlerini sadeleştir (İngilizce sızıntıları kapat).
5. Ücretsiz/ücretli erişim seçeneklerini daha açık hale getir.
6. **Yeni:** Eser türü seçimi ekle (Film, Konser Kaydı, Belgesel, Kısa Film, Festival Seçkisi, Özel İçerik).
7. **Yeni:** Eser açıklaması ipuçları ekle.
8. **Yeni:** İlk upload'ta yaratıcı adı sor (eğer profilde yoksa).

**Teknik bağımlılık:**
- Kontrat `ContentType` enum'u genişletilmeli.
- Upload session ve event creation `content_type` parametresi almalı.
- Frontend `useUpload.ts` hook'u güncellenmeli.

**Beklenen sonuç:** Yaratıcı ne yaptığını ve yayına alma sürecinin neresinde olduğunu daha iyi anlar.

**Efor:** 3–4 gün
**Risk:** Orta. Kontrat değişikliği gerekebilir.
**Bağımlılık:** Faz 0 + Faz 1.

---

### Faz 4: Discover ve Watch (Orijinal planın Faz 4'ü)

**Amaç:** İzleyici deneyimini film/konser vitrini gibi hissettirmek.

**Discover görevleri:**
1. Kartları poster odaklı yenile.
2. Tür etiketleri ve bilet durumu ekle.
3. Filtreleme ekle (tür, ücretsiz/ücretli).
4. "Yayınlanan Eserler", "Yeni gösterimler", "Konser kayıtları", "Filmler ve belgeseller" bölümlerini ayır.
5. Kart CTA'larını netleştir: "İzle", "Bilet Al", "Ücretsiz İzle".

**Watch görevleri:**
1. Herkese açık watch sayfası oluştur (`cid` parametresiyle).
2. Bilet durumuna göre farklı view'lar:
   - Sahipsen: oynatıcı
   - Sahip değilsen: eser bilgisi + satın alma
3. "Yaratıcı", "Dijital Bilet", "İzleme Kitaplığın" dilini kullan.
4. Yaratıcı bilgisi (yeni profilden).
5. Benzer eserler / aynı yaratıcının eserleri.

**Teknik bağımlılık:**
- `content_type` kontrat değişikliği.
- `has_ticket` kontrolü.
- Creator profil verisi.

**Beklenen sonuç:** İzleyici içerikleri daha kolay tarar, satın alma veya izleme kararı daha hızlı olur.

**Efor:** 4–5 gün
**Risk:** Orta-yüksek. Yeni sayfa yapısı, kontrat bağımlılığı.
**Bağımlılık:** Faz 3 (content type).

---

### Faz 5: Yaratıcı stüdyosu (Orijinal planın Faz 5'i — Genişletilmiş)

**Amaç:** Profil ekranını yaratıcı için kontrol paneline dönüştürmek.

**Görevler:**
1. "Yaratıcı Stüdyom" bölümünü güçlendir (başlık zaten doğru).
2. **Yeni:** Satış ve gelir özeti ekle:
   - Toplam satış sayısı
   - Toplam gelir (NEAR cinsinden, USD karşılığı)
   - Son 30 gün satışları
3. **Yeni:** Yayındaki eserler listesini genişlet:
   - Her eser için: satış sayısı, gelir, hediye claim sayısı
   - Hızlı işlemler: izle, paylaş, hediye bilet oluştur
4. **Yeni:** Yaratıcı profili yönetimi:
   - Display name, bio, website, sosyal linkler, avatar
5. **Yeni:** Gelir grafiği veya basit istatistik kartları.

**Teknik bağımlılık:**
- Kontrat `get_creator_stats` veya `get_purchase_logs_by_creator` ekleme.
- Kontrat `CreatorProfile` struct'ı ve set/get method'ları.
- IPFS avatar upload (opsiyonel, URL olarak da başlanabilir).

**Beklenen sonuç:** Yaratıcı platformu sadece yükleme aracı değil, yayın ve satış merkezi olarak görür.

**Efor:** 5–7 gün
**Risk:** Yüksek. Kontrat değişikliği, yeni veri modelleri.
**Bağımlılık:** Faz 3 + Faz 4.

---

### Faz 6: TicketPurchaseCard ve ödeme akışı (YENİ)

**Amaç:** Satın alma deneyimini de yaratıcı dostu dile çevirmek.

**Görevler:**
1. `TicketPurchaseCard` içindeki tüm hardcoded İngilizce metinleri çeviri sistemine taşı.
2. Maliyet dökümü etiketlerini Türkçeleştir:
   - "Ticket price" → "Bilet fiyatı"
   - "NFT storage deposit" → "Dijital bilet depozitosu"
   - "Gas buffer" → "İşlem ücreti"
   - "Total" → "Toplam"
3. Ödeme adımlarındaki swap ilerleme metinlerini Türkçeleştir.
4. "Buy Ticket" → "Bilet Al"
5. "Complete Purchase" → "Satın Almayı Tamamla"
6. "Watch Your Video" → "Eserini İzle"

**Beklenen sonuç:** Satın alma süreci de ürünün geri kalanı kadar sade ve anlaşılır olur.

**Efor:** 2 gün
**Risk:** Düşük. Metin değişikliği.
**Bağımlılık:** Faz 0.

---

### Faz 7: İzleme deneyimi ve optimizasyon (YENİ)

**Amaç:** Watch ekranını sinematik ve işlevsel hale getirmek.

**Görevler:**
1. Yeni watch sayfası: biletsiz izleyici de görebilmeli.
2. Erişim durumu mesajlarını netleştir.
3. Benzer eserler önerisi.
4. Aynı yaratıcının diğer eserleri.
5. Performans optimizasyonu: video yükleme süresi, oynatma başarı oranı.

**Beklenen sonuç:** İzleyici keşiften izlemeye kesintisiz akar.

**Efor:** 3–4 gün
**Risk:** Orta.
**Bağımlılık:** Faz 4 + Faz 5.

---

## 12. Teknik Bağımlılıklar ve Kontrat Değişiklikleri

### Kontrat değişiklikleri özeti

| # | Değişiklik | Gerekçe | Etkilenen Faz |
|---|------------|---------|---------------|
| 1 | `ContentType` enum genişletme | 6 tür desteği | Faz 3 |
| 2 | `Event` ve `EventResponse`'a `content_type` alanı ekleme | Tür bilgisi taşıma | Faz 3 |
| 3 | `create_event` / `create_event_prepaid`'a `content_type` parametresi | Upload sırasında tür kaydetme | Faz 3 |
| 4 | `get_events_paginated`'a `content_type` filtresi | Discover filtreleme | Faz 4 |
| 5 | `CreatorProfile` struct'ı ve state map'i | Yaratıcı profili | Faz 5 |
| 6 | `set_creator_profile` / `get_creator_profile` method'ları | Profil CRUD | Faz 5 |
| 7 | `get_creator_stats(creator_id)` view method'u | Satış/gelir özet | Faz 5 |
| 8 | (Opsiyonel) `get_purchase_logs_by_creator` | Detaylı satış log'u | Faz 5 |

### Frontend değişiklikleri özeti

| # | Değişiklik | Gerekçe | Etkilenen Faz |
|---|------------|---------|---------------|
| 1 | `translations.ts` genişletme | Landing + ödeme metinleri | Faz 0 |
| 2 | Landing section'lar i18n bağlama | Dil birliği | Faz 0–2 |
| 3 | `UploadForm.tsx` status mesajları düzeltme | İngilizce sızıntı | Faz 0 |
| 4 | `TicketPurchaseCard.tsx` i18n | Ödeme dili | Faz 6 |
| 5 | `profile/page.tsx` hardcoded metinler | Profil dili | Faz 0 |
| 6 | `useUpload.ts` content_type desteği | Tür kaydetme | Faz 3 |
| 7 | `VideoCard.tsx` tür etiketi ve poster görünümü | Discover kartları | Faz 4 |
| 8 | `DiscoverView.tsx` filtreleme ve bölümler | Keşif deneyimi | Faz 4 |
| 9 | `watch/page.tsx` yeniden yapılandırma | Birleşik izleme | Faz 7 |
| 10 | `profile/page.tsx` stüdyo genişletme | Satış/gelir/profil | Faz 5 |
| 11 | Yeni `CreatorProfileForm` bileşeni | Profil yönetimi | Faz 5 |
| 12 | `FinancialComparisonChart` kullanım/kaldırma | Orphaned kod | Faz 2 |

---

## 13. Kontrol Listesi — Güncellenmiş

Bu plan uygulanırken her ekran için şu sorular sorulmalı:

- [ ] Bu ekran yaratıcıya mı, izleyiciye mi konuşuyor?
- [ ] Ana aksiyon 5 saniyede anlaşılıyor mu?
- [ ] Teknik terim sade karşılığı olmadan kullanılmış mı?
- [ ] "Video", "event", "NFT", "upload", "mint" gibi ifadeler gereksiz yerde görünüyor mu?
- [ ] Sinema ve konser kullanım alanları açıkça hissediliyor mu?
- [ ] CTA metni kısa ve eylem odaklı mı?
- [ ] Mobilde metinler sıkışmadan okunuyor mu?
- [ ] Görsel dil landing ve uygulama arasında aynı aileden mi?
- [ ] Yaratıcı için gelir, kontrol ve güven vaadi görünür mü?
- [ ] İzleyici için keşif, bilet ve izleme akışı net mi?
- [ ] Çeviri dosyasındaki karşılığı var mı? (Yeni metinler için)
- [ ] Sen dili kullanılıyor mu? (Siz dili kalmış mı?)
- [ ] Aynı kavram farklı ekranlarda farklı adlandırılmış mı?

---

## 14. Son Karar

YouTick'in frontend yönü şu cümle etrafında birleşmeli:

> Yaratıcı eserini doğrudan izleyicisine açar; izleyici dijital biletle güvenli biçimde izler; gelir yaratıcıya akar.

Bu cümle landing sayfasında, upload akışında, keşif kartlarında, izleme ekranında ve profil/stüdyo alanında aynı anlamı taşımalıdır.

Öncelik görsel süsleme değil, bu anlamı her ekranda açık ve güven veren şekilde göstermektir.

**Uygulama sırası:**
1. Faz 0: Çeviri altyapısı (ön şart)
2. Faz 1: Dil tutarlılığı
3. Faz 6: TicketPurchaseCard (bağımsız, düşük risk)
4. Faz 2: Landing yapısı
5. Faz 3: Upload ekranı (kontrat değişikliği)
6. Faz 4: Discover ve Watch
7. Faz 5: Yaratıcı stüdyosu
8. Faz 7: İzleme deneyimi

**Toplam tahmini efor:** 22–29 iş günü (kontrat değişiklikleri dahil)

---

## Ek A: Mevcut Tutarsızlıklar Detay Listesi

### A.1 Landing Page
- HeroSection: Tamamen İngilizce hardcoded
- AudienceSection: Tamamen İngilizce hardcoded
- PainPointsSection: Tamamen İngilizce hardcoded
- ValuePropositionSection: Tamamen İngilizce hardcoded
- ROICalculator: Tamamen İngilizce hardcoded
- UseCasesSection: Tamamen İngilizce hardcoded
- HowItWorksSection: Tamamen İngilizce hardcoded
- CompetitiveAdvantagesSection: Tamamen İngilizce hardcoded
- CTASection: Tamamen İngilizce hardcoded
- FinancialComparisonChart: Tanımlı ama `page.tsx`'te kullanılmıyor

### A.2 Upload Form
- `"Uploading cover image..."` → Türkçe karşılık yok
- `"Uploading initialization segment..."` → Türkçe karşılık yok
- `"Uploading delivery segments... ${progress}%"` → Türkçe karşılık yok
- `"Uploading delivery manifest..."` → Türkçe karşılık yok
- `"Uploading encrypted delivery segments..."` → Türkçe karşılık yok
- `"Storing encryption key on KMS..."` → Türkçe karşılık yok
- `"Verifying storage status..."` → Türkçe karşılık yok
- `"Storage is being processed — your video is safe."` → Türkçe karşılık yok
- `"Success! Video uploaded & ticket sales started!"` → Türkçe karşılık yok
- `"Please enter a title and description"` → Türkçe karşılık yok
- `"Title must be 200 characters or less"` → Türkçe karşılık yok
- `"Description must be 2000 characters or less"` → Türkçe karşılık yok
- `"Price cannot be negative"` → Türkçe karşılık yok
- `"Price cannot exceed $50,000"` → Türkçe karşılık yok

### A.3 Profile Page
- `"Published works"` (line 222) hardcoded İngilizce
- `"Ready"` (line 226) hardcoded İngilizce
- `"Trial Invites"` (line 138, 510–514) hardcoded İngilizce

### A.4 TicketPurchaseCard
- `"Your Content"` hardcoded İngilizce
- `"Watch Your Video"` hardcoded İngilizce
- `"Complete Purchase"` hardcoded İngilizce
- `"Buy Ticket • $X.XX"` hardcoded İngilizce
- `"Pay with {method}"` hardcoded İngilizce
- `"Pay with MetaMask • {method}"` hardcoded İngilizce
- `"Ticket price"` hardcoded İngilizce
- `"NFT storage deposit"` hardcoded İngilizce
- `"Gas buffer"` hardcoded İngilizce
- `"Total"` hardcoded İngilizce
- `"Excess deposit is refunded by the contract."` hardcoded İngilizce
- Tüm swap ilerleme metinleri hardcoded İngilizce

### A.5 Çeviri Dosyası (`translations.ts`)
- `profile_page.subtitle`: "Hesabınızı ve biletlerinizi yönetin" → siz dili (düzeltilmeli)
- `profile_page.no_tickets_desc`: "Henüz bir bilet satın almadınız." → siz dili (düzeltilmeli)
- `upload_page.cost_receipt.nft_mint`: "NFT Mint" → teknik (düzeltilmeli)
- `upload_page.cost_receipt.event_creation`: "Event Oluşturma" → teknik (düzeltilmeli)
- `upload_page.cost_receipt.first_upload_deposit`: "İlk Upload Depozitosu" → teknik (düzeltilmeli)
- `upload_page.cost_receipt.prepaid_balance`: "Prepaid Bakiye" → teknik (düzeltilmeli)
- `trial_page.test_account_required`: "Free videoları" → İngilizce karışma (düzeltilmeli)
- `claim_page.invalid_link`: "Claim key bulunamadı." → teknik (düzeltilmeli)
- `upgrade_dialog.description`: "Trial hesabınızı" → teknik + siz dili (düzeltilmeli)
- `upgrade_dialog.step3`: "NFT'lerinizi yeni hesaba transfer edebilirsiniz" → teknik + siz dili (düzeltilmeli)
- `landing.discover.access_pass`: "Erişim Kartı" → `discover_page.access_pass`: "Erişim Bileti" ile tutarsız
- `nav.upload`: "Yayına Al" → `landing.nav.upload`: "Yükle" ile tutarsız
- `financial_chart.to_artist`: "Sanatçıya" → `profile_page.creator`: "Yaratıcı" ile tutarsız
- `upload_page.file_too_large_free`: "20 MB sınırı" → kodda 100 MB, çeviride 20 MB (factual hata)

### A.6 Content Type
- Kontrat: 4 tür (`Concert`, `Cinema`, `Exclusive`, `LiveEvent`)
- UI: Hiç gösterilmiyor
- Plan: 6 tür (`Film`, `Konser Kaydı`, `Belgesel`, `Kısa Film`, `Festival Seçkisi`, `Özel İçerik`)

### A.7 Creator Analytics
- Kontrat: `PurchaseLog` var, `get_purchase_logs` var
- UI: Hiç gösterilmiyor
- Plan: Toplam satış, gelir, istatistik isteniyor

### A.8 Creator Profile
- Kontrat: Hiç yok
- UI: Hiç yok
- Plan: Display name, bio, website, sosyal, avatar isteniyor
