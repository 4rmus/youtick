# YouTick Onboarding Key Security & Ecosystem Alignment Review

**Date:** 2026-04-23  
**Reviewer:** Codex  
**Scope:** Onboarding key flow, contract enforcement, frontend key handling, alignment with current official NEAR docs

**Sources checked on 2026-04-23**
- Local code in this repository
- Official NEAR docs
- Official `near-api-js` README
- Official NEP-366 text
- Nomicon / runtime specification pages linked from NEAR docs

---

## Executive Summary

This review re-checks YouTick's onboarding key design against the current codebase and current official NEAR documentation.

### Bottom line

YouTick's onboarding flow is **not NEP-366 meta-transactions** and **not a NEP-452 linkdrop implementation**, but it is also **not outside the NEAR model**. It is best described as a **custom onboarding flow built from an official NEAR pattern**:

- a contract adds restricted Function Call Access Keys to itself
- the private key is distributed to the user
- the user uses that key to call a narrow set of contract methods

That general pattern is documented by NEAR in:

- Access Keys
- Benefits of Function-Call Keys
- Near Drop
- Linkdrop / NEP-452 docs

So the earlier claim that this pattern is "not found in official documentation" was too strong.

### Main judgment

The biggest problem is **not protocol compliance**.  
The biggest problem is **operational security**:

- the onboarding key can be fetched by anyone from `/api/onboarding-key`
- the key is stored in `localStorage`
- the same shared key can be abused until rotated or removed

### Important correction

The earlier draft treated **NEP-366 allowance bypass** as a direct exploit against this contract. That conclusion does **not** hold for the current implementation.

NEAR docs do say that a Function Call Key's **allowance** can be bypassed through meta-transactions. But this contract authorizes onboarding calls with `env::signer_account_pk()`. In NEP-366 and the runtime spec, the relayer remains the signer for the final receipt, while the delegated sender becomes the predecessor. That means the current contract's signer-key check blocks this path.

So:

- **protocol fact:** FCAK allowance is not a hard boundary under meta-transactions
- **contract-specific fact:** this contract's current signer-key check means that fact does not become the direct bypass described in the earlier draft

---

## Review Outcome

| Area | Result | Notes |
|------|--------|-------|
| Code description accuracy | Mostly correct | Contract and frontend flow were described largely correctly |
| NEAR ecosystem alignment | Partly correct | The previous draft overstated how "non-standard" this pattern is |
| Security findings | Mostly correct | Public key distribution and browser storage remain real issues |
| Meta-transaction analysis | Needs correction | Allowance bypass is real at protocol level, but not a current exploit here |
| FastAuth guidance | Needs correction | Official docs say current FastAuth is deprecated and the replacement is still in progress |
| near-api-js guidance | Needs correction | Browser usage is supported, though wallet login should use wallet connectors |

---

## 1. What The Current Code Actually Does

### 1.1 Contract-side onboarding key

The contract stores onboarding public keys in a set and adds them to the contract account as restricted Function Call Access Keys:

- owner-only add: [lib.rs](/Users/arair/works/youtick/contracts/nft-ticket/src/lib.rs:1098)
- owner-only remove: [lib.rs](/Users/arair/works/youtick/contracts/nft-ticket/src/lib.rs:1121)
- allowed methods:
  - `create_sponsored_trial_direct`
  - `claim_free_ticket_direct`
  - `sponsor_implicit_guest_direct`

The key allowance is capped at `10 NEAR` and the method list is restricted: [lib.rs](/Users/arair/works/youtick/contracts/nft-ticket/src/lib.rs:1110)

### 1.2 On-chain abuse checks

The direct onboarding methods check:

- onboarding enabled flag
- signer public key exists in `onboarding_keys`
- daily limit

Examples:

- sponsored trial: [lib.rs](/Users/arair/works/youtick/contracts/nft-ticket/src/lib.rs:2312)
- free ticket: [lib.rs](/Users/arair/works/youtick/contracts/nft-ticket/src/lib.rs:2387)
- free access without NFT: [lib.rs](/Users/arair/works/youtick/contracts/nft-ticket/src/lib.rs:2474)
- implicit guest funding: [lib.rs](/Users/arair/works/youtick/contracts/nft-ticket/src/lib.rs:2719)

