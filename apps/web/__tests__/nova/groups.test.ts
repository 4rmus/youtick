/**
 * NOVA Groups Tests
 *
 * Tests group management, member operations, and access control.
 * Uses SDK mock — no simulation fallbacks.
 */

// Set API key flag BEFORE importing any nova modules
process.env.NEXT_PUBLIC_NOVA_API_KEY = 'enabled';
process.env.NEXT_PUBLIC_NOVA_ACCOUNT_ID = 'test.nova-sdk.near';

// Install SDK mock BEFORE any nova imports
import { installNovaSdkMock } from '../mocks/nova-sdk';
installNovaSdkMock();

import {
  isGroupMember,
  getGroupMembers,
  getGroup
} from '../../lib/nova/groups';
import { NovaError, CreateGroupParams } from '../../lib/nova/types';
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
async function runGroupsTests() {
  console.log('\n🧪 NOVA Groups Tests\n');

  let passed = 0;
  let failed = 0;

  const ownerAccount = 'owner.testnet';
  const member1 = 'member1.testnet';

  setNovaConfig({ apiKey: 'enabled', novaAccountId: 'test.nova-sdk.near' });

  // Test 1: Check group membership returns boolean
  try {
    const groupId = 'test-group-id';
    const isMember = await isGroupMember(groupId, member1);

    if (typeof isMember !== 'boolean') {
      throw new Error('Should return boolean');
    }

    console.log('✅ Test 1: Check group membership works');
    passed++;
  } catch (error) {
    console.error('❌ Test 1 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 2: Get group members returns array
  try {
    const groupId = 'test-group-id';
    const members = await getGroupMembers(groupId, ownerAccount);

    if (!Array.isArray(members)) {
      throw new Error('Should return array');
    }

    console.log('✅ Test 2: Get group members works');
    passed++;
  } catch (error) {
    console.error('❌ Test 2 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 3: Get group metadata
  try {
    const groupId = 'test-group-id';
    const group = await getGroup(groupId, ownerAccount);

    if (!group) {
      throw new Error('Group not returned');
    }
    if (group.groupId !== groupId) {
      throw new Error('Group ID mismatch');
    }
    if (group.owner !== ownerAccount) {
      throw new Error('Owner mismatch');
    }
    if (!Array.isArray(group.members)) {
      throw new Error('Members should be array');
    }
    if (typeof group.name !== 'string') {
      throw new Error('Name should be string');
    }

    console.log('✅ Test 3: Get group metadata works');
    passed++;
  } catch (error) {
    console.error('❌ Test 3 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 4: Operations fail without API key
  try {
    setNovaConfig({ apiKey: undefined });

    const { createGroup } = await import('../../lib/nova/groups');

    const params: CreateGroupParams = {
      name: 'Test Group',
      owner: 'test.testnet',
      members: ['test.testnet'],
      cid: 'QmTest'
    };

    try {
      await createGroup(params);
      throw new Error('Should have thrown');
    } catch (error) {
      if (!(error instanceof NovaError)) {
        throw new Error(`Wrong error type: ${error}`);
      }
    }

    setNovaConfig({ apiKey: 'enabled' });

    console.log('✅ Test 4: Operations fail without API key');
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
runGroupsTests()
  .then(({ passed, failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
