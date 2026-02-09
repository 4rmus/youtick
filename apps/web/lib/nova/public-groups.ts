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
import { hasApiKey, getNovaSdk, getNovaAccountId, NOVA_CONSTANTS, isSimulationAllowed } from './config';

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
      console.log('[NOVA Public Groups] Cache invalidated for:', creatorAccountId);
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
  console.log('[NOVA Public Groups] Getting/creating public group for:', creatorAccountId);

  const groupId = getPublicGroupId(creatorAccountId);

  if (!hasApiKey()) {
    if (!isSimulationAllowed()) {
      throw new NovaError('INVALID_CONFIG', 'Nova API key required in production. Set NEXT_PUBLIC_NOVA_API_KEY.');
    }
    console.warn('[NOVA Public Groups] API key not configured - simulating group creation');
    console.log('[NOVA Public Groups] Simulated public group:', groupId);
    cachePublicGroup(creatorAccountId, groupId);
    return groupId;
  }

  // Check cache first
  const cachedGroupId = getCachedPublicGroup(creatorAccountId);
  if (cachedGroupId) {
    console.log('[NOVA Public Groups] Using cached group:', cachedGroupId);
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
      console.log('[NOVA Public Groups] Public group already exists on-chain:', groupId);
      cachePublicGroup(creatorAccountId, groupId);
      return groupId;
    }

    // Register new public group on-chain
    console.log('[NOVA Public Groups] Creating new public group:', groupId);
    await sdk.registerGroup(groupId);

    console.log('[NOVA Public Groups] Public group created successfully:', groupId);
    console.log('[DECENTRALIZATION_METRIC] nova_public_group_created', {
      groupId,
      owner: creatorAccountId,
      type: 'thumbnail_public'
    });

    // Only cache after successful on-chain registration
    cachePublicGroup(creatorAccountId, groupId);

    return groupId;

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

  console.log('[NOVA Public Groups] Joining public group:', { groupId, accountId });

  if (!hasApiKey()) {
    if (!isSimulationAllowed()) {
      throw new NovaError('INVALID_CONFIG', 'Nova API key required in production. Set NEXT_PUBLIC_NOVA_API_KEY.');
    }
    console.warn('[NOVA Public Groups] API key not configured - simulating join');
    console.log('[NOVA Public Groups] Simulated: Joined', groupId);
    return;
  }

  try {
    const sdk = getNovaSdk();

    // For public groups, the SDK should allow self-registration
    // This is a special case where any user can add themselves
    await sdk.addGroupMember(groupId, accountId);

    console.log('[NOVA Public Groups] Successfully joined public group:', groupId);
    console.log('[DECENTRALIZATION_METRIC] nova_public_group_joined', {
      groupId,
      member: accountId
    });

  } catch (error: unknown) {
    // If already a member, that's fine
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('already') || errorMessage.includes('exists')) {
      console.log('[NOVA Public Groups] Already a member of:', groupId);
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
  console.log('[NOVA Public Groups] Uploading public thumbnail...', {
    size: file.size,
    type: file.type,
    creatorAccountId
  });

  // Validate file size
  if (file.size > NOVA_CONSTANTS.MAX_FILE_SIZE) {
    throw new NovaError(
      'UPLOAD_FAILED',
      `Thumbnail size ${file.size} bytes exceeds maximum ${NOVA_CONSTANTS.MAX_FILE_SIZE} bytes`
    );
  }

  // SIMULATION MODE: When API key not configured, use placeholder
  // This allows testing without a real Nova backend
  if (!hasApiKey()) {
    if (!isSimulationAllowed()) {
      throw new NovaError('INVALID_CONFIG', 'Nova API key required in production. Set NEXT_PUBLIC_NOVA_API_KEY.');
    }
    console.warn('[NOVA Public Groups] API key not configured - using placeholder for thumbnail');

    // Simulate progress
    if (onProgress) {
      for (let i = 0; i <= 100; i += 25) {
        onProgress({ loaded: (file.size * i) / 100, total: file.size, percentage: i });
        await new Promise(r => setTimeout(r, 50));
      }
    }

    const simulatedGroupId = `public_thumbs_${creatorAccountId.replace(/\./g, '_')}`;
    // Use placeholder image for simulation mode - this works across page reloads
    const placeholderUrl = '/placeholder-video.svg';

    console.log('[NOVA Public Groups] Simulation: Using placeholder image');

    return {
      cid: 'simulation-placeholder',
      groupId: simulatedGroupId,
      size: file.size,
      teeEncrypted: false,
      novaUrl: placeholderUrl,
      gatewayUrl: placeholderUrl
    };
  }

  try {
    // 1. Get or create public group
    const groupId = await getOrCreatePublicGroup(creatorAccountId);
    console.log('[NOVA Public Groups] Using public group:', groupId);

    // 2. Upload to NOVA (SDK handles auth via session token internally)
    const uploadResult = await uploadToPublicGroup(file, groupId, creatorAccountId, onProgress);

    // 4. Create nova:// URL
    const novaUrl = createNovaUrl(groupId, uploadResult.cid);
    const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${uploadResult.cid}`;

    console.log('[NOVA Public Groups] Thumbnail uploaded successfully');
    console.log('[NOVA Public Groups] Nova URL:', novaUrl);
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
    if (!isSimulationAllowed()) {
      throw new NovaError('INVALID_CONFIG', 'Nova API key required in production. Set NEXT_PUBLIC_NOVA_API_KEY.');
    }
    console.warn('[NOVA Public Groups] API key not configured - simulating upload');

    // Simulate upload with progress
    if (onProgress) {
      for (let i = 0; i <= 100; i += 20) {
        const loaded = (file.size * i) / 100;
        onProgress({
          loaded,
          total: file.size,
          percentage: i
        });
        await sleep(50);
      }
    }

    // Return simulated CID
    const simulatedCid = `Qm${Math.random().toString(36).substring(2, 46).toUpperCase()}`;
    console.log('[NOVA Public Groups] Simulated upload complete:', simulatedCid);

    return { cid: simulatedCid };
  }

  const sdk = getNovaSdk();

  // Convert Blob to Buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  console.log('[NOVA Public Groups] Uploading to public group...', {
    groupId,
    size: file.size
  });

  try {
    // Upload file to public group
    const result = await sdk.upload(groupId, buffer, filename || 'thumbnail.jpg');

    console.log('[NOVA Public Groups] Upload successful:', {
      cid: result.cid,
      transId: result.trans_id
    });

    return { cid: result.cid };

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // If access denied, the group likely doesn't exist on-chain despite being cached
    if (errorMessage.includes('access denied') || errorMessage.includes('Unauthorized')) {
      console.warn('[NOVA Public Groups] Access denied - invalidating cache and re-registering group:', groupId);

      // Invalidate stale cache
      invalidatePublicGroupCache(accountId);

      // Try to register the group on-chain
      try {
        console.log('[NOVA Public Groups] Re-registering group on-chain:', groupId);
        await sdk.registerGroup(groupId);
        console.log('[NOVA Public Groups] Group re-registered successfully, retrying upload...');

        // Cache after successful registration
        cachePublicGroup(accountId, groupId);

        // Retry the upload
        const result = await sdk.upload(groupId, buffer, filename || 'thumbnail.jpg');

        console.log('[NOVA Public Groups] Retry upload successful:', {
          cid: result.cid,
          transId: result.trans_id
        });

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
    console.log('[NOVA Public Groups] Skipping (cached failure), falling back to gateway:', parsed.cid);
    const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${parsed.cid}`;
    const response = await fetch(gatewayUrl);
    if (response.ok) {
      return response.blob();
    }
    throw new NovaError('FETCH_FAILED', `Cached failure for ${novaUrl}, gateway also unavailable`);
  }

  console.log('[NOVA Public Groups] Fetching public thumbnail:', parsed);

  // Note: We skip joinPublicGroup here intentionally.
  // The platform's Nova account (used by sdk.retrieve) is already a group member.
  // Calling addGroupMember for each viewer causes nonce conflicts (500 errors)
  // and is unnecessary for reading from public groups.

  if (!hasApiKey()) {
    if (!isSimulationAllowed()) {
      throw new NovaError('INVALID_CONFIG', 'Nova API key required in production. Set NEXT_PUBLIC_NOVA_API_KEY.');
    }
    // Fallback to IPFS gateway for simulation
    const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${parsed.cid}`;
    console.log('[NOVA Public Groups] Simulated: Fetching from gateway:', gatewayUrl);

    const response = await fetch(gatewayUrl);
    if (!response.ok) {
      throw new NovaError('FETCH_FAILED', `Gateway fetch failed: ${response.status}`);
    }

    return response.blob();
  }

  try {
    const sdk = getNovaSdk();

    // Retrieve from public group
    const result = await sdk.retrieve(parsed.groupId, parsed.cid);

    console.log('[NOVA Public Groups] Fetch successful:', result.data.byteLength, 'bytes');

    // Convert Buffer to Uint8Array for Blob compatibility
    const data = new Uint8Array(result.data);
    return new Blob([data], { type: 'image/jpeg' });

  } catch (error: unknown) {
    console.error('[NOVA Public Groups] SDK fetch failed:', error);

    // Cache this failure to prevent hammering upstream
    FETCH_FAIL_CACHE.set(novaUrl, Date.now());

    // Fallback to IPFS gateway
    const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${parsed.cid}`;
    console.log('[NOVA Public Groups] Falling back to gateway:', gatewayUrl);

    try {
      const response = await fetch(gatewayUrl);
      if (response.ok) {
        return response.blob();
      }
    } catch {
      // Gateway also failed
    }

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
  console.log('[NOVA Public Groups] Uploading free video to public group...', {
    size: file.size,
    creatorAccountId
  });

  // Validate file size
  if (file.size > NOVA_CONSTANTS.MAX_FILE_SIZE) {
    throw new NovaError(
      'UPLOAD_FAILED',
      `File size ${file.size} bytes exceeds maximum ${NOVA_CONSTANTS.MAX_FILE_SIZE} bytes`
    );
  }

  // SIMULATION MODE
  if (!hasApiKey()) {
    if (!isSimulationAllowed()) {
      throw new NovaError('INVALID_CONFIG', 'Nova API key required in production. Set NEXT_PUBLIC_NOVA_API_KEY.');
    }
    console.warn('[NOVA Public Groups] API key not configured - simulating free video upload');

    if (options?.onProgress) {
      for (let i = 0; i <= 100; i += 25) {
        options.onProgress({ loaded: (file.size * i) / 100, total: file.size, percentage: i });
        await new Promise(r => setTimeout(r, 50));
      }
    }

    const simulatedGroupId = getPublicGroupId(creatorAccountId);
    const simulatedCid = `Qm${Math.random().toString(36).substring(2, 46).toUpperCase()}`;

    console.log('[NOVA Public Groups] Simulation: Free video uploaded to public group:', simulatedGroupId);

    return {
      cid: simulatedCid,
      groupId: simulatedGroupId,
      size: file.size,
      teeEncrypted: true
    };
  }

  try {
    const groupId = await getOrCreatePublicGroup(creatorAccountId);
    console.log('[NOVA Public Groups] Using public group for free video:', groupId);

    const result = await uploadToPublicGroup(file, groupId, creatorAccountId, options?.onProgress, options?.filename);

    console.log('[NOVA Public Groups] Free video uploaded successfully:', result.cid);
    console.log('[DECENTRALIZATION_METRIC] nova_free_video_uploaded', {
      creatorAccountId,
      cid: result.cid,
      groupId,
      size: file.size
    });

    return {
      cid: result.cid,
      groupId,
      size: file.size,
      teeEncrypted: true
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

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
