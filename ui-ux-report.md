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

**Ek durum 5:** Ortak page shell paketiyle `upload`, `profile` ve `watch` ürün sayfalarının dış kabuk ritmi küçük `PageShell` bileşeninde toplandı. Navbar connect/disconnect/menü butonları ve Discover filtre çipleri 44px dokunma hedefi çizgisine yaklaştırıldı.

**Ek durum 6:** Local production smoke sırasında görülen Turnstile/onboarding-key console gürültüsü kapatıldı. `OnboardingKeyInit` ve `gift-service` localhost üzerinde Turnstile yüklemiyor; Turnstile token alınamazsa token'sız `/api/onboarding-key` çağrısı yapılmıyor. Mobil `/discover` navigasyon taşması da `variant="discover"` için mobil menüye alınarak kapatıldı.

**Ek durum 7:** Görsel smoke sonrası iki küçük P3 bulgu daha kapatıldı: localhost pasif onboarding uyarısı mobilde `LanguageSwitcher` ile çakıştığı için local pasif uyarı sessizleştirildi; guest `/discover` üzerindeki çift-navbar görünümü global `Navbar`'ın guest discover'da render edilmemesiyle kapatıldı. Ardından Card/radius küçük paketi uygulandı: `ui/Card` tabanı `rounded-lg` + zinc/white border/shadow çizgisine çekildi; `VideoCard` ve `TicketPurchaseCard` ortak `Card` primitive'ini kullanmaya başladı.

**Ek durum 8:** Navigation merge küçük paketi uygulandı. Nav render sahipliği tek giriş noktası olan global `Navbar` içinde toplandı: guest `/` için landing nav, guest `/discover` için discover marketing nav, app rotaları için app nav render ediliyor. `app/page.tsx` ve `DiscoverView` artık ayrıca `Navigation` basmıyor; böylece çift-navbar koordinasyonu sayfa seviyesinden çıkarıldı.

**Ek durum 9:** Profile Card/radius küçük paketi uygulandı. `profile/page.tsx` içinde wallet-yok paneli, hesap kartları ve rol özeti kartları ortak `Card` primitive'ine taşındı. Authenticated profile smoke sırasında görülen `LanguageSwitcher` içerik üstüne binme riski de kapatıldı; dil seçici artık içerik kartlarını örtmek yerine üst nav bandında duruyor ve 44px dokunma yüksekliği taşıyor.

**Ek durum 10:** Claim/trial Card/radius küçük paketi uygulandı. `claim/page.tsx` içinde loading, preview, claim-options, claiming, success, error ve Suspense fallback dış kabukları `Card` primitive'ine taşındı. `trial/page.tsx` managed-account success paneli de aynı primitive'i kullanıyor. İç seçenek kutuları ve CTA stilleri bu pakete alınmadı.

**Ek durum 11:** Claim CTA Button varyant cleanup'ı uygulandı. `claim/page.tsx` içindeki ana yeşil CTA'lar artık elle `bg-near-green text-near-black hover:bg-near-green/80 font-semibold` yazmak yerine `variant="near"` kullanıyor. Boyut ve köşe hissini korumak için yalnızca `w-full h-12 rounded-xl` gibi yerleşim sınıfları bırakıldı.

**Ek durum 12:** Claim input/secondary primitive cleanup'ı uygulandı. Existing wallet input'u artık `Input` primitive'inin `border-input`/metin varsayılanlarına yaslanıyor; local class yalnız `h-12 rounded-xl bg-zinc-800/50` tutuyor. Claim success/error outline butonlarında da renk/hover override'ları kaldırıldı, sadece yerleşim/köşe sınıfları bırakıldı.

**Ek durum 13:** Upload/watch CTA Button varyant taraması uygulandı. `watch/page.tsx` içindeki boş/hata durum `Browse Screenings` outline CTA'ları artık local beyaz border/hover override'ı taşımıyor. `UploadForm` publish başarı panelindeki ana `Watch` CTA'sı `variant="near"` kullanıyor; başarı panelindeki ikincil discover/copy aksanları bu tur kapsam dışında bırakıldı.