Default onboarding config is:

- `daily_limit = 100`
- `enabled = true`

See: [lib.rs](/Users/arair/works/youtick/contracts/nft-ticket/src/lib.rs:236)

### 1.3 Daily limit model

Daily limit is global per contract, not per key:

- increment logic: [lib.rs](/Users/arair/works/youtick/contracts/nft-ticket/src/lib.rs:1300)
- rollback helper: [lib.rs](/Users/arair/works/youtick/contracts/nft-ticket/src/lib.rs:1317)

This means one abused key can consume the whole day's quota.

### 1.4 Frontend distribution and usage

The key is served by a public API route:

- endpoint: [route.ts](/Users/arair/works/youtick/apps/web/app/api/onboarding-key/route.ts:15)

The key is then stored in browser `localStorage`:

- bootstrap: [OnboardingKeyInit.tsx](/Users/arair/works/youtick/apps/web/components/OnboardingKeyInit.tsx:12)

The client later uses that key to sign transactions directly with `near-api-js`:

- main direct flow: [gift-service.ts](/Users/arair/works/youtick/apps/web/lib/gift-service.ts:161)

### 1.5 Relayer status in this repo

The active code path is the direct onboarding key path.

The old relayer trial route is deprecated and returns `410 Gone`:

- [trial route](/Users/arair/works/youtick/apps/web/app/api/trial/sponsored/route.ts:5)

There is also a small documentation drift inside the repo:

- `apps/web/README.md` still says server-side relayer is the primary path: [apps/web/README.md](/Users/arair/works/youtick/apps/web/README.md:49)
- the actual code says relayer trial creation is removed

---

## 2. What Official NEAR Docs Say

### 2.1 Function Call Keys are an official sharing pattern

Official NEAR docs say:

- Function Call Keys are meant to be shared with applications
- they are limited to a contract and optional method list
- they cannot attach NEAR deposit

Sources:

