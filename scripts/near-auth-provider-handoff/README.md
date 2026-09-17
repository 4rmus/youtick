# NEAR Auth provider prompt-size handoff

This is a local synthetic reproduction and a proposed provider patch, not a
deployed fix. It contains no user token, private key, real signing request or
video. The application dependencies and signing protocol are unchanged.

## Source and patch

The fixture is an unchanged copy of Peersyst/fast-auth's
[`packages/auth0/src/actions/authorize-app.action.js`](https://github.com/Peersyst/fast-auth/blob/38dc894afbc94c198c207f52e6d01d695199eaa1/packages/auth0/src/actions/authorize-app.action.js)
at commit `38dc894afbc94c198c207f52e6d01d695199eaa1`.
The canonical patch is
[`docs/architecture/near-auth-prompt-size.patch`](../../docs/architecture/near-auth-prompt-size.patch).
It removes only the JSON indentation argument in `stringifyActions`.

| SHA-256 | Value |
| --- | --- |
| Original Action | `9476e322b93d1c0059bd27453295256b16476d7ce51ce362570b81cb476b631b` |
| Patch | `aa5d5b095a6683ce402643599f2a66f2d005220053a918cd3cf56ad8eec81a78` |
| Patched Action | `a94580a12cedb347a7ea64e0cde4eb6a3da97b56f4967ce17f1812fd38ddb289` |

The test verifies all three hashes and uses `git apply --check` followed by
`git apply` in an owned temporary directory. It executes the resulting Action,
not an independently recreated replacement. The temporary directory is removed
after the test; the fixture and application files are never patched by the test.

## Reproduce from a clean checkout or extracted handoff

Requirements: Node.js 24, npm and Git. Keep the `scripts/` and `docs/` directory
layout when extracting or copying the handoff. From that root directory:

```sh
npm ci --prefix scripts/near-auth-provider-handoff --ignore-scripts --no-audit --no-fund
npm test --prefix scripts/near-auth-provider-handoff
```

Only this isolated test package is installed. Its included lockfile pins the
transitive tree; direct versions are `near-api-js@7.3.0` (application encoder),
`@near-js/transactions@2.5.1` and `borsh@1.0.0` (Action decoders).
No old Browser SDK, legacy near-api-js installation, app `node_modules`, `tmp/`
workspace or test framework is needed. Dependency installation uses the package
registry; the tests themselves make no network requests, signatures or payments.

Expected result: **10 passing tests**. Each upload case prints UTF-8 title size,
encoded payload size and before/after prompt size. The test fails unless:

- the representative original delegate exceeds 24,576 bytes and the patched
  Action fits the simulated boundary;
- ordinary transactions and delegates fit after the patch for representative,
  200-byte ASCII, 200-byte Turkish and 200-byte escaped titles;
- all decoded display fields, branding, removed scopes and exact `fatxn`
  signing bytes are preserved;
- a transfer of `1000000000000000000000001` retains every decimal digit;
- explicit user denial and incorrect signing-audience requests remain denied.

[Auth0 documents a 24 KB `fields` limit](https://auth0.com/docs/customize/forms/render).
The reproduction conservatively measures the complete serialized prompt options
in UTF-8. It simulates the boundary rather than calling Auth0. Fixtures use fixed
timestamps and a placeholder quote signature; they are display tests, not live
quotes or evidence of application payment acceptance. The current fixture
recomputes the quote ID from its canonical fields, so its exact measurements can
differ slightly from the earlier temporary reproduction with a placeholder ID.

Expected measurements with this fixture (bytes):

| Title | Delegate before / after | Transaction before / after |
| --- | ---: | ---: |
| Representative | 27,052 / 7,055 | 27,023 / 7,026 |
| 200-byte ASCII | 29,358 / 7,571 | 29,329 / 7,542 |
| 200-byte Turkish | 29,564 / 7,777 | 29,535 / 7,748 |
| 200-byte escaped | 36,289 / 9,222 | 36,260 / 9,193 |

## Package for the provider

From the same root, include exactly these files, preserving their paths:

```sh
tar -czf near-auth-provider-handoff.tar.gz \
  scripts/near-auth-provider-handoff/README.md \
  scripts/near-auth-provider-handoff/package.json \
  scripts/near-auth-provider-handoff/package-lock.json \
  scripts/near-auth-provider-handoff/prompt-size.test.mjs \
  scripts/near-auth-provider-handoff/upstream/authorize-app.action.cjs \
  docs/architecture/near-auth-prompt-size.patch
```

This package is ready for review, not permission to contact or modify the
provider. Ownership of `login.testnet.fast-auth.com` is not established here.
The provider administrator must first compare the deployed Action with the
pinned source. If it differs, review the equivalent one-line change against
that source; do not force-apply the patch or assume this fixture proves it.

Acceptance from the provider requires the reviewed source/deployed Action
revision, deployment time and approval-form verification. The form values and
signing bytes must remain unchanged. Application live acceptance additionally
requires the local safety/playback gates and user-controlled fresh approval.
Do not change the issuer, truncate signing data, clear signing locks, re-upload
or re-pay to work around this display error.
