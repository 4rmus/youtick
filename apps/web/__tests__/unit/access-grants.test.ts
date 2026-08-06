import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMockKeyStore } from '../setup';

describe('access-grants', () => {
    beforeEach(() => {
        clearMockKeyStore();
        process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID = 'market.testnet';
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = 'access.testnet';
        Object.assign(window, {
            crypto: globalThis.crypto,
            location: { origin: 'https://app.test' },
        });
        Object.defineProperty(globalThis, 'navigator', {
            value: {
                userAgent: 'vitest',
                language: 'en',
                platform: 'test',
                hardwareConcurrency: 4,
            },
            configurable: true,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
        clearMockKeyStore();
        sessionStorage.clear();
        delete process.env.NEXT_PUBLIC_NEAR_NETWORK;
        delete process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID;
        delete process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID;
    });

    it('issues and caches a testnet session grant', async () => {
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = 'access-1773606802388.v2-0.utick.testnet';

        const wallet = {
            signAndSendTransaction: vi.fn(async () => ({})),
        };

        const { ensureSessionGrant } = await import('@/lib/access-grants');
        const firstGrant = await ensureSessionGrant({
            accountId: 'alice.testnet',
            scope: 'Play',
            resourceId: 'video-1',
            wallet: wallet as never,
        });

        expect(firstGrant).toMatchObject({
            accountId: 'alice.testnet',
            scope: 'Play',
            resourceId: 'video-1',
        });
        expect(firstGrant?.sessionPublicKey).toContain('ed25519:');
        expect(wallet.signAndSendTransaction).toHaveBeenCalledTimes(1);
        expect((wallet.signAndSendTransaction as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
            receiverId: 'access-1773606802388.v2-0.utick.testnet',
        });
        const action = (wallet.signAndSendTransaction as ReturnType<typeof vi.fn>).mock.calls[0][0].actions[0];
        expect(action).toMatchObject({
            methodName: 'issue_session_grant',
            args: {
                target_owner_id: 'alice.testnet',
                scope: 'Play',
                resource_id: 'video-1',
            },
        });
        expect(action.args.session_pk).toContain('ed25519:');
        expect(action.args.session_pok).toMatch(/^[0-9a-f]{128}$/);

        const secondGrant = await ensureSessionGrant({
            accountId: 'alice.testnet',
            scope: 'Play',
            resourceId: 'video-1',
            wallet: wallet as never,
        });

        expect(secondGrant?.sessionPublicKey).toBe(firstGrant?.sessionPublicKey);
        expect(wallet.signAndSendTransaction).toHaveBeenCalledTimes(1);
    });

    it('uses a stored signless access key to issue a play grant without opening the wallet', async () => {
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = 'access-1773606802388.v2-0.utick.testnet';

        const { Account, KeyPair } = await import('near-api-js');
        const { persistSignlessAccessKey } = await import('@/lib/signless-access-key');
        const accountSignSpy = vi.spyOn(Account.prototype, 'signAndSendTransaction');
        await persistSignlessAccessKey('alice.testnet', KeyPair.fromRandom('ed25519'));

        const wallet = {
            signAndSendTransaction: vi.fn(async () => ({})),
        };

        const { ensureSessionGrant } = await import('@/lib/access-grants');
        const grant = await ensureSessionGrant({
            accountId: 'alice.testnet',
            scope: 'Play',
            resourceId: 'video-1',
            wallet: wallet as never,
        });

        expect(grant).toMatchObject({
            accountId: 'alice.testnet',
            scope: 'Play',
            resourceId: 'video-1',
        });
        expect(wallet.signAndSendTransaction).not.toHaveBeenCalled();
        expect(accountSignSpy).toHaveBeenCalledTimes(1);
        expect(accountSignSpy.mock.calls[0][0]).toMatchObject({
            receiverId: 'access-1773606802388.v2-0.utick.testnet',
        });
    });

    it('provisions a signless key alongside the wallet-signed grant when none exists', async () => {
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = 'access-1773606802388.v2-0.utick.testnet';

        const wallet = {
            signAndSendTransaction: vi.fn(async () => ({})),
            signAndSendTransactions: vi.fn(async () => []),
        };

        const { ensureSessionGrant } = await import('@/lib/access-grants');
        const grant = await ensureSessionGrant({
            accountId: 'alice.testnet',
            scope: 'Play',
            resourceId: 'video-1',
            wallet: wallet as never,
        });

        expect(grant).toMatchObject({ accountId: 'alice.testnet', scope: 'Play' });
        expect(wallet.signAndSendTransaction).not.toHaveBeenCalled();
        expect(wallet.signAndSendTransactions).toHaveBeenCalledTimes(1);

        const { transactions } = (wallet.signAndSendTransactions as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
            transactions: Array<{ receiverId: string; actions: Array<{ type?: string; methodName?: string }> }>;
        };
        expect(transactions).toHaveLength(2);
        expect(transactions[0].receiverId).toBe('access-1773606802388.v2-0.utick.testnet');
        expect(transactions[0].actions[0]).toMatchObject({ methodName: 'issue_session_grant' });
        expect(transactions[1].receiverId).toBe('alice.testnet');
        expect(transactions[1].actions[0]).toMatchObject({ type: 'AddKey' });

        // The provisioned key is persisted so the next grant is signless.
        const { getSignlessAccessKey } = await import('@/lib/signless-access-key');
        expect(await getSignlessAccessKey('alice.testnet')).not.toBeNull();
    });

    it('does not provision a second key when the stored key state is not confirmed missing', async () => {
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = 'access-1773606802388.v2-0.utick.testnet';

        const { Account, KeyPair } = await import('near-api-js');
        const { persistSignlessAccessKey } = await import('@/lib/signless-access-key');
        // Stored key exists but the signless send fails (e.g. transient RPC error).
        vi.spyOn(Account.prototype, 'signAndSendTransaction').mockRejectedValue(new Error('network down'));
        await persistSignlessAccessKey('alice.testnet', KeyPair.fromRandom('ed25519'));

        const wallet = {
            signAndSendTransaction: vi.fn(async () => ({})),
            signAndSendTransactions: vi.fn(async () => []),
        };

        const { ensureSessionGrant } = await import('@/lib/access-grants');
        await ensureSessionGrant({
            accountId: 'alice.testnet',
            scope: 'Play',
            resourceId: 'video-1',
            wallet: wallet as never,
        });

        // On-chain state is "unknown" (mock provider), so no AddKey churn:
        // fall back to the plain wallet-signed grant and keep the stored key.
        expect(wallet.signAndSendTransactions).not.toHaveBeenCalled();
        expect(wallet.signAndSendTransaction).toHaveBeenCalledTimes(1);
    });

    it('drops the provisioned key when the wallet rejects the batched approval', async () => {
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = 'access-1773606802388.v2-0.utick.testnet';

        const wallet = {
            signAndSendTransaction: vi.fn(async () => ({})),
            signAndSendTransactions: vi.fn(async () => {
                throw new Error('User rejected the request');
            }),
        };

        const { ensureSessionGrant } = await import('@/lib/access-grants');
        await expect(ensureSessionGrant({
            accountId: 'alice.testnet',
            scope: 'Play',
            resourceId: 'video-1',
            wallet: wallet as never,
        })).rejects.toThrow('User rejected the request');

        // The key never landed on-chain, so the local secret must not survive.
        const { getSignlessAccessKey } = await import('@/lib/signless-access-key');
        expect(await getSignlessAccessKey('alice.testnet')).toBeNull();
    });

    it('keeps the signless key out of the default near-api-js keystore namespace', async () => {
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';

        const { KeyPair } = await import('near-api-js');
        const { persistSignlessAccessKey, getSignlessAccessKey } = await import('@/lib/signless-access-key');
        const { BrowserKeyStore } = await import('@/lib/keystore-v7');

        await persistSignlessAccessKey('alice.testnet', KeyPair.fromRandom('ed25519'));

        expect(await getSignlessAccessKey('alice.testnet')).not.toBeNull();
        // The dedicated signless namespace must not leak into the default store.
        expect(await new BrowserKeyStore().getKey('testnet', 'alice.testnet')).toBeNull();
    });

    it('clears grants by account prefix', async () => {
        const { clearSessionGrantCache } = await import('@/lib/access-grants');

        sessionStorage.setItem('youtick:access-grant:alice.testnet:Play:video-1', JSON.stringify({ expiresAt: Date.now() + 1000 }));
        sessionStorage.setItem('youtick:access-grant:bob.testnet:Play:video-1', JSON.stringify({ expiresAt: Date.now() + 1000 }));

        clearSessionGrantCache('alice.testnet');

        expect(sessionStorage.getItem('youtick:access-grant:alice.testnet:Play:video-1')).toBeNull();
        expect(sessionStorage.getItem('youtick:access-grant:bob.testnet:Play:video-1')).not.toBeNull();
    });

    it('keeps resource-bound play grant secrets out of sessionStorage after a reload', async () => {
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = 'access-1773606802388.v2-0.utick.testnet';

        const { getCachedSessionGrant, persistSessionGrant, prepareSessionGrant } = await import('@/lib/access-grants');
        const prepared = await prepareSessionGrant({
            accountId: 'alice.testnet',
            scope: 'Play',
            resourceId: 'video-1',
        });
        persistSessionGrant(prepared.grant);

        const raw = sessionStorage.getItem('youtick:access-grant:alice.testnet:Play:video-1');
        expect(raw).not.toBeNull();
        expect(JSON.parse(raw || '{}')).not.toHaveProperty('secretKey');
        expect(getCachedSessionGrant('alice.testnet', 'Play', 'video-1')?.secretKey).toBe(prepared.grant.secretKey);

        vi.resetModules();
        const reloaded = await import('@/lib/access-grants');
        const restored = reloaded.getCachedSessionGrant('alice.testnet', 'Play', 'video-1');

        expect(restored).toBeNull();
        expect(sessionStorage.getItem('youtick:access-grant:alice.testnet:Play:video-1')).toBeNull();
    });

    it('reuses a pending session grant request so only one wallet transaction is opened', async () => {
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = 'access-1773606802388.v2-0.utick.testnet';

        let resolveTx: () => void = () => {};
        const wallet = {
            signAndSendTransaction: vi.fn(
                () =>
                    new Promise<void>((resolve) => {
                        resolveTx = resolve;
                    }),
            ),
        };

        const { ensureSessionGrant } = await import('@/lib/access-grants');

        const firstPromise = ensureSessionGrant({
            accountId: 'alice.testnet',
            scope: 'Play',
            resourceId: 'video-1',
            wallet: wallet as never,
        });
        const secondPromise = ensureSessionGrant({
            accountId: 'alice.testnet',
            scope: 'Play',
            resourceId: 'video-1',
            wallet: wallet as never,
        });

        for (let attempts = 0; attempts < 10 && wallet.signAndSendTransaction.mock.calls.length === 0; attempts += 1) {
            await new Promise((resolve) => setTimeout(resolve, 5));
        }
        expect(wallet.signAndSendTransaction).toHaveBeenCalledTimes(1);

        resolveTx();

        const [firstGrant, secondGrant] = await Promise.all([firstPromise, secondPromise]);
        expect(firstGrant?.sessionPublicKey).toBe(secondGrant?.sessionPublicKey);
    });

    it('rejects play grants when secure browser hashing is unavailable', async () => {
        Object.assign(window, { crypto: undefined });
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = 'access-1773606802388.v2-0.utick.testnet';

        const wallet = {
            signAndSendTransaction: vi.fn(async () => ({})),
        };

        const { ensureSessionGrant } = await import('@/lib/access-grants');

        await expect(ensureSessionGrant({
            accountId: 'alice.testnet',
            scope: 'Play',
            resourceId: 'video-1',
            wallet: wallet as never,
        })).rejects.toThrow('Secure browser hashing is required');
        expect(wallet.signAndSendTransaction).not.toHaveBeenCalled();
    });

    it('builds the same canonical session proof message shape used by the contract', async () => {
        const { buildSessionGrantPokMessage } = await import('@/lib/access-grants');

        expect(buildSessionGrantPokMessage({
            contractId: 'access.testnet',
            caller: 'alice.testnet',
            targetOwnerId: 'alice.testnet',
            sessionPublicKey: 'ed25519:test',
            scope: 'Play',
            resourceId: 'video-1',
            ttlMs: 300_000,
            originHash: 'origin',
            deviceHash: null,
        })).toBe([
            'youtick-session-grant-v1',
            'contract=6163636573732e746573746e6574',
            'caller=616c6963652e746573746e6574',
            'target_owner=616c6963652e746573746e6574',
            'session_pk=656432353531393a74657374',
            'scope=play',
            'resource_id=766964656f2d31',
            'ttl_ms=300000',
            'origin_hash=6f726967696e',
            'device_hash=-',
        ].join('\n'));
    });
});
