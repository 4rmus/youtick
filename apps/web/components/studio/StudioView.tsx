'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageShell } from '@/components/PageShell';
import { RuntimeClosed } from '@/components/RuntimeClosed';
import { useWallet } from '@/components/providers/WalletProvider';
import { LoadErrorState } from '@/components/states/states';
import { StateScreen } from '@/components/states/StateScreen';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { StatusLine } from '@/components/ui/status-line';
import { useCurrentCatalog } from '@/hooks/useCurrentCatalog';
import { FEATURE_FLAGS } from '@/lib/constants';
import { useLocale, useMessages } from '@/lib/i18n/I18nProvider';
import { formatUsdc, readCreatorBalance, withdrawCreatorBalance, type LivepeerPublication } from '@/lib/livepeer-publication';
import {
    readCreatorSales,
    readCreatorWithdrawals,
    readMarketCreatorPublicationPage,
} from '@/lib/market-read-model';
import { ResumeUploadStrip } from './ResumeUploadStrip';
import { WithdrawDialog } from './WithdrawDialog';
import { canWithdraw, usdcSalesByPublication } from './studio-model';

/** Studio: overview, screenings, earnings and withdrawals for the connected creator. */
export function StudioView() {
    const { accountId, connect, getWallet, isReady } = useWallet();
    const queryClient = useQueryClient();
    const messages = useMessages();
    const t = messages.studio;
    const profile = messages.profile;
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [withdrawError, setWithdrawError] = useState(false);
    const balanceQuery = useQuery({
        queryKey: ['creatorBalance', accountId],
        queryFn: () => readCreatorBalance(accountId!),
        enabled: Boolean(accountId && FEATURE_FLAGS.enablePaidMediaLivepeerV1),
        staleTime: 15_000,
    });
    // Same visible-only refresh as the former profile screen (catalog-refresh test).
    const activityQuery = useQuery({
        queryKey: ['creatorReadModel', accountId],
        queryFn: async () => (await readMarketCreatorPublicationPage(accountId!, null, 5)).items,
        enabled: Boolean(accountId && FEATURE_FLAGS.enableDerivedReadModel && !FEATURE_FLAGS.enableCurrentCatalog),
        staleTime: 15_000,
        refetchInterval: 15_000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true,
        retry: false,
    });

    if (!FEATURE_FLAGS.enablePaidMediaLivepeerV1 && !FEATURE_FLAGS.enableDerivedReadModel) {
        return <RuntimeClosed />;
    }
    if (!accountId) {
        return (
            <PageShell>
                <StateScreen glyph="→" title={profile.notConnectedTitle} body={profile.notConnectedDescription}
                    actions={<Button size="lg" onClick={() => void connect()} disabled={!isReady}>{profile.connectWallet}</Button>} />
            </PageShell>
        );
    }

    const withdraw = async () => {
        if (!canWithdraw(balanceQuery.data)) return;
        setBusy(true);
        setWithdrawError(false);
        try {
            await withdrawCreatorBalance(await getWallet());
            setConfirming(false);
        } catch {
            // A missing wallet reply is not proof of failure; the balance below is read again either way.
            setWithdrawError(true);
            setConfirming(false);
        } finally {
            setBusy(false);
            await queryClient.invalidateQueries({ queryKey: ['creatorBalance', accountId] });
        }
    };

    return (
        <div className="container mx-auto flex min-h-[calc(100vh-4rem)] flex-col gap-12 px-4 py-12 md:py-16">
            <header className="flex flex-col gap-4 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
                <div className="flex flex-col gap-3">
                    <h1 className="font-display text-6xl md:text-8xl">{t.title}</h1>
                    <p className="break-all text-sm text-light-3">{accountId}</p>
                </div>
                {FEATURE_FLAGS.enablePaidMediaLivepeerV1 && (
                    <Button asChild size="lg"><Link href="/studio/new">{t.newScreening}</Link></Button>
                )}
            </header>

            {FEATURE_FLAGS.enablePaidMediaLivepeerV1 && <ResumeUploadStrip accountId={accountId} t={t} />}

            {FEATURE_FLAGS.enablePaidMediaLivepeerV1 && (
                <section aria-labelledby="earnings-title" className="flex flex-col gap-4">
                    <h2 id="earnings-title" className="label-caps">{t.earningsTitle}</h2>
                    <div className="flex flex-col gap-4 border border-line bg-panel p-6 md:flex-row md:items-end md:justify-between">
                        <div className="flex flex-col gap-2">
                            <p className="text-sm text-light-3">{t.withdrawable}</p>
                            {balanceQuery.isLoading ? <StatusLine tone="progress">{profile.loadingBalance}</StatusLine>
                                : balanceQuery.error ? <StatusLine tone="error">{profile.balanceFailed}</StatusLine>
                                    : <p className="tabular text-5xl">{formatUsdc(balanceQuery.data || '0')} <span className="text-2xl text-light-3">USDC</span></p>}
                            <p className="text-[13px] text-light-3">{t.canonical}</p>
                        </div>
                        <Button size="lg" disabled={busy || !canWithdraw(balanceQuery.data)} onClick={() => { setWithdrawError(false); setConfirming(true); }}>
                            {t.withdraw}
                        </Button>
                    </div>
                    {withdrawError && <StatusLine tone="error">{t.withdrawUnknown}</StatusLine>}
                    <WithdrawDialog
                        open={confirming}
                        amount={formatUsdc(balanceQuery.data || '0')}
                        recipient={accountId}
                        busy={busy}
                        t={t}
                        onConfirm={() => void withdraw()}
                        onClose={() => { if (!busy) setConfirming(false); }}
                    />
                </section>
            )}

            {FEATURE_FLAGS.enableDerivedReadModel && (
                <StudioScreenings accountId={accountId} activity={activityQuery} />
            )}

            {FEATURE_FLAGS.enableAccountReadModel && <Withdrawals accountId={accountId} />}
        </div>
    );
}

