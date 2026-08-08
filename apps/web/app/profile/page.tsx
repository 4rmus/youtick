'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, User, Wallet } from 'lucide-react';
import { PageShell } from '@/components/PageShell';
import { RuntimeClosed } from '@/components/RuntimeClosed';
import { ScreenState } from '@/components/ScreenState';
import { useWallet } from '@/components/providers/WalletProvider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FEATURE_FLAGS } from '@/lib/constants';
import { formatUsdc, readCreatorBalance, withdrawCreatorBalance } from '@/lib/livepeer-publication';

export default function ProfilePage() {
    const { accountId, connect, getWallet, isReady } = useWallet();
    const queryClient = useQueryClient();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const balanceQuery = useQuery({
        queryKey: ['creatorBalance', accountId],
        queryFn: () => readCreatorBalance(accountId!),
        enabled: Boolean(accountId && FEATURE_FLAGS.enablePaidMediaLivepeerV1),
        staleTime: 15_000,
    });

    if (!FEATURE_FLAGS.enablePaidMediaLivepeerV1) return <RuntimeClosed />;
    if (!accountId) {
        return (
            <PageShell className="flex items-center justify-center">
                <ScreenState
                    icon={<User className="h-7 w-7" />}
                    title="Wallet not connected"
                    description="Connect the NEAR wallet that owns your publications."
                    actions={<Button onClick={() => void connect()} disabled={!isReady}>Connect wallet</Button>}
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
            setError(reason instanceof Error ? reason.message : 'Withdrawal failed.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <PageShell>
            <div className="mx-auto max-w-7xl space-y-8">
                <div className="flex items-center gap-4">
                    <Button asChild variant="ghost" size="icon">
                        <Link href="/discover" aria-label="Back to discover"><ArrowLeft /></Link>
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Profile</h1>
                        <p className="mt-1 text-sm text-zinc-400">Manage your publishing account and withdraw ticket revenue.</p>
                    </div>
                </div>

                <div className="grid max-w-4xl gap-6 md:grid-cols-2">
                    <Card className="bg-zinc-900 p-6">
                        <div className="mb-4 flex items-center gap-3">
                            <div className="rounded-lg bg-zinc-800 p-2"><User className="h-5 w-5 text-zinc-400" /></div>
                            <h2 className="font-semibold text-zinc-200">Account</h2>
                        </div>
                        <p className="text-xs uppercase tracking-wider text-zinc-500">Account ID</p>
                        <p className="mt-2 break-all font-mono text-sm text-white">{accountId}</p>
                    </Card>

                    <Card className="border-near-green/20 bg-zinc-900 p-6">
                        <div className="mb-4 flex items-center gap-3">
                            <div className="rounded-lg bg-zinc-800 p-2"><Wallet className="h-5 w-5 text-zinc-400" /></div>
                            <h2 className="font-semibold text-zinc-200">Creator balance</h2>
                        </div>
                        <p className="text-xs uppercase tracking-wider text-zinc-500">Available to withdraw</p>
                        {balanceQuery.isLoading ? (
                            <Loader2 role="status" aria-label="Loading balance" className="mt-4 h-6 w-6 animate-spin text-zinc-500" />
                        ) : balanceQuery.error ? (
                            <p role="alert" className="mt-4 text-sm text-red-400">Balance could not be loaded.</p>
                        ) : (
                            <p className="mt-4 text-3xl font-bold text-white">{formatUsdc(balanceQuery.data || '0')} <span className="text-sm font-normal text-zinc-400">USDC</span></p>
                        )}
                        <Button variant="near" className="mt-6 w-full" disabled={busy || !balanceQuery.data || BigInt(balanceQuery.data) === 0n} onClick={() => void withdraw()}>
                            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Withdraw
                        </Button>
                        {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
                    </Card>
                </div>
            </div>
        </PageShell>
    );
}
