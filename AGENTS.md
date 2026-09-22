# YouTick LP Codex Sözleşmesi

## Gate ve kapsam

- Her görevde yalnız bir aktif gate seç.
- Başlamadan amaç, değiştirilebilecek dosyalar, yasak dosyalar, kabul kriterleri ve hedef doğrulamalar yaz.
- Gate tamamlanınca raporla ve dur; sonraki gate'e otomatik geçme.

## Sorumluluk ve katılımcılar

- Main agent scope, entegrasyon, conflict resolution ve final doğrulamadan sorumludur.
- Aynı gate'te yalnız bir write-capable katılımcı olabilir.
- Aynı gate'te toplam en fazla üç subagent kullanılabilir; bunlardan biri write-capable ise en fazla iki salt-okunur subagent daha kullanılabilir.
- Bu sayı üst sınırdır, hedef değildir; çalışma ortamının daha düşük sınırı varsa onu kullan. Basit işi ana ajan tamamlar. Delegasyon yetkisi varsa yalnız bağımsız ve somut alt işleri devret; aynı araştırmayı birden fazla ajana yaptırma.
- Görev ayrımı: ana ajan uygulama ve entegrasyonu yürütür; araştırmacı ilgili kaynak/sürüm farkını salt-okunur inceler; inceleyici değişiklikteki hata ve güvenlik etkisini salt-okunur değerlendirir. Alt göreve dosya kapsamı, beklenen çıktı ve yasak işlemleri ver. Yazmayı devredersen ana ajan aynı anda dosya düzenlemez.

## Skill seçimi

- Proje skill'leri `.agents/skills/` altındadır. Yalnız ilgili skill ve gerektiği referansı oku; tüm kataloğu her görevde yükleme. Kullanıcı genelindeki skill veya agent ayarlarını bu repo görevi kapsamında değiştirme.
- NEAR JS/RPC/işlem biçimi: `near-api-js`; mevcut cüzdan arayüzü: `near-dapp`; Rust uygulaması: `near-smart-contracts`; güvenlik incelemesi: `near-contract-audit`.
- Google/Auth0/MPC ve oturum: `youtick-near-auth`; kontrat/ABI ve tüketici tutarlılığı: `youtick-contract-review`; USDC/1Click, iade ve ödeme uzlaştırması: `youtick-payment-flow`. Genel NEAR skill'ini yalnız gereken protokol ayrıntısı için ekle.
- Önce ilgili manifest, lockfile, kurulu API ve çağıran kodu karşılaştır. Resmî skill örnekleri mevcut SDK sürümünü, ağ seçimini veya mimariyi değiştirme yetkisi vermez. Mevcut uygulamayı yeniden iskeletleme; örneğe uymak için paket/toolchain yükseltme, cüzdan katmanı ekleme veya state migration yapma.
- `UPSTREAM.md` ve referanslar isteğe bağlı kaynaklardır; projeye uyarlanmış `SKILL.md` girişlerini kullan. Kaynak sürümü ve güncelleme yöntemi `.agents/skills/SOURCES.md` içindedir. Skill kurulumu bir API örneğinin çalıştığı, bağımsız güvenlik denetimi yapıldığı veya canlı kabul alındığı anlamına gelmez.

## Güvenli çalışma

- Dirty çalışma alanını ve mevcut kullanıcı değişikliklerini koru; broad reset/restore/clean/stash ve geniş staging kullanma.
- Yalnız explicit-path değişiklik yap.
- Commit, push, PR, merge, CI tekrar çalıştırma ve deploy; ayrıca provider, secret/config, NEAR, D1 ve canlı veri işlemleri açık kullanıcı onayı ister.
- Gerçek deploy yalnız korumalı GitHub workflow'larından yürür.
- Touched-path testlerini `docs/testing.md` içindeki mevcut komutlardan seç.

## Mimari ve kanıt

- NEAR ekonomik/entitlement otoritesidir; Livepeer medya katmanıdır; Bridge kontrol katmanıdır. Bu sınırları bozma.
- Feature flag'lerin kapalı varsayımını değiştirme.
- Yerel test, CI, Preview ve Production kanıtlarını birbirine karıştırma; local/mock/CI sonucu provider, Preview, Production veya canlı runtime kanıtı sayma.
- Kanıt sınıfları: LOCAL_STATIC, LOCAL_TEST, CI, PROVIDER, PREVIEW, PRODUCTION, EXTERNAL_NOT_RUN, UNPROVEN.

## Sonuç

- Final sonuç: PASS / COMPLETED_WITH_WARNINGS / BLOCKED / FAILED.
- Finalde değişen dosyalar, doğrulananlar, çalıştırılmayanlar, blocker ve tek sonraki gate verilir.