type ActivityQuery = { data?: LivepeerPublication[]; isLoading: boolean; error: unknown; refetch(): unknown };

function StudioScreenings({ accountId, activity }: { accountId: string; activity: ActivityQuery }) {
    const current = useCurrentCatalog(accountId);
    const locale = useLocale();
    const messages = useMessages();
    const t = messages.studio;
    const profile = messages.profile;
    const sales = useQuery({
        queryKey: ['creatorSales', accountId],
        queryFn: () => readCreatorSales(accountId, null, 50),
        enabled: Boolean(FEATURE_FLAGS.enableAccountReadModel),
        staleTime: 60_000,
        retry: false,
    });
    const list = FEATURE_FLAGS.enableCurrentCatalog
        ? { items: current.publications, loading: current.loading, error: current.error, warning: current.warning, retry: current.refetch }
        : { items: activity.data ?? [], loading: activity.isLoading, error: activity.error, warning: undefined, retry: activity.refetch };
    // Sales columns only when G12 data is present.
    const totals = sales.data ? usdcSalesByPublication(sales.data.items) : null;

    return (
        <section aria-labelledby="screenings-title" className="flex flex-col gap-4">
            <h2 id="screenings-title" className="label-caps">{t.screeningsTitle}</h2>
            <p className="text-[13px] text-light-3">{FEATURE_FLAGS.enableCurrentCatalog ? profile.activityCurrent : profile.activityHistory}</p>
            {list.warning && !list.error && <StatusLine>{list.warning}</StatusLine>}
            {list.loading ? <StatusLine tone="progress">{profile.loadingPublications}</StatusLine>
                : list.error && list.items.length === 0 ? <LoadErrorState title={profile.activityFailed} onRetry={() => void list.retry()} />
                    : list.items.length === 0 ? <p className="text-light-2">{profile.noPublications}</p> : (
                        <div className="overflow-x-auto">
                            {list.error ? <StatusLine tone="error">{profile.activityUpdateFailed}</StatusLine> : null}
                            <table className="w-full min-w-[520px] border-t border-line text-left text-sm">
                                <thead className="text-light-3">
                                    <tr className="border-b border-line">
                                        <th scope="col" className="py-3 pr-4 font-semibold">{t.columnScreening}</th>
                                        <th scope="col" className="py-3 pr-4 font-semibold">{t.columnState}</th>
                                        <th scope="col" className="py-3 pr-4 text-right font-semibold">{t.columnPrice}</th>
                                        {totals && <th scope="col" className="py-3 pr-4 text-right font-semibold">{t.columnSales}</th>}
                                        {totals && <th scope="col" className="py-3 text-right font-semibold">{t.columnEarnings}</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {list.items.map((publication) => {
                                        const total = totals?.get(publication.publication_id);
                                        return (
                                            <tr key={publication.publication_id} className="border-b border-line">
                                                <td className="py-3 pr-4">
                                                    {FEATURE_FLAGS.enablePaidMediaLivepeerV1 ? (
                                                        <Link className="font-semibold hover:text-ice" href={`/s/${encodeURIComponent(publication.publication_id)}`}>{publication.title}</Link>
                                                    ) : <span className="font-semibold">{publication.title}</span>}
                                                </td>
                                                <td className="py-3 pr-4">
                                                    <Chip tone={publication.availability === 'ACTIVE' ? 'onSale' : publication.availability === 'TAKEDOWN' ? 'neutral' : 'paused'}>
                                                        {profile.availability[publication.availability]}
                                                    </Chip>
                                                </td>
                                                <td className="tabular py-3 pr-4 text-right">{formatUsdc(publication.price_usdc)} USDC</td>
                                                {totals && <td className="tabular py-3 pr-4 text-right">{total?.saleCount ?? 0}</td>}
                                                {totals && <td className="tabular py-3 text-right">{formatUsdc(String(total?.creatorAmount ?? 0n))} USDC</td>}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
            {sales.data && (
                <p className="text-[13px] text-light-3">
                    {t.salesFreshness(new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(sales.data.indexedAtMs))}
                </p>
            )}
        </section>
    );
}

function Withdrawals({ accountId }: { accountId: string }) {
    const t = useMessages().studio;
    const query = useInfiniteQuery({
        queryKey: ['creatorWithdrawals', accountId],
        initialPageParam: null as string | null,
        queryFn: ({ pageParam }) => readCreatorWithdrawals(accountId, pageParam, 10),
        getNextPageParam: (page) => page.nextCursor,
        staleTime: 60_000,
        retry: false,
    });
    const items = query.data?.pages.flatMap((page) => page.items) ?? [];
    if (items.length === 0) return null;
    return (
        <section aria-labelledby="withdrawals-title" className="flex flex-col gap-4">
            <h2 id="withdrawals-title" className="label-caps">{t.withdrawalsTitle}</h2>
            <ul className="flex flex-col border-t border-line text-sm">
                {items.map((item) => (
                    <li key={item.withdrawalId} className="flex min-h-12 items-center justify-between gap-4 border-b border-line py-2">
                        <span className="tabular">{item.asset === 'USDC' ? `${formatUsdc(item.amount)} USDC` : `${item.amount} ${item.asset}`}</span>
                        <Chip tone={item.status === 'succeeded' ? 'onSale' : item.status === 'failed' ? 'paused' : 'neutral'}>{t.withdrawalStatus[item.status]}</Chip>
                    </li>
                ))}
            </ul>
        </section>
    );
}
