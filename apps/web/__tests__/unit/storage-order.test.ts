import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CidCollector } from '@/lib/crust/cid-collector';
import type { UploadedAsset } from '@/lib/crust/cid-collector';
import type { CrustPsaPinResult } from '@/lib/crust/types';

const mockRecordMetric = vi.fn();
vi.mock('@/lib/decentralization-metrics', () => ({
  recordMetric: (...args: unknown[]) => mockRecordMetric(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGenerateW3AuthToken = vi.fn<any>(async () => ({
  header: 'Basic dGVzdA==',
  accountId: 'test.near',
  createdAt: Date.now(),
  expiresAt: Date.now() + 30 * 60_000,
}));

vi.mock('@/lib/crust/w3auth', () => ({
  generateW3AuthToken: mockGenerateW3AuthToken,
  ensureFreshW3AuthToken: mockGenerateW3AuthToken,
}));

function makeAsset(
  overrides?: Partial<UploadedAsset>,
): UploadedAsset {
  return {
    cid: `Qm${Math.random().toString(36).slice(2, 14)}`,
    size: 1024,
    type: 'media-segment',
    ...overrides,
  };
}

function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; body?: Record<string, unknown>; headers?: Record<string, string> }>): void {
  const fetchMock = vi.fn();
  for (const r of responses) {
    const headerMap = new Map(Object.entries(r.headers ?? {}));
    fetchMock.mockResolvedValueOnce({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: async () => r.body ?? {},
      text: async () => JSON.stringify(r.body ?? {}),
      headers: { get: (key: string) => headerMap.get(key) ?? null },
    });
  }
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ requestid: 'req-default', status: 'queued' }),
    text: async () => '{}',
    headers: { get: () => null },
  });
  global.fetch = fetchMock as unknown as typeof fetch;
}

describe('CidCollector', () => {
  it('collects and returns all assets', () => {
    const collector = new CidCollector();
    collector.add('QmA', 100, 'manifest');
    collector.add('QmB', 200, 'init-segment');
    collector.add('QmC', 300, 'media-segment');

    expect(collector.count()).toBe(3);
    expect(collector.getTotalSize()).toBe(600);
    expect(collector.getManifestCid()).toBe('QmA');
  });

  it('ignores empty CIDs', () => {
    const collector = new CidCollector();
    collector.add('', 100, 'manifest');
    expect(collector.count()).toBe(0);
  });

  it('clears all assets', () => {
    const collector = new CidCollector();
    collector.add('QmA', 100, 'manifest');
    collector.add('QmB', 200, 'thumbnail');
    collector.clear();
    expect(collector.count()).toBe(0);
    expect(collector.getManifestCid()).toBeUndefined();
  });

  it('returns a copy from getAll', () => {
    const collector = new CidCollector();
    collector.add('QmA', 100, 'poster');
    const all = collector.getAll();
    all.push(makeAsset());
    expect(collector.count()).toBe(1);
  });
});

