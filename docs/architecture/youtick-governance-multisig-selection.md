# YouTick Yönetim Multisig'i Seçimi

> 4 Ekim 2026 — Gate `GOVERNANCE_MULTISIG_SELECTION`. **Araştırma / LOCAL_STATIC +
> EXTERNAL (web ve GitHub okuması)**. Kurulum, hesap oluşturma, imza veya canlı işlem
> yapılmadı. Tarihler GitHub API'sinden 4 Ekim 2026'da okundu; sonradan değişebilir.
> Karar belgesi: [Mainnet yönetişim brief'i](./youtick-mainnet-governance-brief.md).

## Karar önerisi

**Trezu (trezu.org) üzerinden kurulan bir Sputnik DAO v2 kontratı**, 2-of-3 yönetim
multisig'i olarak kullanılır. Üyeler K1 (sahip, donanım cüzdanı), K2 (avukat, kendi
donanım cüzdanı) ve K3 (sahip, soğuk kurtarma) hesaplarıdır. Bu hesap Market `admin`,
Market `platform_account` ve access-control `owner` rollerini taşır. Guardian ve
takedown işlemleri multisig'den değil, sınırlı FunctionCall anahtarlarından yürür.

Güven düzeyi: orta-yüksek. Açık riskler aşağıda; kurulum `MAINNET_KEY_CEREMONY`
gate'inde ve ayrı onayla yapılır.

## Kontrattan çıkan gereksinimler

`main` (3749293) ile açık PR #257 (self-upgrade) ve #258 (access guardian) kaynağı
okunarak çıkarıldı.

| Rol | Hesap | Çağrılan yöntemler | Depozit |
|---|---|---|---|
| Market `admin` | Multisig | `propose_role_rotation`, `execute_role_rotation`, `propose_bridge`, `execute_bridge_rotation`, `request_bridge_unfreeze`, `unfreeze_bridge`, `request_new_purchases_unpause`, `unpause_new_purchases`, `propose_code_upgrade`, iptaller | Yok |
| Market `platform_account` | Multisig | `withdraw_platform_balance`, `withdraw_platform_near`, `rotate_quote_public_key`; ardından USDC `ft_transfer` | Çekim yok; `ft_transfer` 1 yocto |
| Access `owner` | Multisig | `propose_action`, `execute_action`, `cancel_action`, `pause_contract`, `pause_scope` | Yok |
| Market `guardian` | Guardian hesabı | `pause_new_purchases`, `freeze_bridge`, `cancel_bridge_rotation`, `cancel_role_rotation`, `cancel_bridge_unfreeze`, `cancel_new_purchases_unpause`, `cancel_code_upgrade` | Yok |
| Access `guardian` | Aynı guardian hesabı | `pause_contract`, `pause_scope` | Yok |
| `takedown_authority` | YOUTICK LTD operasyon hesabı | `takedown_livepeer_publication` | Yok |

Sonuçlar:

- Multisig yalnız küçük JSON argümanlı çağrılar yapar. Kod güncellemesinde multisig
  yalnız hash'i onaylar; WASM'ı herkes gönderebilir (Gate 3). Büyük argüman taşıma
  ihtiyacı yoktur.
- Multisig'in depozitli çağrı (1 yocto `ft_transfer`) ve storage kaydı önerebilmesi
  gerekir.
- Guardian ve takedown yöntemlerinin hiçbiri depozit istemez; bu yüzden FunctionCall
  anahtarlarıyla çağrılabilirler. Bu yöntemlere `assert_one_yocto` eklenmemelidir.

## Adaylar

