---
name: youtick-design
description: >
  Design playbook for YouTick. Use when shaping UI, UX, information hierarchy,
  copy placement, visual direction, interaction details, page redesigns,
  component design, empty/loading/error states, or conversion-focused experience
  improvements inside the YouTick product.
version: 1.1.0
license: MIT
platforms:
  - claude
  - gemini
  - openai
  - markdown
tags:
  - youtick
  - design
  - ux
  - ui
  - product-design
  - conversion
metadata:
  author: youtick
  version: "1.1.0"
---

# youtick-design

Design guide for keeping YouTick visually distinctive while improving clarity,
trust, and conversion.

## First read

Open `../_shared/youtick-analysis.md` first.

Then inspect:

- `apps/web/app/globals.css`
- `apps/web/lib/constants.ts`
- `apps/web/components/landing/*`
- `apps/web/components/ui/*`
- the route or component you are changing

## Visual DNA

YouTick should feel like:

- premium
- cinematic
- creator-led
- slightly rebellious
- technically trustworthy

The current system is built from:

- black and deep-zinc surfaces
- NEAR green, purple, and blue accents
- concert/cinema imagery
- glow effects, orbs, and gradient energy
- high contrast text
- bold CTAs and strong hierarchy

## Two active visual modes

### 1. Landing mode

Emotional, aspirational, and brand-heavy.

Common traits:

- large type
- dramatic imagery
- glowing color accents
- bold creator-economy statements

### 2. Product mode

Operational, clear, and trust-focused.

Common traits:

- denser layouts
- explicit loading/error states
- wallet/payment clarity
- darker cards and utility-first structure

Do not accidentally flatten both into the same generic dashboard look.

## Current consistency note

The trial/onboarding flow still carries an older purple-gradient style that feels
slightly disconnected from the sharper NEAR-branded landing and app surfaces.

If you redesign those screens:

- keep the warmth and accessibility
- but move them closer to the main brand system

There is another smaller consistency issue too:

- discover/grid cards lean more purple-blue
- slider and some hero surfaces lean more NEAR-green

Unify intentionally. Do not smooth them into bland sameness.

## What design must optimize for

### 1. Primary action clarity

Every important screen needs one obvious next step:

- upload
- buy
- claim
- play
- connect wallet
- upgrade trial

If the user has to think too long, conversion drops fast.

### 2. Trust around money and access

The product asks users to trust:

- wallets
- payments
- ownership checks
- encrypted playback

Design should reduce fear with:

- clear labels
- visible state changes
- simple cost language
- explicit success states

### 3. Content desirability

This is still a media product.

Do not let chain mechanics overpower:

- thumbnails
- titles
- creator identity
- premium feel of the content itself

### 4. Friction management

When flows are complex, the UI should stage complexity instead of exposing
everything at once.

Show:

- what the user needs now
- why it matters
- what happens next

### 5. Separate creator value from buyer cost

This product sells with creator upside, but it converts with buyer clarity.

When designing commerce-heavy surfaces:

- show creator benefit in the broader story
- show viewer cost and access rules at the action moment
- do not mix emotional promise and fee logic into one muddy block

## State-rich flow checklist

The most important surfaces are not static pages. They are state machines.

Design for:

- disconnected vs connected
- locked vs owned
- uploading vs waiting vs failed
- claim valid vs invalid vs already used
- trial available vs temporarily unavailable
- swap/purchase pending vs confirmed

## Page-specific guidance

### Landing

Goal:

- sell the creator value proposition quickly

Design priorities:

- strong hero
- believable proof points
- clear upload and discover entry points
- emotional energy without noise

### Upload

Goal:

- make a complex technical process feel controlled and worth it

Design priorities:

- obvious status steps
- file and price clarity
- cost breakdown legibility
- calm handling of long waits

### Discover

Goal:

- make premium content feel browseable and trustworthy

Design priorities:

- strong thumbnails
- creator attribution
- price visibility
- graceful empty state

### Watch / purchase

Goal:

- convert and then reward instantly

Design priorities:

- clear owned vs locked state
- purchase card clarity
- playback confidence
- smooth transition from buy/claim to watch

### Claim / trial

Goal:

- reduce fear and finish onboarding quickly

Design priorities:

- simple choice architecture
- low cognitive load
- strong reassurance
- obvious success handoff

### Profile

Goal:

- make ownership and creator activity feel real

Design priorities:

- clean inventory structure
- useful separation between owned tickets and created events
- visible gift and upgrade actions

## Motion guidance

Use motion to reinforce hierarchy, not decorate emptiness.

Good motion in this repo:

- subtle reveals
- glow pulse
- CTA hover lift
- loading indicators that explain system work

Bad motion in this repo:

- constant movement on dense utility screens
- flashy effects around critical payment actions
- motion that hides latency rather than communicating it

## Typography and color guidance

Use bold, readable display type for brand sections and simple readable text for
product sections.

Keep these principles:

- white text on dark surfaces for core legibility
- green for positive/action/value moments
- purple and blue as energy/support accents
- red for warnings or "old system" pain framing

Avoid default bright SaaS palettes and generic purple-only gradients.

## UX writing guidance

Keep microcopy:

- short
- reassuring
- concrete

Prefer:

- "Create account"
- "Claim gift"
- "Start watching"
- "Upload your work"

Avoid:

- technical labels as first language
- unexplained storage/gas terminology
- long multi-clause button text

## Design QA checklist

Before finalizing, check:

1. Is the primary CTA obvious in 3 seconds?
2. Are wallet/payment/access states clearly different?
3. Are loading, error, and empty states designed, not ignored?
4. Does the screen still feel like YouTick and not a generic admin panel?
5. Does the layout hold up on mobile?
6. If text changes, does it still work in TR and EN?

## Repo-specific do and don't

Do:

- preserve the cinematic dark look
- keep NEAR accent colors intentional
- use media and creator identity to sell the experience
- make complex flows feel guided, not hidden
- make each critical state visually distinct

Don't:

- switch to a flat white or generic SaaS look
- bury costs and access conditions
- let decorative effects hurt readability
- overuse purple when the system is meant to be multi-accent
- let hover-only affordances carry important meaning on mobile

## Useful references

- `../_shared/youtick-analysis.md`
- `apps/web/app/globals.css`
- `apps/web/lib/constants.ts`
- `apps/web/components/landing/HeroSection.tsx`
- `apps/web/components/VideoCard.tsx`
- `apps/web/components/UploadForm.tsx`
- `apps/web/components/TicketPurchaseCard.tsx`
- `apps/web/components/TrialOnboarding.tsx`
- `apps/web/app/watch/page.tsx`
