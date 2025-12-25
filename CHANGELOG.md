# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - PKP Optimization

### Fixed
- **PKP authMethodId format** - Use `getBytesFromMultihash(cid)` instead of keccak256 (fixes #33)
- **PKP scopes** - Add scope 17 (GrantDecrypt) for decryption operations (fixes #34)
- **Auto-refund on upload** - Disabled to preserve MPC balance for Lighthouse auth (fixes #36)

### Added
- **PKP-first upload flow** - Try PKP session sigs before MPC fallback (fixes #35)
- **PKP minting wait** - Wait for PKP completion before showing player (fixes #37)
- `apps/web/lib/capacity.ts` - Capacity delegation utilities
- `apps/web/lib/near-auth-lit-action.ts` - Lit Action for NEAR auth
- `apps/web/scripts/` - Lit Action upload and CID computation scripts

### Changed
- `apps/web/lib/pkp.ts` - Updated mintPKPDirect with correct authMethodId format
- `apps/web/components/UploadForm.tsx` - PKP-first flow, disabled auto-refund
- `apps/web/components/TicketPurchaseCard.tsx` - Await PKP minting
- `apps/web/components/IpfsPlayer.tsx` - PKP session sigs integration
- `apps/web/lib/lit.ts` - Enhanced PKP session signature support
