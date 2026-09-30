'use client';

import React from 'react';
import { StatusLine } from '@/components/ui/status-line';
import { useDeviceStatus } from '@/components/salon/useDeviceStatus';
import { deviceStorageAvailable } from '@/components/shell/device-status';
import type { Messages } from '@/lib/i18n/messages';

const subscribeNothing = () => () => undefined;

/** Only this device (plan K3): its playback authorization, or storage readiness where no authorizer is used. */
export function ThisDevice({ accountId, t }: { accountId: string; t: Messages['tickets'] }) {
    const device = useDeviceStatus(accountId);
    const storage = React.useSyncExternalStore(subscribeNothing, deviceStorageAvailable, () => null);
    const line = device.status === null
        ? storage === null ? null : { tone: storage ? 'success' : 'error', text: storage ? t.storageReady : t.storageOff } as const
        : {
            ready: { tone: 'success', text: t.deviceReady },
            needed: { tone: 'neutral', text: t.deviceNeeded },
            checking: { tone: 'progress', text: t.deviceChecking },
            unknown: { tone: 'neutral', text: t.deviceUnknown },
        }[device.status] as { tone: 'success' | 'neutral' | 'progress'; text: string };

    return (
        <section aria-labelledby="device-title" className="flex flex-col gap-3 border-t border-line pt-6">
            <h2 id="device-title" className="label-caps">{t.deviceTitle}</h2>
            {line && <StatusLine tone={line.tone}>{line.text}</StatusLine>}
            <p className="text-[13px] text-light-3">{t.deviceScope}</p>
        </section>
    );
}
