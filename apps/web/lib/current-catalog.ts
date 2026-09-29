import { APP_CONFIG, FEATURE_FLAGS, NEAR_CONFIG, NEAR_NETWORK } from '@/lib/constants';
import { parseLivepeerPublication, type LivepeerPublication } from '@/lib/livepeer-publication';

export type CurrentCatalogPage = {
    items: LivepeerPublication[];
    nextCursor: string | null;
    revision: string;
    staleAt: number;
    expiresAt: number;
};

export async function readCurrentCatalogPage(cursor: string | null, limit: number, creator?: string): Promise<CurrentCatalogPage> {
    if (!FEATURE_FLAGS.enableCurrentCatalog) throw new Error('current_catalog_disabled');
    if (!Number.isInteger(limit) || limit < 1 || limit > 50
        || (cursor !== null && !/^[A-Za-z0-9_-]{1,1024}$/.test(cursor))
        || (creator !== undefined && !/^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$/.test(creator))) throw new Error('invalid_catalog_request');
    const path = creator ? `/v2/creators/${encodeURIComponent(creator)}/publications` : '/v2/publications';
    const url = new URL(path, APP_CONFIG.marketReadModelUrl);
    url.searchParams.set('limit', String(limit));
    if (cursor) url.searchParams.set('cursor', cursor);
    const requestedAt = Date.now();
    const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(2500) });
    if (response.status === 409) throw new Error('catalog_changed');
    if (!response.ok) throw new Error('catalog_unavailable');
    const value = await response.json();
    const state = value?.catalog;
    if (value?.schema !== 'youtick.current-catalog.v1' || value.source !== 'current-state'
        || value.network !== NEAR_NETWORK || value.contract_id !== NEAR_CONFIG.marketContractId
        || state?.network !== NEAR_NETWORK || state?.contract_id !== NEAR_CONFIG.marketContractId
        || (creator !== undefined && value.creator_id !== creator)
        || !Number.isSafeInteger(state?.verified_block_height) || state.verified_block_height < 1
        || typeof state.verified_block_hash !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(state.verified_block_hash)
        || !Number.isSafeInteger(state.source_block_timestamp_ms) || state.source_block_timestamp_ms < 1
        || !Number.isSafeInteger(value.served_at_ms) || value.served_at_ms < 1
        || !Number.isSafeInteger(state.checked_at_ms) || state.checked_at_ms < 1
        || !Number.isSafeInteger(state.publication_count) || state.publication_count < 0 || state.publication_count > 48
        || typeof state.content_revision !== 'string' || !/^[a-f0-9]{64}$/.test(state.content_revision)
        || !Array.isArray(value.items) || value.items.length > limit
        || !(value.next_cursor === null || (typeof value.next_cursor === 'string' && /^[A-Za-z0-9_-]{1,1024}$/.test(value.next_cursor)))) {
        throw new Error('invalid_current_catalog');
    }
    const age = value.served_at_ms - state.source_block_timestamp_ms;
    if (age < -5000 || age > 180000 || value.freshness !== (age > 90000 ? 'stale' : 'fresh')) throw new Error('catalog_unavailable');
    const ids = new Set<string>();
    const items = value.items.map((item: Record<string, unknown>) => {
        if (typeof item?.publication_id !== 'string') throw new Error('invalid_current_catalog');
        const publication = parseLivepeerPublication(item, item.publication_id);
        if (ids.has(publication.publication_id) || (creator ? publication.creator_id !== creator : publication.availability !== 'ACTIVE')) {
            throw new Error('invalid_current_catalog');
        }
        ids.add(publication.publication_id);
        return publication;
    });
    return { items, nextCursor: value.next_cursor, revision: state.content_revision,
        staleAt: requestedAt + 90000 - Math.max(0, age), expiresAt: requestedAt + 180000 - Math.max(0, age) };
}

export function currentCatalogFreshness(pages: CurrentCatalogPage[] | undefined, now: number) {
    if (!pages?.length || pages.some(page => now > page.expiresAt)) return 'unavailable';
    return pages.some(page => now > page.staleAt) ? 'stale' : 'fresh';
}
