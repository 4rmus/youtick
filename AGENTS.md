# YouTick Agent Sözleşmesi

Bu dosya Codex ve Claude Code için ortak proje sözleşmesidir. Kök dizine `CLAUDE.md` ekleme: Claude Code o durumda bu dosyayı okumayı keser. Claude'a özel, yola bağlı kurallar `.claude/rules/` altındadır; Codex onları okumaz, bu yüzden sınırlar burada özet olarak kalır.

## Yerleşim ve komutlar

- `apps/web` Next.js uygulaması · `contracts/nft-ticket`, `contracts/access-control` Rust NEAR kontratları · `workers/livepeer-bridge` Cloudflare Worker · `workers/relayer` V2 NEAR Auth relayer'ı (hesap, CKD, davet kredisi) · `workers/payment-service` V2 KDV beyanı (E8'de kart yolu) · `read-model` D1 şeması · `protocol/paid-media-livepeer-v1` şema ve golden vektörler · `docs` VitePress.
- Test ve kontrol komutlarının tek kaynağı `docs/testing.md`; dokunulan yola göre oradan seç. Kontratlar `cargo +1.86.0` ve `cargo-near 0.17.0` ile çalışır; `near-sdk =5.5.0` (`legacy`) sabittir.
- Sürüm ve release: `docs/release-runbook.md`, `docs/cloudflare-release.md`. Gerçek deploy yalnız korumalı GitHub workflow'larından yürür.

## Gate ve kapsam

- İşi gate'lere böl; her gate'in başında amaç, değiştirilebilecek dosyalar, yasak dosyalar, kabul kriterleri ve hedef doğrulamaları yaz.
- Varsayılan otonomdur: gate'leri sırayla sürdür, sonunda tek rapor ver. Yalnız onay gerektiren bir işlemde, çıktıyı değiştirecek bir belirsizlikte veya teşhis edilemeyen bir hatada dur. Kullanıcı "adım adım" derse her gate sonunda dur.
- Bir milestone, bir dal, bir PR. Milestone, yol haritasındaki bir adım (ör. E3) veya kullanıcının tek seferde verdiği iştir; gate değildir. Gate'ler aynı dalda ayrı commit olur. Dalı ara gate'lerde push'lama; milestone bitince bir kez push'la ve PR'ı aç, çünkü her PR push'u ve her merge tam CI çalıştırır. Main'i kıran acil düzeltme ayrı PR olabilir. PR açıldığında squash auto-merge'ü etkinleştir; CI'ı oturumdan yoklama, başarısız kontrol bildirimi gelince düzelt.

## Sorumluluk ve katılımcılar

- Ana ajan kapsam, entegrasyon, çakışma çözümü ve final doğrulamadan sorumludur.
- Aynı gate'te yalnız bir write-capable katılımcı olabilir; toplam en fazla üç subagent, bunlardan biri write-capable ise en fazla iki salt-okunur. Bu üst sınırdır, hedef değil; basit işi ana ajan kendisi yapar.
- Roller: araştırmacı kaynak ve sürüm farkını salt-okunur inceler; inceleyici değişiklikteki hata ve güvenlik etkisini salt-okunur değerlendirir (Claude Code'da `contract-reviewer` subagent'ı). Alt göreve dosya kapsamı, beklenen çıktı ve yasak işlemleri ver. Yazmayı devredersen ana ajan aynı anda dosya düzenlemez.

## Skill seçimi

- Proje skill'leri `.agents/skills/` altındadır; Claude Code aynı dizini `.claude/skills` symlink'i üzerinden görür. Yalnız ilgili skill'i ve gerektiği referansı oku; kataloğun tamamını yükleme.
- NEAR JS/RPC/işlem biçimi: `near-api-js` · mevcut cüzdan bağlantısı ve oturum arayüzü: `near-dapp` · Rust kontrat uygulaması: `near-smart-contracts` · güvenlik incelemesi: `near-contract-audit` · kontrat/ABI ve tüketici tutarlılığı: `youtick-contract-review` · USDC, iade ve ödeme uzlaştırması: `youtick-payment-flow` · 1Click/NEAR Intents API ayrıntısı: `near-intents`. V2 Google/passkey girişi, `ckd-gate` CKD ve bilet anahtarları: `youtick-near-auth`. V1 akışı cüzdan-only kalır.
- Önce ilgili manifest, lockfile, kurulu API ve çağıran kodu karşılaştır. Skill örnekleri mevcut SDK sürümünü, ağ seçimini veya mimariyi değiştirme yetkisi vermez: paket/toolchain yükseltme, ikinci cüzdan katmanı, state migration veya yeniden iskeletleme yapma.
- Kaynak sürümü ve güncelleme yöntemi `.agents/skills/SOURCES.md` içindedir. Kullanıcı genelindeki skill veya agent ayarlarını bu repo görevi kapsamında değiştirme.

## Güvenli çalışma

- Dirty çalışma alanını ve mevcut kullanıcı değişikliklerini koru; broad reset/restore/clean/stash ve geniş staging kullanma. Yalnız explicit-path değişiklik yap.
- Onay gerektirenler: deploy ve release, NEAR işlemi veya imza, provider ve canlı veri yazımı (D1 dahil), secret/credential, lockfile dışına çıkan bağımlılık veya toolchain yükseltmesi, CI tekrar çalıştırma, main'e doğrudan yazma. Commit, feature dalına push, PR açma ve auto-merge onay istemez; kilitler (deploy, force push, main'e push, secret okuma) talimattan bağımsız kapalıdır.
- `.env*`, `.dev.vars`, `~/.near-credentials` ve anahtar dosyalarını okuma veya yazma; JWT, cookie, özel anahtar loglama.

## Mimari sınırlar

- NEAR ekonomik ve entitlement otoritesidir; Livepeer medya katmanıdır; Bridge yalnız kontrol katmanıdır; D1 türetilmiş read model'dir. Bu sınırları bozma.
- Feature flag'lerin kapalı varsayımını değiştirme; kaynakta bulunması canlı aktivasyon kanıtı değildir.
- Kontratlarda storage prefix'leri, serileştirilmiş layout, ABI ve mevcut event'leri kapsam dışıysa koru; spekülatif migration ekleme.

## Kanıt ve sonuç

- Kanıt sınıfları: LOCAL_STATIC, LOCAL_TEST, CI, PROVIDER, PREVIEW, PRODUCTION, EXTERNAL_NOT_RUN, UNPROVEN. Yerel/mock/CI sonucunu provider, Preview, Production veya canlı runtime kanıtı sayma.
- Final sonuç: PASS / COMPLETED_WITH_WARNINGS / BLOCKED / FAILED; değişen dosyalar, doğrulananlar, çalıştırılmayanlar, blocker ve tek sonraki gate.
