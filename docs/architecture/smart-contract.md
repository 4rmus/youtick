# Smart Contract Architecture

> `contracts/nft-ticket/src/lib.rs` icindeki aktif mantigin ozeti

**Contract:** `youtick.near`

---

## Kontratin ana gorevi

Bu contract su alanlari yonetir:

- event kayitlari
- NFT ticket mint ve sahiplik kayitlari
- satin alma mantigi
- gift drop ve claim
- trial hesap olusturma
- moderation
- audit loglar
- upload session tabanli publish akisi

---

## Ana alt sistemler

| Alan | Ne yapar |
|------|----------|
| Events | Video kaydini ve fiyat bilgisini tutar |
| Tickets | Satin alma ve mint islemlerini yapar |
| Upload sessions | Kisa omurlu upload yetkisi acar |
| Gifts | Tek kullanimlik hediye claim akisini yonetir |
| Trials | Onboarding key ile yeni hesap acar |
| Moderation | Event ban/unban islemlerini tutar |
| Logs | Purchase kayitlarini saklar |

---

## Ekonomi modeli

Ucretli ticket akisi:

- `%98` creator
- `%1` trial pool
- `%1` commission pool

Ek olarak NFT storage icin ayri depozit mantigi vardir.

---

## Onemli veri yapilari

### Event

- baslik
- aciklama
- fiyat
- creator id
- olusturma zamani

### VideoMetadata

- `encrypted_cid`
- `duration_seconds`
- `content_type`
- `storage_type`
- `nova_group_id` (yalnizca eski kayitlarla uyum icin)

Yeni kayitlarda aktif tip `StorageType::Kms` olur.

### UploadSession

Upload icin:

- owner
- kalan butce
- kalan cagri sayisi
- bitis zamani
- durum

### GiftDrop

- creator
- event cid
- claim sayisi
- claim basi ayrilan depozit

### PurchaseLog

- buyer
- creator
- event cid
- token id
- fiyat
- creator payi
- komisyon

---

## Admin modeli

V1 public alpha owner-controlled ilerler. `nft-ticket` icin admin islemleri
owner-only direct akistadir; timelock governance V1 kapsaminda zorunlu degildir.
Bu hizli yayina cikis tercihinin karsiligi olarak yikici/debug metotlari normal
production build disinda kapatilir.

- `add_onboarding_key` ve `remove_onboarding_key` owner-only'dir.
- `reset_v11`, `wipe_and_reinit`, `test_insert` gibi yikici/debug yuzeyler migration build disindaki normal build'de kullanilmaz.
- `propose_action` / `execute_action` kod yuzeyi korunur, ama V1 icin urun iddiasi timelock governance degildir.
- `takedown_event` (acil icerik icin) timelock'a tabi degildir, NEP-297 event log yayar.
- `accept_ownership` iki asamali sahiplik devrinin ikinci adimidir.

---

### Event

- `create_event`
- `create_event_prepaid`
- `get_event`
- `get_events`
- `get_events_paginated`
- `get_events_count`

### Upload

- `create_upload_session`
- `revoke_upload_session`
- `get_upload_session`
- `nft_mint_prepaid`

### Ticket ve video

- `buy_ticket`
- `gift_ticket`
- `nft_mint`
- `get_video_metadata`
- `get_videos`
- `get_storage_type`
- `has_ticket`

### Gifts

- `create_gift_drop`
- `claim_gift`
- `claim_gift_and_create_account`
- `is_gift_valid`
- `get_gift_info`
- `get_gift_info_full`

### Trials

- `add_onboarding_key`
- `remove_onboarding_key`
- `set_onboarding_config`
- `is_onboarding_key`
- `get_onboarding_config`
- `create_sponsored_trial_direct`
- `claim_free_ticket_direct`
- `create_sponsored_trial`
- `claim_free_ticket_sponsored`
- `upgrade_trial_account`
- `get_trial_pool_balance`
- `get_daily_trial_count`

### Moderation ve raporlama

- `ban_event`
- `unban_event`
- `is_event_banned`
- `get_banned_events`
- `get_purchase_log`
- `get_purchase_logs`
- `get_purchase_count`
- `get_commission_pool`
- `withdraw_commission`

---

## Legacy uyumluluk notlari

Kontratta `StorageType::Nova` placeholder'i Borsh uyumlulugu icin tutulur, ancak
`set_nova_group`, `get_nova_group` ve `backfill_nova_groups` methodlari v10
cikartilmistir (kaldirilmistir). Yeni KMS akisinin parcasi degildir.

Ayrica bazi Nova funding methodlari runtime yuzeyinden kaldirilmistir ve panic eder:

- `fund_nova_platform`
- `set_nova_platform_account`
- `set_nova_service_fee`

View helper olarak kalanlar sifir ya da `None` doner:

- `get_nova_platform_account`
- `get_nova_service_fee`

---

## Ozet

Yeni mantikta kontratin aktif rolu:

- erisim ve sahiplik kaydi
- satin alma ve hediye dagitimi
- upload session koordinasyonu

Medya sifreleme ve anahtar saklama ise artik kontratin degil, browser + multi-operator KMS + access-control + operator-registry hattinin isidir.
