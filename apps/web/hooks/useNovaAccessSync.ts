/**
 * Background sync hook for Nova access queue.
 *
 * Processes pending group-add retries:
 * - On mount (app load / page navigation)
 * - On tab becoming visible (user returns to tab)
 */

'use client';

import { useEffect } from 'react';
import { pendingAccessQueue } from '@/lib/nova/pending-access-queue';

export function useNovaAccessSync() {
  useEffect(() => {
    // Process queue on mount
    pendingAccessQueue.processQueue();

    // Process queue when tab becomes visible
    const handler = () => {
      if (document.visibilityState === 'visible') {
        pendingAccessQueue.processQueue();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);
}
