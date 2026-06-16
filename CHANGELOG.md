# Changelog

All notable user-facing changes to YouTick are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Open Source Prep

- Reduced public documentation to product, architecture, setup, testing, and security material.
- Moved internal launch planning, LLM-wiki notes, monitoring setup notes, and detailed operational evidence out of the public repo surface.
- Removed the old Crust upload client/storage-order implementation and the remaining Crust runtime read fallback.
- Clarified public-alpha wording across README and docs: YouTick is live public-alpha software, not production-ready and not fully decentralized.
- Kept KMS discovery registry-driven and fail-closed; production operator configs remain outside git.

### Storage And Upload

- Lighthouse remains the primary write provider through the Storage API Worker.
- The Storage API Worker requires wallet-signed upload authorization before issuing upload intents.
- Legacy Crust runtime read compatibility has been removed; playback now relies on the Media Delivery Worker and public IPFS gateway fallback.

### Web And Playback

- HOT Connect is the active NEAR wallet integration.
- Signless session grants are the preferred playback path.
- Gift and trial flows use server-side onboarding keys; onboarding secrets must not use `NEXT_PUBLIC_` env names.

---

## [1.0.0] - Public Alpha

### Added

- NEAR NFT ticket contract for event creation, ticket purchase, gift links, and trial/free flows.
- Access-control contract for session grants and scoped playback authorization.
- Operator registry contract for KMS operator discovery and threshold configuration.
- Browser-side AES-CTR media encryption.
- Multi-operator KMS share storage and reconstruction.
- Storage API Worker for guarded Lighthouse uploads.
- Media Delivery Worker for encrypted IPFS manifest and segment routing.
- Web4 proxy for public-alpha web delivery and same-origin API routing.

### Security

- KMS endpoints are discovered from the registry contract instead of public env fallbacks.
- Upload provider secrets live in Workers, not in the browser bundle.
- Onboarding keys are served through server-side endpoints and guarded by Turnstile when configured.
- Public docs disclose public-alpha centralization and content-integrity limits without publishing operator runbooks or live incident evidence.
