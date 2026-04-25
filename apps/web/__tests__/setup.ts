/**
 * Vitest Global Setup File
 * Provides comprehensive mocks for browser-only modules and NEAR APIs
 */

import { vi, beforeEach, afterEach } from 'vitest';
import * as nacl from 'tweetnacl';
import nodeCrypto from 'node:crypto';

// ============================================================================
// Mock KeyPair Implementation (used across modules)
// ============================================================================

export class MockKeyPair {
  private keypair: nacl.SignKeyPair;

  constructor(keypair?: nacl.SignKeyPair) {
    this.keypair = keypair || nacl.sign.keyPair();
  }

  static fromRandom(): MockKeyPair {
    return new MockKeyPair();
  }

  static fromString(secretKey: string): MockKeyPair {
    const parts = secretKey.split(':');
    if (parts.length === 2 && parts[0] === 'ed25519') {
      try {
        const keyBytes = Buffer.from(parts[1], 'base64');
        if (keyBytes.length === 64) {
          return new MockKeyPair({
            publicKey: keyBytes.slice(32),
            secretKey: keyBytes
          } as nacl.SignKeyPair);
        }
      } catch {
        // Fall through to create new keypair
      }
    }
    return new MockKeyPair();
  }

  getPublicKey(): { toString: () => string; data: Uint8Array } {
    const base64 = Buffer.from(this.keypair.publicKey).toString('base64');
    return {
      toString: () => `ed25519:${base64}`,
      data: this.keypair.publicKey
    };
  }

  async sign(message: Uint8Array): Promise<{ signature: Uint8Array }> {
    const signature = nacl.sign.detached(message, this.keypair.secretKey);
    return { signature };
  }

  toString(): string {
    const secretKeyBase64 = Buffer.from(this.keypair.secretKey).toString('base64');
    return `ed25519:${secretKeyBase64}`;
  }
}

class MockKeyPairSigner {
  keyPair: MockKeyPair;

  constructor(keyPair: MockKeyPair) {
    this.keyPair = keyPair;
  }

  sign(message: Uint8Array) {
    return this.keyPair.sign(message);
  }

  getPublicKey() {
    return this.keyPair.getPublicKey();
  }
}

class MockPublicKey {
  data: Uint8Array;

  constructor(data?: Uint8Array) {
    this.data = data || new Uint8Array(32);
  }

  static fromString(value: string): MockPublicKey {
    const payload = value.replace(/^ed25519:/, '');
    try {
      const bytes = Buffer.from(payload, 'base64');
      if (bytes.length > 0) {
        return new MockPublicKey(new Uint8Array(bytes.slice(0, 32)));
      }
    } catch {
      // Fall through to zero bytes
    }

    return new MockPublicKey(new Uint8Array(32));
  }

  toString(): string {
    return `ed25519:${Buffer.from(this.data).toString('base64')}`;
  }
}

class MockAccount {
  accountId: string;
  rpcUrl?: string;
  signer?: unknown;

  constructor(accountId: string, rpcUrl?: string, signer?: unknown) {
    this.accountId = accountId;
    this.rpcUrl = rpcUrl;
    this.signer = signer;
  }

  async getAccessKeyList() {
    return {
      keys: [{
        public_key: 'ed25519:mock_public_key',
        access_key: { permission: 'FullAccess' }
      }]
    };
  }

  async signAndSendTransaction() {
    return {
      status: { SuccessValue: '' },
      receipts_outcome: []
    };
  }
}

class MockJsonRpcProvider {
  url: string;

  constructor(options: { url: string }) {
    this.url = options.url;
  }

  query = vi.fn().mockResolvedValue({
    result: Buffer.from('"1000000000000000000000000"').toJSON().data
  });
}

class MockFailoverRpcProvider {
  providers: unknown[];

  constructor(providers: unknown[]) {
    this.providers = providers;
  }

  query = vi.fn().mockResolvedValue({
    result: Buffer.from('"1000000000000000000000000"').toJSON().data
  });
}

// ============================================================================
// Mock near-api-js
// ============================================================================

