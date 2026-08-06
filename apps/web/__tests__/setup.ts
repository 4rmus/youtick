import { beforeEach, vi } from 'vitest';
import * as nacl from 'tweetnacl';

export class MockKeyPair {
    constructor(private keypair = nacl.sign.keyPair()) {}

    static fromRandom(): MockKeyPair { return new MockKeyPair(); }
    static fromString(secretKey: string): MockKeyPair {
        const bytes = Buffer.from(secretKey.replace(/^ed25519:/, ''), 'base64');
        return bytes.length === 64
            ? new MockKeyPair({ publicKey: bytes.slice(32), secretKey: bytes } as nacl.SignKeyPair)
            : new MockKeyPair();
    }
    getPublicKey() {
        const data = this.keypair.publicKey;
        return { data, toString: () => `ed25519:${Buffer.from(data).toString('base64')}` };
    }
    sign(message: Uint8Array) { return { signature: nacl.sign.detached(message, this.keypair.secretKey) }; }
    toString() { return `ed25519:${Buffer.from(this.keypair.secretKey).toString('base64')}`; }
}

class MockKeyPairSigner {
    constructor(private keyPair: MockKeyPair) {}
    sign(message: Uint8Array) { return this.keyPair.sign(message); }
    getPublicKey() { return this.keyPair.getPublicKey(); }
}

class MockPublicKey {
    static fromString(value: string) { return new MockPublicKey(value); }
    constructor(private value = 'ed25519:mock') {}
    toString() { return this.value; }
}

class MockAccount {
    constructor(public accountId: string, public rpcUrl?: string, public signer?: unknown) {}
    async signAndSendTransaction() { return { status: { SuccessValue: '' }, receipts_outcome: [] }; }
}

class MockJsonRpcProvider {
    constructor(public options: { url: string }) {}
    query = vi.fn().mockResolvedValue({ result: Array.from(Buffer.from('null')) });
}

class MockFailoverRpcProvider {
    constructor(public providers: unknown[]) {}
    query = vi.fn().mockResolvedValue({ result: Array.from(Buffer.from('null')) });
}

vi.mock('near-api-js', () => ({
    Account: MockAccount,
    FailoverRpcProvider: MockFailoverRpcProvider,
    JsonRpcProvider: MockJsonRpcProvider,
    KeyPair: MockKeyPair,
    KeyPairSigner: MockKeyPairSigner,
    PublicKey: MockPublicKey,
    actions: {
        functionCall: vi.fn((methodName, args, gas, deposit) => ({ type: 'FunctionCall', methodName, args, gas, deposit })),
        addFunctionCallAccessKey: vi.fn((publicKey, receiverId, methodNames, allowance) => ({ type: 'AddKey', publicKey, receiverId, methodNames, allowance })),
    },
}));

const keyStore = new Map<string, MockKeyPair>();
class MockBrowserKeyStore {
    constructor(private prefix = 'near-api-js:keystore:') {}
    async getKey(networkId: string, accountId: string) { return keyStore.get(`${this.prefix}${accountId}:${networkId}`) || null; }
    async setKey(networkId: string, accountId: string, key: MockKeyPair) { keyStore.set(`${this.prefix}${accountId}:${networkId}`, key); }
    async removeKey(networkId: string, accountId: string) { keyStore.delete(`${this.prefix}${accountId}:${networkId}`); }
}

vi.mock('@/lib/keystore-v7', () => ({ BrowserKeyStore: MockBrowserKeyStore }));

function storageMock() {
    const values = new Map<string, string>();
    return {
        getItem: vi.fn((key: string) => values.get(key) || null),
        setItem: vi.fn((key: string, value: string) => values.set(key, value)),
        removeItem: vi.fn((key: string) => values.delete(key)),
        clear: vi.fn(() => values.clear()),
        key: vi.fn((index: number) => Array.from(values.keys())[index] || null),
        get length() { return values.size; },
    };
}

const local = storageMock();
const session = storageMock();
Object.defineProperty(globalThis, 'localStorage', { value: local, writable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: session, writable: true });
Object.defineProperty(globalThis, 'window', {
    value: { localStorage: local, sessionStorage: session, crypto: globalThis.crypto },
    writable: true,
});

process.env.NEXT_PUBLIC_NEAR_NETWORK = 'testnet';
process.env.NEXT_PUBLIC_MARKET_CONTRACT_ID = 'market.testnet';
process.env.NEXT_PUBLIC_ACCESS_CONTRACT_ID = 'access.testnet';

export function clearMockKeyStore() { keyStore.clear(); }

beforeEach(() => {
    vi.clearAllMocks();
    keyStore.clear();
    local.clear();
    session.clear();
});
