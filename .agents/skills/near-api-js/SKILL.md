---
name: near-api-js
description: "Use for near-api-js v7 TypeScript/JavaScript RPC, transaction encoding, signatures, relayers and FT/NFT calls. Not a generic trigger for Rust-only or media-only tasks."
---

# near-api-js — YouTick

Read root `AGENTS.md` first. Check `apps/web/package.json`, its lockfile and the installed exports/types before using an example; a v7 label alone does not establish compatibility with another SDK.

Trace the caller, encoded bytes, signer output and consuming provider. Keep login, NEP-413 message proof, transaction signature and finalized receipts distinct. Use existing `apps/web/lib/near.ts` and wallet adapters before adding helpers. For wallet connection and session UI use [near-dapp](../near-dapp/SKILL.md).

Read only the reference relevant to the change:

- [Account, RPC and transaction APIs](references/api_patterns.md)
- [Contract APIs](references/contracts.md)
- [FT/NFT units and storage](references/tokens_guide.md)
- [Signer and access-key types](references/key_management.md)
- [Meta-transactions and relayers](references/meta_transactions.md)
- [NEP-413](references/nep413.md)

Upstream examples are API illustrations, not permission to read real keys, send transactions or change network. Preserve integer precision and current network configuration. Do not copy a zero-filled example nonce into authentication; validate replay/domain/account binding against the actual protocol. Reconcile an ambiguous broadcast before considering another submission.

Choose focused Web/Bridge checks from `docs/testing.md`; use synthetic keys and inputs for local checks. Verify new API assumptions against the installed version and official documentation. Report missing compatibility evidence rather than upgrading dependencies to fit an example.

[Original upstream guide](UPSTREAM.md) is retained for provenance and optional examples; use this scoped entrypoint for YouTick. Source and update policy: [sources](../SOURCES.md).
