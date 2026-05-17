# YouTick — UI/UX Mimari ve Estetik Değerlendirme Raporu

**Tarih:** 2026-05-17
**Kapsam:** `apps/web` web uygulaması — tasarım token'ları, 8 UI primitifi, 8 landing bileşeni, çekirdek ürün yüzeyleri (discover, watch, upload, profile, trial, claim, mint, ticket, hata ekranı), tüm öne çıkan bileşenler ve iki navigasyon sistemi.
**Yöntem:** Statik kod incelemesi + grep ile ölü-kod/sınıf doğrulaması + headless browser smoke.
**Teknoloji:** Next.js 16, React 19, Tailwind CSS 4, shadcn/ui (new-york), lucide-react, NEAR.

**Uygulama durumu:** Bu revizyonda Faz 0 + seçili P1 hızlı kazanımları + P1.5 temizlik + küçük P3 erişilebilirlik paketi + küçük P2 tema/Dialog sertleştirmesi + onboarding/claim cilası + legal/profile cleanup + küçük P3 kapanış temizliği + ürün yüzeyi renk cleanup'ı + küçük semantik yüzey cleanup'ı + küçük avatar birleştirmesi uygulandı: rapordaki abartılı/çelişkili ifadeler düzeltildi; Geist font `next/font` ile bağlandı; `error.tsx`/`global-error.tsx` marka paletine çekildi; legal tarih tutarsızlığı kapatıldı ve legal sayfalar `zinc` paletine taşındı; `OnboardingKeyInit` uyarısı `LanguageSwitcher` ile aynı köşeden çıkarıldı ve `near-red` tokenına bağlandı; kullanılmayan eski CSS utility bloğu ve `VideoCard` `slider` varyantı kaldırıldı; `Button`/`Input`/`Textarea` focus halkası güçlendirildi; player, navbar, discover, payment selector, ROI calculator, footer linkleri, dil değiştirici ve kopyala butonlarında temel `aria-*`/focus eksikleri kapatıldı; gerçek light tema olmadığı için `ThemeProvider` koyu temaya sabitlendi; `Dialog`, `TrialUpgradeDialog`, `TrialOnboarding`, `/trial` ve `claim` başarı/claim yüzeyleri koyu/zinc/near-green çizgisine çekildi; `VideoCard`, watch başlığı, discover hata/empty/loading halleri, `UploadForm`, `TicketPurchaseCard`, `CostReceipt`, `IpfsPlayer` ve küçük profile/gift geri bildirimleri NEAR token çizgisine yaklaştırıldı; `CreatorAvatar` ile tekrar eden initials avatarları tek küçük fallback bileşeninde toplandı; profile avatarı `next/image` kullanıyor; `prefers-reduced-motion` eklendi; kalan lint uyarısı kapandı. Kalan büyük bulgular aşağıda açık iş olarak duruyor.

---

## 1. Yönetici özeti

YouTick web arayüzü sağlam bir teknik temele oturuyor (Next 16, Tailwind 4, shadcn/ui + CVA, tüm yüzeylerde tutarlı i18n). Ancak **tasarım sistemi katmanı parçalı ve kısmen ölü**. Tek bir tutarlı görsel dil yerine uygulama içinde **3-4 ayrı tasarım dili** bir arada yaşıyor; kullanıcı landing → ürün → onboarding arasında geçerken farklı ürünlere giriyormuş hissi alıyor.

Kritik tekil bulgular:

- İlk incelemede amaçlanan **Geist fontu yüklenmiyordu** — Faz 1 ile `next/font` bağlantısı eklendi.
- İlk incelemede `globals.css` içinde **~200 satır ölü CSS** vardı — P1.5 ile kaldırıldı; range input CSS'i korundu.
- `enableSystem` + gerçek light tema eksikliği ilk incelemede modallarda açık-mod yüzey riski yaratıyordu; küçük P2 paketiyle tema koyu moda sabitlendi.
- **5 nötr renk ailesi** ve marka dışı çok sayıda aksan rengi bir arada.

Bu bir kod kalitesi krizi değil; bir **tutarlılık ve marka cilası** sorunu. Public alpha + pre-seed sunumu öncesinde, özellikle landing ve kazanım (gift/trial) akışlarında doğrudan algıyı etkiler.

---

## 2. Ana bulgu: 3-4 ayrı tasarım dili

