---
layout: home

hero:
  name: YouTick
  text: Paid video on NEAR
  tagline: Direct upload to the media provider, USDC in escrow and short-lived playback tokens
  actions:
    - theme: brand
      text: Architecture
      link: /architecture/
    - theme: alt
      text: Configuration
      link: /getting-started/configuration

features:
  - title: NEAR source of truth
    details: Jobs, publications, tickets, escrow and playback devices are verified on-chain.
  - title: Direct upload
    details: Video bytes travel from the creator browser to the media provider, not through YouTick services.
  - title: Fail-closed access
    details: Playback requires a current ticket, a listed device and an active publication in final state before a short-lived token is issued.
---

Everything here runs on NEAR testnet. V2 (NEAR Auth, tickets, Cloudflare Stream)
is the current line; V1 (wallet, Livepeer Studio) is a closed pilot. See the
[architecture](architecture/README.md) and the
[V2 testnet runbook](v2-testnet-runbook.md).

The source contains disabled runtime gates. Follow the [release
runbook](release-runbook.md) before any deployment or activation.
