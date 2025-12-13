# Smart Contract Update Queue

To avoid frequent redeployments and account recreation (due to state issues), we are batching contract changes here.

## [PENDING] Feature: Refund Unused Gas
**Priority:** Medium
**Context:**
The current `nft_mint_prepaid` flow uses an internal balance ("Prepaid Gas"). Users deposit funds, and the contract deducts fees. However, there is no way for the user to retrieve unused funds after a transaction series.
**Requirement:**
Implement a `withdraw_funds(amount: U128)` or `withdraw_all()` method.
- **Access Control:** Only the account owner (msg.sender) can withdraw their own balance.
- **Logic:** Check balance > 0, Promise to transfer NEAR to signer, decrease internal balance.

---
*Add future contract requirements here.*
