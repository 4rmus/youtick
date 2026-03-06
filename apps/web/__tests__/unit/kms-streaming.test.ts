import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoManifest } from '@/lib/kms/encryption';

vi.mock('@/lib/crust/config', () => ({
  CRUST_CONSTANTS: {
    FETCH_TIMEOUT: 1000,
    READ_ENDPOINT: 'https://crust-primary/api/v0/cat',
    READ_ENDPOINT_FALLBACK: 'https://crust-fallback/api/v0/cat',
  },
  CRUST_GATEWAYS: [
    { name: 'ipfs-io', url: 'https://ipfs.io/ipfs', priority: 1, healthy: true, lastCheck: 0 },
    { name: 'dweb', url: 'https://dweb.link/ipfs', priority: 2, healthy: true, lastCheck: 0 },
  ],
}));

vi.mock('@/lib/kms/encryption', () => ({
  decryptChunk: vi.fn(async (encryptedData: Uint8Array) => encryptedData),
  decryptFull: vi.fn(async (encryptedData: Uint8Array) => encryptedData),
}));

import { createDecryptedBlobUrl, streamKmsVideo } from '@/lib/kms/streaming';
import { decryptChunk, decryptFull } from '@/lib/kms/encryption';

const manifestTwoChunks: VideoManifest = {
  totalChunks: 2,
  originalSize: 8,
  chunkSize: 4,
  counterB64: 'counter',
  contentType: 'video/mp4',
};

const manifestThreeChunks: VideoManifest = {
  totalChunks: 3,
  originalSize: 12,
  chunkSize: 4,
  counterB64: 'counter',
  contentType: 'video/mp4',
};

const manifestSingleChunk: VideoManifest = {
  totalChunks: 1,
  originalSize: 4,
  chunkSize: 4,
  counterB64: 'counter',
  contentType: 'video/mp4',
};

describe('kms/streaming gateway fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:mock-url'),
    });

    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  it('falls back to next gateway when primary gateway times out', async () => {
    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const range = (init?.headers as { Range?: string } | undefined)?.Range;

      if (url.startsWith('https://ipfs.io/ipfs/') && range === 'bytes=0-3') {
        return new Response('timeout', { status: 504 });
      }

      if (url.startsWith('https://dweb.link/ipfs/') && range === 'bytes=0-3') {
        return new Response(Uint8Array.from([1, 2, 3, 4]), { status: 206 });
      }

      if (url.startsWith('https://dweb.link/ipfs/') && range === 'bytes=4-7') {
        return new Response(Uint8Array.from([5, 6, 7, 8]), { status: 206 });
      }

      throw new Error(`Unexpected fetch: ${url} (${range ?? 'no-range'})`);
    }) as unknown as typeof fetch;

    const blobUrl = await createDecryptedBlobUrl('QmVideoCid', 'aes-key', manifestTwoChunks);

    expect(blobUrl).toBe('blob:mock-url');
    expect(vi.mocked(decryptChunk)).toHaveBeenCalledTimes(2);

    const calls = vi.mocked(global.fetch).mock.calls.map((call) => String(call[0]));
    expect(calls[0]).toContain('https://ipfs.io/ipfs/QmVideoCid');
    expect(calls[1]).toContain('https://dweb.link/ipfs/QmVideoCid');
  });

  it('falls back to full download when gateways ignore range requests', async () => {
    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const range = (init?.headers as { Range?: string } | undefined)?.Range;

      if (range) {
        return new Response(Uint8Array.from([9, 9, 9, 9]), { status: 200 });
      }

      if (url.startsWith('https://ipfs.io/ipfs/')) {
        return new Response(Uint8Array.from([1, 2, 3, 4]), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url} (${range ?? 'no-range'})`);
    }) as unknown as typeof fetch;

    const onSourceUpdate = vi.fn();
    const onError = vi.fn();

    await streamKmsVideo('QmVideoCid', 'aes-key', manifestThreeChunks, {
      onSourceUpdate,
      onError,
    });

    expect(onSourceUpdate).toHaveBeenCalledWith('blob:mock-url');
    expect(onError).not.toHaveBeenCalled();
    expect(vi.mocked(decryptFull)).toHaveBeenCalledTimes(1);
  });

  it('falls back to Crust API when public gateways fail full download', async () => {
    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method;

      if (url.startsWith('https://ipfs.io/ipfs/')) {
        return new Response('down', { status: 504 });
      }

      if (url.startsWith('https://dweb.link/ipfs/')) {
        return new Response('down', { status: 504 });
      }

      if (url.startsWith('https://crust-primary/api/v0/cat?arg=') && method === 'POST') {
        return new Response(Uint8Array.from([1, 2, 3, 4]), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url} (${method ?? 'GET'})`);
    }) as unknown as typeof fetch;

    const blobUrl = await createDecryptedBlobUrl('QmVideoCid', 'aes-key', manifestSingleChunk);

    expect(blobUrl).toBe('blob:mock-url');
    expect(vi.mocked(decryptChunk)).toHaveBeenCalledTimes(1);

    const postCalls = vi.mocked(global.fetch).mock.calls.filter(
      (call) => String(call[0]).includes('/api/v0/cat?arg=') && call[1]?.method === 'POST',
    );
    expect(postCalls.length).toBe(1);
  });
});
