// Final-state reads for checkout through the app's own RPC endpoints (never the relayer).
import { withRpcFailover } from '../rpc-failover';

export async function readAccessKey(accountId: string, publicKey: string): Promise<{ nonce: bigint; blockHeight: bigint }> {
    const signal = AbortSignal.timeout(6_500);
    return withRpcFailover(async (rpcUrl) => {
        const response = await fetch(rpcUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
            body: JSON.stringify({ jsonrpc: '2.0', id: 'v2-access-key', method: 'query', params: {
                request_type: 'view_access_key', finality: 'final', account_id: accountId, public_key: publicKey,
            } }),
        });
        if (!response.ok) throw new Error(`near_view_http_${response.status}`);
        const payload = await response.json();
        const result = payload?.result;
        if (payload?.error || !result || !Number.isSafeInteger(result.nonce) || !Number.isSafeInteger(result.block_height)
            || result.permission !== 'FullAccess') {
            throw new Error('account_not_ready');
        }
        return { nonce: BigInt(result.nonce), blockHeight: BigInt(result.block_height) };
    }, 1);
}
