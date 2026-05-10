import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/crust/config', () => ({
  CRUST_CONSTANTS: {
    FETCH_TIMEOUT: 3_000,
    GATEWAY_UNHEALTHY_DURATION: 60_000,
    READ_ENDPOINT: 'https://crust-primary/api/v0/cat',
    READ_ENDPOINT_FALLBACK: 'https://crust-fallback/api/v0/cat',
    MEDIA_DELIVERY: { ENABLED: false, BASE_URL: '' },
  },
  CRUST_GATEWAYS: [
    { name: 'ipfs-io', url: 'https://ipfs.io/ipfs', priority: 1, healthy: true, lastCheck: 0 },
    { name: 'dweb', url: 'https://dweb.link/ipfs', priority: 2, healthy: true, lastCheck: 0 },
  ],
}));

describe('crust gateway probing', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('picks the fastest responsive gateway for video playback', async () => {
    global.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      const delay = url.includes('dweb.link') ? 10 : 40;

      return new Promise<Response>((resolve) => {
        setTimeout(() => resolve(new Response(null, { status: 206 })), delay);
      });
    }) as unknown as typeof fetch;

    const { resolveGatewayUrl } = await import('@/lib/crust/gateway');

    const url = await resolveGatewayUrl('QmVideoCid', {
      purpose: 'video',
      range: { start: 0, end: 65_535 },
      timeout: 200,
    });

    expect(url).toBe('https://dweb.link/ipfs/QmVideoCid');
  });

  it('requires partial-content support when probing range-based video playback', async () => {
    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes('ipfs.io')) {
        return new Response(null, { status: 200 });
      }

      return new Response(null, { status: 206 });
    }) as unknown as typeof fetch;

    const { resolveGatewayUrl } = await import('@/lib/crust/gateway');

    const url = await resolveGatewayUrl('QmVideoCid', {
      purpose: 'video',
      range: { start: 0, end: 65_535 },
      timeout: 200,
    });

    expect(url).toBe('https://dweb.link/ipfs/QmVideoCid');
  });

  it('reuses the last successful gateway for the same purpose', async () => {
    global.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input);
      const delay = url.includes('dweb.link') ? 10 : 50;

      return new Promise<Response>((resolve) => {
        setTimeout(() => resolve(new Response(null, { status: 206 })), delay);
      });
    }) as unknown as typeof fetch;

    const { resolveGatewayUrl } = await import('@/lib/crust/gateway');

    await resolveGatewayUrl('QmVideoCid', {
      purpose: 'video',
      range: { start: 0, end: 1_024 },
      timeout: 200,
    });

    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (!url.includes('dweb.link')) {
        throw new Error(`Unexpected gateway probe: ${url}`);
      }

      return new Response(null, { status: 206 });
    }) as unknown as typeof fetch;

    const reusedUrl = await resolveGatewayUrl('QmAnotherCid', {
      purpose: 'video',
      range: { start: 0, end: 1_024 },
      timeout: 200,
    });

    expect(reusedUrl).toBe('https://dweb.link/ipfs/QmAnotherCid');
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(0);
  });

  it('reuses the last successful read route for the same fetch purpose', async () => {
    global.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input);

      if (url.includes('crust-primary')) {
        return new Promise<Response>((resolve) => {
          setTimeout(() => resolve(new Response('slow', { status: 200 })), 700);
        });
      }

      if (url.includes('dweb.link')) {
        return new Promise<Response>((resolve) => {
          setTimeout(() => resolve(new Response('fast', { status: 200 })), 10);
        });
      }

      return Promise.reject(new Error(`Unexpected gateway ${url}`));
    }) as unknown as typeof fetch;

    const { fetchFromGateways } = await import('@/lib/crust/gateway');

    const first = await fetchFromGateways('QmVideoCid', {
      purpose: 'segment',
      timeout: 500,
    });

    expect(await first.text()).toBe('fast');

    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (!url.includes('dweb.link')) {
        throw new Error(`Unexpected follow-up gateway ${url}`);
      }

      return new Response('cached-fast', { status: 200 });
    }) as unknown as typeof fetch;

    const second = await fetchFromGateways('QmAnotherVideoCid', {
      purpose: 'segment',
      timeout: 500,
    });

    expect(await second.text()).toBe('cached-fast');
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
  });

  it('stops gateway reads when the caller aborts playback', async () => {
    global.fetch = vi.fn((_input: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        }, { once: true });
      });
    }) as unknown as typeof fetch;

    const { fetchFromGateways } = await import('@/lib/crust/gateway');
    const controller = new AbortController();
    const pending = fetchFromGateways('QmVideoCid', {
      timeout: 200,
      signal: controller.signal,
    });

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(vi.mocked(global.fetch).mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('builds public gateway URLs for IPFS path references', async () => {
    const { getGatewayUrl, getGatewayUrls } = await import('@/lib/crust/gateway');

    expect(getGatewayUrl('bafyroot/segments/000000.m4s')).toBe(
      'https://ipfs.io/ipfs/bafyroot/segments/000000.m4s',
    );
    expect(getGatewayUrls('ipfs://bafyroot/posters/main poster.webp')[0]).toBe(
      'https://ipfs.io/ipfs/bafyroot/posters/main%20poster.webp',
    );
  });

  it('encodes Crust read API args for IPFS path references', async () => {
    global.fetch = vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch;

    const { fetchFromGateways } = await import('@/lib/crust/gateway');
    const response = await fetchFromGateways('bafyroot/segments/000000.m4s', {
      purpose: 'segment',
      timeout: 500,
    });

    expect(await response.text()).toBe('ok');
    expect(vi.mocked(global.fetch).mock.calls[0][0]).toBe(
      'https://crust-primary/api/v0/cat?arg=bafyroot%2Fsegments%2F000000.m4s',
    );
  });

  it('uses the media delivery worker first when it is explicitly configured', async () => {
    vi.doMock('@/lib/crust/config', () => ({
      CRUST_CONSTANTS: {
        FETCH_TIMEOUT: 3_000,
        GATEWAY_UNHEALTHY_DURATION: 60_000,
        READ_ENDPOINT: 'https://crust-primary/api/v0/cat',
        READ_ENDPOINT_FALLBACK: 'https://crust-fallback/api/v0/cat',
        MEDIA_DELIVERY: { ENABLED: true, BASE_URL: 'https://media.youtick.net' },
      },
      CRUST_GATEWAYS: [
        { name: 'ipfs-io', url: 'https://ipfs.io/ipfs', priority: 1, healthy: true, lastCheck: 0 },
      ],
    }));
    global.fetch = vi.fn(async () => new Response('edge', { status: 200 })) as unknown as typeof fetch;

    const { fetchFromGateways } = await import('@/lib/crust/gateway');
    const response = await fetchFromGateways('bafyroot/manifest.json', {
      purpose: 'manifest',
      timeout: 500,
    });

    expect(await response.text()).toBe('edge');
    expect(vi.mocked(global.fetch).mock.calls[0][0]).toBe(
      'https://media.youtick.net/ipfs/bafyroot/manifest.json',
    );
  });
});