| Katman | Yüzeyler | Karakter |
|---|---|---|
| **Landing** | `/` ve 8 landing bileşeni | Monokrom editöryel — siyah zemin, **beyaz** birincil buton, zinc grileri, marka yeşili sınırlı aksan olarak kullanılıyor |
| **Ürün çekirdeği** | watch, upload, discover, profile, VideoCard, TicketPurchaseCard | Koyu + **near-green/near-purple neon**, gradient butonlar, glow blur'lar, `rounded-2xl` |
| **Onboarding akışı** | TrialOnboarding, claim/trial yüzeyleri | Ana guest/gift akışı artık koyu + zinc + near-green çizgisine yakın; kalan risk daha çok sayfa kabuğu/CTA hiyerarşisi ve canlı görsel doğrulama |
| **Legal (mikro-varyant)** | privacy, terms | `gray-*` dünyasından `zinc-*` paletine taşındı; hâlâ metin ağırlıklı, izole legal içerik sayfası |

Bu durum **sürüklenme (drift)** gibi görünüyor, niyet değil:

- `globals.css`'te tam bir "concert + cinematic vibe" katmanı (glassmorphism, neon glow) tanımlı ama hiç kullanılmıyor → önce neon bir yön başlatılıp sonra üzerine monokrom landing yazılmış, eski yön temizlenmemiş.
- `app/mint/page.tsx` ve `MintButton.tsx` temiz ve marka-tutarlı yazılmış → ekip doğru stili üretebiliyor; eski onboarding akışı bu stile çekilmemiş.

> **Not (yorum):** Landing'in ayrı bir dile sahip olması kasıtlı da olabilir (pazarlama sitesi ≠ uygulama yaygın bir konvansiyon). Ancak onboarding ve legal katmanlarının ayrışması net bir sürüklenme. Niyet, git geçmişiyle teyit edilebilir.

---

## 3. Mimari / tasarım sistemi bulguları

1. **4 farklı kart paradigması.** shadcn `<Card>` (`bg-card`, `rounded-xl`); `.glass-card` (CSS, ölü); `.near-card` (CSS, ölü); elle yazılmış `rounded-lg border-white/10 bg-zinc-950` (gerçek kullanılan). Tek bir `Card` soyutlaması yok.

2. **Token sistemi hâlâ parçalı ama nötr kaynak hizalandı.** `oklch` CSS değişkenleri + Tailwind `zinc-*` birlikte yaşıyor. Privacy/terms, trial/claim ve `IpfsPlayer` ana kabuğu `zinc` paletine taşındı; `components.json` `baseColor` da `zinc` yapıldı. Net bir yüzey/elevation kademesi hâlâ yok.

3. **~200 satır ölü CSS ilk incelemede vardı (düzeltildi).** `globals.css` 118-317 aralığında `animate-glow-pulse/-gradient-flow/-float/-shimmer/-pulse-ring/-spin-slow`, `.glass-card`, `.near-card`, `.glow-border`, `.text-gradient-near`, `.scrollbar-hide`, `.near-breathe/-section-spacing/-text-left` gibi kullanılmayan sınıf/animasyonlar vardı; P1.5 ile kaldırıldı. Range-input bloğu korundu çünkü `IpfsPlayer` scrubber'ı ve landing slider'ları bunu kullanıyor.

4. **Ölü bileşen kodu ilk incelemede vardı (düzeltildi).** `VideoCard.tsx` `slider` varyantı hiçbir yerde çağrılmıyordu; P1.5 ile kaldırıldı ve `VideoCard` tek grid karta sadeleşti.

5. **`Dialog` stok açık tema riski ilk incelemede vardı (düzeltildi).** `ui/dialog.tsx` stok shadcn açık tema (`bg-white dark:bg-zinc-950`, `border-zinc-200`) taşıyordu; küçük P2 paketiyle varsayılan koyu/zinc/near-green çizgisine çekildi. `profile/page.tsx` içindeki üç eski `DialogContent` renk override'ı da legal/profile cleanup içinde sadeleştirildi.

6. **`Input` primitifi sık override ediliyor.** `CreatorProfileForm`, `GiftLinkGenerator`, `TrialInviteGenerator`, `claim` sayfası `Input`'u `bg-zinc-900 border-zinc-XXX` ile yeniden temalıyor — ve kenarlık değeri tutarsız: `zinc-600` / `zinc-700` / `zinc-800`. Bazı `UploadForm` input'ları daha hafif override ile kalıyor; sorun "her yerde" değil, tekrar eden tema ihtiyacı.

