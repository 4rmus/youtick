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
| K7 | Hesap görünümleri API'si (G12) | Kod hazır ama `READ_MODEL_ACCOUNT_VIEWS_ENABLED` ile kapalı. README'deki "satışlar herkese açık API'de sunulmaz" kararını değiştirir; herhangi bir hesabın bilet listesi ve herhangi bir yapımcının satış toplamları sorgulanabilir hâle gelir (veri zincirde zaten herkese açık). Açmadan önce owner kararı | Owner |
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

## 12. G5 kaydı — 30 Eylül 2026

**Sonuç: COMPLETED_WITH_WARNINGS.** Kullanıcı G4 commit'ini (`1200709`) ve G5'i onayladı.
G5 commit'i ayrı onay bekler.

### Yapılan

- `app/globals.css` tek renk kaynağıdır: Sahne token'ları (`ink`, `panel`, `raised`, `line`,
  `line-strong`, `edge`, `light`, `light-2`, `light-3`, `ice`, `ice-deep`, `alert`,
  `alert-deep`, `poster-dark`). shadcn anlamsal adları bu token'lara bağlandı. `chart-*`,
  `sidebar-*`, `oklch` değerleri, `:root` altındaki ikinci `--near-*` kopyası ve genel yeşil
  kaydırıcı kuralı kaldırıldı. Yazı yardımcıları: `font-display` (dar 800, büyük harf),
  `font-logo` (geniş 800), `label-caps`, `tabular`.
- `tailwind.config.js` silindi (Tailwind v4'te etkisizdi).
- `app/layout.tsx`: Archivo `next/font/google` ile `axes: ['wdth']`, `latin` + `latin-ext`
  alt kümeleriyle yüklenir; değişken `<html>` üzerindedir. Geist kaldırıldı. CSP'ye
  dokunulmadı; font `font-src 'self'` altında kendi sunucumuzdan gelir.
- `components/ui`: Button, Input, Card ve Alert Sahne'ye geçti (2 px köşe, ≥ 44 px hedef,
  buz rengi odak halkası, beyaz zemin/siyah metin birincil düğme). Yeni: Chip, Field,
  Panel, Steps, StatusLine, Dialog (yerel `<dialog>`).
- `components/media`: `posterTone` (FNV-1a, deterministik), Poster, CoverImage (kapak yoksa
  veya yüklenemezse afiş).

### Plandan sapmalar

- **Form kenarı için yeni `edge` token'ı (#6B6B6E).** Tasarımdaki #3A3A3D, ink/panel üzerinde
  1,6–1,75:1 veriyor ve WCAG 1.4.11'in (3:1) altında. `edge` ink, panel ve raised üzerinde
  ≥ 3,2:1. #3A3A3D dekoratif ayraçlarda kalır.
- **Köşe için Tailwind'in yerleşik `rounded-xs` (2 px) değeri kullanıldı.** Özel bir radius
  adını `tailwind-merge` tanımıyor, çağıranın `rounded-*` sınıfıyla çakışma riski doğuyordu.
- **`--color-near-*` kaldırılmadı, tek kopyaya indirildi.** Landing, Navbar, ScreenState,
  profil, global hata ve oynatıcı kontrolleri bu adları kullanıyor ve G5 kapsamı dışında.
  Kaldırılırsa odak halkaları sessizce kaybolur. Son kullanan ekran taşınınca silinir.
  `Button` içindeki `near` varyantı birincil düğme olarak çizilir.
- **"İlk kare karanlıksa afiş" uygulanmadı.** Kapaklar Bridge'den (başka köken) geliyor;
  piksel okumak CORS başlığı gerektirir. Bridge değişikliği bu programın sınırı dışındadır
  (UNPROVEN). Şimdilik yalnız "kapak yok / yüklenemedi" durumunda afiş gösterilir.
- Kontrast değerleri hesaplandığında `light-2`/ink 11,92:1 çıktı (tasarım notunda 11,8).

### Görsel etki (bilinçli)

Mevcut ekranlar artık Archivo ile çiziliyor. Paylaşılan Button/Input/Card/Alert yeni
biçimde. Ekranların düzeni G6–G16'da yenilenecek. `rounded-md`/`rounded-lg` kullanan eski
ekranlarda köşe 1–2 px küçüldü, çünkü eski `--radius-*` türetmeleri kaldırıldı.

### Doğrulama

| Kontrol | Sonuç | Sınıf |
|---|---|---|
| Yeni `tokens.test.ts` | PASS (24): 15 metin/zemin çiftinin kontrast oranı sabit ve ≥ 4,5:1, form kenarı ≥ 3:1, tek renk kaynağı, Archivo/`wdth`/`<html>`, CSP font kuralı, düğme hedefi/köşe/odak, Chip, Field bağlantıları, Steps `aria-current`, StatusLine rolleri | LOCAL_TEST |
| Yeni `poster.test.ts` | PASS (5): deterministik ton, sabit FNV-1a değerleri, iki tonun da kullanılması, afiş ve kapak/afiş seçimi | LOCAL_TEST |
| `npm run lint`, `npx tsc --noEmit --incremental false`, `test:wallet-provenance` | PASS | LOCAL_TEST |
| `npm test -- --run` | PASS: 42 dosya, 728 test (G4: 40 / 699) | LOCAL_TEST |
| `test:livepeer-canary`, `test:multi-creator-upload-canary` | PASS: 7/7; 24 test, 3 atlandı | LOCAL_TEST |
| `npm run build`, docs build | PASS | LOCAL_TEST |
| Yerel `next start`, 1440 ve 390 px | Archivo yüklü (`font-stretch` 62%, 800), köşe 2 px, form kenarı `rgb(107,107,110)`, 390 px'te yatay taşma yok, en küçük düğme 48 px. Bileşenler geçici galeri olarak sayfaya enjekte edildi; galeri dosyası silindi. Landing ve Koşullar sayfası bozulmadı | LOCAL_STATIC |

### Çalıştırılmayanlar ve sonraki gate

- **Çalıştırılmayanlar:** Dialog'un tarayıcıda açılıp kapanması ve odak davranışı (henüz
  kullanan ekran yok; G6'da hesap menüsüyle doğrulanacak); ekran okuyucu; CI; Preview.
- **Tek sonraki gate:** G6 `SAHNE_SHELL`. G5 commit'i ve G6 başlangıcı ayrı açık onay bekler.

## 13. G6 kaydı — 30 Eylül 2026

**Sonuç: COMPLETED_WITH_WARNINGS.** Kullanıcı G5 commit'ini (`768c2b2`) ve G6'yı onayladı.
G6 commit'i ayrı onay bekler.

