import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const viewContract = vi.fn();

vi.mock('@/lib/near', () => ({
    getProvider: () => ({ query }),
    viewContract,
}));

describe('signless-access-key', () => {
    beforeEach(() => {
        process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
        process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID = 'market.testnet';
        process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = 'access.testnet';
        localStorage.clear();
        sessionStorage.clear();
        query.mockReset();
        viewContract.mockReset();
        viewContract.mockRejectedValue(new Error('RPC unavailable'));
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.resetModules();
    });

    it('keeps new secrets in sessionStorage and removes the legacy persistent secret', async () => {
        const { KeyPair } = await import('near-api-js');
        const keyPair = KeyPair.fromRandom('ed25519');
        const storageKey = 'youtick:signless-keystore:alice.testnet:testnet';
        localStorage.setItem(storageKey, keyPair.toString());

        const { getSignlessAccessKey, persistSignlessAccessKey } = await import('@/lib/signless-access-key');

        expect(await getSignlessAccessKey('alice.testnet')).toBeNull();
        expect(localStorage.getItem(storageKey)).toBeNull();

        await persistSignlessAccessKey('alice.testnet', keyPair);

        expect(localStorage.getItem(storageKey)).toBeNull();
        expect(sessionStorage.getItem(storageKey)).toBe(keyPair.toString());
        expect((await getSignlessAccessKey('alice.testnet'))?.toString()).toBe(keyPair.toString());
    });

    it.each([
        ['FullAccess', 'FullAccess'],
        ['empty methods', { FunctionCall: { receiver_id: 'access.testnet', method_names: [], allowance: '250000000000000000000000' } }],
        ['additional method', { FunctionCall: { receiver_id: 'access.testnet', method_names: ['issue_session_grant', 'other'], allowance: '250000000000000000000000' } }],
        ['wrong receiver', { FunctionCall: { receiver_id: 'other.testnet', method_names: ['issue_session_grant'], allowance: '250000000000000000000000' } }],
        ['unlimited allowance', { FunctionCall: { receiver_id: 'access.testnet', method_names: ['issue_session_grant'], allowance: null } }],
        ['allowance below minimum', { FunctionCall: { receiver_id: 'access.testnet', method_names: ['issue_session_grant'], allowance: '1' } }],
        ['allowance above maximum', { FunctionCall: { receiver_id: 'access.testnet', method_names: ['issue_session_grant'], allowance: '250000000000000000000001' } }],
    ])('rejects %s permission and clears the incompatible local key', async (_label, permission) => {
        const { KeyPair } = await import('near-api-js');
        const { getSignlessAccessKey, getUsableSignlessAccessKey, persistSignlessAccessKey } = await import('@/lib/signless-access-key');
        await persistSignlessAccessKey('alice.testnet', KeyPair.fromRandom('ed25519'));
        query.mockResolvedValue({ permission });

        expect(await getUsableSignlessAccessKey('alice.testnet')).toBeNull();
        expect(await getSignlessAccessKey('alice.testnet')).toBeNull();
        expect(query).toHaveBeenCalledWith(expect.objectContaining({ finality: 'final' }));
    });

    it('accepts only the exact finite permission', async () => {
        const { KeyPair } = await import('near-api-js');
        const { getUsableSignlessAccessKey, persistSignlessAccessKey } = await import('@/lib/signless-access-key');
        const keyPair = KeyPair.fromRandom('ed25519');
        await persistSignlessAccessKey('alice.testnet', keyPair);
        query.mockResolvedValue({
            permission: {
                FunctionCall: {
                    receiver_id: 'access.testnet',
                    method_names: ['issue_session_grant'],
                    allowance: '250000000000000000000000',
                },
            },
        });

        expect((await getUsableSignlessAccessKey('alice.testnet'))?.toString()).toBe(keyPair.toString());
    });

    it('fails closed without deleting or reprovisioning when RPC state is unknown', async () => {
        const { KeyPair } = await import('near-api-js');
        const { getSignlessAccessKey, getUsableSignlessAccessKey, persistSignlessAccessKey, prepareSignlessKeyProvision } = await import('@/lib/signless-access-key');
        const keyPair = KeyPair.fromRandom('ed25519');
        await persistSignlessAccessKey('alice.testnet', keyPair);
        query.mockRejectedValue(new Error('RPC timeout'));

        expect(await getUsableSignlessAccessKey('alice.testnet')).toBeNull();
        expect((await getSignlessAccessKey('alice.testnet'))?.toString()).toBe(keyPair.toString());
        expect(await prepareSignlessKeyProvision('alice.testnet')).toBeNull();
    });

    it('revokes all browser grants and deletes the exact signless key before clearing it locally', async () => {
        const { KeyPair } = await import('near-api-js');
        const keyPair = KeyPair.fromRandom('ed25519');
        const wallet = { signAndSendTransactions: vi.fn().mockResolvedValue([]) };
        const {
            getSignlessAccessKey,
            persistSignlessAccessKey,
            revokeBrowserAuthority,
        } = await import('@/lib/signless-access-key');
        await persistSignlessAccessKey('alice.testnet', keyPair);

        await revokeBrowserAuthority(wallet, 'alice.testnet');

        const transactions = wallet.signAndSendTransactions.mock.calls[0][0].transactions;
        expect(transactions).toHaveLength(2);
        expect(transactions[0]).toMatchObject({ receiverId: 'access.testnet' });
        expect(transactions[0].actions[0]).toMatchObject({
            type: 'FunctionCall',
            methodName: 'revoke_subject_sessions',
        });
        expect(transactions[0].actions[0].args).toEqual({
            owner_id: 'alice.testnet',
        });
        expect(transactions[1]).toMatchObject({ receiverId: 'alice.testnet' });
        expect(transactions[1].actions[0]).toMatchObject({ type: 'DeleteKey' });
        expect(transactions[1].actions[0].publicKey.toString()).toBe(keyPair.getPublicKey().toString());
        expect(await getSignlessAccessKey('alice.testnet')).toBeNull();
    });

    it('keeps the local signless key when secure revocation fails', async () => {
        const { KeyPair } = await import('near-api-js');
        const keyPair = KeyPair.fromRandom('ed25519');
        const wallet = { signAndSendTransactions: vi.fn().mockRejectedValue(new Error('wallet rejected')) };
        const {
            getSignlessAccessKey,
            persistSignlessAccessKey,
            revokeBrowserAuthority,
        } = await import('@/lib/signless-access-key');
        await persistSignlessAccessKey('alice.testnet', keyPair);

        await expect(revokeBrowserAuthority(wallet, 'alice.testnet')).rejects.toThrow('wallet rejected');

        expect(await getSignlessAccessKey('alice.testnet')).not.toBeNull();
    });

    it('finishes a secure disconnect from final chain state when the wallet callback is lost', async () => {
        vi.useFakeTimers();
        const { KeyPair } = await import('near-api-js');
        const keyPair = KeyPair.fromRandom('ed25519');
        query
            .mockResolvedValueOnce({
                permission: {
                    FunctionCall: {
                        receiver_id: 'access.testnet',
                        method_names: ['issue_session_grant'],
                        allowance: '250000000000000000000000',
                    },
                },
            })
            .mockRejectedValueOnce(new Error('access key does not exist'));
        viewContract
            .mockResolvedValueOnce([{ revoked: false }])
            .mockResolvedValueOnce([{ revoked: true }]);
        const wallet = {
            signAndSendTransactions: vi.fn(() => new Promise<object[] | void>(() => {})),
        };
        const {
            getSignlessAccessKey,
            persistSignlessAccessKey,
            revokeBrowserAuthority,
        } = await import('@/lib/signless-access-key');
        await persistSignlessAccessKey('alice.testnet', keyPair);

        const revocation = revokeBrowserAuthority(wallet, 'alice.testnet');
        await vi.advanceTimersByTimeAsync(2_000);

        await expect(revocation).resolves.toBe('chain');
        expect(wallet.signAndSendTransactions).toHaveBeenCalledOnce();
        expect(await getSignlessAccessKey('alice.testnet')).toBeNull();
    });

    it('skips a second wallet prompt when final chain state is already revoked', async () => {
        const { KeyPair } = await import('near-api-js');
        const keyPair = KeyPair.fromRandom('ed25519');
        query.mockRejectedValueOnce(new Error('access key does not exist'));
        viewContract.mockResolvedValueOnce([{ revoked: true }]);
        const wallet = { signAndSendTransactions: vi.fn() };
        const {
            getSignlessAccessKey,
            persistSignlessAccessKey,
            revokeBrowserAuthority,
        } = await import('@/lib/signless-access-key');
        await persistSignlessAccessKey('alice.testnet', keyPair);

        await expect(revokeBrowserAuthority(wallet, 'alice.testnet')).resolves.toBe('already-revoked');

        expect(wallet.signAndSendTransactions).not.toHaveBeenCalled();
        expect(await getSignlessAccessKey('alice.testnet')).toBeNull();
    });
});
