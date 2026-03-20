/**
 * Crust Gateway Module
 *
 * Multi-gateway failover for IPFS content retrieval.
 *
 * Priority order:
 * 1. Crust API (/api/v0/cat) — fastest reliable path for fresh Crust-pinned content
 * 2. Public IPFS gateways — useful when a CDN-backed gateway becomes faster for this user
 */

import { GatewayConfig, CrustError } from './types';
import { CRUST_GATEWAYS, CRUST_CONSTANTS } from './config';

interface GatewayRuntimeState extends GatewayConfig {
  avgLatencyMs: number | null;
  successCount: number;
  failureCount: number;
  lastSuccessAt: number;
}

interface PreferredRoute {
  value: string;
  updatedAt: number;
}

interface GatewayProbeOptions {
  timeout?: number;
  range?: { start: number; end: number };
  purpose?: 'video' | 'image' | 'generic';
  acceptStatuses?: number[];
  signal?: AbortSignal;
}

interface FetchGatewayOptions {
  timeout?: number;
  signal?: AbortSignal;
  purpose?: 'video' | 'image' | 'generic' | 'manifest' | 'segment';
}

interface ReadCandidate {
  key: string;
  name: string;
  url: string;
  method: 'GET' | 'POST';
  gatewayName?: string;
}

const GATEWAY_PROBE_LIMIT = 3;
const HEDGED_REQUEST_DELAY_MS = 150;
const PREFERRED_ROUTE_TTL_MS = 45_000;
const LATENCY_SMOOTHING_FACTOR = 0.35;
const DEFAULT_GATEWAY_LATENCY_MS = 1_200;
const GATEWAY_FAILURE_PENALTY_MS = 250;

/**
 * Runtime gateway state (cloned from config to allow mutation)
 */
const gateways: GatewayRuntimeState[] = CRUST_GATEWAYS.map((gateway) => ({
  ...gateway,
  avgLatencyMs: null,
  successCount: 0,
  failureCount: 0,
  lastSuccessAt: 0,
}));

const preferredGatewayByPurpose = new Map<string, PreferredRoute>();
const preferredReadRouteByPurpose = new Map<string, PreferredRoute>();

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
 * Get URLs for a CID from all gateways, ordered by observed speed first
 *
 * Used for <img> fallback chains where each URL is tried sequentially on load error.
 *
 * @param cid - IPFS CID
 * @returns Array of gateway URLs sorted by score
 */
export function getGatewayUrls(cid: string): string[] {
  return getSortedGateways().map((gateway) => `${gateway.url}/${cid}`);
}

/**
 * Resolve a latency-aware gateway URL for media playback.
 *
 * Unlike getGatewayUrl(), this actively probes healthy gateways and returns
 * the first responsive URL, which avoids waiting on a slow primary gateway.
 */
