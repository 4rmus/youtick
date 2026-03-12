# Contract Methods Reference

> `contracts/nft-ticket/src/lib.rs` icindeki guncel method gruplari

**Contract:** `youtick.near`

---

## Bu sayfa nasil okunmali?

Bu referans, aktif contract yuzeyini kisa ve temiz sekilde toplar. Eski uyumluluk methodlari ayri bir bolumde tutulur; yeni akis icin merkezde degildir.

---

## 1. Event methods

| Method | Tip | Ne yapar |
|--------|-----|----------|
| `create_event` | Change | Yeni event olusturur |
| `create_event_prepaid` | Change | Upload session akisi icin event olusturur |
| `get_event` | View | Tek event doner |
| `get_events` | View | Liste doner |
| `get_events_paginated` | View | Cursor tabanli liste doner |
| `get_events_count` | View | Banli olmayan event sayisini doner |

Notlar:

- `create_event` icin depozit gerekir
- `create_event_prepaid` upload session akisinda kullanilir

---

## 2. Upload methods

| Method | Tip | Ne yapar |
|--------|-----|----------|
| `create_upload_session` | Change | Kisa omurlu upload yetkisi acar |
| `revoke_upload_session` | Change | Upload yetkisini kapatir |
| `get_upload_session` | View | Session durumunu dondurur |
| `nft_mint_prepaid` | Change | Upload akisi icin NFT mint eder |
| `nft_mint_internal` | Private | Contract icinde kullanilir |
| `on_nft_mint_prepaid_callback` | Private | Mint hatasinda geri yukleme yapar |

---

## 3. Ticket and video methods

| Method | Tip | Ne yapar |
|--------|-----|----------|
| `buy_ticket` | Change | Dogrudan satin alma yapar |
| `buy_ticket_internal` | Private | Ic kullanim |
| `gift_ticket` | Change | Creator bir kullaniciya ticket hediye eder |
| `nft_mint` | Change | Manual/owner kontrollu mint |
| `get_video_metadata` | View | Belirli token icin video metadata doner |
| `get_videos` | View | Hesabin videolarini listeler |
| `get_storage_type` | View | `Kms` veya eski kayitlarda `Nova` dondurebilir |
| `has_ticket` | View | Hesabin ilgili event icin ticket'i var mi kontrol eder |
| `verify_ownership` | View | Belirli token sahipligini kontrol eder |
| `get_next_token_id` | View | Siradaki token id'yi doner |

Aktif yeni kayitlarda `storage_type` degeri `Kms` olur.

---

## 4. Purchase and wNEAR methods

| Method | Tip | Ne yapar |
|--------|-----|----------|
| `ft_on_transfer` | Change | wNEAR ile satin alma giris noktasi |
| `on_wnear_unwrap_for_purchase` | Private | wNEAR callback mantigi |
| `get_purchase_log` | View | Tek satin alma kaydi |
| `get_purchase_logs` | View | Kayit listesi |
| `get_purchase_count` | View | Toplam kayit sayisi |

Ekonomi:

- `%98` creator
- `%1` trial pool
- `%1` commission pool

---

## 5. Gift methods

| Method | Tip | Ne yapar |
|--------|-----|----------|
| `create_gift_drop` | Change | Gift key seti olusturur |
| `claim_gift` | Change | Mevcut hesaba claim eder |
| `claim_gift_and_create_account` | Change | Yeni hesap acip claim eder |
| `on_account_created` | Private | Yeni hesap callback'i |
| `is_gift_valid` | View | Link hala gecerli mi |
| `get_gift_info` | View | Temel gift bilgisi |
| `get_gift_info_full` | View | Ayrintili gift bilgisi |

---

## 6. Trial and onboarding methods

| Method | Tip | Ne yapar |
|--------|-----|----------|
| `add_onboarding_key` | Change | Yeni onboarding key ekler |
| `remove_onboarding_key` | Change | Onboarding key siler |
| `set_onboarding_config` | Change | Trial ayarlarini gunceller |
| `is_onboarding_key` | View | Key yetkili mi kontrol eder |
| `get_onboarding_config` | View | Trial ayarlarini doner |
| `get_daily_trial_count` | View | Gunluk trial sayisi |
| `create_sponsored_trial_direct` | Change | Client-side trial hesap acar |
| `create_sponsored_trial` | Change | Alternatif sponsored trial yolu |
| `claim_free_ticket_direct` | Change | Onboarding key ile free ticket claim |
| `claim_free_ticket_sponsored` | Change | Sponsored free ticket claim |
| `upgrade_trial_account` | Change | Trial hesaba yeni full-access key ekler |
| `fund_trial_pool` | Change | Trial pool'a kaynak ekler |
| `withdraw_trial_pool` | Change | Trial pool'dan ceker |
| `get_trial_pool_balance` | View | Trial pool bakiyesi |

---

## 7. Moderation and admin methods

| Method | Tip | Ne yapar |
|--------|-----|----------|
| `ban_event` | Change | Event'i banlar |
| `unban_event` | Change | Event ban'ini kaldirir |
| `is_event_banned` | View | Ban durumunu doner |
| `get_banned_events` | View | Banli event listesi |
| `set_next_token_id` | Change | Admin duzeltme yardimcisi |
| `get_commission_pool` | View | Komisyon havuzu |
| `withdraw_commission` | Change | Komisyon cekimi |
| `web4_get` | View | Web4 response doner |
| `web4_set_static_url` | Change | Static URL ayarlar |
| `web4_get_static_url` | View | Static URL doner |

---

## 8. NFT standard methods

Kontrat standart NEP-171 / 177 / 178 methodlarini da destekler:

- `nft_token`
- `nft_transfer`
- `nft_transfer_call`
- `nft_total_supply`
- `nft_tokens`
- `nft_supply_for_owner`
- `nft_tokens_for_owner`
- `nft_approve`
- `nft_revoke`
- `nft_revoke_all`
- `nft_is_approved`
- `nft_metadata`

---

## 9. Legacy compatibility methods

Bu methodlar yeni KMS akisinin merkezi degildir:

| Method | Durum |
|--------|-------|
| `set_nova_group` | Eski kayitlar icin uyumluluk |
| `get_nova_group` | Eski metadata okuma yardimcisi |
| `backfill_nova_groups` | Migration yardimcisi |
| `get_nova_platform_account` | Artik `None` doner |
| `get_nova_service_fee` | Artik `0` doner |

Runtime'dan kaldirilmis ve panic edenler:

- `fund_nova_platform`
- `set_nova_platform_account`
- `set_nova_service_fee`

---

## 10. Veri modeli notu

`VideoMetadata` icinde su alanlar bulunur:

- `encrypted_cid`
- `duration_seconds`
- `event_date`
- `content_type`
- `nova_group_id` (legacy)
- `storage_type`

Yeni kayit icin beklenen deger:

```text
storage_type = Kms
```
