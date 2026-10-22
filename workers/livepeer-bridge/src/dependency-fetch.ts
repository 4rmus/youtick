// Studio keeps its livepeer_* labels so existing dashboards and log queries do not move;
// the provider-neutral media_* labels are for adapters added behind the MediaProvider seam.
export type DependencyLabel =
    | 'near_rpc'
    | 'livepeer_api'
    | 'livepeer_tus'
    | 'livepeer_media'
    | 'media_api'
    | 'media_tus'
    | 'media_cdn';

export async function dependencyFetch(
    dependency: DependencyLabel,
    operation: string,
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
): Promise<Response> {
    const startedAtMs = Date.now();
    try {
        const response = await fetch(input, init);
        logDependency(dependency, operation, response.status, startedAtMs);
        return response;
    } catch (error) {
        logDependency(dependency, operation, 0, startedAtMs);
        throw error;
    }
}

function logDependency(
    dependency: string,
    operation: string,
    httpCode: number,
    startedAtMs: number,
): void {
    console.info(JSON.stringify({
        event: 'dependency_request_completed',
        details: {
            dependency,
            operation,
            httpCode,
            latencyMs: Math.max(0, Date.now() - startedAtMs),
        },
    }));
}
