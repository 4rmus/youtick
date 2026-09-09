import { FailoverRpcProvider, JsonRpcProvider } from 'near-api-js';
import { getRpcEndpoints, withRpcFailover } from './rpc-failover';

export async function viewContract<T>(
    _provider: FailoverRpcProvider,
    contractId: string,
    methodName: string,
    args: Record<string, unknown> = {},
): Promise<T> {
    // The server read proxy has a 6s budget; include response delivery and abort the whole read.
    const signal = AbortSignal.timeout(6_500);
    return withRpcFailover(async (rpcUrl) => {
        const response = await fetch(rpcUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
            body: JSON.stringify({
                jsonrpc: '2.0', id: 'view-contract', method: 'query',
                params: {
                    request_type: 'call_function', account_id: contractId,
                    method_name: methodName,
                    args_base64: btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(args)))),
                    finality: 'final',
                },
            }),
        });
        if (!response.ok) throw new Error(`near_view_http_${response.status}`);
        const payload = await response.json();
        const bytes: unknown = payload?.result?.result;
        if (payload?.error || !Array.isArray(bytes) || bytes.length > 2 * 1024 * 1024
            || !bytes.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) {
            throw new Error('invalid_near_view_response');
        }
        return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as T;
    }, 1);
}

export function getProvider(): FailoverRpcProvider {
    return new FailoverRpcProvider(
        getRpcEndpoints().map((url) => new JsonRpcProvider({ url })),
    );
}
