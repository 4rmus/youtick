/**
 * NOVA Group Management Module
 *
 * Handles NOVA group-based access control via TEE-enforced groups.
 */

import { generateNovaAuthToken } from './auth';
import { NovaGroup, NovaError, CreateGroupParams } from './types';
import { hasApiKey, getNovaSdk, isSimulationAllowed } from './config';

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
  console.log('[NOVA Groups] Creating group...', {
    name: params.name,
    owner: params.owner,
    members: params.members.length,
    cid: params.cid
  });

  try {
    // 1. Generate auth token for owner
    const authToken = await generateNovaAuthToken(params.owner);

    // 2. Create group via NOVA API
    // TODO: Replace with actual NOVA SDK call when API key available
    const groupId = await createGroupViaNOVA(params, authToken.authToken);

    console.log('[NOVA Groups] Group created successfully:', groupId);
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
    if (!isSimulationAllowed()) {
      throw new NovaError('INVALID_CONFIG', 'Nova API key required in production. Set NEXT_PUBLIC_NOVA_API_KEY.');
    }
    console.warn('[NOVA Groups] API key not configured - simulating group creation');

    // Return simulated group ID
    const groupId = `GROUP_${Date.now()}_${params.cid.substring(0, 8)}`;
    console.log('[NOVA Groups] Simulated group created:', groupId);

    return groupId;
  }

  try {
    const sdk = getNovaSdk();

    // Register group with NOVA
    const groupId = params.name.replace(/\s+/g, '_').toLowerCase();

    console.log('[NOVA Groups] Registering group:', groupId);
    const transId = await sdk.registerGroup(groupId);

    console.log('[NOVA Groups] Group registered:', {
      groupId,
      transId,
      owner: params.owner
    });

    // Add members to group
    for (const member of params.members) {
      if (member !== params.owner) { // Owner already has access
        await sdk.addGroupMember(groupId, member);
        console.log('[NOVA Groups] Added member:', member);
      }
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
  console.log('[NOVA Groups] Adding member to group...', {
    groupId,
    newMember,
    owner
  });

  try {
    // 1. Generate auth token for owner
    const authToken = await generateNovaAuthToken(owner);

    // 2. Add member via NOVA SDK
    await addMemberViaNOVA(groupId, newMember, authToken.authToken, owner);

    console.log('[NOVA Groups] Member added successfully');
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
    if (!isSimulationAllowed()) {
      throw new NovaError('INVALID_CONFIG', 'Nova API key required in production. Set NEXT_PUBLIC_NOVA_API_KEY.');
    }
    console.warn('[NOVA Groups] API key not configured - simulating member addition');
    console.log('[NOVA Groups] Simulated: Added', newMember, 'to', groupId);
    return;
  }

  console.log('[NOVA Groups] Adding member via SDK:', {
    groupId,
    newMember,
    owner
  });

  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [2000, 4000, 8000]; // Escalating delays for nonce propagation

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const sdk = getNovaSdk();
      const transId = await sdk.addGroupMember(groupId, newMember);

      console.log('[NOVA Groups] Member added successfully:', {
        transId,
        newMember,
        groupId,
        attempt: attempt + 1
      });
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
  console.log('[NOVA Groups] Checking group membership...', {
    groupId,
    accountId
  });

  try {
    // Query NOVA API (no auth needed for membership check)
    // TODO: Replace with actual NOVA SDK call when API key available
    const isMember = await checkMembershipViaNOVA(groupId, accountId);

    console.log('[NOVA Groups] Membership check result:', isMember);
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
    if (!isSimulationAllowed()) {
      throw new NovaError('INVALID_CONFIG', 'Nova API key required in production. Set NEXT_PUBLIC_NOVA_API_KEY.');
    }
    console.warn('[NOVA Groups] API key not configured - simulating membership check');
    return true; // Dev only
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
  console.log('[NOVA Groups] Getting group members...', {
    groupId,
    owner
  });

  try {
    // 1. Generate auth token for owner
    const authToken = await generateNovaAuthToken(owner);

    // 2. Query members via NOVA API
    // TODO: Replace with actual NOVA SDK call when API key available
    const members = await getMembersViaNOVA(groupId, authToken.authToken);

    console.log('[NOVA Groups] Retrieved', members.length, 'members');
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
    if (!isSimulationAllowed()) {
      throw new NovaError('INVALID_CONFIG', 'Nova API key required in production. Set NEXT_PUBLIC_NOVA_API_KEY.');
    }
    console.warn('[NOVA Groups] API key not configured - simulating member query');
    return []; // Simulation: no members
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
  console.log('[NOVA Groups] Getting group metadata...', { groupId, owner });

  const members = await getGroupMembers(groupId, owner);

  // TODO: Get full metadata from NOVA API
  return {
    groupId,
    name: `Group ${groupId}`,
    owner,
    members,
    contentCid: 'unknown', // Would come from API
    createdAt: Date.now()
  };
}

