"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { TrialOnboarding } from "@/components/TrialOnboarding";
import { useWallet } from "@/components/providers/WalletProvider";

export default function TrialPage() {
    const searchParams = useSearchParams();
    const redirect = searchParams.get("redirect");
    const { accountId, connect } = useWallet();

    // When wallet gets connected, redirect back to the original page
    useEffect(() => {
        if (accountId && redirect) {
            window.location.href = redirect;
        }
    }, [accountId, redirect]);

    const handleTrialCreated = (accountId: string) => {
        // Store in localStorage for session persistence
        if (typeof window !== "undefined") {
            localStorage.setItem("trialAccountId", accountId);
        }
    };

    const handleConnectWallet = () => {
        if (redirect) {
            // Open wallet modal; useEffect above handles redirect after connection
            connect();
        } else {
            window.location.href = "/?connect=true";
        }
    };

    return (
        <main className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-black flex items-center justify-center p-4">
            <TrialOnboarding
                onTrialCreated={handleTrialCreated}
                onConnectWallet={handleConnectWallet}
            />
        </main>
    );
}