7. **`enableSystem` latent tema riski ilk incelemede vardı (düzeltildi).** `ThemeProvider.tsx` salt-geçiş sarmalayıcı olsa da `layout.tsx` artık `enableSystem={false}` ve `forcedTheme="dark"` veriyor. Uygulamada gerçek light tema olmadığı için bu daha güvenli. `TrialUpgradeDialog` da koyu/zinc/near-green stile çekildi.

8. **Çift navigasyon sistemi.** `Navbar.tsx` ve `landing/Navigation.tsx` ayrı bileşenler, auth + pathname'e bağlı kırılgan `null` dönüşleriyle koordine ediliyor. `Navbar`'daki `mounted` gecikmesi (`setTimeout(0)` + `if (!mounted) return null`) hidrasyon sonrası "pop-in"e yol açabiliyor.

9. **`Button` varyant sistemi hâlâ sınırlı kullanılıyor.** İlk incelemede `near` varyantı tanımlı olduğu halde hiç çağrılmıyordu; `TrialUpgradeDialog`, `TrialOnboarding` ve `/trial` başarı CTA'sı artık `variant="near"` kullanıyor. Ancak Navbar bağlan butonu hâlâ ham `<button>`; landing CTA'ları `<Button className="bg-white...">` override; `TicketPurchaseCard` bazı gradient/elle yazılmış stiller taşıyor. (İstisna: `MintButton` varyantları düzgün kullanıyor.)

10. **`components.json` nötr uyumsuzluğu ilk incelemede vardı (düzeltildi).** Kod `zinc` kullanırken `components.json` `neutral` üretiyordu; baseColor `zinc` yapıldı.

---

## 4. Estetik / görsel tutarlılık bulguları

1. **Geist fontu ilk incelemede yüklenmiyordu (düzeltildi).** `globals.css` `--font-sans: var(--font-geist-sans)` diyordu ama `--font-geist-sans` tanımlı değildi; Faz 1 ile `layout.tsx`'e `next/font` bağlantısı eklendi. Kalan doğrulama: tarayıcıda computed font kontrolü.

