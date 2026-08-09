const RPC_TIMEOUT_MS = 5_000;

export async function runNearFinalityProbe({
    rpcUrl,
    fetchImpl = fetch,
    now = () => Date.now(),
}) {
    const url = validRpcUrl(rpcUrl);
    const finalHeight = await readBlockHeight(url, 'final', fetchImpl);
    const optimisticHeight = await readBlockHeight(url, 'optimistic', fetchImpl);
    if (optimisticHeight < finalHeight) throw new Error('near_finality_probe_invalid');
    return {
        schema: 'youtick.near-finality-probe.v1',
        event: 'rpc_finality_observed',
        observed_at_ms: now(),
        final_block_height: String(finalHeight),
        optimistic_block_height: String(optimisticHeight),
        lag_blocks: optimisticHeight - finalHeight,
        rpc_calls: 2,
    };
}

async function readBlockHeight(url, finality, fetchImpl) {
    const id = `youtick-finality-${finality}`;
    let response;
    let payload;
    try {
        response = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id, method: 'block', params: { finality } }),
            signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
        });
        payload = await response.json();
    } catch {
        throw new Error('near_finality_probe_unavailable');
    }
    const height = payload?.result?.header?.height;
    if (!response.ok
        || payload?.jsonrpc !== '2.0'
        || payload?.id !== id
        || payload?.error
        || !Number.isSafeInteger(height)
        || height < 0) {
        throw new Error('near_finality_probe_invalid');
    }
    return height;
}

function validRpcUrl(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error('near_finality_probe_config_invalid');
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
        throw new Error('near_finality_probe_config_invalid');
    }
    return url;
}

if (import.meta.main) {
    console.log(JSON.stringify(await runNearFinalityProbe({ rpcUrl: process.env.NEAR_RPC_URL })));
}
