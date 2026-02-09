/**
 * NOVA TEE Attestation Verification Tests
 *
 * Tests the pure verifyAttestationData() function and cache helpers.
 * Follows the manual runner pattern from auth.test.ts.
 */

import {
  verifyAttestationData,
  isAttestationStale,
  invalidateAttestationCache,
  getCachedAttestation,
} from '../../lib/nova/attestation';
import type { TEEAttestation } from '../../lib/nova/types';

// ============================================================================
// Test Helpers
// ============================================================================

/** Create a valid attestation object for testing */
function makeAttestation(overrides?: Partial<TEEAttestation>): TEEAttestation {
  const now = Date.now();
  return {
    platform: 'phala',
    enclave_hash: 'abc123def456',
    quote: 'QUOTE_DATA_HEX',
    report: 'REPORT_BODY',
    timestamp: now - 5000, // 5 seconds ago
    valid_until: now + 3600_000, // 1 hour from now
    ...overrides,
  };
}

// ============================================================================
// Test Suite
// ============================================================================

async function runAttestationTests() {
  console.log('\n🧪 NOVA TEE Attestation Verification Tests\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Valid attestation passes all checks
  try {
    const att = makeAttestation();
    const result = verifyAttestationData(att);

    if (!result.verified) throw new Error(`Should pass: ${result.error}`);
    if (result.platform !== 'phala') throw new Error('Wrong platform');
    if (result.enclaveHash !== 'abc123def456') throw new Error('Wrong enclave hash');
    if (result.failedCheck) throw new Error('Should have no failedCheck');

    console.log('✅ Test 1: Valid attestation passes all checks');
    passed++;
  } catch (error) {
    console.error('❌ Test 1 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 2: Missing field fails structure check
  try {
    const att = makeAttestation({ platform: '' });
    const result = verifyAttestationData(att);

    if (result.verified) throw new Error('Should fail on empty platform');
    if (result.failedCheck !== 'structure') throw new Error(`Wrong failedCheck: ${result.failedCheck}`);

    console.log('✅ Test 2: Missing/empty field fails structure check');
    passed++;
  } catch (error) {
    console.error('❌ Test 2 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 3: Wrong type fails structure check
  try {
    const att = makeAttestation({ timestamp: 'not-a-number' as unknown as number });
    const result = verifyAttestationData(att);

    if (result.verified) throw new Error('Should fail on wrong type');
    if (result.failedCheck !== 'structure') throw new Error(`Wrong failedCheck: ${result.failedCheck}`);

    console.log('✅ Test 3: Wrong type fails structure check');
    passed++;
  } catch (error) {
    console.error('❌ Test 3 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 4: Stale attestation fails freshness check
  try {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const att = makeAttestation({
      timestamp: twoHoursAgo,
      valid_until: Date.now() + 3600_000, // still valid
    });
    const result = verifyAttestationData(att);

    if (result.verified) throw new Error('Should fail on stale timestamp');
    if (result.failedCheck !== 'freshness') throw new Error(`Wrong failedCheck: ${result.failedCheck}`);

    console.log('✅ Test 4: Stale attestation fails freshness check');
    passed++;
  } catch (error) {
    console.error('❌ Test 4 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 5: Expired valid_until fails freshness check
  try {
    const att = makeAttestation({
      timestamp: Date.now() - 5000,
      valid_until: Date.now() - 1000, // expired 1s ago
    });
    const result = verifyAttestationData(att);

    if (result.verified) throw new Error('Should fail on expired valid_until');
    if (result.failedCheck !== 'freshness') throw new Error(`Wrong failedCheck: ${result.failedCheck}`);
    if (!result.error?.includes('expired')) throw new Error('Error should mention expired');

    console.log('✅ Test 5: Expired valid_until fails freshness check');
    passed++;
  } catch (error) {
    console.error('❌ Test 5 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 6: Enclave hash mismatch fails when expectedEnclaveHash provided
  try {
    const att = makeAttestation({ enclave_hash: 'actual_hash' });
    const result = verifyAttestationData(att, {
      expectedEnclaveHash: 'expected_hash',
    });

    if (result.verified) throw new Error('Should fail on hash mismatch');
    if (result.failedCheck !== 'enclave_hash') throw new Error(`Wrong failedCheck: ${result.failedCheck}`);
    if (!result.error?.includes('mismatch')) throw new Error('Error should mention mismatch');

    console.log('✅ Test 6: Enclave hash mismatch fails with expectedEnclaveHash');
    passed++;
  } catch (error) {
    console.error('❌ Test 6 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 7: Matching enclave hash passes
  try {
    const att = makeAttestation({ enclave_hash: 'matching_hash' });
    const result = verifyAttestationData(att, {
      expectedEnclaveHash: 'matching_hash',
    });

    if (!result.verified) throw new Error(`Should pass with matching hash: ${result.error}`);

    console.log('✅ Test 7: Matching enclave hash passes');
    passed++;
  } catch (error) {
    console.error('❌ Test 7 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 8: No expectedEnclaveHash skips hash check
  try {
    const att = makeAttestation({ enclave_hash: 'any_hash' });
    const result = verifyAttestationData(att, {
      expectedEnclaveHash: undefined,
    });

    if (!result.verified) throw new Error(`Should pass without expected hash: ${result.error}`);

    console.log('✅ Test 8: No expectedEnclaveHash skips hash check');
    passed++;
  } catch (error) {
    console.error('❌ Test 8 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 9: Custom maxAge override works
  try {
    const thirtySecondsAgo = Date.now() - 30_000;
    const att = makeAttestation({ timestamp: thirtySecondsAgo });

    // Default maxAge (1 hour) should pass
    const result1 = verifyAttestationData(att);
    if (!result1.verified) throw new Error(`Should pass with default maxAge: ${result1.error}`);

    // Custom maxAge (10 seconds) should fail
    const result2 = verifyAttestationData(att, { maxAge: 10_000 });
    if (result2.verified) throw new Error('Should fail with 10s maxAge');
    if (result2.failedCheck !== 'freshness') throw new Error(`Wrong failedCheck: ${result2.failedCheck}`);

    console.log('✅ Test 9: Custom maxAge override works');
    passed++;
  } catch (error) {
    console.error('❌ Test 9 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 10: isAttestationStale helper
  try {
    const fresh = makeAttestation({ timestamp: Date.now() - 1000 });
    const stale = makeAttestation({ timestamp: Date.now() - 2 * 60 * 60 * 1000 });

    if (isAttestationStale(fresh)) throw new Error('Fresh should not be stale');
    if (!isAttestationStale(stale)) throw new Error('2h old should be stale');
    if (!isAttestationStale(fresh, 500)) throw new Error('1s old should be stale with 500ms limit');

    console.log('✅ Test 10: isAttestationStale helper works');
    passed++;
  } catch (error) {
    console.error('❌ Test 10 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 11: Cache starts empty
  try {
    invalidateAttestationCache();
    const cached = getCachedAttestation();
    if (cached !== null) throw new Error('Cache should be null after invalidation');

    console.log('✅ Test 11: Cache starts empty / invalidation works');
    passed++;
  } catch (error) {
    console.error('❌ Test 11 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 12: Verification result includes metadata on success
  try {
    const now = Date.now();
    const att = makeAttestation({
      platform: 'sgx',
      enclave_hash: 'hash_xyz',
      timestamp: now - 1000,
      valid_until: now + 3600_000,
    });
    const result = verifyAttestationData(att);

    if (!result.verified) throw new Error(`Should pass: ${result.error}`);
    if (result.platform !== 'sgx') throw new Error('platform should be sgx');
    if (result.enclaveHash !== 'hash_xyz') throw new Error('enclaveHash mismatch');
    if (result.attestedAt !== now - 1000) throw new Error('attestedAt mismatch');
    if (result.validUntil !== now + 3600_000) throw new Error('validUntil mismatch');

    console.log('✅ Test 12: Verification result includes metadata on success');
    passed++;
  } catch (error) {
    console.error('❌ Test 12 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 13: Verification result includes metadata on failure
  try {
    const att = makeAttestation({ enclave_hash: 'wrong' });
    const result = verifyAttestationData(att, { expectedEnclaveHash: 'right' });

    if (result.verified) throw new Error('Should fail');
    if (result.platform !== 'phala') throw new Error('Should still include platform');
    if (result.enclaveHash !== 'wrong') throw new Error('Should include actual hash');
    if (!result.attestedAt) throw new Error('Should include attestedAt');
    if (!result.validUntil) throw new Error('Should include validUntil');

    console.log('✅ Test 13: Verification result includes metadata on failure');
    passed++;
  } catch (error) {
    console.error('❌ Test 13 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50) + '\n');

  return { passed, failed };
}

// Run tests
runAttestationTests()
  .then(({ passed, failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