vi.mock('near-api-js', () => ({
  KeyPair: MockKeyPair,
  PublicKey: MockPublicKey,
  Account: MockAccount,
  KeyPairSigner: MockKeyPairSigner,
  FailoverRpcProvider: MockFailoverRpcProvider,
  JsonRpcProvider: MockJsonRpcProvider,
  actions: {
    functionCall: vi.fn((methodName, args, gas, deposit) => ({
      type: 'FunctionCall', methodName, args, gas, deposit
    })),
    addKey: vi.fn((publicKey, accessKey) => ({
      type: 'AddKey', publicKey, accessKey
    })),
    deleteKey: vi.fn((publicKey) => ({
      type: 'DeleteKey', publicKey
    })),
    transfer: vi.fn((amount) => ({
      type: 'Transfer', amount
    }))
  },
  nearToYocto: (near: number) => (BigInt(Math.floor(near * 1e24))).toString(),
  yoctoToNear: (yocto: string) => (Number(BigInt(yocto)) / 1e24).toFixed(5)
}));

// ============================================================================
// Mock BrowserKeyStore
// ============================================================================

const mockKeyStore = new Map<string, MockKeyPair>();

class MockBrowserKeyStore {
  getKey = vi.fn(async (networkId: string, accountId: string) => {
    const key = `${accountId}:${networkId}`;
    return mockKeyStore.get(key) || null;
  });

  setKey = vi.fn(async (networkId: string, accountId: string, keyPair: MockKeyPair) => {
    const key = `${accountId}:${networkId}`;
    mockKeyStore.set(key, keyPair);
  });

  removeKey = vi.fn(async (networkId: string, accountId: string) => {
    const key = `${accountId}:${networkId}`;
    mockKeyStore.delete(key);
  });

  getSigner = vi.fn(async (networkId: string, accountId: string) => {
    const keyPair = mockKeyStore.get(`${accountId}:${networkId}`);
    if (!keyPair) return null;
    return { keyPair, sign: (msg: Uint8Array) => keyPair.sign(msg) };
  });

  clear = vi.fn(async () => mockKeyStore.clear());

  getAccounts = vi.fn(async (networkId: string) => {
    const accounts: string[] = [];
    for (const key of mockKeyStore.keys()) {
      if (key.endsWith(`:${networkId}`)) {
        accounts.push(key.replace(`:${networkId}`, ''));
      }
    }
    return accounts;
  });
}

class MockInMemoryKeyStore {
  keys = new Map();
  getKey = vi.fn().mockResolvedValue(null);
  setKey = vi.fn().mockResolvedValue(undefined);
  removeKey = vi.fn().mockResolvedValue(undefined);
  getSigner = vi.fn().mockResolvedValue(null);
  clear = vi.fn().mockResolvedValue(undefined);
  getAccounts = vi.fn().mockResolvedValue([]);
}

vi.mock('@/lib/keystore-v7', () => ({
  BrowserKeyStore: MockBrowserKeyStore,
  InMemoryKeyStore: MockInMemoryKeyStore,
  browserKeyStore: new MockBrowserKeyStore(),
  inMemoryKeyStore: new MockInMemoryKeyStore()
}));

// ============================================================================
// Mock localStorage
// ============================================================================

const mockLocalStorage = new Map<string, string>();

const localStorageMock = {
  getItem: vi.fn((key: string) => mockLocalStorage.get(key) || null),
  setItem: vi.fn((key: string, value: string) => mockLocalStorage.set(key, value)),
  removeItem: vi.fn((key: string) => mockLocalStorage.delete(key)),
  clear: vi.fn(() => mockLocalStorage.clear()),
  get length() {
    return mockLocalStorage.size;
  },
  key: vi.fn((index: number) => {
    const keys = Array.from(mockLocalStorage.keys());
    return keys[index] || null;
  })
};

const mockSessionStorage = new Map<string, string>();

const sessionStorageMock = {
  getItem: vi.fn((key: string) => mockSessionStorage.get(key) || null),
  setItem: vi.fn((key: string, value: string) => mockSessionStorage.set(key, value)),
  removeItem: vi.fn((key: string) => mockSessionStorage.delete(key)),
  clear: vi.fn(() => mockSessionStorage.clear()),
  get length() {
    return mockSessionStorage.size;
  },
  key: vi.fn((index: number) => {
    const keys = Array.from(mockSessionStorage.keys());
    return keys[index] || null;
  })
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

Object.defineProperty(globalThis, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
});

// ============================================================================
// Mock window (for browser-only checks like "typeof window !== 'undefined'")
// ============================================================================

Object.defineProperty(globalThis, 'window', {
  value: {
  localStorage: localStorageMock,
  sessionStorage: sessionStorageMock,
  },
  writable: true,
});

// ============================================================================
// Mock crypto
// ============================================================================

