'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { createNearAuthLab } from '@/lib/near-auth-lab';
import { nearAuthJobHref } from '@/lib/near-auth-lab';
import { createGoogleUploadWallet } from '@/lib/near-auth-upload-wallet';
import { connectFundingWallet } from '@/lib/near-auth-funding';
import { FEATURE_FLAGS } from '@/lib/constants';
import { LivepeerPaidUploadFormContent } from './LivepeerPaidUploadForm';
import { QueryProvider } from './providers/QueryProvider';
import { Button } from './ui/button';
import { NearAuthUsdcFunding } from './NearAuthUsdcFunding';
import { suspendDeviceSession } from '@/lib/device-session';

export function NearAuthUpload({ auth, disabled, onBusyChange }: {
    auth: ReturnType<typeof createNearAuthLab>; disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
    const [connection, setConnection] = useState<{ accountId: string; sponsorAccountId: string; wallet: ReturnType<typeof createGoogleUploadWallet> } | null>(null);
    const [message, setMessage] = useState('');
    const pending = useRef(false);
    const lifetime = useRef<AbortController | null>(null);
    const callback = useRef(onBusyChange);
    useEffect(() => { callback.current = onBusyChange; }, [onBusyChange]);
    const busyChanged = useCallback((busy: boolean) => { pending.current = busy; callback.current(busy); }, []);
    useEffect(() => {
        const abort = () => lifetime.current?.abort();
        window.addEventListener('pagehide', abort);
        return () => { abort(); window.removeEventListener('pagehide', abort); };
    }, []);
    const enabled = FEATURE_FLAGS.publicTestnetVideoV1 && FEATURE_FLAGS.enablePlaybackAuthorizerV2
        && FEATURE_FLAGS.enablePaidMediaLivepeerV1 && FEATURE_FLAGS.enableSponsoredLivepeerUploads;
    async function prepare() {
        if (pending.current || disabled || !enabled) return;
        busyChanged(true); setMessage('');
        const controller = new AbortController();
        lifetime.current?.abort(); lifetime.current = controller;
        try {
            const sponsor = await connectFundingWallet();
            const response = await fetch('/api/auth-lab/account', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
            if (response.status === 401) await suspendDeviceSession();
            if (!response.ok) throw new Error('account_required');
            const account = await response.json();
            if (typeof account.implicitAccount !== 'string' || !/^[a-f0-9]{64}$/.test(account.implicitAccount)
                || !Array.isArray(account.accounts) || !account.accounts.includes(account.implicitAccount)) throw new Error('account_required');
            controller.signal.throwIfAborted();
            setConnection({ accountId: account.implicitAccount, sponsorAccountId: sponsor.accountId, wallet: createGoogleUploadWallet(account.implicitAccount, sponsor, auth, controller.signal) });
        } catch {
            if (!controller.signal.aborted) setMessage('Google hesabı veya sponsor seçimi doğrulanamadı. Yükleme başlatılmadı.');
        } finally { busyChanged(false); }
    }
    return <section className="space-y-3 rounded-xl border border-white/15 p-4">
        <h2 className="font-semibold">Google hesabımla video yükle</h2>
        <p className="text-sm">Dosyayı kendiniz seçip yüklemeyi başlatırsınız. Google ve sponsor cüzdan onaylarını siz verirsiniz. Sponsor yalnız Google imza isteğinin ücretini karşılar; videonun sahibi Google hesabınız olur.</p>
        {!enabled ? <p role="status">Bu yerel deneme için testnet yükleme ayarları henüz açık değil.</p>
            : !connection ? <Button disabled={disabled} onClick={() => void prepare()}>İmza sponsorunu seç ve yükleme formunu aç</Button>
                : <QueryProvider><p className="break-all text-sm">Video sahibi: {connection.accountId}</p>
                    <p className="break-all text-sm">İmza sponsoru: {connection.sponsorAccountId}</p>
                    <fieldset disabled={disabled}><LivepeerPaidUploadFormContent accountId={connection.accountId} getWallet={async () => connection.wallet}
                        connect={async () => {}} isReady onBusyChange={busyChanged} allowUploadKeyReplacement={false} jobHref={nearAuthJobHref} /></fieldset>
                </QueryProvider>}
        {message && <p role="status">{message}</p>}
        {enabled && <NearAuthUsdcFunding disabled={disabled} onBusyChange={busyChanged} />}
    </section>;
}
