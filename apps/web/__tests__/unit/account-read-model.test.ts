import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/constants', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/constants')>();
    return {
        ...actual,
        FEATURE_FLAGS: { ...actual.FEATURE_FLAGS, enableDerivedReadModel: true, publicTestnetVideoV1: false },
        APP_CONFIG: { ...actual.APP_CONFIG, marketReadModelUrl: 'https://read.test' },
    };
});

const WATERMARK = { block_height: 103, block_hash: 'block_hash_000000000000000000000103' };
const PUBLICATION = { publication_id: 'pub-c', creator_id: 'creator.testnet', title: 'Release C', generation: 1,
    price_usdc: '2000000', playback_id: 'playback_c', availability: 'ACTIVE', published_at_ms: 1, source_block_height: 103 };

async function load(enabled = true) {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_ENABLE_ACCOUNT_READ_MODEL', enabled ? 'true' : '');
    return import('@/lib/market-read-model');
}
function respond(body: Record<string, unknown>) {
    const fetch = vi.fn().mockResolvedValue(Response.json(body));
    vi.stubGlobal('fetch', fetch);
    return fetch;
}
const tickets = (overrides: Record<string, unknown> = {}) => ({ schema: 'youtick.account-tickets.v1', watermark: WATERMARK,
    indexed_at_ms: 1_785_600_000_000, account_id: 'buyer.testnet', next_cursor: null,
    items: [{ publication_id: 'pub-c', source_block_height: 103, publication: PUBLICATION }, { publication_id: 'gone', source_block_height: 102, publication: null }],
    ...overrides });
const sales = (item: Record<string, unknown> = {}) => ({ schema: 'youtick.creator-sales.v1', watermark: WATERMARK, indexed_at_ms: 1,
    creator_id: 'creator.testnet', next_cursor: 'abc', items: [{ publication_id: 'pub-c', asset: 'USDC', sale_count: 2, gross_amount: '4000000',
        creator_amount: '3800000', platform_amount: '200000', last_sale_block_height: 103, ...item }] });
const withdrawals = (item: Record<string, unknown> = {}) => ({ schema: 'youtick.creator-withdrawals.v1', watermark: WATERMARK, indexed_at_ms: 1,
    creator_id: 'creator.testnet', next_cursor: null, items: [{ withdrawal_id: 'w2', asset: 'USDC', amount: '1900000', status: 'failed',
        reason_code: 'ft_transfer_failed', source_block_height: 102, ...item }] });

describe('account read model client', () => {
    beforeEach(() => { vi.unstubAllEnvs(); });
    afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

    it('stays off unless NEXT_PUBLIC_ENABLE_ACCOUNT_READ_MODEL is true', async () => {
        const client = await load(false);
        const fetch = respond(tickets());
        expect(client.accountReadModelEnabled).toBe(false);
        await expect(client.readAccountTickets('buyer.testnet', null, 10)).rejects.toThrow('account_read_model_disabled');
        await expect(client.readCreatorSales('creator.testnet', null, 10)).rejects.toThrow('account_read_model_disabled');
        expect(fetch).not.toHaveBeenCalled();
    });

    it('reads tickets with freshness and tolerates a missing publication row', async () => {
        const client = await load();
        const fetch = respond(tickets());
        const page = await client.readAccountTickets('buyer.testnet', 'cur_1', 10);
        expect(String(fetch.mock.calls[0][0])).toBe('https://read.test/v1/accounts/buyer.testnet/tickets?limit=10&cursor=cur_1');
        expect(page.indexedAtMs).toBe(1_785_600_000_000);
        expect(page.items.map((item) => [item.publicationId, item.publication?.title ?? null])).toEqual([['pub-c', 'Release C'], ['gone', null]]);
    });

    it('reads sales and withdrawals as exact decimal strings', async () => {
        const client = await load();
        respond(sales());
        expect((await client.readCreatorSales('creator.testnet', null, 5)).items[0]).toEqual({ publicationId: 'pub-c', asset: 'USDC',
            saleCount: 2, grossAmount: '4000000', creatorAmount: '3800000', platformAmount: '200000', lastSaleBlockHeight: 103 });
        respond(withdrawals());
        expect((await client.readCreatorWithdrawals('creator.testnet', null, 5)).items[0]).toMatchObject({ status: 'failed', reasonCode: 'ft_transfer_failed' });
    });

    it.each([
        ['wrong schema', () => tickets({ schema: 'youtick.publications.v1' })],
        ['other account', () => tickets({ account_id: 'other.testnet' })],
        ['missing freshness', () => tickets({ indexed_at_ms: 0 })],
        ['too many items', () => tickets({ items: Array.from({ length: 11 }, () => ({ publication_id: 'x', source_block_height: 1, publication: null })) })],
        ['height past watermark', () => tickets({ items: [{ publication_id: 'x', source_block_height: 104, publication: null }] })],
        ['mismatched publication', () => tickets({ items: [{ publication_id: 'x', source_block_height: 103, publication: PUBLICATION }] })],
        ['bad cursor', () => tickets({ next_cursor: 'a b' })],
    ])('rejects tickets with %s', async (_label, body) => {
        const client = await load();
        respond(body());
        await expect(client.readAccountTickets('buyer.testnet', null, 10)).rejects.toThrow('invalid_market_read_model_page');
    });

    it.each([
        ['numeric amount', { gross_amount: 4000000 }],
        ['split that does not add up', { platform_amount: '100000' }],
        ['unknown asset', { asset: 'DAI' }],
        ['zero sales', { sale_count: 0 }],
        ['leading zero', { creator_amount: '03800000' }],
    ])('rejects sales with a %s', async (_label, item) => {
        const client = await load();
        respond(sales(item));
        await expect(client.readCreatorSales('creator.testnet', null, 5)).rejects.toThrow('invalid_market_read_model_page');
    });

    it.each([
        ['platform status', { status: 'platform_withdrawal_started' }],
        ['free-form reason', { reason_code: '<script>' }],
    ])('rejects withdrawals with a %s', async (_label, item) => {
        const client = await load();
        respond(withdrawals(item));
        await expect(client.readCreatorWithdrawals('creator.testnet', null, 5)).rejects.toThrow('invalid_market_read_model_page');
    });

    it('validates requests before any network call', async () => {
        const client = await load();
        const fetch = respond(tickets());
        await expect(client.readAccountTickets('Bad Account', null, 10)).rejects.toThrow('invalid_market_read_model_request');
        await expect(client.readAccountTickets('buyer.testnet', null, 51)).rejects.toThrow('invalid_market_read_model_request');
        await expect(client.readAccountTickets('buyer.testnet', '../x', 10)).rejects.toThrow('invalid_market_read_model_request');
        expect(fetch).not.toHaveBeenCalled();
    });
});
