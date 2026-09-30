'use client';

import { useQuery } from '@tanstack/react-query';
import { getDeviceSession } from '@/lib/device-session';
import { usesDeviceActivation, type DeviceStatus } from './salon-model';

/** "This device": the stored device key checked against get_playback_device (via getDeviceSession). */
export function useDeviceStatus(accountId: string | null) {
    const enabled = Boolean(accountId) && usesDeviceActivation();
    const query = useQuery({
        queryKey: ['playbackDevice', accountId],
        queryFn: async () => (await getDeviceSession(accountId!)) ? 'ready' as const : 'needed' as const,
        enabled,
        staleTime: 60_000,
        retry: false,
    });
    const status: DeviceStatus | null = !enabled ? null
        : query.isLoading ? 'checking'
            : query.isError ? 'unknown'
                : query.data ?? 'checking';
    return { status, error: query.error, refetch: query.refetch };
}
