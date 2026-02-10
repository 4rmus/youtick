/**
 * NOVA Public Groups Module
 *
 * Manages "public" groups for thumbnails that can be accessed by anyone.
 * This allows thumbnails to be publicly viewable while still using Nova storage.
 *
 * Strategy:
 * - Each creator has a public_thumbs_{creatorAccountId} group
 * - Anyone can auto-join public groups to access thumbnails
 * - Thumbnails remain decrypted for universal read access
 *
 * URL Format: nova://{groupId}/{cid}
 */

import { generateNovaAuthToken } from './auth';
import { NovaError, NovaUploadResult, UploadProgress } from './types';
import { hasApiKey, getNovaSdk, getNovaAccountId, NOVA_CONSTANTS, createNovaGroup } from './config';
import { uploadToCrust, getGatewayUrl as getCrustGatewayUrl, fetchFromGateways, pinOnCrust } from '../crust';

// Local storage key for caching public group IDs
const PUBLIC_GROUP_CACHE_KEY = 'nova_public_groups';

// Cache duration (24 hours)
const CACHE_DURATION = 24 * 60 * 60 * 1000;

// Negative cache: prevent repeated failing retrieve calls (TTL: 60 seconds)
const FETCH_FAIL_CACHE = new Map<string, number>();
const FETCH_FAIL_TTL = 60_000;

/**
 * Public group cache entry
 */
interface PublicGroupCache {
  groupId: string;
  createdAt: number;
}

/**
 * Result of public thumbnail upload
 */
export interface PublicThumbnailResult extends NovaUploadResult {
  /** Nova URL format: nova://{groupId}/{cid} */
  novaUrl: string;
  /** Legacy IPFS gateway URL (for backward compatibility) */
  gatewayUrl: string;
}

/**
 * Get public group prefix
 */
function getPublicGroupPrefix(): string {
  return 'public_thumbs_';
}

/**
 * Generate public group ID for a creator
 *
 * @param creatorAccountId - NEAR account ID of the creator
 * @returns Public group ID
 */
export function getPublicGroupId(creatorAccountId: string): string {
  // Sanitize account ID for group naming
  const sanitized = creatorAccountId.replace(/[^a-zA-Z0-9]/g, '_');
  return `${getPublicGroupPrefix()}${sanitized}`;
}

/**
 * Check if a group ID is a public group
 *
 * @param groupId - NOVA group ID
 * @returns true if public group
 */
export function isPublicGroup(groupId: string): boolean {
  return groupId.startsWith(getPublicGroupPrefix());
}

/**
 * Parse nova:// URL
 *
 * @param novaUrl - URL in format nova://{groupId}/{cid}
 * @returns Parsed components or null if invalid
 */
export function parseNovaUrl(novaUrl: string): { groupId: string; cid: string } | null {
  if (!novaUrl.startsWith('nova://')) {
    return null;
  }

  const parts = novaUrl.replace('nova://', '').split('/');
  if (parts.length !== 2) {
    return null;
  }

  return {
    groupId: parts[0],
    cid: parts[1]
  };
}

/**
 * Create nova:// URL
 *
 * @param groupId - NOVA group ID
 * @param cid - IPFS CID
 * @returns Nova URL
 */
export function createNovaUrl(groupId: string, cid: string): string {
  return `nova://${groupId}/${cid}`;
}

/**
 * Check if URL is a Nova URL
 *
 * @param url - URL to check
 * @returns true if nova:// URL
 */
export function isNovaUrl(url: string): boolean {
  return url.startsWith('nova://');
}

/**
 * Get cached public group ID
 */
function getCachedPublicGroup(creatorAccountId: string): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const cacheStr = localStorage.getItem(PUBLIC_GROUP_CACHE_KEY);
    if (!cacheStr) return null;

    const cache: Record<string, PublicGroupCache> = JSON.parse(cacheStr);
    const entry = cache[creatorAccountId];

    if (!entry) return null;

    // Check if cache is still valid
    if (Date.now() - entry.createdAt > CACHE_DURATION) {
      // Remove stale entry
      delete cache[creatorAccountId];
      localStorage.setItem(PUBLIC_GROUP_CACHE_KEY, JSON.stringify(cache));
      return null;
    }

    return entry.groupId;
  } catch {
    return null;
  }
}

