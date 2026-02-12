/**
 * NOVA Configuration
 *
 * Configuration settings for NOVA Secure File-Sharing integration.
 *
 * Note: The nova-sdk-js SDK handles endpoint routing internally via its
 * built-in MCP server (https://nova-mcp.fastmcp.app) and auth endpoint
 * (https://nova-sdk.com). No separate shade agent or gateway URLs are needed.
 */

import { NovaConfig, NovaError } from './types';

/** Default IPFS gateway for public content (thumbnails, previews) */
const DEFAULT_IPFS_GATEWAY = 'https://crustipfs.xyz/ipfs';

/**
 * Default NOVA configuration
 */
const DEFAULT_CONFIG: NovaConfig = {
  network: (process.env.NEXT_PUBLIC_NOVA_NETWORK as 'testnet' | 'mainnet') || 'mainnet',
  apiKey: process.env.NEXT_PUBLIC_NOVA_API_KEY,
  novaAccountId: process.env.NEXT_PUBLIC_NOVA_ACCOUNT_ID,
};

/**
 * Current NOVA configuration
 */
let currentConfig: NovaConfig = { ...DEFAULT_CONFIG };

/**
 * Get current NOVA configuration
 */
export function getNovaConfig(): NovaConfig {
  return { ...currentConfig };
}

/**
 * Set NOVA configuration
 *
 * @param config - Partial configuration to update
 */
export function setNovaConfig(config: Partial<NovaConfig>): void {
  currentConfig = {
    ...currentConfig,
    ...config
  };

  // Invalidate cached SDK instance so it picks up new config
  _sdkInstance = null;

}

/**
 * Reset NOVA configuration to defaults
 */
export function resetNovaConfig(): void {
  currentConfig = { ...DEFAULT_CONFIG };
  _sdkInstance = null;
}

/**
 * Validate NOVA configuration
 *
 * @throws NovaError if configuration is invalid
 */
export function validateNovaConfig(): void {
  const config = getNovaConfig();

  if (!config.network) {
    throw new NovaError('INVALID_CONFIG', 'NOVA network not configured');
  }

  if (config.network !== 'testnet' && config.network !== 'mainnet') {
    throw new NovaError('INVALID_CONFIG', `Invalid NOVA network: ${config.network}`);
  }

  if (!config.apiKey) {
    console.warn('[NOVA Config] API key not set - some operations may fail');
  }
}

/**
 * Check if NOVA is properly configured
 *
 * @returns true if configuration is valid
 */
export function isNovaConfigured(): boolean {
  try {
    validateNovaConfig();
    return true;
  } catch (error: unknown) {
    return false;
  }
}

/**
 * Get IPFS gateway URL for public content (thumbnails, previews)
 *
 * For encrypted content, use the SDK's retrieve() method instead.
 */
export function getGatewayUrl(): string {
  return DEFAULT_IPFS_GATEWAY;
}

/**
 * Get NOVA API key
 *
 * @throws NovaError if API key not configured
 */
export function getApiKey(): string {
  const config = getNovaConfig();

  if (!config.apiKey) {
    throw new NovaError('INVALID_CONFIG', 'NOVA API key not configured. Set NOVA_API_KEY (server) and NEXT_PUBLIC_NOVA_API_KEY=enabled (client).');
  }

  return config.apiKey;
}

/**
 * Check if API key is configured
 */
export function hasApiKey(): boolean {
  const config = getNovaConfig();
  return !!config.apiKey;
}

/**
 * Get expected enclave hash for attestation verification.
 *
 * Returns the value of NEXT_PUBLIC_NOVA_ENCLAVE_HASH if set.
 * When not set, enclave hash verification is skipped (structure + freshness only).
 *
 * @returns Enclave hash string or undefined
 */
export function getExpectedEnclaveHash(): string | undefined {
  const hash = process.env.NEXT_PUBLIC_NOVA_ENCLAVE_HASH;
  return hash && hash.trim().length > 0 ? hash.trim() : undefined;
}

