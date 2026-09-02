import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
    featureFlags: { enablePlaybackAuthorizerV2: false },
    viewContract: vi.fn(),
    send: vi.fn(),
}));

vi.mock('@/lib/constants', () => ({
    APP_CONFIG: { livepeerBridgeUrl: 'https://bridge.youtick.net' },
    FEATURE_FLAGS: state.featureFlags,
    GAS_CONSTANTS: { mediumGas: 100_000_000_000_000n },
    NEAR_CONFIG: {
        marketContractId: 'paid-media-livepeer-v1.testnet',
        usdcContractId: 'usdc.testnet',
    },
}));

vi.mock('@/lib/near', () => ({
    getProvider: () => ({ id: 'provider' }),
    viewContract: state.viewContract,
}));

vi.mock('@/lib/signless-access-key', () => ({
    signAndSendWithSignlessProvision: state.send,
}));

import {
    buyLivepeerTicket,
    hasLivepeerEntitlement,
    livepeerPublicationCoverUrl,
    parseLivepeerPublication,
    readCreatorBalance,
    readLivepeerMediaJob,
    readLivepeerUploadProgress,
    readLivepeerPublications,
    readLivepeerPublication,
    waitForAuthorizedLivepeerJob,
    withdrawCreatorBalance,
    type LivepeerPublication,
} from '@/lib/livepeer-publication';

const PUBLICATION = {
    publication_id: 'job-001',
    creator_id: 'creator.testnet',
    title: 'Paid video',
    price_usdc: '2000001',
    generation: 1,
    playback_id: 'playback_001',
    availability: 'ACTIVE',
    published_at_ms: 1_785_589_300_000,
} satisfies LivepeerPublication;

