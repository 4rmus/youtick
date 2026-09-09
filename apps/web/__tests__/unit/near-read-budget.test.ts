import { afterEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ run: vi.fn(async (fn: (url: string) => Promise<unknown>) => fn('https://app.test/api/near-rpc')) }));
vi.mock('@/lib/rpc-failover', () => ({
    withRpcFailover: route.run,
    getRpcEndpoints: () => ['https://app.test/api/near-rpc'],
}));
import { getProvider, viewContract } from '@/lib/near';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); route.run.mockClear(); });
const rpcResponse = (value: unknown) => Response.json({ result: { result: [...new TextEncoder().encode(JSON.stringify(value))] } });

describe('bounded contract reads', () => {
    it('uses one read-only FINAL query and preserves Unicode arguments/results', async () => {
        const fetchMock = vi.fn().mockResolvedValue(rpcResponse({ title: 'İstanbul 🎬' }));
        vi.stubGlobal('fetch', fetchMock);
        const provider = getProvider();
        await expect(viewContract(provider, 'market.testnet', 'get_publication', { title: 'İstanbul 🎬' })).resolves.toEqual({ title: 'İstanbul 🎬' });
        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://app.test/api/near-rpc');
        expect(init.signal).toBeInstanceOf(AbortSignal);
        const body = JSON.parse(init.body);
        expect(body.method).toBe('query');
        expect(body.params).toMatchObject({ request_type: 'call_function', finality: 'final', account_id: 'market.testnet' });
        expect(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body.params.args_base64), char => char.charCodeAt(0))))).toEqual({ title: 'İstanbul 🎬' });
        expect(route.run).toHaveBeenCalledWith(expect.any(Function), 1);
        expect(provider.query).not.toHaveBeenCalled();
    });

    it('rejects 503 immediately without SDK or application retries', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
        vi.stubGlobal('fetch', fetchMock);
        await expect(viewContract(getProvider(), 'market.testnet', 'get_publications_count')).rejects.toThrow('near_view_http_503');
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('aborts a hung network request at the shared 6500ms deadline', async () => {
        vi.useFakeTimers();
        vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
            const controller = new AbortController();
            setTimeout(() => controller.abort(new Error('deadline')), ms);
            return controller.signal;
        });
        let signal: AbortSignal | undefined;
        const fetchMock = vi.fn((_url, init) => new Promise((_resolve, reject) => {
            signal = init.signal;
            signal!.addEventListener('abort', () => reject(signal!.reason), { once: true });
        }));
        vi.stubGlobal('fetch', fetchMock);
        const rejected = expect(viewContract(getProvider(), 'market.testnet', 'get_publications_count')).rejects.toThrow('deadline');
        await vi.advanceTimersByTimeAsync(6499);
        expect(signal!.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await rejected;
        expect(signal!.aborted).toBe(true);
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(AbortSignal.timeout).toHaveBeenCalledWith(6500);
    });

    it('rejects RPC errors and malformed byte payloads without returning false authority', async () => {
        for (const payload of [
            { error: { message: 'private upstream detail' }, result: { result: [102, 97, 108, 115, 101] } },
            { result: { result: [-1] } }, { result: { result: [256] } },
            { result: { result: ['123'] } }, {},
        ]) {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)));
            await expect(viewContract(getProvider(), 'market.testnet', 'has_entitlement')).rejects.toThrow('invalid_near_view_response');
        }
    });
});
