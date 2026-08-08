# YouTick web

The web app supports one paid-media path:

- browser to Livepeer Studio over TUS for source upload;
- NEAR market contract for jobs, publications, entitlement and creator balances;
- NEAR access contract for resource-bound `Play` grants;
- Livepeer Bridge for upload intents and short-lived playback tokens;
- USDC for creator upload fees, ticket purchases and creator withdrawals.

Source video and playback bytes never pass through Next.js or the Bridge Worker.
The Bridge serves only the public, size-limited first-frame JPEG derived for
publication covers after checking the current on-chain publication state.

## Local checks

```bash
npm ci
npm test -- --run
npm run test:livepeer-canary
npm run lint
NEXT_PUBLIC_NEAR_NETWORK=testnet \
NEXT_PUBLIC_MARKET_CONTRACT_ID=market.testnet \
NEXT_PUBLIC_ACCESS_CONTRACT_ID=access.testnet \
NEXT_PUBLIC_ENABLE_PAID_MEDIA_LIVEPEER_V1=false \
npm run build
```

Copy `.env.example` to `.env.local` for development. Market and access IDs are required and have no fallback. The Livepeer and native-NEAR fee flags remain closed until their release gates are approved.