**Ek durum 14:** Upload prompt chip dokunma hedefleri düzeltildi. `UploadForm` açıklama hint butonları artık `min-h-11` kullanıyor; desktop smoke'ta 44px, mobile smoke'ta kısa chip'ler 44px ve uzun chip'ler 51px ölçüldü. Console error/warning ve yatay taşma çıkmadı.

**Ek durum 15:** Upload ana publish butonu 44px dokunma hedefine yaklaştırıldı. `UploadForm` içindeki `Pay & Publish`/publish CTA'sı artık `h-11 w-full` kullanıyor; desktop ve mobile smoke'ta 44px ölçüldü.

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

Bu öneri bir sonraki turda uygulandı; güncel durum için aşağıdaki page shell/dokunma hedefleri devam notuna bak.

---

## 11. Devam notu — page shell ve dokunma hedefleri

Bu devam turunda raporun önerdiği küçük P3 paketi uygulandı. Geniş tasarım dili kararına girilmedi; sadece tekrar eden ürün sayfası kabuğu ve belirgin küçük dokunma hedefleri ele alındı.

### Uygulanan mikro-fix

1. **Ortak ürün sayfası kabuğu eklendi.** `apps/web/components/PageShell.tsx` eklendi; `upload`, `profile` ve `watch` sayfalarının tekrar eden `container mx-auto px-4 py-* min-h-screen` kabuğu buraya taşındı.

2. **Dokunma hedefleri büyütüldü.** `Navbar` desktop disconnect, desktop connect, mobil menü ve mobil connect/disconnect butonları 44px hedefe yaklaştırıldı. `DiscoverView` filtre çipleri de `min-h-11` ile daha rahat dokunulabilir hale geldi.

3. **Kapsam dışı bırakılanlar.** İki navigasyon sistemini birleştirme, genel `Button` boyutlarını tüm uygulamada büyütme, ortak `Card`/radius sistemi ve tam mobil görsel tur bu pakete alınmadı; bunlar daha geniş görsel regresyon riski taşıyor.

### Bu turdaki doğrulama durumu

`apps/web` içinde `npm run lint` temiz geçti. `npm run build` geçti; eski Sentry/Prisma/OpenTelemetry dinamik dependency uyarısı devam ediyor ve bu değişiklikle ilişkili görünmüyor. `git diff --check` geçti.

Mevcut `:3000` Next süreci dinliyor ama HTTP cevap vermediği için ona dokunulmadı. Build sonrası `npm run start -- --hostname 127.0.0.1 --port 3001` ile ayrı production server açıldı; `/upload`, `/profile`, `/watch` ve `/discover` rotaları `200` döndü.

### Sıradaki en küçük güvenli iş

Sıradaki küçük iş artık koddan çok görsel doğrulama: desktop + mobil viewport screenshot turu yapıp `PageShell` boşluklarının ve büyüyen filtre/navbar hedeflerinin gerçek ekranda iyi durduğunu kontrol etmek. Kod işi olarak sonraki paket ancak bundan sonra seçilmeli: navigasyon birleştirme veya `Card`/radius standardı.

---

## 12. Devam notu — console temizliği ve mobil Discover

Bu devam turunda önce `console-log.md` source-of-truth olarak okundu. Logdaki aktif zincir `Cloudflare Turnstile 110200/400` → `/api/onboarding-key 403` → `[ONBOARDING_KEY] Endpoint returned 403` idi. Temiz Playwright tarayıcısıyla aynı zincir tekrar üretildi; `bubble_compiled.js` Trusted Types satırları tarayıcı/eklenti kaynaklı gürültü olarak ayrıldı.

### Uygulanan mikro-fix

1. **Pasif onboarding bootstrap console gürültüsü kapatıldı.** `OnboardingKeyInit` localhost üzerinde Turnstile script'i yüklemiyor. Turnstile token alınamazsa `/api/onboarding-key` token'sız çağrılmıyor ve 403 console zinciri oluşmuyor.

2. **Guest/trial aksiyon yolu aynı hataya karşı korundu.** `gift-service.ensureOnboardingKey` için de aynı localhost ve token-yok koruması eklendi.

3. **Mobil Discover yatay taşması kapatıldı.** Görsel smoke sırasında `/discover` mobil viewport'ta `scrollWidth 517 / viewport 390` çıktı. Sebep `Navigation` içindeki discover varyantının mobilde desktop CTA satırını göstermesiydi; bu satır mobil menüye taşındı.

