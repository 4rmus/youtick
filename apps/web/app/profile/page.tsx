'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, User, Wallet } from 'lucide-react';
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
        <PageShell className="max-w-3xl">
            <h1 className="text-3xl font-bold">Profile</h1>
            <div className="mt-8 grid gap-6 md:grid-cols-2">
                <Card className="p-6">
                    <Wallet className="h-5 w-5 text-zinc-400" />
                    <p className="mt-4 text-xs uppercase tracking-wider text-zinc-500">Connected wallet</p>
                    <p className="mt-2 break-all font-mono text-sm">{accountId}</p>
                </Card>
                <Card className="p-6">
                    <p className="text-xs uppercase tracking-wider text-zinc-500">Creator USDC balance</p>
                    {balanceQuery.isLoading ? (
                        <Loader2 role="status" className="mt-4 h-6 w-6 animate-spin" />
                    ) : balanceQuery.error ? (
                        <p role="alert" className="mt-4 text-sm text-red-400">Balance could not be loaded.</p>
                    ) : (
                        <p className="mt-4 text-3xl font-bold">{formatUsdc(balanceQuery.data || '0')} USDC</p>
                    )}
                    <Button className="mt-6 w-full" disabled={busy || !balanceQuery.data || BigInt(balanceQuery.data) === 0n} onClick={() => void withdraw()}>
                        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Withdraw
                    </Button>
                    {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
                </Card>
            </div>
        </PageShell>
    );
}
