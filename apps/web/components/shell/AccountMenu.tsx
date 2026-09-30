'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { useWallet } from '@/components/providers/WalletProvider';
import { Button } from '@/components/ui/button';
import { formatYoctoNear } from '@/features/upload/upload-job';
import { FEATURE_FLAGS } from '@/lib/constants';
import { setLocale, useLocale, useMessages } from '@/lib/i18n/I18nProvider';
import { formatUsdc } from '@/lib/livepeer-publication';
import { readAccountBalance } from './account-balance';
import { deviceStorageAvailable } from './device-status';

const subscribeNothing = () => () => undefined;

function useDeviceReady(): boolean | null {
    return React.useSyncExternalStore(subscribeNothing, deviceStorageAvailable, () => null);
}

/** Account details and actions; mounted only while the menu is open, so the balance is read on demand. */
export function AccountMenuContent({ onNavigate }: { onNavigate?(): void }) {
    const { accountId, connect, isReady, signOut } = useWallet();
    const locale = useLocale();
    const t = useMessages().nav;
    const deviceReady = useDeviceReady();
    const balance = useQuery({
        queryKey: ['accountMenuBalance', accountId],
        queryFn: () => readAccountBalance(accountId!),
        enabled: Boolean(accountId),
        staleTime: 30_000,
        retry: false,
    });
    const row = 'flex min-h-11 items-center justify-between gap-4 border-b border-line text-sm';

    return (
        <div className="flex flex-col text-light">
            {accountId ? (
                <p className="break-all pb-3 text-base font-semibold">{accountId}</p>
            ) : (
                <div className="flex flex-col gap-2 pb-4">
                    <Button disabled={!isReady} onClick={() => { onNavigate?.(); void connect(); }}>{t.connect}</Button>
                    <p className="text-[13px] text-light-3">{t.connectFree}</p>
                </div>
            )}
            <dl className="border-t border-line">
                {accountId && (
                    <div className={row}>
                        <dt className="text-light-3">{t.balance}</dt>
                        <dd className="tabular text-right" aria-live="polite">
                            {balance.data
                                ? `${formatUsdc(balance.data.usdcBalance)} USDC · ${formatYoctoNear(balance.data.nearBalanceYocto)} NEAR`
                                : balance.isError ? t.balanceUnavailable : t.balanceLoading}
                        </dd>
                    </div>
                )}
                <div className={row}>
                    <dt className="text-light-3">{t.device}</dt>
                    <dd className={deviceReady === false ? 'text-alert' : undefined}>
                        {deviceReady === false ? t.deviceStorageOff : deviceReady ? t.deviceReady : ''}
                    </dd>
                </div>
                <div className={row}>
                    <dt className="text-light-3">{t.language}</dt>
                    <dd>
                        <button
                            type="button"
                            aria-label={t.switchLanguage}
                            onClick={() => setLocale(locale === 'tr' ? 'en' : 'tr')}
                            className="min-h-11 rounded-xs px-2 font-semibold underline underline-offset-4 hover:text-ice focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ice"
                        >
                            {t.languageName}
                        </button>
                    </dd>
                </div>
            </dl>
            <div className="flex flex-col py-2 text-sm">
                {accountId && (
                    <Link href="/profile" onClick={onNavigate} className="flex min-h-11 items-center font-semibold hover:text-ice">{t.earnings}</Link>
                )}
                <div className="flex gap-5">
                    <Link href="/terms" onClick={onNavigate} className="flex min-h-11 items-center text-light-3 hover:text-light">{t.terms}</Link>
                    <Link href="/privacy" onClick={onNavigate} className="flex min-h-11 items-center text-light-3 hover:text-light">{t.privacy}</Link>
                </div>
            </div>
            {accountId && (
                <div className="flex flex-col gap-2 border-t border-line pt-4">
                    {FEATURE_FLAGS.publicTestnetVideoV1 && (
                        <Button variant="outline" disabled={!isReady} onClick={() => { onNavigate?.(); void connect(); }}>{t.switchAccount}</Button>
                    )}
                    <Button variant="destructive" onClick={() => { onNavigate?.(); void signOut(); }}>{t.disconnect}</Button>
                </div>
            )}
        </div>
    );
}

/** Desktop account button with a disclosure panel. */
export function AccountMenu() {
    const { accountId, connect, isReady } = useWallet();
    const t = useMessages().nav;
    const pathname = usePathname();
    const [open, setOpen] = React.useState(false);
    const rootRef = React.useRef<HTMLDivElement>(null);
    const buttonRef = React.useRef<HTMLButtonElement>(null);
    const panelId = React.useId();

    React.useEffect(() => { setOpen(false); }, [pathname, accountId]);
    React.useEffect(() => {
        if (!open) return;
        const onPointer = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setOpen(false);
            buttonRef.current?.focus();
        };
        document.addEventListener('pointerdown', onPointer);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', onPointer);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    if (!accountId) {
        return <Button size="sm" disabled={!isReady} onClick={() => void connect()}>{t.connect}</Button>;
    }

    return (
        <div ref={rootRef} className="relative">
            <button
                ref={buttonRef}
                type="button"
                aria-label={t.accountMenu(accountId)}
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen((value) => !value)}
                className="flex h-11 max-w-60 items-center gap-2 rounded-xs border border-light/30 px-4 text-sm text-light hover:border-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ice"
            >
                <span className="truncate">{accountId}</span>
                <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0" />
            </button>
            {open && (
                <div id={panelId} className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xs border border-line bg-panel p-5">
                    <AccountMenuContent onNavigate={() => setOpen(false)} />
                </div>
            )}
        </div>
    );
}
