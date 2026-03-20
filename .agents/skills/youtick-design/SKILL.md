---
name: youtick-design
description: >
  Design playbook for YouTick. Use when shaping UI, UX, information hierarchy,
  state-rich screens, mobile polish, copy placement, visual direction,
  empty/loading/error states, or conversion-focused experience improvements
  inside the live product.
version: 1.3.0
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
  version: "1.3.0"
---

# youtick-design

Design guide for keeping YouTick distinct, trustworthy, and easy to act on.

## Do not use this skill when

- the task is mainly campaign copy or positioning
- the task is mainly product strategy, prioritization, or KPI design
- the task is mainly code logic, testing, or backend behavior

## First read

Open these first:

- `../_shared/youtick-analysis.md`
- `../_shared/references/live-code-map.md`
- `../_shared/references/logic-guardrails.md`

Then inspect the route or component you are changing.

## Core design stance

YouTick should feel:

- premium
- cinematic
- creator-led
- slightly rebellious
- technically trustworthy

The product is not a generic dashboard.
It needs emotional energy on landing pages and calm clarity inside action-heavy flows.

## Two modes you should preserve

### Landing mode

Use for:

- hero storytelling
- creator positioning
- proof and momentum

Traits:

- larger type
- stronger imagery
- sharper contrast
- more visual drama

### Product mode

Use for:

- upload
- buy
- claim
- watch
- profile

Traits:

- denser layout
- clearer status changes
- more trust signals
- less decorative noise

Do not flatten both modes into the same safe UI.

## What design must optimize for

### 1. Fast next-step clarity

The user should quickly know whether the next move is:

- upload
- connect wallet
- buy
- claim
- create account
- watch

### 2. Trust around money and access

The product asks people to trust:

- wallets
- payments
- access checks
- encrypted playback

Design should answer with:

- plain labels
- visible state changes
- calm cost language
- obvious success handoff

### 3. Content desirability

This is still a media product.
Do not let chain mechanics dominate:

- title
- thumbnail
- creator identity
- value of the content itself

### 4. State-rich UX

The important screens are not static.
Design for state changes such as:

- disconnected vs connected
- trial vs normal wallet
- locked vs owned
- uploading vs waiting vs failed
- valid claim vs invalid claim
- purchase pending vs playable

## Route guidance

### Landing and discover

Priorities:

- strong first impression
- believable creator upside
- browseable premium content
- quick path into upload or watch

### Upload

Priorities:

- visible progress steps
- cost clarity
- calm handling of long waits
- confidence that the system is doing real work

### Watch and purchase

Priorities:

- obvious locked vs owned state
- price and access clarity
- instant reward after purchase or claim
- playback confidence over visual noise

### Claim and trial

Priorities:

- low fear
- low decision load
- friendly language
- strong success transition into the app

### Profile

Priorities:

- ownership feeling tangible
- creator actions easy to find
- trial upgrade path visible but not pushy

## Visual system guidance

Keep these patterns:

- dark surfaces
- NEAR green as the strongest action color
- purple and blue as support accents
- media-led cards and premium contrast

Avoid:

- flat white SaaS styling
- purple-only gradients everywhere
- hover-only meaning on mobile
- heavy effects around payment or claim actions

## UX writing guidance

Prefer short, concrete labels:

- Create account
- Claim gift
- Start watching
- Upload your work

Avoid leading with technical words like:

- KMS
- gas
- session key
- storage deposit

These can appear later when needed, not as the first label the user sees.

## QA checklist

Before finishing, ask:

1. Is the main CTA obvious in a few seconds?
2. Are locked, owned, loading, and error states clearly different?
3. Does the screen still feel like YouTick?
4. Is the mobile experience still legible and tappable?
5. If copy changed, does it still work in both EN and TR?

## When to pair this skill with another

- Use `youtick-marketing` when a landing or campaign message changes.
- Use `youtick-product-mgmt` when the screen change affects funnel goals.
- Use `youtick-engineering` when the UI change depends on state or logic shifts.

## Useful references

- `../_shared/youtick-analysis.md`
- `../_shared/references/live-code-map.md`
- `../_shared/references/logic-guardrails.md`
