'use client';

import React from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { playbackErrorMessage } from './playback-errors';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { StatusLine } from '@/components/ui/status-line';
import type { LivepeerPlaybackInput } from '@/lib/livepeer-playback';
import type { Locale } from '@/lib/i18n/locale';
import { messages } from '@/lib/i18n/messages';
import { playerCopy } from '@/lib/player-copy';
import { activatePlaybackDevice } from '@/lib/playback-device-activation';

type DeviceDialogProps = {
    open: boolean;
    locale: Locale;
    input: LivepeerPlaybackInput;
    onClose(): void;
    onActivated(): void;
};

/** One explicit wallet transaction authorizes this device (activatePlaybackDevice); nothing else signs. */
export function DeviceDialog({ open, locale, input, onClose, onActivated }: DeviceDialogProps) {
    const { getWallet } = useWallet();
    const t = messages[locale].salon;
    const copy = playerCopy[locale];
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<Error | null>(null);
    const controller = React.useRef<AbortController | null>(null);

    React.useEffect(() => () => controller.current?.abort(), []);
    React.useEffect(() => { if (!open) { controller.current?.abort(); setError(null); } }, [open]);

    const activate = async () => {
        if (busy) return;
        const current = new AbortController();
        controller.current = current;
        setBusy(true);
        setError(null);
        try {
            await activatePlaybackDevice(await getWallet(), input, current.signal);
            if (!current.signal.aborted) onActivated();
        } catch (reason) {
            if (!current.signal.aborted) setError(reason instanceof Error ? reason : new Error('device_verification_failed'));
        } finally {
            if (controller.current === current) { controller.current = null; setBusy(false); }
        }
    };

    return (
        <Dialog open={open} onClose={onClose} title={t.deviceTitle} closeLabel={t.close}>
            <div className="flex flex-col gap-5" lang={locale}>
                <p className="text-sm leading-relaxed text-light-2">{copy.activationInfo}</p>
                {busy && <StatusLine tone="progress">{copy.verifying}</StatusLine>}
                {error && <StatusLine tone="error">{playbackErrorMessage(error, locale)}</StatusLine>}
                <div className="flex flex-wrap gap-3">
                    <Button disabled={busy} onClick={() => void activate()}>
                        {error?.message === 'device_activation_pending' ? copy.checkAgain : copy.activate}
                    </Button>
                    <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
                </div>
            </div>
        </Dialog>
    );
}
