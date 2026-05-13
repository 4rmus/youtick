"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/LanguageContext";
import { useWallet } from "@/components/providers/WalletProvider";
import { TrialOnboarding } from "@/components/TrialOnboarding";
import { TrialUpgradeDialog } from "@/components/TrialUpgradeDialog";
import { readManagedNearAccount, type ManagedNearAccount } from "@/lib/managed-near-account";

function TrialContent() {
    const searchParams = useSearchParams();
    const redirect = searchParams.get("redirect");
    const { t } = useLanguage();
    const { accountId, connect, setManagedAccount } = useWallet();
    const [managedAccount, setManagedAccountState] = useState<ManagedNearAccount | null>(() => readManagedNearAccount());

    useEffect(() => {
        if (accountId && redirect) {
            window.location.href = redirect;
        }
    }, [accountId, redirect]);

    const handleManagedAccountCreated = (nextAccountId: string, kind: "guest" | "trial") => {
        setManagedAccountState({ accountId: nextAccountId, kind });
        setManagedAccount(nextAccountId, kind);
    };

    if (managedAccount) {
        return (
            <main className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-black flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 text-center shadow-2xl">
                    <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-near-green/10 text-near-green">
                        <CheckCircle2 className="h-7 w-7" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">
                        {t.trial_page?.welcome_success || "Welcome!"}
                    </h1>
                    <p className="mt-3 text-sm text-zinc-400">
                        {t.trial_page?.account_ready || "Your account is ready:"}
                    </p>
                    <p className="mt-3 break-all rounded-lg border border-zinc-800 bg-black/30 px-3 py-2 font-mono text-xs text-zinc-200">
                        {managedAccount.accountId}
                    </p>

                    <div className="mt-6 space-y-3">
                        <TrialUpgradeDialog accountId={managedAccount.accountId} />

                        <Button
                            onClick={() => connect()}
                            variant="outline"
                            className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                        >
                            <Wallet className="mr-2 h-4 w-4" />
                            {t.trial_page?.connect_wallet || t.nav.connect}
                        </Button>

                        <Button
                            onClick={() => window.location.href = redirect || "/discover"}
                            className="w-full bg-near-green font-semibold text-near-black hover:bg-near-green/80"
                        >
                            {redirect ? (t.trial_page?.go_to_ticket || "Go to Ticket") : (t.trial_page?.start_exploring || "Start Exploring")}
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-black flex items-center justify-center p-4">
            <TrialOnboarding
                onAccountCreated={handleManagedAccountCreated}
                onConnectWallet={() => void connect()}
            />
        </main>
    );
}

export default function TrialPage() {
    return (
        <Suspense fallback={
            <main className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-black flex items-center justify-center p-4">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
            </main>
        }>
            <TrialContent />
        </Suspense>
    );
}
