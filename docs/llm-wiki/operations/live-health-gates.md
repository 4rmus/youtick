---
title: Live Health Gates
status: live
area: operations
last_checked: 2026-05-19
confidence: medium
sources:
  - docs/release-runbook.md
  - docs/launch-plan-2026-05.md
---

# Live Health Gates

## Kisa ozet

Bu sayfa canli sistem sorularinda kosulacak kontrol listesidir. Bu vault bootstrap sirasinda bu kontroller calistirilmadi.

## Son check - 2026-05-19

| Gate | Sonuc |
|---|---|
| Registry threshold | PASS: `required_shares=3`, `total_operators=5` |
| Decryption operator listesi | PASS: 5 operator, 5 active |
| KMS health | PASS: 5/5 ready; endpointler bu sayfaya yazilmadi |
| Storage API provider health | PASS: `ready:true`, `uploadsEnabled:true`, `uploadGuardReady:true` |
| Auth'suz upload intent | PASS: `Unauthorized` |
| Trial pool balance | PASS/read-only: `0.826 NEAR` |
| `youtick.near` code hash | PASS: current live `HA3i...`; latest deploy block `198989245`; working-tree WASM artefact matches live |
| Full upload-buy-watch smoke | NOT RUN |

Not: Bu check read-only ve health seviyesinde yapildi; browser playback veya purchase smoke degildir.

## Health gate

```bash
near contract call-function as-read-only registry.youtick.near list_decryption_operators text-args '' network-config mainnet now
near contract call-function as-read-only registry.youtick.near get_threshold_config text-args '' network-config mainnet now
near contract call-function as-read-only youtick.near get_trial_pool_balance text-args '' network-config mainnet now
```

Beklenen:

- bes aktif decryption operator,
- threshold `5 / 3`,
- trial/free flows ya funded ya da UI'da net disabled.

KMS:

```bash
curl -s https://<operator-endpoint>/health
```

Beklenen:

- HTTP 200,
- body icinde `ok: true`.

Storage API:

- `provider-health` ready mi?
- `/uploads/intent` auth'suz `Unauthorized` donuyor mu?
- Signed upload challenge + intent + small file smoke pass mi?

## Dikkat noktalar

- Gercek operator endpointleri wiki'ye yazilmaz.
- Health sonucunu kaydederken private secret veya real operator config ekleme.
- Canli check sonucu tarih ve kapsamla [[log|log.md]] icine islenir.

## Ilgili sayfalar

- [[launch-status|Launch status]]
- [[known-risks|Known risks]]
- [[claims|Claims]]
