import { APP_CONFIG, FEATURE_FLAGS } from '@/lib/constants';
import {
    parseLivepeerPublication,
    type LivepeerPublication,
} from '@/lib/livepeer-publication';

const ACCOUNT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/;
const HASH_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]{1,512}$/;
const DECIMAL_PATTERN = /^(0|[1-9][0-9]{0,39})$/;

type Watermark = { block_height: number; block_hash: string };

export type MarketPublicationPage = {
    items: LivepeerPublication[];
    nextCursor: string | null;
    watermark: Watermark;
};

export type MarketCreatorSalesSummary = {
    saleCount: number;
    grossUsdc: string;
    creatorUsdc: string;
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

export async function readMarketCreatorSalesSummary(
    accountId: string,
): Promise<MarketCreatorSalesSummary> {
    requireAccount(accountId);
    const value = await requestJson(`/v1/creators/${encodeURIComponent(accountId)}/sales-summary`);
    const watermark = parseWatermark(value.watermark);
    if (value.schema !== 'youtick.creator-sales-summary.v1'
        || value.creator_id !== accountId
        || !Number.isSafeInteger(value.sale_count) || Number(value.sale_count) < 0
        || typeof value.gross_usdc !== 'string' || !DECIMAL_PATTERN.test(value.gross_usdc)
        || typeof value.creator_usdc !== 'string' || !DECIMAL_PATTERN.test(value.creator_usdc)) {
        throw new Error('invalid_market_read_model_summary');
    }
    return {
        saleCount: Number(value.sale_count),
        grossUsdc: value.gross_usdc,
        creatorUsdc: value.creator_usdc,
        watermark,
    };
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
    if (page.schema !== schema
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
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
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