### Bu turdaki doğrulama durumu

`apps/web` içinde `npm run lint` temiz geçti. `npm test -- --run __tests__/unit/gift-service.test.ts` geçti (33 test). `npm run build` geçti; eski Sentry/Prisma/OpenTelemetry dinamik dependency uyarısı devam ediyor ve bu değişiklikle ilişkili görünmüyor.

Build sonrası `npm run start -- --hostname 127.0.0.1 --port 3001` ile production smoke yapıldı. Playwright ile desktop `1280x900` ve mobile `390x844` viewport'larında `/upload`, `/profile`, `/watch`, `/discover` rotalarının tamamı `200` döndü; console error/warning yoktu; yatay taşma yoktu.

### Sıradaki en küçük güvenli iş

Kod tarafındaki bu P3 küçük paket tamamlandı. Sıradaki iş artık daha geniş tasarım kararı gerektiriyor: iki navigasyon sistemini birleştirme veya ortak `Card`/radius standardı. Bunlardan önce canlı tarayıcıda gerçek görsel screenshot incelemesi yapılmalı.

---

## 13. Devam notu — görsel smoke, Card/radius, navigation gate

Bu devam turunda önerilen sıra kapılarla izlendi: önce desktop/mobile görsel smoke, sonra küçük Card/radius standardı, en son navigation merge risk kontrolü.

### Görsel smoke bulguları

İlk smoke'ta 8/8 rota `200` döndü, console error/warning yoktu ve yatay taşma yoktu. Ancak iki görsel sorun çıktı: localhost pasif onboarding uyarısı mobilde `LanguageSwitcher` ile çakışıyordu; guest `/discover` üzerinde global `Navbar` ve discover `Navigation` üst üste görünüyordu.

Bu iki bulgu kapatıldı: `OnboardingKeyInit` localhost pasif bootstrap'inde uyarı göstermeden çıkıyor; guest `/discover` global `Navbar` render etmiyor. İkinci smoke'ta `/upload`, `/profile`, `/watch`, `/discover` desktop `1280x900` ve mobile `390x844` için `200`, console temiz ve yatay taşmasız geçti.

### Card/radius paketi

`ui/Card` tabanı `rounded-lg border-white/10 bg-zinc-950 text-white shadow-xl` çizgisine çekildi. `VideoCard` ve `TicketPurchaseCard` dış kabukları ortak `Card` primitive'ini kullanmaya başladı. Bu geniş bir kart refactor'u değil; discover kartları ve purchase kartı için en görünür, düşük riskli standardizasyon adımıdır.

Card sonrası smoke tekrarlandı: aynı 4 rota ve 2 viewport `200` döndü, console error/warning yoktu, yatay taşma yoktu. Görsel kontrolte discover kartları ve upload yüzeyi kırılmadı.

### Navigation merge gate

Tam navigasyon birleşimi bu turun mikro-fix kapsamına alınmadı. Sebep: gerçek birleşim `RootLayout`, global `Navbar`, landing `Navigation`, `/` landing sayfası ve `/discover` guest state'lerini birlikte etkiliyor. Bu iş ayrı yapılmalı; önce mevcut davranış matrisi çıkarılmalı:

1. Guest `/`: landing nav
2. Guest `/discover`: discover marketing nav
3. Guest app rotaları: global app nav
4. Connected app rotaları: global app nav
5. Connected `/discover`: global app nav, discover iç nav yok

### Bu turdaki doğrulama durumu

`npm run lint` temiz geçti. `npm test -- --run __tests__/unit/gift-service.test.ts` geçti (33 test). `npm run build` geçti; eski Sentry/Prisma/OpenTelemetry dynamic dependency uyarısı devam ediyor ve bu değişiklikle ilişkili görünmüyor. `git diff --check` temiz geçti.

### Sıradaki en küçük güvenli iş

Bu öneri bir sonraki turda uygulandı; güncel durum için aşağıdaki navigation merge devam notuna bak.

---

## 14. Devam notu — navigation merge

