import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addFunctionCallAccessKey: vi.fn(),
  functionCall: vi.fn(),
  getTransactionLastResult: vi.fn(),
  signAndSendTransaction: vi.fn(),
}));

vi.mock('near-api-js', () => ({
  Account: class {
    async signAndSendTransaction(args: unknown) {
      return mocks.signAndSendTransaction(args);
    }
  },
  KeyPair: {
    fromString: vi.fn(() => ({
      getPublicKey: () => ({ toString: () => 'ed25519:session-public-key' }),
      toString: () => 'ed25519:session-secret-key',
    })),
  },
  KeyPairSigner: class {
    constructor(_keyPair: unknown) {}
    async signNep413Message(accountId: string) {
      return {
        accountId,
        publicKey: { toString: () => 'ed25519:session-public-key' },
        signature: new Uint8Array([1, 2, 3]),
      };
    }
  },
  PublicKey: {
    fromString: vi.fn((value: string) => value),
  },
  actions: {
    addFunctionCallAccessKey: mocks.addFunctionCallAccessKey,
    functionCall: mocks.functionCall,
  },
  getTransactionLastResult: mocks.getTransactionLastResult,
}));

vi.mock('@/lib/constants', () => ({
  GAS_CONSTANTS: {
    standardGas: 300_000_000_000_000n,
    mediumGas: 100_000_000_000_000n,
  },
  NEAR_CONFIG: {
    contractId: 'youtick.near',
  },
}));

vi.mock('@/lib/rpc-failover', () => ({
  getCurrentRpcUrl: () => 'https://rpc.example',
}));

describe('UploadSessionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    sessionStorage.setItem('youtick:upload-session:creator.near', JSON.stringify({
      secretKey: 'ed25519:session-secret-key',
      expiresAt: Date.now() + 60_000,
    }));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('returns handled nft_mint_prepaid false results instead of throwing receipt failures', async () => {
    mocks.getTransactionLastResult.mockReturnValue(false);
    mocks.signAndSendTransaction.mockResolvedValue({
      status: { SuccessValue: 'ZmFsc2U=' },
      transaction_outcome: { id: 'tx-hash' },
      receipts_outcome: [{
        outcome: {
          status: {
            Failure: {
              ActionError: {
                index: 0,
                kind: {
                  FunctionCallError: {
                    ExecutionError: 'Smart contract panicked: Index out of bounds',
                  },
                },
              },
            },
          },
        },
      }],
    });

    const { UploadSessionManager } = await import('@/lib/upload-session-manager');
    const manager = new UploadSessionManager('creator.near');

    await expect(manager.callMethod('nft_mint_prepaid', {})).resolves.toBe(false);
  });

  it('still throws receipt failures for other upload-session calls', async () => {
    mocks.getTransactionLastResult.mockReturnValue(true);
    mocks.signAndSendTransaction.mockResolvedValue({
      status: { SuccessValue: 'dHJ1ZQ==' },
      transaction_outcome: { id: 'tx-hash' },
      receipts_outcome: [{
        outcome: {
          status: {
            Failure: {
              ActionError: {
                index: 0,
                kind: {
                  FunctionCallError: {
                    ExecutionError: 'create event failed',
                  },
                },
              },
            },
          },
        },
      }],
    });

    const { UploadSessionManager } = await import('@/lib/upload-session-manager');
    const manager = new UploadSessionManager('creator.near');

    await expect(manager.callMethod('create_event_prepaid', {}))
      .rejects
      .toThrow('Cross-contract call failed in create_event_prepaid');
  });

  it('signs storage auth messages with the active upload session key', async () => {
    const { UploadSessionManager } = await import('@/lib/upload-session-manager');
    const manager = new UploadSessionManager('creator.near');

    await expect(manager.signMessage({
      message: 'Authorize upload',
      recipient: 'https://storage.example',
      nonce: new Uint8Array(32),
    })).resolves.toEqual({
      accountId: 'creator.near',
      publicKey: 'ed25519:session-public-key',
      signature: 'AQID',
    });
  });
});
