/**
 * NOVA Client Tests
 *
 * Tests file upload/download, URL generation, and error handling.
 */

import {
  uploadFile,
  fetchFile,
  getContentUrl,
  checkFileExists,
  uploadFiles,
  uploadJson
} from '../../lib/nova/client';
import { NovaError } from '../../lib/nova/types';
import * as nacl from 'tweetnacl';

// Mock BrowserKeyStore to avoid near-api-js import issues
const BrowserKeyStore = {
  getKey: async (accountId: string): Promise<any> => null
};

// Mock Session Key (same as auth tests)
class MockSessionKey {
  private keypair: nacl.SignKeyPair;

  constructor() {
    this.keypair = nacl.sign.keyPair();
  }

  getPublicKey(): { toString: () => string } {
    const base64 = Buffer.from(this.keypair.publicKey).toString('base64');
    return {
      toString: () => `ed25519:${base64}`
    };
  }

  async sign(message: Uint8Array): Promise<{ signature: Uint8Array }> {
    const signature = nacl.sign.detached(message, this.keypair.secretKey);
    return { signature };
  }
}

// Mock localStorage
const mockLocalStorage = new Map<string, string>();
global.localStorage = {
  getItem: (key: string) => mockLocalStorage.get(key) || null,
  setItem: (key: string, value: string) => mockLocalStorage.set(key, value),
  removeItem: (key: string) => mockLocalStorage.delete(key),
  clear: () => mockLocalStorage.clear(),
  length: 0,
  key: (index: number) => null
} as any;

// Setup mock Session Key
async function setupMockSessionKey(accountId: string) {
  const mockKey = new MockSessionKey();
  BrowserKeyStore.getKey = async (id: string) => {
    if (id === accountId) return mockKey as any;
    return null;
  };
  return mockKey;
}

