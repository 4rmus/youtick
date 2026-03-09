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
const preferredGatewayByPurpose = new Map<string, string>();

interface GatewayProbeOptions {
  timeout?: number;
  range?: { start: number; end: number };
  purpose?: 'video' | 'image' | 'generic';
  acceptStatuses?: number[];
  signal?: AbortSignal;
}

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
 * Resolve a latency-aware gateway URL for media playback.
 *
 * Unlike getGatewayUrl(), this actively probes healthy gateways and returns
 * the first responsive URL, which avoids waiting on a slow-but-not-failing
 * primary gateway before the browser starts loading media.
 */
export async function resolveGatewayUrl(
  cid: string,
  options?: GatewayProbeOptions,
): Promise<string> {
  const purpose = options?.purpose ?? 'generic';
  const timeout = options?.timeout ?? Math.min(CRUST_CONSTANTS.FETCH_TIMEOUT, 4_000);
  const acceptStatuses = options?.acceptStatuses ?? (options?.range ? [206] : [200, 206]);
  const preferredGateway = preferredGatewayByPurpose.get(purpose);
  const candidates = getProbeCandidates(preferredGateway);
  const errors: string[] = [];

  if (preferredGateway) {
    const preferredUrl = `${preferredGateway}/${cid}`;
    try {
      await probeGatewayUrl(preferredUrl, {
        timeout,
        range: options?.range,
        acceptStatuses,
      });
      return preferredUrl;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${preferredGateway}: ${msg}`);
      preferredGatewayByPurpose.delete(purpose);
    }
  }

  try {
    const winner = await Promise.any(
      candidates.map(async (gateway) => {
        const url = `${gateway.url}/${cid}`;
        await probeGatewayUrl(url, {
          timeout,
          range: options?.range,
          acceptStatuses,
        });
        preferredGatewayByPurpose.set(purpose, gateway.url);
        return url;
      }),
    );
    return winner;
  } catch (err: unknown) {
    const msg = err instanceof AggregateError
      ? err.errors.map((entry) => entry instanceof Error ? entry.message : String(entry)).join('; ')
      : err instanceof Error ? err.message : String(err);

    throw new CrustError(
      'GATEWAY_UNAVAILABLE',
      `Could not resolve a responsive gateway for CID ${cid}: ${[...errors, msg].filter(Boolean).join('; ')}`,
    );
  }
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
  options?: { timeout?: number; signal?: AbortSignal }
): Promise<Response> {
  const timeout = options?.timeout || CRUST_CONSTANTS.FETCH_TIMEOUT;
  const errors: string[] = [];

  // 1. Try Crust API endpoints first.
  // For app-uploaded content this avoids public gateway propagation delays and noisy 4xx/5xxs.
  const crustEndpoints = [CRUST_CONSTANTS.READ_ENDPOINT, CRUST_CONSTANTS.READ_ENDPOINT_FALLBACK];
  for (const endpoint of crustEndpoints) {
    const { controller, cleanup } = createAbortableController(timeout, options?.signal);

    try {
      const response = await fetch(`${endpoint}?arg=${cid}`, {
        method: 'POST',
        signal: controller.signal,
      });
      cleanup();

      if (response.ok) {
        return response;
      }

      errors.push(`crust-api(${endpoint.includes('crustfiles') ? 'fallback' : 'primary'}): HTTP ${response.status}`);
    } catch (err: unknown) {
      cleanup();
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`crust-api: ${msg}`);
      if (options?.signal?.aborted) {
        throw err;
      }
    }
  }

  // 2. Fall back to public IPFS gateways when Crust API is unavailable.
  const sortedGateways = getHealthyGateways();

  if (sortedGateways.length === 0) {
    resetGatewayHealth();
    sortedGateways.push(...getHealthyGateways());
  }

  const raceGateways = sortedGateways.slice(0, 3);

  if (raceGateways.length > 0) {
    try {
      const raceControllers = raceGateways.map(() => createAbortableController(timeout, options?.signal));
      let winnerIndex = -1;
      const abortLosers = (winningIndex: number) => {
        winnerIndex = winningIndex;
        raceControllers.forEach(({ controller, cleanup }, index) => {
          if (index === winningIndex) {
            cleanup();
            return;
          }

          controller.abort();
          cleanup();
        });
      };

      const racePromises = raceGateways.map(async (gateway, index) => {
        const url = `${gateway.url}/${cid}`;
        const { controller, cleanup } = raceControllers[index];

        try {
          const response = await fetch(url, { signal: controller.signal });

          if (response.ok) {
            abortLosers(index);
            return response;
          }

          cleanup();
          errors.push(`${gateway.name}: HTTP ${response.status}`);
          markGatewayUnhealthy(gateway.name);
          throw new Error(`HTTP ${response.status}`);
        } catch (err: unknown) {
          cleanup();
          if (winnerIndex >= 0 && controller.signal.aborted) {
            throw err;
          }
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${gateway.name}: ${msg}`);
          markGatewayUnhealthy(gateway.name);
          if (options?.signal?.aborted) {
            throw err;
          }
          throw err;
        }
      });

      return await Promise.any(racePromises);
    } catch {
      // Ignore individual gateway noise; the aggregate error below is enough.
    }
  }

  throw new CrustError(
    'GATEWAY_UNAVAILABLE',
    `All gateways and Crust API failed for CID ${cid}: ${errors.join(', ')}`
  );
}

function getProbeCandidates(preferredGateway?: string): GatewayConfig[] {
  refreshGatewayHealth();

  const healthy = getHealthyGateways();
  if (healthy.length === 0) {
    resetGatewayHealth();
  }

  const refreshed = getHealthyGateways();
  const preferred = preferredGateway
    ? refreshed.find((gateway) => gateway.url === preferredGateway)
    : undefined;
  const rest = refreshed.filter((gateway) => gateway.url !== preferredGateway);
  const ordered = preferred ? [preferred, ...rest] : rest;

  return ordered.slice(0, 3);
}

async function probeGatewayUrl(
  url: string,
  options: Required<Pick<GatewayProbeOptions, 'timeout' | 'acceptStatuses'>> & Pick<GatewayProbeOptions, 'range'>,
): Promise<void> {
  const { controller, cleanup } = createAbortableController(options.timeout);
  const headers = options.range
    ? { Range: `bytes=${options.range.start}-${options.range.end}` }
    : undefined;

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    if (!options.acceptStatuses.includes(response.status)) {
      throw new Error(`HTTP ${response.status}`);
    }
  } finally {
    cleanup();
  }
}

function createAbortableController(timeout: number, signal?: AbortSignal): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  if (!signal) {
    return {
      controller,
      cleanup: () => clearTimeout(timer),
    };
  }

  const handleAbort = () => controller.abort();

  if (signal.aborted) {
    controller.abort();
    clearTimeout(timer);
    return {
      controller,
      cleanup: () => {},
    };
  }

  signal.addEventListener('abort', handleAbort, { once: true });

  return {
    controller,
    cleanup: () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', handleAbort);
    },
  };
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
