# User Flows

> End-to-end flows for YouTick operations

---

## Flow Overview

| Flow | Actor | Result |
|------|-------|--------|
| [Upload](#upload-flow) | Creator | Video listed as event |
| [Watch](#watch-flow) | Viewer (Owner) | Video playback |
| [Purchase](#purchase-flow) | Viewer | NFT ticket ownership |
| [Gift Create](#gift-creation-flow) | Creator | Shareable gift links |
| [Gift Claim](#gift-claim-flow) | Recipient | NFT + optional account |
| [Trial Create](#trial-account-flow) | New User | NEAR account |

---

## Upload Flow

**Actor**: Creator (connected wallet)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Upload Flow                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Creator selects video file                                  │
│           │                                                      │
│           ▼                                                      │
│  2. Check/Create Session Key                                    │
│     ├── Has key? → Continue                                     │
│     └── No key? → Wallet popup (one-time)                       │
│           │                                                      │
│           ▼                                                      │
│  3. Generate Access Control Conditions                          │
│     └── Based on video CID (will-be-minted)                     │
│           │                                                      │
│           ▼                                                      │
│  4. Lit Protocol Encryption                                     │
│     └── encryptFile(video, ACC, sessionSigs)                    │
│           │                                                      │
│           ▼                                                      │
│  5. Crust IPFS Upload                                           │
│     ├── Generate W3Auth token (Session Key)                     │
│     └── uploadFile(encryptedBlob, accountId)                    │
│           │                                                      │
│           ▼                                                      │
│  6. Create Event on Contract                                    │
│     └── create_event_prepaid(cid, title, price)                 │
│           │                                                      │
│           ▼                                                      │
│  7. Event listed on platform                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Code Example

```typescript
async function uploadVideo(file: File, title: string, price: string) {
    const sessionManager = new SessionManager(accountId);

    // 1. Ensure session key exists
    if (!await sessionManager.hasSessionKey()) {
        await sessionManager.createSessionKey(wallet, '1');
    }

    // 2. Get session signatures for Lit
    const ethAddress = await deriveEthAddress(accountId, 'lit/pkp-minting');
    const sessionSigs = await lit.getSessionSigs(
        wallet, accountId, ethAddress, signWithMPC
    );

    // 3. Encrypt video
    const acc = createAccessConditions(accountId);
    const { ciphertext, dataToEncryptHash } = await lit.encryptFile(
        file, acc, null, 'ethereum', sessionSigs
    );

    // 4. Upload to Crust
    const encryptedBlob = new Blob([ciphertext]);
    const { cid } = await uploadFile(encryptedBlob, accountId);

    // 5. Create event
    await sessionManager.callMethod('create_event_prepaid', {
        encrypted_cid: cid,
        title,
        description: 'Video description',
        price: nearToYocto(parseFloat(price))
    });

    return cid;
}
```

---

## Watch Flow

**Actor**: Viewer (NFT owner)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Watch Flow                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Viewer navigates to video                                   │
│           │                                                      │
│           ▼                                                      │
│  2. Verify NFT Ownership                                        │
│     └── verify_ownership(accountId, tokenId)                    │
│           │                                                      │
│     ┌─────┴─────┐                                               │
│     │           │                                                │
│     ▼           ▼                                                │
│  Owns NFT    No NFT                                             │
│     │           │                                                │
│     │           └── Show purchase option                        │
│     │                                                            │
│     ▼                                                            │
│  3. Fetch encrypted video from IPFS                             │
│     └── fetchWithRace(cid) or fetchWithFailover(cid)            │
│           │                                                      │
│           ▼                                                      │
│  4. Get/Cache Lit Session Sigs                                  │
│     ├── Cached? → Use cached (24hr)                             │
│     └── Not cached? → getSessionSigs() or getSessionSigsWithPKP()│
│           │                                                      │
│           ▼                                                      │
│  5. Decrypt with Lit                                            │
│     └── decryptFile(ciphertext, hash, ACC, sessionSigs)         │
│           │                                                      │
│           ▼                                                      │
│  6. Create playable blob                                        │
│     └── new Blob([decryptedBytes], { type: 'video/mp4' })       │
│           │                                                      │
│           ▼                                                      │
│  7. Stream video to player                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Code Example

```typescript
async function watchVideo(cid: string) {
    // 1. Check ownership
    const hasAccess = await checkOwnership(accountId, cid);
    if (!hasAccess) {
        throw new Error('Purchase required');
    }

    // 2. Fetch encrypted video (parallel gateway race)
    const response = await fetchWithRace(cid, {
        timeout: 10000,
        maxGateways: 3
    });
    const encryptedData = await response.arrayBuffer();

    // 3. Get session signatures (cached if possible)
    const sessionSigs = pkpInfo
        ? await lit.getSessionSigsWithPKP(pkpInfo.publicKey, pkpInfo.ethAddress, accountId)
        : await lit.getSessionSigs(wallet, accountId, ethAddress, signWithMPC);

    // 4. Decrypt
    const acc = createAccessConditions(accountId);
    const decrypted = await lit.decryptFile(
        encryptedData.ciphertext,
        encryptedData.dataToEncryptHash,
        acc,
        null,
        'ethereum',
        sessionSigs
    );

    // 5. Create playable URL
    const blob = new Blob([decrypted], { type: 'video/mp4' });
    return URL.createObjectURL(blob);
}
```

---

## Purchase Flow

**Actor**: Viewer (any connected wallet)

```
┌─────────────────────────────────────────────────────────────────┐
│                       Purchase Flow                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Viewer clicks "Buy Ticket"                                  │
│           │                                                      │
│           ▼                                                      │
│  2. Check purchase method                                       │
│     ├── Has Session Key + Balance? → Signless                   │
│     └── No? → Wallet signature                                  │
│           │                                                      │
│           ▼                                                      │
│  ┌────────────────┬────────────────┐                            │
│  │   Signless     │    Wallet      │                            │
│  │   (Prepaid)    │   (Direct)     │                            │
│  └───────┬────────┴───────┬────────┘                            │
│          │                │                                      │
│          ▼                ▼                                      │
│  buy_ticket_prepaid    buy_ticket                               │
│          │                │                                      │
│          └────────┬───────┘                                      │
│                   │                                              │
│                   ▼                                              │
│  3. Contract processes payment                                  │
│     ├── 98% → Creator                                           │
│     └── 2%  → Platform                                          │
│                   │                                              │
│                   ▼                                              │
│  4. NFT minted to buyer                                         │
│                   │                                              │
│                   ▼                                              │
│  5. Immediate access to content                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Code Example

```typescript
async function purchaseTicket(eventCid: string) {
    const sessionManager = new SessionManager(accountId);

    // Check if can use signless
    const hasKey = await sessionManager.hasSessionKey();
    const balance = await sessionManager.getAccountBalance(rpcUrl);
    const event = await getEvent(eventCid);
    const price = parseFloat(yoctoToNear(event.price));

    if (hasKey && balance >= price + 0.01) {
        // Signless purchase
        await sessionManager.callMethod('buy_ticket_prepaid', {
            receiver_id: accountId,
            encrypted_cid: eventCid
        });
    } else {
        // Wallet purchase
        await wallet.signAndSendTransaction({
            receiverId: CONTRACT_ID,
            actions: [
                actions.functionCall(
                    'buy_ticket',
                    {
                        receiver_id: accountId,
                        encrypted_cid: eventCid
                    },
                    BigInt('100000000000000'),
                    BigInt(nearToYocto(price + 0.01))
                )
            ]
        });
    }
}
```

---

## Gift Creation Flow

**Actor**: Creator (event owner)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Gift Creation Flow                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Creator selects event to gift                               │
│           │                                                      │
│           ▼                                                      │
│  2. Choose number of gift links (1-50)                          │
│           │                                                      │
│           ▼                                                      │
│  3. Generate key pairs locally                                  │
│     └── KeyPair.fromRandom('ed25519') × N                       │
│           │                                                      │
│           ▼                                                      │
│  4. Call create_gift_drop                                       │
│     ├── Attach: 0.15 NEAR × N                                   │
│     └── Send: public_keys[]                                     │
│           │                                                      │
│           ▼                                                      │
│  5. Contract adds Function Call Access Keys                     │
│     └── Each key can call: claim_gift, claim_gift_and_create    │
│           │                                                      │
│           ▼                                                      │
│  6. Generate shareable links                                    │
│     └── {APP_URL}/claim?key={secretKey}&pk={publicKey}          │
│           │                                                      │
│           ▼                                                      │
│  7. Share links with recipients                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Code Example

```typescript
import { createGiftLinks } from '@/lib/gift-service';

async function createGifts(eventCid: string, count: number) {
    const links = await createGiftLinks(eventCid, count, wallet);

    // links = [
    //   {
    //     publicKey: 'ed25519:...',
    //     secretKey: 'ed25519:...',
    //     link: 'https://app.com/claim?key=...&pk=...'
    //   },
    //   ...
    // ]

    return links;
}
```

---

## Gift Claim Flow

**Actor**: Recipient (may not have NEAR account)

```
┌─────────────────────────────────────────────────────────────────┐
│                      Gift Claim Flow                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Recipient opens gift link                                   │
│     └── /claim?key={secretKey}&pk={publicKey}                   │
│           │                                                      │
│           ▼                                                      │
│  2. Validate gift link                                          │
│     └── validateGiftLink(publicKey)                             │
│           │                                                      │
│     ┌─────┴─────┐                                               │
│     │           │                                                │
│  Invalid     Valid                                              │
│     │           │                                                │
│     ▼           ▼                                                │
│  Show error  3. Show claim options                              │
│                 │                                                │
│        ┌────────┼────────┐                                      │
│        │        │        │                                       │
│        ▼        ▼        ▼                                       │
│   Has NEAR   No NEAR   Create                                   │
│   Account    Account   Trial                                    │
│        │        │        │                                       │
│        │        │        ▼                                       │
│        │        │   createSponsoredTrial()                      │
│        │        │        │                                       │
│        │        └────────┤                                       │
│        │                 │                                       │
│        ▼                 ▼                                       │
│  4a. claim_gift    4b. claim_gift_and_create_account            │
│        │                 │                                       │
│        │                 ├── Creates {user}.{contract}          │
│        │                 ├── Adds Full Access Key               │
│        │                 └── Mints NFT                          │
│        │                 │                                       │
│        └────────┬────────┘                                       │
│                 │                                                │
│                 ▼                                                │
│  5. Access key deleted (one-time use)                           │
│                 │                                                │
│                 ▼                                                │
│  6. NFT in recipient's wallet                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Code Example

```typescript
import {
    parseGiftLink,
    validateGiftLink,
    claimGiftToExisting,
    claimGiftAndCreateAccount
} from '@/lib/gift-service';

async function claimGift(url: string, hasAccount: boolean, newUsername?: string) {
    // 1. Parse link
    const { secretKey, publicKey } = parseGiftLink(url);

    // 2. Validate
    const giftInfo = await validateGiftLink(publicKey);
    if (!giftInfo || giftInfo.remainingClaims === 0) {
        throw new Error('Invalid or already claimed');
    }

    if (hasAccount) {
        // 3a. Claim to existing account
        await claimGiftToExisting(secretKey, accountId);
    } else {
        // 3b. Claim and create new account
        const newKeyPair = KeyPair.fromRandom('ed25519');
        const newAccountId = `${newUsername}.${CONTRACT_ID}`;

        await claimGiftAndCreateAccount(
            secretKey,
            newAccountId,
            newKeyPair.getPublicKey().toString()
        );

        // Store key for new account
        localStorage.setItem(
            `near-api-js:keystore:${newAccountId}:${NETWORK_ID}`,
            newKeyPair.toString()
        );
    }
}
```

---

## Trial Account Flow

**Actor**: New user (no NEAR account)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Trial Account Flow                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. New user enters username                                    │
│           │                                                      │
│           ▼                                                      │
│  2. Generate key pair locally                                   │
│     └── KeyPair.fromRandom('ed25519')                           │
│           │                                                      │
│           ▼                                                      │
│  3. Try direct creation (decentralized)                         │
│     └── createSponsoredTrialDirect(username)                    │
│           │                                                      │
│     ┌─────┴─────┐                                               │
│     │           │                                                │
│  Success     Failed                                             │
│     │           │                                                │
│     │           ▼                                                │
│     │     4. Fallback to relayer                                │
│     │        └── createSponsoredTrialRelayer(username)          │
│     │           │                                                │
│     └───────────┤                                                │
│                 │                                                │
│                 ▼                                                │
│  5. Account created: {username}.{contract}                      │
│     ├── 0.1 NEAR initial balance (from trial_pool)              │
│     └── Full Access Key added                                   │
│                 │                                                │
│                 ▼                                                │
│  6. Key stored in localStorage                                  │
│                 │                                                │
│                 ▼                                                │
│  7. User can now use YouTick                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Code Example

```typescript
import { createSponsoredTrial } from '@/lib/gift-service';

async function createTrialAccount(username: string) {
    const result = await createSponsoredTrial(username);

    if (!result.success) {
        throw new Error(result.error);
    }

    console.log('Account created:', result.accountId);
    console.log('Method used:', result.method); // 'direct' or 'relayer'

    // Key is automatically stored in localStorage
    return result.accountId;
}
```

### Direct vs Relayer

| Aspect | Direct | Relayer |
|--------|--------|---------|
| Decentralized | Yes | No |
| Requires | Onboarding key in localStorage | API endpoint |
| Rate limit | Contract enforced | API enforced |
| Fallback | → Relayer | N/A |

---

## Related Documentation

- [Smart Contract](../architecture/smart-contract.md) - Contract methods
- [Session Keys](../architecture/session-keys.md) - Signless setup
- [Lit Protocol](../architecture/lit-protocol.md) - Encryption
- [Gift System](./gift-system.md) - Detailed gift guide
- [Trial Accounts](./trial-accounts.md) - Detailed trial guide
