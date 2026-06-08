/**
 * Operational Path-Health Metrics (formerly labeled "decentralization score")
 *
 * HONEST FRAMING: this module tracks how often runtime operations take their
 * PRIMARY path versus a fallback (direct trial vs relayer, KMS direct vs proxy,
 * storage order placed vs failed). It is an AVAILABILITY / operational-health
 * signal — NOT a measure of trust decentralization.
 *
 * During public alpha, custody is centralized regardless of these counters:
 * all 5 KMS operators run under a single Cloudflare account and Lighthouse is a
 * single write provider. A high score here means "the primary path succeeded",
 * not "the system is decentralized". Do NOT surface these numbers as a
 * decentralization percentage. See docs/public/transparency.md.
 *
 * Only recordMetric() is currently consumed (telemetry). getMetrics() and the
 * listener API are retained for a possible future health dashboard but are not
 * rendered anywhere today.
 */

export interface LayerScore {
  /** Score from 0-100 */
  score: number;
  /** Number of decentralized operations */
  decentralizedOps: number;
  /** Number of centralized fallback operations */
  centralizedOps: number;
  /** Last operation timestamp */
  lastUpdated: number;
}

export interface DecentralizationMetrics {
  near: LayerScore;
  kms: LayerScore;
  storage: LayerScore;
  /** Weighted composite score (0-100) */
  composite: number;
}

type MetricEvent =
  | 'trial_direct_success'
  | 'trial_relayer_fallback'
  | 'kms_direct_success'
  | 'kms_proxy_used'
  | 'crust_upload_success'
  | 'crust_storage_order_placed'
  | 'crust_storage_order_failed'
  | 'crust_storage_order_rate_limited'
  | 'crust_storage_status_found'
  | 'crust_storage_status_missing';

type MetricListener = (metrics: DecentralizationMetrics) => void;

/** In-memory metrics store */
const state = {
  near: { decentralized: 0, centralized: 0 },
  kms: { decentralized: 0, centralized: 0 },
  storage: { decentralized: 0, centralized: 0 },
  lastUpdated: { near: 0, kms: 0, storage: 0 },
};

const listeners = new Set<MetricListener>();

/**
 * Record a decentralization metric event
 */
export function recordMetric(event: MetricEvent): void {
  const now = Date.now();

  switch (event) {
    case 'trial_direct_success':
      state.near.decentralized++;
      state.lastUpdated.near = now;
      break;
    case 'trial_relayer_fallback':
      state.near.centralized++;
      state.lastUpdated.near = now;
      break;
    case 'kms_direct_success':
      state.kms.decentralized++;
      state.lastUpdated.kms = now;
      break;
    case 'kms_proxy_used':
      state.kms.centralized++;
      state.lastUpdated.kms = now;
      break;
    case 'crust_upload_success':
    case 'crust_storage_order_placed':
    case 'crust_storage_status_found':
      state.storage.decentralized++;
      state.lastUpdated.storage = now;
      break;
    case 'crust_storage_order_failed':
    case 'crust_storage_order_rate_limited':
    case 'crust_storage_status_missing':
      state.storage.centralized++;
      state.lastUpdated.storage = now;
      break;
  }

  notifyListeners();
}

/**
 * Get current decentralization metrics snapshot
 */
export function getMetrics(): DecentralizationMetrics {
  // Base values are "primary-path availability" assumptions used before any op
  // is recorded. They are NOT decentralization percentages — custody is
  // centralized during alpha (single Cloudflare account, single write
  // provider). See module header and docs/public/transparency.md.
  const near = computeLayerScore(state.near, state.lastUpdated.near, 100);
  const kms = computeLayerScore(state.kms, state.lastUpdated.kms, 100);
  const storage = computeLayerScore(state.storage, state.lastUpdated.storage, 100);

  // Weighted composite: NEAR 35%, KMS 35%, Storage 30%
  const composite = Math.round(near.score * 0.35 + kms.score * 0.35 + storage.score * 0.30);

  return { near, kms, storage, composite };
}

/**
 * Subscribe to metrics updates
 */
export function onMetricsUpdate(listener: MetricListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Compute layer score from operation counts
 * Base score is the static assessment; actual operations adjust it.
 */
function computeLayerScore(
  ops: { decentralized: number; centralized: number },
  lastUpdated: number,
  baseScore: number,
): LayerScore {
  const total = ops.decentralized + ops.centralized;

  // No operations yet - use base score
  if (total === 0) {
    return {
      score: baseScore,
      decentralizedOps: 0,
      centralizedOps: 0,
      lastUpdated,
    };
  }

  // Adjust score based on actual operation ratio
  const ratio = ops.decentralized / total;
  const score = Math.round(ratio * 100);

  return {
    score,
    decentralizedOps: ops.decentralized,
    centralizedOps: ops.centralized,
    lastUpdated,
  };
}

function notifyListeners(): void {
  const metrics = getMetrics();
  for (const listener of listeners) {
    try {
      listener(metrics);
    } catch {
      // Listeners should not throw
    }
  }
}