describe('Livepeer publication UI boundary', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.featureFlags.enablePlaybackAuthorizerV2 = false;
    });

    it('reads only a publication bound to the requested job', async () => {
        state.viewContract.mockResolvedValueOnce(PUBLICATION);

        await expect(readLivepeerPublication('job-001')).resolves.toEqual(PUBLICATION);
        expect(state.viewContract).toHaveBeenCalledWith(
            { id: 'provider' },
            'paid-media-livepeer-v1.testnet',
            'get_publication',
            { publication_id: 'job-001' },
        );
        expect(() => parseLivepeerPublication({ ...PUBLICATION, publication_id: 'job-002' }, 'job-001'))
            .toThrow('invalid_livepeer_publication');
        expect(() => parseLivepeerPublication({ ...PUBLICATION, availability: 'UNKNOWN' }, 'job-001'))
            .toThrow('invalid_livepeer_publication');
    });

    it('derives the public cover route from publication identity and generation', () => {
        expect(livepeerPublicationCoverUrl(PUBLICATION)).toBe(
            'https://bridge.youtick.net/v1/publication-covers/job-001/1',
        );
    });

    it('buys the exact publication with NEAR-native USDC and provisions playback access', async () => {
        state.viewContract.mockResolvedValueOnce({ new_purchases_paused: false });
        state.send.mockResolvedValueOnce({});
        const wallet = { signAndSendTransaction: vi.fn(), signAndSendTransactions: vi.fn() };

        await buyLivepeerTicket(wallet as never, 'buyer.testnet', PUBLICATION);

        expect(state.viewContract).toHaveBeenCalledWith(
            { id: 'provider' },
            'paid-media-livepeer-v1.testnet',
            'get_governance_state',
            {},
        );
        const [, accountId, transactions] = state.send.mock.calls[0];
        expect(accountId).toBe('buyer.testnet');
        expect(transactions).toHaveLength(1);
        expect(transactions[0]).toMatchObject({
            receiverId: 'usdc.testnet',
            actions: [{
                methodName: 'ft_transfer_call',
                args: {
                    receiver_id: 'paid-media-livepeer-v1.testnet',
                    amount: '2000001',
                    memo: 'YouTick Livepeer ticket purchase',
                    msg: JSON.stringify({ action: 'buy_ticket', publication_id: 'job-001' }),
                },
                deposit: 1n,
            }],
        });
        await expect(buyLivepeerTicket(wallet as never, 'buyer.testnet', {
            ...PUBLICATION,
            availability: 'SALES_SUSPENDED',
        })).rejects.toThrow('livepeer_sales_closed');
        expect(state.send).toHaveBeenCalledOnce();
    });

    it('sends one USDC transaction without provisioning a legacy key for playback v2', async () => {
        state.featureFlags.enablePlaybackAuthorizerV2 = true;
        state.viewContract.mockResolvedValueOnce({ new_purchases_paused: false });
        const wallet = {
            signAndSendTransaction: vi.fn().mockResolvedValue({}),
            signAndSendTransactions: vi.fn(),
        };

        await buyLivepeerTicket(wallet, 'buyer.testnet', PUBLICATION);

        expect(wallet.signAndSendTransaction).toHaveBeenCalledOnce();
        expect(wallet.signAndSendTransaction.mock.calls[0][0]).toMatchObject({
            receiverId: 'usdc.testnet',
            actions: [{
                methodName: 'ft_transfer_call',
                args: {
                    receiver_id: 'paid-media-livepeer-v1.testnet',
                    amount: '2000001',
                },
            }],
        });
        expect(wallet.signAndSendTransaction.mock.calls[0][0].actions).toHaveLength(1);
        expect(wallet.signAndSendTransactions).not.toHaveBeenCalled();
        expect(state.send).not.toHaveBeenCalled();
    });

    it.each([
        ['paused', { new_purchases_paused: true }, 'livepeer_sales_closed'],
        ['invalid', { new_purchases_paused: 'false' }, 'invalid_livepeer_governance_state'],
    ])('does not send a wallet transaction when Market state is %s', async (
        _label,
        governance,
        expectedError,
    ) => {
        state.viewContract.mockResolvedValueOnce(governance);
        const wallet = { signAndSendTransaction: vi.fn(), signAndSendTransactions: vi.fn() };

        await expect(buyLivepeerTicket(wallet, 'buyer.testnet', PUBLICATION))
            .rejects.toThrow(expectedError);

        expect(wallet.signAndSendTransaction).not.toHaveBeenCalled();
        expect(wallet.signAndSendTransactions).not.toHaveBeenCalled();
        expect(state.send).not.toHaveBeenCalled();
    });

    it('does not send a wallet transaction when Market state cannot be read', async () => {
        state.viewContract.mockRejectedValueOnce(new Error('RPC unavailable'));
        const wallet = { signAndSendTransaction: vi.fn(), signAndSendTransactions: vi.fn() };

        await expect(buyLivepeerTicket(wallet, 'buyer.testnet', PUBLICATION))
            .rejects.toThrow('RPC unavailable');

        expect(wallet.signAndSendTransaction).not.toHaveBeenCalled();
        expect(wallet.signAndSendTransactions).not.toHaveBeenCalled();
        expect(state.send).not.toHaveBeenCalled();
    });

    it('checks entitlement against the v1 market and job ID', async () => {
        state.viewContract.mockResolvedValueOnce(true);

        await expect(hasLivepeerEntitlement('buyer.testnet', 'job-001')).resolves.toBe(true);
        expect(state.viewContract).toHaveBeenCalledWith(
            { id: 'provider' },
            'paid-media-livepeer-v1.testnet',
            'has_entitlement',
            { account_id: 'buyer.testnet', publication_id: 'job-001' },
        );
    });

    it('reads processing state and direct publication pages', async () => {
        state.viewContract
            .mockResolvedValueOnce({
                job_id: 'job-001',
                creator_id: 'creator.testnet',
                status: 'Authorized',
                upload_public_key: 'ed25519:11111111111111111111111111111111',
            })
            .mockResolvedValueOnce([PUBLICATION]);

        await expect(readLivepeerMediaJob('job-001')).resolves.toEqual({
            job_id: 'job-001',
            creator_id: 'creator.testnet',
            status: 'Authorized',
            upload_public_key: 'ed25519:11111111111111111111111111111111',
        });
        await expect(readLivepeerPublications(0, 24)).resolves.toEqual([PUBLICATION]);
        expect(state.viewContract).toHaveBeenLastCalledWith(
            { id: 'provider' },
            'paid-media-livepeer-v1.testnet',
            'get_publications',
            { from_index: '0', limit: 24 },
        );
    });

    it('waits outside the UI component for the exact authorized upload key', async () => {
        vi.useFakeTimers();
        state.viewContract
            .mockRejectedValueOnce(new Error('finality_lag'))
            .mockRejectedValueOnce(new Error('finality_lag'))
            .mockRejectedValueOnce(new Error('finality_lag'))
            .mockRejectedValueOnce(new Error('finality_lag'))
            .mockRejectedValueOnce(new Error('finality_lag'))
            .mockResolvedValueOnce({
                job_id: 'job-001',
                creator_id: 'creator.testnet',
                status: 'Authorized',
                upload_public_key: 'ed25519:11111111111111111111111111111111',
            });

        const pending = waitForAuthorizedLivepeerJob(
            'job-001',
            'creator.testnet',
            'ed25519:11111111111111111111111111111111',
        );
        await vi.advanceTimersByTimeAsync(31_000);

        await expect(pending).resolves.toBeUndefined();
        expect(state.viewContract).toHaveBeenCalledTimes(6);
        vi.useRealTimers();
    });

    it('composes upload progress reads outside the UI component', async () => {
        const job = {
            job_id: 'job-001',
            creator_id: 'creator.testnet',
            status: 'Authorized',
            upload_public_key: 'ed25519:11111111111111111111111111111111',
        } as const;
        state.viewContract.mockResolvedValueOnce(job).mockResolvedValueOnce(null);

        await expect(readLivepeerUploadProgress('job-001')).resolves.toEqual({
            job,
            publication: null,
        });
        expect(state.viewContract).toHaveBeenCalledTimes(2);
    });

    it('reads and withdraws the creator USDC balance', async () => {
        state.viewContract.mockResolvedValueOnce('1960000');
        const wallet = { signAndSendTransaction: vi.fn().mockResolvedValue({}) };

        await expect(readCreatorBalance('creator.testnet')).resolves.toBe('1960000');
        await withdrawCreatorBalance(wallet as never);

        expect(wallet.signAndSendTransaction).toHaveBeenCalledWith({
            receiverId: 'paid-media-livepeer-v1.testnet',
            actions: [expect.objectContaining({
                methodName: 'withdraw_creator_balance',
                args: {},
                deposit: 0n,
            })],
        });
    });
});
