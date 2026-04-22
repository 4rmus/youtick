# Plan: Landing Page Marketing Rework

> Oluşturma tarihi: 2026-04-22
> Durum: P0 uygulanıyor — Round 1 (286cc55) + Round 2 (commit bekliyor)
> Kapsam: `apps/web/app/page.tsx` ve `apps/web/components/landing/*`, `apps/web/lib/translations.ts`

## Hipotez

Mevcut landing page pazarlama mimarisi tek taraflı (creator-centric). Film ve konser gibi
içeriklerin satışı için iki taraflı pazar dili gerekir: izleyici çekilmeden creator gelmez.
Ayrıca "98% sana" mesajı soyut — somut film/konser senaryolarıyla desteklenmediği için
sanatçı güveni düşük kalıyor.

## Teşhis Özeti

Landing'de tespit edilen ana sorunlar:

- Hero ve tüm CTA'lar creator odaklı; izleyici CTA'sı küçük alt satırda
- "Film" ve "konser" kelimesi sadece iki cümlede geçiyor (`event_centric`, `use_cases`)
- "98%" mesajı 15+ yerde tekrarlanıyor ama somut senaryo yok
- ROI Calculator ticari olarak iyi fakat film/konser preset'i yok
- Terminoloji tutarsız: "NFT Ticket", "Digital Ticket", "Access Pass" karışık
- `PainPointsSection` + `ValuePropositionSection` + `FinancialComparisonChart` üçü aynı
  mesajı tekrar ediyor (redundancy)
- Rakip karşılaştırması bağlamsız (Spotify %70 — label dahil — etiketsiz gösteriliyor)
- Roadmap landing'de; bu "şu an eksik" izlenimi veriyor
- İzleyici için hiçbir özel bölüm, hikâye veya trust signal yok
- `trial` akışı var ama izleyici değerini anlatmıyor
- Hediye bileti feature'ı landing'de sadece 1 kart (güçlü bir viral kanal gömülü)

## Yapılan Plan Revizyonu (self-check sonrası)

1. P0'daki "stats'leri gizle" maddesi düşürüldü — stats bloku zaten hiçbir component'te
   render edilmiyor (grep ile doğrulandı). Madde "ölü çeviri temizliği"ne indirgendi.
2. "Finansal grafik dürüstleştir" reframe edildi: rakamları silmek yerine yanlarına
   iş modeli etiketi ve benzer modeldeki rakipler (Vimeo OTT, Gumroad, Ticketmaster).
3. "Hero CTA çevirme" P0'dan P1'e alındı; önce **analitik kurulumu** gerekiyor, bilinçli
   A/B testi olmadan uygulanmamalı.

## Öncelikli Aksiyonlar

### P0 — Bu hafta (metin + section sırası, düşük kod riski)

- [x] **Terminoloji birliği** — Round 1 (286cc55): "NFT Ticket" / "Access Pass" /
      "Erişim Kartı" / "NFT Bilet" → "Digital Ticket" / "Dijital Bilet" sweep yapıldı.
      "NFT" sadece mint status akışında kaldı (teknik bağlam).
- [x] **Roadmap taşındı** — Round 1 (286cc55): `/roadmap` route'u oluşturuldu,
      landing'den çıkarıldı. Nav'da kırık link yok (zaten referans yoktu).
- [x] **Üçlü tekrar çözüldü** — Round 2: `ValuePropositionSection` silindi (dosya + çeviri
      blokları); "%98" emotional anchor `PainPointsSection` header'ına taşındı;
      pain/solution kartlarındaki `revenue_youtick` / `censorship_youtick` /
      `fan_youtick` metinleri **somut film/konser senaryosu** ile zenginleştirildi
      (10$'dan 500 konser bileti = 4.900$ vs. streaming örnekleri, copyright bot,
      region lock vb.); alt "98% • 0 • ∞" CTA kaldırıldı. Sonuç: 3 section → 2 section.
- [x] **`FinancialComparisonChart` bağlamlaştırıldı** — Round 1 (286cc55): Netflix
      çıkarıldı; Vimeo OTT (%10) + Gumroad (%10) eklendi (aynı model); YouTube/Spotify
      "farklı model" olarak etiketlendi; başlık "50x" → dürüst "5-35x daha az".
