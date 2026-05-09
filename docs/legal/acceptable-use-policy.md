# YouTick Acceptable Use Policy

> Sürüm: 0.1 (taslak — alpha)
> Yürürlük: Public alpha başlangıcı (2026-04-26)
> Geçerli yetki modeli: Geçici owner-only takedown — 2026 Q4 sonunda multisig/DAO'ya devir.
> Detay teknik karar: [`docs/adr/adr-009-emergency-takedown-and-dao-handover.md`](../adr/adr-009-emergency-takedown-and-dao-handover.md)

Bu doküman YouTick platformunda hangi içeriğin kabul edilebilir olmadığını,
ihlallere nasıl müdahale edildiğini ve şeffaflık taahhütlerini açıklar. Taslak
niteliğindedir; nihai metin yayın öncesi hukuki gözden geçirmeden geçirilecektir.

---

## 1. Kabul edilemez içerik

Aşağıdaki içerik kategorileri YouTick üzerinde yayınlanamaz:

1. **Çocuk istismarı materyali (CSAM)** — istisnasız.
2. **Rıza dışı cinsel içerik** — kurban veya temsilcisinin kaldırma talebi anında uygulanır.
3. **Gerçek kişinin onayı olmadan üretilmiş cinsel deepfake.**
4. **Yakın zarar tehdidi içeren materyal** — terör propagandası, intihar/öz-zarar teşviki, doğrudan şiddete kışkırtma.
5. **Yasadışı uyuşturucu, silah veya insan ticareti satışı.**
6. **Telif ihlali** — geçerli bir takedown talebi alındığında.
7. **Doğrudan kullanıcıyı zarara uğratan kötü amaçlı yazılım veya kimlik avı materyali.**

YouTick yetişkin içeriğini doğrudan yasaklamaz; ancak yetişkin içerik
**rıza-doğrulanabilir**, **yaş-gizli olmayan** ve geçerli yargı yetkisinde
yasal olmalıdır.

---

## 2. Müdahale mekanizması

### 2.1 İki seviyeli takedown

Platform iki ayrı kontrat fonksiyonu kullanır:

| Yol | Fonksiyon | Gecikme | Kullanım |
|---|---|---|---|
| Acil | `takedown_event` | Anında | §1.1, §1.2, §1.3, §1.4 — yasadışı içerik |
| Planlı | `ban_event` | İncelenmiş owner işlemi | §1.6 telif, ToS ihlali |

Her iki yol da kontrat sahibi (owner) tarafından çağrılır. Acil yol
zincirde (`event_takedown` NEP-297 logu) izlenebilir, suistimal kamuya açıktır.

### 2.2 Takedown sonrası operasyonel yükümlülükler

Kontrat takedown'u yapıldıktan sonra operasyon olarak şunlar yapılır:

1. Aktif tüm kalıcı depolama sağlayıcılarındaki şifrelenmiş CID pin'i kaldırılır.
2. Yasadışı içerik durumunda 5 KMS operatörü ilgili anahtar share'lerini
   KV depodan siler.
3. Varsa sıcak medya teslim cache'i temizlenir veya denylist'e alınır.
4. İçerik aylık şeffaflık raporuna eklenir (anonim CID, sebep, tarih).

### 2.3 Şikayet kanalı

İhlal bildirimi için: **abuse@youtick.example** (alpha sürecinde nihai adres
güncellenecektir). Bildirim şu bilgileri içermelidir:

- İçerik linki (event ID veya URL)
- İhlal kategorisi (§1)
- Şikayet edenin iletişimi (CSAM ihbarları için anonim kabul edilir)

CSAM bildirimleri ayrıca yasal olarak ilgili yetkili merciye (örn. NCMEC
muadili) iletilir.

---

## 3. Şeffaflık taahhüdü

YouTick aylık olarak şeffaflık raporu yayınlar. Rapor şunları içerir:

- O ay içinde yapılan takedown sayısı (kategoriye göre).
- Her takedown için: `encrypted_cid` (kısaltılmış), kategori, tarih.
- Reddedilen takedown talebi sayısı (ve neden).

Kaynak veri zincirde `event_takedown` NEP-297 log akışıdır. Aylık rapor bu
akışın insan tarafından okunabilir özetidir.

---

## 4. Yetki devri

YouTick alpha sürecinde takedown yetkisi tek bir owner anahtarındadır. Bu
geçici bir durumdur. **2026 Q4 sonu (Aralık 2026)** itibariyle yetki bir
multisig veya topluluk DAO'suna devredilir. Devir sonrasında:

- Takedown kararı çoğunluk onayı gerektirir.
- Acil yol (CSAM gibi durumlar için) hızlı bir quorum mekanizmasıyla korunur.
- ADR-009 güncellenir.

---

## 5. Yapımcı (creator) yükümlülükleri

Bir creator yüklediği içeriğin:

- Kendisine ait olduğunu veya gerekli izinleri aldığını,
- §1'de listelenen kategorilerden hiçbirine girmediğini,
- Yargı bölgesinin yasalarına uygun olduğunu

beyan eder. İhlal durumunda ilgili etkinlik kaldırılır; tekrarlayan ihlallerde
creator hesabı ban'lanabilir.

---

## 6. Sınırlamalar

- Şifrelenmiş bayt'lar IPFS'te dağıtık olduğundan, takedown sonrası dahi pin
  yok edilene kadar üçüncü taraf gateway'ler içeriğe erişebilir. Platform pin
  kaldırıldığını taahhüt eder; küresel IPFS unpinning'i garanti edemez.
- Kontrat takedown'u entitlement'ı kaldırır; bilet sahiplerine refund kuralları
  ayrı bir politika dokümanında ele alınacaktır.

---

## 7. Değişiklikler

Bu politika taslak niteliğindedir. Yayın öncesi hukuki gözden geçirme + EN
sürümü eklenecektir. Versiyon değişikliği bu dosyanın üst kısmında ve repo
commit geçmişinde takip edilebilir.