/**
 * Invalidate cached public group ID for a creator
 */
function invalidatePublicGroupCache(creatorAccountId: string): void {
  if (typeof window === 'undefined') return;

  try {
    const cacheStr = localStorage.getItem(PUBLIC_GROUP_CACHE_KEY);
    if (!cacheStr) return;

    const cache: Record<string, PublicGroupCache> = JSON.parse(cacheStr);
    if (cache[creatorAccountId]) {
      delete cache[creatorAccountId];
      localStorage.setItem(PUBLIC_GROUP_CACHE_KEY, JSON.stringify(cache));
    }
  } catch {
    // Ignore cache errors
  }
}

/**
 * Cache public group ID
 */
function cachePublicGroup(creatorAccountId: string, groupId: string): void {
  if (typeof window === 'undefined') return;

  try {
    const cacheStr = localStorage.getItem(PUBLIC_GROUP_CACHE_KEY);
    const cache: Record<string, PublicGroupCache> = cacheStr ? JSON.parse(cacheStr) : {};

    cache[creatorAccountId] = {
      groupId,
      createdAt: Date.now()
    };

    localStorage.setItem(PUBLIC_GROUP_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore cache errors
  }
}

/**
 * Get or create public group for thumbnails
 *
 * Creates a public group for the creator if it doesn't exist.
 * Public groups allow universal read access for thumbnails.
 *
 * @param creatorAccountId - NEAR account ID of the creator
 * @returns Public group ID
 */
export async function getOrCreatePublicGroup(creatorAccountId: string): Promise<string> {
  const groupId = getPublicGroupId(creatorAccountId);

  if (!hasApiKey()) {
    throw new NovaError('INVALID_CONFIG', 'Nova API key required. Set NOVA_API_KEY.');
  }

  // Check cache first
  const cachedGroupId = getCachedPublicGroup(creatorAccountId);
  if (cachedGroupId) {
    return cachedGroupId;
  }

  try {
    // Generate auth token for creator
    await generateNovaAuthToken(creatorAccountId);

    const sdk = getNovaSdk();

    // Try to check if group already exists on-chain
    let groupExists = false;
    try {
      groupExists = await sdk.isAuthorized(groupId, getNovaAccountId());
    } catch {
      // Group doesn't exist on-chain
    }

    if (groupExists) {
      cachePublicGroup(creatorAccountId, groupId);
      return groupId;
    }

    // Create new public group on-chain + TEE via nova_create_group MCP tool
    const assignedGroupId = await createNovaGroup(groupId);

    // Use the assigned group ID (may differ from requested name)
    const finalGroupId = assignedGroupId || groupId;
    console.log('[DECENTRALIZATION_METRIC] nova_public_group_created', {
      groupId: finalGroupId,
      owner: creatorAccountId,
      type: 'thumbnail_public'
    });

    // Only cache after successful on-chain registration
    cachePublicGroup(creatorAccountId, finalGroupId);

    return finalGroupId;

  } catch (error: unknown) {
    console.error('[NOVA Public Groups] Failed to create public group:', error);
    // Do NOT cache on failure - the group may not exist on-chain
    throw new NovaError(
      'GROUP_CREATE_FAILED',
      `Failed to create public group: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Join a public group (for thumbnail access)
 *
 * Public groups auto-accept any member for universal read access.
 *
 * @param groupId - Public group ID
 * @param accountId - NEAR account requesting access
 */
export async function joinPublicGroup(groupId: string, accountId: string): Promise<void> {
  if (!isPublicGroup(groupId)) {
    throw new NovaError('GROUP_ADD_FAILED', 'Cannot auto-join non-public groups');
  }

  if (!hasApiKey()) {
    throw new NovaError('INVALID_CONFIG', 'Nova API key required. Set NOVA_API_KEY.');
  }

  try {
    const sdk = getNovaSdk();

    // For public groups, the SDK should allow self-registration
    // This is a special case where any user can add themselves
    await sdk.addGroupMember(groupId, accountId);

    console.log('[DECENTRALIZATION_METRIC] nova_public_group_joined', {
      groupId,
      member: accountId
    });

  } catch (error: unknown) {
    // If already a member, that's fine
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('already') || errorMessage.includes('exists')) {
      return;
    }

    console.error('[NOVA Public Groups] Failed to join public group:', error);
    // For thumbnails, we can gracefully degrade
    console.warn('[NOVA Public Groups] Continuing without explicit membership');
  }
}

/**
 * Upload thumbnail to public group
 *
 * Uploads a thumbnail image to the creator's public group.
 * The resulting nova:// URL can be used for universal access.
 *
 * @param file - Thumbnail file to upload
 * @param creatorAccountId - NEAR account of the content creator
 * @param onProgress - Optional progress callback
 * @returns Upload result with nova:// URL
 */
export async function uploadPublicThumbnail(
  file: Blob,
  creatorAccountId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<PublicThumbnailResult> {
  // Validate file size
  if (file.size > NOVA_CONSTANTS.MAX_FILE_SIZE) {
    throw new NovaError(
      'UPLOAD_FAILED',
      `Thumbnail size ${file.size} bytes exceeds maximum ${NOVA_CONSTANTS.MAX_FILE_SIZE} bytes`
    );
  }

  if (!hasApiKey()) {
    throw new NovaError('INVALID_CONFIG', 'Nova API key required. Set NOVA_API_KEY.');
  }

  try {
    // 1. Get or create public group
    const groupId = await getOrCreatePublicGroup(creatorAccountId);

    // 2. Upload directly to Crust IPFS (thumbnails don't need TEE encryption)
    const crustResult = await uploadToCrust(file, creatorAccountId, {
      onProgress: onProgress ? (p) => onProgress({ loaded: p.loaded, total: p.total, percentage: p.percentage }) : undefined,
    });
    const uploadResult = { cid: crustResult.cid };

    // 4. Create nova:// URL
    const novaUrl = createNovaUrl(groupId, uploadResult.cid);
    const gatewayUrl = getCrustGatewayUrl(uploadResult.cid);

    console.log('[DECENTRALIZATION_METRIC] nova_public_thumbnail_uploaded', {
      creatorAccountId,
      cid: uploadResult.cid,
      groupId,
      novaUrl,
      size: file.size
    });

    return {
      cid: uploadResult.cid,
      groupId,
      size: file.size,
      teeEncrypted: false, // Public thumbnails are not encrypted
      novaUrl,
      gatewayUrl
    };

  } catch (error: unknown) {
    console.error('[NOVA Public Groups] Thumbnail upload failed:', error);

    if (error instanceof NovaError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new NovaError(
      'UPLOAD_FAILED',
      `Public thumbnail upload failed: ${errorMessage}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Upload file to public group
 */
async function uploadToPublicGroup(
  file: Blob,
  groupId: string,
  accountId: string,
  onProgress?: (progress: UploadProgress) => void,
  filename?: string
): Promise<{ cid: string }> {
  if (!hasApiKey()) {
    throw new NovaError('INVALID_CONFIG', 'Nova API key required. Set NOVA_API_KEY.');
  }

  const sdk = getNovaSdk();

  // Convert Blob to Buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  try {
    // Upload file to public group
    const result = await sdk.upload(groupId, buffer, filename || 'thumbnail.jpg');
    return { cid: result.cid };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // If access denied, the group likely doesn't exist on-chain despite being cached
    if (errorMessage.includes('access denied') || errorMessage.includes('Unauthorized')) {
      console.warn('[NOVA Public Groups] Access denied - invalidating cache and re-registering group:', groupId);

      // Invalidate stale cache
      invalidatePublicGroupCache(accountId);

      // Try to create the group on-chain + TEE
      try {
        await createNovaGroup(groupId);

        // Cache after successful registration
        cachePublicGroup(accountId, groupId);

        // Retry the upload
        const result = await sdk.upload(groupId, buffer, filename || 'thumbnail.jpg');
        return { cid: result.cid };
      } catch (retryError: unknown) {
        console.error('[NOVA Public Groups] Retry after re-registration also failed:', retryError);
        const retryMsg = retryError instanceof Error ? retryError.message : String(retryError);
        throw new NovaError('UPLOAD_FAILED', `NOVA SDK upload failed after re-registration: ${retryMsg}`, retryError instanceof Error ? retryError : undefined);
      }
    }

    console.error('[NOVA Public Groups] SDK upload failed:', error);
    throw new NovaError('UPLOAD_FAILED', `NOVA SDK upload failed: ${errorMessage}`, error instanceof Error ? error : undefined);
  }
}

/**
 * Fetch public thumbnail content
 *
 * For public groups, we can fetch directly without full auth
 * since the content is meant to be publicly accessible.
 *
 * @param novaUrl - Nova URL (nova://{groupId}/{cid})
 * @param accountId - NEAR account requesting (for optional group join)
 * @returns Blob of thumbnail image
 */
export async function fetchPublicThumbnail(
  novaUrl: string,
  accountId?: string
): Promise<Blob> {
  const parsed = parseNovaUrl(novaUrl);

  if (!parsed) {
    throw new NovaError('FETCH_FAILED', 'Invalid nova:// URL format');
  }

  // Negative cache: skip Nova SDK if this URL failed recently
  const failedAt = FETCH_FAIL_CACHE.get(novaUrl);
  if (failedAt && Date.now() - failedAt < FETCH_FAIL_TTL) {
      try {
      const response = await fetchFromGateways(parsed.cid);
      return response.blob();
    } catch {
      throw new NovaError('FETCH_FAILED', `Cached failure for ${novaUrl}, gateways also unavailable`);
    }
  }

  // Public thumbnails are uploaded directly to Crust IPFS (not encrypted via Nova TEE).
  // Nova SDK retrieve() fails because Nova's internal Pinata gateway doesn't have the content.
  // Fetch directly from Crust gateways instead.
  try {
    const response = await fetchFromGateways(parsed.cid);
    return response.blob();
  } catch (error: unknown) {
    // Cache this failure to prevent hammering gateways
    FETCH_FAIL_CACHE.set(novaUrl, Date.now());

    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new NovaError('FETCH_FAILED', `Failed to fetch public thumbnail: ${errorMessage}`, error instanceof Error ? error : undefined);
  }
}

/**
 * Upload a free video to the creator's public group
 *
 * Reuses the existing public_thumbs_{creator} group instead of creating
 * a new per-video group, saving ~0.64 NEAR per free video upload.
 *
 * @param file - Video file to upload
 * @param creatorAccountId - NEAR account of the content creator
 * @param options - Optional filename and progress callback
 * @returns Upload result with CID and group ID
 */
export async function uploadFreeVideo(
  file: Blob,
  creatorAccountId: string,
  options?: { filename?: string; onProgress?: (progress: UploadProgress) => void }
): Promise<NovaUploadResult> {
  // Validate file size
  if (file.size > NOVA_CONSTANTS.MAX_FILE_SIZE) {
    throw new NovaError(
      'UPLOAD_FAILED',
      `File size ${file.size} bytes exceeds maximum ${NOVA_CONSTANTS.MAX_FILE_SIZE} bytes`
    );
  }

  if (!hasApiKey()) {
    throw new NovaError('INVALID_CONFIG', 'Nova API key required. Set NOVA_API_KEY.');
  }

  try {
    const groupId = getPublicGroupId(creatorAccountId);

    // Free videos: upload directly to Crust without encryption
    // No Nova group fee (~0.64 NEAR saved), no TEE overhead
    const crustResult = await uploadToCrust(file, creatorAccountId, {
      onProgress: options?.onProgress,
    });

    console.log('[DECENTRALIZATION_METRIC] crust_free_video_uploaded', {
      creatorAccountId,
      cid: crustResult.cid,
      groupId,
      size: file.size
    });

    return {
      cid: crustResult.cid,
      groupId,
      size: file.size,
      teeEncrypted: false
    };
  } catch (error: unknown) {
    console.error('[NOVA Public Groups] Free video upload failed:', error);

    if (error instanceof NovaError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new NovaError(
      'UPLOAD_FAILED',
      `Free video upload failed: ${errorMessage}`,
      error instanceof Error ? error : undefined
    );
  }
}

