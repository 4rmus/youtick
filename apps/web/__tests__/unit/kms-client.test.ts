import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMockKeyStore, setupMockSessionKey } from '../setup';
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
    clearMockKeyStore();
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

  it('uses cached play grants for retrieve without wallet message signing', async () => {
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

    Object.assign(window, {
      crypto: globalThis.crypto,
      location: { origin: 'https://app.test' },
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: 'vitest',
        language: 'en',
        platform: 'test',
        hardwareConcurrency: 4,
      },
      configurable: true,
    });

    const { persistSessionGrant, prepareSessionGrant } = await import('@/lib/access-grants');
    const preparedGrant = await prepareSessionGrant({
      accountId: 'alice.testnet',
      scope: 'Play',
      resourceId: 'video-1',
    });
    persistSessionGrant(preparedGrant.grant);

    const secretB64 = Buffer.from('session-grant-secret').toString('base64');
    const shares = splitSecretIntoShares(secretB64, 2, 2);
    const retrieveCalls: string[] = [];

    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            network: 'testnet',
            contract: 'app-contract.testnet',
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/retrieve')) {
        const body = JSON.parse(String(init?.body || '{}')) as {
          accountId?: string;
          publicKey?: string;
          originHash?: string | null;
          deviceHash?: string | null;
        };
        const operatorIndex = url.includes('kms-a') ? 0 : 1;

        expect(body.accountId).toBeUndefined();
        expect(body.publicKey).toBe(preparedGrant.grant.sessionPublicKey);
        expect(body.originHash).toBe(preparedGrant.grant.originHash);
        expect(body.deviceHash).toBe(preparedGrant.grant.deviceHash);
        retrieveCalls.push(`grant-${operatorIndex}`);
        return new Response(JSON.stringify({
          ok: true,
          data: {
            shareB64: shares[operatorIndex].shareB64,
            shareId: shares[operatorIndex].shareId,
            totalShares: 2,
            requiredShares: 2,
            scheme: 'shamir-v1',
            operatorAccountId: operatorIndex === 0 ? 'kms-a.testnet' : 'kms-b.testnet',
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const wallet = {
      signMessage: vi.fn(),
      signAndSendTransaction: vi.fn(),
    };
    const { retrieveEncryptionKey } = await import('@/lib/kms/client');

    await expect(
      retrieveEncryptionKey('video-1', 'alice.testnet', wallet as never),
    ).resolves.toBe(secretB64);

    expect(retrieveCalls).toEqual(expect.arrayContaining(['grant-0', 'grant-1']));
    expect(wallet.signMessage).not.toHaveBeenCalled();
  });

  it('prepares a play grant for retrieve instead of using a local signless key directly', async () => {
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

    const localKey = setupMockSessionKey('alice.testnet');
    const localPublicKey = localKey.getPublicKey().toString();
    Object.assign(window, {
      crypto: globalThis.crypto,
      location: { origin: 'https://app.test' },
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: 'vitest',
        language: 'en',
        platform: 'test',
        hardwareConcurrency: 4,
      },
      configurable: true,
    });
    sessionStorage.clear();

    const secretB64 = Buffer.from('grant-created-secret').toString('base64');
    const shares = splitSecretIntoShares(secretB64, 2, 2);
    const retrieveCalls: string[] = [];

    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            network: 'testnet',
            contract: 'app-contract.testnet',
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/retrieve')) {
        const body = JSON.parse(String(init?.body || '{}')) as {
          accountId?: string;
          publicKey?: string;
          originHash?: string | null;
          deviceHash?: string | null;
        };
        const operatorIndex = url.includes('kms-a') ? 0 : 1;

        expect(body.accountId).toBeUndefined();
        expect(body.publicKey).toMatch(/^ed25519:/);
        expect(body.publicKey).not.toBe(localPublicKey);
        expect(body.originHash).toBeTruthy();
        expect(body.deviceHash).toBeTruthy();
        retrieveCalls.push(`grant-${operatorIndex}`);
        return new Response(JSON.stringify({
          ok: true,
          data: {
            shareB64: shares[operatorIndex].shareB64,
            shareId: shares[operatorIndex].shareId,
            totalShares: 2,
            requiredShares: 2,
            scheme: 'shamir-v1',
            operatorAccountId: operatorIndex === 0 ? 'kms-a.testnet' : 'kms-b.testnet',
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const wallet = {
      signMessage: vi.fn(),
      signAndSendTransaction: vi.fn(async () => ({})),
    };
    const { retrieveEncryptionKey } = await import('@/lib/kms/client');

    await expect(
      retrieveEncryptionKey('video-1', 'alice.testnet', wallet as never),
    ).resolves.toBe(secretB64);

    expect(wallet.signAndSendTransaction).toHaveBeenCalledOnce();
    expect(retrieveCalls).toEqual(expect.arrayContaining(['grant-0', 'grant-1']));
    expect(wallet.signMessage).not.toHaveBeenCalled();
  });

  it('uses a managed guest local key for retrieve without issuing a play grant', async () => {
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

    const localKey = setupMockSessionKey('guest.testnet');
    const localPublicKey = localKey.getPublicKey().toString();
    sessionStorage.clear();

    const secretB64 = Buffer.from('managed-guest-secret').toString('base64');
    const shares = splitSecretIntoShares(secretB64, 2, 2);
    const retrieveCalls: string[] = [];

    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            network: 'testnet',
            contract: 'app-contract.testnet',
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/retrieve')) {
        const body = JSON.parse(String(init?.body || '{}')) as {
          accountId?: string;
          publicKey?: string;
          originHash?: string | null;
          deviceHash?: string | null;
        };
        const operatorIndex = url.includes('kms-a') ? 0 : 1;

        expect(body.accountId).toBe('guest.testnet');
        expect(body.publicKey).toBe(localPublicKey);
        expect(body.originHash).toBeUndefined();
        expect(body.deviceHash).toBeUndefined();
        retrieveCalls.push(`local-${operatorIndex}`);
        return new Response(JSON.stringify({
          ok: true,
          data: {
            shareB64: shares[operatorIndex].shareB64,
            shareId: shares[operatorIndex].shareId,
            totalShares: 2,
            requiredShares: 2,
            scheme: 'shamir-v1',
            operatorAccountId: operatorIndex === 0 ? 'kms-a.testnet' : 'kms-b.testnet',
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const wallet = {
      managedAccountKind: 'guest',
      signMessage: vi.fn(),
      signAndSendTransaction: vi.fn(async () => ({})),
    };
    const { retrieveEncryptionKey } = await import('@/lib/kms/client');

    await expect(
      retrieveEncryptionKey('video-1', 'guest.testnet', wallet as never),
    ).resolves.toBe(secretB64);

    expect(wallet.signAndSendTransaction).not.toHaveBeenCalled();
    expect(retrieveCalls).toEqual(expect.arrayContaining(['local-0', 'local-1']));
    expect(wallet.signMessage).not.toHaveBeenCalled();
  });

  it('does not open a wallet popup when a cached play grant is rejected', async () => {
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

    Object.assign(window, {
      crypto: globalThis.crypto,
      location: { origin: 'https://app.test' },
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: 'vitest',
        language: 'en',
        platform: 'test',
        hardwareConcurrency: 4,
      },
      configurable: true,
    });
    localStorage.clear();
    sessionStorage.clear();

    const { persistSessionGrant, prepareSessionGrant } = await import('@/lib/access-grants');
    const staleGrant = await prepareSessionGrant({
      accountId: 'alice.testnet',
      scope: 'Play',
      resourceId: 'video-1',
    });
    persistSessionGrant(staleGrant.grant);

    const retrieveCalls: string[] = [];

    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            network: 'testnet',
            contract: 'app-contract.testnet',
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/retrieve')) {
        const body = JSON.parse(String(init?.body || '{}')) as {
          accountId?: string;
          publicKey?: string;
          originHash?: string | null;
          deviceHash?: string | null;
        };

        expect(body.accountId).toBeUndefined();
        expect(body.publicKey).toMatch(/^ed25519:/);
        expect(body.originHash).toBeTruthy();
        expect(body.deviceHash).toBeTruthy();

        if (body.publicKey === staleGrant.grant.sessionPublicKey) {
          retrieveCalls.push('stale-rejected');
          return new Response(JSON.stringify({
            ok: false,
            error: 'Unauthorized',
          }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        throw new Error('Expected only the stale cached grant to be used');
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const wallet = {
      signMessage: vi.fn(),
      signAndSendTransaction: vi.fn(async () => ({})),
    };
    const { retrieveEncryptionKey } = await import('@/lib/kms/client');

    await expect(
      retrieveEncryptionKey('video-1', 'alice.testnet', wallet as never),
    ).rejects.toMatchObject({
      name: 'KMSError',
      code: 'RETRIEVE_FAILED',
    });

    expect(wallet.signAndSendTransaction).not.toHaveBeenCalled();
    expect(wallet.signMessage).not.toHaveBeenCalled();
    expect(retrieveCalls).toContain('stale-rejected');
    const fetchedUrls = vi.mocked(global.fetch).mock.calls.map(([input]) => String(input));
    expect(fetchedUrls.some((url) => url.includes('/auth/'))).toBe(false);
  });

  it('does not fall back to wallet message signing when play grant preparation fails', async () => {
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

    Object.assign(window, {
      crypto: globalThis.crypto,
      location: { origin: 'https://app.test' },
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: 'vitest',
        language: 'en',
        platform: 'test',
        hardwareConcurrency: 4,
      },
      configurable: true,
    });
    localStorage.clear();
    sessionStorage.clear();

    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            network: 'testnet',
            contract: 'app-contract.testnet',
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const wallet = {
      signMessage: vi.fn(),
      signAndSendTransaction: vi.fn(async () => {
        throw new Error('Access key unavailable');
      }),
    };
    const { retrieveEncryptionKey } = await import('@/lib/kms/client');

    await expect(
      retrieveEncryptionKey('video-1', 'alice.testnet', wallet as never),
    ).rejects.toMatchObject({
      name: 'KMSError',
      code: 'SIGNLESS_PLAYBACK_UNAVAILABLE',
    });

    expect(wallet.signAndSendTransaction).toHaveBeenCalledOnce();
    expect(wallet.signMessage).not.toHaveBeenCalled();
    const fetchedUrls = vi.mocked(global.fetch).mock.calls.map(([input]) => String(input));
    expect(fetchedUrls.some((url) => url.endsWith('/retrieve'))).toBe(false);
  });

  it('continues playback when one operator rejects a cached play grant', async () => {
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
    ]);
    vi.mocked(registry.getThresholdConfig).mockResolvedValue({
      total_operators: 3,
      required_shares: 2,
    });

    Object.assign(window, {
      crypto: globalThis.crypto,
      location: { origin: 'https://app.test' },
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        userAgent: 'vitest',
        language: 'en',
        platform: 'test',
        hardwareConcurrency: 4,
      },
      configurable: true,
    });
    localStorage.clear();
    sessionStorage.clear();

    const { persistSessionGrant, prepareSessionGrant } = await import('@/lib/access-grants');
    const preparedGrant = await prepareSessionGrant({
      accountId: 'alice.testnet',
      scope: 'Play',
      resourceId: 'video-1',
    });
    persistSessionGrant(preparedGrant.grant);

    const secretB64 = Buffer.from('one-operator-rejects-secret').toString('base64');
    const shares = splitSecretIntoShares(secretB64, 3, 2);
    const retrieveCalls: string[] = [];

    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/health')) {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            network: 'testnet',
            contract: 'app-contract.testnet',
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/retrieve')) {
        const body = JSON.parse(String(init?.body || '{}')) as {
          accountId?: string;
          publicKey?: string;
          originHash?: string | null;
          deviceHash?: string | null;
        };

        expect(body.accountId).toBeUndefined();
        expect(body.publicKey).toBe(preparedGrant.grant.sessionPublicKey);
        expect(body.originHash).toBe(preparedGrant.grant.originHash);
        expect(body.deviceHash).toBe(preparedGrant.grant.deviceHash);

        if (url.includes('kms-a')) {
          retrieveCalls.push('rejected-a');
          return new Response(JSON.stringify({
            ok: false,
            error: 'Unauthorized',
          }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const operatorIndex = url.includes('kms-b') ? 1 : 2;
        retrieveCalls.push(`grant-${operatorIndex}`);
        return new Response(JSON.stringify({
          ok: true,
          data: {
            shareB64: shares[operatorIndex].shareB64,
            shareId: shares[operatorIndex].shareId,
            totalShares: 3,
            requiredShares: 2,
            scheme: 'shamir-v1',
            operatorAccountId: operatorIndex === 1 ? 'kms-b.testnet' : 'kms-c.testnet',
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const wallet = {
      signMessage: vi.fn(),
      signAndSendTransaction: vi.fn(async () => ({})),
    };
    const { retrieveEncryptionKey } = await import('@/lib/kms/client');

    await expect(
      retrieveEncryptionKey('video-1', 'alice.testnet', wallet as never),
    ).resolves.toBe(secretB64);

    expect(wallet.signAndSendTransaction).not.toHaveBeenCalled();
    expect(wallet.signMessage).not.toHaveBeenCalled();
    expect(retrieveCalls).toEqual(expect.arrayContaining(['rejected-a', 'grant-1', 'grant-2']));
    const fetchedUrls = vi.mocked(global.fetch).mock.calls.map(([input]) => String(input));
    expect(fetchedUrls.some((url) => url.includes('/auth/'))).toBe(false);
  });

  it('does not open wallet message signing when retrieve shares are missing', async () => {
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
            contract: 'app-contract.testnet',
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/retrieve')) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'Not found or unauthorized',
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const wallet = {
      signMessage: vi.fn(),
      signAndSendTransaction: vi.fn(),
    };
    const { retrieveEncryptionKey } = await import('@/lib/kms/client');

    await expect(
      retrieveEncryptionKey('video-1', 'alice.testnet', wallet as never),
    ).rejects.toMatchObject({
      name: 'KMSError',
      code: 'RETRIEVE_FAILED',
    });

    expect(wallet.signMessage).not.toHaveBeenCalled();
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

  it('still tries retrieve when an operator health check fails', async () => {
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
    ]);
    vi.mocked(registry.getThresholdConfig).mockResolvedValue({
      total_operators: 4,
      required_shares: 2,
    });

    setupMockSessionKey('alice.testnet');

    const secretB64 = Buffer.from('cooldown-secret-key').toString('base64');
    const shares = splitSecretIntoShares(secretB64, 4, 2);
    const retrieveCalls: string[] = [];

    global.fetch = vi.fn((input: string | URL | Request) => {
      const url = String(input);

      if (url === 'https://kms-a.example.workers.dev/health') {
        return Promise.reject(new Error('connection closed'));
      }

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

      if (url.endsWith('/retrieve')) {
        const operatorIndex = ['kms-a', 'kms-b', 'kms-c', 'kms-d']
          .findIndex((operator) => url.includes(operator));
        retrieveCalls.push(`kms-${String.fromCharCode(97 + operatorIndex)}`);
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          data: {
            shareB64: shares[operatorIndex].shareB64,
            shareId: shares[operatorIndex].shareId,
            totalShares: 4,
            requiredShares: 2,
            scheme: 'shamir-v1',
            operatorAccountId: `kms-${String.fromCharCode(97 + operatorIndex)}.testnet`,
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const { clearKmsOperatorStats, retrieveEncryptionKey } = await import('@/lib/kms/client');
    clearKmsOperatorStats();

    await expect(
      retrieveEncryptionKey('video-1', 'alice.testnet', {
        signMessage: vi.fn(),
        signAndSendTransaction: vi.fn(),
      } as never),
    ).resolves.toBe(secretB64);
    expect(retrieveCalls).toContain('kms-a');
  });
});
