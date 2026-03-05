/**
 * Mock for near-api-js module
 * Provides mock implementations for testing without real blockchain
 */

import { vi } from 'vitest';
import * as nacl from 'tweetnacl';

// Mock KeyPair with actual crypto operations
export class MockKeyPair {
  private keypair: nacl.SignKeyPair;

  constructor(keypair?: nacl.SignKeyPair) {
    this.keypair = keypair || nacl.sign.keyPair();
  }

  static fromRandom(): MockKeyPair {
    return new MockKeyPair();
  }

  static fromString(secretKey: string): MockKeyPair {
    // Parse ed25519:base64 format
    const parts = secretKey.split(':');
    if (parts.length === 2 && parts[0] === 'ed25519') {
      const keyBytes = Buffer.from(parts[1], 'base64');
      // nacl secret key is 64 bytes (seed + public key)
      if (keyBytes.length === 64) {
        return new MockKeyPair({
          publicKey: keyBytes.slice(32),
          secretKey: keyBytes
        } as nacl.SignKeyPair);
      }
    }
    // Return new random keypair if parsing fails
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

// Mock Account
export class MockAccount {
  accountId: string;
  rpcUrl: string;
  signer: unknown;

  constructor(accountId: string, rpcUrl?: string, signer?: unknown) {
    this.accountId = accountId;
    this.rpcUrl = rpcUrl || 'https://rpc.testnet.near.org';
    this.signer = signer;
  }

  async getAccessKeyList(): Promise<{ keys: Array<{ public_key: string; access_key: unknown }> }> {
    return {
      keys: [{
        public_key: 'ed25519:mock_public_key',
        access_key: {
          permission: 'FullAccess'
        }
      }]
    };
  }

  async signAndSendTransaction(): Promise<unknown> {
    return {
      status: { SuccessValue: '' },
      receipts_outcome: []
    };
  }
}

// Mock KeyPairSigner
export class MockKeyPairSigner {
  keyPair: MockKeyPair;

  constructor(keyPair: MockKeyPair) {
    this.keyPair = keyPair;
  }

  async sign(message: Uint8Array): Promise<{ signature: Uint8Array }> {
    return this.keyPair.sign(message);
  }

  getPublicKey() {
    return this.keyPair.getPublicKey();
  }
}

// Mock JsonRpcProvider
export class MockJsonRpcProvider {
  url: string;

  constructor(options: { url: string }) {
    this.url = options.url;
  }

  async query(params: { method_name?: string }): Promise<{ result: number[] } | { result: unknown[] }> {
    if (params.method_name === 'get_user_balance') {
      // Return 1 NEAR in yoctoNEAR
      return {
        result: Buffer.from('"1000000000000000000000000"').toJSON().data
      };
    }
    return { result: [] };
  }
}

// Mock actions
export const mockActions = {
  functionCall: vi.fn((methodName: string, args: unknown, gas: bigint, deposit: bigint) => ({
    type: 'FunctionCall',
    methodName,
    args,
    gas,
    deposit
  })),
  addKey: vi.fn((publicKey: string, accessKey: unknown) => ({
    type: 'AddKey',
    publicKey,
    accessKey
  })),
  deleteKey: vi.fn((publicKey: string) => ({
    type: 'DeleteKey',
    publicKey
  })),
  transfer: vi.fn((amount: bigint) => ({
    type: 'Transfer',
    amount
  }))
};

// Utility functions
export const nearToYocto = (near: number): string => {
  return (BigInt(Math.floor(near * 1e24))).toString();
};

export const yoctoToNear = (yocto: string): string => {
  const yoctoBigInt = BigInt(yocto);
  const nearValue = Number(yoctoBigInt) / 1e24;
  return nearValue.toFixed(5);
};

// Create the mock module
export const nearApiJsMock = {
  KeyPair: MockKeyPair,
  Account: MockAccount,
  KeyPairSigner: MockKeyPairSigner,
  JsonRpcProvider: MockJsonRpcProvider,
  actions: mockActions,
  nearToYocto,
  yoctoToNear
};

export default nearApiJsMock;
