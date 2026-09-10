# Playback reload — kaynak düzeltmesi

10 Eylül 2026 · `PLAYBACK_RELOAD_FIX_SOURCE`

**PASS / LOCAL_TEST — düzeltme hazır; henüz canlıya yayımlanmadı.**
Başlangıç main: `9a34554b102a536efe79a92dc78ed4c70b9b1ba3`.

## Sorun ve en küçük düzeltme

Gerçek cüzdan kabulünde, çıkış ve yeni ödeme sonrasında alıcı sayfasının ilk
reload isteği A/B videolarında iptal oluyordu. Aynı cihaz ve satın alma hakları
geçerliydi; “Try again” ek imza olmadan çalışıyordu.

Yeni sayfa `observedRevision=0` ile başlıyordu. İlk IndexedDB okuması eski
pozitif çıkış sayacını görünce, daha önce bağlanmış oynatıcı dinleyicilerine
yeni bir çıkış bildiriyordu. Dinleyici token isteğini iptal ediyordu.

`observedRevision` artık ilk okumaya kadar tanımsızdır. İlk depo okuması yalnız
başlangıç değerini öğrenir; sonraki artış dinleyicileri eskisi gibi çalıştırır.
Gerçek BroadcastChannel çıkış bildirimi ilk okumadan önce gelse de geçerlidir.
Çıkışın kendi sayaç güncellemesi aynı şekilde korunur.

Yeni bayrak, servis, bağımlılık, timer veya yeniden deneme katmanı eklenmedi.
Cihaz anahtarı, 30 günlük zincir süresi ve oturum veri biçimi değiştirilmedi.
Eski kayıt silme/sıfırlama ve yeni ödeme gerekmez.

## Doğrulama

| Kontrol | Sonuç |
| --- | --- |
| Yeni cold-reload testi, eski kaynak | Beklenen FAIL: oynatıcı AbortController'ı iptal edildi |
| Yerel gerçek Brave/IndexedDB, eski kaynak | Beklenen FAIL: ilk okumada 1 sahte çıkış olayı |
| Yedi odaklı Web test dosyası | **134 PASS** |
| İzole localhost Brave kontrolü | **14 PASS**, yeni cold-reload kontrolü dahil |
| Kaynak lint | PASS |
| CI örnek testnet hesapları ve kapalı bayraklarla Web build | PASS; TypeScript tamamlandı |
| `git diff --check` | PASS |

Testler geçerli/non-extractable anahtarı cold reload sonrasında korur; kaçırılan
çıkış bildiriminin depo okumasıyla yakalanmasını, sonradan gelen aynı bildirimin
tekrarlanmamasını ve ilk okuma öncesi gerçek çıkış bildirimini de doğrular.
Mevcut geç yanıt, sekmeler arası çıkış, ödeme hazırlığı/çıkış yarışı,
anahtar export reddi, 20→50 gün ve süre sonu testleri geçer.

Brave testinde gerçek IndexedDB/WebCrypto kullanıldı; cüzdan ve zincir yereldir,
mock'tur. Kullanıcının public-testnet profiline, özel anahtarına veya ödenmiş
videolarına dokunulmadı. Bu sonuç canlı reload kabulü sayılmaz.

Kurulu Vitest, Next, TypeScript ve Playwright sürümleri lockfile ile eşleştirildi;
yeni kurulum yapılmadı. Build mevcut middleware adlandırması ve Next Edge
Runtime bağımlılığı uyarılarını verdi; bunlar bu gate'te değiştirilmedi.

## Dosyalar ve yayın sınırı

- `apps/web/lib/device-session.ts`: başlangıç revision ayrımı.
- `apps/web/__tests__/unit/device-session.test.ts`: cold reload ve çıkış testleri.
- `apps/web/scripts/device-session-browser-check.mjs`: gerçek IDB ilk-okuma kontrolü.
- Bu sonuç belgesi.

Dirty ana çalışma alanı korunarak ayrı candidate kullanıldı. Kanıtlar candidate'ın
üst dizinindeki `regression-before.log`, `browser-before.log`,
`targeted-tests.log`, `browser-after.log`, `lint.log`, `build.log` ve
`receipt.json` dosyalarındadır.

Commit, push, PR, merge, CI rerun, deploy, config/secret, NEAR/D1 veya ödeme
işlemi yapılmadı. Kaynak blocker'ı yok.

**Tek sonraki gate: `PLAYBACK_RELOAD_FIX_RELEASE`.** Bu dört dosyanın normal
PR/CI/merge akışı ve tek korumalı public-testnet yayını. Yayın sonrasında mevcut
`utick2.testnet` oturumu ve satın alınmış A/B videolarıyla ilk reload'da,
“Try again” ve ek imza gerekmeksizin oynatma doğrulanır. Yeni ödeme gerekmez.
