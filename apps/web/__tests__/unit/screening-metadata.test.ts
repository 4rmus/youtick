import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock('@/app/api/near-rpc/proxy', () => ({ handleNearRpcRequest: rpc.handle }));
vi.mock('@/lib/constants', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/constants')>();
    return {
        ...actual,
        NEAR_CONFIG: { ...actual.NEAR_CONFIG, marketContractId: 'market.testnet' },
        APP_CONFIG: { ...actual.APP_CONFIG, livepeerBridgeUrl: 'https://bridge.youtick.test' },
    };
});

import { GENERIC_SCREENING_METADATA, screeningMetadata } from '@/app/s/[id]/screening-metadata';

const PUBLICATION = {
    publication_id: 'job-001', creator_id: 'kule.testnet', title: 'Gece Yarısı Provası', price_usdc: '12000000',
    generation: 2, playback_id: 'abcd1234efgh5678', availability: 'ACTIVE', published_at_ms: 1,
};

function rpcResponse(value: unknown, status = 200) {
    const bytes = Array.from(new TextEncoder().encode(JSON.stringify(value)));
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 'x', result: { result: bytes } }), { status });
}

describe('screening metadata', () => {
    afterEach(() => rpc.handle.mockReset());

    it('uses the publication title, creator, price and cover', async () => {
        rpc.handle.mockResolvedValue(rpcResponse(PUBLICATION));
        const metadata = await screeningMetadata('job-001', '203.0.113.9');
        expect(metadata.title).toBe('Gece Yarısı Provası');
        expect(metadata.description).toBe('kule.testnet · 12 USDC');
        expect(metadata.openGraph?.images).toEqual([{ url: 'https://bridge.youtick.test/v1/publication-covers/job-001/2' }]);
        expect(metadata.alternates?.canonical).toBe('/s/job-001');
    });

    it('reads through the proxy with the requester IP, a read-only query and a short timeout', async () => {
        rpc.handle.mockResolvedValue(rpcResponse(PUBLICATION));
        await screeningMetadata('job-001', '203.0.113.9');
        const [request, mode] = rpc.handle.mock.calls[0] as [Request, string];
        expect(mode).toBe('read');
        expect(request.headers.get('cf-connecting-ip')).toBe('203.0.113.9');
        const body = await request.json();
        expect(body.method).toBe('query');
        expect(body.params).toMatchObject({ request_type: 'call_function', account_id: 'market.testnet', method_name: 'get_publication' });
        expect(JSON.parse(atob(body.params.args_base64))).toEqual({ publication_id: 'job-001' });
        expect(request.signal).toBeDefined();
    });

    it.each([
        ['missing publication', () => rpcResponse(null)],
        ['rate limited', () => new Response('{}', { status: 429 })],
        ['invalid publication', () => rpcResponse({ ...PUBLICATION, publication_id: 'other' })],
        ['malformed payload', () => new Response('not json')],
    ])('falls back to generic metadata when the read is a %s', async (_label, response) => {
        rpc.handle.mockResolvedValue(response());
        await expect(screeningMetadata('job-001', null)).resolves.toBe(GENERIC_SCREENING_METADATA);
    });

    it('falls back when the proxy throws or times out', async () => {
        rpc.handle.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
        await expect(screeningMetadata('job-001', null)).resolves.toBe(GENERIC_SCREENING_METADATA);
    });
});
