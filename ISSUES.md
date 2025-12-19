# Open Issues for feature/pkp-mpc-integration

## Issue #1: Implement PKP-MPC Integration for Signless Experience
- [x] Integrate Lit Protocol SDK v7.
- [x] Implement Programmable Key Pair (PKP) minting.
- [x] Add session signature support using PKPs.
- [x] Enable decryption and signing without manual user confirms after initial setup.

## Issue #2: Sponsored Onboarding via Gas Relayer
- [x] Create `/api/relayer/mint` endpoint to sponsor PKP production.
- [x] Implement backend LIT token management.
- [x] Fix environment conflicts between Ethers v5 and Next.js/Turbopack fetch.
- [x] Add automated PKP linking during first upload.

## Issue #3: UI/UX Flow Optimizations
- [x] Bundle session key setup with ticket purchases (2 signs -> 1 sign).
- [x] Redesign upload progress UI to be more intuitive and professional.
- [x] Implement "Manual PKP Production" for developers/testing.

## Issue #4: Protocol & Chain Compatibility Fixes
- [x] Align with Lit Datil-Test (Chain ID 175188).
- [x] Resolve `getBytes32FromMultihash` import issues in server environment.
- [x] Fix parameter list mismatches in PKPHelper contract calls.

## Issue #5: Smart Contract Modernization
- [x] Refactor NEAR contract using `#[near]` macros for better stability.
- [x] Implement `buy_ticket_prepaid` logic (conceptual integration).
- [x] Synchronize contract storage with new deployment methods.
