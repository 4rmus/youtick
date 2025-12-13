# Resolved Issues - feature/optimize-upload-flow

## [FEAT-001] Optimize Video Upload Flow for Single Signature
**Status:** CLOSED
**Description:**
Reduce the number of wallet signatures required during video upload. The previous flow required separate signatures for storage fee payment, session keys, and minting.
**Resolution:**
- Validated that `batchUploadActions` now bundles Mint and Event Creation.
- Removed separate `payStorageFee` step.
- Moved storage fee payment to be implicitly covered by "Prepaid Gas" logic.

## [FEAT-002] Integrate Automatic Gas Management
**Status:** CLOSED
**Description:**
Remove the manual "Gas Tank" UI component and handle gas checks automatically.
**Resolution:**
- Removed `<GasTank />` component from `UploadForm.tsx`.
- Integrated `SessionManager.ensureGas()` into the upload start flow.
- Configured check to ensure minimum **1 NEAR** balance before starting upload.
- Implemented automatic "Top Up" transaction if balance is low.

## [FIX-003] Fix "Enum key (type) not found" Error
**Status:** CLOSED
**Description:**
Fix serialization error when sending transaction objects manually.
**Resolution:**
- Replaced manual transaction object construction in `UploadForm` (and subsequently removed it entirely) with `near-api-js` standard helpers.
- Standardized transaction construction across `session-manager.ts`.