### Yapılan

- `components/shell/nav.ts`: tek gezinme listesi (Keşfet, Biletlerim, Stüdyo). Adresi olmayan
  öğe gösterilmez. Etkin öğe `aria-current="page"` alır.
- `components/Navbar.tsx`: uygulama üst barı (YOUTICK logosu, masaüstü gezinme, dil düğmesi,
  hesap menüsü). Ziyaretçi landing başlığı aynen korundu.
- `components/shell/AccountMenu.tsx`: hesap, bakiye (USDC + NEAR; yalnız menü açıkken okunur),
  bu cihazın güvenli depolama durumu, dil, "Kazanç ve yayınlar", Koşullar/Gizlilik, "Hesabı
  değiştir" (yalnız `publicTestnetVideoV1`) ve "Bağlantıyı kes". Masaüstünde açılır panel
  (Escape ve dışarı tıklama kapatır); mobilde aynı içerik `Dialog` içinde.
- `components/shell/account-balance.ts`: menü için küçük bakiye okuması. Yükleme istemcisi
  (`tus-js-client`) kabuğa girmesin diye `readCreatorFeeBalances` kullanılmadı.
- `components/shell/MobileTabBar.tsx`: mobil sekme çubuğu (Keşfet, Stüdyo, Hesap) ve içerik
  için alt boşluk.
- `components/shell/LanguageToggle.tsx`: üst bardaki TR/EN düğmesi (G4 tercihini yazar).
- `components/states/*`: `StateScreen` ile boş, yükleme hatası, bulunamadı ve depolama kapalı
  ekranları. `RuntimeClosed` yeni ekrana geçti ve "Bu ortamda hiçbir ödeme alınmaz" satırını
  aldı. `ScreenState` Sahne token'larına geçti (API aynı).
- Test ağı şeridi Sahne görünümüne geçti. "closed remaining" hatası düzeltildi: süre dolunca
  yalnız "closed" yazar.
- `WalletProvider` değişmedi.

### Plandan sapmalar

- **Test ağı sınırları açılır panele alınmadı.** Mevcut `public-video-discover.test.ts` ve
  `active-ui-copy.test.ts`, herkese açık testnet sınırlarının her sayfada görünmesini şart
  koşuyor. Bu V1 koruması zayıflatılmadı. Şerit iki kısa satırdır: etiket ve uyarı, altında
  sınırlar. Owner, sınırların panelde olmasını istiyorsa önce bu koşulun değişmesi gerekir.
- **Biletlerim gezinmede görünmüyor**, çünkü `/tickets` adresi yok (G7). **Stüdyo** şimdilik
  `/upload`'a gider; `/profile` da Stüdyo altında sayılır ve hesap menüsünde "Kazanç ve
  yayınlar" olarak durur. G7'de `nav.ts` içindeki iki adres güncellenir.
- **Hesap düğmesinde bakiye gösterilmiyor** (tasarımda vardı). Her sayfa açılışında RPC okuması
  yapmamak için bakiye yalnız menü açılınca okunur.
- **Cihaz durumu** bu cihazın güvenli depolama/şifreleme desteğidir; oturumun kalan süresi
  G13 (Cihazlar) kapsamındadır.
- **Bulunamadı ekranı** bileşen olarak hazır; `app/not-found.tsx` rotası G7'de bağlanır.
- G6 listesinde olmayan iki dosya değişti: `lib/i18n/messages.ts` (G4'ten beri tüm arayüz
  metni burada) ve `active-ui-copy.test.ts` (yeni aktif UI dosyaları listeye eklendi, §2.3).

### Doğrulama

| Kontrol | Sonuç | Sınıf |
|---|---|---|
| `navbar.test.ts` (yeniden yazıldı) | PASS (17): yalnız var olan adresler ve `aria-current`, iç içe yollar, landing/uygulama ayrımı, bağlı değilken "Connect", mobil sekme çubuğu, hesap değiştir/bağlantıyı kes ayrımı (bayrak açık/kapalı), menüden dil değişimi, bakiye durumları, cüzdansız menü, şerit (sınırlar görünür, süre bitince "closed"), durum ekranlarının rolleri | LOCAL_TEST |
| `npm test -- --run` | PASS: 42 dosya, 742 test | LOCAL_TEST |
| lint, tsc, wallet-provenance, iki canary, build | PASS | LOCAL_TEST |
| Yerel `next start`, 1440 ve 390 px | Üst bar ve RuntimeClosed doğru; 390 px'te yatay taşma yok, sekmeler 56 px. Hesap diyaloğu modal açılıyor, odak "Menüyü kapat"a geçiyor, Escape kapatıp odağı "Hesap"a döndürüyor. Dil üst bardan ve menüden iki yönde değişiyor, `<html lang>` güncelleniyor | LOCAL_STATIC |

### Çalıştırılmayanlar ve sonraki gate

- **Çalıştırılmayanlar:** bağlı cüzdanla masaüstü hesap menüsü ve gerçek bakiye okuması
  (yerelde cüzdan yok); testnet bayrakları açıkken şeridin tarayıcı görünümü (yalnız sunucu
  çıktısı test edildi); ekran okuyucu; CI; Preview.
- **Tek sonraki gate:** G7 `SAHNE_ROUTES`. G6 commit'i ve G7 başlangıcı ayrı açık onay bekler.

## 14. G7 kaydı — 30 Eylül 2026

**Sonuç: COMPLETED_WITH_WARNINGS.** Kullanıcı G6 commit'ini (`b0de8ec`) ve G7'yi onayladı.
G7 commit'i ayrı onay bekler.

### Yapılan

- `next.config.ts` kalıcı (308) yönlendirmeler:
  - `/watch?job=X` → `/s/X`, yalnız `job` geçerli yayın kimliği ise (`has` sorgu koşulu,
    `[A-Za-z0-9._:-]{1,128}`); geçersiz ya da eksik `job` mevcut `/watch` ekranında kalır.
  - `/discover` → `/`, `/upload` → `/studio/new`, `/profile` → `/studio`.
  - Next sorgu dizesini taşır: `/upload?job=X` → `/studio/new?job=X`, yarım iş bağlantısı
    korunur. `/watch?job=X` hedefi `?job=X` ekini de taşır; zararsızdır.
- `/`: runtime açıkken (`enablePaidMediaLivepeerV1 || enableDerivedReadModel`) Keşif, kapalıyken
  tanıtım. Meta veri de buna göre seçilir. `app/discover/*` silindi.
