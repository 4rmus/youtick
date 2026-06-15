# YouTick Acceptable Use Policy

> Version: 0.2 (draft — alpha)
> Effective: from public alpha launch.
> Current authority model: temporary owner-only takedown — governance topology is selected in Q3 2026, after which authority is handed over to a multisig/DAO (exact date depends on the topology decision).
> Technical reference: [`docs/adr/adr-009-emergency-takedown-and-dao-handover.md`](../adr/adr-009-emergency-takedown-and-dao-handover.md)
> Contact: abuse reports to **abuse@youtick.net** (fallback: GitHub Security Advisory).

This document describes what content is not acceptable on the YouTick
platform, how violations are handled, and the platform's transparency
commitments. It is a draft; the final text will go through legal review
before launch.

---

## 1. Unacceptable Content

The following categories may not be published on YouTick:

1. **Child sexual abuse material (CSAM)** — no exceptions.
2. **Non-consensual sexual content** — applied immediately on request
   from the victim or their representative.
3. **Sexual deepfakes produced without the depicted person's consent.**
4. **Material threatening imminent harm** — terrorist propaganda,
   suicide / self-harm encouragement, direct incitement to violence.
5. **Illegal drug, weapon or human-trafficking sales.**
6. **Copyright infringement** — when a valid takedown request is received.
7. **Malware or phishing material that directly harms the user.**

YouTick does not ban adult content outright; however, adult content must
be **consent-verifiable**, **not age-ambiguous**, and legal in the
applicable jurisdiction.

---

## 2. Enforcement Mechanism

### 2.1 Two-track takedown

The platform uses two distinct contract methods:

| Track | Function | Latency | Use case |
|---|---|---|---|
| Emergency | `takedown_event` | Immediate | §1.1, §1.2, §1.3, §1.4 — illegal content |
| Planned | `ban_event` | Reviewed owner action | §1.6 copyright, ToS violations |

Both are called by the contract owner. The emergency track is observable
on-chain through the `event_takedown` NEP-297 log, so abuse is publicly
detectable.

### 2.2 Operational obligations after takedown

Once the contract takedown is executed, operations:

1. Remove the encrypted CID pin from every active persistent storage
   provider.
2. For illegal content, the 5 KMS operators delete the corresponding
   key shares from their KV stores.
3. Purge or denylist any hot media-delivery cache that may still serve
   the content.
4. Add the entry to the monthly transparency report (anonymized CID,
   reason, date).

### 2.3 Report channel

Report violations to **abuse@youtick.net**. A report should include:

- Content link (event ID or URL)
- Violation category (§1)
- Reporter contact (anonymous reports are accepted for CSAM)

CSAM reports are additionally forwarded to the relevant legal authority
(e.g., NCMEC or equivalent).

---

## 3. Transparency Commitment

YouTick publishes a monthly transparency report. The report includes:

- Number of takedowns that month, by category.
- For each takedown: shortened `encrypted_cid`, category, date.
- Number of takedown requests that were rejected (and why).

The source of truth is the on-chain `event_takedown` NEP-297 log
stream. The monthly report is a human-readable summary of that stream.

---

## 4. Authority Handover

During alpha, takedown authority lives on a single owner key. This is
temporary. After governance topology is selected in Q3 2026, the
authority is handed over to a multisig or community DAO; the exact
date is conditional on topology selection and traction. After handover:

- A takedown requires majority approval.
- The emergency path (for cases such as CSAM) is preserved through a
  fast quorum mechanism.
- ADR-009 is updated.

---

## 5. Creator Obligations

A creator declares that the content they upload:

- belongs to them or has all required permissions,
- does not fall into any of the categories listed in §1,
- is legal in the applicable jurisdiction.

In case of a violation, the event is removed; repeated violations may
result in the creator account being banned.

---

## 6. Limitations

- Because encrypted bytes are distributed on IPFS, third-party gateways
  may still serve them after takedown until pins drop. The platform
  commits to removing its own pins; it cannot guarantee global IPFS
  unpinning.
- A contract takedown removes the entitlement; refund rules for ticket
  holders will be addressed in a separate policy document.

---

## 7. Changes

This policy is a draft. Legal review and a final EN release will be
added before the public alpha launch. Version changes are tracked at
the top of this file and in the repository commit history.
