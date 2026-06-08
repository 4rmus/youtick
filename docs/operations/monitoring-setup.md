# Monitoring Setup (Launch Gate item)

> Turnkey steps to close the "Sentry + Uptime Kuma + Telegram alert" gate item.
> All worker health endpoints already exist (no code needed) — this is wiring.
> Owner action required for the external accounts (Sentry DSN, Uptime Kuma host,
> Telegram bot); everything else is filled in below.

## 1. Sentry (already wired in code — just enable)

Sentry is initialized in `apps/web/instrumentation.ts` /
`instrumentation-client.ts` but is a **no-op unless two env vars are set** in the
deployed environment:

```env
NEXT_PUBLIC_SENTRY_ENABLED=true
NEXT_PUBLIC_SENTRY_DSN=<your-project-dsn>
```

Then trigger one test error and confirm it appears in Sentry. Until both are set,
front-end error capture is OFF.

## 2. Uptime Kuma — monitor list

Health endpoints already shipped by the workers:

| Monitor | URL | Healthy = |
|---|---|---|
| Web (Web4 proxy) | `https://youtick.net/` | HTTP 200 |
| Web4 proxy health | `https://youtick.net/__health` | HTTP 200 |
| Storage API | `https://youtick-storage-api.araafatsum.workers.dev/__health` | HTTP 200 |
| Storage provider | `https://youtick-storage-api.araafatsum.workers.dev/provider-health` | `ready:true` |
| KMS operator a | `https://youtick-kms-a.araafatsum.workers.dev/health` | `ok:true` |
| KMS operator b | `https://youtick-kms-b.araafatsum.workers.dev/health` | `ok:true` |
| KMS operator c | `https://youtick-kms-c.araafatsum.workers.dev/health` | `ok:true` |
| KMS operator d | `https://youtick-kms-d.araafatsum.workers.dev/health` | `ok:true` |
| KMS operator e | `https://youtick-kms-e.araafatsum.workers.dev/health` | `ok:true` |
| Media delivery | `https://<media-delivery-worker>/__health` | HTTP 200 (fill exact URL from `workers/media-delivery/wrangler.toml`) |
| NEAR RPC route | `https://youtick.net/api/near-rpc` (POST status) | HTTP 200 |

KMS endpoints are the live registry values (`registry.youtick.near
list_decryption_operators`, verified 2026-06-08). If operators change, re-read
the registry and update the monitors.

Recommended: 60s interval, 2 retries, monitor the KMS `ok:true` body via Uptime
Kuma's keyword check (not just HTTP 200 — a degraded operator can still 200).

## 3. Telegram alert

1. Create a bot via `@BotFather`, get the bot token.
2. Get your chat id (`@userinfobot` or the `getUpdates` API).
3. In Uptime Kuma → Settings → Notifications → Telegram, paste token + chat id.
4. Attach the notification to every monitor above.
5. **Fire one test alarm** (pause a monitor / use the "Test" button) and confirm
   the Telegram message arrives. This is the gate's "test alarm passed" evidence.

## 4. Gate evidence to record

- Sentry: screenshot of the test error captured.
- Uptime Kuma: the monitor list above, all green.
- Telegram: screenshot of the test alarm message + timestamp.

Record these in the release evidence alongside the smoke-test results.
