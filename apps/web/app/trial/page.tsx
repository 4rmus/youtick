"use client";

import { TrialOnboarding } from "@/components/TrialOnboarding";

export default function TrialPage() {
    const handleTrialCreated = (accountId: string) => {
        console.log("Trial account created:", accountId);
        // Store in localStorage for session persistence
        if (typeof window !== "undefined") {
            localStorage.setItem("trialAccountId", accountId);
        }
    };

    const handleConnectWallet = () => {
        // Redirect to main page with wallet connection
        window.location.href = "/?connect=true";
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
