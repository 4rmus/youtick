# YouTick Mainnet Yönetişim Brief'i

> 30 Eylül 2026, owner kararları 3 Ekim 2026 — **Taslak / LOCAL_STATIC / NOT_IMPLEMENTED**.
> Bu belge karar ve tasarım önerisidir. Kod, kontrat, anahtar, multisig veya
> deploy değişikliği yapılmadı. Hukuki ve vergisel değerlendirmeler bu kamuya
> açık belgede yer almaz; ayrı tutulur ve uzman görüşüyle ele alınır.

## Owner beyanları (OWNER_DECLARED, 30 Eylül 2026)

- Proje tek geliştirici tarafından yürütülür.
- Yönetişimin birincil amacı **kullanıcı güvenidir**.
- Bir **güvenilir kişi (GK)** imzacı/acil durum rolü alabilir. GK bir
  **avukattır** (OWNER_DECLARED, 3 Ekim 2026).
- Tüzel kişi: **YOUTICK LTD**, Companies House no. 17290900, Active,
  kuruluş 20 Haziran 2026, SIC 62012, kayıtlı adres Londra
  (Companies House kamu kaydıyla 30 Eylül 2026'da doğrulandı).

Karar: Mainnet işletmecisi (hizmet sözleşmesinin tarafı, provider hesaplarının
sahibi, takedown muhatabı ve platform hazinesinin sahibi) **YOUTICK LTD** olur.
Sahip şirketi yöneticisi (director) olarak şahsen yürütür. Kullanıcılar, üreticiler ve
provider'lar şahısla değil şirketle muhatap olur.

## İlke

"Tek kişi, ama tek anahtar değil." Mainnet açılışında token veya oylama yoktur.
Kullanıcı güveni üç mekanizmaya dayanır:

1. **Timelock:** yetki genişleten ve kod değiştiren her işlem 48 saat önce
   on-chain görünür olur. Kullanıcı itiraz edebilir veya çıkabilir.
2. **Yetki ayrımı:** durdurma anında yapılabilir ve yalnız yetkiyi azaltır. Açma ve
   değiştirme işlemleri gecikmelidir ve multisig ister.
3. **Çıkış hakkı:** üretici bakiyesi, kontrat durdurulmuş olsa bile üreticinin kendi
   işlemiyle çekilebilir. Mevcut `withdraw_creator_balance` pause kontrolü
   yapmıyor. Bu özellik korunmalı ve bir testle sabitlenmelidir.

## Mainnet öncesi (testnet)

Bu brief'teki multisig, timelock ve rol kuralları **mainnet açılışında** başlar.
Mainnet öncesinde (testnet ve pilot) kontrat güncellemeleri bugünkü gibi sahip
tarafından tek başına, mevcut korumalı workflow'larla yapılır; multisig gerekmez
(owner kararı, 3 Ekim 2026). Testnet tokenlarının gerçek değeri yoktur.

## Aşama 1 — Mainnet açılışı

### Anahtarlar

| Anahtar | Sahip | Saklama |
|---|---|---|
| K1 | Sahip | Donanım cüzdanı, günlük kullanım |
| K2 | GK (avukat) | GK'nin kendi donanım cüzdanı |
| K3 | Sahip, soğuk kurtarma | Mühürlü, K1'den farklı fiziksel konumda; kullanımı kamuya duyurulur |

**Yönetim multisig'i** (Sputnik DAO tabanlı veya eşdeğeri, seçimi ayrı gate):
2-of-3 (K1, K2, K3).

Politika: Kod güncellemesi ve rol değişikliği **K1 + K2** ile imzalanır. K3 yalnız
K1 ya da K2 kaybolduğunda kullanılır ve kullanımı kamuya açıklanır.

Dürüst sınır: K1 + K3 teknik olarak sahibin tek başına işlem yapmasına izin verir.
Aşama 1'de bunu engelleyen şey kriptografi değil, timelock, kamuya açık event ve
yayımlanmış politikadır. Bu sınır "Yetki haritası" sayfasında açıkça yazılır.

### Rol matrisi

| Kontrat rolü | Hesap | Nasıl çalışır | Gecikme |
|---|---|---|---|
| Kod güncellemesi | Yönetim multisig'i | Kontrat hesabında FullAccess anahtar kalmaz; güncelleme kontratın timelock'lu self-upgrade metoduyla yapılır | 48 saat |
| `admin` | Yönetim multisig'i | Unfreeze, satışları açma, bridge rotasyonu, politika | 24–48 saat |
| `guardian` | Ayrı guardian hesabı | FullAccess anahtar soğukta. Sahip ve GK'de, yalnız market kontratına ve `pause_new_purchases`, `freeze_bridge`, `cancel_bridge_rotation` metotlarına sınırlı birer FunctionCall anahtarı | Anında, yalnız azaltır |
| `platform_account` | Yönetim multisig'i | Platform çekimi hazineye (multisig) iner; günlük gider için ayrı sıcak hesaba aktarılır | Multisig onayı |
| Quote anahtar rotasyonu | `platform_account` üzerinden | Multisig önerisi | Multisig onayı |
| `takedown_authority` | YOUTICK LTD operasyon hesabı | Sahip ve GK'de sınırlı FunctionCall anahtarları; reason code ve kanıt hash'i on-chain | Anında (hukuki zorunluluk) |
| Bridge | Runtime anahtarı | Mevcut dar, sınırlı allowance'lı anahtar; FullAccess yok | — |
| Access-control `owner` | Yönetim multisig'i | Pause anında (guardian), unpause ve sahiplik timelock'lu | Unpause 24 saat |

Güvenilir kişi (GK) teknik bilgi gerektirmeyen iki iş yapar: (a) sahibin önerdiği
multisig işlemini inceleyip ikinci imzayı atar, (b) sahip ulaşılamazken durdurma
anahtarıyla satışları durdurur veya bridge'i dondurur. GK para çekemez, kod
değiştiremez, tek başına bir şeyi açamaz.

GK bir avukattır ve kamuya **"ikinci imzacı: avukat"** olarak tanıtılır. Rolü,
yetkileri ve on-chain hesabı yetki haritasında yayımlanır; böylece imzaların iki
ayrı anahtardan geldiği zincirde doğrulanabilir. Avukatın adının veya bürosunun
yayımlanması avukatın onayına bağlıdır; onay yoksa kimlik yalnız YOUTICK LTD
kayıtlarında (yönetim kararı ve avukatla yapılan görev sözleşmesi) belgelenir.

Aşama 1'de K3 sahipte kaldığı için (bkz. "Dürüst sınır") kamuya "sahip tek başına
işlem yapamaz" denmez; bu iddia yalnız Aşama 2'den sonra yapılır.

## Aşama 2 — Gerçek kullanım sonrası

Tetikleyici (owner kararı, 3 Ekim 2026), hangisi önce gelirse:

- kontrattaki toplam üretici bakiyesi eşiği (tutar: mainnet öncesi owner belirler),
- gerçek satış yapan üretici sayısı eşiği (sayı: mainnet öncesi owner belirler),
- **her durumda mainnet açılışından en geç 12 ay sonra.**

Tarih sınırı, kullanım yavaş büyüse bile Aşama 1'in "K1 + K3 ile tek başına işlem"
sınırının süresiz açık kalmasını önler. Eşik değerleri ve sınır tarihi açılışta
yetki haritasında yayımlanır.

- K3 (sahibin soğuk anahtarı), **bağımsız üçüncü imzacıyla** değiştirilir. K2 zaten
  avukat olduğundan bu kişi farklı bir meslek sahibidir; örneğin muhasebeci veya
  denetçi. Bundan sonra sahip tek başına işlem yapamaz (owner kararı, 3 Ekim 2026:
  K3 Aşama 1'de sahipte kalır, Aşama 2'de devredilir).
- Üreticileri etkileyen parametre değişiklikleri (örneğin komisyon oranı) en az 14 gün
  önceden duyurulur. Off-chain bir üretici danışma kanalı açılır.
- Komisyon için kodda sabit bir üst sınır düşünülür. Örneğin `%8`'i aşan bir değer
  yalnız kod güncellemesiyle ve 48 saatlik timelock'la değişebilir.
- Kod güncelleme yetkisinin kalıcı kaldırılması (ossification) için kriter bu aşamada
  belirlenir ve kamuya duyurulur.

## Aşama 3 — İsteğe bağlı

Sınırları kodla sabitlenmiş parametreler için on-chain oylama düşünülebilir.
Token çıkarılması bu brief'in kapsamı dışındadır. Hukuki risk (SPK/MiCA/FCA) ve
ürün ihtiyacı ayrı değerlendirilmeden önerilmez.

## Hiçbir aşamada dağıtılmayanlar

- Takedown, telif ve yasal taleplere yanıt: YOUTICK LTD.
- Kişisel veri (ilgili veri koruma mevzuatı) ve provider hesapları (Livepeer, Cloudflare, Auth0,
  GitHub): on-chain değildir. Yönetişimleri hesap güvenliğiyle sağlanır: donanım 2FA,
  ikinci yönetici olarak GK (salt-okunur veya break-glass), erişim kaydı.

## Otobüs faktörü ve acil durum

- Mühürlü acil durum runbook'u GK'de ve sahipte bulunur. İçeriği: anahtarların yeri,
  durdurma adımları, kullanıcı duyuru şablonu, provider destek iletişimi.
- Sahip 7 gün ulaşılamazsa: GK satışları durdurur ve duyuru yayımlar. Mevcut izleme
  hakları ve üretici çekimleri çalışmaya devam eder.
- Yıllık en az bir tatbikat: guardian durdurma, multisig ile açma ve anahtar kaybı
  senaryosu. İlk tatbikat testnet'te yapılır. Mainnet kanıtı sayılmaz.

## Mainnet öncesi uygulama gate'leri (her biri ayrı onay)

1. `MARKET_ROLE_ROTATION`: admin/guardian/platform/takedown hesaplarını
   timelock'lu değiştirme fonksiyonları. Bugün bu roller değiştirilemiyor.
2. `MARKET_ADMIN_TIMELOCK`: yetki genişleten admin işlemleri için kontrat seviyesinde
   timelock. `execute_bridge_rotation` bugün `bridge_rotation_proposed_at_ms`
   değerini kontrol etmiyor. Multisig oylaması timelock yerine geçmez.
3. `MARKET_SELF_UPGRADE`: admin + 48 saat timelock'lu self-upgrade ve
   migrate yolu. Mainnet kontrat hesabından FullAccess anahtarın kaldırılması.
4. `ACCESS_CONTROL_INSTANT_PAUSE`: pause'u timelock'tan çıkarıp guardian'a vermek,
   unpause'u timelock'ta tutmak. Bugün `pause_contract` 24 saat bekliyor.
5. `CREATOR_EXIT_INVARIANT_TEST`: pause ve freeze altında üretici çekiminin
   çalıştığını sabitleyen test.
6. `GOVERNANCE_MULTISIG_SELECTION`: multisig aracı ve sürümü, denetim durumu,
   FunctionCall anahtar politikası. Kurulum yapılmaz, yalnız araştırma.
7. `PUBLIC_AUTHORITY_MAP`: kamuya açık yetki haritası sayfası ve governance
   event gösterimi.
8. `MAINNET_KEY_CEREMONY`: K1–K3 ve guardian anahtarlarının üretimi ve kayıt. Canlı
   işlemdir, açık onay gerektirir.

## Hukuki ve vergisel konular

Mainnet açılışından önce hukuki ve vergisel konular (vergi, ödeme mevzuatı,
içerik güvenliği yükümlülükleri, veri koruma, kripto varlık düzenlemeleri) uzman
görüşüyle ayrıca değerlendirilir. Bu değerlendirme kamuya açık değildir.
Mainnet'in hangi ülkelerde ve hangi ödeme yöntemleriyle açılacağı, bu
değerlendirme tamamlanmadan belirlenmez.

## Owner kararları (OWNER_DECLARED, 3 Ekim 2026)

- **Kod güncellenebilirliği:** Kontrat **güncellenebilir**; her güncelleme yönetim
  multisig'i + 48 saat timelock ile yapılır (`MARKET_SELF_UPGRADE`). Gerekçe: tek
  geliştiricili erken üründe değiştirilemez kontrattaki bir hata kalıcı olur ve
  kullanıcıyı yeni contract ID'ye geçmeye zorlar. Güven; timelock, iki imza ve
  pause altında çalışan üretici çekimiyle sağlanır. Güncelleme yetkisinin kalıcı
  kaldırılması (ossification) hedeftir; kriteri Aşama 2'de duyurulur.
- **Mainnet öncesi:** Testnet ve pilot döneminde kontrat güncellemeleri multisig
  gerektirmez; sahip mevcut korumalı workflow'larla tek başına yapar.
- **İkinci imzacı (K2):** Bir avukat. Kamuya "ikinci imzacı: avukat" olarak
  tanıtılır; rol, yetkiler ve on-chain hesap açıktır. Ad/büro yalnız avukatın
  onayıyla yayımlanır.
- **K3:** Aşama 1'de sahipte (soğuk kurtarma) kalır; Aşama 2'de avukat dışında
  bağımsız bir üçüncü imzacıya (örneğin muhasebeci veya denetçi) devredilir.
- **Aşama 2 tetikleyicisi:** Üretici bakiyesi veya satış yapan üretici eşiği; her
  durumda açılıştan en geç 12 ay sonra.

## Owner kararı bekleyenler

- Aşama 2 bakiye tutarı ve üretici sayısı eşiği (mainnet açılışından önce).
- Avukatın adının/bürosunun yayımlanması (avukatın onayı gerekir).
- Avukatla görev sözleşmesi: imza inceleme süresi, acil durdurma, ulaşılabilirlik
  ve anahtar saklama sorumluluğu; ayrıca YOUTICK LTD yönetim kararı.
- Aşama 2'de K3'ü devralacak üçüncü imzacının seçimi.

## Kaynaklar

- Kaynak kod: `contracts/nft-ticket/src/lib.rs`,
  `contracts/access-control/src/lib.rs`, `docs/testnet-pilot-runbook.md`
  (mainnet 2-of-3 ve 24 saat şartı).
- [Companies House — YOUTICK LTD 17290900](https://find-and-update.company-information.service.gov.uk/company/17290900)
- [Trezu](https://github.com/olskik/trezu),
  [Progressive De/Centralization](https://kydo.substack.com/p/progressive-decentralization-a-playbook)
