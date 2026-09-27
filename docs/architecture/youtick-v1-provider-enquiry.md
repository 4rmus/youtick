# YouTick V1 — sağlayıcı tanıtım ve soru paketi

27 Eylül 2026 · Gate: `YOUTICK_V1_PROVIDER_ENQUIRY_PACKAGE` · **COMPLETED_WITH_WARNINGS**

**TASLAK — GÖNDERİLMEDİ.** Kart entegrasyonu, sağlayıcı başvurusu veya dış iletişim onayı değildir.
[Mevcut V1 kapsamı ve açık sorumluluklar](./youtick-v1-product-scope.md).

## Amaç ve sınır

Yalnız bu yeni paket ve ürün-kapsam belgesindeki bağlantı/durum satırı değiştirilebilir.
Kaynak kod, eski kaynak checkout, önceki hazırlık/metin dosyaları, Git, ayarlar, gizli veri,
sağlayıcı hesapları, ödeme/zincir işlemleri ve dış iletişim yasaktır.
Kabul: kısa İngilizce tanıtım, en fazla 10 yazılı teyit sorusu, doğru örnek maliyet hesabı,
bilinen/beyan/plan/açık ayrımı ve doküman/koruma doğrulaması.
Önceki 26 Eylül kart soru/vergi rolü belgeleri salt-okunur kaynak olarak kullanıldı;
eski aday listeleri/tarifeler bu pakete taşınmadı, yeni sağlayıcı araştırması yapılmadı.

## Provider-facing draft (English)

**DRAFT — NOT SENT.** Non-binding request for written assessment and quotation.
No provider has been selected; there is no written acceptance or agreed price.

### Business brief

YOUTICK LTD (company number 17290900) is a UK-registered company developing YouTick, a platform for independent creators' recorded videos. The owner reports solo management from Türkiye and no employees. Physical establishment and tax treatment remain to be determined.

V1 is a locally prepared, controlled NEAR testnet wallet pilot, not a deployed commercial launch. It uses test USDC for tickets and upload fees, with separate test NEAR network fees where needed. Test tokens have no real value. NEAR records settlement and account-bound viewing entitlements; Livepeer handles media. YouTick operates publication, ticket and access coordination. The existing pilot code has a 5% reference platform fee; no future fiat commission has been agreed.

Social Google/passkey work is preserved separately for a future product phase. Proposed future card collection and creator bank payouts would use fiat, not card-to-crypto purchases or credits to the existing USDC creator ledger. Please assess the whole disclosed business, including its NEAR/USDC association.

Assess two products separately: **P1**, access to a creator's recorded video; **P2**, the separately priced creator upload/processing/publication service, distinguishing B2B and B2C customers. Access duration, licences, moderation and age policies are not final. Intended buyers include Türkiye, the UK and European countries still to be listed; initial creators are expected in Türkiye and specified European countries pending confirmation. Creator legal types also require confirmation.

The proposed commercial minimum ticket is USD 2, with tax-inclusive/exclusive treatment unresolved. This differs from the pilot's 2 test-USDC minimum. Low initial sales are an owner expectation, not trading history or a numerical forecast.

### Written questions

Please answer **Supported / Conditional / Rejected** for each product and relevant country, naming the contractual entity and providing applicable terms.

1. **Business acceptance:** Can you support a multi-artist marketplace and/or licensed reseller model for P1, and P2's upload service? State licences, content restrictions and conditions covering the disclosed crypto-associated business.
2. **Seller and tax:** Name the customer-facing seller for each product; identify any MoR/reseller and payment processor separately. Who appears on receipts/statements and calculates, collects, files and remits tax or issues invoices? Separate these functions for Türkiye, UK and each EU market; identify exceptions and YouTick/creator obligations.
3. **Coverage and onboarding:** Which buyer/card-issuer countries and creator countries/legal types are accepted? Describe KYC/KYB, beneficial-owner and bank checks for individuals, sole traders and companies, including Turkish creators. Buyer tax location and artist bank country may differ.
4. **Bank payouts and funds:** Can each artist receive a direct bank payout, or only YouTick? Specify Turkish-bank eligibility, currencies, FX, thresholds, timing, failures and reserves. Which licensed entity holds/moves funds, and what obligations would YouTick retain?
5. **Refunds and disputes:** Who decides and funds cancellations, partial refunds, chargebacks, negative balances and reserves, especially after creator withdrawal? Specify deductions, processing-fee returns, tax adjustments and statutory-rights handling separately for P1/P2.
6. **Complete economics:** Quote the checklist and scenarios below, including zero-sales monthly costs. Show customer tax, total costs, P1 artist net and YouTick net separately; quote P2 settlement to YouTick separately, without artist payout. Work USD 2 as both tax-inclusive and pre-tax prices by buyer country. Identify each charge's payer. Also quote USD 10 or your minimum viable basket.
7. **Fiat checkout and access:** Can your approved route support verified signed webhooks, authoritative status queries, durable idempotent orders, NEAR access reconciliation and refund-related revocation? A success redirect alone will not prove payment. Confirm acceptance of this fulfilment model; we are not requesting integration now.
8. **Data responsibilities:** Identify KYC/payment data controllers/processors, agreements/DPA, retention, international transfers, rights-request duties and information needed for the privacy notice. Card/KYC details would not be written to NEAR.
9. **Stripe exclusion:** Stripe is excluded from provider selection. Disclose any mandatory Stripe dependency or contracting/processing/payout route, and whether a non-Stripe alternative can be contracted.
10. **Decision evidence:** Provide written eligibility, product/country conditions, legal entities, contracts, document requirements, full quote and validity period. Distinguish a preliminary sales response from final underwriting; acceptance and responsibilities must be settled before a go/no-go integration decision.