- `/creators`: tanıtım sayfası (mevcut `LandingPage`), `canonical: '/creators'`.
- `/s/[id]`: `LivepeerWatch`; geçersiz kimlik 404, runtime kapalıyken `RuntimeClosed`.
  `generateMetadata` başlık, "yapımcı · fiyat" açıklaması ve Bridge kapağını üretir. Okuma,
  tarayıcının kullandığı `handleNearRpcRequest` üzerinden süreç içinde yapılır (izin listesi,
  istek sahibinin IP'sine bağlı hız sınırı, devre kesici), 1,5 sn zaman aşımı vardır; her
  hatada genel meta veriye düşer.
- `/studio`: mevcut profil ekranı (`app/profile/page.tsx` yeniden dışa aktarılır; dosya
  `catalog-refresh.test.ts` tarafından içe aktarıldığı için yerinde kaldı). `/studio/new`:
  yükleme ekranı (`app/upload/page.tsx` taşındı).
- `app/not-found.tsx`: G6 "Bulunamadı" ekranı; dönüş `/`.
- `sitemap.ts`: `''`, `/tr`, `/creators`, `/privacy`, `/terms`.
- Kabuk: Keşfet `/`, Stüdyo `/studio`; `/creators`, `/tr` ve runtime kapalıyken `/` tanıtım
  başlığını kullanır.
- Middleware/CSP değişmedi; `robots.ts` değişmedi.

### Plandan sapmalar

- **`/tickets` ve `/c/[account]` oluşturulmadı.** Bunları gösterecek mevcut bileşen yok; boş
  sayfa açmak yerine G13 ve G11'e bırakıldı. Biletlerim gezinmede gizli kalır.
- **`/tr` tanıtım olarak kaldı.** "Dil tercihine taşıma" middleware değişikliği gerektirir;
  G7 kabulü middleware'i değiştirmeyi yasaklıyor. G16'da ele alınmalı.
- **İç bağlantılar hâlâ eski adreslerde** (`VideoCard` → `/watch?job=`, `LivepeerWatch` →
  `/discover`, yükleme formu → `/upload?job=`, landing CTA'ları). Yönlendirmeler sayesinde
  çalışıyorlar ama bir ek istek maliyeti var. Dosyalar G8, G9, G15, G16 kapsamında güncellenir.
- G7 listesi dışında değişen dosyalar: `components/shell/nav.ts`, `components/Navbar.tsx`
  (yeni adresler ve tanıtım yolu), `navbar.test.ts` (yeni adresler), yeni
  `screening-metadata.test.ts`.

### Riskler

- `/s/[id]` meta veri okuması her sayfa açılışında ve bağlantı önizlemesinde bir RPC okumasıdır.
  Okuma, market sözleşmesi hesabı için paylaşılan hız sınırı anahtarına da sayılır. Yerelde
  Cloudflare hız sınırlayıcısı olmadığı için proxy `503` döner ve her zaman genel meta veri
  gösterilir; gerçek okuma Preview'da doğrulanmalıdır (UNPROVEN).
- 308 yönlendirmeleri tarayıcılarda kalıcı önbelleğe alınır; geri alma zordur.

### Doğrulama

| Kontrol | Sonuç | Sınıf |
|---|---|---|
| `next-config.test.ts` | PASS: dört yönlendirme, `job` desenin geçerli/geçersiz örnekleri, statik CSP yok | LOCAL_TEST |
| `routes.test.ts` | PASS: yeni dosyalar var, `app/discover` ve `app/upload` yok, `/s/[id]` kimlik deseni ve runtime kapısı, bayrak koşulları | LOCAL_TEST |
| `screening-metadata.test.ts` (yeni) | PASS (7): başlık/açıklama/kapak/canonical, salt-okunur sorgu ve istek sahibinin IP'si, yayın yok / 429 / geçersiz yayın / bozuk yanıt / zaman aşımında genel meta veri | LOCAL_TEST |
| `npm test -- --run` | PASS: 43 dosya, 752 test | LOCAL_TEST |
| lint, tsc, wallet-provenance, iki canary, build | PASS | LOCAL_TEST |
| Yerel `next start` (runtime kapalı) | `/watch?job=job-001` → 308 `/s/job-001?job=job-001`; `/watch?job=../x` ve `/watch` → 200; `/discover` → `/`; `/upload?job=job-9` → `/studio/new?job=job-9`; `/profile` → `/studio`; `/s/job-001` 200 (RuntimeClosed); `/s/bad%20id` ve `/nope` → 404 (Sahne ekranı); sayfa yanıtlarında CSP başlığı var; başlıklar "Studio \| YouTick", "Publish Your Work \| YouTick", "Screening \| YouTick" | LOCAL_STATIC |

### Çalıştırılmayanlar ve sonraki gate

- **Çalıştırılmayanlar:** runtime açıkken `/` Keşif ve `/s/[id]` gerçek meta veri okuması;
  OpenNext/Cloudflare üzerinde yönlendirmeler; CI; Preview.
- **Tek sonraki gate:** G8 `SAHNE_DISCOVER`. G7 commit'i ve G8 başlangıcı ayrı açık onay bekler.

## 15. G8 kaydı — 30 Eylül 2026

**Sonuç: COMPLETED_WITH_WARNINGS.** Kullanıcı G7 commit'ini (`93dad42`) ve G8'i onayladı.
G8 commit'i ayrı onay bekler.

### Yapılan

- `components/discover/discover-model.ts` (saf): öne çıkanlar (yüklü verideki satışı açık en
  yeni 4 yayın), en yeni / artan fiyat sıralaması (girdi değişmez, eşitlikte en yeni),
  büyük-küçük harf, aksan ve Türkçe i/ı duyarsız başlık/yapımcı araması, dönme kararı,
  UTC sabit tarih biçimi (sunucu/istemci farkı olmaz).
- `FeaturedStage`: dev başlık, yapımcı · tarih, "Bilet al — X USDC" ve "Ayrıntılar"
  (`/s/[id]`), 4 seçici (`aria-pressed`). 7 sn'de bir döner; azaltılmış harekette, odak veya
  imleç alandayken ve sekme gizliyken durur. Kapak yoksa sahne koyu kalır.
- `ProgramSection`: "Program" ve yüklü sayı, arama (yalnız yüklü sayfalar, bunu söyleyen
  ipucuyla), sıralama düğmeleri, 1/2/3/4 sütunlu ızgara, eşleşme yoksa temizleme düğmesi.
- `DiscoverView`: tek `h1` (ekran okuyucu için), `useCurrentCatalog`/`useAllVideos` seçimi
  aynen; `stale` uyarısı, veri varken/yokken hata, boş, boş sayfa ve "Daha fazla" durumları
  G6 durum bileşenleriyle. Altta "Üreticiler için" bölümü.
- `VideoCard`: `CoverImage` (kapak yoksa afiş), durum etiketi (Satış durdu / Yayında değil),
  bağlantı `/s/[id]` (bir yönlendirme adımı azaldı). Ücretli medya kapalıyken bağlantı yok.

### Plandan sapmalar

- **"Biletlerin" rafı çizilmiyor**; G12/G13 verisi yok (kabul kriteri gereği).
- **Öne çıkan alanda satışı açık yayınlar kullanılır**; durdurulmuş veya kaldırılmış yayın
  "Bilet al" düğmesiyle öne çıkarılmaz.
- `lib/i18n/messages.ts` G8 listesinde değildi; yeni metinler eklendi, kullanılmayan
  `discover.eyebrow` ve `discover.description` kaldırıldı.
- Kart üzerindeki afiş başlığı, kartın altındaki başlıkla aynı metni tekrar eder (tasarımdaki
  gibi); afiş `aria-hidden` olduğu için ekran okuyucu bir kez okur.

### Doğrulama

| Kontrol | Sonuç | Sınıf |
|---|---|---|
| Yeni `discover-view.test.ts` | PASS (20): öne çıkan seçimi, iki sıralama ve girdinin değişmemesi, Türkçe i dahil arama, 5 dönme koşulu, iki dilde UTC tarih, sahne + program + `/s/` bağlantıları, ücretli medya kapalıyken bağlantısızlık, 7 katalog durumu, seçici sayısı, kaldırılmış yayın etiketi | LOCAL_TEST |
| `public-video-discover.test.ts` | PASS; kart bağlantısı artık `/s/new-video` | LOCAL_TEST |
| `catalog-refresh`, `current-catalog`, `useAllVideos`, `near-read-budget` | PASS, değiştirilmedi; yeni okuma yok | LOCAL_TEST |
| `npm test -- --run` | PASS: 44 dosya, 772 test | LOCAL_TEST |
| lint, tsc, wallet-provenance, iki canary, build | PASS | LOCAL_TEST |
| Yerel tarayıcı, 1440 ve 390 px | Sahte verili sunucu çıktısı sayfaya enjekte edildi (Türkçe, 6 yayın, biri durdurulmuş): sahne, seçiciler, program, arama/sıralama, afişli kartlar ve etiket doğru; 390 px'te taşma yok, en küçük hedef 44 px. Geçici dosyalar silindi | LOCAL_STATIC |

### Çalıştırılmayanlar ve sonraki gate

- **Çalıştırılmayanlar:** gerçek katalogla ve kapaklarla tarayıcı görünümü (runtime yerelde
  kapalı; canlı testnet okuması yapılmadı); dönmenin tarayıcıda zamanlanması ve odakta
  durması (mantık birim testli); ekran okuyucu; CI; Preview.
- **Tek sonraki gate:** G9 `SAHNE_SCREENING_GISE`. G8 commit'i ve G9 başlangıcı ayrı açık onay
  bekler.

## 16. G9 kaydı — 30 Eylül 2026

**Sonuç: COMPLETED_WITH_WARNINGS.** Kullanıcı G8 commit'ini (`c101a8d`) ve G9'u onayladı.
G9 commit'i ayrı onay bekler. `youtick-payment-flow` skill'i okundu; ödeme mantığı değişmedi.

### Yapılan

- `components/screening/gise-model.ts` (saf): `gisePhase` G2 kancasının gerçek değerlerinden
  (`ticketAccessView`, `busy`, `TicketPurchaseStep`, hata) türetilir; yeni checkout makinesi
  yoktur, ödeme durumu `ActivePaymentCheckout.state` olarak kalır. Aşamalar: misafir, hazır,
  onay (`verifying_price`, `reconciling_conversion`, `wallet_approval`), kesiliyor
  (`waiting_entitlement`), sahip, hata, kontrol, erişim hatası, satış kapalı. Dört adım
  (Cüzdan · Ödeme · Bilet · İzle) bu aşamadan çizilir.
- `GiseBar`: yapışkan bar (mobilde sekme çubuğunun üstünde). Fiyat, adımlar, tek durum cümlesi,
  sonraki eylem. Bakiye yalnız "hazır" aşamasında `readPaymentPreflight` ile tek çağrıda okunur
  (USDC ve NEAR ağ ücreti yeterliliği); yalnız bilgi verir, düğmeyi engellemez.
- **Güvenli yeniden deneme:** `livepeer_entitlement_pending` hatasında yeni ödeme düğmesi yok,
  yalnız "Bilet durumunu kontrol et" var. Diğer hatalarda "Yeniden dene" önce bilet hakkını
  yeniden okur, yalnız hâlâ `false` ise satın almayı başlatır.
- "Başka varlıkla öde": yalnız `multiAssetPaymentsEnabled` iken ve istenince açılır; teklif
  alanları mevcut `MultiAssetPaymentPanel`/`QuoteDetails` ile aynıdır. Bu gösterim için
  bitmemiş bir dönüşüm varsa panel kendiliğinden açık kalır ve kapatılamaz (yeni ödemeden önce
  uzlaştırma). Erişim durumu bilinmiyorken (kontrol / okuma hatası) hiçbir ödeme yüzeyi yoktur.
- `ScreeningView`: sahne (kapak veya sahipse oynatıcı), başlık, yapımcı · yayın tarihi,
  "Bilet neleri kapsar" (Koşullar metnindeki ifadelerle: hesaba bağlı; satış durunca izleme
  sürer, kaldırılınca kapanır; 30 günlük cihaz yetkisi bilet süresi değildir; sağlayıcı
  kesintisi izlemeyi engelleyebilir), aynı yapımcının diğer gösterimleri.
- "Aynı yapımcıdan": mevcut yapımcı kataloğu (`currentCatalogQueryOptions(creator)` veya
  `readMarketCreatorPublicationPage`), ziyaret başına bir okuma, yoklama yok; iki kaynak da
  kapalıysa veya okuma başarısızsa gizli.
- `LivepeerWatch.tsx` yalnız `ScreeningView`'i eski adla dışa aktarır (`/watch` ve testler için).
  `/s/[id]` doğrudan `ScreeningView` kullanır.

### Plandan sapmalar ve kullanılmayan tasarım ifadeleri

- Tasarımdaki doğrulanamayan ifadeler kullanılmadı: "genelde 15 sn içinde", bilet kodu
  (`#YT-…`), "3 cihaz / dördüncüsü en eskinin yerini alır" (kodda sınır bulunamadı),
  "11,40 yapımcıya · 0,60 platforma", her hatada "Ödeme gönderilmedi". Hata metinleri mevcut
  `purchaseErrorMessage` eşlemesinden gelir.
- Sahip olunca oynatıcı yine sayfada açılır; "Salona gir" ve ışıkların kararması G10'dadır.
- `MultiAssetPaymentPanel` yeniden stillenmedi (mantığı ve alanları aynı); G17'de ele alınabilir.
- `lib/i18n/messages.ts` G9 listesinde değildi; `watch` bölümüne yeni metinler eklendi.

### Doğrulama

| Kontrol | Sonuç | Sınıf |
|---|---|---|
| Yeni `screening-gise.test.ts` | PASS (31): 14 aşama eşlemesi, adım işaretleri, iki dilde "bekleyen bilet" algısı, misafir bağlanma, bakiye tek ön kontrol ve yetersiz USDC/NEAR, çalışırken düğmenin kilitli olması ve ön kontrolün kapanması, bekleyen bilette yalnız yeniden kontrol, yeniden denemenin önce bilet hakkını okuması (sahipse ödeme yok), sahip ve satış kapalı durumları, başka varlık düğmesinin koşulları, kapsam metninde yasak ifade olmaması | LOCAL_TEST |
| `livepeer-watch.test.ts` (uyarlandı) | PASS (8): erişim belirsizken ödeme yüzeyi ve satın alma yok, bilet sorgusu yayın yüklenirken başlar, gönderilmiş dönüşüm cüzdan çağrısı olmadan tamamlanır, iade edilen ödeme bakiye doğrulamasından sonra yeniden açılır, eski anahtar notu bayrağa bağlı | LOCAL_TEST |
| `ticket-checkout`, `conversion-checkout`, `multi-asset-payments` testleri | PASS, değiştirilmedi | LOCAL_TEST |
| `npm test -- --run` | PASS: 45 dosya, 803 test | LOCAL_TEST |
| lint, tsc, wallet-provenance, iki canary, build | PASS | LOCAL_TEST |
| Yerel tarayıcı, 1440 ve 390 px | Sahte verili "hazır" ve "kesiliyor" durumları sayfaya enjekte edildi: bar, adımlar, bakiye cümlesi, başka varlık bağlantısı ve kilitli düğme doğru; mobilde bar sekme çubuğunun üstünde, taşma yok. Geçici dosyalar silindi | LOCAL_STATIC |

### Çalıştırılmayanlar ve sonraki gate

- **Çalıştırılmayanlar:** gerçek cüzdanla satın alma, gerçek `readPaymentPreflight` okuması,
  1Click dönüşümü, CI, Preview. Gerçek ödeme ancak ayrı onaylı PREVIEW kabulünde yapılır.
- **Tek sonraki gate:** G10 `SAHNE_SALON`. G9 commit'i ve G10 başlangıcı ayrı açık onay bekler.

## 17. G10 kaydı — 30 Eylül 2026

**Sonuç: COMPLETED_WITH_WARNINGS.** Kullanıcı G9 commit'ini (`7bc6122`) ve G10'u onayladı.
G10 commit'i ayrı onay bekler.

### Yapılan

- `components/salon/SalonView.tsx`: "Işıklar kararır" — aynı adreste tam ekran yerel modal
  `<dialog>` (arka plan etkisiz, odak içeride, Escape kapatır, kapanınca odak açan düğmeye
  döner; açılışta 400 ms saydamlık geçişi, azaltılmış harekette yok). "Işıkları aç" çıkar.
- Oynatıcı yalnız bilet sahibi salona girince `next/dynamic` (`ssr: false`) ile yüklenir;
  gösterim sayfası, gişe barı ve cihaz diyaloğu `LivepeerPlayer`'ı statik içe aktarmaz.
- `components/salon/useDeviceStatus.ts`: "Bu cihaz" durumu `getDeviceSession` üzerinden
  `get_playback_device` ile okunur (yalnız sahip ve genel testnet yetkilendiricisi açıkken).
- `components/salon/DeviceDialog.tsx`: cihaz kaydı gerekiyorsa salondan önce açılır; tek açık
  cüzdan işlemi `activatePlaybackDevice` ile yapılır. Metin ve düğmeler mevcut oynatıcı
  metinlerinden (`activationInfo`, `activate`, `checkAgain`); hata metinleri mevcut eşlemeden.
- `components/salon/playback-errors.ts`: `playbackErrorMessage` ve `isDeviceSessionError`
  oynatıcıdan aynen taşındı; oynatıcı artık buradan içe aktarır (diyalog oynatıcı paketini
  yüklemesin diye).
- Kaldığın yer önerisi değişmedi: `LivepeerPlayerSurface` mevcut `watch-progress` kaydını
  kullanmaya devam eder.
- Oynatıcı dosyalarında yalnız renk/köşe sınıfları Sahne token'larına geçti (`near-green` →
  `ice`, köşe 2 px, koyu paneller `panel`/`raised`). Oynatma, token ve önizleme mantığı aynı.

### Plandan sapmalar

- G10 listesinde olmayan değişiklikler: `components/screening/ScreeningView.tsx` (sahip için
  "Salona gir", cihaz durumu, salon ve diyalog bağlantısı; sayfadaki satır içi oynatıcı
  kaldırıldı), `GiseBar.tsx` (sahip aşamasında "Salona gir"), `lib/i18n/messages.ts` (salon
  metinleri), yeni `salon.test.ts`.
- **G9 kaydına düzeltme:** mevcut onaylı oynatıcı metni (`activationInfo`) "en fazla 3 cihaz
  aktiftir; dördüncüsü en eskinin yerini alır" der. G9'da bu bilgi "kodda bulunamadı" diye
  kapsam bölümüne alınmamıştı; sınır web kodunda değil, oynatıcı metninde ve (muhtemelen)
  pazar sözleşmesinde yer alır. Kapsam bölümüne eklenmesi owner/koşullar kararıdır.
- Tarayıcı kontrol betikleri G10 listesinde değildir ve kendi Tailwind temalarında yalnız
  `near-green` derler; token sınıflarının renkleri betik sayfasında görünmez, davranış
  kontrolleri etkilenmez (üçü de PASS).

### Doğrulama

| Kontrol | Sonuç | Sınıf |
|---|---|---|
| Yeni `salon.test.ts` | PASS (25): 7 giriş kararı ve bayrak birleşimi, 4 cihaz durumu eşlemesi, sahip/bayrak yokken okuma yapılmaması, cihaz etkinleştirmenin tek açık çağrıyla ve aynı oynatma girdisiyle yapılması, başarısızlıkta salona girilmemesi, iki dilde 9 hata kodu + ağ hatası eşlemesi, salon modalı ve "Işıkları aç", oynatıcının yalnız dinamik yüklenmesi | LOCAL_TEST |
| `player-controls.test.ts`, `livepeer-watch.test.ts`, `screening-gise.test.ts` | PASS | LOCAL_TEST |
| `npm test -- --run` | PASS: 46 dosya, 828 test | LOCAL_TEST |
| lint, tsc, wallet-provenance, iki canary, build | PASS | LOCAL_TEST |
| `node scripts/player-browser-check.mjs` | PASS (195 medya isteği, 4 yerel token, 9 önizleme isteği; ağ istekleri yerelde yakalandı) | LOCAL_TEST |
| `node scripts/player-device-browser-check.mjs` | PASS (5 senaryo, senaryo başına 1 cüzdan işlemi; gerçek cüzdan/zincir yok) | LOCAL_TEST |
| `node scripts/device-session-browser-check.mjs` | PASS | LOCAL_TEST |
| Yerel tarayıcı, 1440 ve 390 px | Sahte verili sahip ekranı: "Salona gir", cihaz durumu, gişe barında sahip etiketi; salon modalı tam ekran, odak "Işıkları aç"ta; cihaz diyaloğu mobilde taşmadan açılıyor. Geçici dosyalar silindi | LOCAL_STATIC |

### Çalıştırılmayanlar ve sonraki gate

- **Çalıştırılmayanlar:** gerçek cüzdanla cihaz etkinleştirme ve gerçek `get_playback_device`
  okuması; salonda gerçek oynatma (betikler yüzeyi ayrı paketle çalıştırır); Safari ve fiziksel
  cihaz; CI; Preview.
- **Tek sonraki gate:** G11 `SAHNE_CREATOR_PAGE`. G10 commit'i ve G11 başlangıcı ayrı açık onay
  bekler.

## 18. G11 kaydı — 30 Eylül 2026

**Sonuç: COMPLETED_WITH_WARNINGS.** Kullanıcı G10 commit'ini (`a50a504`) ve G11'i onayladı.
G11 commit'i ayrı onay bekler.

### Yapılan

- `app/c/[account]/page.tsx`: hesap `[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]` ile doğrulanır (bozuk
  kodlama ve geçersiz hesap 404); runtime kapalıyken `RuntimeClosed`; meta veri yalnız hesap
  adından üretilir (okuma yok), `canonical: /c/{hesap}`.
- `components/creator/useCreatorCatalog.ts`: mevcut yapımcı kataloğu — güncel katalog etkinse
  `useCurrentCatalog(hesap)` (v2), değilse `readMarketCreatorPublicationPage` sayfalaması (v1,
  12'şer, yoklama yok). İkisi de kapalıysa kaynak "yok" ve sayfa bunu söyler.
- `components/creator/CreatorView.tsx`: "Yapımcı" etiketi, hesap adı (implicit hesaplar
  `aaaaaa…beef` biçiminde kısaltılır, tam kimlik altında ve `title` içinde), yüklü gösterim
  sayısı, en yeniden eskiye kart ızgarası, "Daha fazla göster", yükleniyor/hata/boş/eski veri
  durumları. Biyografi, avatar veya takipçi gibi olmayan veri gösterilmez.
- `components/creator/ShareLink.tsx`: kanonik adresi panoya kopyalar; pano engelliyse hata
  satırı gösterir.
- `components/creator/creator-account.ts`: hesap deseni, implicit hesap (64 hex, `0x`+40 hex)
  algısı ve kısaltma.

### Plandan sapmalar ve bulgular

- `lib/i18n/messages.ts` G11 listesinde değildi; `creator` metinleri eklendi.
- **Gösterim sayfası ve kartlardaki yapımcı adı henüz `/c/…` bağlantısı değil**
  (`ScreeningView`, `VideoCard` G11 listesi dışında). G17'de veya ilgili ekran gate'inde
  bağlanmalı.
- **Bulgu:** bozuk yüzde kodlaması içeren dinamik adresler (`/c/%E0%A4%A`, `/s/%E0%A4%A`)
  Next'in parametre çözümünde sayfa koduna ulaşmadan 500 döner; statik yollarda 404 döner.
  Uygulama kodu bunu yakalayamaz; middleware değişikliği ayrı onay ister.

### Doğrulama

| Kontrol | Sonuç | Sınıf |
|---|---|---|
| Yeni `creator-page.test.ts` | PASS (18): 9 hesap doğrulama örneği, implicit kısaltma, v1 kaynağı ve sıralama, paylaşım ve "Daha fazla", uydurma profil alanı olmaması, v2 kaynağı ve eski veri uyarısı, yükleniyor/hata/boş, kaynak yokken açıklama, implicit başlık ve tam kimlik, geçersiz hesap ve bozuk kodlamada 404, kapalı runtime, meta veri | LOCAL_TEST |
| `npm test -- --run` | PASS: 47 dosya, 846 test | LOCAL_TEST |
| lint, tsc, wallet-provenance, iki canary, build | PASS | LOCAL_TEST |
| Yerel `next start` | `/c/kule.testnet` 200 "kule.testnet \| YouTick"; implicit hesap 200 "aaaaaa…beef \| YouTick"; `/c/Bad%20Account` 404; `/c/%E0%A4%A` 500 (yukarıdaki bulgu) | LOCAL_STATIC |

### Çalıştırılmayanlar ve sonraki gate

- **Çalıştırılmayanlar:** gerçek katalog verisiyle yapımcı sayfası, pano izni farklı
  tarayıcılarda, CI, Preview.
- **Tek sonraki gate:** G12 `SAHNE_READ_MODEL_ACCOUNT_API`. Read-model tarafıdır (D1 yalnız
  okuma/indeks); G11 commit'i ve G12 başlangıcı ayrı açık onay bekler.

## 19. G12 kaydı — 30 Eylül 2026

**Sonuç: COMPLETED_WITH_WARNINGS.** Kullanıcı G11 commit'ini (`b20924b`) ve G12'yi onayladı.
G12 commit'i ayrı onay bekler. D1 migration uygulaması ve Worker deploy'u yapılmadı.

### Yapılan

- `read-model/api.mjs` üç GET ucu (yalnız okuma; mevcut CORS, `cachedJson`/ETag, hata kodu
  ve rota günlüğü kalıpları):
  - `GET /v1/accounts/{id}/tickets` — `viewer_entitlements` + `publications` sol birleşimi,
    en yeniden eskiye, anahtar imleci (`block_height`, `id`). Yayın satırı yoksa `publication: null`.
  - `GET /v1/creators/{id}/sales` — `sale_ledger` yayın ve varlık başına satış sayısı, brüt,
    yapımcı ve platform toplamları, son satış bloğu; `(publication_id, asset)` imleci.
    Toplamlar tam sayı; güvenli tam sayı aralığını aşarsa 503 (hassasiyet kaybı yerine).
  - `GET /v1/creators/{id}/withdrawals` — yalnız `creator_balance_withdrawal_*` durumları
    (`platform_withdrawal_started` hariç), `started/succeeded/failed` olarak.
  - Hepsi `limit` ≤ 50, sayfalı, `watermark` ve `indexed_at_ms` (izleme son ilerleme zamanı) taşır.
- **Varsayılan kapalı:** uçlar ayrıca `READ_MODEL_ACCOUNT_VIEWS_ENABLED=true` ister; yoksa 404.
  Sebep: `read-model/README.md` "yapımcı satışları herkese açık API'de sunulmaz" diyordu. Karar
  K7 olarak owner'a bırakıldı.
- `read-model/d1/0009_account_read_indexes.sql`: yalnız `withdrawal_history_account` indeksi.
  Bilet sorgusu birincil anahtar indeksini, satış sorgusu mevcut `sale_ledger_creator`
  indeksini kullanır (sorgu planıyla doğrulandı).
- `apps/web/lib/market-read-model.ts`: `readAccountTickets`, `readCreatorSales`,
  `readCreatorWithdrawals`; `NEXT_PUBLIC_ENABLE_ACCOUNT_READ_MODEL=true` olmadan istek atmaz.
  Sıkı doğrulama: şema, sahip hesap, `indexed_at_ms`, öğe sayısı, blok yüksekliği ≤ watermark,
  yayın kimliği eşleşmesi, ondalık dize tutarlar (baştaki sıfır yok), yalnız `USDC`/`NEAR`,
  bilinen çekim durumları, `reason_code` biçimi ve `creator + platform = brüt` (sözleşmedeki
  `platform = amount / 20`, `creator = amount − platform` hesabıyla kesin).
- `read-model/README.md` güncellendi.

### Plandan sapmalar

- Web bayrağı `lib/constants.ts` yerine `lib/market-read-model.ts` içinde tanımlandı (G12
  listesinde yalnız bu dosya vardı); G13 bayrağı `FEATURE_FLAGS`'e taşıyabilir.
- Yeni test dosyası `apps/web/__tests__/unit/account-read-model.test.ts` eklendi.
- Worker değişkeni `READ_MODEL_ACCOUNT_VIEWS_ENABLED` plan dışıdır (yukarıdaki gizlilik gerekçesi).

### Doğrulama

| Kontrol | Sonuç | Sınıf |
|---|---|---|
| `scripts/market-read-api.test.mjs` | PASS (16): bilet sayfalaması, eksik yayın, tazelik; satış toplamları ve anahtar imleci; platform çekimlerinin dışlanması; girdi doğrulama (hesap, limit, imleç, varlık), POST 405, kapalı read-model 503; `EXPLAIN QUERY PLAN` ile üç indeks; taşma 503; bayrak yokken/`false`/`TRUE` iken üç uç 404 | LOCAL_TEST |
| `docs/testing.md` read-model komutu (7 dosya, `current-catalog` dahil) | PASS: 93 test | LOCAL_TEST |
| Yeni `account-read-model.test.ts` | PASS (18): bayrak kapalıyken istek yok, üç uç ayrıştırma, 7 bilet, 5 satış, 2 çekim reddi, istek öncesi doğrulama | LOCAL_TEST |
| Web: `npm test -- --run` | PASS: 48 dosya, 864 test | LOCAL_TEST |
| lint, tsc, wallet-provenance, iki canary, build | PASS | LOCAL_TEST |

### Çalıştırılmayanlar ve sonraki gate

- **Çalıştırılmayanlar:** uzak D1'e `0009` migration'ı, Worker deploy'u, gerçek D1 verisiyle
  sorgu süresi ve plan, CI, Preview. Bunlar ayrı onaylı release gate'idir (EXTERNAL_NOT_RUN).
- **Açık karar:** K7 (hesap görünümlerinin açılması) ve K2 (gecikme gösterimi).
- **Tek sonraki gate:** G13 `SAHNE_TICKETS`. G12 commit'i ve G13 başlangıcı ayrı açık onay bekler.

## 20. G13 kaydı — 30 Eylül 2026

**Sonuç: COMPLETED_WITH_WARNINGS.** Kullanıcı G12 commit'ini (`2ac9266`) ve G13'ü onayladı.
G13 commit'i ayrı onay bekler.

### Yapılan

- `app/tickets/page.tsx`: runtime kapısı (`enablePaidMediaLivepeerV1 || enableDerivedReadModel`),
  arama motorlarına kapalı (`noindex`).
- `components/tickets/TicketsView.tsx`:
  - Cüzdan yoksa ücretsiz bağlanma çağrısı.
  - `NEXT_PUBLIC_ENABLE_ACCOUNT_READ_MODEL` kapalıyken bilgilendirici durum ("liste henüz açık
    değil; aldığın gösterimi Keşfet'ten aç, erişim NEAR'dan doğrulanır").
  - Açıkken `readAccountTickets` sayfaları; "Liste … itibarıyla güncel" satırı `indexed_at_ms`'ten
    (K2 önerisi: gecikebilir, erişim açılışta NEAR'dan doğrulanır). Yükleniyor/hata/boş/daha fazla.
  - "İzlemeye devam": bu cihazın `watch-progress` kaydından, en son izlenen 3 izlenebilir bilet,
    konum/süre ve ilerleme çizgisi.
  - Bilet durumu `availability`'den: izlenebilir, satış durdu · izlenebilir, kaldırıldı ·
    izlenemez (kaldırılanlar bağlantısız). Yayın satırı yoksa kimlik ve "bilgi henüz yok".
- `components/tickets/useWatchPositions.ts`: kayıtları yalnız okur ve her birini kapatır;
  soğuk sayfada `watch-progress`'in istediği oturum revizyonu için en fazla bir
  `getDeviceSession` çağrısı yapar. Kaldırılan ve bilgisi olmayan biletler okunmaz.
- `components/tickets/ThisDevice.tsx`: yalnız bu cihaz (K3): genel testnet yetkilendiricisinde
  `useDeviceStatus` (G10), diğer durumda güvenli depolama hazırlığı. Başka cihaz/yuva yok.
- Gezinme: Biletlerim artık görünür (`/tickets`).

### Plandan sapmalar

- G13 listesinde olmayanlar: `lib/i18n/messages.ts` (`tickets` metinleri),
  `components/shell/nav.ts` (Biletlerim adresi), `navbar.test.ts` (Biletlerim artık bağlantı).
- Hesap okuma bayrağı hâlâ `lib/market-read-model.ts` içinde (G12); `FEATURE_FLAGS`'e taşınmadı.
- Tarayıcıda görsel kontrol yapılmadı (runtime ve hesap görünümleri yerelde kapalı; kabul
  kanıtı LOCAL_TEST).

### Doğrulama

| Kontrol | Sonuç | Sınıf |
|---|---|---|
| Yeni `tickets-view.test.ts` | PASS (15): üç durum eşlemesi, izlemeye devam seçimi ve sırası, misafir, bayrak kapalı bilgilendirme, liste + durum etiketleri + bağlantılar + tazelik + devam satırı (`12:34 of 1:20:00`), yükleniyor/hata/boş, yalnız bu cihazın üç durumu, konum okumanın yalnız izlenebilir biletlerde yapılıp kapatılması ve revizyon biliniyorsa oturumun yeniden okunmaması | LOCAL_TEST |
| `navbar.test.ts` | PASS | LOCAL_TEST |
| `npm test -- --run` | PASS: 49 dosya, 879 test | LOCAL_TEST |
| lint, tsc, wallet-provenance, iki canary, build | PASS | LOCAL_TEST |

### Çalıştırılmayanlar ve sonraki gate

- **Çalıştırılmayanlar:** gerçek hesap görünümü verisi (G12 uçları kapalı, K7), gerçek cihaz
  kaydı ve `watch-progress` içeriğiyle tarayıcı kontrolü, CI, Preview.
- **Tek sonraki gate:** G14 `SAHNE_STUDIO`. G13 commit'i ve G14 başlangıcı ayrı açık onay bekler.

## 21. G14 kaydı — 30 Eylül 2026

**Sonuç: COMPLETED_WITH_WARNINGS.** Kullanıcı G13 commit'ini (`4766f67`) ve G14'ü onayladı.
G14 commit'i ayrı onay bekler.

### Yapılan

- `components/studio/StudioView.tsx` (`/studio`): başlık ve "Yeni gösterim"; yarım yükleme
  şeridi; kazanç; gösterimler; çekim geçmişi.
- **Kazanç:** çekilebilir bakiye `readCreatorBalance` ile okunur ve "NEAR pazar sözleşmesinden
  okunur; çekimde gönderilecek tutar budur" diye etiketlenir. "Çek" önce onay diyaloğunu açar
  (tutar, alıcı = bağlı hesap, ağ ücretinin cüzdandan NEAR olarak ödendiği ve cüzdanda
  gösterildiği, tek işlem notu); onayda `withdrawCreatorBalance`. Cüzdan yanıtı kaybolursa
  başarısızlık varsayılmaz: bakiye her durumda yeniden okunur ve kullanıcıya kontrol etmesi
  söylenir. Sıfır bakiye çekilemez.
- **Gösterimler:** güncel katalog etkinse `useCurrentCatalog(hesap)`, değilse eski profil ekranının
  `creatorReadModel` sorgusu (5'erli, yalnız görünürken 15 sn yenileme; `catalog-refresh`
  testinin koruduğu davranış). Tablo: gösterim (`/s/…`), durum etiketi, fiyat. "Satılan bilet"
  ve "Kazancın" sütunları yalnız `FEATURE_FLAGS.enableAccountReadModel` açık ve G12 satış verisi
  geldiyse görünür; kazanç USDC satırlarından `BigInt` ile tam toplanır; tazelik satırı vardır.
- **Çekimler:** hesap görünümü açıkken `readCreatorWithdrawals` listesi (başladı/tamamlandı/başarısız).
- **Yarım yükleme şeridi:** `readRememberedLivepeerUploadJob` + `readLivepeerUploadProgress`
  (hesap eşleşmesiyle); yayınlandıysa gizli, süresi dolduysa açıklama, değilse
  `/studio/new?job=…` bağlantısı.
- `app/studio/page.tsx` artık `StudioView`'i gösterir (`noindex`); `app/profile/page.tsx`
  yalnız `app/studio/page`'in takma adıdır (adres zaten `/studio`'ya yönlenir),
  `app/profile/layout.tsx` silindi.
- `lib/constants.ts`: `FEATURE_FLAGS.enableAccountReadModel` (türetilmiş read-model açık ve
  `NEXT_PUBLIC_ENABLE_ACCOUNT_READ_MODEL=true`); varsayılan kapalı.

### Plandan sapmalar

- G14 listesinde olmayanlar: `lib/constants.ts` (bayrak), `lib/i18n/messages.ts` (`studio`
  metinleri), `constants.test.ts` (yeni bayrağın kapalı varsayılanı), `routes.test.ts` (bayrak
  koşulu denetimleri `StudioView.tsx`'e taşındı, profil takma adı).
- Biletlerim (G13) hâlâ `lib/market-read-model.ts` içindeki `accountReadModelEnabled`'i kullanır;
  iki tanım aynı ortam değişkenine bağlı. G18 temizliğinde tek kaynağa indirilmeli.
- Satış toplamları ilk 50 (yayın × varlık) satırından gelir; daha fazlası sayfalanmaz.

### Doğrulama

| Kontrol | Sonuç | Sınıf |
|---|---|---|
| Yeni `studio-view.test.ts` | PASS (13): USDC kazancının tam toplanması ve NEAR satırlarının dışlanması, çekilebilirlik, kanonik etiket + onay diyaloğu + onayda tek çekim ve bakiye yenileme, kayıp cüzdan yanıtında bakiyenin yeniden okunması, sıfır bakiye, katalog listesi ve satış sütunlarının yokluğu, güncel katalog görünümü, hesap verisiyle satış/kazanç sütunları ve çekimler, yarım yükleme şeridinin üç durumu, bağlanma, runtime kapısı, eski profil yolu | LOCAL_TEST |
| `catalog-refresh`, `routes`, `constants` testleri | PASS | LOCAL_TEST |
| `npm test -- --run` | PASS: 50 dosya, 892 test | LOCAL_TEST |
| lint, tsc, wallet-provenance, iki canary, build | PASS | LOCAL_TEST |

### Çalıştırılmayanlar ve sonraki gate

- **Çalıştırılmayanlar:** gerçek cüzdanla çekim, gerçek bakiye/satış verisi, tarayıcıda görsel
  kontrol, CI, Preview.
- **Tek sonraki gate:** G15 `SAHNE_STUDIO_WIZARD`. G14 commit'i ve G15 başlangıcı ayrı açık onay
  bekler.
