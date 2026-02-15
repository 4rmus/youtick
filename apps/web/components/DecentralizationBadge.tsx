'use client';

import { useState, useEffect } from 'react';
import { getMetrics, onMetricsUpdate, type DecentralizationMetrics } from '@/lib/decentralization-metrics';

/**
 * Decentralization score badge with expandable details.
 *
 * Shows the composite decentralization score as a small badge.
 * Clicking expands to show per-layer breakdown (NEAR, Nova, Storage).
 */
export function DecentralizationBadge() {
  const [metrics, setMetrics] = useState<DecentralizationMetrics>(getMetrics);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    return onMetricsUpdate(setMetrics);
  }, []);

  const scoreColor = metrics.composite >= 95
    ? 'text-green-400'
    : metrics.composite >= 85
      ? 'text-yellow-400'
      : 'text-red-400';

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-zinc-900 border border-white/5 hover:border-white/20 transition-colors text-xs"
        title="Decentralization Score"
      >
        <span className="text-zinc-500">Decentralized</span>
        <span className={`font-mono font-semibold ${scoreColor}`}>
          {metrics.composite}%
        </span>
      </button>

      {expanded && (
        <div className="absolute bottom-full mb-2 left-0 w-64 p-3 rounded-lg bg-zinc-900 border border-white/10 shadow-lg z-50">
          <div className="text-xs text-zinc-400 mb-2 font-medium">Layer Breakdown</div>

          <LayerRow label="NEAR Protocol" score={metrics.near.score} ops={metrics.near} />
          <LayerRow label="Nova TEE" score={metrics.nova.score} ops={metrics.nova} />
          <LayerRow label="Crust Storage" score={metrics.storage.score} ops={metrics.storage} />

          <div className="mt-2 pt-2 border-t border-white/5 flex justify-between text-xs">
            <span className="text-zinc-500">Composite</span>
            <span className={`font-mono font-semibold ${scoreColor}`}>
              {metrics.composite}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function LayerRow({
  label,
  score,
  ops,
}: {
  label: string;
  score: number;
  ops: { decentralizedOps: number; centralizedOps: number };
}) {
  const total = ops.decentralizedOps + ops.centralizedOps;
  const color = score >= 95 ? 'bg-green-500' : score >= 85 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="mb-1.5">
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-zinc-400">{label}</span>
        <span className="text-zinc-300 font-mono">{score}%</span>
      </div>
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-300`}
          style={{ width: `${score}%` }}
        />
      </div>
      {total > 0 && (
        <div className="text-[10px] text-zinc-600 mt-0.5">
          {ops.decentralizedOps} decentralized / {ops.centralizedOps} fallback
        </div>
      )}
    </div>
  );
}
