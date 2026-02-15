/**
 * NOVA Authentication Tests
 *
 * Tests SDK session-based auth, token caching, and error handling.
 */

// Set API key flag BEFORE importing any nova modules
process.env.NEXT_PUBLIC_NOVA_API_KEY = 'enabled';
process.env.NEXT_PUBLIC_NOVA_ACCOUNT_ID = 'test.nova-sdk.near';

// Install SDK mock BEFORE any nova imports
import { installNovaSdkMock } from '../mocks/nova-sdk';
const mockSdk = installNovaSdkMock();

import {
  generateNovaAuthToken,
  clearNovaAuthCache,
  hasValidNovaAuthToken,
  getCachedToken,
  refreshNovaAuthToken,
  getTokenExpiry
} from '../../lib/nova/auth';
import { NovaError, NovaAuthToken } from '../../lib/nova/types';
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
async function runAuthTests() {
  console.log('\n🧪 NOVA Authentication Tests\n');

  let passed = 0;
  let failed = 0;

  const testAccountId = 'test-user.testnet';

  // Ensure config has API key set
  setNovaConfig({ apiKey: 'enabled', novaAccountId: 'test.nova-sdk.near' });

  // Test 1: Auth fails without API key
  try {
    clearNovaAuthCache();
    setNovaConfig({ apiKey: undefined });

    try {
      await generateNovaAuthToken('test.testnet');
      throw new Error('Should have thrown INVALID_CONFIG error');
    } catch (error) {
      if (!(error instanceof NovaError)) {
        throw new Error('Wrong error type');
      }
      if (error.code !== 'INVALID_CONFIG') {
        throw new Error(`Wrong error code: ${error.code}`);
      }
    }

    // Restore API key
    setNovaConfig({ apiKey: 'enabled' });

    console.log('✅ Test 1: Auth fails without API key');
    passed++;
  } catch (error) {
    setNovaConfig({ apiKey: 'enabled' });
    console.error('❌ Test 1 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 2: Token generation with SDK session
  try {
    clearNovaAuthCache();

    const token = await generateNovaAuthToken(testAccountId);

    if (!token.authToken) {
      throw new Error('Auth token not generated');
    }
    if (!token.authToken.startsWith('nova-session-')) {
      throw new Error(`Token should start with nova-session-, got: ${token.authToken}`);
    }
    if (token.accountId !== testAccountId) {
      throw new Error('Account ID mismatch');
    }
    if (!token.expiresAt || token.expiresAt <= Date.now()) {
      throw new Error('Invalid expiry time');
    }

    console.log('✅ Test 2: Token generation with SDK session works');
    passed++;
  } catch (error) {
    console.error('❌ Test 2 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 3: Token caching
  try {
    clearNovaAuthCache();

    const token1 = await generateNovaAuthToken(testAccountId);

    const hasCached = hasValidNovaAuthToken(testAccountId);
    if (!hasCached) {
      throw new Error('Token not cached');
    }

    const token2 = await generateNovaAuthToken(testAccountId);

    if (token1.authToken !== token2.authToken) {
      throw new Error('Cache not working - tokens differ');
    }

    console.log('✅ Test 3: Token caching works');
    passed++;
  } catch (error) {
    console.error('❌ Test 3 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 4: Cache retrieval
  try {
    clearNovaAuthCache();

    const noCached = getCachedToken(testAccountId);
    if (noCached) {
      throw new Error('Should not have cached token yet');
    }

    await generateNovaAuthToken(testAccountId);

    const cached = getCachedToken(testAccountId);
    if (!cached) {
      throw new Error('Token not in cache');
    }
    if (cached.accountId !== testAccountId) {
      throw new Error('Cached token account mismatch');
    }

    console.log('✅ Test 4: Cache retrieval works');
    passed++;
  } catch (error) {
    console.error('❌ Test 4 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 5: Cache clearing
  try {
    clearNovaAuthCache();

    await generateNovaAuthToken(testAccountId);

    if (!hasValidNovaAuthToken(testAccountId)) {
      throw new Error('Token should be cached');
    }

    clearNovaAuthCache(testAccountId);

    if (hasValidNovaAuthToken(testAccountId)) {
      throw new Error('Token should not be cached after clear');
    }

    console.log('✅ Test 5: Cache clearing works');
    passed++;
  } catch (error) {
    console.error('❌ Test 5 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 6: Token refresh (bypass cache)
  try {
    clearNovaAuthCache();

    const token1 = await generateNovaAuthToken(testAccountId);

    await new Promise(resolve => setTimeout(resolve, 10));

    const token2 = await refreshNovaAuthToken(testAccountId);

    if (token1.authToken === token2.authToken) {
      throw new Error('Refresh should generate new token');
    }

    console.log('✅ Test 6: Token refresh works');
    passed++;
  } catch (error) {
    console.error('❌ Test 6 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 7: Token expiry info
  try {
    clearNovaAuthCache();

    const token = await generateNovaAuthToken(testAccountId);
    const expiry = getTokenExpiry(token);

    if (typeof expiry.isExpired !== 'boolean') {
      throw new Error('isExpired should be boolean');
    }
    if (expiry.isExpired) {
      throw new Error('Fresh token should not be expired');
    }
    if (expiry.expiresIn <= 0) {
      throw new Error('expiresIn should be positive');
    }
    if (!(expiry.expiresAt instanceof Date)) {
      throw new Error('expiresAt should be Date object');
    }

    console.log('✅ Test 7: Token expiry info works');
    passed++;
  } catch (error) {
    console.error('❌ Test 7 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 8: Expired token detection
  try {
    const expiredToken: NovaAuthToken = {
      authToken: 'expired-token',
      accountId: testAccountId,
      expiresAt: Date.now() - 1000
    };

    const expiry = getTokenExpiry(expiredToken);

    if (!expiry.isExpired) {
      throw new Error('Token should be detected as expired');
    }
    if (expiry.expiresIn !== 0) {
      throw new Error('expiresIn should be 0 for expired token');
    }

    console.log('✅ Test 8: Expired token detection works');
    passed++;
  } catch (error) {
    console.error('❌ Test 8 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 9: Token structure validation
  try {
    clearNovaAuthCache();

    const token = await generateNovaAuthToken(testAccountId);

    if (typeof token.authToken !== 'string' || token.authToken.length === 0) {
      throw new Error('Invalid authToken');
    }
    if (typeof token.accountId !== 'string' || token.accountId !== testAccountId) {
      throw new Error('Invalid accountId');
    }
    if (typeof token.expiresAt !== 'number' || token.expiresAt <= Date.now()) {
      throw new Error('Invalid expiresAt');
    }

    console.log('✅ Test 9: Token structure validation passes');
    passed++;
  } catch (error) {
    console.error('❌ Test 9 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 10: SDK auth failure triggers refresh
  try {
    clearNovaAuthCache();

    // Make authStatus return not authenticated first, then succeed after refresh
    let callCount = 0;
    mockSdk.authStatus = async () => {
      callCount++;
      if (callCount === 1) return { authenticated: false };
      return { authenticated: true };
    };
    mockSdk.refreshToken = async () => undefined;

    const token = await generateNovaAuthToken('refresh-test.testnet');

    if (!token.authToken.startsWith('nova-session-')) {
      throw new Error('Token should be generated after refresh');
    }

    // Restore
    mockSdk.authStatus = async () => ({ authenticated: true });

    console.log('✅ Test 10: SDK auth failure triggers refresh');
    passed++;
  } catch (error) {
    mockSdk.authStatus = async () => ({ authenticated: true });
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
runAuthTests()
  .then(({ passed, failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