- [Access Keys](https://docs.near.org/protocol/accounts-contracts/access-keys)
- [API Libraries](https://docs.near.org/tools/near-api)

This matters because it changes the framing:

- sharing a restricted Function Call Key is an official NEAR capability
- but exposing one shared reusable key to the public internet is still a security risk for the app that pays for the actions

So "official NEAR feature" does **not** mean "safe to publish with no abuse controls".

### 2.2 Near Drop and Linkdrop show the same family of pattern

Official NEAR docs include examples where:

- a contract adds a Function Call Key to itself
- the private key is passed to a user
- the user uses that key to claim assets or create an account

Sources:

- [Near Drop](https://docs.near.org/smart-contracts/tutorials/advanced/near-drop)
- [Linkdrop Standard / NEP-452](https://docs.near.org/primitives/linkdrop/standard)

This means YouTick's flow is **closer to an official linkdrop-style pattern** than the earlier draft acknowledged.

At the same time, YouTick is still **custom**, because:

- it does not implement the NEP-452 interface
- it ties the key to YouTick-specific onboarding methods and trial-pool logic

So the accurate description is:

> "custom implementation built on an official NEAR Function Call Key / linkdrop-style pattern"

Not:

> "pattern not found in official NEAR documentation"

### 2.3 near-api-js browser use is allowed, but wallet login should use wallet tooling

The current official `near-api-js` README says:

- the library works in browser and Node.js
- it is ideal for backend services, CLIs, and scripts
- for frontend wallet login, developers should use the official web login docs

Sources:

- [near-api-js README](https://raw.githubusercontent.com/near/near-api-js/master/README.md)
- [API Libraries](https://docs.near.org/tools/near-api)

So the earlier draft was too harsh when it implied browser use is against the intended use.

More accurate wording:

- **supported:** browser usage with `near-api-js`
- **recommended for wallet login:** wallet connector / wallet selector flows
- **risky in this app:** storing a shared onboarding secret in browser storage

The risk here comes from **how the key is handled**, not from `near-api-js` itself.

### 2.4 FastAuth is not a ready replacement today

Official FastAuth docs currently say:

- the current FastAuth version is deprecated
- a new version using MPC and Auth0 is in the works

The official relayer guide also describes FastAuth as closed/private beta in that integration path.

Sources:

- [FastAuth SDK](https://docs.near.org/chain-abstraction/fastauth-sdk)
- [Meta-Transaction Relayer Guide](https://docs.near.org/web3-apps/tutorials/meta-transactions)

So the earlier draft overstated FastAuth readiness.

Accurate conclusion for 2026-04-23:

- FastAuth is worth watching
- FastAuth is **not** a stable near-term replacement to recommend as the primary fix in this report

### 2.5 Meta-transactions are the official gasless standard, but that does not make them the only valid pattern

NEP-366 is final, and meta-transactions are clearly an official gasless pattern on NEAR.

Sources:

- [NEP-366](https://raw.githubusercontent.com/near/NEPs/master/neps/nep-0366.md)
- [Meta Transactions](https://docs.near.org/protocol/transactions/meta-tx)

But official docs do not say that all other onboarding patterns are invalid.

The right conclusion is:

- NEP-366 is the official standard for relayer-based gas sponsorship
- YouTick is using a different official building block: shared Function Call Keys
- the choice is not "valid vs invalid"
- the choice is "shared key simplicity vs relayer/user-key security model"

---

## 3. Corrected Security Analysis

### 3.1 Real risks that remain valid

These findings remain valid after re-check:

#### A. Public endpoint abuse

`/api/onboarding-key` returns the secret key to any caller:

- no auth
- no rate limit
- no CAPTCHA / Turnstile
- no session check

See: [route.ts](/Users/arair/works/youtick/apps/web/app/api/onboarding-key/route.ts:15)

Impact:

- attacker can fetch the key
- attacker can call allowed onboarding methods
- attacker can consume daily quota
- attacker can spend the trial pool through allowed sponsored flows

#### B. Browser storage risk

The key is stored in `localStorage`:

- [OnboardingKeyInit.tsx](/Users/arair/works/youtick/apps/web/components/OnboardingKeyInit.tsx:12)
- [gift-service.ts](/Users/arair/works/youtick/apps/web/lib/gift-service.ts:57)

Impact:

- XSS can steal it
- browser extensions can read it
- the key survives across sessions until removed

#### C. Single shared key / no rotation model

The current flow behaves like a shared secret with limited permissions.

Current weaknesses:

- no automatic expiry
- no automatic rotation
- no active set of multiple keys
- no per-key budget tracking

#### D. Global limit, not fair-share limit

The contract enforces one contract-wide daily count:

- [lib.rs](/Users/arair/works/youtick/contracts/nft-ticket/src/lib.rs:1300)

This is useful as a coarse brake, but it does not protect normal users from a single abuser exhausting the quota early.

### 3.2 Corrected meta-transaction finding

#### What is true at protocol level

Official NEAR docs and the Nomicon say that for meta-transactions:

- Function Call Key permission checks still apply
- allowance is not checked, because the relayer pays gas

Sources:

- [Meta Transactions](https://docs.near.org/protocol/transactions/meta-tx)
- [Nomicon: Meta Transactions](https://nomicon.io/architecture/how/meta-tx.html)

#### What the earlier draft got wrong

The earlier draft treated that as a direct exploit against this contract.

But the runtime spec for delegate actions says the inner actions run with:

- delegated sender as `predecessor`
- relayer as `signer`

Sources:

- [NEP-366](https://raw.githubusercontent.com/near/NEPs/master/neps/nep-0366.md)
- [Nomicon: Actions / DelegateAction](https://nomicon.io/RuntimeSpec/Actions.html?highlight=actions)

This contract authorizes onboarding by checking:

- `env::signer_account_pk()`

See:

- [lib.rs](/Users/arair/works/youtick/contracts/nft-ticket/src/lib.rs:2325)
- [lib.rs](/Users/arair/works/youtick/contracts/nft-ticket/src/lib.rs:2400)
- [lib.rs](/Users/arair/works/youtick/contracts/nft-ticket/src/lib.rs:2481)
- [lib.rs](/Users/arair/works/youtick/contracts/nft-ticket/src/lib.rs:2726)

That means the relayer's signing key would be seen as the signer public key, not the onboarding key.

#### Correct conclusion

For this codebase today:

- **allowance bypass is real in general**
- **direct bypass of YouTick's signer-key gate is not supported by the official runtime behavior**

So this item should be downgraded from "critical finding" to:

> "important protocol nuance, but not an active exploit in the current signer-key-based implementation"

### 3.3 Governance centralization is real, but timelock scope was overstated

The contract has a 24-hour timelock:

- `TIMELOCK_DELAY_NS`: [lib.rs](/Users/arair/works/youtick/contracts/nft-ticket/src/lib.rs:27)

But the timelock only covers a subset of admin actions:

- `WithdrawTrialPool`
- `WithdrawCommission`
- `AdminRemoveEvents`
- `BanEvent`
- `UnbanEvent`
- `SetNextTokenId`

See: [lib.rs](/Users/arair/works/youtick/contracts/nft-ticket/src/lib.rs:30)

Important nuance:

- onboarding key add/remove is **not** timelocked
- onboarding config update is **not** timelocked
- pause/unpause is **not** timelocked

So the centralization concern is actually a bit sharper than the earlier draft suggested for onboarding control.

---

## 4. Alignment Verdict

### 4.1 Is the current approach compatible with official NEAR docs?

**Yes, partially.**

It is compatible with NEAR's access-key and linkdrop-style model.

It is **not** aligned with:

- NEP-366 relayer model
- NEP-452 linkdrop standard interface

So the correct label is:

> "valid NEAR-native pattern, but custom and non-standardized at the interface level"

### 4.2 Is the current approach secure enough as implemented?

**Not really.**

The weak point is not the contract-side method restriction by itself.  
The weak point is public distribution and weak client storage of the shared key.

### 4.3 Is the current approach decentralized?

**Only partially.**

Positive:

- calls are signed on-chain with a restricted key
- no relayer is needed for the active direct path

Negative:

- the platform controls key issuance
- the platform controls key removal
- the platform controls onboarding enable/disable
- the platform endpoint is still the main bootstrap source for the shared key

### 4.4 Is FastAuth or NEP-366 an immediate replacement?

**No immediate drop-in replacement is confirmed by current official docs.**

- NEP-366 is mature and official, but it changes the architecture and trust model
- FastAuth is not in a stable official state to be treated as the near-term default recommendation on 2026-04-23

---

## 5. Corrected Recommendations

## 5.1 Immediate

### 1. Protect `/api/onboarding-key`

Add:

- per-IP rate limit
- per-session or per-challenge limit
- Turnstile or similar challenge
- basic request logging and alerting

Why:

- this is the highest-value fix with the smallest architecture change

### 2. Reduce browser persistence

Move the onboarding key away from long-lived `localStorage` if possible.

Preferred order:

1. in-memory only
2. `sessionStorage` with short TTL
3. `localStorage` only as last resort

Important note:

- encryption inside browser storage does **not** solve XSS by itself
- if page JavaScript can read the key, injected JavaScript usually can too

### 3. Support more than one active onboarding key

Add:

- active key pool
- rotation
- quick revoke
- per-key monitoring

Why:

- reduces single-key outage risk
- makes rotation operationally realistic

### 4. Fix internal documentation drift

Bring repo docs in line with actual behavior:

- relayer path status
- onboarding endpoint protection status
- real storage model of the onboarding key

Why:

- current docs and code are not fully saying the same thing

## 5.2 Short-term

### 5. Add fairness controls outside the contract

Track:

- per-IP
- per-session
- per-device or challenge token

Why:

- the contract only has a global daily limit
- fairness is better handled before the key is handed out

### 6. Add monitoring for key health and trial-pool burn

Watch:

- key validity
- key allowance
- trial pool balance
- daily count spikes

Why:

- this is a shared operational credential
- silent abuse is the main real-world failure mode

### 7. Move onboarding admin actions behind stronger governance

At minimum:

- multisig for owner account

Better:

- multisig plus optional timelock for onboarding config changes

Why:

- today the owner can rotate, disable, or remove onboarding keys immediately

## 5.3 Medium-term

### 8. Decide between two deliberate models

#### Model A: keep the shared-key design

If you keep it:

- harden endpoint distribution
- shorten key lifetime
- rotate often
- treat it like a sensitive operational secret

#### Model B: migrate to relayer/meta-transaction design

If you move to NEP-366:

- user signs with their own key
- relayer pays gas
- shared browser secret goes away

This is cleaner from a security model perspective, but it adds relayer operations and a different failure surface.

### 9. Treat FastAuth as watchlist, not plan-of-record

Based on current official docs, FastAuth should be tracked as an ecosystem option, not the primary recommendation in this report.

---

## 6. Final Conclusion

The corrected conclusion is:

1. YouTick's onboarding key flow is **custom but NEAR-native**, not "undocumented".
2. The code-side security concerns around public key distribution and browser storage are **real and important**.
3. The earlier draft's **meta-transaction bypass finding should be corrected** for this specific contract.
4. The earlier draft's **FastAuth readiness claim should be softened**.
5. The best near-term path is **hardening the current shared-key flow first**, then deciding whether a relayer/user-key architecture is worth the extra complexity.

In plain terms:

This design is not wrong because it uses Function Call Keys.  
It is risky because it uses **one shared Function Call Key with weak distribution controls**.

---

## Appendix A — Key Code References

| Component | File | Lines |
|-----------|------|-------|
| Add onboarding key | `contracts/nft-ticket/src/lib.rs` | 1098-1118 |
| Remove onboarding key | `contracts/nft-ticket/src/lib.rs` | 1121-1130 |
| Onboarding config | `contracts/nft-ticket/src/lib.rs` | 1134-1143 |
| Default onboarding config | `contracts/nft-ticket/src/lib.rs` | 236-247 |
| Daily limit increment | `contracts/nft-ticket/src/lib.rs` | 1300-1313 |
| Daily limit rollback | `contracts/nft-ticket/src/lib.rs` | 1317-1329 |
| Direct sponsored trial | `contracts/nft-ticket/src/lib.rs` | 2312-2378 |
| Direct free ticket | `contracts/nft-ticket/src/lib.rs` | 2387-2443 |
| Direct free access | `contracts/nft-ticket/src/lib.rs` | 2474-2519 |
| Direct implicit guest | `contracts/nft-ticket/src/lib.rs` | 2719-2755 |
| Timelock action scope | `contracts/nft-ticket/src/lib.rs` | 27-37 |
| Onboarding key API | `apps/web/app/api/onboarding-key/route.ts` | 15-39 |
| Browser bootstrap | `apps/web/components/OnboardingKeyInit.tsx` | 12-44 |
| Direct client signing | `apps/web/lib/gift-service.ts` | 161-227 |
| Relayer deprecation route | `apps/web/app/api/trial/sponsored/route.ts` | 5-23 |

---

## Appendix B — Official External References

- [NEAR Access Keys](https://docs.near.org/protocol/accounts-contracts/access-keys)
- [NEAR API Libraries](https://docs.near.org/tools/near-api)
- [near-api-js README](https://raw.githubusercontent.com/near/near-api-js/master/README.md)
- [Near Drop](https://docs.near.org/smart-contracts/tutorials/advanced/near-drop)
- [Linkdrop Standard / NEP-452 docs](https://docs.near.org/primitives/linkdrop/standard)
- [Implicit Accounts](https://docs.near.org/integrations/implicit-accounts)
- [Smart Contract Environment](https://docs.near.org/smart-contracts/anatomy/environment)
- [Meta Transactions](https://docs.near.org/protocol/transactions/meta-tx)
- [Meta Transaction Relayer Guide](https://docs.near.org/web3-apps/tutorials/meta-transactions)
- [NEP-366 raw text](https://raw.githubusercontent.com/near/NEPs/master/neps/nep-0366.md)
- [Nomicon: Meta Transactions](https://nomicon.io/architecture/how/meta-tx.html)
- [Nomicon: DelegateAction runtime behavior](https://nomicon.io/RuntimeSpec/Actions.html?highlight=actions)
