/**
 * NOVA Secure File-Sharing Module
 *
 * Client-side, TEE-based encryption and group-based access control.
 *
 * Features:
 * - Session Key authentication (signless)
 * - TEE-encrypted file upload/download
 * - Group-based access control
 *
 * @module nova
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
  NovaAuthToken,
  NovaUploadResult,
  NovaUploadOptions,
  NovaFetchOptions,
  UploadProgress,
  NovaGroup,
  CreateGroupParams,
  NovaConfig,
  NovaErrorCode,
  NovaAuthRequest,
  NovaAuthResponse,
  TEEHealthCheck,
  // Attestation Types
  TEEAttestation,
  InlineAttestation,
  AttestationVerificationResult,
  AttestationVerifyOptions,
  // Public Group Types
  NovaPublicGroupConfig,
  NovaThumbnailResult,
  ParsedNovaUrl
} from './types';

export { NovaError, isNovaUrl, isIpfsUrl } from './types';

// ============================================================================
// Configuration Exports
// ============================================================================

// Import all config functions for internal use and re-export
import {
  getNovaConfig,
  setNovaConfig,
  resetNovaConfig,
  validateNovaConfig,
  isNovaConfigured,
  getGatewayUrl,
  getApiKey,
  hasApiKey,
  getNovaAccountId,
  getNovaSdk,
  resetNovaSdk,
  getExpectedEnclaveHash,
  NOVA_CONSTANTS
} from './config';

// Re-export for external consumers
export {
  getNovaConfig,
  setNovaConfig,
  resetNovaConfig,
  validateNovaConfig,
  isNovaConfigured,
  getGatewayUrl,
  getApiKey,
  hasApiKey,
  getNovaAccountId,
  getNovaSdk,
  resetNovaSdk,
  getExpectedEnclaveHash,
  NOVA_CONSTANTS
} from './config';

// ============================================================================
// Authentication Exports
// ============================================================================

import {
  generateNovaAuthToken,
  clearNovaAuthCache,
  hasValidNovaAuthToken,
  getCachedToken,
  refreshNovaAuthToken,
  getTokenExpiry
} from './auth';

export {
  generateNovaAuthToken,
  clearNovaAuthCache,
  hasValidNovaAuthToken,
  getCachedToken,
  refreshNovaAuthToken,
  getTokenExpiry
} from './auth';

// ============================================================================
// Client Exports (Upload/Download)
// ============================================================================

import {
  uploadFile,
  fetchFile,
  getContentUrl,
  checkFileExists,
  uploadFiles,
  uploadJson
} from './client';

export {
  uploadFile,
  fetchFile,
  getContentUrl,
  checkFileExists,
  uploadFiles,
  uploadJson
} from './client';

// ============================================================================
// Group Management Exports
// ============================================================================

import {
  createGroup,
  addGroupMember,
  isGroupMember,
  getGroupMembers,
  getGroup
} from './groups';

export {
  createGroup,
  addGroupMember,
  isGroupMember,
  getGroupMembers,
  getGroup
} from './groups';

// ============================================================================
// Public Group Exports (for thumbnails)
// ============================================================================

import {
  getOrCreatePublicGroup,
  getPublicGroupId,
  isPublicGroup,
  parseNovaUrl,
  createNovaUrl,
  isNovaUrl as isNovaUrlCheck,
  joinPublicGroup,
  uploadPublicThumbnail,
  fetchPublicThumbnail,
  uploadFreeVideo,
  type PublicThumbnailResult
} from './public-groups';

export {
  getOrCreatePublicGroup,
  getPublicGroupId,
  isPublicGroup,
  parseNovaUrl,
  createNovaUrl,
  isNovaUrl as isNovaUrlCheck,
  joinPublicGroup,
  uploadPublicThumbnail,
  fetchPublicThumbnail,
  uploadFreeVideo
} from './public-groups';

export type { PublicThumbnailResult } from './public-groups';

// ============================================================================
// Key Storage Exports (Hybrid Crust+Nova flow)
// ============================================================================

import {
  storeEncryptionKey,
  retrieveEncryptionKey
} from './key-storage';

export {
  storeEncryptionKey,
  retrieveEncryptionKey
} from './key-storage';

// ============================================================================
// Cost Estimation Exports
// ============================================================================

import {
  getRegisterGroupFee,
  getAddMemberFee
} from './costs';

export {
  getRegisterGroupFee,
  getAddMemberFee
} from './costs';

// ============================================================================
// Attestation Exports
// ============================================================================

import {
  fetchAttestation,
  verifyAttestationData,
  verifyAttestation,
  getCachedAttestation,
  invalidateAttestationCache,
  isAttestationStale
} from './attestation';

export {
  fetchAttestation,
  verifyAttestationData,
  verifyAttestation,
  getCachedAttestation,
  invalidateAttestationCache,
  isAttestationStale
} from './attestation';

// ============================================================================
// Pending Access Queue Exports
// ============================================================================

export { pendingAccessQueue, type PendingAccessEntry } from './pending-access-queue';

// ============================================================================
// Module Info
// ============================================================================

/**
 * NOVA module version
 */