/**
 * Get Nova SDK constructor options with CORS proxy URLs.
 *
 * Nova SDK's authUrl (nova-sdk.com) and mcpUrl (nova-mcp.fastmcp.app)
 * don't support CORS from browser origins. We route them through
 * our Next.js API route at /api/nova-proxy/[...path].
 */
export function getSdkOptions() {
  const proxyBase = '/api/nova-proxy';
  return {
    // Real API key is injected server-side by the proxy route.
    // Pass a placeholder so the SDK's internal auth checks don't skip.
    apiKey: hasApiKey() ? 'proxy-injected' : undefined,
    authUrl: proxyBase,
    mcpUrl: proxyBase,
  };
}

/**
 * Shared NovaSdk singleton.
 *
 * Every `new NovaSdk()` call logs 3-4 warning lines (MAINNET MODE,
 * Contract, Costs, Session token). By reusing a single instance we
 * eliminate the duplicate console noise and avoid redundant auth
 * handshakes.
 *
 * The instance is lazily created and automatically invalidated when
 * the config changes via `setNovaConfig()`.
 */
let _sdkInstance: import('nova-sdk-js').NovaSdk | null = null;
let _sdkLoadPromise: Promise<typeof import('nova-sdk-js')> | null = null;

export async function getNovaSdk(): Promise<import('nova-sdk-js').NovaSdk> {
  if (!_sdkInstance) {
    if (!_sdkLoadPromise) {
      _sdkLoadPromise = import('nova-sdk-js');
    }
    const { NovaSdk } = await _sdkLoadPromise;
    const novaAccountId = getNovaAccountId();
    _sdkInstance = new NovaSdk(novaAccountId, getSdkOptions());
  }
  return _sdkInstance;
}

/** Reset the cached SDK instance (called automatically on config change) */
export function resetNovaSdk(): void {
  _sdkInstance = null;
  _sdkLoadPromise = null;
}

/**
 * Create a Nova group via SDK's registerGroup().
 *
 * registerGroup() calls the MCP `register_group` tool which handles both:
 * 1. On-chain group creation (nova-sdk.near smart contract)
 * 2. TEE group registration (Shade Agent)
 *
 * Known race condition: The MCP tool can succeed on-chain (consuming the deposit)
 * but then fail at TEE verification with "Group does not exist on-chain" because
 * the NEAR RPC hasn't propagated the new state yet. This causes the retry to fail
 * with a balance error (funds already consumed by the first on-chain call).
 *
 * Recovery: On balance errors, we check if the group was actually created on-chain
 * by the previous attempt. If so, we skip re-registration and return success.
 *
 * @param groupName - Name/ID for the group
 * @returns The group_id (same as groupName)
 */
