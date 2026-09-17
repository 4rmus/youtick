import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { NearConnectorOptions, NearWalletBase } from '@hot-labs/near-connect';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PINNED_WALLET_MANIFEST } from '@/lib/pinned-wallet-manifest';
import { connectFundingWallet, fundingAttemptKey, requestFundingApproval, type FundingReview } from '@/lib/near-auth-funding';
import { NearAuthFunding } from '@/components/NearAuthFunding';

const selection = vi.hoisted(() => ({ accountId: 'funding.testnet' }));
const connection = vi.hoisted(() => ({ options: null as NearConnectorOptions | null, wallet: null as NearWalletBase | null }));
const buttons = vi.hoisted(() => new Map<string, () => void>());
vi.mock('@/components/ui/button', () => ({ Button: ({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) => {
    if (typeof children === 'string' && onClick) buttons.set(children, onClick);
    return createElement('button', { disabled }, children);
} }));
vi.mock('@/lib/wallet-account', () => ({ selectedWalletAccount: () => ({ accountId: selection.accountId }) }));
vi.mock('@hot-labs/near-connect', () => ({ NearConnector: class {
    whenManifestLoaded = Promise.resolve();
    wallets = [connection.wallet];
    constructor(options: NearConnectorOptions) { connection.options = options; }
} }));

const send = vi.fn();
const wallet = { manifest: PINNED_WALLET_MANIFEST.wallets[0], signIn: vi.fn(async () => []), getAccounts: vi.fn(async () => []),
    signAndSendTransaction: send } as unknown as NearWalletBase;
let review: FundingReview;
let current: FundingReview;
let store: Map<string, string>;
let locked: boolean;
beforeEach(() => {
    selection.accountId = 'funding.testnet'; locked = false; store = new Map(); send.mockReset().mockResolvedValue({});
    connection.wallet = wallet; connection.options = null;
    buttons.clear();
    review = { publicKey: 'ed25519:11111111111111111111111111111111', implicitAccount: '00'.repeat(32), accounts: [],
        blockHeight: 123, signingTested: false, funding: { allowed: true, reason: 'ready', checkedAt: Date.now() } };
    current = structuredClone(review);
    vi.spyOn(localStorage, 'getItem').mockImplementation((key: string) => store.get(key) ?? null);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => { store.set(key, value); });
    vi.stubGlobal('navigator', { locks: { request: async (_key: string, _options: unknown, work: (lock: object | null) => Promise<unknown>) => {
        if (locked) return work(null);
        locked = true;
        try { return await work({}); } finally { locked = false; }
    } } });
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
        expect(url).toBe('/api/auth-lab/account?prepare=funding');
        expect(options.method).toBe('POST'); expect(options.body).toBeUndefined();
        return Response.json(current);
    }));
});

it('shows exact target and amounts without automatically connecting or submitting', () => {
    const html = renderToStaticMarkup(createElement(NearAuthFunding, { review }));
    expect(html).toContain(review.implicitAccount);
    expect(html).toContain('0,1 test NEAR'); expect(html).toContain('0,12 test NEAR');
    expect(html).toContain('Meteor testnet cüzdanını seç');
    expect(html).not.toContain('0,1 test NEAR için cüzdan onayını aç');
    expect(connection.options).toBeNull(); expect(send).not.toHaveBeenCalled();
});

it.each([false, true])('holds the parent busy gate during funding wallet selection and releases it; rejected=%s', async (rejected) => {
    const busy = vi.fn();
    let finish!: () => void;
    vi.mocked(wallet.signIn).mockImplementationOnce(() => new Promise((resolve, reject) => {
        finish = () => rejected ? reject(new Error('cancelled')) : resolve([]);
    }));
    renderToStaticMarkup(createElement(NearAuthFunding, { review, disabled: false, onBusyChange: busy, cspNonce: 'synthetic' }));
    buttons.get('Meteor testnet cüzdanını seç')!();
    await vi.waitFor(() => expect(wallet.signIn).toHaveBeenCalledOnce());
    expect(busy.mock.calls).toEqual([[true]]);
    buttons.get('Meteor testnet cüzdanını seç')!();
    expect(wallet.signIn).toHaveBeenCalledOnce();
    finish();
    await vi.waitFor(() => expect(busy.mock.calls).toEqual([[true], [false]]));
    expect(send).not.toHaveBeenCalled();
});

it('does not open a funding wallet while another lab operation is busy', () => {
    const busy = vi.fn();
    renderToStaticMarkup(createElement(NearAuthFunding, { review, disabled: true, onBusyChange: busy }));
    buttons.get('Meteor testnet cüzdanını seç')!();
    expect(connection.options).toBeNull(); expect(busy).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
});

it('connects only the pinned testnet wallet, without an added key or old connector selection', async () => {
    await connectFundingWallet('test-nonce');
    expect(connection.options?.network).toBe('testnet');
    expect(connection.options?.autoConnect).toBe(false);
    expect(connection.options?.manifest).toBe(PINNED_WALLET_MANIFEST);
    expect(await connection.options?.storage?.get('selected-wallet')).toBeNull();
    expect(wallet.signIn).toHaveBeenCalledWith({ network: 'testnet' });
    expect(send).not.toHaveBeenCalled();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('requests exactly one testnet transfer and persistently prevents another attempt', async () => {
    await requestFundingApproval(wallet, 'funding.testnet', review);
    expect(send).toHaveBeenCalledExactlyOnceWith({ network: 'testnet', signerId: 'funding.testnet', receiverId: review.implicitAccount,
        actions: [{ type: 'Transfer', params: { deposit: '100000000000000000000000' } }] });
    await expect(requestFundingApproval(wallet, 'funding.testnet', review)).rejects.toThrow('funding_already_started');
    expect(send).toHaveBeenCalledTimes(1);
    expect(store.has(fundingAttemptKey(review.implicitAccount))).toBe(true);
});

it.each(['changed-identity', 'existing-account', 'fee-denied', 'stale', 'changed-sender', 'another-tab'])('does not reach the wallet for %s', async (scenario) => {
    if (scenario === 'changed-identity') current.publicKey = 'ed25519:another';
    if (scenario === 'existing-account') current.accounts = ['existing.testnet'];
    if (scenario === 'fee-denied') current.funding!.allowed = false;
    if (scenario === 'stale') current.funding!.checkedAt -= 60_000;
    if (scenario === 'changed-sender') selection.accountId = 'other.testnet';
    if (scenario === 'another-tab') locked = true;
    await expect(requestFundingApproval(wallet, 'funding.testnet', review)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
});

it('keeps uncertain or cancelled wallet attempts blocked across a page reload', async () => {
    send.mockRejectedValue(new Error('wallet outcome unknown'));
    await expect(requestFundingApproval(wallet, 'funding.testnet', review)).rejects.toThrow();
    await expect(requestFundingApproval(wallet, 'funding.testnet', review)).rejects.toThrow('funding_already_started');
    expect(send).toHaveBeenCalledTimes(1);
});

it('does not dispatch if the persistent duplicate guard cannot be saved', async () => {
    vi.mocked(localStorage.setItem).mockImplementation(() => { throw new Error('storage unavailable'); });
    await expect(requestFundingApproval(wallet, 'funding.testnet', review)).rejects.toThrow('storage unavailable');
    expect(send).not.toHaveBeenCalled();
});
