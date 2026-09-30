'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, User, Wallet } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { RuntimeClosed } from '@/components/RuntimeClosed';
import { ScreenState } from '@/components/ScreenState';
import { useCurrentCatalog } from '@/hooks/useCurrentCatalog';
import { useWallet } from '@/components/providers/WalletProvider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FEATURE_FLAGS } from '@/lib/constants';
import { useMessages } from '@/lib/i18n/I18nProvider';
import { formatUsdc, readCreatorBalance, withdrawCreatorBalance } from '@/lib/livepeer-publication';
import { readMarketCreatorPublicationPage } from '@/lib/market-read-model';

export default function ProfilePage() {
    const { accountId, connect, getWallet, isReady } = useWallet();
    const queryClient = useQueryClient();
    const t = useMessages().profile;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const balanceQuery = useQuery({
        queryKey: ['creatorBalance', accountId],
        queryFn: () => readCreatorBalance(accountId!),
        enabled: Boolean(accountId && FEATURE_FLAGS.enablePaidMediaLivepeerV1),
        staleTime: 15_000,
    });
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
            <PageShell className="flex items-center justify-center">
                <ScreenState
                    icon={<User className="h-7 w-7" />}
                    title={t.notConnectedTitle}
                    description={t.notConnectedDescription}
                    actions={<Button onClick={() => void connect()} disabled={!isReady}>{t.connectWallet}</Button>}
                />
            </PageShell>
        );
    }

    const withdraw = async () => {
        if (!balanceQuery.data || BigInt(balanceQuery.data) === 0n) return;
        setBusy(true);
        setError(null);
        try {
            await withdrawCreatorBalance(await getWallet());
            await queryClient.invalidateQueries({ queryKey: ['creatorBalance', accountId] });
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : t.withdrawFailed);
        } finally {
            setBusy(false);
        }
    };

    return (
        <PageShell>
            <div className="mx-auto max-w-7xl space-y-8">
                <div className="flex items-center gap-4">
                    <Button asChild variant="ghost" size="icon">
                        <Link href="/discover" aria-label={t.back}><ArrowLeft /></Link>
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t.title}</h1>
                        <p className="mt-1 text-sm text-zinc-400">
                            {FEATURE_FLAGS.enablePaidMediaLivepeerV1
                                ? t.descriptionPublishing
                                : t.descriptionReadOnly}
                        </p>
                    </div>
                </div>

                <div className="grid max-w-4xl gap-6 md:grid-cols-2">
                    <Card className="bg-zinc-900 p-6">
                        <div className="mb-4 flex items-center gap-3">
                            <div className="rounded-lg bg-zinc-800 p-2"><User className="h-5 w-5 text-zinc-400" /></div>
                            <h2 className="font-semibold text-zinc-200">{t.account}</h2>
                        </div>
                        <p className="text-xs uppercase tracking-wider text-zinc-500">{t.accountId}</p>
                        <p className="mt-2 break-all font-mono text-sm text-white">{accountId}</p>
                    </Card>

                    {FEATURE_FLAGS.enablePaidMediaLivepeerV1 && (
                        <Card className="border-near-green/20 bg-zinc-900 p-6">
                            <div className="mb-4 flex items-center gap-3">
                                <div className="rounded-lg bg-zinc-800 p-2"><Wallet className="h-5 w-5 text-zinc-400" /></div>
                                <h2 className="font-semibold text-zinc-200">{t.balance}</h2>
                            </div>
                            <p className="text-xs uppercase tracking-wider text-zinc-500">{t.available}</p>
                            {balanceQuery.isLoading ? (
                                <Loader2 role="status" aria-label={t.loadingBalance} className="mt-4 h-6 w-6 animate-spin text-zinc-500" />
                            ) : balanceQuery.error ? (
                                <p role="alert" className="mt-4 text-sm text-red-400">{t.balanceFailed}</p>
                            ) : (
                                <p className="mt-4 text-3xl font-bold text-white">{formatUsdc(balanceQuery.data || '0')} <span className="text-sm font-normal text-zinc-400">USDC</span></p>
                            )}
                            <Button variant="near" className="mt-6 w-full" disabled={busy || !balanceQuery.data || BigInt(balanceQuery.data) === 0n} onClick={() => void withdraw()}>
                                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {t.withdraw}
                            </Button>
                            {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
                        </Card>
                    )}
                </div>

                {FEATURE_FLAGS.enableDerivedReadModel && (
                    <Card className="max-w-4xl bg-zinc-900 p-6">
                        <h2 className="font-semibold text-zinc-200">{t.activity}</h2>
                        <p className="mt-1 text-sm text-zinc-500">
                            {FEATURE_FLAGS.enableCurrentCatalog
                                ? t.activityCurrent
                                : t.activityHistory}
                        </p>
                        {FEATURE_FLAGS.enableCurrentCatalog ? <CurrentCreatorPublications accountId={accountId} /> : activityQuery.isLoading ? (
                            <Loader2 role="status" aria-label={t.loadingActivity} className="mt-6 h-6 w-6 animate-spin text-zinc-500" />
                        ) : activityQuery.error ? (
                            <p role="alert" className="mt-6 text-sm text-red-400">{t.activityFailed}</p>
                        ) : activityQuery.data ? (
                            <div className="mt-6">
                                <p className="text-xs uppercase tracking-wider text-zinc-500">{t.publications}</p>
                                {activityQuery.data.length === 0 ? (
                                    <p className="mt-2 text-sm text-zinc-400">{t.noPublications}</p>
                                ) : (
                                    <ul className="mt-2 space-y-2">
                                        {activityQuery.data.slice(0, 5).map((publication) => (
                                            <li key={publication.publication_id}>
                                                {FEATURE_FLAGS.enablePaidMediaLivepeerV1 ? (
                                                    <Link className="text-sm text-zinc-200 hover:text-emerald-300" href={`/watch?job=${encodeURIComponent(publication.publication_id)}`}>
                                                        {publication.title} · {t.availability[publication.availability]}
                                                    </Link>
                                                ) : (
                                                    <span className="text-sm text-zinc-200">
                                                        {publication.title} · {t.availability[publication.availability]}
                                                    </span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ) : null}
                    </Card>
                )}
            </div>
        </PageShell>
    );
}

function CurrentCreatorPublications({ accountId }: { accountId: string }) {
    const query = useCurrentCatalog(accountId);
    const t = useMessages().profile;
    return <div className="mt-6">
        <p className="text-xs uppercase tracking-wider text-zinc-500">{t.publications}</p>
        {query.loading && <p role="status">{t.loadingPublications}</p>}
        {query.error && <p role="alert" className="text-red-400">{t.activityUpdateFailed}</p>}
        {query.warning && <p role="status" className="text-amber-300">{query.warning}</p>}
        {!query.loading && !query.error && query.publications.length === 0 && <p>{t.noPublications}</p>}
        <ul className="mt-2 space-y-2">{query.publications.map(publication => <li key={publication.publication_id}>
            <Link className="text-sm text-zinc-200 hover:text-emerald-300" href={`/watch?job=${encodeURIComponent(publication.publication_id)}`}>
                {publication.title} · {t.availability[publication.availability]}
            </Link>
        </li>)}</ul>
    </div>;
}
