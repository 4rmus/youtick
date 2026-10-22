# Contributing

Use the smallest change that preserves the Livepeer-only boundary.

- web changes stay in `apps/web`
- market/access changes stay in `contracts`
- control-plane changes stay in `workers/livepeer-bridge`
- wire-format changes update `protocol/paid-media-livepeer-v1` and its vectors;
  that directory is the frozen V1 format and gains no new profiles
- V2 media descriptors (the Cloudflare Stream profile a Market V2 upload names
  in `profile_config_sha256`) live in `protocol/paid-media-v1` and are checked
  by `node scripts/check-paid-media-v1.mjs`; a descriptor change changes its
  hash, so update its consumers in the same change
- behavior changes update these docs

Run the relevant commands in [Testing](testing.md). Do not add compatibility
routes or deployment automation for removed architecture. Never commit keys,
tokens, `.dev.vars`, `.env.local` or `.near-credentials`.