| Aday | Bakım | Son etkinlik | Denetim | Uygun mu |
|---|---|---|---|---|
| **Sputnik DAO v2** (`near-daos/sputnik-dao-contract`) | NEAR DevHub / Trezu ekibi; repo açıklaması "Smart contracts for trezu.org" | Son push 27 May 2026. Son sürüm etiketi 3.0.0 (2022); etiketler güncel değil | Valhalla Security, 29 Nis 2025. 1 kritik bulgu düzeltildi (PR #233); 1 yüksek, 3 orta, 3 düşük bulgu "kabul edildi", düzeltilmedi. Denetim sonrası kod (Global Contracts, #233) denetim kapsamı dışında | **Evet.** İsteğe bağlı FunctionCall önerisi (args, depozit, gas), NEP-141 `Transfer`, ayarlanabilir eşik |
| **Trezu** (`NEAR-DevHub/trezu`, trezu.org) | NEAR-DevHub | `release-1.29.1`, 2 Eki 2026; haftalık sürüm | Sputnik denetimine dayanır; arayüz/backend denetimi bulunamadı | **Evet**, arayüz olarak: Ledger ile giriş, ayrı yönetim/finans eşikleri, gas sponsorluğu |
| `olskik/trezu` (brief'teki bağlantı) | Üçüncü taraf fork (`frol-ai/trezu` → `NEAR-DevHub/trezu`) | Son push 23 Tem 2026 | Yok | **Hayır.** Asıl repo değil; brief bağlantısı düzeltildi |
| NEAR Treasury (neartreasury.com) | NEAR-DevHub; Sputnik tabanlı | Son commit 6 Mar 2026 | Sputnik ile aynı | Trezu'nun öncülü görünüyor; yeniden adlandırma doğrulanmadı |
| `near/core-contracts` multisig / multisig2 | NEAR | multisig2'de 2021'den beri yalnız README/lisans değişiklikleri | Yok; README "kendi incelemenizi yapın" diyor | **Hayır.** Web arayüzü yok, fiilen bakımsız |
| Astra++ / AstroDAO | near-ndc / near-daos | 2023 | Bulunamadı | **Hayır.** Fiilen durmuş |

## Önerilen Sputnik yapılandırması

1. **Eşik:** Her öneri türü için `Weight(2)`. `Ratio(2,3)` kullanılmaz: Sputnik eşiği
   `num*total/denom + 1` diye hesaplar; 3 üyede bu **3'te 3** eder ve bir anahtar
   kaybında multisig kilitlenir. (`sputnikdao2/src/policy.rs`, `to_weight`;
   kaynaktan doğrulandı.)
2. **Politika değişikliği:** `ChangePolicy`, `AddMemberToRole`, `RemoveMemberFromRole`
   dahil tüm türlerde aynı `Weight(2)`. Hiçbir üye eşiği tek başına düşüremez.
3. **Öneri yetkisi:** Yalnız üç üye öneri açabilir. Öyle olunca spam riski olmadığından
   öneri teminatı (bond) düşük tutulabilir. Not: açık issue #238'e göre zincir üstü
   çağrısı başarısız olan önerinin teminatı iade edilmiyor.
4. **Öneri süresi:** 7 gün (varsayılan). Avukatın inceleme süresini kapsar; Market
   timelock'larından bağımsızdır.
5. **Fabrika güncellemesi:** DAO, fabrikanın otomatik kod güncellemesini kapatır ya da
   PR #233'teki gecikmeli güncelleme modeli incelendikten sonra kabul edilir. Aksi
   halde fabrika hesabı ele geçirilirse DAO kodu değiştirilebilir.
6. **Okunabilirlik:** Sputnik argümanları base64 saklar. Avukat (K2) için her öneri
   türünü düz dille açıklayan bir onay kontrol listesi hazırlanır (`PUBLIC_AUTHORITY_MAP`
   veya runbook).

## FunctionCall anahtar politikası

Protokol gerçekleri ([docs.near.org access keys](https://docs.near.org/protocol/access-keys),
[Nomicon AccessKey](https://nomicon.io/DataStructures/AccessKey)):

- FunctionCall anahtarı **depozit ekleyemez** (1 yocto dahil).
- Tek bir `receiver_id`'ye bağlıdır. Boş `method_names` her yönteme izin verir; bu
  yüzden liste her zaman açıkça yazılır.
- Allowance yalnız gas ücretini karşılar; bittiğinde anahtar imza atamaz ve değiştirmek
  için silinip yeniden eklenmesi gerekir.

Politika:

| Anahtar | Hesap | receiver_id | method_names | Kimde |
|---|---|---|---|---|
| Guardian–Market | Guardian | Market | Yukarıdaki 7 guardian yöntemi | Sahip ve GK, kişi başı ayrı anahtar |
| Guardian–Access | Guardian | Access-control | `pause_contract`, `pause_scope` | Sahip ve GK, kişi başı ayrı anahtar |
| Takedown | YOUTICK LTD operasyon | Market | `takedown_livepeer_publication` | Sahip ve GK, kişi başı ayrı anahtar |

- Bir FunctionCall anahtarı tek kontrata bağlandığı ve aynı genel anahtar bir hesaba
  iki kez eklenemediği için, her kişi Market ve access-control için **ayrı** guardian
  anahtarı taşır.
- **Hiçbir açma (unpause/unfreeze) yöntemi bu listelere girmez.**
- Acil durdurma anahtarı tam ihtiyaç anında tükenmesin diye allowance cömert tutulur
  (veya sınırsız) ve guardian hesabı yeterli NEAR ile fonlanır. Allowance, kod değil,
  yalnız gas harcatabilir.
- Guardian hesabının FullAccess anahtarı soğukta tutulur.
- Durdurma yolu önce testnet'te tatbik edilir; tatbikat mainnet kanıtı sayılmaz.

## Kontrat hesabının kilitlenmesi

Mainnet Market hesabından FullAccess anahtar silinince hesap "kilitli" olur: dışarıdan
işlem gönderilemez, kod çalışmaya devam eder. Bundan sonra kod yalnız Gate 3 yolundan
değişebilir. Bu yüzden anahtar silinmeden önce testnet'te gerçek bir self-upgrade
tatbikatı ve yeterli gas kanıtı gerekir; hata, kodu kalıcı olarak dondurur.

## Riskler

- Sputnik denetiminde "kabul edilmiş" ama düzeltilmemiş bulgular ve denetim sonrası
  birleştirilmiş kod.
- Fabrika güncelleme güveni (yukarıdaki 5. madde).
- Başarısız öneride teminatın iade edilmemesi (#238).
- Trezu arayüzünün özel FunctionCall önerisi oluşturup oluşturamadığı doğrulanmadı. Gerekirse
  öneriler near-cli ile açılır, oylama Trezu'dan yapılır.
- Trezu backend'i üçüncü taraf altyapıdır; yetki kaynağı her zaman zincirdeki kontrattır.

## Doğrulanamayanlar

- neartreasury.com'un resmi olarak Trezu'ya dönüştüğü.
- Trezu arayüzünde özel FunctionCall önerisi desteği.
- Mainnet'teki kanonik Sputnik fabrika hesabı ve kod hash'i (`sputnik-dao.near` mı,
  Trezu fabrikası mı).
- Sputnik v2'nin mainnet'te kamuya açık bir güvenlik olayı yaşayıp yaşamadığı (bulunamadı).
- 2026'da MyNearWallet, HERE, Nightly ve Ledger Live'ın Ledger ile oylama desteği.
  Trezu belgeleri ve üçüncü taraf kaynaklar Trezu ve Meteor için Ledger desteği bildiriyor.

## Kaynaklar

- [near-daos/sputnik-dao-contract](https://github.com/near-daos/sputnik-dao-contract)
- [NEAR-DevHub/trezu](https://github.com/NEAR-DevHub/trezu), [trezu.org](https://trezu.org),
  [Trezu Ledger rehberi](https://docs.trezu.org/guides/ledger.md),
  [Trezu oylama ayarları](https://docs.trezu.org/governance/voting-settings.md)
- [Valhalla Security Sputnik denetim raporu (trezu.org üzerinden)](https://framerusercontent.com/assets/jJWorQVtJesNL6ga41019jrMtis.pdf)
- [near/core-contracts](https://github.com/near/core-contracts)
- [docs.near.org access keys](https://docs.near.org/protocol/access-keys),
  [Nomicon AccessKey](https://nomicon.io/DataStructures/AccessKey)