export async function resolveGatewayUrl(
  cid: string,
  options?: GatewayProbeOptions,
): Promise<string> {
  const purpose = options?.purpose ?? 'generic';
  const timeout = options?.timeout ?? Math.min(CRUST_CONSTANTS.FETCH_TIMEOUT, 4_000);
  const acceptStatuses = options?.acceptStatuses ?? (options?.range ? [206] : [200, 206]);
  const freshPreferred = getFreshPreferredRoute(
    preferredGatewayByPurpose,
    purpose,
    (url) => getHealthyGateways().some((gateway) => gateway.url === url),
  );

  if (freshPreferred) {
    setPreferredRoute(preferredGatewayByPurpose, purpose, freshPreferred);
    return `${freshPreferred}/${cid}`;
  }

  const candidates = getProbeCandidates();
  const errors: string[] = [];
  const controllers = candidates.map(() => createAbortableController(timeout, options?.signal));
  let winnerIndex = -1;

  const abortLosers = (winningIndex: number) => {
    winnerIndex = winningIndex;
    controllers.forEach(({ controller, cleanup }, index) => {
      if (index === winningIndex) {
        cleanup();
        return;
      }

      controller.abort();
      cleanup();
    });
  };

  try {
    return await Promise.any(
      candidates.map(async (gateway, index) => {
        const url = `${gateway.url}/${cid}`;
        const { controller, cleanup } = controllers[index];
        const startedAt = now();

        try {
          await probeGatewayUrl(url, {
            acceptStatuses,
            range: options?.range,
            signal: controller.signal,
          });

          const latencyMs = Math.max(1, Math.round(now() - startedAt));
          recordGatewaySuccess(gateway.name, latencyMs);
          setPreferredRoute(preferredGatewayByPurpose, purpose, gateway.url);
          abortLosers(index);
          return url;
        } catch (error: unknown) {
          if (winnerIndex >= 0 && controller.signal.aborted) {
            throw error;
          }

          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${gateway.name}: ${message}`);
          markGatewayUnhealthy(gateway.name);

          if (options?.signal?.aborted) {
            throw error;
          }

          throw error;
        } finally {
          cleanup();
        }
      }),
    );
  } catch (error: unknown) {
    const message = error instanceof AggregateError
      ? error.errors.map((entry) => entry instanceof Error ? entry.message : String(entry)).join('; ')
      : error instanceof Error ? error.message : String(error);

    throw new CrustError(
      'GATEWAY_UNAVAILABLE',
      `Could not resolve a responsive gateway for CID ${cid}: ${[...errors, message].filter(Boolean).join('; ')}`,
    );
  }
}

/**
 * Fetch content from Crust API and public gateways using a hedged strategy.
 *
 * We keep Crust in the race because fresh uploads appear there first, but we
 * also remember when a public gateway is faster for the current user and reuse
 * that choice for a short time.
 *
 * @param cid - IPFS CID
 * @param options - Optional fetch options
 * @returns Fetch Response
 * @throws CrustError if all sources fail
 */
export async function fetchFromGateways(
  cid: string,
  options?: FetchGatewayOptions,
): Promise<Response> {
  const timeout = options?.timeout ?? CRUST_CONSTANTS.FETCH_TIMEOUT;
  const purpose = options?.purpose ?? 'generic';
  const errors: string[] = [];
  const baseCandidates = buildReadCandidates();
  const freshPreferredKey = getFreshPreferredRoute(
    preferredReadRouteByPurpose,
    purpose,
    (key) => baseCandidates.some((candidate) => candidate.key === key),
  );
  const candidates = buildReadCandidates(freshPreferredKey);

  if (freshPreferredKey) {
    const preferredCandidate = candidates.find((candidate) => candidate.key === freshPreferredKey);
    if (preferredCandidate) {
      try {
        const response = await fetchReadCandidate(preferredCandidate, cid, {
          timeout,
          signal: options?.signal,
        });
        setPreferredRoute(preferredReadRouteByPurpose, purpose, preferredCandidate.key);
        return response;
      } catch (error: unknown) {
        if (options?.signal?.aborted) {
          throw error;
        }

        preferredReadRouteByPurpose.delete(purpose);
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${preferredCandidate.name}: ${message}`);
      }
    }
  }

  if (candidates.length === 0) {
    throw new CrustError(
      'GATEWAY_UNAVAILABLE',
      `No healthy IPFS gateways are available for CID ${cid}`,
    );
  }

  return await hedgeReadCandidates(candidates, cid, {
    purpose,
    timeout,
    signal: options?.signal,
    errors,
  });
}

function buildReadCandidates(preferredKey?: string): ReadCandidate[] {
  const crustCandidates = [
    { name: 'crust-api-primary', url: CRUST_CONSTANTS.READ_ENDPOINT },
    { name: 'crust-api-fallback', url: CRUST_CONSTANTS.READ_ENDPOINT_FALLBACK },
  ]
    .filter((candidate) => candidate.url && candidate.url.startsWith('https://'))
    .map<ReadCandidate>((candidate) => ({
      key: `crust:${candidate.url}`,
      name: candidate.name,
      url: candidate.url,
      method: 'POST',
    }));

  const publicCandidates = getHealthyGateways()
    .slice(0, GATEWAY_PROBE_LIMIT)
    .map<ReadCandidate>((gateway) => ({
      key: `gateway:${gateway.url}`,
      name: gateway.name,
      url: gateway.url,
      method: 'GET',
      gatewayName: gateway.name,
    }));

  const ordered = [
    crustCandidates[0],
    publicCandidates[0],
    crustCandidates[1],
    publicCandidates[1],
    publicCandidates[2],
  ].filter(Boolean) as ReadCandidate[];

  if (!preferredKey) {
    return ordered;
  }

  const preferred = ordered.find((candidate) => candidate.key === preferredKey);
  if (!preferred) {
    return ordered;
  }

  return [preferred, ...ordered.filter((candidate) => candidate.key !== preferredKey)];
}

async function hedgeReadCandidates(
  candidates: ReadCandidate[],
  cid: string,
  options: {
    purpose: string;
    timeout: number;
    signal?: AbortSignal;
    errors: string[];
  },
): Promise<Response> {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const controllers = new Map<string, ReturnType<typeof createAbortableController>>();

  return await new Promise<Response>((resolve, reject) => {
    let settled = false;
    let pendingCount = candidates.length;

    const cleanupAll = (winnerKey?: string) => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();

      for (const [key, abortable] of controllers.entries()) {
        if (winnerKey && key === winnerKey) {
          abortable.cleanup();
          continue;
        }

        abortable.controller.abort();
        abortable.cleanup();
      }

      controllers.clear();
    };

    const finishWithError = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanupAll();
      reject(error);
    };

    const maybeFinishWithAggregateError = () => {
      if (settled || pendingCount > 0) {
        return;
      }

      finishWithError(new CrustError(
        'GATEWAY_UNAVAILABLE',
        `All gateways and Crust API failed for CID ${cid}: ${options.errors.join(', ')}`,
      ));
    };

    if (options.signal) {
      if (options.signal.aborted) {
        finishWithError(new DOMException('The operation was aborted.', 'AbortError'));
        return;
      }

      options.signal.addEventListener(
        'abort',
        () => finishWithError(new DOMException('The operation was aborted.', 'AbortError')),
        { once: true },
      );
    }

    candidates.forEach((candidate, index) => {
      const timer = setTimeout(() => {
        if (settled) {
          return;
        }

        const abortable = createAbortableController(options.timeout, options.signal);
        controllers.set(candidate.key, abortable);

        void fetchReadCandidate(candidate, cid, {
          timeout: options.timeout,
          signal: abortable.controller.signal,
        })
          .then((response) => {
            if (settled) {
              abortable.cleanup();
              return;
            }

            settled = true;
            setPreferredRoute(preferredReadRouteByPurpose, options.purpose, candidate.key);
            cleanupAll(candidate.key);
            resolve(response);
          })
          .catch((error: unknown) => {
            pendingCount -= 1;

            if (settled && abortable.controller.signal.aborted) {
              abortable.cleanup();
              maybeFinishWithAggregateError();
              return;
            }

            if (!options.signal?.aborted) {
              const message = error instanceof Error ? error.message : String(error);
              options.errors.push(`${candidate.name}: ${message}`);
            }

            abortable.cleanup();
            maybeFinishWithAggregateError();
          });
      }, index * HEDGED_REQUEST_DELAY_MS);

      timers.add(timer);
    });
  });
}

