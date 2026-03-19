# YouTick NFT Ticket Contract

NEAR smart contract for event creation, NFT tickets, gifts, trials and upload-session based publishing.

---

## Ana basliklar

- NEP-171 tabanli NFT ticket yapisi
- Event olusturma ve listeleme
- Ticket satin alma
- Gift drop ve claim
- Trial hesap olusturma
- Upload session ile signless publish
- Moderation ve purchase loglari

---

## Build

```bash
rustup target add wasm32-unknown-unknown
cargo build --target wasm32-unknown-unknown --release
```

## Test

```bash
cargo test
```

## Onemli method gruplari

### Event

- `create_event`
- `create_event_prepaid`
- `get_event`
- `get_events_paginated`

### Upload

- `create_upload_session`
- `revoke_upload_session`
- `get_upload_session`
- `nft_mint_prepaid`

### Ticket

- `buy_ticket`
- `gift_ticket`
- `get_videos`
- `has_ticket`

### Gift / Trial

- `create_gift_drop`
- `claim_gift`
- `claim_gift_and_create_account`
- `create_sponsored_trial_direct`
- `claim_free_ticket_direct`
- `upgrade_trial_account`

### Admin

- `ban_event`
- `unban_event`
- `get_banned_events`
- `withdraw_commission`

---

## Uyum notu

Kontratta bazi eski uyumluluk alanlari hala bulunur. Bunlar yeni KMS akisinin merkezi degildir; sadece eski kayitlarla uyum icin tutulur.
