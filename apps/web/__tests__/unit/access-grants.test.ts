import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMockKeyStore } from '../setup';

describe('access-grants', () => {
    beforeEach(() => {
        clearMockKeyStore();
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
        vi.resetModules();
        clearMockKeyStore();
        sessionStorage.clear();
        delete process.env.NEXT_PUBLIC_NEAR_NETWORK;
        delete process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID;
        delete process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID;
        delete process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID;
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