export const NOVA_VERSION = '1.0.0';

/**
 * NOVA module metadata
 */
export const NOVA_MODULE_INFO = {
  version: NOVA_VERSION,
  name: 'NOVA Secure File-Sharing',
  description: 'TEE-based encryption with group-based access control',
  features: [
    'Session Key authentication (signless)',
    'TEE-encrypted file upload/download',
    'Group-based access control'
  ],
  status: 'Phase 1 Development'
} as const;

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Initialize NOVA module
 *
 * Call this once at app startup to validate configuration.
 *
 * @returns true if NOVA is properly configured
 */
export function initializeNOVA(): boolean {
  try {
    validateNovaConfig();
    return true;
  } catch (error: unknown) {
    console.error('[NOVA] Module initialization failed:', error);
    console.error('[NOVA] Some features may be unavailable');
    return false;
  }
}

/**
 * Get NOVA module status
 *
 * @returns Module status information
 */
export function getNovaStatus(): {
  configured: boolean;
  hasApiKey: boolean;
  network: string;
  version: string;
} {
  return {
    configured: isNovaConfigured(),
    hasApiKey: hasApiKey(),
    network: getNovaConfig().network,
    version: NOVA_VERSION
  };
}

// ============================================================================
// Default Export
// ============================================================================

/**
 * Default NOVA module export
 *
 * Provides convenient access to all NOVA functionality.
 */
const NOVA = {
  // Module info
  version: NOVA_VERSION,
  info: NOVA_MODULE_INFO,

  // Configuration
  config: {
    get: getNovaConfig,
    set: setNovaConfig,
    reset: resetNovaConfig,
    validate: validateNovaConfig,
    isConfigured: isNovaConfigured
  },

  // Authentication
  auth: {
    generateToken: generateNovaAuthToken,
    clearCache: clearNovaAuthCache,
    hasValidToken: hasValidNovaAuthToken,
    getCachedToken,
    refreshToken: refreshNovaAuthToken,
    getTokenExpiry
  },

  // File operations
  files: {
    upload: uploadFile,
    uploadMultiple: uploadFiles,
    uploadJson,
    fetch: fetchFile,
    getUrl: getContentUrl,
    checkExists: checkFileExists
  },

  // Group management
  groups: {
    create: createGroup,
    addMember: addGroupMember,
    isMember: isGroupMember,
    getMembers: getGroupMembers,
    get: getGroup
  },

  // Public groups (for thumbnails)
  publicGroups: {
    getOrCreate: getOrCreatePublicGroup,
    getGroupId: getPublicGroupId,
    isPublic: isPublicGroup,
    join: joinPublicGroup,
    uploadThumbnail: uploadPublicThumbnail,
    fetchThumbnail: fetchPublicThumbnail
  },

  // Nova URL utilities
  url: {
    parse: parseNovaUrl,
    create: createNovaUrl,
    isNovaUrl: isNovaUrlCheck
  },

  // Cost estimation
  costs: {
    getRegisterGroupFee,
    getAddMemberFee
  },

  // Attestation
  attestation: {
    fetch: fetchAttestation,
    verifyData: verifyAttestationData,
    verify: verifyAttestation,
    getCached: getCachedAttestation,
    invalidateCache: invalidateAttestationCache,
    isStale: isAttestationStale
  },

  // Utilities
  initialize: initializeNOVA,
  getStatus: getNovaStatus
};

export default NOVA;