async function fetchReadCandidate(
  candidate: ReadCandidate,
  cid: string,
  options: Pick<FetchGatewayOptions, 'signal'> & Required<Pick<FetchGatewayOptions, 'timeout'>>,
): Promise<Response> {
  const requestUrl = candidate.method === 'POST'
    ? `${candidate.url}?arg=${cid}`
    : `${candidate.url}/${cid}`;
  const startedAt = now();
  const response = await fetch(requestUrl, {
    method: candidate.method,
    signal: options.signal,
  });

  if (!response.ok) {
    if (candidate.gatewayName) {
      markGatewayUnhealthy(candidate.gatewayName);
    }
    throw new Error(`HTTP ${response.status}`);
  }

  if (candidate.gatewayName) {
    const latencyMs = Math.max(1, Math.round(now() - startedAt));
    recordGatewaySuccess(candidate.gatewayName, latencyMs);
  }

  return response;
}

function getProbeCandidates(): GatewayRuntimeState[] {
  return getHealthyGateways().slice(0, GATEWAY_PROBE_LIMIT);
}

async function probeGatewayUrl(
  url: string,
  options: Pick<GatewayProbeOptions, 'range' | 'signal'> & Required<Pick<GatewayProbeOptions, 'acceptStatuses'>>,
): Promise<void> {
  const headers = options.range
    ? { Range: `bytes=${options.range.start}-${options.range.end}` }
    : undefined;
  const response = await fetch(url, {
    headers,
    signal: options.signal,
  });

  if (!options.acceptStatuses.includes(response.status)) {
    throw new Error(`HTTP ${response.status}`);
  }
}

