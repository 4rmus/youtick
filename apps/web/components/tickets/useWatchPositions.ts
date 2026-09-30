'use client';

import { useQuery } from '@tanstack/react-query';
import { getDeviceSession, getDeviceSessionRevision } from '@/lib/device-session';
import type { AccountTicket } from '@/lib/market-read-model';
import { openWatchProgress, type WatchPosition } from '@/lib/watch-progress';
import { ticketState } from './ticket-model';

/**
 * Resume positions stored on this device by the player (watch-progress). Read-only: each record is
 * opened, read and closed. Nothing is fetched from the network except the device-session revision
 * check that watch-progress requires on a cold page.
 */
export function useWatchPositions(accountId: string | null, tickets: readonly AccountTicket[]) {
    const readable = tickets.filter((ticket) => ticket.publication && ticketState(ticket.publication.availability) !== 'removed');
    return useQuery({
        queryKey: ['watchPositions', accountId, readable.map((ticket) => `${ticket.publicationId}:${ticket.publication!.generation}`)],
        enabled: Boolean(accountId) && readable.length > 0,
        staleTime: 30_000,
        retry: false,
        queryFn: async ({ signal }) => {
            if (getDeviceSessionRevision() === undefined) await getDeviceSession(accountId!).catch(() => null);
            const positions = new Map<string, WatchPosition>();
            for (const ticket of readable) {
                const publication = ticket.publication!;
                const progress = await openWatchProgress({
                    accountId: accountId!, jobId: publication.publication_id,
                    generation: publication.generation, playbackId: publication.playback_id,
                }, signal);
                if (!progress) continue;
                if (progress.position) positions.set(ticket.publicationId, progress.position);
                progress.destroy();
            }
            return positions;
        },
    });
}
