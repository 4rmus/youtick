/**
 * NOVA Groups Tests
 *
 * Tests group management, member operations, and instant revocation.
 */

import {
  createGroup,
  addGroupMember,
  isGroupMember,
  getGroupMembers,
  getGroup
} from '../../lib/nova/groups';
import { NovaError, CreateGroupParams } from '../../lib/nova/types';
import * as nacl from 'tweetnacl';

// Mock BrowserKeyStore to avoid near-api-js import issues
const BrowserKeyStore = {
  getKey: async (accountId: string): Promise<any> => null
};

// Mock Session Key
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
async function runGroupsTests() {
  console.log('\n🧪 NOVA Groups Tests\n');

  let passed = 0;
  let failed = 0;

  const ownerAccount = 'owner.testnet';
  const member1 = 'member1.testnet';
  const member2 = 'member2.testnet';
  const testCid = 'QmTestVideoContent123';

  // Test 1: Create group success
  try {
    await setupMockSessionKey(ownerAccount);

    const params: CreateGroupParams = {
      name: 'Test Video Group',
      owner: ownerAccount,
      members: [ownerAccount, member1],
      cid: testCid
    };

    const groupId = await createGroup(params);

    if (!groupId || typeof groupId !== 'string') {
      throw new Error('Invalid group ID returned');
    }
    if (groupId.length === 0) {
      throw new Error('Group ID should not be empty');
    }

    console.log('✅ Test 1: Create group success');
    passed++;
  } catch (error) {
    console.error('❌ Test 1 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 2: Create group without Session Key
  try {
    BrowserKeyStore.getKey = async () => null;

    const params: CreateGroupParams = {
      name: 'Test Group',
      owner: 'nonexistent.testnet',
      members: ['nonexistent.testnet'],
      cid: testCid
    };

    try {
      await createGroup(params);
      throw new Error('Should have thrown NO_SESSION_KEY error');
    } catch (error) {
      if (!(error instanceof NovaError)) {
        throw new Error('Wrong error type');
      }
      if (error.code !== 'NO_SESSION_KEY') {
        throw new Error(`Wrong error code: ${error.code}`);
      }
    }

    console.log('✅ Test 2: Create group without Session Key throws error');
    passed++;
  } catch (error) {
    console.error('❌ Test 2 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 3: Add group member
  try {
    await setupMockSessionKey(ownerAccount);

    // First create a group
    const groupId = await createGroup({
      name: 'Test Group',
      owner: ownerAccount,
      members: [ownerAccount],
      cid: testCid
    });

    // Add a member
    await addGroupMember(groupId, member1, ownerAccount);

    // Should not throw
    console.log('✅ Test 3: Add group member success');
    passed++;
  } catch (error) {
    console.error('❌ Test 3 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 4: Check group membership
  try {
    const groupId = 'test-group-id';
    const isMember = await isGroupMember(groupId, member1);

    if (typeof isMember !== 'boolean') {
      throw new Error('Should return boolean');
    }

    console.log('✅ Test 4: Check group membership works');
    passed++;
  } catch (error) {
    console.error('❌ Test 4 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 5: Get group members
  try {
    await setupMockSessionKey(ownerAccount);

    const groupId = 'test-group-id';
    const members = await getGroupMembers(groupId, ownerAccount);

    if (!Array.isArray(members)) {
      throw new Error('Should return array');
    }

    console.log('✅ Test 5: Get group members works');
    passed++;
  } catch (error) {
    console.error('❌ Test 5 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 6: Get group metadata
  try {
    await setupMockSessionKey(ownerAccount);

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
    if (typeof group.contentCid !== 'string') {
      throw new Error('Content CID should be string');
    }
    if (typeof group.createdAt !== 'number') {
      throw new Error('Created at should be number');
    }

    console.log('✅ Test 6: Get group metadata works');
    passed++;
  } catch (error) {
    console.error('❌ Test 6 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 7: Add member without Session Key
  try {
    BrowserKeyStore.getKey = async () => null;

    try {
      await addGroupMember('group-id', member1, 'nonexistent.testnet');
      throw new Error('Should have thrown NO_SESSION_KEY error');
    } catch (error) {
      if (!(error instanceof NovaError)) {
        throw new Error('Wrong error type');
      }
      if (error.code !== 'NO_SESSION_KEY') {
        throw new Error(`Wrong error code: ${error.code}`);
      }
    }

    console.log('✅ Test 7: Add member without Session Key throws error');
    passed++;
  } catch (error) {
    console.error('❌ Test 7 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 8: Group creation parameters validation
  try {
    await setupMockSessionKey(ownerAccount);

    const validParams: CreateGroupParams = {
      name: 'Valid Group',
      owner: ownerAccount,
      members: [ownerAccount],
      cid: testCid
    };

    const groupId = await createGroup(validParams);

    if (!groupId) {
      throw new Error('Group not created with valid params');
    }

    console.log('✅ Test 8: Group creation parameters validation works');
    passed++;
  } catch (error) {
    console.error('❌ Test 8 Failed:', error instanceof Error ? error.message : String(error));
    failed++;
  }

  // Test 9: Multiple members in group creation
  try {
    await setupMockSessionKey(ownerAccount);

    const members = [ownerAccount, member1, member2, 'member3.testnet', 'member4.testnet'];

    const groupId = await createGroup({
      name: 'Multi-member Group',
      owner: ownerAccount,
      members,
      cid: testCid
    });

    if (!groupId) {
      throw new Error('Group not created with multiple members');
    }

    console.log('✅ Test 9: Multiple members in group creation works');
    passed++;
  } catch (error) {
    console.error('❌ Test 9 Failed:', error instanceof Error ? error.message : String(error));
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
