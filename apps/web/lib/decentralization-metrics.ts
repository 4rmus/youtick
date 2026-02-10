/**
 * Decentralization Metrics Collection
 *
 * Structured metrics collection for YouTick's decentralization score.
 * Captures events from NEAR, Nova, and Crust layers to compute
 * a real-time decentralization health score.
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
  nova: LayerScore;
  storage: LayerScore;
  /** Weighted composite score (0-100) */
  composite: number;
}

type MetricEvent =
  | 'trial_direct_success'
  | 'trial_relayer_fallback'
  | 'nova_direct_success'
  | 'nova_proxy_used'
  | 'crust_upload_success'
  | 'crust_storage_order_placed'
  | 'crust_storage_order_failed'
  | 'crust_storage_status_found'
  | 'crust_storage_status_missing';

type MetricListener = (metrics: DecentralizationMetrics) => void;

/** In-memory metrics store */
const state = {
  near: { decentralized: 0, centralized: 0 },
  nova: { decentralized: 0, centralized: 0 },
  storage: { decentralized: 0, centralized: 0 },
  lastUpdated: { near: 0, nova: 0, storage: 0 },
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
    case 'nova_direct_success':
      state.nova.decentralized++;
      state.lastUpdated.nova = now;
      break;
    case 'nova_proxy_used':
      state.nova.centralized++;
      state.lastUpdated.nova = now;
      break;
    case 'crust_upload_success':
    case 'crust_storage_order_placed':
    case 'crust_storage_status_found':
      state.storage.decentralized++;
      state.lastUpdated.storage = now;
      break;
    case 'crust_storage_order_failed':
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
  const near = computeLayerScore(state.near, state.lastUpdated.near, 95);
  const nova = computeLayerScore(state.nova, state.lastUpdated.nova, 92);
  const storage = computeLayerScore(state.storage, state.lastUpdated.storage, 95);

  // Weighted composite: NEAR 35%, Nova 35%, Storage 30%
  const composite = Math.round(near.score * 0.35 + nova.score * 0.35 + storage.score * 0.30);

  return { near, nova, storage, composite };
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