Bu devam turunda navigation merge, geniş görsel refactor'a çevrilmeden uygulandı. Amaç iki ayrı nav render noktasını tek karar merkezinde toplamak ve önceki çift-navbar riskini kalıcı olarak azaltmaktı.

### Uygulanan mikro-fix

1. **Nav render sahipliği `Navbar` içine taşındı.** Global `Navbar`, path + wallet durumuna göre doğru nav'ı seçiyor:
   - Guest `/`: landing marketing nav
   - Guest `/discover`: discover marketing nav
   - Guest app rotaları: global app nav
   - Connected rotalar: global app nav

2. **Sayfa içi nav render'ları kaldırıldı.** `app/page.tsx` içindeki landing `Navigation` çağrısı kaldırıldı. `DiscoverView` içindeki dört ayrı `Navigation variant="discover"` çağrısı kaldırıldı. `/discover/page.tsx` artık router callback taşımıyor.

3. **Davranış matrisi korundu.** Guest landing ve guest discover görsel olarak kendi pazarlama nav çizgisinde kalıyor; upload/profile/watch app nav çizgisinde kalıyor. Connected `/discover` için kod yolu global app nav'a düşüyor; bu canlı wallet login ile ayrıca smoke edilebilir.

### Bu turdaki doğrulama durumu

`npm run lint` temiz geçti. `npm test -- --run __tests__/unit/gift-service.test.ts` geçti (33 test). `npm run build` geçti; eski Sentry/Prisma/OpenTelemetry dynamic dependency uyarısı devam ediyor ve bu değişiklikle ilişkili görünmüyor.

Build sonrası `npm run start -- --hostname 127.0.0.1 --port 3001` ile production smoke yapıldı. Playwright ile desktop `1280x900` ve mobile `390x844` viewport'larında `/`, `/upload`, `/profile`, `/watch`, `/discover` rotalarının tamamı `200` döndü; her ekranda `navCount=1`; console error/warning yoktu; yatay taşma yoktu.

### Sıradaki en küçük güvenli iş

Kalan büyük iş artık genel tasarım sistemi standardı: profile/claim/trial gibi daha az görünür yüzeylerde `Card`/radius standardını yaymak veya `Button` varyantlarını elle stillenen CTA'lara taşımak. En güvenli sonraki paket: profile kartlarını ortak `Card` primitive'ine kademeli taşımak ve aynı smoke kapısını korumak.

---

## 15. Devam notu — profile Card/radius ve dil seçici çakışması

Bu devam turunda önceki öneri küçük kapsamla uygulandı. Amaç profile sayfasını baştan tasarlamak değil; ana kart yüzeylerini daha önce standardize edilen `Card` primitive çizgisine yaklaştırmaktı.

### Uygulanan mikro-fix

1. **Profile ana kartları ortak primitive'e taşındı.** Wallet bağlı değil paneli, üç hesap kartı ve beş rol özeti kartı `Card` bileşenini kullanıyor. Liste satırları ve modal içi seçim yüzeyleri bu pakete alınmadı.

2. **Dil seçici içerik üstünden kaldırıldı.** Authenticated profile smoke'ta sabit `LanguageSwitcher` hem mobilde hem desktop'ta içerik kartlarının üstüne binebiliyordu. Konum üst nav bandına taşındı ve buton yüksekliği `min-h-11` ile 44px çizgisine getirildi.

### Bu turdaki doğrulama durumu

`npm run lint` temiz geçti. `npm test -- --run __tests__/unit/gift-service.test.ts` geçti (33 test). `npm run build` geçti; eski Sentry/Prisma/OpenTelemetry dynamic dependency uyarısı devam ediyor ve bu değişiklikle ilişkili görünmüyor.

Build sonrası `npm run start -- --hostname 127.0.0.1 --port 3001` ile production smoke yapıldı. Playwright ile desktop `1280x900` ve mobile `390x844` viewport'larında `/`, `/upload`, `/profile`, `/watch`, `/discover` rotalarının tamamı `200` döndü; her ekranda `navCount=1`; console error/warning yoktu; yatay taşma yoktu.

