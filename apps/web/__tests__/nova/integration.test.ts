/**
 * NOVA Integration Tests
 *
 * Tests complete workflows across multiple modules:
 * - Upload → Group Creation → Access Control → Fetch
 * - Gift System Simulation
 * - Multi-user Scenarios
 *
 * Uses SDK mock — no simulation fallbacks.
 */

// Set API key flag BEFORE importing any nova modules
process.env.NEXT_PUBLIC_NOVA_API_KEY = 'enabled';
process.env.NEXT_PUBLIC_NOVA_ACCOUNT_ID = 'test.nova-sdk.near';

// Install SDK mock BEFORE any nova imports
import { installNovaSdkMock } from '../mocks/nova-sdk';
installNovaSdkMock();

import {
  uploadFile,
  fetchFile,
  uploadJson
} from '../../lib/nova/client';
import {
  createGroup,
  addGroupMember,
  isGroupMember
} from '../../lib/nova/groups';
import {
  generateNovaAuthToken,
  clearNovaAuthCache,
  hasValidNovaAuthToken
} from '../../lib/nova/auth';
import { initializeNOVA, getNovaStatus } from '../../lib/nova';
import { setNovaConfig } from '../../lib/nova/config';

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

// Test suite
async function runIntegrationTests() {
  console.log('\n🧪 NOVA Integration Tests\n');

  let passed = 0;
  let failed = 0;

  setNovaConfig({ apiKey: 'enabled', novaAccountId: 'test.nova-sdk.near' });

  // Test 1: Complete Upload → Group → Fetch Flow
  try {
    console.log('\n📋 Test 1: Complete Upload → Group → Fetch Flow');

    const creator = 'creator.testnet';
    clearNovaAuthCache();

    // Step 1: Upload video
    console.log('  1️⃣ Uploading video...');
    const videoFile = new Blob(['test video content'], { type: 'video/mp4' });
    const uploadResult = await uploadFile(videoFile, creator, {
      filename: 'test-video.mp4'
    });

    if (!uploadResult.cid || !uploadResult.groupId) {
      throw new Error('Upload failed');
    }
    console.log(`     ✓ Video uploaded: CID=${uploadResult.cid.substring(0, 12)}...`);
    console.log(`     ✓ Group created: ${uploadResult.groupId.substring(0, 20)}...`);

    // Step 2: Verify creator can fetch
    console.log('  2️⃣ Verifying creator access...');
    const fetchedData = await fetchFile(uploadResult.cid, creator, { groupId: uploadResult.groupId, keyCid: uploadResult.keyCid });
    if (!(fetchedData instanceof Uint8Array)) {
      throw new Error('Fetch failed');
    }
    console.log(`     ✓ Creator can access video (${fetchedData.byteLength} bytes)`);

    // Step 3: Verify group membership
    console.log('  3️⃣ Checking group membership...');
    const isCreatorMember = await isGroupMember(uploadResult.groupId, creator);
    if (!isCreatorMember) {
      throw new Error('Creator should be group member');
    }
    console.log('     ✓ Creator is group member');

    console.log('✅ Test 1: Complete flow works\n');
    passed++;
  } catch (error) {
    console.error('❌ Test 1 Failed:', error instanceof Error ? error.message : String(error), '\n');
    failed++;
  }

  // Test 2: Purchase Flow Simulation
  try {
    console.log('📋 Test 2: Purchase Flow Simulation');

    const creator = 'creator.testnet';
    const buyer = 'buyer.testnet';
    clearNovaAuthCache();

    // Step 1: Creator uploads video
    console.log('  1️⃣ Creator uploads video...');
    const videoFile = new Blob(['premium video'], { type: 'video/mp4' });
    const uploadResult = await uploadFile(videoFile, creator);
    console.log(`     ✓ Video CID: ${uploadResult.cid.substring(0, 12)}...`);

    // Step 2: Simulate purchase - add buyer to group
    console.log('  2️⃣ Buyer purchases access...');
    await addGroupMember(uploadResult.groupId, buyer, creator);
    console.log('     ✓ Buyer added to group');

    // Step 3: Buyer can now access video
    console.log('  3️⃣ Buyer accesses video...');
    const buyerData = await fetchFile(uploadResult.cid, buyer, { groupId: uploadResult.groupId, keyCid: uploadResult.keyCid });
    if (!(buyerData instanceof Uint8Array)) {
      throw new Error('Buyer fetch failed');
    }
    console.log('     ✓ Buyer successfully accessed video');

    // Step 4: Verify both are members
    console.log('  4️⃣ Verifying memberships...');
    const isCreatorMember = await isGroupMember(uploadResult.groupId, creator);
    const isBuyerMember = await isGroupMember(uploadResult.groupId, buyer);

    if (!isCreatorMember || !isBuyerMember) {
      throw new Error('Membership verification failed');
    }
    console.log('     ✓ Both creator and buyer are members');

    console.log('✅ Test 2: Purchase flow works\n');
    passed++;
  } catch (error) {
    console.error('❌ Test 2 Failed:', error instanceof Error ? error.message : String(error), '\n');
    failed++;
  }

  // Test 3: Gift System Simulation
  try {
    console.log('📋 Test 3: Gift System Simulation');

    const creator = 'creator.testnet';
    const giftRecipient = 'gift-recipient.testnet';
    clearNovaAuthCache();

    // Step 1: Creator uploads video
    console.log('  1️⃣ Creator uploads video for gifting...');
    const videoFile = new Blob(['gift video'], { type: 'video/mp4' });
    const uploadResult = await uploadFile(videoFile, creator);
    console.log(`     ✓ Video uploaded for gifts`);

    // Step 2: Simulate gift claim - add recipient to group
    console.log('  2️⃣ Gift claimed by recipient...');
    await addGroupMember(uploadResult.groupId, giftRecipient, creator);
    console.log('     ✓ Recipient added to group');

    // Step 3: Recipient can access video
    console.log('  3️⃣ Recipient accesses gifted video...');
    const recipientData = await fetchFile(uploadResult.cid, giftRecipient, { groupId: uploadResult.groupId, keyCid: uploadResult.keyCid });
    if (!(recipientData instanceof Uint8Array)) {
      throw new Error('Recipient fetch failed');
    }
    console.log('     ✓ Recipient successfully accessed gift');

    console.log('✅ Test 3: Gift system works\n');
    passed++;
  } catch (error) {
    console.error('❌ Test 3 Failed:', error instanceof Error ? error.message : String(error), '\n');
    failed++;
  }

  // Test 4: Metadata Upload Flow
  try {
    console.log('📋 Test 4: Metadata Upload Flow');

    const creator = 'creator.testnet';
    clearNovaAuthCache();

    // Step 1: Upload video
    console.log('  1️⃣ Uploading video...');
    const videoFile = new Blob(['video'], { type: 'video/mp4' });
    const videoResult = await uploadFile(videoFile, creator);

    // Step 2: Upload metadata
    console.log('  2️⃣ Uploading metadata...');
    const metadata = {
      title: 'Test Video',
      description: 'Integration test video',
      creator: creator,
      videoCid: videoResult.cid,
      createdAt: Date.now()
    };

    const metadataResult = await uploadJson(metadata, creator, 'metadata.json');
    if (!metadataResult.cid) {
      throw new Error('Metadata upload failed');
    }
    console.log(`     ✓ Metadata uploaded: CID=${metadataResult.cid.substring(0, 12)}...`);

    // Step 3: Both should have separate groups
    if (videoResult.groupId === metadataResult.groupId) {
      throw new Error('Video and metadata should have different groups');
    }
    console.log('     ✓ Separate groups for video and metadata');

    console.log('✅ Test 4: Metadata upload works\n');
    passed++;
  } catch (error) {
    console.error('❌ Test 4 Failed:', error instanceof Error ? error.message : String(error), '\n');
    failed++;
  }

  // Test 5: Module Initialization
  try {
    console.log('📋 Test 5: Module Initialization');

    // Initialize NOVA
    console.log('  1️⃣ Initializing NOVA module...');
    const initialized = initializeNOVA();
    console.log(`     ✓ Module initialized: ${initialized}`);

    // Get module status
    console.log('  2️⃣ Getting module status...');
    const status = getNovaStatus();

    if (typeof status.configured !== 'boolean') {
      throw new Error('Invalid configured status');
    }
    if (typeof status.hasApiKey !== 'boolean') {
      throw new Error('Invalid hasApiKey status');
    }
    if (typeof status.network !== 'string') {
      throw new Error('Invalid network status');
    }
    if (typeof status.version !== 'string') {
      throw new Error('Invalid version status');
    }

    console.log('     ✓ Status retrieved:');
    console.log(`       - Configured: ${status.configured}`);
    console.log(`       - Has API Key: ${status.hasApiKey}`);
    console.log(`       - Network: ${status.network}`);
    console.log(`       - Version: ${status.version}`);

    console.log('✅ Test 5: Module initialization works\n');
    passed++;
  } catch (error) {
    console.error('❌ Test 5 Failed:', error instanceof Error ? error.message : String(error), '\n');
    failed++;
  }

  // Test 6: Multi-Account Token Caching
  try {
    console.log('📋 Test 6: Multi-Account Token Caching');

    const accounts = ['user1.testnet', 'user2.testnet', 'user3.testnet'];
    clearNovaAuthCache();

    // Generate tokens for all accounts
    console.log('  1️⃣ Generating tokens for 3 accounts...');
    for (const account of accounts) {
      await generateNovaAuthToken(account);
    }
    console.log('     ✓ All tokens generated');

    // Verify all are cached
    console.log('  2️⃣ Verifying all tokens are cached...');
    for (const account of accounts) {
      if (!hasValidNovaAuthToken(account)) {
        throw new Error(`Token for ${account} not cached`);
      }
    }
    console.log('     ✓ All tokens cached');

    // Clear specific account
    console.log('  3️⃣ Clearing one account cache...');
    clearNovaAuthCache(accounts[0]);

    if (hasValidNovaAuthToken(accounts[0])) {
      throw new Error('Account 0 should be cleared');
    }
    if (!hasValidNovaAuthToken(accounts[1]) || !hasValidNovaAuthToken(accounts[2])) {
      throw new Error('Other accounts should remain cached');
    }
    console.log('     ✓ Selective cache clearing works');

    console.log('✅ Test 6: Multi-account caching works\n');
    passed++;
  } catch (error) {
    console.error('❌ Test 6 Failed:', error instanceof Error ? error.message : String(error), '\n');
    failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Integration Test Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));
  console.log('\n💡 Key Workflows Tested:');
  console.log('   ✓ Complete upload → group → fetch flow');
  console.log('   ✓ Purchase simulation (buyer gets access)');
  console.log('   ✓ Gift system (claim with access)');
  console.log('   ✓ Metadata management');
  console.log('   ✓ Module initialization and status');
  console.log('   ✓ Multi-account token caching\n');

  return { passed, failed };
}

// Run tests
runIntegrationTests()
  .then(({ passed, failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
