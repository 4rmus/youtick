# NEAR Auth V1 — yerel upload kabul kurulumu

Gate: `NEAR_AUTH_V1_UPLOAD_LOCAL_ACCEPTANCE_SETUP`.
23 Eylül 2026 — **COMPLETED_WITH_WARNINGS**.

**Yerel upload bağlantısı kapalı modda hazır.** Aynı sponsor/key epoch/SQLite
kayıtlarıyla Web ve yerel Bridge yeniden başlatıldı. Teklif doğrulaması yalnız
zincirle eşleştirilmiş açık anahtarı kullanıyor; quote gizli anahtarı gerekmedi.
Gerçek ödeme veya upload yapılmadı. Bugünün günlük rezerv sınırı dolu ve
aynen korundu; bu kurulum harcama yetkisi veya gerçek upload kabulü değildir.

## Önceki engelin kapanması

İlk setup denemesi quote private key konumu bilinmediği için BLOCKED idi.
[Açık anahtar kaynak gate'i](./near-auth-v1-upload-quote-verification-source.md)
bu gereksinimi kaldırdı ve final **269894259**'da mevcut Market/key/version
bağını doğruladı. Bu tur kullanıcının aynı setup gate'ini yeniden istemesiyle
kapalı yerel hazırlık ve restart yapıldı; sonraki ödeme gate'ine geçilmedi.

## Kurulum ve korunan sınırlar

- Ana uygulama: `http://localhost:3000`; mevcut uygulama kaynağı.
- Yerel Worker: `youtick-bridge-local-auth`, private `NearAuthMpcSponsor`,
  Web binding: `NEAR_AUTH_MPC`.
- Aynı `tmp/near-auth-ticket-local-setup/state/` ve `registry/` dizinleri.
- Aynı sponsor:
  `e582a5e0dece7b0a61b37384d6dc9a4e46bc539ba8d0439803606c7fbe1f975c`;
  public key `ed25519:GSuuhDkM9sqnvvF3MwkHmDgeN3znpbuvvv6jN79fengB`;
  epoch **local-v1**. Mevcut Anahtar Zinciri girdisi yalnız başlatıcıda okunup
  aynı sponsor anahtarı Bridge'e bellekte aktarıldı. Yeni key/epoch üretilmedi.
- Quote public key base64:
  `9wz8/GBL3XSpZmaQD4XLnqbYG7SWpiXWgTyQ+uL1+ZI=`, version **1**.
  `CREATOR_FEE_QUOTE_PRIVATE_KEY` okunmadı/aktarılmadı. Public JSON'da gizli
  değer yok; sponsor private key argv/env dosyası/public artifact'e yazılmadı.
- Web `NEAR_AUTH_V1_MPC_ENABLED`, `NEAR_AUTH_V1_TICKET_ENABLED`,
  `NEAR_AUTH_V1_UPLOAD_ENABLED` **false**. Bridge `NEAR_AUTH_MPC_ENABLED`,
  `NEAR_AUTH_TICKET_ENABLED`, `NEAR_AUTH_UPLOAD_ENABLED` **false**.
- Yeni `upload-setup-approved` başlatma modu, açık anahtarı geçirir ve tüm
  gönderimleri kapalı tutar. Eski `start-approved` de upload'ı kapalı tutar.
  Üst süreçten `NEAR_AUTH_V1_UPLOAD_ENABLED=true` gelse bile false ile ezilir.

İlk yeniden başlatmada eski Next alt süreçleri port 3000'i bırakmamıştı.
Yalnız önceden kimliği doğrulanan eski launcher/Next süreçleri SIGTERM ile
kapatıldı; sonraki başlangıç başarılı. Geniş süreç kapatma, reset, stash,
veri/anahtar silme veya bütçe sıfırlama yapılmadı. Yeni giriş gerektiğinden
bu tur kullanıcı oturumu taklit edilmedi; tarayıcı/cihaz/taslaklar temizlenmedi.

## Kayıt ve bütçe kanıtı

Çalışan actor dosyasında WAL bulunmadığı doğrulandı; önce/sonra ayrı dosya
kopyaları alınıp `mode=ro&immutable=1` ile okundu. Kopyalarda SQLite integrity
**ok**; yalnız ilgili nonce, günlük sayaç ve iki operation anahtarı çözüldü.
Önceki doğrudan read-only açma sorunu kaynak dosyayı değiştirmeden aşıldı.

| Alan | Önce ve sonra aynı |
| --- | --- |
| Sponsor nonce | `269862673000002` |
| UTC gün / global rezerv | `2026-09-23` / **0,70 test NEAR** |
| Google günlük deneme | **1** |
| Passkey günlük deneme | **1** |
| Bekleyen outer `mpc:active` | Yok |
| Google operation | `7ceb02902626cdfd5c487382e58956f53ce6abc67182b2186bf69c27a3237c51`, `TICKET_SETTLED` |
| Passkey operation | `8aa3c9f47fc0d70e5f490a6125952f1e7aaf93678039138eb05bb985d35790e6`, `TICKET_SETTLED` |

İki operation'ın dış/iç hash, reserved tutar, sponsor public key ve epoch
alanları da değişmedi. Günlük 0,70 / işlem 0,35, hesap başı 1 deneme,
minimum 0,05 NEAR kullanılabilir bakiye sınırları korundu. Ayrılmış rezerv
ile gerçek gider aynı değildir; düşük gerçek gider yeni deneme hakkı açmaz.

## Yerel doğrulama

- **LOCAL_TEST:** başlatıcı kontrolü PASS: kapalı upload setup, kapalı eski
  başlangıç, bilinmeyen mod reddi, yanlış üst-env upload açma denemesinin
  ezilmesi, aynı storage/epoch/bütçe ve public config'te private key olmaması.
  Bu kontrolde gerçek key/süreç/storage kullanılmadı.
- **Yerel runtime:** ayrı geçici porttaki gerçek Next → çalışan yerel Bridge
  named RPC çağrısı PASS. Her iki gerçek operation aynı ID ve
  `TICKET_SETTLED` durumuyla okundu. Tanı route'u ana uygulamaya eklenmedi;
  izole kopyadaki tanı sunucusu iş bitince kapatıldı.
- Ana uygulamanın `/api/auth/upload` yolunda oturumsuz status isteği
  **401 / session_required** döndü. Bu, kullanıcı girişi/ödeme kabulü değildir.
- Başlatıcı sözdizimi PASS. Uygulama kodu değişmediği için önceki tam
  Web/Bridge/native/browser paketleri yeniden çalıştırılmadı.
- Doküman build ve diff kontrolü **PASS**; mevcut 500 kB bundle uyarısı sürer.
  Kaynak hash karşılaştırmasında repo içinde yalnız bu rapor ve ana plan
  değişti; uygulama/kontrat dosyası silinmedi veya değiştirilmedi.

## Fonlama ve seçili dosya

Kullanıcının manuel fonlaması bu konuşmanın önceki salt-okunur kontrolünde
final **269892479** / `2Z1x8GmHmuKZvBZX2UUvq2GKwPhKTAVR8KiXreWHmdyG` /
23 Eylül **13:18:33 UTC** olarak doğrulandı:

| Rol | Hesap | Test USDC |
| --- | --- | --- |
| Google | `29445f46f23551e48c99869c2e34e3acb283902db8196da32cb3f6625872324c` | **2** |
| Passkey | `9db6cbd959c2ad427dc68b77b905edd0b8470431e3a3a9abebf0ee41a659d21a` | **2** |

Belirli fonlama hash'leri verilmedi; bu kayıt bakiye kanıtıdır, transfer
signer/action/receipt kanıtı değildir. Bu tur ek fonlama yok.

Seçilen dosya: `/Users/arair/Desktop/youtick/Soterii - Distance.mp4`.
Önceki setup incelemesi: **9.452.298 bayt**, **236,495238 saniye (3:56)**,
H.264 1920×1080 / AAC; SHA-256
`cbbb9ffacab55e8a9890d887330491941f9a9e099934fb9df52f0031d2e43a47`.
Dosya değiştirilmedi. Kaynak formülü **0,60 test USDC**/upload; gerçek kabulde
quote yeniden doğrulanır. Kaynak 1080p olsa da önceki Market politikası
360p+720p / legacy 720p idi; çıktı 1080p kabulü iddia edilmez.

## Değişen dosyalar ve kanıt konumları

- Yerel/ignored: `tmp/near-auth-ticket-local-setup/start.mjs`, oluşturduğu
  `bridge.json`, `web.json`, `runtime-public.json`;
  `tmp/near-auth-upload-local-setup/setup-package.json`, `start.test.mjs`,
  `check-next.mjs`, `runtime-check.json`, `main-route-check.json`.
- Ayrı eski tanı kopyasında yalnız `api/runtime-probe/route.ts` iki sabit
  operation'ın güvenli özetini döndürecek şekilde uyarlandı.
- Repo belgeleri: bu rapor ve `near-auth-integration-status.md`.

Başlangıç kopyaları, önce/sonra actor snapshot'ları ve güvenli özet:
`/var/folders/m7/jqxmhnys7d1778jj0g8kyg800000gn/T/near-auth-upload-setup-run-nzl32f5l/`.
Uygulama ekonomik kaynağı, kontrat, bağımlılık ve hosted ayarlar değişmedi.

## Kalan sınır ve tek sonraki gate

Setup blocker'ı yok. **Bugün mevcut bütçeyle yeni ödeme başlayamaz.**
Tercih edilen yol: **24 Eylül 00:00 UTC / 03:00 İstanbul sonrasında**,
ayrı upload onayıyla mevcut limitleri kullanmak. Aynı gün iki upload istenirse
ayrı açık onayla günlük toplam 1,40 / hesap başı 2 kararı gerekir; uygulanmadı.
Sayaç/epoch değiştirerek limit aşılmayacak; otomasyon veya bekleme kurulmadı.

Restart sonrası kullanıcı yeniden giriş yapmalı. Kabulde doğru Google/passkey
kimliği/cihaz, güncel dosya/quote, bakiye ve bütçe kontrol edilmelidir.
**EXTERNAL_NOT_RUN:** gerçek upload imzası/ödeme, relay, TUS/Livepeer yayın ve
creator oynatma/reload; hosted/CI/deploy. Keychain sponsor okuması ve yerel
restart gerçek hazırlıktır, ödeme/medya kabulü değildir.

**Tek sonraki gate: `NEAR_AUTH_V1_UPLOAD_PAYMENT_ACCEPTANCE` — başlatılmadı.**
