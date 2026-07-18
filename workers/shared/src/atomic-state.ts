type ClaimRecord = {
    kind: 'claim';
    expiresAt: number;
};

type RateRecord = {
    kind: 'rate';
    count: number;
    expiresAt: number;
};

type AtomicRecord = ClaimRecord | RateRecord;

type AtomicResult = {
    ok: boolean;
    retryAfterMs?: number;
};

/**
 * One Durable Object instance is selected per logical key. Cloudflare's input
 * gate and storage transaction make claim/rate decisions single-writer even
 * when requests arrive concurrently from different regions.
 */
export class AtomicState {
    constructor(private readonly state: DurableObjectState) {}

    async fetch(request: Request): Promise<Response> {
        const path = new URL(request.url).pathname;
        if (request.method !== 'POST') {
            return Response.json({ ok: false }, { status: 405 });
        }

        if (path === '/release') {
            await this.state.storage.deleteAll();
            await this.state.storage.deleteAlarm();
            return Response.json({ ok: true });
        }

        const input = await request.json<{
            now: number;
            ttlMs: number;
            limit?: number;
        }>();
        if (!Number.isFinite(input.now) || !Number.isFinite(input.ttlMs) || input.ttlMs <= 0) {
            return Response.json({ ok: false }, { status: 400 });
        }

        const result = await this.state.storage.transaction(async (storage) => {
            const current = await storage.get<AtomicRecord>('state');
            const expiresAt = input.now + input.ttlMs;

            if (path === '/claim') {
                if (current && current.expiresAt > input.now) {
                    return {
                        ok: false,
                        retryAfterMs: current.expiresAt - input.now,
                    } satisfies AtomicResult;
                }
                await storage.put<ClaimRecord>('state', { kind: 'claim', expiresAt });
                return { ok: true } satisfies AtomicResult;
            }

            if (path === '/rate') {
                const limit = input.limit;
                if (!Number.isInteger(limit) || (limit ?? 0) <= 0) {
                    return { ok: false } satisfies AtomicResult;
                }
                const count = current?.kind === 'rate' && current.expiresAt > input.now
                    ? current.count
                    : 0;
                if (count >= limit!) {
                    return {
                        ok: false,
                        retryAfterMs: Math.max(1, current!.expiresAt - input.now),
                    } satisfies AtomicResult;
                }
                await storage.put<RateRecord>('state', {
                    kind: 'rate',
                    count: count + 1,
                    expiresAt,
                });
                return { ok: true } satisfies AtomicResult;
            }

            return { ok: false } satisfies AtomicResult;
        });

        if (result.ok) {
            await this.state.storage.setAlarm(input.now + input.ttlMs);
        }
        return Response.json(result);
    }

    async alarm(): Promise<void> {
        await this.state.storage.deleteAll();
    }
}

async function callAtomic(
    namespace: DurableObjectNamespace,
    key: string,
    path: '/claim' | '/rate' | '/release',
    body: Record<string, number> = {},
): Promise<AtomicResult> {
    const stub = namespace.get(namespace.idFromName(key));
    const response = await stub.fetch(`https://atomic.invalid${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`Atomic state request failed: ${response.status}`);
    }
    return response.json<AtomicResult>();
}

export function claimOnce(
    namespace: DurableObjectNamespace,
    key: string,
    ttlMs: number,
): Promise<AtomicResult> {
    return callAtomic(namespace, key, '/claim', { now: Date.now(), ttlMs });
}

export function incrementWithinLimit(
    namespace: DurableObjectNamespace,
    key: string,
    limit: number,
    ttlMs: number,
): Promise<AtomicResult> {
    return callAtomic(namespace, key, '/rate', { now: Date.now(), ttlMs, limit });
}

export async function releaseClaim(
    namespace: DurableObjectNamespace,
    key: string,
): Promise<void> {
    await callAtomic(namespace, key, '/release');
}
