# YouTick "Sahne" arayüz dönüşümü — uygulama planı

30 Eylül 2026 · Gate: `YOUTICK_SAHNE_UI_PLAN` · **COMPLETED_WITH_WARNINGS (plan)**

Bu belge onaylanan "Sahne" arayüz tasarımını, mevcut mimari sınırları bozmadan uygulanabilir
gate'lere böler. Kod, flag, kontrat, read-model, provider veya canlı kayıt değiştirmez.
Commit, push, PR, CI, deploy ve Preview/Production kabulü bu gate'in dışındadır.

- **Tasarım kaynağı:** "YouTick UI/UX Yeniden Tasarım" tuvali, `Sahne · tüm ekranlar` sayfası
  (16 pano: kimlik, durumlar, 10 masaüstü ve 6 mobil ekran). Özel Claude artifact'ıdır; ekip
  erişimi için sahibinin paylaşması gerekir.
- **Onay:** kullanıcı 30 Eylül 2026'da A · Sahne yönünü seçti, tüm ekranların detayını ve
  bu uygulama planını onayladı.
- **Kaynak tabanı:** `origin/main` `54797a0` (#219). Yerel `main` bu belge yazılırken 7 commit
  gerideydi. Plan; güncel katalog (#217–#219), compact NEAR Auth yükleme (#214) ve V1 kapsam
  belgelerini (#215, #216) okuyarak yazıldı. Uygulama başlarken güncel `main` yeniden doğrulanır.
- **Kanıt sınıfı:** LOCAL_STATIC. Tasarım panoları tarayıcıda render edilerek doğrulanmadı;
  canlı testnet arayüzü bu çalışmada görsel olarak incelenemedi (EXTERNAL_NOT_RUN).

## 1. Değişmeyecekler

- NEAR ekonomik/entitlement otoritesi, Livepeer medya katmanı, Bridge kontrol katmanıdır.
  Arayüz bu sınırları değiştirmez; yalnız görünür kılar.
- Ödeme, dönüşüm, entitlement, yükleme, kurtarma ve oynatma **davranışı** değişmez.
  `lib/livepeer-upload.ts`, `lib/multi-asset-payments.ts`, `lib/livepeer-publication.ts`,
  `lib/livepeer-playback.ts`, `lib/device-session.ts`, `lib/access-grants.ts`, kontratlar,
  Bridge ve protocol şemaları bu programda yalnız okunur. İstisna gerekirse ayrı gate açılır.
- Feature flag'lerin kapalı varsayımı korunur. Yeni flag gerekirse varsayılanı `false` olur.
- Player V2 oynatma mantığı (HLS/native seçimi, token yenileme, önizleme, kalite, klavye)
  değişmez. Yalnız kabuk, renk token'ları ve cihaz kaydı sunumu değişir.
- V1 kapsamı: mevcut NEAR testnet cüzdanıyla kontrollü pilot. Sosyal giriş, kart ödeme ve
  banka ödemesi arayüzde sunulmaz (`docs/architecture/youtick-v1-product-scope.md`, origin/main).
- Hata ve beklemelerde "neyin güvende olduğunu söyleyen" mevcut metin kalıbı korunur.

## 2. Onaylanan tasarımın özeti

### 2.1 Görsel sistem

| Öğe | Karar |
|---|---|
| Font | Tek aile: Archivo (değişken genişlik). Başlık: dar (`wdth` 62) 800; logo: geniş (`wdth` 125) 800; gövde: normal 400–600 |
| Zemin / panel / yükselti / çizgi | `#0A0A0B` / `#131314` / `#1C1C1E` / `#2A2A2C` |
| Metin | `#F5F5F4` (18,1:1), `#C9C9C6` (11,8:1), `#A3A3A0` (7,8:1) |
| Tek vurgu (Buz) | `#8FD3FF`: ilerleme, odak halkası, sahiplik, aktif gezinme |
| Hata | `#FF8A7A` (8,6:1) |
| Şekil | Köşe 2 px; tüm dokunma hedefleri ≥ 44 px; birincil düğme beyaz zemin/siyah metin |
| Kapak yedeği | Kapak yoksa veya ilk kare karanlıksa tipografik afiş; koyu/açık seçimi `publication_id` özetinden deterministik |
| Geçiş | "Işıklar kararır": bilet sahibi olununca kapak aynı adreste oynatıcıya dönüşür, arayüz söner |

Kontrast oranları tasarım aşamasında hesapla doğrulandı. Uygulamada token testiyle korunur (G5).

### 2.2 Bilgi mimarisi

| Bugün | Yeni | Geçiş |
|---|---|---|
| `/` · `/tr` (tanıtım) | `/` Keşif (runtime açıkken) · `/creators` Üreticiler için | Runtime kapalıyken `/` tanıtımı gösterir; `/tr` dil tercihine taşınır |
| `/discover` | `/` Keşif | Kalıcı yönlendirme |
| `/watch?job=X` | `/s/X` Gösterim + gişe barı + salon | Sorgu eşlemeli kalıcı yönlendirme |
| `/upload` · `/upload?job=X` | `/studio/new` · yarım işler Stüdyo'da | Yönlendirme; `job` parametresi korunur |
| `/profile` | `/studio` (üretici) · `/tickets` (izleyici) | `/studio`'ya yönlendirme |
| — | `/c/[hesap]` Yapımcı sayfası | Yeni |
| — | Hesap menüsü: cüzdan, bakiye, cihaz, dil, hesap değiştir, bağlantıyı kes | Yeni |

Salon ayrı bir adres değildir: oynatıcı `/s/[id]` üzerinde açılır.

### 2.3 Metin kuralları

- Uygulamanın tamamı TR/EN; `<html lang>` seçili dile göre sunucuda belirlenir.
- Ücret ve iade ifadeleri V1 kapsam ve koşullar metniyle aynı olmalıdır. Genel "iade yok"
  ifadesi kullanılmaz; tasarım panolarındaki "Ücret iade edilmez" yerine onaylı ifade
  ("Bu akış yükleme ücretini otomatik iade etmez" ve kaynaktaki eşdeğeri) kullanılır.
- Cihaz yetkisinin 30 günü bilet hakkının süresi olarak anlatılmaz.
- `__tests__/unit/active-ui-copy.test.ts` içindeki yasaklı terimler yeni ekranlarda da
  kullanılmaz; yeni aktif UI dosyaları bu testin listesine eklenir.
- Ekranlardaki örnek içerik ve rakamlar yalnız tasarım içindir; uygulamada gerçek veri kullanılır.

## 3. Mevcut koddan hedefe eşleme

| Bugünkü dosya (origin/main) | Hedef | Gate |
|---|---|---|
| `components/LivepeerWatch.tsx` (`purchase`, hata eşleme) | `features/checkout/useTicketCheckout.ts` + saf durum makinesi; `components/screening/*` | G2, G9 |
| `components/MultiAssetPaymentPanel.tsx` | `features/checkout/useConversionCheckout.ts`; `components/screening/ConversionPanel.tsx` | G2, G9 |
| `components/LivepeerPaidUploadForm.tsx` | `features/upload/useUploadJob.ts` + görünüm modeli; `app/studio/new` sihirbazı | G3, G15 |
| `components/LivepeerPlayer*.tsx`, `LivepeerSeekPreview.tsx` | İç mantık aynı; yalnız token/renk; salon kabuğu `components/salon/*` | G10 |
| `components/Navbar.tsx`, `PublicTestnetBetaBanner.tsx` | `components/shell/*` (üst bar, hesap menüsü, testnet şeridi, mobil sekme çubuğu, alt bilgi) | G6 |
| `components/discover/DiscoverView.tsx`, `VideoCard.tsx` | `components/discover/*`, `components/media/Poster.tsx`; veri kancaları (`useAllVideos`, `useCurrentCatalog`) aynen kullanılır | G8 |
| `app/profile/page.tsx` | `app/studio/*`, `app/tickets/page.tsx` | G13, G14 |
| `components/landing/*` | `app/creators/page.tsx`; `roi.ts` yeniden kullanılır | G16 |
| `ScreenState.tsx`, `RuntimeClosed.tsx`, `PageShell.tsx` | `components/states/*`, yeni kabuk | G6 |
| `components/ui/*` | Sahne token'larıyla yeniden yazılan temel bileşenler | G5 |
| `lib/player-copy.ts`, `components/landing/landing-copy.ts`, satır içi İngilizce metinler | `lib/i18n/*` sözlükler | G4 |

## 4. Gate'ler

Her seferinde yalnız bir gate aktiftir; gate bitince raporlanır ve durulur (AGENTS.md).
"Değişebilir" listesi dışındaki her dosya o gate için yasaktır. Varsayılan yasaklar her gate'te
geçerlidir: kontratlar, Bridge, protocol, flag varsayılanları, env/secret, provider/canlı veri,
commit/push/PR/CI/deploy (açık onay olmadan). Web doğrulama komutları `docs/testing.md` içindendir;
hedefli testler `npx vitest run <dosya>` ile koşulur.

Boyut sütunu yalnız dokunulan yüzeyin göreli büyüklüğüdür; süre tahmini değildir.

### Faz 0 — Başlangıç

#### G0 · `YOUTICK_SAHNE_UI_PLAN` — bu belge
Durum: tamamlandı. Değişen tek dosya bu belgedir.

#### G1 · `SAHNE_BASELINE` (Küçük)
Durum: tamamlandı; sonuç §8'de.
- **Amaç:** Güncel `origin/main` üzerinden ayrı bir çalışma dalı açmak ve başlangıç kanıtını kaydetmek.
- **Onay:** dal oluşturma ve checkout.
- **Değişebilir:** yalnız bu belgeye eklenecek baseline notu.
- **Kabul:** `npm test -- --run`, `npm run lint`, `npm run build` (apps/web) sonuçları; metne bağlı
  testlerin listesi çıkarılır: `active-ui-copy`, `landing`, `livepeer-watch`, `navbar`, `routes`,
  `public-video-discover`, `catalog-refresh`, `current-catalog`, `useAllVideos`,
  `livepeer-upload-status`, `wallet-provider`, `player-controls`, `next-config`.
- **Kanıt:** LOCAL_TEST.

### Faz 1 — Görünmez temel (davranış ve görünüm değişmez)

#### G2 · `SAHNE_HEADLESS_CHECKOUT` (Orta)
Durum: tamamlandı; sonuç §9'da. Uygulamada ilk kabul maddesi `youtick-payment-flow` skill'i gereği
düzeltildi: yeni bir ödeme durum makinesi kurulmadı; ödeme durumu `ActivePaymentCheckout.state`
olarak kaldı. Arayüz, erişim görünümünü (`ticketAccessView`) ve gerçek çağrı noktalarındaki
adım işaretlerini (`TicketPurchaseStep`) kullanır.
- **Amaç:** Bilet satın alma ve dönüşüm orkestrasyonunu arayüzden ayırmak.
- **Değişebilir:** `components/LivepeerWatch.tsx`, `components/MultiAssetPaymentPanel.tsx`,
  yeni `features/checkout/*`, yeni `__tests__/unit/ticket-checkout.test.ts`,
  `__tests__/unit/conversion-checkout.test.ts`.
- **Kabul:**
  - Saf durum makinesi şu durumları taşır: `idle`, `connecting`, `ready`,
    `awaiting_signature`, `issuing`, `owned`, `device_required`, `error(kod, güvence)`.
  - Mevcut `purchase` sırası birebir korunur: fiyat yeniden okunur, dönüştürülmüş checkout
    uzlaştırılır, `buyLivepeerTicket` çağrılır, `waitForLivepeerEntitlement` 1+2+4+8 sn bekler,
    iade kurtarması yapılır.
  - `purchaseErrorMessage` ve `paymentErrorMessage` kodlarının hepsi test edilir.
  - Mevcut `livepeer-watch.test.ts` ve `multi-asset-payments.test.ts` değişmeden geçer.
  - Arayüz çıktısı değişmez.
- **Skill:** `youtick-payment-flow`.
- **Kanıt:** LOCAL_TEST.

#### G3 · `SAHNE_HEADLESS_UPLOAD` (Büyük)
Durum: tamamlandı; sonuç §10'da.
- **Amaç:** Yükleme akışını arayüzden ayırmak ve sihirbazın ihtiyaç duyduğu görünüm modelini üretmek.
- **Değişebilir:** `components/LivepeerPaidUploadForm.tsx`, yeni `features/upload/*`,
  yeni `__tests__/unit/upload-job.test.ts`.
- **Kabul:**
  - `preparePayment`, `start`, `transfer`, `resume`, `cancel` ve yayın yoklaması kancaya taşınır.
  - Görünüm modeli şunları verir: adım indeksi, `UploadStage`, gönderilen/toplam bayt, hız ve
    kalan süre. Hız ve kalan süre `onProgress` zaman damgalarından hesaplanır; yeni ağ çağrısı yok.
  - `transitionUploadStage`, taslak şeması `youtick.livepeer-ui-draft.v2` ve compact yükleme yolu
    değişmez.
  - `livepeer-upload*.test.ts`, `compact-upload.test.ts` ve `livepeer-upload-state.test.ts` geçer.
  - Arayüz çıktısı değişmez.
- **Skill:** compact yükleme yoluna dokunulursa `youtick-near-auth`; dokunulmazsa gerekmez.
- **Kanıt:** LOCAL_TEST.

#### G4 · `SAHNE_I18N` (Orta)
- **Amaç:** Tek bir dil altyapısı kurmak ve tüm uygulama ekranlarını TR/EN yapmak.
- **Değişebilir:** `app/layout.tsx`, `lib/i18n/*` (yeni), `lib/player-copy.ts`,
  `components/landing/landing-copy.ts`, metin içeren mevcut bileşenler (yalnız metin taşıma),
  `__tests__/unit/landing.test.ts`, `active-ui-copy.test.ts`, yeni `i18n.test.ts`.
- **Kabul:**
  - Tipli sözlükler kullanılır. Dil seçimi çerez → `Accept-Language` → `en` sırasıyla çözülür.
    (Uygulanan: `localStorage` tercihi → `Accept-Language` → `en`; bkz. §11.)
  - `<html lang>` sunucuda seçilen dile göre yazılır.
  - Eski oynatıcı dil anahtarı `youtick:player-language` bir kez okunup taşınır.
  - Her iki dilde anahtar eksiksizliği test edilir.
  - V1 onaylı landing/koşullar ifadeleri korunur.
  - Yeni paket eklenmez.
- **Kanıt:** LOCAL_TEST.

### Faz 2 — Görsel sistem ve kabuk

#### G5 · `SAHNE_TOKENS_PRIMITIVES` (Orta)
- **Amaç:** Sahne token'larını ve temel bileşenleri kurmak.
- **Değişebilir:** `app/globals.css`, `app/layout.tsx`, `components/ui/*`, yeni `components/media/*`,
  silinecek `tailwind.config.js` (Tailwind v4'te etkisiz), yeni `__tests__/unit/tokens.test.ts`,
  `poster.test.ts`.
- **Kabul:**
  - Archivo `next/font/google` ile `axes: ['wdth']` kullanılarak yüklenir. Font değişkeni `<html>`
    üzerine konur; bugünkü "Geist yüklenip uygulanmıyor" hatası kapanır.
  - CSP'de `font-src 'self'` yeterli kalır.
  - Button, Chip, Field, Panel, Steps, StatusLine, Dialog, Poster ve CoverImage bileşenleri yazılır.
  - Poster seçimi deterministiktir.
  - Metin/zemin çiftlerinin kontrast oranı testle sabitlenir.
  - Kullanılmayan `chart-*` ve `sidebar-*` token'ları ile ikinci yeşil/kırmızı kaynakları kalkar.
- **Doğrulama:** `npm test -- --run`, `npm run lint`, `npm run build`; yerel tarayıcıda
  390 px ve 1440 px görsel kontrol.
- **Kanıt:** LOCAL_TEST.

#### G6 · `SAHNE_SHELL` (Orta)
- **Amaç:** Tek uygulama kabuğunu ve sistem durum ekranlarını kurmak.
- **Değişebilir:** `components/shell/*` (yeni), `components/states/*` (yeni), `app/layout.tsx`,
  `components/Navbar.tsx`, `PublicTestnetBetaBanner.tsx`, `RuntimeClosed.tsx`, `ScreenState.tsx`,
  `PageShell.tsx`, `__tests__/unit/navbar.test.ts`, `wallet-provider.test.ts` (yalnız metin/seçici).
- **Kabul:**
  - Üst bar: Keşfet / Biletlerim / Stüdyo, dil ve hesap menüsü.
  - Hesap menüsü bakiye, cihaz durumu, "Hesabı değiştir" (yalnız `publicTestnetVideoV1`) ve
    "Bağlantıyı kes" içerir.
  - Testnet şeridi tek satırdır; sınırlar bir açılır panelde gösterilir. Değerler mevcut
    bayraklara bağlı kalır.
  - Mobilde sekme çubuğu vardır.
  - Durum ekranları: RuntimeClosed, boş, hata, bulunamadı, depolama kapalı.
  - Cüzdan bağlama davranışı (`WalletProvider`) değişmez.
- **Kanıt:** LOCAL_TEST.

### Faz 3 — İzleyici

#### G7 · `SAHNE_ROUTES` (Orta)
- **Amaç:** Yeni adresleri ve yönlendirmeleri kurmak; ekranlar henüz mevcut bileşenleri gösterir.
- **Değişebilir:**
  - `next.config.ts` (yönlendirmeler)
  - `app/page.tsx`, `app/s/[id]/*`, `app/c/[account]/*`, `app/tickets/*`, `app/studio/*`,
    `app/creators/*`
  - `app/watch/*`, `app/upload/*`, `app/profile/*`, `app/discover/*`, `app/tr/*`
  - `app/sitemap.ts`, `app/robots.ts`
  - `__tests__/unit/routes.test.ts`, `next-config.test.ts`, `csp-proxy.test.ts`
- **Kabul:**
  - `/watch?job=X` → `/s/X` eşlemesi `has` sorgu koşuluyla yapılır.
  - `/upload?job=X` ile yarım iş bağlantıları kırılmaz.
  - `/s/[id]` için `generateMetadata` başlık ve kapak üretir; kısa zaman aşımı ve genel yedekle
    çalışır.
  - Runtime kapalıyken yeni sayfalar mevcut kapı davranışını korur.
  - Middleware/CSP davranışı değişmez.
  - Next 16 API'leri için önce `node_modules/next/dist/docs` okunur (`apps/web/AGENTS.md`).
- **Kanıt:** LOCAL_TEST.

#### G8 · `SAHNE_DISCOVER` (Orta)
- **Amaç:** Keşif ekranı.
- **Değişebilir:** `components/discover/*`, `components/VideoCard.tsx`, `app/page.tsx`,
  `__tests__/unit/public-video-discover.test.ts`, yeni `discover-view.test.ts`.
- **Kabul:**
  - Öne çıkan alan, yüklü verideki en yeni 4 yayın arasında döner. Azaltılmış harekette ve
    odakta dönme durur.
  - Program ızgarası, sıralama (yüklü sayfalarda istemci tarafında) ve başlık/yapımcı araması
    (yüklü sayfalarda) vardır.
  - "Biletlerin" rafı G12/G13 verisi yoksa gizlenir.
  - `useCurrentCatalog` uyarı (`stale`) ve hata durumları ile `useAllVideos` yedeği aynen desteklenir.
  - `catalog-refresh`, `current-catalog`, `useAllVideos` ve `near-read-budget` testleri geçer;
    yeni okuma bütçesi eklenmez.
- **Kanıt:** LOCAL_TEST.

#### G9 · `SAHNE_SCREENING_GISE` (Büyük)
- **Amaç:** Gösterim sayfası ve gişe barı.
- **Değişebilir:** `app/s/[id]/*`, `components/screening/*`, `components/LivepeerWatch.tsx`
  (kaldırma/taşıma), `components/MultiAssetPaymentPanel.tsx` (kaldırma/taşıma),
  `__tests__/unit/livepeer-watch.test.ts`, yeni `screening-gise.test.ts`.
- **Kabul:**
  - Bar durumları G2 makinesine bağlanır: misafir, bağlı, onay, kesiliyor, sahip, hata.
  - Bakiye `readPaymentPreflight` ile tek çağrıda okunur.
  - "Başka varlıkla öde" paneli yalnız `multiAssetPaymentsEnabled` iken ve istenince açılır.
    Teklif alanları mevcut `QuoteDetails` ile aynıdır.
  - Bilet kapsamı bölümü V1 metin kurallarına uyar.
  - Aynı yapımcının diğer gösterimleri mevcut yapımcı kataloğundan gelir.
- **Skill:** `youtick-payment-flow`.
- **Kanıt:** LOCAL_TEST. Gerçek ödeme ancak ayrı onaylı PREVIEW kabulünde.

#### G10 · `SAHNE_SALON` (Orta)
- **Amaç:** Aynı adreste açılan salon.
- **Değişebilir:** `components/salon/*`, `app/s/[id]/*`, `components/LivepeerPlayer.tsx`
  (yalnız kabuk ve metin bağlama), `LivepeerPlayerControls.tsx`, `LivepeerPlayerSurface.tsx` ve
  `LivepeerSeekPreview.tsx` (yalnız token/renk sınıfları), `__tests__/unit/player-controls.test.ts`.
- **Kabul:**
  - Oynatıcı yalnız bilet sahibine dinamik olarak yüklenir.
  - "Işıkları aç" ile çıkılır.
  - Kaldığın yer önerisi mevcut `watch-progress` kaydından gelir.
  - Cihaz kaydı diyaloğu `activatePlaybackDevice` kullanır. "Bu cihaz" durumu
    `get_playback_device` ile okunur.
  - Hata metinleri mevcut kod eşlemesinden gelir.
  - Oynatma, token ve önizleme mantığı değişmez.
- **Doğrulama:** web testleri, `npm run test:livepeer-canary`,
  `node scripts/player-browser-check.mjs`, `node scripts/player-device-browser-check.mjs`,
  `node scripts/device-session-browser-check.mjs` (yerel, mock).
- **Kanıt:** LOCAL_TEST. Safari/fiziksel cihaz kabulü ayrıdır.

#### G11 · `SAHNE_CREATOR_PAGE` (Küçük)
- **Amaç:** Yapımcı sayfası `/c/[hesap]`.
- **Değişebilir:** `app/c/[account]/*`, `components/creator/*`, yeni test.
- **Kabul:**
  - Veri mevcut yapımcı kataloğundan gelir (güncel katalog v2 ya da v1).
  - Implicit hesaplar kısaltılarak gösterilir.
  - Paylaşım bağlantısı vardır.
  - Olmayan veri (biyografi, avatar) uydurulmaz.
- **Kanıt:** LOCAL_TEST.

### Faz 4 — Hesap ve üretici

#### G12 · `SAHNE_READ_MODEL_ACCOUNT_API` (Orta)
- **Amaç:** Biletlerim ve Stüdyo için salt-okunur uçlar.
- **Değişebilir:** `read-model/api.mjs`, gerekirse yeni `read-model/d1/00NN_*.sql` (yalnız indeks),
  `scripts/market-read-api.test.mjs`, `read-model/README.md`, `apps/web/lib/market-read-model.ts`
  (istemci ayrıştırıcı ve doğrulayıcı).
- **Kabul:**
  - `GET /v1/accounts/{id}/tickets` (`viewer_entitlements`).
  - `GET /v1/creators/{id}/sales` (`sale_ledger`, yayın başına toplam).
  - `GET /v1/creators/{id}/withdrawals` (`withdrawal_history`).
  - Yanıtlar watermark/freshness taşır; sınırlı ve sayfalıdır; mevcut CORS ve hata kalıplarına uyar.
  - İstemci şemayı sıkı doğrular.
  - Yeni istemci kullanımı `NEXT_PUBLIC_ENABLE_ACCOUNT_READ_MODEL=false` bayrağının arkasındadır.
- **Doğrulama:** `docs/testing.md` read-model komutları ve `scripts/current-catalog.test.mjs`.
- **Onay:** D1 migration uygulaması ve Worker deploy'u ayrı onaylı release gate'idir.
- **Kanıt:** LOCAL_TEST.
- **Açık karar K2:** Bu tablolar geçmiş olay taramasından beslenir ve güncel katalogdan farklı
  olarak gecikebilir. Öneri: liste gezinme amaçlı kalır; yeni alınan bilet bu cihazda iyimser
  olarak eklenir, izleme yetkisi her açılışta NEAR'dan doğrulanır, "son güncelleme" gösterilir.

#### G13 · `SAHNE_TICKETS` (Orta)
- **Amaç:** Biletlerim ve Cihazlar.
- **Değişebilir:** `app/tickets/*`, `components/tickets/*`, yeni test.
- **Kabul:**
  - "İzlemeye devam" bu cihazın `watch-progress` kaydından gelir.
  - Bilet durumları `availability` alanından türetilir: izlenebilir, satış durdu (izlenebilir),
    kaldırıldı (izlenemez).
  - Cihaz bölümü yalnız "bu cihazı" gösterir. Diğer yuvalar K3 kapanmadan gösterilmez.
  - G12 bayrağı kapalıyken sayfa bilgilendirici boş durum gösterir.
- **Kanıt:** LOCAL_TEST.

#### G14 · `SAHNE_STUDIO` (Orta)
- **Amaç:** Stüdyo genel bakış, gösterimler, kazanç ve çekimler.
- **Değişebilir:** `app/studio/*` (sihirbaz hariç), `components/studio/*`, `app/profile/*`
  (yönlendirmeye indirgeme), yeni testler.
- **Kabul:**
  - Çekilebilir bakiye `readCreatorBalance` ile okunur ve kanonik olarak etiketlenir.
  - Çekim, tutar/alıcı/ağ ücreti özeti gösteren onay diyaloğundan geçer (`withdrawCreatorBalance`).
  - Gösterim listesi güncel katalog yapımcı görünümünden gelir.
  - Satış ve kazanç sütunları yalnız G12 verisi varken görünür.
  - Yarım yükleme şeridi `readRememberedLivepeerUploadJob` ve `readLivepeerUploadProgress` ile
    çalışır.
- **Kanıt:** LOCAL_TEST.

#### G15 · `SAHNE_STUDIO_WIZARD` (Büyük)
- **Amaç:** Yeni gösterim sihirbazı `/studio/new`.
- **Değişebilir:** `app/studio/new/*`, `components/studio/wizard/*`,
  `components/LivepeerPaidUploadForm.tsx` (kaldırma/taşıma), `livepeer-upload-status.test.ts`,
  yeni sihirbaz testleri.
- **Kabul:**
  - Adımlar: Dosya, Detaylar, Ücret ve ödeme, Yükleme, Yayın. G3 görünüm modeline bağlanır.
  - İşleme zaman çizelgesi `providerState` değerlerine eşlenir: `PROCESSING`, `READY_VERIFIED`,
    `FINALIZE_*`, `ONCHAIN_PUBLISHED`.
  - Ücret dökümü mevcut hesapla gösterilir: GB başına 0,30 USDC, en az 0,50 USDC, varsa sponsor ücreti.
  - Devam etme (aynı dosya), iptal (yalnız `authorized`), durum bağlantısı ve yayında paylaşım vardır.
  - Başlık doğrulaması `hasTitleContent` ile yapılır.
- **Kanıt:** LOCAL_TEST. Gerçek yükleme ancak ayrı onaylı PREVIEW kabulünde.

#### G16 · `SAHNE_CREATORS_PAGE` (Küçük)
- **Amaç:** Üreticiler için sayfası `/creators`.
- **Değişebilir:** `app/creators/*`, `app/page.tsx`, `app/tr/*`, `components/landing/*`,
  `__tests__/unit/landing.test.ts`.
- **Kabul:**
  - V1 onaylı TR/EN metinler aynen korunur.
  - Hesaplayıcı `roi.ts` ile %95/%5 oranını verir; örnek: 12 × 800 → 9.120 / 480.
  - Runtime kapalıyken `/` bu sayfayı gösterir.
  - SEO dil alternatifleri korunur.
- **Kanıt:** LOCAL_TEST.

### Faz 5 — Kalite ve yayın

#### G17 · `SAHNE_A11Y_MOBILE` (Orta)
- **Amaç:** Erişilebilirlik ve mobil düzen.
- **Değişebilir:** önceki gate'lerde yazılan UI dosyaları (yalnız düzeltme), testler.
- **Kabul:**
  - Tüm akışlar klavyeyle tamamlanabilir. Odak halkası görünürdür.
  - Diyaloglar odağı tutar ve Escape ile kapanır.
  - `prefers-reduced-motion` desteklenir.
  - 390 px'te yatay kaydırma yoktur. Dokunma hedefleri ≥ 44 px'tir.
  - Kontrast testi geçer.
- **Kanıt:** LOCAL_TEST (yerel tarayıcı).

#### G18 · `SAHNE_CLEANUP` (Küçük)
- **Amaç:** Ölü kodu ve belgeleri temizlemek.
- **Değişebilir:** kullanılmayan eski bileşenler, `apps/web/README.md`, `CHANGELOG.md`,
  `docs/architecture/current-state.md`, `active-ui-copy.test.ts` dosya listesi.
- **Kabul:** Kullanılmayan bileşen ve token kalmaz; yeni aktif UI dosyaları yasaklı terim testinde
  bulunur; docs build geçer.
- **Kanıt:** LOCAL_TEST.

#### G19 · `SAHNE_PREVIEW_RELEASE` (Orta)
- **Amaç:** Kontrollü yayın.
- **Onay:** her adım ayrı açık onay ister: commit/PR, CI, korumalı workflow ile Preview,
  read-model migration/deploy, Production.
- **Kabul:**
  - Preview'da cüzdanla uçtan uca akış doğrulanır: bilet al, cihaz kaydet, izle, yükle, yayınla,
    çek.
  - Kurtarma ve hata durumları doğrulanır.
  - Kanıtlar sınıflarıyla ayrı raporlanır.
- **Kanıt:** CI, PREVIEW; ardından ayrı kararla PRODUCTION.

## 5. Bağımlılıklar

```text
G1 → G2 ┐
G1 → G3 ├→ G5 → G6 → G7 → G8 → G9 → G10 → G11
G1 → G4 ┘                    G12 → G13, G14
G3 + G7 → G15 · G7 → G16 · hepsi → G17 → G18 → G19
```

G2, G3 ve G4 birbirinden bağımsızdır, ama kural gereği sırayla ve tek tek yürür.
G12 yalnız read-model tarafındadır; G8'den sonra herhangi bir noktada açılabilir.

## 6. Açık kararlar

| No | Karar | Öneri | Sahibi |
|---|---|---|---|
| K1 | Yayın zamanı: V1 pilotundan önce mi, sonra mı? | Pilot sırasında arayüz değiştirilmez. G1–G18 ayrı dalda ilerler, yayın pilot GO/bitiş kararına göre planlanır | Owner |
| K2 | Biletlerim ve Stüdyo satış verisinin gecikmesi | Bkz. G12 önerisi | Owner |
| K3 | Diğer cihazların süresini listelemek | İlk sürümde yalnız "bu cihaz". Gerekirse salt-okunur `get_playback_devices` görünümü ayrı kontrat gate'inde | Owner |
| K4 | Açıklama, süre, kategori, özel kapak | Bu programın dışında; protokol/kontrat ve Bridge değişikliği gerektirir | Owner |
| K5 | Sunucu tarafı arama ve fiyat sıralaması | İlk sürüm yüklü sayfalarda istemci tarafında; 48 yayın pilot tavanında yeterli. Büyümede read-model parametresi | Ana ajan önerir, owner onaylar |
| K6 | Gizlilik bildirimi | Yeni arayüz kişisel veri toplamayı artırmaz. Dil çerezi ve yerel tercihler gizlilik metnindeki envantere eklenir | Owner |

## 7. Bu gate'in sonucu

- **Değişen dosya:** yalnız bu belge.
- **Doğrulama:** docs build (yerel).
- **Çalıştırılmayanlar:** web testleri (kod değişmedi), CI, Preview/Production, provider/zincir.
- **Engel:** yok. Yerel `main`'in `origin/main`'in gerisinde olması G1'de giderilir.

## 8. G1 başlangıç kaydı — 30 Eylül 2026

**Sonuç: PASS.** Kullanıcı G1'i ve bu planın commit edilmesini onayladı.

- **Dal:** `agent/sahne-ui`, `origin/main` `54797a0` üzerinden `--no-track` ile açıldı.
  Fetch sonrası `origin/main` değişmedi. Yerel `main` değiştirilmedi.
- **Ortam:** Node v24.19.0 (`.nvmrc` 24). CI web job'unun ortam değişkenleri kullanıldı:
  `NEAR_NETWORK=testnet`, örnek `market.testnet` / `access.testnet`, ürün flag'leri `false`,
  `MULTI_ASSET_PAYMENTS_MODE=off`.
- **Bağımlılıklar:** `npm ci` çalıştırılmadı. `apps/web/package-lock.json` iki sürüm arasında
  aynı olduğundan mevcut `node_modules` kullanıldı.

| Komut (`apps/web`) | Sonuç | Kanıt |
|---|---|---|
| `npm run test:wallet-provenance` | PASS (meteor-wallet pinned executor OK) | LOCAL_TEST |
| `npm run lint` | PASS | LOCAL_TEST |
| `npm test -- --run` | PASS: 36 dosya, 510 test | LOCAL_TEST |
| `npm run test:livepeer-canary` | PASS: 7/7 | LOCAL_TEST |
| `npm run test:multi-creator-upload-canary` | PASS: 24 test, 3 atlandı | LOCAL_TEST |
| `npm run build` | PASS: 15 statik sayfa; rotalar `/`, `/discover`, `/privacy`, `/profile`, `/terms`, `/tr`, `/upload`, `/watch`, `/api/near-rpc*` | LOCAL_TEST |

- **Bilinen uyarılar:** Vite CommonJS config uyarısı zaten vardı; bu gate'te değişiklik yapılmadı.
- **Çalıştırılmayanlar:** `npm ci`; tarayıcı kontrol betikleri; Bridge, read-model ve kontrat
  testleri (bu gate'te kod değişmedi); CI ve Preview.
- **Metne bağlı testler (G2+ için):** §4 G1'deki liste. Yeni aktif UI dosyaları
  `active-ui-copy.test.ts` listesine eklenecek.
- **Tek sonraki gate:** G2 `SAHNE_HEADLESS_CHECKOUT`. Başlamak için açık onay bekler.

## 9. G2 kaydı — 30 Eylül 2026

**Sonuç: PASS.** Kullanıcı G2'yi onayladı. Commit bu gate'te yapılmadı; ayrı onay bekler.

### Yapılan

- `features/checkout/ticket-checkout.ts` (saf):
  - `purchaseLivepeerTicket`: satın alma sırası birebir korunur; bağımlılıklar test için enjekte edilebilir.
  - `waitForLivepeerEntitlement`: 1+2+4+8 sn bekleme.
  - İade kurtarması.
  - `purchaseErrorMessage`.
  - `ticketAccessView`: `playable`, `checking`, `access_error`, `locked`.
  - `canStartTicketPurchase`.
  - `TicketPurchaseStep`: `verifying_price`, `reconciling_conversion`, `wallet_approval`, `waiting_entitlement`.
- `features/checkout/useTicketCheckout.ts`: yayın ve hak sorguları, meşgul/hata/adım durumu.
  Sorgu anahtarları ve seçenekleri aynı.
- `features/checkout/conversion-checkout.ts` (saf):
  - Amaç kimliği ve eşleşme kontrolü.
  - Tutar doğrulaması, yavaş rota eşiği, tutar biçimlendirme.
  - Durum etiketleri ve durum grupları.
  - Hata metinleri.
  - `waitForPreflight`: 1+2+4 sn.
- `features/checkout/useConversionCheckout.ts`: panelin tüm durumu, iki efekti ve dört aksiyonu.
  Efekt bağımlılıkları aynı.
- `components/LivepeerWatch.tsx` ve `components/MultiAssetPaymentPanel.tsx` yalnız görüntüleme yapar.
  Panelin props arayüzü değişmedi; yükleme formu etkilenmedi.
- `active-ui-copy.test.ts` listesine taşınan metin dosyaları eklendi.

### Doğrulama

Hepsi LOCAL_TEST; ortam G1 ile aynı (CI web job ortam değişkenleri).

| Kontrol | Sonuç |
|---|---|
| Yeni `ticket-checkout.test.ts` ve `conversion-checkout.test.ts` | PASS: normal satın alma, satış kapalı (3 durum), fiyat değişimi, 1+2+4+8 sn bekleme, başka yayının checkout'u, `usdc_final` → `core_pending` → `complete`, yetersiz dönüşüm, iade kurtarması, çözülmemiş bekleme, cüzdan hatasında geri alma, `core_pending` tamamlama/iade/bekleme, erişim görünümü tablosu, bütün hata metinleri, `waitForPreflight` |
| Değiştirilmemiş `livepeer-watch.test.ts` ve `multi-asset-payments.test.ts` | PASS |
| Geçici eski/yeni HTML karşılaştırması | PASS: 17 senaryoda birebir aynı çıktı (15 `LivepeerWatch` durumu, 2 panel durumu). Geçici dosyalar silindi |
| `npm run lint`, `npx tsc --noEmit --incremental false` | PASS |
| `npm test -- --run` | PASS: 38 dosya, 584 test (G1: 36 / 510) |
| `test:livepeer-canary`, `test:multi-creator-upload-canary` | PASS: 7/7; 24 test, 3 atlandı |
| `npm run build` | PASS |

### Bulgu

Silinmiş (TAKEDOWN) bir gösterimin bilet sahibi, "yayın kullanılamıyor" yerine sonu gelmeyen
"erişim doğrulanıyor" görünümünü görüyor. Mevcut davranış bu; G2 davranış değiştirmediği için
düzeltilmedi ve testte açıkça kayıtlı. G9'da gişe barı tasarlanırken düzeltilmeli.

### Çalıştırılmayanlar ve sonraki gate

- **Çalıştırılmayanlar:** tarayıcı kontrol betikleri (oynatıcı ve cihaz kodu değişmedi);
  gerçek cüzdan veya ödeme; CI; Preview.
- **Tek sonraki gate:** G3 `SAHNE_HEADLESS_UPLOAD`. G2 commit'i ve G3 başlangıcı ayrı açık onay bekler.

G2, kullanıcı onayıyla `2a2d6bd` olarak commit edildi.

## 10. G3 kaydı — 30 Eylül 2026

**Sonuç: PASS.** Kullanıcı G3'ü onayladı. Commit bu gate'te yapılmadı; ayrı onay bekler.

### Yapılan

- `features/upload/upload-job.ts` (saf):
  - Adım etiketleri ve `UploadStage` tablosu; adım durumları (`uploadStepStates`).
  - `getLivepeerPublicationView`.
  - Yükleme checkout eşleşmesi (`findMatchingUploadCheckout`).
  - Yüzde kuralı, kayan 10 sn pencereli hız ve kalan süre (`recordTransferSample`, `transferStats`).
  - Biçimlendiriciler, kaynak boyut sınırı, dosya ve yükleme hata metinleri.
- `features/upload/useUploadJob.ts`: formun tüm durumu, dört efekti, yayın yoklaması ve
  `selectFile`, `preparePayment`, `start`, `transfer`, `resume`, `cancel` aksiyonları.
  - `React.useState` çağrı sırası korunur, çünkü mevcut test buna dayanır. Tek yeni durum
    (hız örnekleri) en sonda.
  - Hız örnekleri mevcut `onProgress` geri çağrısından alınır; yeni ağ çağrısı yok.
- `components/LivepeerPaidUploadForm.tsx` yalnız görüntüleme yapar. `LivepeerUploadStatus`
  bu dosyada kalır. `getLivepeerPublicationView` ve `uploadErrorMessage` buradan yeniden
  dışa aktarılır.
- Değişmeyenler: `transitionUploadStage`, taslak şeması, compact yükleme yolu ve `lib/*`.

### Doğrulama

Hepsi LOCAL_TEST; ortam G1 ile aynı.

| Kontrol | Sonuç |
|---|---|
| Yeni `upload-job.test.ts` | PASS: 10 aşama × 6 hata adımında orijinal adım göstergesiyle eşitlik, checkout eşleşmesi (8 durum), yüzde, hız/kalan süre ve devam edilen yüklemede pencerenin sıfırlanması, biçimlendiriciler, bayrağa bağlı boyut sınırı ve hata metinleri |
| Değiştirilmemiş yükleme testleri (`livepeer-upload-status`, `livepeer-upload`, `livepeer-upload-state`, `compact-upload`) | PASS |
| Geçici eski/yeni HTML karşılaştırması | PASS: 16 senaryoda birebir aynı (boş form, cüzdansız, geçersiz dosya, hazır, ön kontrol, ödeme seçenekleri, sponsor teklifi, ödeme hatası, iptal, yükleme %42, devam, işleme, doğrulama hatası, yayında, süresi dolmuş, izlenen iş). Senaryoların birbirinden farklı ekran ürettiği ayrıca doğrulandı. Geçici dosyalar silindi |
| `npm run lint`, `npx tsc --noEmit --incremental false`, `test:wallet-provenance` | PASS |
| `npm test -- --run` | PASS: 39 dosya, 679 test (G2: 38 / 584) |
| `test:livepeer-canary`, `test:multi-creator-upload-canary` | PASS: 7/7; 24 test, 3 atlandı |
| `npm run build` | PASS |

### Çalıştırılmayanlar ve sonraki gate

- **Çalıştırılmayanlar:** tarayıcıda gerçek dosya ile TUS yüklemesi; cüzdan; CI; Preview.
  Hız ve kalan süre değerleri henüz arayüzde gösterilmiyor; G15'te kullanılacak.
- **Tek sonraki gate:** G4 `SAHNE_I18N`. G3 commit'i ve G4 başlangıcı ayrı açık onay bekler.

## 11. G4 kaydı — 30 Eylül 2026

**Sonuç: COMPLETED_WITH_WARNINGS.** Kullanıcı G4'ü onayladı. Commit bu gate'te yapılmadı; ayrı
onay bekler. Uyarılar aşağıdaki "Plandan sapmalar" ve "Bulgular" bölümlerindedir.

### Yapılan

- `lib/i18n/locale.ts`: `Locale = 'en' | 'tr'`, q-ağırlıklı `resolveLocale(Accept-Language)`,
  `localStorage` tercihi (`youtick:locale`), eski `youtick:player-language` anahtarının okunup
  ilk seçimde silinmesi, `youtick:locale-changed` olayı.
- `lib/i18n/messages.ts`: tipli `en` sözlüğü; `tr: Messages` aynı şekli zorunlu kılar.
- `lib/i18n/I18nProvider.tsx`: sunucunun seçtiği dil başlangıç değeridir; istemcide kayıtlı
  tercih `useSyncExternalStore` ile okunur ve `<html lang>` güncellenir.
- `app/layout.tsx`: `<html lang>` sunucuda `Accept-Language`'a göre yazılır. CSP nonce satırları
  değişmedi.
- Metinleri sözlüğe taşınan ekranlar: Navbar, test ağı bandı, RuntimeClosed, hata ve global
  hata sayfaları, Keşif, izleme sayfası ve `LivepeerWatch`, çoklu varlık ödeme paneli, yükleme
  formu ve kayıtlı yükleme kartı, profil, cüzdan hata mesajları, katalog "eski veri" uyarısı.
- G2/G3 yardımcıları (`purchaseErrorMessage`, `checkoutStateLabel`, `paymentErrorMessage`,
  `fileValidationMessage`, `uploadErrorMessage`, yayın görünümü) isteğe bağlı `locale` alır;
  varsayılan `en` olduğu için mevcut çağıranlar değişmedi.
- `lib/player-copy.ts` ortak dil tercihini kullanır; oynatıcı metinleri aynı kaldı.
- Değişmeyenler: landing ve `/tr` sayfası (kendi onaylı metinleri var), koşullar/gizlilik,
  flag varsayılanları, ödeme ve yükleme akış mantığı. Yeni paket yok.

### Plandan sapmalar

- **Dil çerezi yok.** Sıra: kayıtlı tercih (`localStorage`) → `Accept-Language` → `en`.
  Gizlilik metni şu an yalnız yerel tercihleri listeliyor; çerez K6 kararı ve gizlilik metni
  güncellemesi gerektirir. Bedeli: kayıtlı tercih tarayıcı diliyle farklıysa ilk yüklemede
  kısa bir dil geçişi görülür.
- `landing-copy.ts` ve `landing.test.ts` değişmedi; landing zaten iki dilli.
- `navbar.test.ts` listede yoktu; Navbar artık sözlük kancası kullandığı için teste sözlük
  mock'u eklendi. `active-ui-copy.test.ts` bant metinlerini `messages.ts` içinde, banttaki
  anahtar kullanımını bileşende arar.

### Bulgular

- Bant, `closed_at_ms` varken "Closed remaining" benzeri eski bir kenar durumu üretiyor;
  birebir eşitlik için korundu, G6'da ele alınmalı.
- Dil değiştirildiğinde zaten gösterilen bir hata metni eski dilde kalır (metin hata anında
  üretiliyor). Yeni hata yeni dilde gelir.
- TAKEDOWN yayında sahibi için sonsuz "checking" (G2 bulgusu) sürüyor; G9'da düzeltilecek.

### Doğrulama

Hepsi LOCAL_TEST; ortam G1 ile aynı.

| Kontrol | Sonuç |
|---|---|
| Yeni `i18n.test.ts` | PASS (20): iki dilde anahtar/şekil eşitliği, boş metin yok, her cümle çevrilmiş, değişkenler iki dilde de var, `resolveLocale` (9 durum), eski anahtarın taşınması, `tr` sağlayıcıyla sunucu çıktısı, yardımcıların `tr`/varsayılan `en` davranışı |
| Geçici eski/yeni İngilizce HTML ve metin karşılaştırması | PASS: 85 test. Kabuk ve sayfalar 33 (Navbar 5, bant 7, RuntimeClosed/hata sayfaları, Keşif 8, izleme sayfası 2, profil 10), izleme ve ödeme paneli 30 (10 izleme durumu, 8 checkout durumu dahil 20 panel durumu), yükleme formu 19, yardımcı mesajlar 3 (eski kaynaklardaki tüm hata kodları × iki bayrak, tüm yayın görünümleri). Kancalardan ve cüzdan sağlayıcısından çıkarılan 24 İngilizce metnin sözlükte birebir bulunduğu ayrıca kontrol edildi. Geçici dosyalar silindi |
| `npm run lint`, `npx tsc --noEmit --incremental false`, `test:wallet-provenance` | PASS |
| `npm test -- --run` | PASS: 40 dosya, 699 test (G3: 39 / 679) |
| `test:livepeer-canary`, `test:multi-creator-upload-canary` | PASS: 0 hata; 24 test, 3 atlandı |
| `npm run build`, docs build | PASS |

### Çalıştırılmayanlar ve sonraki gate

- **Çalıştırılmayanlar:** tarayıcıda gerçek dil değişimi ve Türkçe ekranların görsel kontrolü
  (dil seçici G6'da gelecek); cüzdan; CI; Preview.
- **Tek sonraki gate:** G5 `SAHNE_TOKENS_PRIMITIVES`. G4 commit'i ve G5 başlangıcı ayrı açık
  onay bekler.
