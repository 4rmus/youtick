"use client";

import { Suspense, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/components/providers/LanguageContext";
import { useWallet } from "@/components/providers/WalletProvider";
import { TrialOnboarding } from "@/components/TrialOnboarding";
import { readManagedNearAccount, type ManagedNearAccount } from "@/lib/managed-near-account";

function TrialContent() {
    const { t } = useLanguage();
    const { setManagedAccount } = useWallet();
    const [managedAccount, setManagedAccountState] = useState<ManagedNearAccount | null>(() => readManagedNearAccount());

    const handleManagedAccountCreated = (nextAccountId: string, kind: "guest" | "trial") => {
        setManagedAccountState({ accountId: nextAccountId, kind });
        setManagedAccount(nextAccountId, kind);
    };

    if (managedAccount) {
        return (
            <main className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-zinc-950 via-zinc-900 to-black flex items-center justify-center p-4">
                <Card className="w-full max-w-md bg-zinc-900/80 p-8 text-center">
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
                        <Button
                            onClick={() => window.location.href = "/discover"}
                            variant="near"
                            className="w-full"
                        >
                            {t.trial_page?.start_exploring || "Start Exploring"}
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </div>
                </Card>
            </main>
        );
    }

    return (
        <main className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-zinc-950 via-zinc-900 to-black flex items-center justify-center p-4">
            <TrialOnboarding
                onAccountCreated={handleManagedAccountCreated}
            />
        </main>
    );
}

export default function TrialPage() {
    return (
        <Suspense fallback={
            <main className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-zinc-950 via-zinc-900 to-black flex items-center justify-center p-4">
                <Loader2 className="h-8 w-8 animate-spin text-near-green" />
            </main>
        }>
            <TrialContent />
        </Suspense>
    );
}
