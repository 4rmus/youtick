import { APP_CONFIG, FEATURE_FLAGS, NEAR_CONFIG, NEAR_NETWORK } from '@/lib/constants';
import {
    parseLivepeerPublication,
    type LivepeerPublication,
} from '@/lib/livepeer-publication';

const ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
const HASH_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,512}$/;

type Watermark = { block_height: number; block_hash: string };

export type MarketPublicationPage = {
    items: LivepeerPublication[];
    nextCursor: string | null;
    watermark: Watermark;
};

export function readMarketPublicationPage(
    cursor: string | null,
    limit: number,
): Promise<MarketPublicationPage> {
    return readPublicationPage('/v1/publications', 'youtick.publications.v1', null,
        cursor, limit, true);
}

export function readMarketCreatorPublicationPage(
    accountId: string,
    cursor: string | null,
    limit: number,
): Promise<MarketPublicationPage> {
    requireAccount(accountId);
    return readPublicationPage(
        `/v1/creators/${encodeURIComponent(accountId)}/publications`,
        'youtick.creator-publications.v1', accountId, cursor, limit, false,
    );
}

async function readPublicationPage(
    path: string,
    schema: string,
    creatorId: string | null,
    cursor: string | null,
    limit: number,
    activeOnly: boolean,
): Promise<MarketPublicationPage> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50
        || (cursor !== null && !CURSOR_PATTERN.test(cursor))) {
        throw new Error('invalid_market_read_model_request');
    }
    const query = new URL(path, requireReadModelOrigin());
    query.searchParams.set('limit', String(limit));
    if (cursor) query.searchParams.set('cursor', cursor);
    const page = await requestJson(query);
    const watermark = parseWatermark(page.watermark);
    if ((FEATURE_FLAGS.publicTestnetVideoV1 && (page.network !== NEAR_NETWORK || page.contract_id !== NEAR_CONFIG.marketContractId))
        || page.schema !== schema
        || (creatorId !== null && page.creator_id !== creatorId)
        || !Array.isArray(page.items) || page.items.length > limit
        || !(page.next_cursor === null
            || (typeof page.next_cursor === 'string' && CURSOR_PATTERN.test(page.next_cursor)))) {
        throw new Error('invalid_market_read_model_page');
    }
    const items = page.items.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)
            || !Number.isSafeInteger((item as Record<string, unknown>).source_block_height)
            || Number((item as Record<string, unknown>).source_block_height) < 1
            || Number((item as Record<string, unknown>).source_block_height) > watermark.block_height) {
            throw new Error('invalid_market_read_model_page');
        }
        const id = (item as Record<string, unknown>).publication_id;
        if (typeof id !== 'string') throw new Error('invalid_market_read_model_page');
        const publication = parseLivepeerPublication(item, id);
        if ((activeOnly && publication.availability !== 'ACTIVE')
            || (creatorId !== null && publication.creator_id !== creatorId)) {
            throw new Error('invalid_market_read_model_page');
        }
        return publication;
    });
    return { items, nextCursor: page.next_cursor as string | null, watermark };
}

async function requestJson(path: string | URL): Promise<Record<string, unknown>> {
    const url = path instanceof URL ? path : new URL(path, requireReadModelOrigin());
    const response = await fetch(url.toString(), { cache: 'no-cache', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(2_500) });
    if (!response.ok) throw new Error('market_read_model_unavailable');
    try {
        const value: unknown = await response.json();
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
        return value as Record<string, unknown>;
    } catch {
        throw new Error('invalid_market_read_model_page');
    }
}

function parseWatermark(value: unknown): Watermark {
    const watermark = value as Record<string, unknown> | undefined;
    if (!watermark || !Number.isSafeInteger(watermark.block_height)
        || Number(watermark.block_height) < 1
        || typeof watermark.block_hash !== 'string'
        || !HASH_PATTERN.test(watermark.block_hash)) {
        throw new Error('invalid_market_read_model_page');
    }
    return {
        block_height: Number(watermark.block_height),
        block_hash: watermark.block_hash,
    };
}

function requireAccount(value: string): void {
    if (!ACCOUNT_PATTERN.test(value)) throw new Error('invalid_market_read_model_request');
}

function requireReadModelOrigin(): string {
    if (!FEATURE_FLAGS.enableDerivedReadModel || !APP_CONFIG.marketReadModelUrl) {
        throw new Error('derived_read_model_disabled');
    }
    return APP_CONFIG.marketReadModelUrl;
}

// Account views (Sahne G12). Derived from past events and possibly behind the current catalogue;
// callers show `indexedAtMs` and keep NEAR as the authority for playback access. UI gates on
// FEATURE_FLAGS.enableAccountReadModel; this is the client-side guard on the same variable.
export const accountReadModelEnabled = process.env.NEXT_PUBLIC_ENABLE_ACCOUNT_READ_MODEL === 'true';

const AMOUNT_PATTERN = /^(0|[1-9][0-9]{0,38})$/;
const ASSETS = ['USDC', 'NEAR'] as const;
const WITHDRAWAL_STATUSES = ['started', 'succeeded', 'failed'] as const;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,192}$/;

type AccountPage<T> = { items: T[]; nextCursor: string | null; watermark: Watermark; indexedAtMs: number };

export type AccountTicket = { publicationId: string; sourceBlockHeight: number; publication: LivepeerPublication | null };
export type CreatorSale = {
    publicationId: string;
    asset: (typeof ASSETS)[number];
    saleCount: number;
    grossAmount: string;
    creatorAmount: string;
    platformAmount: string;
    lastSaleBlockHeight: number;
};
export type CreatorWithdrawal = {
    withdrawalId: string;
    asset: (typeof ASSETS)[number];
    amount: string;
    status: (typeof WITHDRAWAL_STATUSES)[number];
    reasonCode: string | null;
    sourceBlockHeight: number;
};

