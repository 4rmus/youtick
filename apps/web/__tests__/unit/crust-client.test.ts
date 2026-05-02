import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRecordMetric = vi.fn();
vi.mock('@/lib/decentralization-metrics', () => ({
  recordMetric: (...args: unknown[]) => mockRecordMetric(...args),
}));

const mockGenerateW3AuthToken = vi.fn(async () => ({
  header: 'Basic dGVzdA==',
  accountId: 'test.near',
  createdAt: Date.now(),
  expiresAt: Date.now() + 30 * 60_000,
}));

vi.mock('@/lib/crust/w3auth', () => ({
  generateW3AuthToken: mockGenerateW3AuthToken,
}));

describe('crust client', () => {
  let responseStatus: number;
  let responseText: string;
  let openedUrl: string | null;
  let sentBody: XMLHttpRequestBodyInit | null;
  let requestHeaders: Record<string, string>;

  beforeEach(() => {
    vi.resetModules();
    mockRecordMetric.mockClear();
    mockGenerateW3AuthToken.mockClear();
    responseStatus = 200;
    responseText = [
      '{"Name":"manifest.json","Hash":"bafyManifest","Size":"64"}',
      '{"Name":"segments/000000.m4s","Hash":"bafySegment","Size":"8"}',
      '{"Name":"segments","Hash":"bafySegmentsDir","Size":"72"}',
      '{"Name":"","Hash":"bafyRoot","Size":"180"}',
    ].join('\n');
    openedUrl = null;
    sentBody = null;
    requestHeaders = {};

    class MockXMLHttpRequest extends EventTarget {
      status = responseStatus;
      responseText = responseText;
      upload = new EventTarget();

      open(_method: string, url: string) {
        openedUrl = url;
      }

      setRequestHeader(key: string, value: string) {
        requestHeaders[key] = value;
      }

      send(body: XMLHttpRequestBodyInit) {
        sentBody = body;
        queueMicrotask(() => this.dispatchEvent(new Event('load')));
      }

      abort() {
        this.dispatchEvent(new Event('abort'));
      }
    }

    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest);
  });

  it('uploads a directory and returns the root CID', async () => {
    const { uploadDirectoryToCrust } = await import('@/lib/crust/client');
    const result = await uploadDirectoryToCrust(
      [
        { path: 'manifest.json', file: new Blob(['{}'], { type: 'application/json' }) },
        { path: 'segments/000000.m4s', file: new Blob(['segment']) },
      ],
      'uploader.near',
    );

    expect(openedUrl).toBe('https://crustipfs.xyz/api/v0/add?wrap-with-directory=true&cid-version=1&pin=true');
    expect(requestHeaders.Authorization).toBe('Basic dGVzdA==');
    expect(result.cid).toBe('bafyRoot');
    expect(result.size).toBe(9);
    expect(result.entries.map((entry) => entry.path)).toEqual([
      'manifest.json',
      'segments/000000.m4s',
      'segments',
      '',
    ]);

    const uploadedNames = Array.from((sentBody as FormData).entries()).map(
      ([, value]) => (value as File).name,
    );
    expect(uploadedNames).toEqual(['manifest.json', 'segments/000000.m4s']);
  });
});
