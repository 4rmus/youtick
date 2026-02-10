/**
 * Shared Nova SDK mock factory for tests.
 *
 * Provides a mock NovaSdk instance that stubs all methods
 * used by the nova module (auth, groups, upload, retrieve, fees).
 */

export function createMockNovaSdk() {
  return {
    authStatus: async () => ({ authenticated: true }),
    refreshToken: async () => undefined,
    registerGroup: async (name: string) => name,
    addGroupMember: async () => 'ok',
    isAuthorized: async () => true,
    upload: async (_groupId: string, _data: Buffer, _filename: string) => ({
      cid: `QmTest${Date.now()}`,
      trans_id: `tx_${Date.now()}`,
      file_hash: `h_${Date.now()}`,
    }),
    retrieve: async (_groupId: string, _cid: string) => ({
      data: Buffer.from('test-decrypted-content'),
      ipfs_hash: 'QmTest',
      group_id: 'g1',
    }),
    estimateFee: async () => BigInt('670000000000000000000000'),
    getBalance: async () => '1000000000000000000000000',
    getGroupChecksum: async () => 'checksum',
  };
}

/**
 * Install the mock NovaSdk globally so that `require('nova-sdk-js')` returns it.
 *
 * Call this BEFORE importing any nova module that calls `getNovaSdk()`.
 */
export function installNovaSdkMock() {
  const mock = createMockNovaSdk();

  // Patch require so nova-sdk-js returns our mock
  const Module = require('module');
  const originalRequire = Module.prototype.require;

  Module.prototype.require = function (id: string) {
    if (id === 'nova-sdk-js') {
      return {
        NovaSdk: class MockNovaSdkClass {
          constructor() {
            return mock;
          }
        },
      };
    }
    return originalRequire.apply(this, arguments);
  };

  return mock;
}
