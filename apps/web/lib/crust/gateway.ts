/**
 * Crust Gateway Module
 *
 * Multi-gateway failover for IPFS content retrieval.
 *
 * Priority order:
 * 1. Crust API (/api/v0/cat) — fastest for Crust-pinned content, CORS ✓, POST only
 * 2. Public IPFS gateways — CORS ✓, may have propagation delay
 */

import { GatewayConfig, CrustError } from './types';
import { CRUST_GATEWAYS, CRUST_CONSTANTS } from './config';

/**
 * Runtime gateway state (cloned from config to allow mutation)
 */
const gateways: GatewayConfig[] = CRUST_GATEWAYS.map(g => ({ ...g }));

/**
 * Get full URL for a CID from the best available gateway
 *
 * @param cid - IPFS CID
 * @returns Full gateway URL
 */
export function getGatewayUrl(cid: string): string {
  const gateway = getBestGateway();
  return `${gateway.url}/${cid}`;
}

/**
 * Get URLs for a CID from all gateways, ordered by priority (healthy first)
 *
 * Used for <img> tag fallback chains where each URL is tried sequentially
 * on load error without CORS restrictions.
 *
 * @param cid - IPFS CID
 * @returns Array of gateway URLs sorted by priority
 */
export function getGatewayUrls(cid: string): string[] {
  refreshGatewayHealth();
  const sorted = [...gateways].sort((a, b) => {
    // Healthy gateways first, then by priority
    if (a.healthy !== b.healthy) return a.healthy ? -1 : 1;
    return a.priority - b.priority;
  });
  return sorted.map(g => `${g.url}/${cid}`);
}

/**
 * Fetch content from Crust API first, then public IPFS gateways as fallback.
 *
 * Crust API (POST /api/v0/cat?arg={CID}) is tried first because:
 * - Content is guaranteed to be available (no propagation delay)
 * - Supports CORS from browsers
 * - Fastest for Crust-pinned content
 *
 * @param cid - IPFS CID
 * @param options - Optional fetch options (timeout)
 * @returns Fetch Response
 * @throws CrustError if all sources fail
 */
export async function fetchFromGateways(
  cid: string,
  options?: { timeout?: number }
): Promise<Response> {
  const timeout = options?.timeout || CRUST_CONSTANTS.FETCH_TIMEOUT;
  const errors: string[] = [];

  // 1. Try public IPFS gateways first (Fastest, CDN cached, Range support)
  const sortedGateways = getHealthyGateways();

  if (sortedGateways.length === 0) {
    // Reset all gateways and try again if none are marked healthy
    resetGatewayHealth();
    sortedGateways.push(...getHealthyGateways());
  }

  // Pick top 3 gateways for a race to minimize latency
  const raceGateways = sortedGateways.slice(0, 3);

  if (raceGateways.length > 0) {
    try {
      const racePromises = raceGateways.map(async (gateway) => {
        const url = `${gateway.url}/${cid}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        try {
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timer);

          if (response.ok) {
            return response;
          }

          errors.push(`${gateway.name}: HTTP ${response.status}`);
          markGatewayUnhealthy(gateway.name);
          throw new Error(`HTTP ${response.status}`);
        } catch (err: unknown) {
          clearTimeout(timer);
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${gateway.name}: ${msg}`);
          markGatewayUnhealthy(gateway.name);
          throw err;
        }
      });

      // Return the first successful response
      const fastestResponse = await Promise.any(racePromises);
      return fastestResponse;
    } catch {
      // All race gateways failed, we will fall back to Crust API below
      console.warn(`[Gateway Race] All top gateways failed for ${cid}. Falling back to Crust API.`);
    }
  }

  // 2. Fall back to Crust API endpoints (POST /api/v0/cat)
  // Guaranteed availability for Crust-pinned content, but slower and no Range support.
  const crustEndpoints = [CRUST_CONSTANTS.READ_ENDPOINT, CRUST_CONSTANTS.READ_ENDPOINT_FALLBACK];
  for (const endpoint of crustEndpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${endpoint}?arg=${cid}`, {
        method: 'POST',
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.ok) {
        return response;
      }

      errors.push(`crust-api(${endpoint.includes('crustfiles') ? 'fallback' : 'primary'}): HTTP ${response.status}`);
    } catch (err: unknown) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`crust-api: ${msg}`);
    }
  }

  throw new CrustError(
    'GATEWAY_UNAVAILABLE',
    `All gateways and Crust API failed for CID ${cid}: ${errors.join(', ')}`
  );
}

/**
 * Mark a gateway as unhealthy (temporarily disabled)
 *
 * @param name - Gateway name
 */
export function markGatewayUnhealthy(name: string): void {
  const gateway = gateways.find(g => g.name === name);
  if (gateway) {
    gateway.healthy = false;
    gateway.lastCheck = Date.now();
    console.warn(`[CRUST Gateway] Marked ${name} as unhealthy`);
  }
}

/**
 * Get the best (highest priority, healthy) gateway
 *
 * @returns Best available GatewayConfig
 */
export function getBestGateway(): GatewayConfig {
  refreshGatewayHealth();
  const healthy = getHealthyGateways();
  if (healthy.length > 0) {
    return healthy[0];
  }
  // All unhealthy - reset and return first
  resetGatewayHealth();
  return gateways[0];
}

/**
 * Get healthy gateways sorted by priority
 */
function getHealthyGateways(): GatewayConfig[] {
  refreshGatewayHealth();
  return gateways
    .filter(g => g.healthy)
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Refresh gateway health (re-enable gateways past unhealthy duration)
 */
function refreshGatewayHealth(): void {
  const now = Date.now();
  for (const gateway of gateways) {
    if (!gateway.healthy && now - gateway.lastCheck > CRUST_CONSTANTS.GATEWAY_UNHEALTHY_DURATION) {
      gateway.healthy = true;
    }
  }
}

/**
 * Reset all gateways to healthy
 */
function resetGatewayHealth(): void {
  for (const gateway of gateways) {
    gateway.healthy = true;
    gateway.lastCheck = 0;
  }
}
