---
name: youtick-marketing
description: >
  Marketing playbook for YouTick. Use when writing landing copy, messaging,
  positioning, launch notes, social content, campaign ideas, GTM strategy,
  creator outreach, audience segmentation, SEO direction, or growth ideas that
  must fit the real product and codebase of YouTick.
version: 1.1.0
license: MIT
platforms:
  - claude
  - gemini
  - openai
  - markdown
tags:
  - youtick
  - marketing
  - messaging
  - positioning
  - creator-economy
  - web3
metadata:
  author: youtick
  version: "1.1.0"
---

# youtick-marketing

Marketing guide for turning YouTick's real product strengths into clear,
believable stories.

## First read

Open `../_shared/youtick-analysis.md` first.

Then inspect:

- `README.md`
- `apps/web/app/layout.tsx`
- `apps/web/app/page.tsx`
- `apps/web/components/landing/*`
- `apps/web/lib/translations.ts`

## Positioning summary

YouTick is best positioned as:

- a creator-first premium video platform
- built for direct-to-fan monetization
- with encrypted access, on-chain ownership, and low platform take

Do not market it as a generic "Web3 everything" product.
Its clearest story is focused and practical:

- artists and filmmakers sell premium video
- fans unlock with digital tickets
- creators keep 98% of each sale

## Best-fit audiences

### Primary creator audiences

- independent musicians
- filmmakers
- niche media collectives
- premium course or membership creators with video-first content

### Secondary audiences

- fans who want collectible access
- communities that value ownership and gifting
- Web3-native creators who already care about direct revenue and audience ownership

### Internal caution

The current landing is much stronger for creator acquisition than viewer acquisition.
If you write viewer-focused copy, make it simpler and less ideological.

## Core message pillars

### 1. Creator economics

Lead with:

- creators keep 98% of every sale
- instant or near-instant payout feel
- no large platform taking half the value

This is the sharpest commercial wedge in the repo.

### 2. Direct-to-fan ownership

Translate NFT language into plain language:

- ticket
- access pass
- owned access
- transferable proof of purchase

Avoid leading with speculation, collectibles hype, or abstract token language.

### 3. Premium access protection

Use simple language:

- encrypted video
- only ticket holders can watch
- protected premium content

Do not force the audience to learn KMS, session keys, or storage jargon unless
the audience is technical.

### 4. Lower-friction onboarding

Emphasize:

- gift links
- free or sponsored trial flow
- not every viewer needs deep crypto knowledge on day one

This is how YouTick answers the biggest Web3 objection.

### 5. Independence and resilience

Use with care:

- IPFS-backed delivery
- no single platform lock-in
- creator control

This is valuable, but it should usually support the main story rather than replace it.

## Proof ladder

Use stronger language when the claim is grounded in live product behavior, and
softer language when the claim is comparative or modeled.

### Strong proof claims

- 98% creator payout
- encrypted premium access
- gift links
- sponsored trial onboarding
- on-chain ticket ownership

### Medium proof claims

- simpler onboarding than many Web3 products
- resilient distribution and failover
- better creator control than large centralized platforms

### Claims to re-check before campaigns

- broad platform comparisons in charts
- ROI calculator assumptions
- phrases like "50x lower" unless verified for the exact audience and context
- any statement that sounds like an audited industry benchmark

## Claims you can lean on

These are strongly supported by the current repo story:

- 98% creator payout
- NFT-ticket-based access
- encrypted video access
- gift links
- trial accounts / sponsored onboarding
- bilingual product support
- NEAR mainnet deployment framing

## Claims that need careful wording

### "No backend"

Do not say this flatly.

Safer wording:

- client-first architecture
- minimal backend services
- most core flows happen in the browser

Reason:

- the repo includes a Cloudflare KMS worker and a Web4 proxy worker

### "Cross-chain payments"

Use cautious language:

- experimental
- optional
- supported paths in selected flows

Do not make it the headline unless the current release is verified end to end.

### "Censorship-proof"

Use softer wording unless the context is technical:

- more creator control
- reduced platform dependence
- resilient distribution

### Comparative revenue charts

Treat the landing comparison widgets as marketing devices, not audited market truth.

Before using them in:

- ads
- PR
- investor decks
- partnership outreach

re-check the assumptions against current public sources and intended audience.

## Recommended tone

Write like this:

- creator-first
- confident
- premium
- direct
- practical

Avoid:

- buzzword piles
- vague "revolutionizing Web3" copy
- jargon-heavy blockchain explanations
- aggressive anti-Web2 language without a product proof point next to it

## Funnel-aware messaging

### Top of funnel

Best topics:

- why creators lose too much revenue today
- why direct-to-fan premium video matters
- why "sell access, not ads" is attractive

### Mid funnel

Best topics:

- how upload works in plain language
- how protected access works
- why gift links and trial accounts matter
- why payout structure is better than legacy platforms

### Bottom funnel

Best topics:

- creator setup checklist
- first upload walkthrough
- "what fans need to do"
- pricing clarity
- proof of live product capabilities

## Content angles that fit this repo

### Creator acquisition

- "What 98% payout actually changes for independent artists"
- "How to sell concert films directly to fans"
- "A better premium video model than ads or subscriptions alone"

### Viewer education

- "You do not need to be crypto-native to unlock premium content here"
- "Gift tickets make onboarding feel like a normal invite flow"
- "Why owned access feels better than rented platform access"

### Product storytelling

- follow one journey end to end: upload -> sell -> claim -> watch
- show real screens, not abstract diagrams only

## SEO and site-copy guidance

Metadata already points toward:

- decentralized video
- premium video
- NFT tickets
- creator economy
- encrypted streaming
- NEAR protocol

When writing SEO copy:

- keep "premium video" and "creator revenue" close to the top
- include plain-language variants, not only crypto terms
- write for musicians and filmmakers, not only developers

## Pre-publish checklist

Before publishing copy, confirm:

1. Is the claim supported by the live code or current app?
2. Is the primary audience clear: creator or viewer?
3. Is the CTA aligned with the page?
4. Are we using simple language for complex mechanics?
5. Are we over-emphasizing experimental features?

## Repo-specific do and don't

Do:

- anchor messaging in creator payout and direct fan relationship
- use gift and trial flows as friction reducers
- keep technical credibility
- use visuals and examples from concert/film culture
- distinguish hard product truth from modeled comparisons

Don't:

- lead with protocol names unless the audience is technical
- describe every technical subsystem in marketing copy
- overclaim decentralization or cross-chain scope
- reduce the product to "NFT marketplace for videos"
- turn the ROI calculator into an unqualified universal promise

## Useful references

- `../_shared/youtick-analysis.md`
- `README.md`
- `apps/web/app/layout.tsx`
- `apps/web/components/landing/HeroSection.tsx`
- `apps/web/components/landing/PainPointsSection.tsx`
- `apps/web/components/landing/CompetitiveAdvantagesSection.tsx`
- `apps/web/components/landing/ROICalculator.tsx`
- `apps/web/components/landing/FinancialComparisonChart.tsx`
- `apps/web/lib/translations.ts`