Ek olarak gerçek wallet bağlamadan, geçici sahte trial hesabı ve mocked `/api/near-rpc` yanıtlarıyla authenticated `/profile` görsel smoke'u yapıldı. Account kartları, wallet balance, profile kartı ve rol özeti kartları desktop/mobile render oldu; console temiz kaldı, yatay taşma çıkmadı. Screenshot çıktıları: `/private/tmp/youtick-ui-smoke-2026-05-18-profile-card/`.

### Sıradaki en küçük güvenli iş

Kalan güvenli sonraki paket: claim/trial yüzeylerinde `Card`/radius standardını küçük parça halinde yaymak. Alternatif küçük paket: elle stillenen CTA'larda `Button` varyant kullanımını artırmak.

---

## 16. Devam notu — claim/trial Card/radius

Bu devam turunda önceki önerinin ilk yarısı uygulandı. Kapsam bilerek dar tutuldu: claim/trial akış mantığı, input validasyonu ve CTA varyantları bu pakete alınmadı.

### Uygulanan mikro-fix

1. **Claim dış kartları ortak primitive'e taşındı.** `claim/page.tsx` içinde loading, preview, claim-options, claiming, success, error ve Suspense fallback dış kabukları `Card` bileşenini kullanıyor.

2. **Trial success paneli ortak primitive'e taşındı.** `trial/page.tsx` managed-account başarı paneli `Card` bileşenine geçti. `TrialOnboarding` zaten `Card` kullandığı için tekrar dokunulmadı.

3. **Kapsam dışı bırakılanlar.** Claim içindeki guest/wallet seçenek kutuları, form input'u ve yeşil CTA buton sınıfları aynen kaldı. Bunlar sonraki küçük `Button`/input varyant cleanup paketi için daha uygun.

### Bu turdaki doğrulama durumu

`npm run lint` temiz geçti. `npm test -- --run __tests__/unit/gift-service.test.ts` geçti (33 test). `npm run build` geçti; eski Sentry/Prisma/OpenTelemetry dynamic dependency uyarısı devam ediyor ve bu değişiklikle ilişkili görünmüyor.

Build sonrası `npm run start -- --hostname 127.0.0.1 --port 3001` ile production smoke yapıldı. Playwright ile desktop `1280x900` ve mobile `390x844` viewport'larında `/claim`, `/trial`, `/`, `/discover` rotaları `200` döndü; her ekranda `navCount=1`; console error/warning yoktu; yatay taşma yoktu.

Ek olarak gerçek chain çağrısı yapmadan mocked `/api/near-rpc` ile gift preview + claim-options ekranları ve managed trial success paneli desktop/mobile render edildi. Console temiz kaldı, yatay taşma çıkmadı. Screenshot çıktıları: `/private/tmp/youtick-ui-smoke-2026-05-18-claim-trial-card/`.

### Sıradaki en küçük güvenli iş

Kalan en küçük güvenli paket artık `Button` varyant cleanup'ı: claim preview/options/success içindeki elle yazılmış yeşil CTA sınıflarını mevcut `variant="near"` çizgisine taşımak. Bu, akış mantığına dokunmadan CTA tutarlılığını artırır.

---

## 17. Devam notu — claim CTA Button varyant cleanup

Bu devam turunda claim akışının ana CTA butonları, mevcut `Button` tasarım varyantına yaklaştırıldı. Amaç görsel davranışı değiştirmek değil, tekrar eden yeşil CTA sınıflarını tek primitive kararına bağlamaktı.

### Uygulanan mikro-fix

1. **Ana claim CTA'ları `variant="near"` kullanıyor.** Preview `Claim Ticket`, claim-options içindeki `Create Guest Account and Claim` ve `Transfer to Wallet`, success içindeki `Watch Now` butonları artık `variant="near"` ile render ediliyor.

2. **Yerleşim korunuyor.** CTA'larda `w-full h-12 rounded-xl` bırakıldı; böylece önceki genişlik, 48px yükseklik ve köşe hissi korunuyor.

3. **Kapsam dışı bırakılanlar.** Outline/ghost butonlar, input stili, claim seçenek kutuları ve akış mantığına dokunulmadı.

### Bu turdaki doğrulama durumu

`npm run lint` temiz geçti. `npm test -- --run __tests__/unit/gift-service.test.ts` geçti (33 test). `npm run build` geçti; eski Sentry/Prisma/OpenTelemetry dynamic dependency uyarısı devam ediyor ve bu değişiklikle ilişkili görünmüyor.

