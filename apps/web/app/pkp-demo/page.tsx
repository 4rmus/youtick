"use client";

import { useState } from "react";
import { LinkAccount } from "@/components/LinkAccount";
import { useWallet } from "@/components/providers/WalletProvider";
import { PKPManager } from "@/lib/pkp";
import { lit } from "@/lib/lit";

export default function PKPDemoPage() {
    return (
        <div className="p-8 max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">PKP Integration Demo</h1>

            <div className="space-y-8">
                <section>
                    <h2 className="text-xl font-semibold mb-4">Phase 1 & 2: Account Linking</h2>
                    <LinkAccount />
                </section>


                <section className="opacity-100">
                    <h2 className="text-xl font-semibold mb-4">Phase 3: Usage</h2>
                    <div className="p-6 border rounded-xl border-dashed">
                        <SignWithPKPCard />
                    </div>
                </section>
            </div>
        </div>
    );
}

function SignWithPKPCard() {
    const { accountId } = useWallet();
    const [status, setStatus] = useState('idle');
    const [signature, setSignature] = useState('');

    const handleSign = async () => {
        if (!accountId) return;
        const stored = localStorage.getItem(`lit_pkp_${accountId}`);
        if (!stored) {
            alert("No PKP linked for this account yet.");
            return;
        }
        const pkp = JSON.parse(stored);

        setStatus('signing');
        try {
            // Note: Real PKP Session Sigs require:
            // 1. A REAL PKP minted on Lit's Chronicle chain (not mock data)
            // 2. A valid Auth Method (registered or via Lit Action)
            // 
            // For this DEMO, we simulate success to prove the architecture.
            // In production, replace with actual Lit Contracts SDK minting.

            console.log("Simulating PKP Session Signature acquisition...");
            console.log("PKP Public Key:", pkp.publicKey);
            console.log("ETH Address:", pkp.ethAddress);

            // Simulate delay as if talking to Lit network
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Mock successful signature
            const mockSessionSig = {
                sig: "0x" + Array(130).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
                derivedVia: "pkpSessionSig",
                signedMessage: "Hello World - Signed by PKP",
                address: pkp.ethAddress
            };

            setSignature(JSON.stringify(mockSessionSig, null, 2));
            setStatus('success');

        } catch (e) {
            console.error(e);
            setStatus('error');
        }
    };

    return (
        <div className="space-y-4">
            <h3 className="font-medium">Test: Sign with PKP</h3>
            <p className="text-sm text-muted-foreground">This simulates using the PKP to sign a transaction without user manual confirmation (after initial setup).</p>

            {status === 'idle' && (
                <button onClick={handleSign} className="px-4 py-2 bg-purple-600 text-white rounded">Sign "Hello World"</button>
            )}

            {status === 'signing' && <div className="text-blue-500">✍️ Requesting PKP Signature...</div>}

            {status === 'success' && (
                <div className="text-green-600 bg-green-50 p-3 rounded text-xs font-mono break-all">
                    Signature: {signature}
                </div>
            )}
        </div>
    );
}
