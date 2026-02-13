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
│  3. Create Nova Group for video                                 │
│     └── nova.createGroup({ name: `video-${uuid}` })             │
│           │                                                      │
│           ▼                                                      │
│  4. Nova Protocol Encryption                                    │
│     └── nova.uploadFile(video, groupId)                         │
│           │                                                      │
│           ▼                                                      │
│  5. Returns encrypted CID from IPFS                             │
│           │                                                      │
│           ▼                                                      │
│  6. Create Event on Contract                                    │
│     └── create_event_prepaid(cid, groupId, title, price)        │
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

    // 2. Create Nova group for this video
    const groupResult = await nova.createGroup({
        name: `video-${crypto.randomUUID()}`,
        members: [accountId],
        metadata: { videoTitle: title }
    });

    // 3. Encrypt and upload via Nova
    const uploadResult = await nova.uploadFile({
        groupId: groupResult.groupId,
        file: file,
        metadata: {
            fileName: file.name,
            mimeType: file.type
        },
        onProgress: (progress) => setUploadProgress(progress)
    });

    // 4. Create event on contract
    await sessionManager.callMethod('create_event_prepaid', {
        encrypted_cid: uploadResult.cid,
        nova_group_id: groupResult.groupId,
        title,
        description: 'Video description',
        price: nearToYocto(parseFloat(price))
    });

    return uploadResult.cid;
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
│  3. Verify Nova group membership                                │
│     └── nova.verifyMembership({ groupId, accountId })           │
│           │                                                      │
│           ▼                                                      │
│  4. Download and decrypt via Nova                               │
│     └── nova.downloadFile({ groupId, cid, accountId })          │
│           │                                                      │
│           ▼                                                      │
│  5. Create playable blob                                        │
│     └── URL.createObjectURL(decryptedVideo)                     │
│           │                                                      │
│           ▼                                                      │
│  6. Stream video to player                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Code Example

```typescript
async function watchVideo(cid: string, groupId: string) {
    // 1. Check ownership
    const hasAccess = await checkOwnership(accountId, cid);
    if (!hasAccess) {
        throw new Error('Purchase required');
    }

    // 2. Verify Nova membership
    const isMember = await nova.verifyMembership({
        groupId: groupId,
        accountId: accountId
    });

    if (!isMember) {
        throw new Error('Not authorized to view this content');
    }

    // 3. Download and decrypt via Nova
    const decryptedVideo = await nova.downloadFile({
        groupId: groupId,
        cid: cid,
        accountId: accountId
    });

    // 4. Create playable URL
    const videoUrl = URL.createObjectURL(decryptedVideo);

    return videoUrl;
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
│  3. Contract checks ban status                                  │
│     └── Blocked if event is banned (BanReason)                  │
│                   │                                              │
│                   ▼                                              │
│  4. Contract processes payment                                  │
│     ├── 98% → Creator                                           │
│     ├── 1%  → Trial Pool                                        │
│     └── 1%  → Commission Pool                                   │
│                   │                                              │
│                   ▼                                              │
│  5. Purchase recorded on-chain (PurchaseLog)                    │
│     └── buyer, creator, price, type, timestamp                  │
│                   │                                              │
│                   ▼                                              │
│  6. Add buyer to Nova group                                     │
│     └── nova.addMember({ groupId, memberId: buyer })            │
│     └── Queued for retry on failure (pending-access-queue)      │
│                   │                                              │
│                   ▼                                              │
│  7. NFT minted to buyer                                         │
│                   │                                              │
│                   ▼                                              │
│  8. Immediate access to content                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Code Example

```typescript
async function purchaseTicket(eventCid: string, groupId: string) {
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

    // Add buyer to Nova group for decryption access
    await nova.addMember({
        groupId: groupId,
        memberId: accountId,
        role: 'member'
    });
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
│  5. Add recipient to Nova group                                 │
│     └── nova.addMember({ groupId, memberId: recipient })        │
│                 │                                                │
│                 ▼                                                │
│  6. Access key deleted (one-time use)                           │
│                 │                                                │
│                 ▼                                                │
│  7. NFT in recipient's wallet + video access                    │
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

    // 4. Add to Nova group for video access
    await nova.addMember({
        groupId: giftInfo.novaGroupId,
        memberId: hasAccount ? accountId : `${newUsername}.${CONTRACT_ID}`,
        role: 'member'
    });
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
- [Nova Protocol](../architecture/nova-protocol.md) - Encryption
- [Nova SDK](./nova-sdk.md) - SDK integration guide
