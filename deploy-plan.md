  YouTick Uçtan Uca Analiz & Değerlendirme Raporu (Doğrulanmış — Nihai)
  ═════════════════════════════════════════════════════════════════════
  Tarih: 23 Nisan 2026
  Referanslar: NEAR SDK 5.5.0, Cloudflare Workers/KV/Durable Objects Docs, Crust Network Wiki/W3Auth, Cure53 SSS Audit, Trail of Bits Cryptography Disclosure
  ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  1. Executive Summary & Skor Kartı
   Boyut                       Skor       Durum
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Kod Kalitesi & Tutarlılık   6.5 / 10   Frontend test kapsamı iyi; kontrat monolitik (3.718 satır); deprecation birikimi var
   Mimari & Merkeziyetsizlik   4.0 / 10   Kriptografik olarak güçlü ama altyapıda tek nokta başarısızlığı (SPOF) hakim
   Güvenlik                    4.0 / 10   3 kritik zafiyet doğrulandı; anahtar yönetimi ve sözleşme yetkilendirme açıkları var
   Dokümantasyon Uyumu         5.0 / 10   Mainnet deploy sorunları aktif olarak gizleniyor; kod-doc uyumsuzluğu yaygın
  Genel Proje Sağlığı: 5 / 10 — Yayında ve işlevsel, ancak kritik güvenlik açıkları ve merkezileşme riskleri nedeniyle acil müdahale gerektiriyor.
  ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  2. Teknik Doğrulama Referansları
  Her kritik iddiamı kod, doküman ve harici kaynaklarla teyit ettim:
   İddia                                     Kod/Dosya Referansı                                   Harici Kaynak                                          Sonuç
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   reset_v11 herhangi hesapla çağrılabilir   contracts/nft-ticket/src/lib.rs:400-404               NEAR SDK #[init(ignore_state)] mevcut state'i deseri   ✅ Doğrulandı — Kritik
                                                                                                   alize etmez; env::state_read() gereklidir
   Secret key'ler repo'da                    .near-credentials/testnet/*.json (7 adet)             Git history'den filter-repo ile temizlenmeli           ✅ Doğrulandı — Kritik
   Custom Shamir SSS                         apps/web/lib/kms/shares.ts                            Cure53 Privy audit (PVY-01-002): zero coefficient ri   ✅ Doğrulandı — Kritik
                                                                                                   ski; Trail of Bits: SSS side-channel zafiyetleri
   Onboarding key public bundle              apps/web/.env.example:28, OnboardingKeyInit.tsx:16-   Next.js NEXT_PUBLIC_* değişkenleri build'te client J   ✅ Doğrulandı — Yüksek
                                             17                                                    S'ine gömülür
   Cloudflare tek SPOF                       scripts/config/mainnet-kms-operators.json             Tüm 5 endpoint *.workers.dev; CF KV encrypted-at-res   ✅ Doğrulandı — Yüksek
                                                                                                   t (AES-256-GCM) ama platform tek nokta başarısızlığı
   Pause bypass prepaid yollarında           lib.rs:1526-1577, 2053-2139                           assert_not_paused() eksik                              ✅ Doğrulandı — Yüksek
   Dokümanlar mainnet sorununu gizliyor      deploy-plan.md var; docs/roadmap.md "Mainnet launch   Disclosure yok                                         ✅ Doğrulandı — Yüksek
                                             " tamamlandı olarak gösteriyor
  ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  3. Kritik Bulgular (Acil Aksiyon — 24-48 Saat)
  🔴 KRİTİK-1: reset_v11 — Herhangi Bir NEAR Hesabı Tüm State'i Silebilir
  • Kod: contracts/nft-ticket/src/lib.rs:400-404
  • Doğrulama:
    #[init(ignore_state)]
    pub fn reset_v11(owner_id: AccountId) -> Self {
      require!(
          env::predecessor_account_id() == owner_id,
          "Only proposed owner can reset state"
      );
    #[init(ignore_state)] NEAR SDK 5.x'te mevcut Contract state'ini deserialize etmez. self erişilemez. owner_id argüman olarak gelir. alice.near çağırıp owner_id: "alice.near"
    rirse kontrol geçer ve kontrat sıfırlanır.
  • NEAR SDK Referansı: Migration pattern'lerinde #[init(ignore_state)] kullanıldığında yetkilendirme env::state_read::<OldContract>() ile eski state'ten okunmalıdır.
  • Etki: Tek transaction ile tüm event'ler, NFT'ler, purchase log'lar, havuz bakiyeleri yok olur.
  • Aksiyon: Aşağıdaki gibi patch'le ve asla mainnet'e deploy etme:
    let old_owner: AccountId = env::state_read::<Contract>()
      .map(|c| c.tokens.owner_id.clone())
      .unwrap_or_else(|| env::panic_str("No existing state"));
    require!(env::predecessor_account_id() == old_owner, "Only owner can reset");
  🔴 KRİTİK-2: Gerçek Ed25519 Secret Key'ler Git Repository'sinde
  • Kod: .near-credentials/testnet/*.json — 7 adet dosya, her biri secret_key içeriyor.
  • Doğrulama: ed25519:... formatında 64-byte secret key'ler açık metin olarak commit edilmiş.
  • Etki: Repo public olursa veya erişim sızdırılırsa testnet hesapları tamamen ele geçirilir. Aynı pratik mainnet için de kullanılıyorsa mainnet riski vardır.
  • Aksiyon:
    1. git filter-repo --path .near-credentials/ --invert-paths ile history'den sil
    2. Tüm exposed key'leri rotate et
    3. .gitignore'da .near-credentials/ aktif (zaten var ama commit öncesi eklenmemiş)
  🔴 KRİTİK-3: Custom Shamir Secret Sharing (SSS) Implementasyonu
  • Kod: apps/web/lib/kms/shares.ts — GF(256) üzerinde el yazması SSS.
  • Doğrulama: splitSecretIntoShares ve reconstructSecretFromShares fonksiyonları mevcut. randomByte() crypto.getRandomValues kullanıyor (iyi), ancak:
    • Zero coefficient problemi: Cure53 Privy auditinde (PVY-01-002) bulunan aynı sorun — requiredShares-1 dereceli katsayının sıfır olma olasılığı var. Kodda coefficients.push(
      omByte()) sıfır kontrolü yapmıyor. Bu, teorik olarak (t-1, n) scheme'e düşme riski taşır.
    • Timing side-channel: gfMul() bitwise loop ile implemente edilmiş; constant-time değil.
    • Share integrity yok: Reconstruction öncesi share doğruluğu (checksum/verifiable SSS) kontrol edilmiyor. Casa ve Trail of Bits raporlarına göre bu, fake share saldırılarına
      k.
  • Aksiyon: secrets.js-grempe, sssa-js veya openfort-shamir (Cure53 onaylı) gibi denetlenmiş kütüphane ile değiştir. En azından property-based test (10.000+ rastgele secret/sha
    kombinasyonu) ekle.
  ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  4. Yüksek Riskli Bulgular (1-2 Hafta İçinde)
  🟠 YÜKSEK-1: Cloudflare = Tek Platform Başarısızlık Noktası
  • Kod: scripts/config/mainnet-kms-operators.json — tüm 5 operatör *.workers.dev domain'inde.
  • Cloudflare Referansı: CF KV AES-256-GCM encrypted-at-rest ve TLS-in-transit sağlar. Ancak bu Cloudflare'in encryption'ıdır; platform hesabı askıya alınırsa veya KV namespace
    ilinirse veri erişilemez.
  • Etki: Cloudflare hesabı askıya alınırsa, zincirde NFT'niz var ama hiçbir video oynatılamaz (share'ler KV'de, başka yerde yok).
  • Aksiyon: En az 2 operatörü Fly.io, AWS Lambda veya Deno Deploy gibi farklı altyapıya taşı. Operatör başına farklı cloud provider.
  🟠 YÜKSEK-2: Onboarding Key Client Bundle'ında ve localStorage'da
  • Kod: apps/web/.env.example:28, OnboardingKeyInit.tsx:16-17
  • Doğrulama: NEXT_PUBLIC_ONBOARDING_KEY Next.js build'inde client JS'ine gömülür. Tarayıcı "View Source" ile görülebilir. localStorage.setItem(storageKey, ...) ile kalıcı sakl
    ıyor.
  • Etki: Saldırgan key'i alıp trial havuzunu boşaltabilir, daily limit'i DoS edebilir.
  • Aksiyon: Key'i sunucu taraflı (/api/onboarding-key), rate-limitli ve Turnstile-korumalı endpoint ile dağıt. Mevcut key'i rotate et.
  🟠 YÜKSEK-3: Mainnet Operatör Topolojisi ve Endpoint'leri Repo'da Açık
  • Kod: scripts/config/mainnet-kms-operators.json — gerçek accountId, endpoint, transportPublicKey değerleri.
  • Etki: Saldırgan hedefli operatör saldırıları için bilgi toplar. Koordineli 3 operatör ele geçirme saldırısı planlanabilir.
  • Aksiyon: Dosyayı mainnet-kms-operators.example.json ile değiştir (fake endpoint'ler). Gerçek config'i 1Password/HashiCorp Vault gibi secret manager'da tut.
  🟠 YÜKSEK-4: Pause Bypass — prepaid Yolları Durdurulmuyor
  • Kod: create_event_prepaid ve nft_mint_prepaid fonksiyonları assert_not_paused() çağırmıyor.
  • NEAR Referansı: Pause pattern'inde tüm state değiştiren public fonksiyonlar kontrol edilmelidir.
  • Etki: Acil durumda kontrat pause edilse bile, aktif upload session'ı olan saldırgan minting yapmaya devam eder.
  • Aksiyon: Tüm state değiştiren pub fn'lere self.assert_not_paused() ekle.
  🟠 YÜKSEK-5: Mainnet State Tutarsızlığı ve Docs'ta Gizlenmesi
  • Kod/Doküman: deploy-plan.md (doğru), docs/roadmap.md (yanlış — "Mainnet launch tamamlandı" yazıyor, sorun yok gibi).
  • Doğrulama: Deploy edilmiş WASM HEAD'ten eski (~commit 99f07bd/afd4231). nft_total_supply = 0 ama 33 trie girişi var.
  • Etki: Kullanıcılar ve katkıda bulunanlar mainnet'in sağlıklı olduğunu sanıyor. reset_v11 planı sadece deploy-plan.md'de var, halka açık dokümanda yok.
  • Aksiyon: docs/operations/known-issues.md oluştur; mainnet durumunu, planlanan reset'i ve riskleri açıkla. docs/roadmap.md'ye uyarı ekle.
  ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  5. Kod Kalitesi & Mimari Borç Özeti
   Sorun                                   Konum                                    Etki                                             Referans
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   3.718 satırlık God Contract             contracts/nft-ticket/src/lib.rs          12 alt sistem tek dosyada; review imkansız; at   NEAR best practice: modüler kontratlar
                                                                                    tack surface devasa
   1.742 satırlık monolitik KMS            workers/youtick-kms/src/index.ts         CORS, crypto, rate limit, KV, auth, route hand   Cloudflare best practice: module separation
                                                                                    ler bir arada
   Deprecated API kullanımı                lib.rs (6+ yerde #[allow(deprecated)])   env::promise_result(0) NEAR SDK 5.x'te depreca   NEAR SDK 5.5.0 migration guide
                                                                                    ted; gelecekte kırılma riski
   Front-end/Back-end validasyon tekrarı   UploadForm.tsx + lib.rs                  Fiyat limitleri, username kuralları iki taraft   OWASP: client validation bypass
                                                                                    a da yazılmış
   unsafe as type assertions               apps/web/lib/kms/client.ts               JSON.parse sonuçları runtime doğrulanmıyor       TypeScript strict mode best practice
   0 in-repo unit test (main contract)     contracts/nft-ticket                     Regresyon riski yüksek                           near_sdk::test_utils::VMContextBuilder
   Cargo.toml tutarsızlığı                 3 kontrat arası                          Versiyon formatı, feature set farklı             Rust workspace best practice
  ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  6. Dokümantasyon Uyumsuzlukları (Doğrulanmış)
   Doküman Ne Diyor                                               Kod Gerçeği                                                      Şiddet
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   contract-methods.md: add_onboarding_key "Kaldırıldı"           lib.rs:1089 — Aktif, owner-only, kritik                          🔴 Kritik
   smart-contract.md: set_nova_group mevcut                       V10 migration'da silindi; sadece StorageType::Nova placeholder   🔴 Yüksek
   overview.md: Trial'da "ana yol relayer"                        Relayer deprecated; onboarding key ana yol                       🔴 Yüksek
   contract-methods.md: reset_v11 hem Aktif hem Eski              Aktif admin fonksiyonu; çelişkili listeleme                      🟡 Orta
   contract-methods.md: Timelock fonksiyonları yok                propose_action, execute_action implemente ama dokümanda yok      🟡 Orta
   contract-methods.md: pause/unpause yok                         Implemente (lib.rs:936-953) ama dokümanda yok                    🟡 Orta
   kms-key-rotation.md: reencrypt-operator-shares.mjs referansı   Dosya mevcut değil                                               🟡 Orta
   getting-started/installation.md: Minimum env eksik             Access + Registry ID'leri zorunlu ama listede yok                🟡 Orta
   release-runbook.md: CHANGELOG.md bekliyor                      Dosya mevcut değil                                               🟢 Düşük
  ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  7. Merkeziyetsizlik Değerlendirmesi (Güncellenmiş)
  Sonuç: "Kriptografik hibrit, merkezi altyapı çapaları var"
   Katman                Durum                     Değerlendirme
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Sahipliğin kaydı      ✅ Merkeziyetsiz          NEAR zincirinde; NFT'ler ve event'ler değiştirilemez
   Frontend barındırma   ✅ Kısmen merkeziyetsiz   youtick.near.page (Web4) fallback var; DNS sansürü aşılabilir
   İçerik şifreleme      ✅ Merkeziyetsiz          Tarayıcıda AES-CTR; platform operatörü videoyu çözemez
   Anahtar emanet        ❌ Merkezi                Tüm 5 operatör Cloudflare Workers + KV'de. CF hesabı askıya alınırsa = tüm içerik ölü
   Yönetişim             ❌ Merkezi                Tek owner; timelock 24s var ama yine de tekelleşme
   Pinning               ❌ Merkezi                Sadece Crust Network; Filecoin/Storacha yedek yok
   İçerik bütünlüğü      ⚠️ Eksik                   AES-CTR kullanılıyor; ciphertext integrity doğrulanmıyor (HMAC/GCM yok). CF KV encrypted-at-rest ama bu Cloudflare katmanında
  Cloudflare KV Güvenlik Notu: Cloudflare dokümanlarına göre KV verileri AES-256-GCM ile encrypted-at-rest ve TLS ile in-transit. Ancak bu, Cloudflare platformunun encryption'ıd
  ır. YouTick operatörleri zaten share'leri kendi OPERATOR_SHARE_SECRET ile AES-GCM ile şifreliyor (HKDF ile derived key). Yani double encryption var, ama platform tek nokta baş
  arısızlığı değişmez.
  ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  8. Aşama Aşama Yol Haritası
  ⚡ FAZ 1: ACİL (0-48 Saat) — Güvenlik ve Durma Noktaları
   #   Görev                                                          Neden                                       Teknik Referans    Durum
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   1   reset_v11 patch'le: env::state_read() ile eski owner'ı oku     Herhangi hesap state silebilir              NEAR SDK           ✅ Tamam
                                                                                                                                   #[init(ignore_state)]
                                                                                                                                   pattern
   2   Secret key'leri history'den temizle ve rotate et               Repo'da açık ed25519 secret key             Git filter-repo,   ✅ Tamam
                                                                                                                                   BFG Repo-Cleaner
   3   Onboarding key'i rotate et ve NEXT_PUBLIC_ prefix'ini kaldır   Key client bundle'ında ve localStorage'da   Next.js env var    ✅ Tamam
                                                                                                                                   semantics
   4   mainnet-kms-operators.json'u sil veya dummy veriyle değiştir   Production endpoint'ler açık                Secret management  ✅ Tamam
                                                                                                                                   best practice
   5   Dokümanlara "Known Issues" ekle                                Mainnet durumu gizleniyor                   Transparency best  ✅ Tamam
                                                                                                                                   practice
  🔧 FAZ 2: KISA VADELİ (1-2 Hafta) — Güvenlik Açıklarını Kapatma
   #    Görev                                                                       Neden                                             Teknik Referans    Durum
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   6    Pause bypass kapat: create_event_prepaid, nft_mint_prepaid ve diğer state   Acil durumda kontrat durdurulamıyor               NEAR pause pattern    ✅ Tamam
        değiştiren fonksiyonlara assert_not_paused() ekle
   7    KMS /retrieve hata mesajlarını normalize et                                 Video ID enumeration mümkün                       OWASP error handling  ✅ Tamam
   8    Access cache TTL'lerini düşür ve invalidation mekanizması ekle              Revoke edilmiş key/NFT hâlâ cache'den çalışıyor   Cache invalidation      ✅ Tamam
                                                                                                                                    best practice
   9    Docs düzeltmeleri: contract-methods.md, smart-contract.md, overview.md      Kod-doc uyumsuzluğu                               Doküman sync checklist  ✅ Tamam
   10   web4-proxy worker testleri ekle                                             Şu an 0 test                                      Cloudflare              ✅ Tamam
                                                                                                                                    @cloudflare/vitest-
                                                                                                                                    pool-workers
   11   CSP (Content Security Policy) implemente et                                 XSS etkisini azaltır                              next.config.ts headers  ✅ Tamam
  🏗️ FAZ 3: ORTA VADELİ (1-3 Ay) — Mimari ve Kalite İyileştirme
   #    Görev                                                                                       Neden                                     Teknik Referans
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   12   Kontratı modüllere ayır: events.rs, minting.rs, gift.rs, commission.rs, timelock.rs, web4   3.718 satır tek dosya sürdürülemez        Rust module system
        .rs
   13   KMS worker'ı refactor et: src/routes/, src/crypto/, src/near/, src/auth/                    1.742 satır monolit                       Cloudflare Workers best practices
   14   Custom Shamir'ı değiştir veya audit et                                                      Cure53 ve Trail of Bits SSS zafiyetleri   secrets.js-grempe, openfort-shamir
   15   Runtime schema validation ekle (Zod/Valibot)                                                JSON.parse sınırları type-safe değil      Zod schema validation
   16   nft-ticket unit testleri yaz (VMContextBuilder)                                             Regresyon riski                           near_sdk::test_utils
   17   Cargo.toml'ları standartlaştır                                                              Versiyon/feature tutarsızlığı             Rust workspace统一管理
   18   UploadForm iş mantığını hook/service'a çıkar                                                1.088 satır component test edilemez       React hooks architecture
   19   İkinci pinning sağlayıcı ekle (Storacha/Filecoin)                                           Crust tek SPOF                            Crust + Filecoin dual pinning
   20   Minimum ticket price ekle (0.001 NEAR)                                                      Commission rounding'den kaçınma           Fixed-point arithmetic
  🌐 FAZ 4: UZUN VADELİ (3-12 Ay) — Merkeziyetsizleştirme ve Dayanıklılık
   #    Görev                                                             Neden                                       Teknik Referans
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   21   God contract'ı parçala: yt-events, yt-tickets, yt-payments        Attack surface azaltma; upgrade kolaylığı   NEAR cross-contract calls
   22   DAO / multi-sig yönetimine geç                                    Registry ve Market owner tekelleşmesi       NEAR DAO tools, SputnikDAO
   23   Altyapı çeşitlendirme: 2+ operatörü Cloudflare dışında çalıştır   Platform SPOF'u kaldırma                    Fly.io, AWS Lambda, Deno Deploy
   24   On-chain encrypted share backup veya social recovery              KV kaybına karşı dayanıklılık               NEAR on-chain storage, threshold encryption
   25   Chain-native threshold cryptography araştır                       NEAR Chain Signatures veya Lit Protocol     NEAR Chain Signatures docs
   26   AES-CTR'yi AES-GCM veya ChaCha20-Poly1305 ile değerlendir         Ciphertext integrity doğrulanmıyor          NIST AEAD standards
   27   End-user dokümanları ekle                                         Sadece developer docs var                   User experience best practice
   28   Otomatik secret scanning CI/CD'ye ekle                            Tekrar secret commit'ini önle               GitHub secret scanning, TruffleHog
  ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  9. Olumlu Bulgular (Korunması Gereken)
   Alan                          Açıklama                                    Referans
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Tarayıcı şifrelemesi          Ham video sunucuya plaintext gitmiyor       UploadForm.tsx encryption flow
   Threshold key custody         3-of-5 Shamir; tek operatör key çözemez     operator-registry threshold config
   Web4 fallback                 youtick.near.page sansür direnci            NEAR Web4 gateway
   RPC dayanıklılığı             Multi-provider failover                     FailoverRpcProvider
   Admin timelock                Hassas işlemlerde 24 saat gecikme           lib.rs:957-1024
   Two-step ownership transfer   Güvenli owner değişimi                      access-control, operator-registry
   Replay koruması               5 dakikalık timestamp penceresi             workers/youtick-kms/index.ts:161
   Rate limiting                 IP bazlı Durable Objects limiti             index.ts:1717-1742
   HKDF kullanımı                Share şifreleme için ham hash yerine HKDF   index.ts:889-917
   Fail-closed tasarım           RPC hatasında erişim reddi                  KMS worker error handling