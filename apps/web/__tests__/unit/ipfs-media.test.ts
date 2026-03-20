import { beforeEach, describe, expect, it, vi } from 'vitest';

const getGatewayUrlsMock = vi.fn();
const markGatewayUnhealthyByUrlMock = vi.fn();
const resolveGatewayUrlMock = vi.fn();

vi.mock('@/lib/crust', () => ({
  getGatewayUrls: getGatewayUrlsMock,
  markGatewayUnhealthyByUrl: markGatewayUnhealthyByUrlMock,
  resolveGatewayUrl: resolveGatewayUrlMock,
}));

describe('ipfs media helper', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    getGatewayUrlsMock.mockReturnValue([
      'https://ipfs.io/ipfs/QmPosterCid123456789012345678901234567890123456',
      'https://dweb.link/ipfs/QmPosterCid123456789012345678901234567890123456',
    ]);
    resolveGatewayUrlMock.mockResolvedValue('https://dweb.link/ipfs/QmPosterCid123456789012345678901234567890123456');
  });

  it('extracts CIDs from protocol and gateway URLs', async () => {
    const { extractIpfsCid } = await import('@/lib/ipfs-media');

    expect(extractIpfsCid('ipfs://QmPosterCid123456789012345678901234567890123456'))
      .toBe('QmPosterCid123456789012345678901234567890123456');
    expect(extractIpfsCid('https://ipfs.io/ipfs/QmPosterCid123456789012345678901234567890123456'))
      .toBe('QmPosterCid123456789012345678901234567890123456');
  });

  it('resolves and caches the best gateway per purpose', async () => {
    const { resolveIpfsMediaUrl } = await import('@/lib/ipfs-media');
    const input = 'ipfs://QmPosterCid123456789012345678901234567890123456';

    const first = await resolveIpfsMediaUrl(input, {
      sourceKey: input,
      purpose: 'image',
      timeoutMs: 200,
    });

    const second = await resolveIpfsMediaUrl(input, {
      sourceKey: input,
      purpose: 'image',
      timeoutMs: 200,
    });

    expect(first).toBe('https://dweb.link/ipfs/QmPosterCid123456789012345678901234567890123456');
    expect(second).toBe(first);
    expect(resolveGatewayUrlMock).toHaveBeenCalledTimes(1);
  });

  it('skips failed gateways when asking for the next fallback URL', async () => {
    const {
      getNextIpfsMediaUrl,
      rememberFailedIpfsMediaUrl,
    } = await import('@/lib/ipfs-media');
    const input = 'ipfs://QmPosterCid123456789012345678901234567890123456';

    rememberFailedIpfsMediaUrl('https://ipfs.io/ipfs/QmPosterCid123456789012345678901234567890123456', {
      input,
      sourceKey: input,
      purpose: 'image',
    });

    const nextUrl = getNextIpfsMediaUrl(input, {
      sourceKey: input,
      purpose: 'image',
    });

    expect(nextUrl).toBe('https://dweb.link/ipfs/QmPosterCid123456789012345678901234567890123456');
    expect(markGatewayUnhealthyByUrlMock).toHaveBeenCalledWith(
      'https://ipfs.io/ipfs/QmPosterCid123456789012345678901234567890123456',
    );
  });
});
