# YouTick Web4 Proxy

The Web4 proxy lifts the `youtick.net` domain over the Web4/static
origin and adds runtime behavior that a static export alone cannot
deliver.

## Origin and Fallback

- `WEB4_ORIGIN`: primary static origin. Usually a Cloudflare Pages build.
- `WEB4_FALLBACK_ORIGIN`: Web4/IPFS path used if the primary origin errors out.
- `ALLOWED_DOMAINS`: list of hosts the proxy will serve.

## API Proxy Responsibilities

In proxy-backed mode, `youtick.net` supports these API surfaces:

- `/api/onboarding-key`
- `/api/near-rpc`
- `/api/crust/*`

`youtick.near.page` or bare IPFS gateways run static-only. In those
environments, flows that depend on the onboarding key or storage-order
are not supported.

`/api/near-rpc` is the browser RPC call surface. The browser does not
talk to public RPC origins directly; the proxy fails over between
FastNear, the official NEAR RPC and dRPC upstreams. Only responses to
allowlisted read-only view calls are placed in a short-lived edge
cache; transaction/broadcast responses are not cached.

## Headers and CSP

Next's static export does not apply the `headers()` rules from
`next.config.ts` to the Web4 build. CSP and core security headers are
therefore added by the proxy. The "headers not applied" warning from
`npm run build:web4` is expected.

## Secrets

For trial onboarding:

```bash
npx wrangler secret put ONBOARDING_KEYS
npx wrangler secret put TURNSTILE_SECRET_KEY
```

`ONBOARDING_KEYS` can be a comma-separated pool of `ed25519:`-prefixed
keys. When `TURNSTILE_SECRET_KEY` is set, `/api/onboarding-key` will
not hand out a key without a challenge token.

For onboarding-key rotation, use `scripts/add-onboarding-key.mjs` first
and then `scripts/remove-onboarding-key.mjs` once the new deploy is
verified. Read the current key inventory with
`scripts/list-onboarding-keys.mjs`.

## Local dev and test

```bash
cd workers/web4-proxy
npm install
npm test -- --run
npm run check
npx wrangler dev
```

## Deploy

```bash
npx wrangler deploy
```

Custom domain routes live in `wrangler.toml`. After deploy:

```bash
curl https://youtick.net/__health
curl -I https://youtick.net/
```

`/__health` should return JSON; on HTML responses the
`Content-Security-Policy` and `X-Proxy: youtick-web4` headers should
be present.