function createAbortableController(
  timeout: number,
  signal?: AbortSignal,
): {
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

function recordGatewaySuccess(name: string, latencyMs: number): void {
  const gateway = gateways.find((entry) => entry.name === name);
  if (!gateway) {
    return;
  }

  gateway.healthy = true;
  gateway.lastCheck = Date.now();
  gateway.lastSuccessAt = gateway.lastCheck;
  gateway.successCount += 1;
  gateway.failureCount = Math.max(0, gateway.failureCount - 1);
  gateway.avgLatencyMs = gateway.avgLatencyMs === null
    ? latencyMs
    : Math.round(
      gateway.avgLatencyMs * (1 - LATENCY_SMOOTHING_FACTOR)
      + latencyMs * LATENCY_SMOOTHING_FACTOR,
    );
}

/**
 * Mark a gateway as unhealthy (temporarily disabled)
 *
 * @param name - Gateway name
 */
export function markGatewayUnhealthy(name: string): void {
  const gateway = gateways.find((entry) => entry.name === name);
  if (!gateway) {
    return;
  }

  gateway.healthy = false;
  gateway.lastCheck = Date.now();
  gateway.failureCount += 1;
  clearPreferredRoutesForGateway(gateway.url);
}

/**
 * Mark a gateway as unhealthy using a full gateway URL
 *
 * @param url - Full URL that starts with a configured gateway base URL
 */
export function markGatewayUnhealthyByUrl(url: string): void {
  const gateway = gateways.find((entry) => url === entry.url || url.startsWith(`${entry.url}/`));
  if (gateway) {
    markGatewayUnhealthy(gateway.name);
  }
}

/**
 * Get the best (lowest score, healthy) gateway
 *
 * @returns Best available GatewayConfig
 */
export function getBestGateway(): GatewayConfig {
  const healthy = getHealthyGateways();
  if (healthy.length > 0) {
    return healthy[0];
  }

  resetGatewayHealth();
  return getHealthyGateways()[0] ?? gateways[0];
}

function getSortedGateways(): GatewayRuntimeState[] {
  const healthy = getHealthyGateways();
  const unhealthy = [...gateways]
    .filter((gateway) => !gateway.healthy)
    .sort((left, right) => getGatewayScore(left) - getGatewayScore(right));

  return [...healthy, ...unhealthy];
}

/**
 * Get healthy gateways sorted by score
 */
function getHealthyGateways(): GatewayRuntimeState[] {
  refreshGatewayHealth();
  return [...gateways]
    .filter((gateway) => gateway.healthy)
    .sort((left, right) => getGatewayScore(left) - getGatewayScore(right));
}

function getGatewayScore(gateway: GatewayRuntimeState): number {
  const latency = gateway.avgLatencyMs ?? (DEFAULT_GATEWAY_LATENCY_MS + gateway.priority * 75);
  const failurePenalty = Math.min(gateway.failureCount, 4) * GATEWAY_FAILURE_PENALTY_MS;
  const priorityBias = gateway.priority * 30;

  return latency + failurePenalty + priorityBias;
}

/**
 * Refresh gateway health (re-enable gateways past unhealthy duration)
 */
function refreshGatewayHealth(): void {
  const nowMs = Date.now();
  for (const gateway of gateways) {
    if (!gateway.healthy && nowMs - gateway.lastCheck > CRUST_CONSTANTS.GATEWAY_UNHEALTHY_DURATION) {
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

function clearPreferredRoutesForGateway(gatewayUrl: string): void {
  for (const [purpose, route] of preferredGatewayByPurpose.entries()) {
    if (route.value === gatewayUrl) {
      preferredGatewayByPurpose.delete(purpose);
    }
  }

  const readRouteKey = `gateway:${gatewayUrl}`;
  for (const [purpose, route] of preferredReadRouteByPurpose.entries()) {
    if (route.value === readRouteKey) {
      preferredReadRouteByPurpose.delete(purpose);
    }
  }
}

function setPreferredRoute(
  routes: Map<string, PreferredRoute>,
  purpose: string,
  value: string,
): void {
  routes.set(purpose, {
    value,
    updatedAt: Date.now(),
  });
}

function getFreshPreferredRoute(
  routes: Map<string, PreferredRoute>,
  purpose: string,
  isValid?: (value: string) => boolean,
): string | undefined {
  const route = routes.get(purpose);
  if (!route) {
    return undefined;
  }

  const fresh = Date.now() - route.updatedAt <= PREFERRED_ROUTE_TTL_MS;
  if (!fresh || (isValid && !isValid(route.value))) {
    routes.delete(purpose);
    return undefined;
  }

  return route.value;
}

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}
