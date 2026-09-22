# Compact yeniden açılış

Gate: `NEAR_AUTH_COMPACT_REOPEN` — 18 Eylül 2026.
Sonuç: **PASS**. Public-testnet yeniden acceptance modunda.

## Yapılanlar

Kullanıcı admin `unfreeze_bridge` ve `unpause_new_purchases` işlemlerini
tamamladığını bildirdi. Final blokta iki bayrağın da false olduğu doğrulandı.
İşlem hash'leri paylaşılmadığından ayrı makbuz/ücret toplamı raporlanmıyor;
bu sonuç kullanıcı bildirimi ve final kontrat durumu ile doğrulandı.
Agent cüzdan imzası üretmedi veya göndermedi.

[Korumalı Public Testnet Video koşusu 35360921254](https://github.com/4rmus/youtick/actions/runs/35360921254)
**PASS**. Exact main `6739ec743850afe08b6bc1cade18091c71c723d4`, başarılı
CI **35276310906** ve `mode=acceptance` kullanıldı. Hazırlanan artifact,
hash/lock/source doğrulayıcısından ve GitHub attestation kontrolünden geçti;
config yerelde incelenen acceptance paketiyle birebir eşleşti.

Kapalı base config'e göre yalnız beklenen **13 çalışma bayrağı** false→true
değişti; adresler, sözleşmeler ve diğer değerler aynı kaldı. Onaylı workflow
için `DEPLOY_PUBLIC_TESTNET_ENABLED` geçici açıldı, başarı sonrası **false**'a
döndürüldü. Preview false kaldı; base repository config ve secret değerleri
değiştirilmedi.

## Gerçek runtime doğrulaması

| Bileşen | Acceptance sürümü |
| --- | --- |
| Web | `002472d0-8f00-47d8-926a-41b5a3cb55fa` |
| Bridge | `df4609b5-82cc-49b7-8993-62f3e15db700` |
| Read-model | `75da37cf-1be1-4980-b65b-b0acfbc8d8ef` |

Bridge/read-model health sürümleri receipt ile eşleşti. Web sürümü korumalı
deploy receipt/smoke kaydından alındı. Bridge **ENABLED**; provider/operator,
upload, sponsor quote/relay, playback/v2 ve webhook queue readiness açık.
Shadow ve arşivleme özellikleri kapalı kaldı. Admission **OPEN**, rezervasyon
yok; operator kayıtları **13/13 confirmed**, invalid/retry **0**. Archive
pending sayısı kesinleşmemiş gönderim olarak yorumlanmadı.

Market code hash'i
`9FvV8rRn1FQg15jHG4fNZPXjskdMTr6jZBVgNFZyb731` değişmedi; Market ve
Bridge **compact version=1**, aynı testnet/Market hedefinde eşleşiyor.
`bridge_frozen=false`, `new_purchases_paused=false`.

13 yayın ve bütün iş verileri, platform USDC/NEAR bakiyeleri ve Access state
korundu. İki bakım alanı kaldırıldıktan sonra raw-state hash bakım öncesi
değerine döndü:
`3788a4166981988987b5c1f1b5b9c4fdb1aa431a586c54f7616ebd739c679d5c`.
Bu bir sonraki Market code update onayı değildir.

## Sınırlar ve kanıt

Kanıtlar: `tmp/near-auth-reopen-d_ufyw1i/` altında `receipt/`,
`evidence/runtime-postcheck.json`, `operator-after.json`, config farkı ve
workflow kayıtları. Kanıt sınıfları **CI / PROVIDER / LOCAL_STATIC**.
Doküman build ve kaynak/index koruma kontrolleri geçti. Uygulama kodu
değişmediği için unit testleri yeniden çalıştırılmadı.

Repo kaynak değişikliği yalnız bu rapor ve güncel durum belgesidir. Diğer
dosyalar ve index korundu; commit/push yapılmadı. Market yeniden deploy
edilmedi. Yeni Google/MPC onayı, upload, ödeme veya gerçek HLS oynatma
denemesi başlatılmadı. Hazır servis bayrakları canlı kullanıcı kabulü sayılmaz.
`/auth-lab` hâlâ development/localhost denemesidir; halka açık Web'de sosyal
girişin ürün olarak açıldığı iddia edilmez.

**Tek sonraki gate: `NEAR_AUTH_COMPACT_LIVE_ACCEPTANCE_PREFLIGHT`.** Aynı
Google hesabı/sponsor/dosya/taslak ve mevcut Brave cihaz durumunu koruyarak
gerçek deneme ön koşullarını kontrol etmek; eski denemeleri yeni imza veya
ödeme başlatmadan uzlaştırmak ve güncel bütçeyi hazırlamak. Bu gate henüz
açılmadı; `access_denied` sorununun gerçek kullanıcı akışında giderildiği
henüz kanıtlanmadı.
