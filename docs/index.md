---
layout: home

hero:
  name: YouTick
  text: Paid video on NEAR and Livepeer
  tagline: Direct TUS upload, USDC settlement and short-lived JWT playback
  actions:
    - theme: brand
      text: Architecture
      link: /architecture/
    - theme: alt
      text: Configuration
      link: /getting-started/configuration

features:
  - title: NEAR source of truth
    details: Jobs, publications, payments, entitlements and Play grants are verified on-chain.
  - title: Direct Livepeer upload
    details: Video bytes travel from the creator browser to Livepeer, not through YouTick services.
  - title: Fail-closed access
    details: Playback requires current entitlement, grant and publication state before a short-lived token is issued.
---

The source contains disabled runtime gates. Follow the [release
runbook](release-runbook.md) before any deployment or activation.