### Comparable quotation

| Fee checklist | Provider to quote |
|---|---|
| Percentage + fixed; domestic/cross-border cards; 3DS/authorization/failed payments; refunds/chargebacks; FX/payouts; KYC/accounts; setup/monthly minimums; reserves/holding; tax on fees | Amount/currency, calculation base, payer, timing and whether monthly minimums offset transaction fees |

These are illustrative quote scenarios, not forecasts. The 5% column is only a reference before all costs and taxes, not an approved fiat commission.
Separate non-refundable fees from temporarily withheld reserves and their cashflow effect. The table is for P1; P2 needs its own service-price quote.

| Scenario | Tickets × USD 2 | Gross USD | 5% reference USD | Total costs / artist net / YouTick net |
|---|---:|---:|---:|---|
| Low | 100 × 2 | 200 | 10 | Provider to quote |
| Medium | 1,000 × 2 | 2,000 | 100 | Provider to quote |
| High | 10,000 × 2 | 20,000 | 1,000 | Provider to quote |

## İşletmeci için hazırlık notu

Göndermeden önce alıcı, gönderici/imza sahibi ve iletişim kapsamı ayrıca kullanıcı tarafından onaylanmalı.
Yeni alıcı adresi uydurulmadı; mevcut destek adresi `contact@youtick.net`.
Şirket adı/numarası önceki 26 Eylül kaydına, Türkiye'den solo yönetim/personel yok bilgisi kullanıcı
beyanına dayanır. Güncel Active durumu, fiziksel ofis veya UK vergi yerleşimi iddia edilmez.

Doldurulacaklar: Avrupa alıcı/üretici ülke listeleri; üreticilerin birey/şahıs işletmesi/şirket dağılımı;
VAT kayıtları ve vergi görüşü; settlement bankası/para birimleri; USD 2 fiyatın vergi temeli;
ortalama/azami bilet ve P2 hizmet fiyatları; gerçek hacim beklentisi ile varsa geçmiş iade/itiraz oranı;
lisans/erişim süresi, moderasyon/yaş politikaları ve nihai gizlilik bilgileri.
100/1.000/10.000 bilet örnekleri tahmin veya gerçekleşmiş satış değildir.

**Kabul kaydı:** sağlayıcı seçimi YOK; yazılı kabul YOK; bağlayıcı maliyet teklifi YOK;
gönderim YOK. P1 kabulü P2'yi, tahsilat kabulü üreticiye banka ödemesini veya vergi devrini kanıtlamaz.
Kart gelirleri USDC üretici defterine eklenmez. Yazılı roller ve maliyetler netleşmeden entegrasyon başlamaz.
Testnet pilotu için açık gizlilik bilgileri, tarihli release policy/ABI uyumu ve canlı kabul de sürer.

## Yerel kanıt ve kapanış

| Sınıf | Sonuç |
|---|---|
| LOCAL_STATIC | V1/gelecek ayrımı, 10 soru ve kısa İngilizce paket; önceki şirket/beyan bilgisi tarihli olarak işaretli |
| LOCAL_TEST | Örnek hesap PASS: USD 2 × 100/1.000/10.000 = 200/2.000/20.000; %5 referans = 10/100/1.000 |
| LOCAL_TEST | Doküman build PASS; 10 soru/837 İngilizce kelime, bağlantılar ve iki dosyalık kapsam PASS |
| EXTERNAL_NOT_RUN / UNPROVEN | Dış iletişim, başvuru, teklif, ticari/vergi kabulü, kart uygulaması ve canlı test |

Yeni yazılım mantığı eklenmediğinden uygulama testleri yeniden çalıştırılmadı.
Önceki yerel test/build sonuçları sağlayıcı onayı veya gerçek kullanım kabulü sayılmaz.
Commit/staging/push/deploy veya cargo-near çalıştırılmadı; önceki global CLI yan etkisi tekrarlanmadı.

**Engel:** yazılı sağlayıcı kabulü/rol/maliyet, işletmeci eksik bilgileri ve ayrı hukuki/vergi değerlendirmesi.
Kaynak checkout'un 502 dosyası, HEAD/index/dal/tag/remote kayıtları ve global near-cli ayar özeti aynı.
Hedefte yalnız bu yeni paket ve ürün-kapsam belgesi değişti; diğer başlangıç dosyaları/Git durumu korundu.
Önerilen 66 dosyalık yerel kayıt kapsamı [ürün-kapsam belgesindedir](./youtick-v1-product-scope.md).
**Tek sonraki gate:** `YOUTICK_V1_CHECKPOINT_COMMIT` — açık kullanıcı onayı bekleniyor;
bu gate'te commit/staging yapılmadı, dış iletişim veya entegrasyon yetkisi verilmedi.