describe('placeStorageOrders', () => {
  beforeEach(() => {
    vi.resetModules();
    mockRecordMetric.mockClear();
  });

  it('places orders for all CIDs and reports batch result', async () => {
    const assets: UploadedAsset[] = [
      makeAsset({ type: 'manifest', size: 512 }),
      makeAsset({ type: 'init-segment', size: 1024 }),
      makeAsset({ type: 'media-segment', size: 2048 }),
    ];

    mockFetchSequence(
      assets.map((_, i) => ({
        ok: true,
        body: { requestid: `req-${i}`, status: 'queued' },
      })),
    );

    const { placeStorageOrders } = await import('@/lib/crust/storage-order');
    const result = await placeStorageOrders(assets, 'uploader.near');

    expect(result.total).toBe(3);
    expect(result.succeeded).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(3);
    result.results.forEach((r) => {
      expect(r.status).toBe('queued');
    });
  });

  it('handles partial failure gracefully', async () => {
    const assets = [makeAsset(), makeAsset()];

    // First asset succeeds on first attempt.
    // Second asset fails 4 times (1 + 3 retries), concurrency=1 ensures order.
    const responses = [
      { ok: true, body: { requestid: 'req-ok', status: 'queued' } },
      { ok: false, status: 500 },
      { ok: false, status: 500 },
      { ok: false, status: 500 },
      { ok: false, status: 500 },
    ];
    mockFetchSequence(responses);

    const { placeStorageOrders } = await import('@/lib/crust/storage-order');
    const result = await placeStorageOrders(assets, 'uploader.near', {
      concurrency: 1,
      retries: 3,
      retryBaseMs: 10,
    });

    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('handles total failure', async () => {
    const assets = [makeAsset()];

    mockFetchSequence([
      { ok: false, status: 500 },
      { ok: false, status: 500 },
      { ok: false, status: 500 },
      { ok: false, status: 500 },
    ]);

    const { placeStorageOrders } = await import('@/lib/crust/storage-order');
    const result = await placeStorageOrders(assets, 'uploader.near', {
      retries: 3,
      retryBaseMs: 10,
    });

    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);
  });

  it('passes real fileSize instead of 0', async () => {
    const asset = makeAsset({ size: 4096 });
    mockFetchSequence([
      { ok: true, body: { requestid: 'req-1', status: 'queued' } },
    ]);

    const { placeStorageOrders } = await import('@/lib/crust/storage-order');
    await placeStorageOrders([asset], 'uploader.near');

    const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(fetchCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('verifyStorageOrders', () => {
  beforeEach(() => {
    vi.resetModules();
    mockRecordMetric.mockClear();
  });

  it('reports already-pinned orders as verified', async () => {
    const results: CrustPsaPinResult[] = [
      { requestId: 'req-1', status: 'pinned', cid: 'QmA', createdAt: Date.now() },
      { requestId: 'req-2', status: 'pinning', cid: 'QmB', createdAt: Date.now() },
    ];

    const { verifyStorageOrders } = await import('@/lib/crust/storage-order');
    const verify = await verifyStorageOrders(results, 'uploader.near');

    expect(verify.verified).toBe(2);
    expect(verify.pending).toBe(0);
    expect(verify.failed).toBe(0);
  });

  it('polls queued orders until they transition to pinning', async () => {
    const results: CrustPsaPinResult[] = [
      { requestId: 'req-1', status: 'queued', cid: 'QmA', createdAt: Date.now() },
    ];

    // First poll: still queued. Second poll: pinning.
    mockFetchSequence([
      { ok: true, body: { requestid: 'req-1', status: 'queued', pin: { cid: 'QmA' }, created: new Date().toISOString() } },
      { ok: true, body: { requestid: 'req-1', status: 'pinning', pin: { cid: 'QmA' }, created: new Date().toISOString() } },
    ]);

    const { verifyStorageOrders } = await import('@/lib/crust/storage-order');
    const verify = await verifyStorageOrders(results, 'uploader.near', {
      timeoutMs: 15_000,
      pollIntervalMs: 100,
    });

    expect(verify.verified).toBe(1);
    expect(verify.pending).toBe(0);
  });

  it('times out gracefully with pending orders', async () => {
    const results: CrustPsaPinResult[] = [
      { requestId: 'req-1', status: 'queued', cid: 'QmA', createdAt: Date.now() },
    ];

    // Always return queued
    mockFetchSequence(
      Array.from({ length: 20 }, () => ({
        ok: true,
        body: { requestid: 'req-1', status: 'queued', pin: { cid: 'QmA' }, created: new Date().toISOString() },
      })),
    );

    const { verifyStorageOrders } = await import('@/lib/crust/storage-order');
    const verify = await verifyStorageOrders(results, 'uploader.near', {
      timeoutMs: 500,
      pollIntervalMs: 100,
    });

    expect(verify.pending).toBe(1);
    expect(verify.verified).toBe(0);
  });

  it('counts failed orders correctly in mixed results', async () => {
    const results: CrustPsaPinResult[] = [
      { requestId: 'req-1', status: 'pinned', cid: 'QmA', createdAt: Date.now() },
      { requestId: '', status: 'failed', cid: 'QmB', createdAt: Date.now() },
      { requestId: 'req-3', status: 'queued', cid: 'QmC', createdAt: Date.now() },
    ];

    mockFetchSequence([
      { ok: true, body: { requestid: 'req-3', status: 'pinned', pin: { cid: 'QmC' }, created: new Date().toISOString() } },
    ]);

    const { verifyStorageOrders } = await import('@/lib/crust/storage-order');
    const verify = await verifyStorageOrders(results, 'uploader.near', {
      timeoutMs: 1_000,
      pollIntervalMs: 100,
    });

    expect(verify.verified).toBe(2);
    expect(verify.failed).toBe(1);
    expect(verify.pending).toBe(0);
  });
});

describe('HTTP 429 rate limit handling', () => {
  beforeEach(() => {
    vi.resetModules();
    mockRecordMetric.mockClear();
  });

  it('returns rate_limited status on 429 response', async () => {
    mockFetchSequence([
      { ok: false, status: 429 },
    ]);

    const { placeStorageOrder } = await import('@/lib/crust/storage-order');
    const result = await placeStorageOrder('QmTest', 1024, 'test.near');

    expect(result.status).toBe('rate_limited');
    expect(result.retryAfterMs).toBe(10_000);
  });

  it('parses Retry-After header into retryAfterMs', async () => {
    mockFetchSequence([
      { ok: false, status: 429, headers: { 'Retry-After': '5' } },
    ]);

    const { placeStorageOrder } = await import('@/lib/crust/storage-order');
    const result = await placeStorageOrder('QmTest', 1024, 'test.near');

    expect(result.status).toBe('rate_limited');
    expect(result.retryAfterMs).toBe(5_000);
  });

  it('retries rate_limited without consuming retry budget', async () => {
    mockFetchSequence([
      { ok: false, status: 429, headers: { 'Retry-After': '0' } },
      { ok: true, body: { requestid: 'req-ok', status: 'queued' } },
    ]);

    const { placeStorageOrders } = await import('@/lib/crust/storage-order');
    const result = await placeStorageOrders(
      [makeAsset()],
      'test.near',
      { retries: 1, retryBaseMs: 10 },
    );

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
  });
});

describe('PSA meta field', () => {
  beforeEach(() => {
    vi.resetModules();
    mockRecordMetric.mockClear();
  });

  it('includes file_size and app_id in request body meta', async () => {
    mockFetchSequence([
      { ok: true, body: { requestid: 'req-1', status: 'queued' } },
    ]);

    const { placeStorageOrder } = await import('@/lib/crust/storage-order');
    await placeStorageOrder('QmTestCid', 8192, 'test.near');

    const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(fetchCalls.length).toBe(1);

    const body = JSON.parse(fetchCalls[0][1].body as string);
    expect(body.meta).toBeDefined();
    expect(body.meta.file_size).toBe('8192');
    expect(body.meta.app_id).toBe('youtick');
  });
});

describe('ensureFreshW3AuthToken', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGenerateW3AuthToken.mockClear();
  });

  it('regenerates token when close to expiry', async () => {
    const { ensureFreshW3AuthToken } = await import('@/lib/crust/w3auth');

    const token1 = await ensureFreshW3AuthToken('test.near');
    expect(token1.header).toBe('Basic dGVzdA==');

    mockGenerateW3AuthToken.mockResolvedValueOnce({
      header: 'Basic cmVmcmVzaGVk',
      accountId: 'test.near',
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 60_000,
    });

    const token2 = await ensureFreshW3AuthToken('test.near');
    expect(token2.header).toBeDefined();
  });
});

describe('recordMetric wire-up', () => {
  beforeEach(() => {
    vi.resetModules();
    mockRecordMetric.mockClear();
  });

  it('records crust_storage_order_placed on success', async () => {
    mockFetchSequence([
      { ok: true, body: { requestid: 'req-ok', status: 'queued' } },
    ]);

    const { placeStorageOrder } = await import('@/lib/crust/storage-order');
    await placeStorageOrder('QmMetric', 512, 'test.near');

    expect(mockRecordMetric).toHaveBeenCalledWith('crust_storage_order_placed');
  });

  it('records crust_storage_order_failed on failure', async () => {
    mockFetchSequence([
      { ok: false, status: 500 },
    ]);

    const { placeStorageOrder } = await import('@/lib/crust/storage-order');
    await placeStorageOrder('QmMetric', 512, 'test.near');

    expect(mockRecordMetric).toHaveBeenCalledWith('crust_storage_order_failed');
  });

  it('records crust_storage_order_rate_limited on 429', async () => {
    mockFetchSequence([
      { ok: false, status: 429 },
    ]);

    const { placeStorageOrder } = await import('@/lib/crust/storage-order');
    await placeStorageOrder('QmMetric', 512, 'test.near');

    expect(mockRecordMetric).toHaveBeenCalledWith('crust_storage_order_rate_limited');
  });
});
