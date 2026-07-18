type State = {
    kind: 'claim' | 'rate';
    count: number;
    expiresAt: number;
};

export function createAtomicNamespace(): DurableObjectNamespace {
    const values = new Map<string, State>();
    const ids = new WeakMap<object, string>();

    return {
        idFromName(name: string) {
            const id = { toString: () => name };
            ids.set(id, name);
            return id as unknown as DurableObjectId;
        },
        get(id: DurableObjectId) {
            const key = ids.get(id as unknown as object) || id.toString();
            return {
                async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
                    const request = new Request(input, init);
                    const path = new URL(request.url).pathname;
                    if (path === '/release') {
                        values.delete(key);
                        return Response.json({ ok: true });
                    }

                    const body = await request.json() as {
                        now: number;
                        ttlMs: number;
                        limit?: number;
                    };
                    const current = values.get(key);
                    if (path === '/claim') {
                        if (current && current.expiresAt > body.now) {
                            return Response.json({ ok: false });
                        }
                        values.set(key, {
                            kind: 'claim',
                            count: 1,
                            expiresAt: body.now + body.ttlMs,
                        });
                        return Response.json({ ok: true });
                    }

                    const count = current?.kind === 'rate' && current.expiresAt > body.now
                        ? current.count
                        : 0;
                    if (count >= (body.limit || 0)) {
                        return Response.json({ ok: false });
                    }
                    values.set(key, {
                        kind: 'rate',
                        count: count + 1,
                        expiresAt: body.now + body.ttlMs,
                    });
                    return Response.json({ ok: true });
                },
            } as unknown as DurableObjectStub;
        },
    } as unknown as DurableObjectNamespace;
}
