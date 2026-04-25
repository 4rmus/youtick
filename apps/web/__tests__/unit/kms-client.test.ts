import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupMockSessionKey } from '../setup';
import { splitSecretIntoShares } from '@/lib/kms/shares';

vi.mock('@/lib/registry', () => ({
  listActiveDecryptionOperators: vi.fn(async () => []),
  getThresholdConfig: vi.fn(async () => null),
}));

async function waitForAssertion(assertion: () => void): Promise<void> {
  const deadline = Date.now() + 500;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  throw lastError;
}

describe('kms/client', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
    process.env.NEXT_PUBLIC_NFT_CONTRACT_ID = 'app-contract.testnet';
    process.env[`NEXT_PUBLIC_${'KMS_URL'}`] = 'https://ignored-kms.example.workers.dev';
  });

  it('throws RETRIEVE_FAILED when KMS operators are pointed at a different contract', async () => {
    const registry = await import('@/lib/registry');
    vi.mocked(registry.listActiveDecryptionOperators).mockResolvedValue([
      {
        account_id: 'kms-a.testnet',
        endpoint: 'https://kms-a.example.workers.dev',
        transport_public_key: 'pk-a',
        kind: 'DecryptionOperator',
        active: true,
      },
      {
        account_id: 'kms-b.testnet',
        endpoint: 'https://kms-b.example.workers.dev',
        transport_public_key: 'pk-b',
        kind: 'DecryptionOperator',
        active: true,
      },
    ]);
    vi.mocked(registry.getThresholdConfig).mockResolvedValue({
      total_operators: 2,
      required_shares: 2,
    });

    setupMockSessionKey('alice.testnet');

    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            network: 'testnet',
            contract: 'other-contract.testnet',
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const { retrieveEncryptionKey } = await import('@/lib/kms/client');

    await expect(
      retrieveEncryptionKey('8697ef30-45fc-4b0e-8801-bd65e6faffe5', 'alice.testnet', {
        signMessage: vi.fn(),
      } as never),
    ).rejects.toMatchObject({
      name: 'KMSError',
      code: 'RETRIEVE_FAILED',
    });
  });

  it('ignores legacy KMS env fallback when no registry operators are registered', async () => {
    const registry = await import('@/lib/registry');
    vi.mocked(registry.listActiveDecryptionOperators).mockResolvedValue([]);
    vi.mocked(registry.getThresholdConfig).mockResolvedValue(null);
    global.fetch = vi.fn() as unknown as typeof fetch;

    const { retrieveEncryptionKey } = await import('@/lib/kms/client');

    await expect(
      retrieveEncryptionKey('video-1', 'alice.testnet', {
        signMessage: vi.fn(),
      } as never),
    ).rejects.toMatchObject({
      name: 'KMSError',
      code: 'RETRIEVE_FAILED',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('stores operator shares in parallel when registry-backed KMS is active', async () => {
    const registry = await import('@/lib/registry');
    vi.mocked(registry.listActiveDecryptionOperators).mockResolvedValue([
      {
        account_id: 'kms-a.testnet',
        endpoint: 'https://kms-a.example.workers.dev',
        transport_public_key: 'pk-a',
        kind: 'DecryptionOperator',
        active: true,
      },
      {
        account_id: 'kms-b.testnet',
        endpoint: 'https://kms-b.example.workers.dev',
        transport_public_key: 'pk-b',
        kind: 'DecryptionOperator',
        active: true,
      },
    ]);
    vi.mocked(registry.getThresholdConfig).mockResolvedValue({
      total_operators: 2,
      required_shares: 2,
    });

    setupMockSessionKey('alice.testnet');

    const storeCalls: string[] = [];
    let resolveA!: (value: Response) => void;
    let resolveB!: (value: Response) => void;
    const pendingA = new Promise<Response>((resolve) => {
      resolveA = resolve;
    });
    const pendingB = new Promise<Response>((resolve) => {
      resolveB = resolve;
    });

    global.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input);

      if (url === 'https://kms-a.example.workers.dev/health' || url === 'https://kms-b.example.workers.dev/health') {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          data: {
            network: 'testnet',
            contract: 'app-contract.testnet',
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }

      if (url === 'https://kms-a.example.workers.dev/store') {
        storeCalls.push('kms-a');
        return pendingA;
      }

      if (url === 'https://kms-b.example.workers.dev/store') {
        storeCalls.push('kms-b');
        return pendingB;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const { clearKmsOperatorStats, storeEncryptionKey } = await import('@/lib/kms/client');
    clearKmsOperatorStats();

    const storePromise = storeEncryptionKey(
      'video-1',
      Buffer.from('encrypted-key').toString('base64'),
      'alice.testnet',
      {
        signMessage: vi.fn(),
        signAndSendTransaction: vi.fn(),
      } as never,
    );

    await waitForAssertion(() => {
      expect(storeCalls).toHaveLength(2);
    });
    expect(storeCalls).toEqual(expect.arrayContaining(['kms-a', 'kms-b']));

    const successResponse = new Response(JSON.stringify({
      ok: true,
      data: {
        videoId: 'video-1',
        stored: true,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    resolveA(successResponse.clone());
    resolveB(successResponse);

    await expect(storePromise).resolves.toEqual({
      videoId: 'video-1',
      stored: true,
    });
  });

  it('starts with the fastest operator batch before fanning out to the full set', async () => {
    const registry = await import('@/lib/registry');
    vi.mocked(registry.listActiveDecryptionOperators).mockResolvedValue([
      {
        account_id: 'kms-a.testnet',
        endpoint: 'https://kms-a.example.workers.dev',
        transport_public_key: 'pk-a',
        kind: 'DecryptionOperator',
        active: true,
      },
      {
        account_id: 'kms-b.testnet',
        endpoint: 'https://kms-b.example.workers.dev',
        transport_public_key: 'pk-b',
        kind: 'DecryptionOperator',
        active: true,
      },
      {
        account_id: 'kms-c.testnet',
        endpoint: 'https://kms-c.example.workers.dev',
        transport_public_key: 'pk-c',
        kind: 'DecryptionOperator',
        active: true,
      },
      {
        account_id: 'kms-d.testnet',
        endpoint: 'https://kms-d.example.workers.dev',
        transport_public_key: 'pk-d',
        kind: 'DecryptionOperator',
        active: true,
      },
      {
        account_id: 'kms-e.testnet',
        endpoint: 'https://kms-e.example.workers.dev',
        transport_public_key: 'pk-e',
        kind: 'DecryptionOperator',
        active: true,
      },
    ]);
    vi.mocked(registry.getThresholdConfig).mockResolvedValue({
      total_operators: 5,
      required_shares: 2,
    });

    setupMockSessionKey('alice.testnet');

    const secretB64 = Buffer.from('super-secret-key').toString('base64');
    const shares = splitSecretIntoShares(secretB64, 5, 2);
    const retrieveCalls: string[] = [];
    let resolveB!: (value: Response) => void;
    let resolveC!: (value: Response) => void;
    let resolveD!: (value: Response) => void;
    const pendingB = new Promise<Response>((resolve) => {
      resolveB = resolve;
    });
    const pendingC = new Promise<Response>((resolve) => {
      resolveC = resolve;
    });
    const pendingD = new Promise<Response>((resolve) => {
      resolveD = resolve;
    });

    global.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith('/health')) {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          data: {
            network: 'testnet',
            contract: 'app-contract.testnet',
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }

      if (url === 'https://kms-b.example.workers.dev/retrieve') {
        retrieveCalls.push('kms-b');
        return pendingB;
      }

      if (url === 'https://kms-c.example.workers.dev/retrieve') {
        retrieveCalls.push('kms-c');
        return pendingC;
      }

      if (url === 'https://kms-d.example.workers.dev/retrieve') {
        retrieveCalls.push('kms-d');
        return pendingD;
      }

      if (url.endsWith('/retrieve')) {
        retrieveCalls.push(url);
        throw new Error(`Unexpected retrieve fanout: ${url}`);
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const { clearKmsOperatorStats, retrieveEncryptionKey } = await import('@/lib/kms/client');
    clearKmsOperatorStats();
    localStorage.setItem('youtick:kms-operator-stats:v1', JSON.stringify({
      'https://kms-a.example.workers.dev': { avgLatencyMs: 900 },
      'https://kms-b.example.workers.dev': { avgLatencyMs: 35 },
      'https://kms-c.example.workers.dev': { avgLatencyMs: 40 },
      'https://kms-d.example.workers.dev': { avgLatencyMs: 55 },
      'https://kms-e.example.workers.dev': { avgLatencyMs: 75 },
    }));

    const retrievePromise = retrieveEncryptionKey(
      'video-1',
      'alice.testnet',
      {
        signMessage: vi.fn(),
        signAndSendTransaction: vi.fn(),
      } as never,
    );

    await waitForAssertion(() => {
      expect(retrieveCalls).toEqual(['kms-b', 'kms-c', 'kms-d']);
    });

    const makeShareResponse = (shareIndex: number) => new Response(JSON.stringify({
      ok: true,
      data: {
        shareB64: shares[shareIndex].shareB64,
        shareId: shares[shareIndex].shareId,
        totalShares: 5,
        requiredShares: 2,
        scheme: 'shamir-v1',
        operatorAccountId: `kms-${String.fromCharCode(97 + shareIndex)}.testnet`,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

    resolveB(makeShareResponse(1));
    resolveC(makeShareResponse(2));
    resolveD(makeShareResponse(3));

    await expect(retrievePromise).resolves.toBe(secretB64);
    expect(retrieveCalls).not.toContain('https://kms-a.example.workers.dev/retrieve');
    expect(retrieveCalls).not.toContain('https://kms-e.example.workers.dev/retrieve');
  });
});
