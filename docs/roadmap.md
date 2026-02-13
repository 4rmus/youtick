# Development Roadmap

> YouTick development milestones and future plans

---

## Completed (v1.0)

### Smart Contract
- [x] NEP-171/177/178 NFT ticket contract (Rust, NEAR SDK 5.5.0)
- [x] Event creation and management
- [x] Ticket purchase with 98/2 revenue split
- [x] Prepaid balance system (gas tank for session keys)
- [x] Gift drop system (access-key-based)
- [x] Trial account sponsorship (onboarding keys)
- [x] wNEAR integration (NEP-141 `ft_on_transfer`)
- [x] Content moderation (ban/unban with BanReason)
- [x] Purchase audit trail (on-chain logs)
- [x] Commission pool management
- [x] V8 storage keys (collision-safe)

### Frontend
- [x] Next.js 16 App Router architecture
- [x] NEAR Wallet Selector integration
- [x] Video upload with multi-step progress UI
- [x] Encrypted video playback (IpfsPlayer)
- [x] Ticket purchase card with cost breakdown
- [x] Gift link generation and claiming
- [x] Trial account onboarding flow
- [x] User profile with tickets and events
- [x] Video discovery page with pagination
- [x] Responsive design (mobile/tablet/desktop)
- [x] i18n support (English + Turkish)

### Infrastructure
- [x] Nova Protocol TEE encryption (AES-256-GCM)
- [x] IPFS storage via Crust Network
- [x] Multi-gateway IPFS failover (7+ gateways)
- [x] Multi-endpoint NEAR RPC failover
- [x] Session key management (24h expiry)
- [x] Client-side decentralization (zero server dependencies)

---

## In Progress (v1.1)

### Nova Integration Enhancements
- [ ] Nova auto-funding during ticket purchases
- [ ] Event-level Nova group indexing (efficient lookup)
- [ ] Pending access queue (retry failed Nova group additions)
- [ ] NovaAccessSync component (automatic membership sync)

### Encryption
- [ ] AES-CTR chunked encryption for large files (>100MB)

### Cross-Chain
- [ ] EVM cross-chain payment integration (Wagmi/Viem)

---

## Planned (v1.2)

### Developer Experience
- [ ] E2E testing suite with Playwright
- [ ] OpenAPI documentation for API routes
- [ ] Developer CLI for common operations
- [ ] Storybook for component documentation

### Performance
- [ ] State management migration (Zustand + React Query)
- [ ] Code splitting and lazy loading optimization
- [ ] Image/video thumbnail lazy loading
- [ ] Service worker for offline capability

### Features
- [ ] Advanced search and filtering on discover page
- [ ] Creator analytics dashboard (views, revenue, ticket sales)
- [ ] Video categories and tagging system
- [ ] Notification system for new content and purchases

---

## Future (v2.0)

### Authentication
- [ ] Fast Auth integration (email/social login with MPC)
- [ ] Web3Auth / Magic SDK support
- [ ] Multi-factor authentication for high-value operations

### Live Content
- [ ] Live streaming with token-gated access
- [ ] Real-time chat for live events
- [ ] Live tipping and donations

### Governance
- [ ] DAO governance for platform decisions
- [ ] Community-driven content curation
- [ ] Treasury management

### Marketplace
- [ ] Secondary NFT marketplace for ticket resale
- [ ] Creator royalties on secondary sales
- [ ] Bundle pricing and subscription models

### Mobile
- [ ] React Native mobile application
- [ ] Push notifications for events and purchases
- [ ] Offline playback for purchased content

### Ecosystem
- [ ] Multi-language support expansion
- [ ] Plugin system for third-party integrations
- [ ] API for external marketplace integration
- [ ] SDK for embedding YouTick players

---

## Technical Debt

| Priority | Item |
|----------|------|
| High | Migrate from Context API to Zustand for global state |
| High | Implement comprehensive E2E test suite |
| Medium | Add OpenAPI/Swagger for API routes |
| Medium | Contract storage optimization |
| Medium | Improve error handling and recovery across all flows |
| Low | Refactor landing page components into smaller modules |
| Low | Add Storybook for component development |

---

## Contributing

Want to help build the future of decentralized video? Check the [Contributing Guide](./contributing.md) for how to get started. Issues tagged `good-first-issue` are ideal for new contributors.

---

*Roadmap last updated: February 2026*
