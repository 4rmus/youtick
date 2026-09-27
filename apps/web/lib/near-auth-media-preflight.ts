import { NEAR_AUTH_TESTNET_RPC } from './near-auth-lab';
import type { nearAuthAccountPreflight } from './near-auth-account-preflight';

export async function nearAuthMediaPreflight(account: Awaited<ReturnType<typeof nearAuthAccountPreflight>>, publicationId: string) {
    const market = process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID?.trim();
    if (!market || market.length > 64 || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(market)
        || process.env.NEXT_PUBLIC_NEAR_NETWORK !== 'testnet') throw new Error('media_not_configured');
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(publicationId)) throw new Error('invalid_publication');
    // The pilot keeps the same implicit account used in the completed signing test.
    if (!account.accounts.includes(account.implicitAccount)) throw new Error('account_required');
    const signal = AbortSignal.timeout(10_000);
    async function query(params: object, block?: string, blockHeight?: number) {
        const response = await fetch(NEAR_AUTH_TESTNET_RPC, { method: 'POST', cache: 'no-store', signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 'auth-lab-media', method: 'query',
                params: { ...params, ...(block ? { block_id: block } : { finality: 'final' }) } }),
        });
        if (!response.ok) throw new Error('media_unavailable');
        const body = await response.json();
        const result = body.result;
        if (body.error || !result || result.error !== undefined || typeof result.block_hash !== 'string'
            || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(result.block_hash)
            || !Number.isSafeInteger(result.block_height) || result.block_height <= 0
            || (block && (result.block_hash !== block || result.block_height !== blockHeight))) throw new Error('media_unavailable');
        return result;
    }
    const access = await query({ request_type: 'view_access_key', account_id: account.implicitAccount, public_key: account.publicKey });
    if (access.permission !== 'FullAccess') throw new Error('account_changed');
    const block = access.block_hash;
    const blockHeight = access.block_height;
    const contract = await query({ request_type: 'view_account', account_id: market }, block, blockHeight);
    if (typeof contract.code_hash !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(contract.code_hash)
        || contract.code_hash === '11111111111111111111111111111111') throw new Error('media_not_configured');
    async function view(method: string, args: object): Promise<unknown> {
        const value = await query({ request_type: 'call_function', account_id: market, method_name: method,
            args_base64: Buffer.from(JSON.stringify(args)).toString('base64') }, block, blockHeight);
        if (!Array.isArray(value.result) || value.result.length > 16_384
            || !value.result.every((byte: unknown) => typeof byte === 'number' && Number.isInteger(byte) && byte >= 0 && byte <= 255)) throw new Error('media_unavailable');
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(value.result)));
    }
    const [governance, publication, entitled] = await Promise.all([
        view('get_governance_state', {}), view('get_publication', { publication_id: publicationId }),
        view('has_entitlement', { account_id: account.implicitAccount, publication_id: publicationId }),
    ]);
    if (!governance || typeof governance !== 'object' || !('bridge_frozen' in governance)
        || typeof governance.bridge_frozen !== 'boolean' || typeof entitled !== 'boolean') throw new Error('media_unavailable');
    let availability: string | null = null;
    if (publication !== null) {
        if (!publication || typeof publication !== 'object' || !('publication_id' in publication)
            || publication.publication_id !== publicationId || !('availability' in publication)
            || typeof publication.availability !== 'string' || !['ACTIVE', 'SALES_SUSPENDED', 'TAKEDOWN'].includes(publication.availability)
            || !('generation' in publication) || publication.generation !== 1
            || !('playback_id' in publication) || typeof publication.playback_id !== 'string'
            || !/^[A-Za-z0-9_-]{6,128}$/.test(publication.playback_id)) throw new Error('media_unavailable');
        availability = publication.availability;
    }
    const reason = publication === null ? 'publication_missing' : availability === 'TAKEDOWN' ? 'takedown'
        : governance.bridge_frozen ? 'bridge_frozen' : !entitled ? 'entitlement_required' : 'entitled';
    return { accountId: account.implicitAccount, marketContractId: market, publicationId, blockHeight,
        availability, entitled, reason, playbackVerified: false as const };
}
