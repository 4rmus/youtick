// Final-state reads from Market V2.
export type View = <T>(contractId: string, method: string, args: Record<string, unknown>) => Promise<T>;

export function rpcView(rpcUrl: string, fetcher: typeof fetch = (...args) => fetch(...args)): View {
    return async <T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T> => {
        let body: { result?: { result?: unknown }; error?: unknown } | null;
        try {
            const response = await fetcher(rpcUrl, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(6_000),
                body: JSON.stringify({ jsonrpc: '2.0', id: 'payment-service', method: 'query', params: {
                    request_type: 'call_function', finality: 'final', account_id: contractId, method_name: method,
                    args_base64: btoa(JSON.stringify(args)),
                } }),
            });
            body = response.ok ? await response.json() : null;
        } catch {
            throw new Error('rpc_unavailable');
        }
        const bytes = body?.result?.result;
        if (!body || body.error || !Array.isArray(bytes) || bytes.length > 64 * 1024) throw new Error('rpc_unavailable');
        return JSON.parse(new TextDecoder().decode(Uint8Array.from(bytes as number[]))) as T;
    };
}

export interface PublicationView {
    publication_id: string;
    price_usdc: string;
    availability: string;
}

export async function readPurchasablePublication(view: View, contractId: string, publicationId: string): Promise<bigint> {
    const publication = await view<PublicationView | null>(contractId, 'get_publication', { publication_id: publicationId });
    if (!publication || publication.publication_id !== publicationId) throw new Error('publication_not_found');
    if (publication.availability !== 'ACTIVE') throw new Error('publication_not_available');
    if (typeof publication.price_usdc !== 'string' || !/^[1-9][0-9]{0,30}$/.test(publication.price_usdc)) throw new Error('rpc_unavailable');
    return BigInt(publication.price_usdc);
}
