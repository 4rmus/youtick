# Changelog

## Unreleased

### Added

- Sahne interface: Discover, screening page with box office and screening
  room, creator page, tickets, studio and a five-step new screening wizard,
  English/Turkish dictionaries, shared tokens and primitives, and opt-in
  read-model account views (off by default).

### Changed

- Permanent redirects from `/watch?job=`, `/discover`, `/upload` and
  `/profile` to the new addresses.

- Reduced the repository to the Next.js app, NEAR market/access contracts,
  Livepeer Bridge Worker and Livepeer paid-media protocol.
- Made Livepeer TUS upload and JWT playback the only media path.
- Kept web, Worker and native-NEAR creator-fee activation gates disabled by
  default.
- Simplified CI and documentation to the remaining architecture.

### Removed

- Retired product flows, service workers, deployment scripts, compatibility
  models and generated contract artifacts from the previous architecture.

This entry records source changes only. It does not claim deployment, provider
activation or production readiness.
