/**
 * NOVA Group Management Module
 *
 * Handles NOVA group-based access control via TEE-enforced groups.
 */

import { generateNovaAuthToken } from './auth';
import { NovaGroup, NovaError, CreateGroupParams } from './types';
import { hasApiKey, getNovaSdk, createNovaGroup } from './config';

/**
 * Create NOVA group for content access control
 *
 * Groups are managed by NOVA TEE and enforce access at decryption time.
 *
 * @param params - Group creation parameters
 * @returns Group ID
 * @throws NovaError if group creation fails
 */
export async function createGroup(params: CreateGroupParams): Promise<string> {
  try {
    // 1. Generate auth token for owner
    const authToken = await generateNovaAuthToken(params.owner);

    // 2. Create group via NOVA SDK
    const groupId = await createGroupViaNOVA(params, authToken.authToken);

    console.log('[DECENTRALIZATION_METRIC] nova_group_created', {
      groupId,
      owner: params.owner,
      memberCount: params.members.length,
      contentCid: params.cid
    });

    return groupId;

  } catch (error: unknown) {
    console.error('[NOVA Groups] Group creation failed:', error);

    if (error instanceof NovaError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new NovaError(
      'GROUP_CREATE_FAILED',
      `Failed to create group: ${errorMessage}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Create group via NOVA SDK
 *
 * Note: In real NOVA SDK, group registration is done during upload.
 * This function is a wrapper that returns the group ID for tracking.
 */
async function createGroupViaNOVA(
  params: CreateGroupParams,
  authToken: string
): Promise<string> {
  if (!hasApiKey()) {
    throw new NovaError('INVALID_CONFIG', 'Nova API key required. Set NOVA_API_KEY.');
  }

  try {
    const sdk = getNovaSdk();

    // Create group on-chain + TEE via nova_create_group MCP tool
    const requestedGroupId = params.name.replace(/\s+/g, '_').toLowerCase();

    const groupId = await createNovaGroup(requestedGroupId);

    // Add all members to group (including the content owner, since the
    // Nova group is owned by the platform account, not the NEAR user)
    for (const member of params.members) {
      await sdk.addGroupMember(groupId, member);
    }

    return groupId;

  } catch (error: unknown) {
    console.error('[NOVA Groups] SDK group creation failed:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);

    // Map errors
    if (errorMessage.includes('Insufficient')) {
      throw new NovaError('GROUP_CREATE_FAILED', 'Insufficient NEAR balance for group registration');
    }

    throw new NovaError('GROUP_CREATE_FAILED', `NOVA SDK group creation failed: ${errorMessage}`, error instanceof Error ? error : undefined);
  }
}

/**
 * Add member to NOVA group (grant access)
 *
 * This is called after NFT purchase to grant video access.
 *
 * @param groupId - NOVA group ID
 * @param newMember - NEAR account to add
 * @param owner - Group owner account
 * @throws NovaError if operation fails
 */
export async function addGroupMember(
  groupId: string,
  newMember: string,
  owner: string
): Promise<void> {
  try {
    // 1. Generate auth token for owner
    const authToken = await generateNovaAuthToken(owner);

    // 2. Add member via NOVA SDK
    await addMemberViaNOVA(groupId, newMember, authToken.authToken, owner);

    console.log('[DECENTRALIZATION_METRIC] nova_group_member_added', {
      groupId,
      newMember,
      addedBy: owner
    });

  } catch (error: unknown) {
    console.error('[NOVA Groups] Failed to add member:', error);

    if (error instanceof NovaError) {
      throw error;
    }

    throw new NovaError(
      'GROUP_ADD_FAILED',
      `Failed to add member to group: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Add member via NOVA SDK
 */
async function addMemberViaNOVA(
  groupId: string,
  newMember: string,
  authToken: string,
  owner: string
): Promise<void> {
  if (!hasApiKey()) {
    throw new NovaError('INVALID_CONFIG', 'Nova API key required. Set NOVA_API_KEY.');
  }

  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [2000, 4000, 8000]; // Escalating delays for nonce propagation

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const sdk = getNovaSdk();
      await sdk.addGroupMember(groupId, newMember);
      return;

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isNonceError = errorMessage.includes('nonce') || errorMessage.includes('ak_nonce') || errorMessage.includes('tx_nonce');

      if (isNonceError && attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[attempt];
        console.warn(`[NOVA Groups] Nonce conflict on attempt ${attempt + 1}/${MAX_RETRIES}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      console.error('[NOVA Groups] SDK add member failed:', error);

      if (errorMessage.includes('not authorized')) {
        throw new NovaError('GROUP_ADD_FAILED', `Not authorized to add members to group ${groupId}`);
      }

      throw new NovaError('GROUP_ADD_FAILED', `NOVA SDK add member failed: ${errorMessage}`, error instanceof Error ? error : undefined);
    }
  }
}

/**
 * Check if account is member of group
 *
 * Note: TEE enforces this automatically during decryption,
 * but this can be used for UI feedback before attempting fetch.
 *
 * @param groupId - NOVA group ID
 * @param accountId - NEAR account to check
 * @returns true if member, false otherwise
 */
export async function isGroupMember(
  groupId: string,
  accountId: string
): Promise<boolean> {
  try {
    // Query NOVA API (no auth needed for membership check)
    const isMember = await checkMembershipViaNOVA(groupId, accountId);
    return isMember;

  } catch (error: unknown) {
    console.error('[NOVA Groups] Membership check failed:', error);
    // Return false on error (TEE will be authoritative anyway)
    return false;
  }
}

/**
 * Check membership via NOVA API
 */
async function checkMembershipViaNOVA(
  groupId: string,
  accountId: string
): Promise<boolean> {
  if (!hasApiKey()) {
    throw new NovaError('INVALID_CONFIG', 'Nova API key required. Set NOVA_API_KEY.');
  }

  try {
    const sdk = getNovaSdk();
    return await sdk.isAuthorized(groupId, accountId);
  } catch (error) {
    console.error('[NOVA Groups] Membership check failed:', error);
    return false; // TEE will be authoritative anyway
  }
}

/**
 * Get all members of a group
 *
 * @param groupId - NOVA group ID
 * @param owner - Group owner account
 * @returns Array of member account IDs
 * @throws NovaError if query fails
 */
export async function getGroupMembers(
  groupId: string,
  owner: string
): Promise<string[]> {
  try {
    // 1. Generate auth token for owner
    const authToken = await generateNovaAuthToken(owner);

    // 2. Query members via NOVA API
    const members = await getMembersViaNOVA(groupId, authToken.authToken);
    return members;

  } catch (error: unknown) {
    console.error('[NOVA Groups] Failed to get members:', error);

    if (error instanceof NovaError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new NovaError(
      'GROUP_QUERY_FAILED',
      `Failed to get group members: ${errorMessage}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Get members via NOVA API
 */
async function getMembersViaNOVA(
  groupId: string,
  authToken: string
): Promise<string[]> {
  if (!hasApiKey()) {
    throw new NovaError('INVALID_CONFIG', 'Nova API key required. Set NOVA_API_KEY.');
  }

  // Nova SDK does not expose a getGroupMembers method.
  // Member list is managed internally by TEE; return empty for now.
  console.warn('[NOVA Groups] getGroupMembers not available in Nova SDK - returning empty');
  return [];
}

/**
 * Get group metadata
 *
 * @param groupId - NOVA group ID
 * @param owner - Group owner account
 * @returns Group metadata
 */
export async function getGroup(
  groupId: string,
  owner: string
): Promise<NovaGroup> {
  const members = await getGroupMembers(groupId, owner);

  // Nova SDK doesn't expose full group metadata; construct from available data
  return {
    groupId,
    name: `Group ${groupId}`,
    owner,
    members,
    contentCid: 'unknown', // Would come from API
    createdAt: Date.now()
  };
}