Build sonrası `npm run start -- --hostname 127.0.0.1 --port 3001` ile production smoke yapıldı. Playwright ile desktop `1280x900` ve mobile `390x844` viewport'larında `/claim`, `/trial`, `/`, `/discover` rotaları `200` döndü; her ekranda `navCount=1`; console error/warning yoktu; yatay taşma yoktu.

Ek olarak mocked gift link ile claim preview ve claim-options ekranları desktop/mobile render edildi. CTA butonları 48px yükseklikte kaldı, console temizdi, yatay taşma çıkmadı. Screenshot çıktıları: `/private/tmp/youtick-ui-smoke-2026-05-18-claim-button-variant/`.

### Sıradaki en küçük güvenli iş

Kalan küçük tasarım sistemi işi: claim içindeki `Input` ve outline/ghost buton stillerini ortak primitive kararlarına yaklaştırmak. Alternatif olarak upload/watch içindeki elle yazılmış CTA'lar için aynı `Button` varyant taraması yapılabilir.

---

## 18. Devam notu — claim input/secondary primitive cleanup

Bu devam turunda claim içindeki kalan küçük primitive override'ları azaltıldı. Kapsam yine sadece claim sayfasıydı; global `Input` veya `Button` varyantları değiştirilmedi.

### Uygulanan mikro-fix

1. **Existing wallet input'u sadeleşti.** Input artık primitive'in `border-input`, metin rengi, placeholder ve focus kararlarını kullanıyor. Local class sadece `h-12 rounded-xl bg-zinc-800/50` olarak kaldı.

2. **Outline buton override'ları azaltıldı.** Success ekranındaki ikincil CTA ve error ekranındaki `Try Again` butonu `variant="outline"` varsayılan renk/hover kararlarına yaslanıyor. Local class sadece ölçü/köşe için kaldı.

3. **Kapsam dışı bırakılanlar.** Back ghost butonu, claim iç seçenek kutuları ve akış mantığına dokunulmadı.

### Bu turdaki doğrulama durumu

`npm run lint` temiz geçti. `npm test -- --run __tests__/unit/gift-service.test.ts` geçti (33 test). `npm run build` geçti; eski Sentry/Prisma/OpenTelemetry dynamic dependency uyarısı devam ediyor ve bu değişiklikle ilişkili görünmüyor.

Build sonrası `npm run start -- --hostname 127.0.0.1 --port 3001` ile production smoke yapıldı. Playwright ile desktop `1280x900` ve mobile `390x844` viewport'larında `/claim`, `/trial`, `/`, `/discover` rotaları `200` döndü; her ekranda `navCount=1`; console error/warning yoktu; yatay taşma yoktu.

Ek olarak mocked gift link ile claim-options ekranı desktop/mobile render edildi. Input 48px yükseklikte kaldı; CTA/secondary buton ölçüleri korundu; console temizdi, yatay taşma çıkmadı. Screenshot çıktıları: `/private/tmp/youtick-ui-smoke-2026-05-18-claim-secondary-input/`.

### Sıradaki en küçük güvenli iş

Kalan güvenli tasarım sistemi işi claim'den çıkıp başka yüzeye geçmek: upload/watch içindeki elle yazılmış CTA'ları `Button` varyantları açısından taramak. Alternatif olarak claim içindeki seçenek kutularını `Card`/radius standardına çekmek yapılabilir, ama bu daha fazla görsel değişim riski taşır.

---

## 19. Devam notu — upload/watch CTA Button varyant taraması

Bu devam turunda claim dışındaki en küçük CTA standardizasyonu yapıldı. Kapsam watch boş/hata CTA'ları ve upload başarı panelindeki ana CTA ile sınırlı tutuldu.

### Uygulanan mikro-fix

1. **Watch boş/hata CTA'ları sadeleşti.** `/watch` içinde `cid` yokken ve event bulunamazken görünen `Browse Screenings` butonları artık `variant="outline"` dışında beyaz border/hover override'ı taşımıyor.

2. **Upload başarı ana CTA'sı `variant="near"` kullanıyor.** Publish başarı panelindeki `Watch` butonu artık elle `bg-near-green text-near-black hover:bg-near-green/90` yazmak yerine `variant="near"` kullanıyor.

