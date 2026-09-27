# Upload yetkilendirmesi için güvenli yerel teşhis

Gate: `NEAR_AUTH_UPLOAD_AUTHORIZATION_DIAGNOSTICS_SOURCE` — 19 Eylül 2026.
Sonuç: **PASS / LOCAL_STATIC + LOCAL_TEST**. Teşhis düzeltmesi tamamlandı;
önceki canlı reddin kesin alt nedeni henüz doğrulanmadı.

## Dayanak ve kapsam

Kullanıcının yeni denemeye ait `new-console-log.md` kaydında ödeme hazırlığı
ve teklif alma tamamlanıyor. Google popup dönüşünün ardından
`near-auth-upload-wallet.ts` içindeki `authorize-upload` isteği 422 alıyor.
Sunucu kaydı bu aşamayı, `signing_check_failed` sonucunu ve 654 ms süreyi
doğruluyor; istisnanın alt türü eski kayıtta yok. Bu çağrı akışında sponsor
cüzdanına henüz ulaşılmamış. Bu, diğer denemelerin ödeme geçmişi hakkında
bir iddia değildir. COOP uyarısı tek başına kök neden sayılmadı.

Kullanıcı yalnız güvenli yerel teşhis değişikliğini onayladı. Eski taslağa,
browser storage'a, özel anahtarlara veya mevcut token/bilete erişilmedi.
Yeni Google onayı, sponsor çağrısı, ödeme, relay/upload veya tekrar gönderim
yapılmadı; kayıt temizlenmedi ve çalışan sunucu yeniden başlatılmadı.

## Değişiklik

`authorize-upload` sunucu yanıtı ve mevcut güvenli log, gerektiğinde yalnız
şu sabit etiketleri içeren `diagnostic` alanını taşıyor:

- `stage`: `upload_review`, `google_approval`, `upload_preflight`.
- `code`: izinli JOSE hata kodları veya sınırlı standart hata türleri.
- `claim`: yalnız bilinen JWT alan **adı**; alanın değeri değil.
- `claimCheck`: `missing`, `invalid` veya `check_failed`.

İzin listesi dışındaki değerler ve ek alanlar atılır. Ham hata mesajı,
stack, cause, payload, token, ticket veya subject serialize edilmez.
İstemci aynı filtreyi yeniden uygular; genel authorize-upload hatasında
güvenli etiketleri kullanıcı mesajına ekler. Zaten açıklanan retler ve
completion/expiry mesajlarının mevcut biçimi korunur.

Aşama bildirimi yalnız mevcut doğrulama adımlarının önüne eklenmiştir.
İnceleme bileti → Google onayı → zincir/servis kontrolü → son süre kontrolü
sırası, imza/claim doğrulaması, süre sınırları ve sponsor içeriği değişmedi.
API'nin localhost/development/testnet, oturum ve origin korumaları aynıdır.

## Doğrulama

**784 Web testi PASS**, sıkı auth tip kontrolü, lint ve ayrı dizinde Web
build PASS. Çalışan Web'in `.next` dizini veya oturum secret'ı değiştirilmedi.

Yeni testler gerçek sentetik JWE/JWT ile yanlış şifreli bilet, eksik claim,
yanlış imza ve zincir kontrolü hatalarını ayırır. API ve logun tam şekli
denetlenir; özel veri işaretçisi, subject, session, ticket ve tokenın çıktıda
olmadığı doğrulanır. Hata senaryolarında ağ çağrıları sıfır veya yalnız mock
query'dir. İstemci testleri bilinmeyen teşhis alanlarını reddeder ve eski
expiry mesajını korur. Bu örnekler canlı hatanın sebebini kanıtlamaz.

Salt-okunur alt ajan da hata sınırını ve doğrulama sırasını inceledi;
kullanıcı loglarını, tarayıcıyı veya storage'ı okumadı. Gizlilik/akış
genişlemesi bulmadı. Doküman build ve dosya/index koruma kontrolü geçti.

## Dosyalar ve sonraki adım

- `apps/web/lib/near-auth-lab.ts`: ortak izinli teşhis filtresi.
- `apps/web/lib/near-auth-upload-server.ts`: üç aşama bildirimi.
- `apps/web/app/api/auth-lab/signing/route.ts`: güvenli API/log alanı.
- `apps/web/lib/near-auth-signing.ts`: filtrelenmiş istemci hata metni.
- Mevcut `near-auth-signing-server.test.ts` ve `near-auth-signing-client.test.ts`.
- Bu rapor ve güncel entegrasyon durumu.

Kanıt/yedek: `tmp/near-auth-safe-diagnostics-9cj2d1kc/`.
Önceki logun izinli özeti: `tmp/near-auth-new-upload-denial-v99jh4ur/analysis.json`.
Ham kullanıcı logu kopyalanmadı; kendi dosyası değişmedi.

**EXTERNAL_NOT_RUN:** canlı doğrulama tekrarı, imza/ödeme, browser/storage
incelemesi, provider/config değişikliği, CI/deploy, commit/push/PR/merge.
Bridge/kontrat kodu değişmedi; onların suite'leri yeniden çalıştırılmadı.
Önceki hassas çıktı olayının giderildiği bu gate ile iddia edilmez.

**Tek sonraki gate: `NEAR_AUTH_UPLOAD_AUTHORIZATION_RECHECK`.** Kullanıcının
kontrolündeki yeni denemeden yalnız güvenli aşama/kod çıktısını inceleyip
gerçek ret nedenini belirlemek. Bu kapanış yeni imza veya ödeme yetkisi
değildir; eski onaylar tekrar gönderilmez, doğrulama kuralları kanıtsız
gevşetilmez. Sonraki gate otomatik başlatılmadı.
