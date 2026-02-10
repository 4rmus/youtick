/**
 * NOVA Client Tests
 *
 * Tests file upload/download, URL generation, and error handling.
 * Uses SDK mock — no simulation fallbacks.
 */

// Set API key flag BEFORE importing any nova modules
process.env.NEXT_PUBLIC_NOVA_API_KEY = 'enabled';
process.env.NEXT_PUBLIC_NOVA_ACCOUNT_ID = 'test.nova-sdk.near';

// Install SDK mock BEFORE any nova imports
import { installNovaSdkMock } from '../mocks/nova-sdk';
installNovaSdkMock();

import {
  getContentUrl,
} from '../../lib/nova/client';
import { NovaError } from '../../lib/nova/types';
import { setNovaConfig } from '../../lib/nova/config';

// Mock localStorage
const mockLocalStorage = new Map<string, string>();
global.localStorage = {
  getItem: (key: string) => mockLocalStorage.get(key) || null,
  setItem: (key: string, value: string) => mockLocalStorage.set(key, value),
  removeItem: (key: string) => mockLocalStorage.delete(key),
  clear: () => mockLocalStorage.clear(),
  length: 0,
  key: () => null
} as any;

// Test suite
async function runClientTests() {
  console.log('\n🧪 NOVA Client Tests\n');

  let passed = 0;
  let failed = 0;

  setNovaConfig({ apiKey: 'enabled', novaAccountId: 'test.nova-sdk.near' });

  // Test 1: Get content URL
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

    console.log('✅ Test 1: Get content URL works');
    passed++;
  } catch (error) {
    console.error('❌ Test 1 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 2: Upload fails without API key
  try {
    setNovaConfig({ apiKey: undefined });

    const { uploadFile } = await import('../../lib/nova/client');
    const testFile = new Blob(['test'], { type: 'video/mp4' });

    try {
      await uploadFile(testFile, 'test.testnet');
      throw new Error('Should have thrown INVALID_CONFIG error');
    } catch (error) {
      if (!(error instanceof NovaError)) {
        throw new Error(`Wrong error type: ${error}`);
      }
      if (error.code !== 'INVALID_CONFIG' && error.code !== 'AUTH_FAILED') {
        throw new Error(`Wrong error code: ${error.code}`);
      }
    }

    setNovaConfig({ apiKey: 'enabled' });

    console.log('✅ Test 2: Upload fails without API key');
    passed++;
  } catch (error) {
    setNovaConfig({ apiKey: 'enabled' });
    console.error('❌ Test 2 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 3: Upload file size limit
  try {
    const { uploadFile } = await import('../../lib/nova/client');

    const largeFile = new Blob([new ArrayBuffer(101 * 1024 * 1024)], {
      type: 'video/mp4'
    });

    try {
      await uploadFile(largeFile, 'test.testnet');
      throw new Error('Should have thrown size error');
    } catch (error) {
      if (!(error instanceof NovaError)) {
        throw new Error('Wrong error type');
      }
      if (error.code !== 'UPLOAD_FAILED') {
        throw new Error(`Wrong error code: ${error.code}`);
      }
    }

    console.log('✅ Test 3: Upload file size limit enforced');
    passed++;
  } catch (error) {
    console.error('❌ Test 3 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 4: Fetch fails without API key
  try {
    setNovaConfig({ apiKey: undefined });

    const { fetchFile } = await import('../../lib/nova/client');

    try {
      await fetchFile('QmTest', 'test.testnet', { groupId: 'g1', keyCid: 'QmKey1' });
      throw new Error('Should have thrown');
    } catch (error) {
      if (!(error instanceof NovaError)) {
        throw new Error(`Wrong error type: ${error}`);
      }
    }

    setNovaConfig({ apiKey: 'enabled' });

    console.log('✅ Test 4: Fetch fails without API key');
    passed++;
  } catch (error) {
    setNovaConfig({ apiKey: 'enabled' });
    console.error('❌ Test 4 Failed:', error instanceof Error ? error.message : String(error));
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