3. **Kapsam dışı bırakılanlar.** Upload başarı panelindeki ikincil `Discover` ve `Copy` butonları near-green aksanlı semantik link gibi davranıyor; bu turda değiştirilmedi. Upload başarı paneli gerçek publish sonrası göründüğü için bu parça runtime görsel smoke'ta render edilmedi.

### Bu turdaki doğrulama durumu

`npm run lint` temiz geçti. `npm test -- --run __tests__/unit/gift-service.test.ts` geçti (33 test). `npm run build` geçti; eski Sentry/Prisma/OpenTelemetry dynamic dependency uyarısı devam ediyor ve bu değişiklikle ilişkili görünmüyor.

Build sonrası `npm run start -- --hostname 127.0.0.1 --port 3001` ile production smoke yapıldı. Playwright ile desktop `1280x900` ve mobile `390x844` viewport'larında `/upload`, `/watch`, `/watch?cid=missing-smoke`, `/discover` rotaları `200` döndü; her ekranda `navCount=1`; console error/warning yoktu; yatay taşma yoktu. Watch boş/hata CTA'ları görsel olarak kontrol edildi. Upload başarı CTA'sı statik kod + build ile doğrulandı; gerçek publish sonrası ayrı görsel smoke gerektirir. Screenshot çıktıları: `/private/tmp/youtick-ui-smoke-2026-05-18-upload-watch-button-variant/`.

### Sıradaki en küçük güvenli iş

Kalan güvenli iş upload tarafında: başarı panelini gerçek publish/mock state ile görsel smoke etmek veya upload formundaki küçük prompt chip butonlarının 44px dokunma hedefi eksiklerini ele almak.

---

## 20. Devam notu — upload prompt chip dokunma hedefleri

Bu devam turunda upload formundaki açıklama hint chip'leri ele alındı. Önceki smoke çıktısında bazı chip'ler yaklaşık 26px yükseklikteydi; hedef 44px dokunma alanına yaklaşmaktı.

### Uygulanan mikro-fix

1. **Açıklama hint chip'leri büyütüldü.** `UploadForm` içindeki dört açıklama hint butonu `min-h-11`, daha rahat padding ve `text-xs` kullanıyor.

2. **Uzun metinler taşmadan kalıyor.** Chip'lerde `max-w-full`, `text-left` ve `leading-snug` kullanıldı; mobilde uzun iki chip iki satıra taşarak 51px yüksekliğe çıktı.

3. **Kapsam dışı bırakılanlar.** Upload formunun ana publish butonu, seçenek kartları ve gerçek publish başarı paneli bu turda değiştirilmedi.

### Bu turdaki doğrulama durumu

`npm run lint` temiz geçti. `npm test -- --run __tests__/unit/gift-service.test.ts` geçti (33 test). `npm run build` geçti; eski Sentry/Prisma/OpenTelemetry dynamic dependency uyarısı devam ediyor ve bu değişiklikle ilişkili görünmüyor.

Build sonrası `npm run start -- --hostname 127.0.0.1 --port 3001` ile production smoke yapıldı. Playwright ile desktop `1280x900` ve mobile `390x844` viewport'larında `/upload` rotası `200` döndü; `navCount=1`; console error/warning yoktu; yatay taşma yoktu. Chip ölçüleri desktop'ta 44px; mobile'da 44px/51px olarak doğrulandı. Screenshot çıktıları: `/private/tmp/youtick-ui-smoke-2026-05-18-upload-prompt-chips/`.

### Sıradaki en küçük güvenli iş

Kalan güvenli iş upload başarı panelini gerçek publish/mock state ile görsel smoke etmek. Kod tarafında küçük aday olarak upload formundaki ana `Pay & Publish` butonunun 36px yüksekliğini 44px çizgisine yaklaştırmak değerlendirilebilir; bu daha görünür bir form ritmi değişimi olduğu için ayrı smoke ile yapılmalı.

---

## 21. Devam notu — upload Pay & Publish dokunma hedefi

Bu devam turunda upload formundaki ana publish CTA'sı ele alındı. Önceki smoke ölçümünde `Pay & Publish` butonu 36px yükseklikteydi; hedef 44px dokunma alanına çıkarmaktı.

