import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupMockSessionKey } from '../setup';

vi.mock('@/lib/registry', () => ({
  listActiveDecryptionOperatorEndpoints: vi.fn(async () => []),
  listActiveDecryptionOperators: vi.fn(async () => []),
  getThresholdConfig: vi.fn(async () => null),
}));

describe('kms/client', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
    process.env.NEXT_PUBLIC_NFT_CONTRACT_ID = 'app-contract.testnet';
    process.env.NEXT_PUBLIC_KMS_URL = 'https://kms.example.workers.dev';
  });

  it('throws a clear error when KMS is pointed at a different contract', async () => {
    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url === 'https://kms.example.workers.dev/health') {
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
      code: 'CONFIG_MISMATCH',
    });

    await expect(
      retrieveEncryptionKey('8697ef30-45fc-4b0e-8801-bd65e6faffe5', 'alice.testnet', {
        signMessage: vi.fn(),
      } as never),
    ).rejects.toThrow('other-contract.testnet');
  });

  it('continues with token-based retrieve when KMS config matches', async () => {
    const wallet = {
      signMessage: vi.fn(async () => ({
        accountId: 'alice.testnet',
        publicKey: 'ed25519:wallet-public-key',
        signature: 'signed-message',
      })),
    };

    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url === 'https://kms.example.workers.dev/health') {
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

      if (url === 'https://kms.example.workers.dev/auth/challenge') {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            challengeId: 'challenge-1',
            message: 'Sign this challenge',
            recipient: 'app-contract.testnet',
            nonce: Buffer.from('nonce').toString('base64'),
            expiresAt: Date.now() + 60_000,
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://kms.example.workers.dev/auth/verify') {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            token: 'kms-token',
            accountId: 'alice.testnet',
            action: 'retrieve',
            videoId: 'video-1',
            expiresAt: Date.now() + 60_000,
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === 'https://kms.example.workers.dev/retrieve') {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            aesKeyB64: 'encrypted-key',
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const { retrieveEncryptionKey } = await import('@/lib/kms/client');
    const result = await retrieveEncryptionKey('video-1', 'alice.testnet', wallet as never);

    expect(result).toBe('encrypted-key');
    expect(wallet.signMessage).toHaveBeenCalledTimes(1);
  });

  it('prefers a local session key before opening a session-grant or token auth flow', async () => {
    setupMockSessionKey('alice.testnet');

    const wallet = {
      signMessage: vi.fn(),
      signAndSendTransaction: vi.fn(),
    };

    global.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url === 'https://kms.example.workers.dev/health') {
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

      if (url === 'https://kms.example.workers.dev/retrieve') {
        return new Response(JSON.stringify({
          ok: true,
          data: {
            aesKeyB64: 'local-key-result',
          },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const { retrieveEncryptionKey } = await import('@/lib/kms/client');
    const result = await retrieveEncryptionKey('video-1', 'alice.testnet', wallet as never);

    expect(result).toBe('local-key-result');
    expect(wallet.signAndSendTransaction).not.toHaveBeenCalled();
    expect(wallet.signMessage).not.toHaveBeenCalled();
  });
});
