import { afterEach, describe, expect, it, vi } from 'vitest';

describe('access-grants', () => {
    afterEach(() => {
        vi.resetModules();
        sessionStorage.clear();
        delete process.env.NEXT_PUBLIC_NEAR_NETWORK;
        delete process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID;
        delete process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID;
        delete process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID;
    });

    it('issues and caches a testnet session grant', async () => {
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = 'access.v1.utick.testnet';

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
            receiverId: 'access.v1.utick.testnet',
        });

        const secondGrant = await ensureSessionGrant({
            accountId: 'alice.testnet',
            scope: 'Play',
            resourceId: 'video-1',
            wallet: wallet as never,
        });

        expect(secondGrant?.sessionPublicKey).toBe(firstGrant?.sessionPublicKey);
        expect(wallet.signAndSendTransaction).toHaveBeenCalledTimes(1);
    });

    it('clears grants by account prefix', async () => {
        const { clearSessionGrantCache } = await import('@/lib/access-grants');

        sessionStorage.setItem('youtick:access-grant:alice.testnet:Play:video-1', JSON.stringify({ expiresAt: Date.now() + 1000 }));
        sessionStorage.setItem('youtick:access-grant:bob.testnet:Play:video-1', JSON.stringify({ expiresAt: Date.now() + 1000 }));

        clearSessionGrantCache('alice.testnet');

        expect(sessionStorage.getItem('youtick:access-grant:alice.testnet:Play:video-1')).toBeNull();
        expect(sessionStorage.getItem('youtick:access-grant:bob.testnet:Play:video-1')).not.toBeNull();
    });

    it('reuses a pending session grant request so only one wallet transaction is opened', async () => {
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = 'access.v1.utick.testnet';

        let resolveTx: (() => void) | null = null;
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

        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(wallet.signAndSendTransaction).toHaveBeenCalledTimes(1);

        resolveTx?.();

        const [firstGrant, secondGrant] = await Promise.all([firstPromise, secondPromise]);
        expect(firstGrant?.sessionPublicKey).toBe(secondGrant?.sessionPublicKey);
    });
});