### Uygulanan mikro-fix

1. **Ana publish butonu 44px oldu.** `UploadForm` içindeki `Pay & Publish`/publish CTA'sı `h-11 w-full` kullanıyor.

2. **Davranış değişmedi.** Disabled koşulları, upload handler, loading içeriği ve metinler aynen kaldı.

3. **Kapsam dışı bırakılanlar.** Upload başarı paneli gerçek publish sonrası göründüğü için bu turda ayrıca mock edilmedi.

### Bu turdaki doğrulama durumu

`npm run lint` temiz geçti. `npm test -- --run __tests__/unit/gift-service.test.ts` geçti (33 test). `npm run build` geçti; eski Sentry/Prisma/OpenTelemetry dynamic dependency uyarısı devam ediyor ve bu değişiklikle ilişkili görünmüyor.

Build sonrası `npm run start -- --hostname 127.0.0.1 --port 3001` ile production smoke yapıldı. Playwright ile desktop `1280x900` ve mobile `390x844` viewport'larında `/upload` rotası `200` döndü; `navCount=1`; console error/warning yoktu; yatay taşma yoktu. `Pay & Publish` butonu desktop ve mobile'da 44px ölçüldü. Screenshot çıktıları: `/private/tmp/youtick-ui-smoke-2026-05-18-upload-pay-publish-button/`.

### Sıradaki en küçük güvenli iş

Upload başarı panelini gerçek publish/mock state ile görsel smoke etmek hâlâ en net kalan doğrulama işi. Kod tarafında ise daha fazla upload form değişimi artık daha görünür olur; bir sonraki turda önce mock/smoke yaklaşımı seçilmeli.

---

## 22. Devam notu — çeviri toggle/logo çakışması

Kullanıcı kontrolünde çeviri toggle'ının logo alanına yakın durduğu ve nav içinde kalabalık yarattığı görüldü. İlk nav-band denemesi görsel olarak yeterli olmadı; bu turda toggle sağ alt köşeye taşındı.

### Uygulanan mikro-fix

1. **Toggle nav dışına taşındı.** `LanguageSwitcher` artık sağ alt köşede sabit duruyor; logo ve ana nav linkleriyle yarışmıyor.

2. **Boyut ve davranış değişmedi.** Dil değiştirme metni, buton yüksekliği ve click davranışı aynen kaldı.

### Bu turdaki doğrulama durumu

Local `http://127.0.0.1:3000` üzerinde Playwright ölçümü yapıldı. `/`, `/discover`, `/upload` rotalarında `280`, `320`, `390`, `768`, `1280` px genişliklerinde logo-toggle ve toggle-menü çakışması yok; yatay taşma yok. `/discover` için mevcut LCP image uyarısı görülüyor, bu konum düzeltmesiyle ilişkili değil.

---

## 23. Kapatma notu — publish sonrası kullanıcı kontrolü

Kullanıcı canlı publish akışını kontrol etti ve publish sonrası başarı yüzeyinin iyi göründüğünü bildirdi. Bu nedenle önceki "upload başarı paneli gerçek publish/mock state ile görsel smoke edilmeli" maddesi kapatma kontrolü olarak tamamlandı.

### Kapanış durumu

1. **Publish başarı paneli görsel olarak kabul edildi.** Gerçek publish kontrolünde panelin kötü duran veya bloke eden bir problemi raporlanmadı.

2. **Ana UI/UX hızlı kazanım paketi kapatıldı.** Kalan işler artık publish'i bloke eden ana değişiklik değil; sonraki faz tasarım sistemi sıkılaştırması olarak ele alınabilir.

3. **Son kalite kapısı temiz geçti.** Kapatma için `npm run lint`, `npm test -- --run __tests__/unit/gift-service.test.ts`, `npm run build` ve `git diff --check` son kez çalıştırıldı. Build'de eski Prisma/OpenTelemetry dynamic dependency uyarısı devam ediyor; paket değişikliğiyle ilişkili görünmüyor.

---

*Hazırlayan: Claude Code — statik kod incelemesi. Güncel durum: ana UI/UX hızlı kazanım paketi kapatıldı.*