if (typeof globalThis.crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      randomUUID: () => nodeCrypto.randomUUID(),
      getRandomValues: <T extends ArrayBufferView | null>(arr: T): T => {
        if (!arr) {
          return arr;
        }
        return nodeCrypto.getRandomValues(arr as ArrayBufferView) as T;
      },
      subtle: {} as SubtleCrypto,
    },
    writable: true,
  });
}

// ============================================================================
// Mock fetch (for RPC calls)
// ============================================================================

global.fetch = vi.fn().mockImplementation(async (_url: string, options?: { body?: string }) => {
  const body = options?.body ? JSON.parse(options.body) as { method?: string; params?: { method_name?: string } } : {};

  // Mock RPC responses
  if (body.method === 'query') {
    const methodName = body.params?.method_name;

    if (methodName === 'get_user_balance') {
      return {
        ok: true,
        json: async () => ({
          result: {
            result: Array.from(Buffer.from('"1000000000000000000000000"'))
          }
        })
      };
    }

    if (methodName === 'get_event') {
      return {
        ok: true,
        json: async () => ({
          result: {
            result: Array.from(Buffer.from(JSON.stringify({
              title: 'Test Event',
              description: 'Test Description',
              creator_id: 'creator.testnet',
              price: '0',
              access_mode: 'public_free',
            })))
          }
        })
      };
    }

    if (methodName === 'get_trial_pool_balance') {
      return {
        ok: true,
        json: async () => ({
          result: {
            result: Array.from(Buffer.from('"10000000000000000000000000"'))
          }
        })
      };
    }
  }

  // Default response
  return {
    ok: true,
    json: async () => ({ result: {} })
  };
}) as unknown as typeof fetch;

// ============================================================================
// Mock environment variables
// ============================================================================

process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
process.env.NEXT_PUBLIC_NFT_CONTRACT_ID = 'test-contract.testnet';

// ============================================================================
// Test utilities
// ============================================================================

export function setupMockSessionKey(accountId: string, networkId: string = 'testnet'): MockKeyPair {
  const keyPair = new MockKeyPair();
  mockKeyStore.set(`${accountId}:${networkId}`, keyPair);
  return keyPair;
}

export function clearMockKeyStore(): void {
  mockKeyStore.clear();
}

export function clearMockLocalStorage(): void {
  mockLocalStorage.clear();
}

export function setMockLocalStorage(key: string, value: string): void {
  mockLocalStorage.set(key, value);
}

export function getMockLocalStorage(key: string): string | null {
  return mockLocalStorage.get(key) || null;
}

export function clearMockSessionStorage(): void {
  mockSessionStorage.clear();
}

export function setMockSessionStorage(key: string, value: string): void {
  mockSessionStorage.set(key, value);
}

export function getMockSessionStorage(key: string): string | null {
  return mockSessionStorage.get(key) || null;
}

// ============================================================================
// Test lifecycle hooks
// ============================================================================

beforeEach(() => {
  // Clear mocks before each test
  vi.clearAllMocks();
  mockKeyStore.clear();
  mockLocalStorage.clear();
  mockSessionStorage.clear();

  // Restore default localStorage mock behavior after tests that override implementations
  localStorageMock.getItem.mockImplementation((key: string) => mockLocalStorage.get(key) || null);
  localStorageMock.setItem.mockImplementation((key: string, value: string) => mockLocalStorage.set(key, value));
  localStorageMock.removeItem.mockImplementation((key: string) => mockLocalStorage.delete(key));
  localStorageMock.clear.mockImplementation(() => mockLocalStorage.clear());
  localStorageMock.key.mockImplementation((index: number) => {
    const keys = Array.from(mockLocalStorage.keys());
    return keys[index] || null;
  });

  sessionStorageMock.getItem.mockImplementation((key: string) => mockSessionStorage.get(key) || null);
  sessionStorageMock.setItem.mockImplementation((key: string, value: string) => mockSessionStorage.set(key, value));
  sessionStorageMock.removeItem.mockImplementation((key: string) => mockSessionStorage.delete(key));
  sessionStorageMock.clear.mockImplementation(() => mockSessionStorage.clear());
  sessionStorageMock.key.mockImplementation((index: number) => {
    const keys = Array.from(mockSessionStorage.keys());
    return keys[index] || null;
  });
});

afterEach(() => {
  // Cleanup after each test
});

console.log('[Test Setup] Vitest mocks initialized successfully');
