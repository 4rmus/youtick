import { FailoverRpcProvider, JsonRpcProvider } from 'near-api-js';
import { getRpcEndpoints, withRpcFailover } from './rpc-failover';

export async function viewContract<T>(
    _provider: FailoverRpcProvider,
    contractId: string,
    methodName: string,
    args: Record<string, unknown> = {},
): Promise<T> {
    return withRpcFailover(async (rpcUrl) => {
        const provider = new JsonRpcProvider({ url: rpcUrl });
        const result = await provider.query({
            request_type: 'call_function',
            account_id: contractId,
            method_name: methodName,
            args_base64: btoa(JSON.stringify(args)),
            finality: 'final',
        }) as { result: number[] };
        return JSON.parse(String.fromCharCode(...result.result)) as T;
    });
}

export function getProvider(): FailoverRpcProvider {
    return new FailoverRpcProvider(
        getRpcEndpoints().map((url) => new JsonRpcProvider({ url })),
    );
}