// Test suite
async function runClientTests() {
  console.log('\n🧪 NOVA Client Tests\n');

  let passed = 0;
  let failed = 0;

  const testAccountId = 'test-user.testnet';

  // Test 1: Upload file success
  try {
    await setupMockSessionKey(testAccountId);

    const testFile = new Blob(['test video content'], { type: 'video/mp4' });
    const result = await uploadFile(testFile, testAccountId, {
      filename: 'test-video.mp4'
    });

    if (!result.cid) {
      throw new Error('CID not returned');
    }
    if (!result.groupId) {
      throw new Error('Group ID not returned');
    }
    if (result.size !== testFile.size) {
      throw new Error('Size mismatch');
    }
    if (!result.teeEncrypted) {
      throw new Error('TEE encryption flag not set');
    }

    console.log('✅ Test 1: Upload file success');
    passed++;
  } catch (error) {
    console.error('❌ Test 1 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 2: Upload file size limit
  try {
    await setupMockSessionKey(testAccountId);

    // Create file larger than 100 MB limit
    const largeFile = new Blob([new ArrayBuffer(101 * 1024 * 1024)], {
      type: 'video/mp4'
    });

    try {
      await uploadFile(largeFile, testAccountId);
      throw new Error('Should have thrown size error');
    } catch (error) {
      if (!(error instanceof NovaError)) {
        throw new Error('Wrong error type');
      }
      if (error.code !== 'UPLOAD_FAILED') {
        throw new Error(`Wrong error code: ${error.code}`);
      }
    }

    console.log('✅ Test 2: Upload file size limit enforced');
    passed++;
  } catch (error) {
    console.error('❌ Test 2 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 3: Fetch file success
  try {
    await setupMockSessionKey(testAccountId);

    const testCid = 'QmTestCid123456789';
    const data = await fetchFile(testCid, testAccountId, { groupId: 'test-group' });

    if (!(data instanceof Uint8Array)) {
      throw new Error('Should return Uint8Array');
    }
    if (data.byteLength === 0) {
      throw new Error('Should return non-empty data');
    }

    console.log('✅ Test 3: Fetch file success');
    passed++;
  } catch (error) {
    console.error('❌ Test 3 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 4: Get content URL
  try {
    const testCid = 'QmTestCid123456789';
    const url = getContentUrl(testCid);

    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL returned');
    }
    if (!url.includes(testCid)) {
      throw new Error('URL should contain CID');
    }
    if (!url.startsWith('http')) {
      throw new Error('URL should start with http');
    }

    console.log('✅ Test 4: Get content URL works');
    passed++;
  } catch (error) {
    console.error('❌ Test 4 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 5: Upload JSON
  try {
    await setupMockSessionKey(testAccountId);

    const testData = {
      title: 'Test Video',
      description: 'Test description',
      creator: testAccountId
    };

    const result = await uploadJson(testData, testAccountId, 'metadata.json');

    if (!result.cid) {
      throw new Error('CID not returned');
    }
    if (!result.groupId) {
      throw new Error('Group ID not returned');
    }
    if (result.size === 0) {
      throw new Error('Size should be non-zero');
    }

    console.log('✅ Test 5: Upload JSON works');
    passed++;
  } catch (error) {
    console.error('❌ Test 5 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 6: Upload multiple files
  try {
    await setupMockSessionKey(testAccountId);

    const file1 = new Blob(['video 1'], { type: 'video/mp4' });
    const file2 = new Blob(['video 2'], { type: 'video/mp4' });
    const file3 = new Blob(['video 3'], { type: 'video/mp4' });

    const results = await uploadFiles([file1, file2, file3], testAccountId, {
      filename: 'batch-video'
    });

    if (results.length !== 3) {
      throw new Error('Should return 3 results');
    }

    for (let i = 0; i < results.length; i++) {
      if (!results[i].cid) {
        throw new Error(`Result ${i} missing CID`);
      }
      if (!results[i].groupId) {
        throw new Error(`Result ${i} missing group ID`);
      }
    }

    // CIDs should all be different
    const cids = results.map(r => r.cid);
    const uniqueCids = new Set(cids);
    if (uniqueCids.size !== cids.length) {
      throw new Error('CIDs should all be unique');
    }

    console.log('✅ Test 6: Upload multiple files works');
    passed++;
  } catch (error) {
    console.error('❌ Test 6 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 7: Upload with progress callback
  try {
    await setupMockSessionKey(testAccountId);

    const testFile = new Blob(['test'], { type: 'video/mp4' });
    let progressCalled = false;
    let maxPercentage = 0;

    const result = await uploadFile(testFile, testAccountId, {
      filename: 'progress-test.mp4',
      onProgress: (progress) => {
        progressCalled = true;
        if (progress.percentage > maxPercentage) {
          maxPercentage = progress.percentage;
        }
        if (progress.loaded > progress.total) {
          throw new Error('Loaded should not exceed total');
        }
        if (progress.percentage < 0 || progress.percentage > 100) {
          throw new Error('Percentage should be between 0 and 100');
        }
      }
    });

    if (!progressCalled) {
      throw new Error('Progress callback not called');
    }
    if (maxPercentage !== 100) {
      throw new Error('Progress should reach 100%');
    }

    console.log('✅ Test 7: Upload with progress callback works');
    passed++;
  } catch (error) {
    console.error('❌ Test 7 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 8: Upload without Session Key
  try {
    // Clear Session Key mock
    BrowserKeyStore.getKey = async () => null;

    const testFile = new Blob(['test'], { type: 'video/mp4' });

    try {
      await uploadFile(testFile, 'nonexistent.testnet');
      throw new Error('Should have thrown NO_SESSION_KEY error');
    } catch (error) {
      if (!(error instanceof NovaError)) {
        throw new Error('Wrong error type');
      }
      if (error.code !== 'NO_SESSION_KEY') {
        throw new Error(`Wrong error code: ${error.code}`);
      }
    }

    console.log('✅ Test 8: Upload without Session Key throws error');
    passed++;
  } catch (error) {
    console.error('❌ Test 8 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 9: Fetch without Session Key
  try {
    // Clear Session Key mock
    BrowserKeyStore.getKey = async () => null;

    try {
      await fetchFile('QmTestCid', 'nonexistent.testnet', { groupId: 'test-group' });
      throw new Error('Should have thrown NO_SESSION_KEY error');
    } catch (error) {
      if (!(error instanceof NovaError)) {
        throw new Error('Wrong error type');
      }
      if (error.code !== 'NO_SESSION_KEY') {
        throw new Error(`Wrong error code: ${error.code}`);
      }
    }

    console.log('✅ Test 9: Fetch without Session Key throws error');
    passed++;
  } catch (error) {
    console.error('❌ Test 9 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 10: Upload result structure
  try {
    await setupMockSessionKey(testAccountId);

    const testFile = new Blob(['test'], { type: 'video/mp4' });
    const result = await uploadFile(testFile, testAccountId);

    // Validate result structure
    if (typeof result.cid !== 'string' || result.cid.length === 0) {
      throw new Error('Invalid CID');
    }
    if (typeof result.groupId !== 'string' || result.groupId.length === 0) {
      throw new Error('Invalid group ID');
    }
    if (typeof result.size !== 'number' || result.size <= 0) {
      throw new Error('Invalid size');
    }
    if (typeof result.teeEncrypted !== 'boolean' || !result.teeEncrypted) {
      throw new Error('Invalid teeEncrypted flag');
    }

    console.log('✅ Test 10: Upload result structure valid');
    passed++;
  } catch (error) {
    console.error('❌ Test 10 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50) + '\n');

  return { passed, failed };
}

// Run tests
runClientTests()
  .then(({ passed, failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
