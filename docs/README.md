# YouTick documentation

Everything documented here runs on NEAR testnet. There is no mainnet deployment
and no real-money launch: test USDC and test NEAR have no value.

The repository holds two lines of the product:

- **V2**, the current line: sign-in with Google or a passkey through NEAR Auth,
  tickets bound to a key derived in the browser, USDC held in escrow by the
  Market V2 contract, and Cloudflare Stream for upload, processing and
  playback. The card path is in source and disabled.
- **V1**, the earlier wallet-only testnet pilot on Livepeer Studio. It is
  closed and its code is frozen. See
  [V1 scope and open responsibilities](architecture/youtick-v1-product-scope.md).

In both lines NEAR is the authority for payment and access, the media provider
receives the video directly from the browser, the Bridge Worker is a control
plane, and D1 is a rebuildable read model.

- [Architecture](architecture/README.md)
- [Configuration](getting-started/configuration.md)
- [Contract methods](api/contract-methods.md)
- [Security](security.md)
- [Testing](testing.md)
- [V2 testnet runbook](v2-testnet-runbook.md)
- [V1 testnet pilot runbook](testnet-pilot-runbook.md)
- [Release](release-runbook.md)
- [Cloudflare release](cloudflare-release.md)
- [Contributing](contributing.md)
- [Acceptable use](legal/acceptable-use-policy.md)

Runtime gates are disabled by default in source. Local checks and CI do not
prove a deployment or an active production capability.
