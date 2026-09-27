import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { NearWalletBase } from '@hot-labs/near-connect';
import { PINNED_WALLET_MANIFEST } from '@/lib/pinned-wallet-manifest';
import { requestUsdcFunding, usdcAttemptKey, type UsdcReview } from '@/lib/near-auth-usdc';
import { NearAuthUsdcFunding } from '@/components/NearAuthUsdcFunding';

const selection = vi.hoisted(() => ({ accountId: 'sender.testnet' }));
vi.mock('@/lib/wallet-account', () => ({ selectedWalletAccount: () => ({ accountId: selection.accountId }) }));
const send = vi.fn(); const network = vi.fn();
const wallet = { manifest: PINNED_WALLET_MANIFEST.wallets[0], getAccounts: vi.fn(async () => []), signAndSendTransaction: send } as unknown as NearWalletBase;
let review: UsdcReview; let locked: boolean; let failure: string;
beforeEach(() => {
    failure = ''; locked = false; selection.accountId = 'sender.testnet';
    review = { accountId: '00'.repeat(32), publicKey: 'ed25519:synthetic', sender: 'sender.testnet', tokenContractId: 'token.testnet',
        recipientBalance: '0', senderBalance: '3800000', storageDepositYocto: '0', amountMicro: '600000', nearLimitYocto: '80000000000000000000000',
        registered: true, ready: false, allowed: true, reason: 'review', blockHeight: 123, ticket: 'synthetic-ticket', expiresAt: Date.now() + 300000,
        actions: [{ type: 'FunctionCall', params: { methodName: 'ft_transfer', args: { receiver_id: '00'.repeat(32), amount: '600000', memo: 'YouTick auth lab test balance' }, gas: '30000000000000', deposit: '1' } }] };
    send.mockReset().mockResolvedValue({ transaction: { hash: '3'.repeat(44) } });
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, _options: unknown, work: (lock: object | null) => Promise<unknown>) => {
        if (locked) return work(null); locked = true;
        try { return await work({}); } finally { locked = false; }
    } } });
    network.mockReset().mockImplementation(async (url: string, init: RequestInit) => {
        expect(url).toBe('/api/auth-lab/signing'); const body = JSON.parse(init.body as string);
        if (body.action === failure) return Response.json({ error: 'signing_check_failed' }, { status: 422 });
        if (body.action === 'authorize-usdc') {
            const actions = structuredClone(review.actions);
            if (failure === 'changed-amount') actions[0].params.args.amount = '900000';
            return Response.json({ accountId: failure === 'changed-account' ? 'ff'.repeat(32) : review.accountId,
                sender: review.sender, receiverId: review.tokenContractId, actions });
        }
        if (body.action === 'verify-usdc') return Response.json({ verified: true, accountId: review.accountId,
            transactionHash: '3'.repeat(44), balanceMicro: '600000', feeYocto: '1000' });
        throw new Error('unexpected_request');
    });
    vi.stubGlobal('fetch', network);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('renders a manual preparation action without choosing a wallet, funding or disturbing an upload', () => {
    const html = renderToStaticMarkup(createElement(NearAuthUsdcFunding, { disabled: false, onBusyChange: vi.fn() }));
    expect(html).toContain('Test bakiyesini hazırla'); expect(html).toContain('0,60 test USDC');
    expect(html).not.toContain('Cüzdan onayını aç'); expect(send).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
});

it('sends exactly the rechecked transaction once and retains an independent persistent guard', async () => {
    localStorage.setItem('youtick:auth-lab:funding:testnet:old-account', 'old-record');
    await expect(requestUsdcFunding(wallet, review)).resolves.toMatchObject({ verified: true });
    expect(send).toHaveBeenCalledExactlyOnceWith({ network: 'testnet', signerId: review.sender, receiverId: review.tokenContractId, actions: review.actions });
    expect(JSON.parse(localStorage.getItem(usdcAttemptKey(review.accountId))!).state).toBe('verified');
    expect(localStorage.getItem('youtick:auth-lab:funding:testnet:old-account')).toBe('old-record');
    await expect(requestUsdcFunding(wallet, review)).rejects.toThrow('funding_already_started');
    expect(send).toHaveBeenCalledOnce();
});

it.each(['expired', 'ready', 'sender', 'changed-amount', 'changed-account', 'authorize-usdc', 'locked', 'storage-failed'])('stops before wallet approval on %s', async (reason) => {
    failure = reason;
    if (reason === 'expired') review.expiresAt = 1;
    if (reason === 'ready') { review.ready = true; review.allowed = false; review.ticket = null; }
    if (reason === 'sender') selection.accountId = 'another.testnet';
    if (reason === 'locked') locked = true;
    if (reason === 'storage-failed') vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => { throw new Error('storage_unavailable'); });
    await expect(requestUsdcFunding(wallet, review)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
});

it.each(['wallet', 'missing-hash', 'verify-usdc'])('prevents retries after uncertain %s', async (reason) => {
    failure = reason;
    if (reason === 'wallet') send.mockRejectedValue(new Error('wallet_timeout'));
    if (reason === 'missing-hash') send.mockResolvedValue({});
    await expect(requestUsdcFunding(wallet, review)).rejects.toThrow();
    await expect(requestUsdcFunding(wallet, review)).rejects.toThrow('funding_already_started');
    expect(send).toHaveBeenCalledOnce();
});