2. **Renk paleti dağınık.** Yan yana yaşayan renkler:
   - **Yeşil:** marka `near-green` (#00ec97) + bazı kalan `emerald`/`green` kullanımları. `profile/page.tsx`, `VideoCard`, watch erişim rozeti, `CreatorProfileForm`, `GiftLinkGenerator`, `UploadForm` ve `TicketPurchaseCard` ana başarı/CTA durumları `near-green` çizgisine çekildi; kalanlar daha çok küçük semantik yardımcı yüzeylerde.
   - **Mor/mavi:** `near-purple`/`near-blue` token'ları varken bazı avatar/gradient yüzeyleri Tailwind varsayılanı kullanıyordu. Watch başlığı, `VideoCard`, `UploadForm` avatarı ve ücretli bilet seçimi sadeleştirildi; `TicketPurchaseCard` cross-chain aksanı `near-purple` ile kaldı.
   - **Marka dışı aksanlar:** `pink`, `cyan`, `slate`, `blue-50…900`, `yellow-400`, `orange`, `amber` — `TrialOnboarding`, `TrialUpgradeDialog`, `UploadForm`, `TicketPurchaseCard`, `CostReceipt`, `OnboardingKeyInit` ve `IpfsPlayer` bu gruptan büyük ölçüde çıkarıldı; kalanlar daha çok çok küçük semantik yardımcı yüzeylerde veya dokunulmamış legacy parçalarda.
   - **Hata ekranları ilk incelemede marka dışıydı (düzeltildi).** `error.tsx` ve `global-error.tsx` `gray` zemin + mavi aksan taşıyordu; Faz 1 ile siyah/zinc zemin + NEAR aksanlarına çekildi. `global-error` hâlâ hardcoded İngilizce taşıyor.

3. **Köşe yarıçapı standardı yok.** `rounded-full/-2xl/-xl/-lg/-md/-sm/-[10px]` hepsi karışık. `--radius` token'ı (10px) tanımlı ama çoğunlukla yok sayılıyor.

4. **Birincil eylem rengi çelişiyor.** Landing'de beyaz, üründe yeşil. Kullanıcı "beyaz = birincil" öğrenip sonra "yeşil = birincil" ile karşılaşıyor.

5. **Avatar varyantları kısmen birleştirildi.** `VideoCard`, watch header, `UploadForm` önizleme avatarı ve claim sender avatarı artık aynı küçük `CreatorAvatar` fallback bileşenini kullanıyor. Profile avatarı gerçek profil görseli desteklediği için `next/image` ile ayrı kaldı.

6. **Spinner tutarsızlığı azaldı ama bitmedi.** `TrialUpgradeDialog`, `TrialOnboarding`, `/trial` fallback, claim loading, `UploadForm` step spinner'ı, `TicketPurchaseCard` ana akışları ve `IpfsPlayer` loading durumu token çizgisine çekildi. Uygulama genelinde spinner renkleri hâlâ sayfaya göre değişebiliyor (`zinc`, `white`, bazı yardımcı durumlar).

7. **Tipografi tek nota.** Tüm başlıklar çoğunlukla ağır kullanılıyor; hiyerarşi ağırlıkla değil sadece boyutla kuruluyor. Legal sayfalar palet olarak hizalandı ama hâlâ ayrı, metin odaklı tipografi ritmi taşıyor.

8. **Sabit (fixed) eleman çakışması ilk incelemede vardı (düzeltildi).** `OnboardingKeyInit` uyarı toast'ı (`fixed bottom-4 left-4 z-50`) ile `LanguageSwitcher` (`fixed bottom-6 left-6 z-50`) aynı köşeye düşüyordu; Faz 1 ile uyarı sağ alta taşındı.

---

## 5. UX / erişilebilirlik bulguları

1. **Odak göstergesi ilk incelemede zayıftı (kısmen düzeltildi).** shadcn `Button`/`Input`/`Textarea` `focus-visible:ring-1` + orta gri halka taşıyordu; P3 alt paketiyle bu üç primitif `ring-2` + `near-green` halkaya çekildi.
2. **Ham `<button>`/`<input>`'larda odak stili hâlâ parçalı ama ana açıklar kapandı.** Navbar bağlan/menü/çıkış, DiscoverView filtreleri, IpfsPlayer kontrolleri, ROICalculator preset/range kontrolleri, PaymentMethodSelector sekmeleri, Gift/Trial kopyala butonları, `LanguageSwitcher`, footer linkleri, hata ekranı butonları ve `TrialUpgradeDialog` checkbox'ı P3 ile düzeltildi. Kalan olası açıklar için profil/upload/ticket yüzeylerinde ayrı tarama önerilir.
3. **Dokunma hedefleri küçük.** Navbar çıkış butonu 24px'ten 32px'e çıktı ama hâlâ önerilen 44px altında; filtre çipleri de ~28px civarında.
4. **`prefers-reduced-motion` ilk incelemede yoktu (düzeltildi).** `globals.css` artık hareket azaltma tercihinde animasyon/geçiş sürelerini düşürüyor ve smooth scroll'u kapatıyor.
5. **Footer linkleri ilk incelemede tam sayfa yeniliyordu (düzeltildi).** `LandingFooter` iç rotaları artık mevcut `Web4Link` bileşenini kullanıyor; footer linkleri de görünür focus halkası aldı.
6. **Sayfa üst boşluğu tutarsız.** `upload py-20`, `profile py-24`, `watch py-6` — ortak sayfa kabuğu yok.
7. **Ham hata metni gösterimi ilk incelemede vardı (discover için düzeltildi).** `DiscoverView` artık kullanıcıya teknik `error` string'i yerine sade "biraz sonra tekrar dene" mesajı gösteriyor. Kalan raw error yüzeyleri için watch/upload/claim ayrı taranmalı.
8. **Kardeş sayfa nötr uyumsuzluğu ilk incelemede vardı (düzeltildi).** `claim` sayfası `from-zinc-950` gradient, `trial` sayfası `from-gray-950` gradient taşıyordu; `/trial` artık zinc gradient kullanıyor.

9. **Erişilebilir ad eksikleri ilk incelemede vardı (çekirdek yüzeylerde büyük ölçüde düzeltildi).** `IpfsPlayer` play/pause, mute, fullscreen kontrolleri ve scrubber artık `aria-label`/`aria-valuetext` taşıyor; `Navbar` icon-only çıkış ve mobil menü butonları semantik ad aldı; Gift/Trial kopyala butonları da `aria-label` aldı. Kalan icon-only butonlar için profil/upload/ticket yüzeylerinde ayrı tarama önerilir.

10. **Legal tarih tutarsızlığı ilk incelemede vardı (düzeltildi).** `privacy` ve `terms` sayfalarında üstte `May 11, 2026`, altta `February 15, 2026` yazıyordu; Faz 1 ile alt tarih de `May 11, 2026` yapıldı.

11. **Bazı akış UX'leri rapor kapsamına alınmalı.** Watch sayfasında ticket kontrolü yüklenirken kısa süre yanlış kilit/satın alma hissi doğabilir; claim guest success akışı artık "Watch Now" yolu veriyor; claim account input'u yalnız boşluk kontrolü yapıyor; upload hata metinleri bazı durumlarda kullanıcıya neyi düzelteceğini yeterince anlatmayabilir.

---

## 6. Bileşen envanteri (tam tarama)

| Dosya | Durum | Başlıca bulgu |
|---|---|---|
| `app/page.tsx` + 8 landing bileşeni | Landing dili | Monokrom; marka yeşili sınırlı aksan; elle yazılmış kartlar; footer iç linkleri `Web4Link` kullanıyor |
| `Navbar.tsx` / `landing/Navigation.tsx` | Çift sistem | Kırılgan `null` koordinasyonu; pop-in riski; temel icon/button aria + focus P3 ile düzeltildi |
| `ui/button.tsx` | Primitif | `near` varyantı artık TrialUpgrade/TrialOnboarding/trial CTA'larında kullanılıyor; focus halkası P3 ile güçlendirildi |
| `ui/card` `input` `textarea` `dialog` `alert` `progress` `separator` | Primitif | Dialog varsayılanı P2 ile koyu stile çekildi; Input sık override ediliyor; Input/Textarea focus halkası P3 ile güçlendirildi |
| `CreatorAvatar.tsx` | Küçük primitif | Initials fallback avatarları için ortak zinc/near-green bileşen; `VideoCard`, watch, upload preview ve claim içinde kullanılıyor |
| `VideoCard.tsx` | Ürün — token'a yaklaştı | P1.5 ile `slider` varyantı kaldırıldı; free/creator rozetleri `near-green`/`near-purple` token'larına çekildi |
| `TicketPurchaseCard.tsx` | Ürün — token'a yaklaştı | Ana CTA'lar `near-green`, EVM CTA `near-purple`, hata/guest uyarısı `near-red`; dekoratif glow hâlâ var |
| `UploadForm.tsx` | Ürün — token'a yaklaştı | İyi adım göstergesi; success/progress/access renkleri `near-green`/`near-purple`/`near-red`; preview avatarı ortak fallback bileşenine geçti |
| `discover` `watch` `profile` | Ürün — kısmen düzeltildi | zinc tonları hâlâ karışık; discover filtreleri `aria-pressed` aldı; discover hata metni sadeleşti; watch header avatar/verified rozeti token'a çekildi |
| `TrialOnboarding.tsx` | Düzeltildi | Koyu/zinc/near-green stile çekildi; gradient CTA/icon ve gray kart kullanımı kaldırıldı |
| `TrialUpgradeDialog.tsx` | Düzeltildi | Koyu/zinc/near-green stile çekildi; `near` Button varyantı, `Loader2`, focus'lu checkbox ve marka renkli uyarı kutuları kullanıyor |
| `CostReceipt.tsx` | Token'a yaklaştı | Storage badge'leri ve hesap özeti `near-green`/`near-purple`/`near-red`; `Separator` kullanıyor |
| `GiftLinkGenerator.tsx` | Çoğu tutarlı | Kopyala butonu aria + focus aldı; kopyalama geri bildirimi `near-green` |
| `CreatorProfileForm.tsx` | Input override | Her `Input` elle yeniden temalı; başarı geri bildirimi `near-green` |
| `MintButton.tsx` | **Temiz (referans)** | Button varyantları düzgün; ham buton yok; renk ihlali yok |
| `PaymentMethodSelector.tsx` | App stili, tutarlı | Sekmeler `aria-pressed` + focus halkası aldı; aksan near-green |
| `VideoPlayer.tsx` | Sorun yok | İnce sarmalayıcı |
| `IpfsPlayer.tsx` | App stili — kısmen düzeltildi | Ana player kabuğu `zinc` paletine çekildi; loading/protected/banned durumları token renkleri kullanıyor; temel player kontrolleri aria + focus P3 ile düzeltildi |
| `IPFSThumbnail.tsx` | Temiz | `next/image` düzgün kullanılmış |
| `TrialInviteGenerator.tsx` | GiftLinkGenerator deseni | Kopyala butonu aria + focus aldı; kardeşiyle tutarlı |
| `app/mint/page.tsx` | **Temiz (referans)** | eyebrow + font-black + near-green + zinc-950 — en hizalı sayfa |
| `app/claim/page.tsx` | İç tutarlı | zinc gradient; near-green success/processing; sender avatarı ortak fallback bileşenine geçti; guest success artık Watch Now yolu veriyor |
| `app/privacy` `app/terms` | Düzeltildi | `zinc` paletine taşındı; tarih tutarsızlığı kapalı; hâlâ uzun metin/legal içerik sayfası |
| `app/profile/page.tsx` | Kısmen düzeltildi | Avatar `next/image`; DialogContent renk override'ları sadeleşti; revenue/sales/creator/gift aksanları near-green çizgisine çekildi |
| `app/error.tsx` / `app/global-error.tsx` | Faz 1 ile görsel düzeldi | Siyah/zinc zemin + NEAR aksanları; `global-error` hardcoded İngilizce kalıyor |
| `OnboardingKeyInit.tsx` | Faz 1 ile konum düzeldi | Toast sağ alta taşındı; warning `near-red` tokenına bağlandı; koşullu olduğu için tarayıcıda tekrar görülebilir |
| `Web4Link.tsx` | Sorun yok | Saf mantık |

---

## 7. İyi yapılmış olanlar

- shadcn + CVA temeli sağlam; i18n (`LanguageContext`) tüm yüzeylere tutarlı uygulanmış.
- Landing'de anlamsal HTML (`<section>`/`<article>`, eyebrow deseni) düzgün.
- `UploadForm` adım göstergesi (dikey ray + ilerleme) gerçekten iyi tasarlanmış.
- Kart hover mikro-etkileşimleri (`-translate-y`, thumbnail `scale`) ölçülü.
- `ChunkLoadError` kurtarma mantığı düşünülmüş; Sentry ile gözlemlenebilirlik mevcut.
- `MintButton` + `mint` sayfası: ekibin temiz, marka-tutarlı yazabildiğinin kanıtı.
- `IPFSThumbnail` `next/image`, `CostReceipt` `Separator` — primitifleri doğru kullanan örnekler.

---

## 8. Önceliklendirilmiş iyileştirme önerileri

### P0 — Tasarım dili kararı
Bir kod düzeltmesi değil, bir yön kararı. Landing'in monokrom-editöryel dili mi yoksa ürünün/`mint` sayfasının stili mi esas alınacak? Öneri: **landing/`mint` dili kazansın** (daha olgun, sunuma uygun; marka yeşili bir aksan olarak eklensin). Ürün ve onboarding yüzeyleri bu dile çekilsin. *Risk: görsel regresyon; orta-büyük efor.*

### P1 — Düşük riskli hızlı kazanımlar (yarım–bir gün)
- Geist fontunu `next/font` ile gerçekten yükle.
- `error.tsx` ve `global-error.tsx`'i marka paletine taşı (siyah/zinc zemin, near-green veya semantik red aksan).
- Legal sayfalardaki tarih tutarsızlığını gider.
- `OnboardingKeyInit` toast ↔ `LanguageSwitcher` çakışmasını gider.
- **Durum:** Bu dört madde Faz 1'de uygulandı; tarayıcı smoke kontrolü hâlâ önerilir.
- *Risk: çok düşük — hepsi izole.*

### P1.5 — Temizlik (ayrı küçük PR)
- ~200 satır ölü CSS'i ve `VideoCard` `slider` varyantını sil.
- Silmeden önce `rg` ile kullanım tekrar kontrol edilmeli; range-input bloğu korunmalı.
- **Durum:** Bu paket uygulandı; range-input bloğu korundu.

### P2 — Token & bileşen birleştirme (orta efor)
- Tek nötr merdiven seç (`zinc` önerilir); kalan `gray-*`/`slate-*` kaçaklarını azalt.
- Tek "yeşil" (`near-green`) ve tek "mor" (`near-purple`); `emerald`/`violet`/`purple-500` semantik kullanımları token'a bağla.
- `Dialog`'u token'larla yeniden temala; `enableSystem`'i kapat veya gerçek light tema ekle.
- Tek `Card` ve tek `Avatar` soyutlaması; `Button`/`Input` varyantlarını fiilen kullan.
- Bir `--radius` ölçeği belirle ve uygula.

**Durum:** Küçük P2 güvenlik paketi uygulandı: gerçek light tema olmadığı için `enableSystem` kapatıldı ve tema koyu moda sabitlendi; `Dialog` varsayılanı açık shadcn stilinden koyu/zinc/near-green stile çekildi. Initials avatarları için küçük `CreatorAvatar` fallback bileşeni eklendi. `components.json` baseColor `zinc` yapıldı. Kalan nötr kaçaklar, aksan renkleri, `Card` ve radius birleştirme hâlâ açık iş.

**Ek durum:** Ürün yüzeyi renk cleanup'ıyla `VideoCard`, `UploadForm`, `TicketPurchaseCard`, watch başlığı, discover loading/error/empty halleri ve küçük profile/gift geri bildirimleri `near-green`/`near-purple`/`near-red` tokenlarına veya `zinc` paletine çekildi.

### P3 — Erişilebilirlik & cila
Görünür `focus-visible` halkası (kalın + `near-green`), ham buton/input odak stilleri, dokunma hedeflerini 44px'e çıkar, `prefers-reduced-motion`, ortak sayfa kabuğu, iki navigasyonu tek bileşene indir, legal sayfaları app token'larına taşı.

**Durum:** İlk küçük P3 paketi uygulandı: ortak `Button`/`Input`/`Textarea` focus halkası güçlendi; `IpfsPlayer` kontrolleri, `Navbar` icon/menü butonları ve Discover filtreleri temel `aria-*` durumlarını aldı. Kalan P3 işleri daha geniş yüzey taraması gerektiriyor.

**Ek durum:** İkinci küçük P3 paketiyle `PaymentMethodSelector`, `ROICalculator`, Gift/Trial kopyala butonları, `LanguageSwitcher`, hata ekranı butonları ve `TrialUpgradeDialog` checkbox'ı da focus/aria açısından güçlendirildi.

**Ek durum 2:** Kapanış P3 temizliğiyle `LandingFooter` iç rotaları `Web4Link`'e taşındı, footer link focus halkaları eklendi, `prefers-reduced-motion` medya sorgusu geldi ve eski lint uyarısı kapandı.

**Ek durum 3:** Küçük ürün yüzeyi cleanup'ıyla `VideoCard`, watch başlığı, discover loading/error/empty halleri, `GiftLinkGenerator`, `CreatorProfileForm`, `UploadForm` ve `TicketPurchaseCard` içindeki belirgin `emerald`/`violet`/`orange`/`amber`/`gray` kaçakları NEAR tokenlarına veya `zinc` paletine çekildi.

**Ek durum 4:** Semantik yüzey cleanup'ıyla `IpfsPlayer` `slate` nötründen `zinc` paletine taşındı; `CostReceipt`, `OnboardingKeyInit`, `WalletProvider` uyarısı ve privacy public-data uyarıları `near-green`/`near-purple`/`near-red` tokenlarıyla hizalandı.

---

## 9. Doğrulama durumu ve artık risk

**Bu revizyonda çalıştırılan kapılar:** `git diff --check` geçti; `apps/web` içinde `npm run lint` temiz geçti; `npm test -- --run` geçti (32 dosya, 258 test); `npm run build` geçti (eski Sentry/Prisma/OpenTelemetry dinamik dependency uyarısı devam ediyor); dev server `http://127.0.0.1:3000` `200` döndü; headless browser smoke ile `/`, `/upload`, `/discover`, `/claim`, `/watch` sayfaları `200` döndü, görünür metin render etti ve console error üretmedi.

**Grep + dosya okumasıyla sert-doğrulanan savlar:** İlk incelemede Geist yüklenmiyordu ve Faz 1 ile düzeltildi; ilk incelemede ~200 satır ölü CSS ve `VideoCard` `slider` varyantı vardı, P1.5 ile kaldırıldı; `Button` `near` varyantı ilk incelemede kullanılmıyordu, artık `TrialUpgradeDialog` içinde kullanılıyor; 3+ yeşil tonu kaynakta mevcut; ilk incelemede `ThemeProvider` koyu moda sabit değildi, küçük P2 paketiyle `enableSystem={false}` + `forcedTheme="dark"` oldu; `components.json` artık `baseColor: "zinc"` kullanıyor.

**Ampirik doğrulanmayanlar / artık risk:**
- Headless browser smoke yapıldı; tam görsel inceleme ve mobil viewport turu hâlâ yapılmadı. Faz 1 sonrası HTML çıktısında font variable class'ları ve self-hosted font preload'ları göründü; gerçek computed font yine tarayıcıda doğrulanmalı. Tema riski artık kod seviyesinde kapalı görünüyor; yine de temiz storage ile tarayıcıda kontrol önerilir.
- "Tasarım dili sürüklenmesi" çıkarımı kanıta dayalı ama bir yorum; landing'in ayrılığı kasıtlı olabilir. Git geçmişiyle teyit edilebilir.
- Bileşen taraması kapsamlıdır ancak `lib/`, `hooks/`, provider'lar ve test dosyaları görsel açıdan incelenmedi (çoğu UI taşımıyor). Watch/claim/upload akış UX notları statik kod okumasından çıkarıldı; tarayıcı smoke ile doğrulanmalı.

---

## 10. Devam notu — profile/upload/ticket taraması

Bu devam turunda raporun son önerisi izlendi: kalan P2/P3 riski için `profile`, `upload` ve `ticket purchase` yüzeyleri tekrar okundu. Geniş refactor'a girilmedi; amaç kalan açıkları netleştirmek ve düşük riskli mikro-fix'i uygulamaktı.

### Uygulanan mikro-fix

1. **Ticket purchase ham hata metni kapatıldı.** `TicketPurchaseCard.tsx` içinde MetaMask/swap/provider exception detayları artık kullanıcıya doğrudan gösterilmiyor; detay `console.error` içinde kalıyor. Kullanıcı yüzeyinde `tp.error_complete_purchase`, `tp.error_tx_rejected`, `tp.error_claim_free`, `tp.error_swap_small` ve erişim onayı bekleme mesajı kullanılıyor.

2. **Kalan ham kontrollerde focus güçlendirildi.** `TicketPurchaseCard` swap iptal butonları ve cost breakdown butonu; `profile` gift seçim modalındaki event seçim butonları; `UploadForm` açıklama hint çipleri ve `select` kontrolü `focus-visible:ring-2 focus-visible:ring-near-green` çizgisine çekildi. Cost breakdown butonuna `aria-expanded` eklendi.

3. **Sayfa kabuğu ritmi hâlâ açık iş.** `upload` `py-20`, `profile` `py-24`, `watch` ana içerik `py-6`; rapordaki ortak sayfa kabuğu notu hâlâ geçerli. Bu daha geniş tasarım kararı gerektirdiği için mikro-fix paketine alınmadı.

4. **Renk cleanup'ı ana yüzeylerde iyi ilerlemiş görünüyor.** Bu turdaki grep taramasında belirgin `emerald`/`violet`/`orange`/`amber` kaçaklarının büyük kısmı kapanmış; kalan renkler çoğunlukla `zinc`, `near-green`, `near-purple`, `near-red` ve küçük nötr varyantlar.

### Bu turdaki doğrulama durumu

`apps/web` içinde `npm run lint` temiz geçti. `npm run build` geçti; eski Sentry/Prisma/OpenTelemetry dinamik dependency uyarısı devam ediyor ve bu değişiklikle ilişkili görünmüyor.

Route smoke yeniden kanıtlandı: eski `3000` dev server süreci kapatılıp `npm run dev` ile temiz restart yapıldı. Node `fetch` smoke ile `/`, `/upload`, `/discover`, `/claim`, `/watch`, `/profile` rotalarının tamamı `200` döndü. Dev server logu da aynı rotalar için `GET ... 200` kayıtlarını gösterdi. Eski Sentry/Prisma/OpenTelemetry dinamik dependency warning'i devam ediyor; bu mikro-fix ile ilişkili görünmüyor.

### Sıradaki en küçük güvenli iş

Sıradaki kod işi artık P3 mikro-fix veya route smoke değil; ikisi de tamamlandı. Bir sonraki paket ayrı tutulmalı: ortak page shell ve dokunma hedefleri gibi daha geniş P3 düzenlemeleri.

---

*Hazırlayan: Claude Code — statik kod incelemesi. Güncel sıradaki adım önerisi: ayrı bir ortak page shell/dokunma hedefi paketi.*