export async function createNovaGroup(groupName: string): Promise<string> {
  const sdk = await getNovaSdk();
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [3000, 5000, 8000]; // Escalating delays for NEAR finality

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await sdk.registerGroup(groupName);
      return groupName;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isOnChainError = errorMessage.includes('does not exist on-chain');
      const isBalanceError = errorMessage.includes('balance') && errorMessage.includes('cost');
      const isRpcError = errorMessage.includes('RPC not available') ||
        errorMessage.includes('signing account') ||
        errorMessage.includes('PROXY_TIMEOUT') ||
        errorMessage.includes('PROXY_NETWORK_ERROR');

      // Balance error on retry → previous attempt likely succeeded on-chain
      // but consumed the deposit. Check if group actually exists before giving up.
      if (isBalanceError && attempt > 0) {
        try {
          const exists = await sdk.isAuthorized(groupName, getNovaAccountId());
          if (exists) {
            console.log(
              `[NOVA Config] registerGroup recovered: group "${groupName}" already exists on-chain ` +
              `(created by attempt ${attempt}). Waiting for TEE propagation...`
            );
            // Wait for TEE to sync with on-chain state before continuing.
            // The on-chain group exists but TEE may not have registered the key yet.
            await new Promise(resolve => setTimeout(resolve, 5000));
            return groupName;
          }
        } catch {
          // isAuthorized failed — group might not exist yet, wait and retry
        }
      }

      if ((isOnChainError || isBalanceError || isRpcError) && attempt < MAX_RETRIES - 1) {
        const delay = RETRY_DELAYS[attempt];
        console.warn(
          `[NOVA Config] registerGroup attempt ${attempt + 1}/${MAX_RETRIES} failed ` +
          `(${isRpcError ? 'Nova RPC unavailable' : isBalanceError ? 'balance insufficient — checking previous attempt' : 'on-chain propagation delay'}). ` +
          `Retrying in ${delay}ms...`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Final attempt or non-retryable error
      console.error('[NOVA Config] registerGroup failed after retries:', { groupName, attempt: attempt + 1, error: errorMessage });
      throw error;
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new NovaError('GROUP_CREATE_FAILED', `Failed to create group ${groupName} after ${MAX_RETRIES} attempts`);
}

/**
 * Get the Nova account ID for SDK authentication.
 *
 * The Nova SDK requires a Nova-registered account ID (e.g. "yourapp.nova-sdk.near")
 * for session token auth, NOT the user's NEAR wallet account ID.
 *
 * @returns Nova account ID from NEXT_PUBLIC_NOVA_ACCOUNT_ID
 * @throws NovaError if not configured
 */
export function getNovaAccountId(): string {
  const config = getNovaConfig();

  if (!config.novaAccountId) {
    throw new NovaError('INVALID_CONFIG', 'NOVA account ID not configured. Set NEXT_PUBLIC_NOVA_ACCOUNT_ID environment variable.');
  }

  return config.novaAccountId;
}

/**
 * NOVA configuration constants
 */
export const NOVA_CONSTANTS = {
  /** Auth token cache duration (30 minutes) */
  AUTH_TOKEN_CACHE_DURATION: 30 * 60 * 1000,

  /** Default upload timeout (5 minutes) */
  UPLOAD_TIMEOUT: 5 * 60 * 1000,

  /** Default fetch timeout (30 seconds) */
  FETCH_TIMEOUT: 30 * 1000,

  /** Max file size for upload (100 MB) */
  MAX_FILE_SIZE: 100 * 1024 * 1024,

  /** TEE health check timeout (10 seconds) */
  TEE_HEALTH_TIMEOUT: 10 * 1000,

  /** Attestation verification cache duration (10 minutes) */
  ATTESTATION_CACHE_DURATION: 10 * 60 * 1000,

  /** Maximum attestation age before considered stale (1 hour) */
  ATTESTATION_MAX_AGE: 60 * 60 * 1000,

  /** Attestation fetch timeout (10 seconds) */
  ATTESTATION_FETCH_TIMEOUT: 10 * 1000
} as const;

// Initialize configuration on module load
try {
  validateNovaConfig();

  // Safety check: warn if NEXT_PUBLIC_NOVA_API_KEY contains a real API key
  // It should only be a flag like "enabled" or "proxy-injected", not the actual secret
  const publicKey = process.env.NEXT_PUBLIC_NOVA_API_KEY;
  if (publicKey && publicKey.length > 20 && publicKey !== 'enabled' && publicKey !== 'proxy-injected') {
    console.warn(
      '[NOVA Config] WARNING: NEXT_PUBLIC_NOVA_API_KEY appears to contain a real API key. ' +
      'This value is exposed to the client bundle. Use NOVA_API_KEY (without NEXT_PUBLIC) for the real key ' +
      'and set NEXT_PUBLIC_NOVA_API_KEY=enabled as a flag only.'
    );
  }
} catch (error: unknown) {
  if (error instanceof NovaError) {
    console.warn('[NOVA Config] Configuration validation failed:', error.message);
    console.warn('[NOVA Config] Some NOVA features may be unavailable');
  }
}
