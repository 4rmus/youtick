---
name: youtick-product-mgmt
description: >
  Product management playbook for YouTick. Use when writing PRDs, roadmaps,
  prioritization notes, experiment plans, analytics and KPI frameworks,
  launch-readiness checks, rollout plans, or strategy work grounded in the live
  product and repo.
version: 1.3.0
license: MIT
platforms:
  - claude
  - gemini
  - openai
  - markdown
tags:
  - youtick
  - product-management
  - roadmap
  - metrics
  - experimentation
  - strategy
metadata:
  author: youtick
  version: "1.3.0"
---

# youtick-product-mgmt

Product guide for making grounded decisions in the live YouTick product.

## Do not use this skill when

- the task is mainly implementation or debugging
- the task is mainly screen design or interaction polish
- the task is mainly public copywriting or campaign messaging

## First read

Open these first:

- `../_shared/youtick-analysis.md`
- `../_shared/references/live-code-map.md`
- `../_shared/references/logic-guardrails.md`

Then inspect the journey you are planning around.

## Product thesis

YouTick wins when it helps creators sell premium video directly to fans with:

- stronger creator economics
- believable access protection
- low enough onboarding friction that people actually reach playback

If an idea sounds advanced but hurts activation, conversion, or watch success, it is probably the wrong priority.

## Primary user groups

### Creators

Need to:

- upload content
- price it
- sell directly
- keep more revenue
- gift access for growth

### Viewers and fans

Need to:

- discover something worth watching
- understand access quickly
- pay or claim with low friction
- watch without confusion

### Trial users

Need to:

- start without heavy setup
- feel value quickly
- upgrade later if the experience works

## Core decision rule

The best practical north-star is:

- successful content unlocks that reach playable video

This is stronger than:

- wallet connects
- raw ticket mints
- page visits

It ties together browse, purchase or claim, and actual playback.

## Priority buckets

### 1. Activation

Work that gets people to first playable content faster.

Examples:

- simpler claim path
- clearer trial onboarding
- better purchase clarity

### 2. Monetization

Work that helps creators earn more or improves ticket conversion.

Examples:

- cleaner pricing presentation
- stronger creator and event presentation
- smoother publish flow

### 3. Retention

Work that brings people back.

Examples:

- stronger library and profile UX
- gifting loops
- better creator follow-up workflow

### 4. Trust and reliability

Work that makes the promise believable.

Examples:

- playback reliability
- upload resilience
- failure recovery
- worker and contract hardening

### 5. Expansion

Only after the core loop is healthy.

Examples:

- richer creator tooling
- bigger community features
- broader payment paths

## Product realities to keep visible

- trial health depends on onboarding key, pool balance, and daily limit
- KMS and worker behavior are product dependencies, not hidden infra details
- cross-chain checkout is interesting but still secondary to the main NEAR path
- old names in docs or code do not always reflect the live journey

## Metrics guidance

Useful creator metrics:

- upload start to publish completion
- active creators
- revenue per active creator
- gift links created

Useful viewer metrics:

- discover to watch-detail click-through
- ticket detail to purchase or claim conversion
- purchase or claim to playback success
- repeat view or repeat purchase

Useful operational metrics:

- playback failure rate
- KMS retrieval success
- trial pool health
- daily trial utilization

If the product cannot measure the idea well, ask for instrumentation before pretending it is a clean experiment.

## Good PRD structure for YouTick

Include:

1. user group
2. current journey
3. pain point in plain language
4. proposed change
5. why it matters to revenue, conversion, or playback success
6. metrics to watch
7. rollout and rollback notes
8. contract or worker dependency if any

## Release checklist

Before calling something launch-ready, confirm:

1. which journey changed
2. whether contract behavior changed
3. whether worker or KMS behavior changed
4. whether analytics coverage exists
5. whether EN and TR copy both still work
6. what the rollback path is

## When to pair this skill with another

- Use `youtick-engineering` for feasibility and implementation reality.
- Use `youtick-design` for journey clarity and state handling.
- Use `youtick-marketing` when positioning or launch messaging is part of the work.

## Useful references

- `../_shared/youtick-analysis.md`
- `../_shared/references/live-code-map.md`
- `../_shared/references/logic-guardrails.md`
