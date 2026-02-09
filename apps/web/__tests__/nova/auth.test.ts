/**
 * NOVA Authentication Tests
 *
 * Tests Session Key authentication, token caching, and error handling.
 */

import {
  generateNovaAuthToken,
  clearNovaAuthCache,
  hasValidNovaAuthToken,
  getCachedToken,
  refreshNovaAuthToken,
  getTokenExpiry
} from '../../lib/nova/auth';
import { NovaError, NovaAuthToken } from '../../lib/nova/types';
import * as crypto from 'crypto';
import * as nacl from 'tweetnacl';

// Mock BrowserKeyStore to avoid near-api-js import issues
const BrowserKeyStore = {
  getKey: async (accountId: string): Promise<any> => null
};

// Mock Session Key implementation for testing
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

// Mock localStorage for browser environment
const mockLocalStorage = new Map<string, string>();
global.localStorage = {
  getItem: (key: string) => mockLocalStorage.get(key) || null,
  setItem: (key: string, value: string) => mockLocalStorage.set(key, value),
  removeItem: (key: string) => mockLocalStorage.delete(key),
  clear: () => mockLocalStorage.clear(),
  length: 0,
  key: (index: number) => null
} as any;

// Test suite
async function runAuthTests() {
  console.log('\n🧪 NOVA Authentication Tests\n');

  let passed = 0;
  let failed = 0;

  const testAccountId = 'test-user.testnet';

  // Setup: Create mock Session Key
  async function setupMockSessionKey() {
    const mockKey = new MockSessionKey();
    // Store in localStorage (mocked)
    const keyData = JSON.stringify({
      accountId: testAccountId,
      publicKey: mockKey.getPublicKey().toString(),
      // Store the keypair for sign method
      _mock: true
    });
    mockLocalStorage.set(`near-session-key:${testAccountId}`, keyData);

    // Mock BrowserKeyStore.getKey to return our mock key
    const originalGetKey = BrowserKeyStore.getKey;
    BrowserKeyStore.getKey = async (accountId: string) => {
      if (accountId === testAccountId) {
        return mockKey as any;
      }
      return originalGetKey.call(BrowserKeyStore, accountId);
    };

    return mockKey;
  }

  // Test 1: Session Key missing error
  try {
    clearNovaAuthCache(); // Clear any cache first

    try {
      await generateNovaAuthToken('nonexistent.testnet');
      throw new Error('Should have thrown NO_SESSION_KEY error');
    } catch (error) {
      if (!(error instanceof NovaError)) {
        throw new Error('Wrong error type');
      }
      if (error.code !== 'NO_SESSION_KEY') {
        throw new Error(`Wrong error code: ${error.code}`);
      }
    }

    console.log('✅ Test 1: Session Key missing error works');
    passed++;
  } catch (error) {
    console.error('❌ Test 1 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 2: Token generation with Session Key
  try {
    await setupMockSessionKey();

    const token = await generateNovaAuthToken(testAccountId);

    if (!token.authToken) {
      throw new Error('Auth token not generated');
    }
    if (token.accountId !== testAccountId) {
      throw new Error('Account ID mismatch');
    }
    if (!token.expiresAt || token.expiresAt <= Date.now()) {
      throw new Error('Invalid expiry time');
    }

    console.log('✅ Test 2: Token generation with Session Key works');
    passed++;
  } catch (error) {
    console.error('❌ Test 2 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 3: Token caching
  try {
    clearNovaAuthCache();
    await setupMockSessionKey();

    // Generate token
    const token1 = await generateNovaAuthToken(testAccountId);

    // Check cache
    const hasCached = hasValidNovaAuthToken(testAccountId);
    if (!hasCached) {
      throw new Error('Token not cached');
    }

    // Get cached token
    const token2 = await generateNovaAuthToken(testAccountId);

    // Should be same token (from cache)
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
    await setupMockSessionKey();

    // No token yet
    const noCached = getCachedToken(testAccountId);
    if (noCached) {
      throw new Error('Should not have cached token yet');
    }

    // Generate token
    await generateNovaAuthToken(testAccountId);

    // Should have cached token now
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
    await setupMockSessionKey();

    // Generate token
    await generateNovaAuthToken(testAccountId);

    // Verify cached
    if (!hasValidNovaAuthToken(testAccountId)) {
      throw new Error('Token should be cached');
    }

    // Clear cache
    clearNovaAuthCache(testAccountId);

    // Verify cleared
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
    await setupMockSessionKey();

    const token1 = await generateNovaAuthToken(testAccountId);

    // Wait a bit to ensure timestamp differs
    await new Promise(resolve => setTimeout(resolve, 100));

    const token2 = await refreshNovaAuthToken(testAccountId);

    // Should be different tokens (refresh bypasses cache)
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
    await setupMockSessionKey();

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
      expiresAt: Date.now() - 1000 // 1 second ago
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
    await setupMockSessionKey();

    const token = await generateNovaAuthToken(testAccountId);

    // Validate token structure
    if (typeof token.authToken !== 'string' || token.authToken.length === 0) {
      throw new Error('Invalid authToken');
    }
    if (typeof token.accountId !== 'string' || token.accountId !== testAccountId) {
      throw new Error('Invalid accountId');
    }
    if (typeof token.expiresAt !== 'number' || token.expiresAt <= Date.now()) {
      throw new Error('Invalid expiresAt');
    }
    // teeAttestation is optional
    if (token.teeAttestation && typeof token.teeAttestation !== 'string') {
      throw new Error('Invalid teeAttestation');
    }

    console.log('✅ Test 9: Token structure validation passes');
    passed++;
  } catch (error) {
    console.error('❌ Test 9 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 10: Multiple account caching
  try {
    clearNovaAuthCache();

    const account1 = 'user1.testnet';
    const account2 = 'user2.testnet';

    // Setup mock keys for both accounts
    const setupAccountKey = async (accountId: string) => {
      const mockKey = new MockSessionKey();
      const originalGetKey = BrowserKeyStore.getKey;
      BrowserKeyStore.getKey = async (id: string) => {
        if (id === accountId) return mockKey as any;
        return originalGetKey.call(BrowserKeyStore, id);
      };
    };

    await setupAccountKey(account1);
    await setupAccountKey(account2);

    // Generate tokens for both
    const token1 = await generateNovaAuthToken(account1);
    const token2 = await generateNovaAuthToken(account2);

    // Both should be cached
    if (!hasValidNovaAuthToken(account1)) {
      throw new Error('Account 1 token not cached');
    }
    if (!hasValidNovaAuthToken(account2)) {
      throw new Error('Account 2 token not cached');
    }

    // Tokens should be different
    if (token1.authToken === token2.authToken) {
      throw new Error('Tokens should be different for different accounts');
    }

    // Clear one account
    clearNovaAuthCache(account1);

    // Account 1 should be cleared, account 2 should remain
    if (hasValidNovaAuthToken(account1)) {
      throw new Error('Account 1 should be cleared');
    }
    if (!hasValidNovaAuthToken(account2)) {
      throw new Error('Account 2 should still be cached');
    }

    console.log('✅ Test 10: Multiple account caching works');
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
runAuthTests()
  .then(({ passed, failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