- [x] **Ölü kod temizliği** — Round 1 (286cc55): `translations.ts` içindeki dört
      adet `stats` bloku silindi (EN+TR, top-level `hero.stats` ve `landing.stats`).
      Hiçbir component'te render edilmiyordu.
- [ ] Analitik kurulumu: plausible veya umami. CTA click event tracking. **Bu madde
      P1 aksiyonlarının ön koşulu.**

### P1 — 1-2 hafta (yapısal, test gerektiren)

- [ ] ROI Calculator'a 3 preset: "Konser Kaydı" (5$-20$, 100-500 bilet), "Bağımsız Film"
      (3$-10$, 200-2000 bilet), "Masterclass" (20$-100$, 50-500 bilet).
- [ ] İki kolonlu değer önerisi bölümü: "İzleyiciysen ne kazanırsın" + "Sanatçıysan ne
      kazanırsın". Mevcut üç redundant section'ın yerine geçer.
- [ ] `StartSlider` üstüne mikro-kategori chip'leri (Konser, Bağımsız Film, Belgesel,
      Masterclass, Stand-up). Tıklama filtreli discover'a yönlendirir.
- [ ] Nasıl Çalışır bölümünü iki akışa böl (izleyici / sanatçı tab veya yan yana).
- [ ] **A/B test (analitik kurulduktan sonra):** Hero birincil CTA = "Konserleri Keşfet",
      ikincil = "Sanatçıysan Yükle". Başarı metriği: CTA click → meaningful action
      (discover'da ≥3 tıklama veya upload başlangıcı) conversion oranı.
- [ ] Çift hedef kitle dili: Web3-native pitch ayrı (NFT, sahiplik vurgusu),
      mainstream pitch ayrı (dijital bilet, sanatçıya destek).

### P2 — 1 ay (yeni yetenekler)

- [ ] Creator vitrin sayfası + landing'de tanıtım kartı (ilk 5-10 sanatçı için).
- [ ] "Haftanın Konseri" / "Öne Çıkan" editöryal rozet sistemi; `StartSlider` rastgele
      olmaktan çıkar.
- [ ] 30 saniyelik ücretsiz önizleme/fragman — paylaşılabilir içerik + viral döngü.
- [ ] Somut case study: "X sanatçısı 3 ayda Y kazandı" (gerçek veri olunca).
- [ ] Hediye bileti için landing'de bağımsız bölüm + shareable template'ler.
- [ ] SEO: per-section meta, OG image, yapılandırılmış veri (VideoObject, Event).
- [ ] Mobile-first audit: hero, slider, ROI calculator mobilde test.

## Risk ve Sınırlamalar

- **Analitik verisi yok:** Hero CTA sırası, bölüm sıralaması, kategori chip tıklamaları
  ölçülmeden iyileştirme yapmak kör uçuş. P0 son maddesi kritik.
- **Gerçek kullanıcı/sanatçı yok:** Social proof, case study, stats blokları verisiz
  yazılamaz. Bu olmadan mesaj güçsüz kalır.
- **İki hedef kitle = iki dil riski:** Web3-native ve mainstream kullanıcılar için
  aynı sayfada konuşmak jargon çatışması yaratabilir. Segmentasyon ya sayfa içi
  (iki kolon) ya da ayrı landing variant'ı olarak çözülmeli.
- **TR/EN parite:** `CLAUDE.md` "Preserve TR and EN copy parity" kuralı. Her metin
  değişikliği iki dilde yapılacak.
- **Roadmap kaldırma karşı görüşü:** Bazı startup'lar yatırımcı güveni için roadmap'i
  landing'de tutar. Karar kullanıcıya bırakıldı.

## Başarı Kriterleri (analitik kurulduktan sonra ölçülecek)

- Landing → discover tıklama oranı: baseline +%50
- Landing → upload başlangıcı: baseline koruma (azalmamalı)
- Ortalama scroll depth: baseline +%20
- Trial hesap oluşturma: baseline +%30
- Bounce rate: baseline -%15

## Sonraki Adım

Kullanıcı onayı sonrası P0 maddelerinden `translations.ts` terminoloji sweep + Roadmap
taşıma + ölü stats temizliği tek PR'da (düşük risk). Analitik kurulumu ayrı PR.
P1 ve P2 ayrı PDCA döngüleri olarak işlenecek.
