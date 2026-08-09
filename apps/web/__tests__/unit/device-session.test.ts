import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/constants', () => ({
    APP_CONFIG: { publicAppUrl: 'https://app.youtick.net' },
    NEAR_CONFIG: { marketContractId: 'market.testnet' },
    NEAR_NETWORK: 'testnet',
}));

describe('device session', () => {
    beforeEach(() => {
        sessionStorage.clear();
        localStorage.clear();
        vi.resetModules();
    });

    it('keeps one eight-hour wallet-certified device key in sessionStorage only', async () => {
        const walletKey = 'ed25519:11111111111111111111111111111111';
        const wallet = {
            signMessage: vi.fn().mockResolvedValue({
                accountId: 'buyer.testnet',
                publicKey: walletKey,
                signature: btoa(String.fromCharCode(...new Uint8Array(64).fill(7))),
            }),
        };
        const { ensureDeviceSession, getDeviceSession } = await import('@/lib/device-session');

        const first = await ensureDeviceSession(wallet, 'buyer.testnet');
        const second = await ensureDeviceSession(wallet, 'buyer.testnet');

        expect(wallet.signMessage).toHaveBeenCalledOnce();
        expect(wallet.signMessage).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringContaining('youtick.device-session'),
            recipient: 'market.testnet',
            nonce: expect.any(Uint8Array),
        }));
        expect(wallet.signMessage.mock.calls[0][0].nonce).toHaveLength(32);
        expect(first).toEqual(second);
        expect(Number(first.certificate.expires_at_ms) - Number(first.certificate.issued_at_ms))
            .toBe(8 * 60 * 60 * 1000);
        expect(first.certificate).toMatchObject({
            domain: 'youtick.device-session',
            version: '1',
            network: 'testnet',
            account_id: 'buyer.testnet',
            scopes: ['play'],
        });
        expect(first.certificate_proof.public_key).toBe(walletKey);
        expect(first.secret_key).toMatch(/^ed25519:/);
        expect(await getDeviceSession('buyer.testnet')).toEqual(first);
        expect(sessionStorage.setItem).toHaveBeenCalled();
        expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    it('rejects a wallet proof for another account without persisting the device key', async () => {
        const wallet = {
            signMessage: vi.fn().mockResolvedValue({
                accountId: 'other.testnet',
                publicKey: 'ed25519:11111111111111111111111111111111',
                signature: btoa(String.fromCharCode(...new Uint8Array(64).fill(7))),
            }),
        };
        const { ensureDeviceSession, getDeviceSession } = await import('@/lib/device-session');

        await expect(ensureDeviceSession(wallet, 'buyer.testnet'))
            .rejects.toThrow('device_session_wallet_proof_invalid');

        expect(await getDeviceSession('buyer.testnet')).toBeNull();
    });

    it('clears the session authority explicitly', async () => {
        const wallet = {
            signMessage: vi.fn().mockResolvedValue({
                accountId: 'buyer.testnet',
                publicKey: 'ed25519:11111111111111111111111111111111',
                signature: btoa(String.fromCharCode(...new Uint8Array(64).fill(7))),
            }),
        };
        const { clearDeviceSession, ensureDeviceSession, getDeviceSession } = await import('@/lib/device-session');
        await ensureDeviceSession(wallet, 'buyer.testnet');

        await clearDeviceSession('buyer.testnet');

        expect(await getDeviceSession('buyer.testnet')).toBeNull();
    });
});