export function readAccountTickets(accountId: string, cursor: string | null, limit: number): Promise<AccountPage<AccountTicket>> {
    return readAccountPage(`/v1/accounts/${encodeURIComponent(accountId)}/tickets`, 'youtick.account-tickets.v1',
        'account_id', accountId, cursor, limit, (item, watermark) => {
            const publicationId = requireId(item.publication_id);
            const sourceBlockHeight = requireHeight(item.source_block_height, watermark);
            let publication: LivepeerPublication | null = null;
            if (item.publication !== null) {
                const value = requireObject(item.publication);
                requireHeight(value.source_block_height, watermark);
                publication = parseLivepeerPublication(value, publicationId);
            }
            return { publicationId, sourceBlockHeight, publication };
        });
}

export function readCreatorSales(creatorId: string, cursor: string | null, limit: number): Promise<AccountPage<CreatorSale>> {
    return readAccountPage(`/v1/creators/${encodeURIComponent(creatorId)}/sales`, 'youtick.creator-sales.v1',
        'creator_id', creatorId, cursor, limit, (item, watermark) => {
            const grossAmount = requireAmount(item.gross_amount);
            const creatorAmount = requireAmount(item.creator_amount);
            const platformAmount = requireAmount(item.platform_amount);
            if (BigInt(creatorAmount) + BigInt(platformAmount) !== BigInt(grossAmount)
                || !Number.isSafeInteger(item.sale_count) || Number(item.sale_count) < 1) {
                throw new Error('invalid_market_read_model_page');
            }
            return {
                publicationId: requireId(item.publication_id),
                asset: requireOneOf(item.asset, ASSETS),
                saleCount: Number(item.sale_count),
                grossAmount,
                creatorAmount,
                platformAmount,
                lastSaleBlockHeight: requireHeight(item.last_sale_block_height, watermark),
            };
        });
}

export function readCreatorWithdrawals(creatorId: string, cursor: string | null, limit: number): Promise<AccountPage<CreatorWithdrawal>> {
    return readAccountPage(`/v1/creators/${encodeURIComponent(creatorId)}/withdrawals`, 'youtick.creator-withdrawals.v1',
        'creator_id', creatorId, cursor, limit, (item, watermark) => {
            if (item.reason_code !== null && (typeof item.reason_code !== 'string' || !/^[a-z0-9_]{1,64}$/.test(item.reason_code))) {
                throw new Error('invalid_market_read_model_page');
            }
            return {
                withdrawalId: requireId(item.withdrawal_id),
                asset: requireOneOf(item.asset, ASSETS),
                amount: requireAmount(item.amount),
                status: requireOneOf(item.status, WITHDRAWAL_STATUSES),
                reasonCode: item.reason_code as string | null,
                sourceBlockHeight: requireHeight(item.source_block_height, watermark),
            };
        });
}

async function readAccountPage<T>(
    path: string,
    schema: string,
    ownerField: 'account_id' | 'creator_id',
    owner: string,
    cursor: string | null,
    limit: number,
    parse: (item: Record<string, unknown>, watermark: Watermark) => T,
): Promise<AccountPage<T>> {
    if (!accountReadModelEnabled) throw new Error('account_read_model_disabled');
    requireAccount(owner);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || (cursor !== null && !CURSOR_PATTERN.test(cursor))) {
        throw new Error('invalid_market_read_model_request');
    }
    const query = new URL(path, requireReadModelOrigin());
    query.searchParams.set('limit', String(limit));
    if (cursor) query.searchParams.set('cursor', cursor);
    const page = await requestJson(query);
    const watermark = parseWatermark(page.watermark);
    if ((FEATURE_FLAGS.publicTestnetVideoV1 && (page.network !== NEAR_NETWORK || page.contract_id !== NEAR_CONFIG.marketContractId))
        || page.schema !== schema || page[ownerField] !== owner
        || !Number.isSafeInteger(page.indexed_at_ms) || Number(page.indexed_at_ms) < 1
        || !Array.isArray(page.items) || page.items.length > limit
        || !(page.next_cursor === null || (typeof page.next_cursor === 'string' && CURSOR_PATTERN.test(page.next_cursor)))) {
        throw new Error('invalid_market_read_model_page');
    }
    let items: T[];
    try {
        items = page.items.map((item) => parse(requireObject(item), watermark));
    } catch {
        throw new Error('invalid_market_read_model_page');
    }
    return {
        items,
        nextCursor: page.next_cursor as string | null,
        watermark,
        indexedAtMs: Number(page.indexed_at_ms),
    };
}

function requireObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_market_read_model_page');
    return value as Record<string, unknown>;
}

function requireId(value: unknown): string {
    if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new Error('invalid_market_read_model_page');
    return value;
}

function requireAmount(value: unknown): string {
    if (typeof value !== 'string' || !AMOUNT_PATTERN.test(value)) throw new Error('invalid_market_read_model_page');
    return value;
}

function requireHeight(value: unknown, watermark: Watermark): number {
    if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > watermark.block_height) {
        throw new Error('invalid_market_read_model_page');
    }
    return Number(value);
}

function requireOneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
    if (typeof value !== 'string' || !allowed.includes(value as T)) throw new Error('invalid_market_read_model_page');
    return value as T;
}
