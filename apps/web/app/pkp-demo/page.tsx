"use client";

import { useState } from "react";
import { LinkAccount } from "@/components/LinkAccount";
import { useWallet } from "@/components/providers/WalletProvider";
import { PKPManager } from "@/lib/pkp";
import { lit } from "@/lib/lit";
import { AlertCircle, CheckCircle2, Loader2, Zap } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function PKPDemoPage() {
    return (
        <div className="p-8 max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">PKP Integration Demo</h1>

            <div className="space-y-8">
                <section>
                    <h2 className="text-xl font-semibold mb-4">Phase 1 & 2: Account Linking</h2>
                    <LinkAccount />
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-4">Phase 2.5: Manual PKP Production (Developer/Admin)</h2>
                    <ManualMintCard />
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

function ManualMintCard() {
    const { accountId, selector } = useWallet();
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState<string | null>(null);
    const [pkpResult, setPkpResult] = useState<any>(null);

    const handleManualMint = async () => {
        if (!accountId || !selector) {
            setError("Wallet not connected");
            return;
        }

        setStatus('onboarding');
        setError(null);
        try {
            // 1. Generate Auth Message
            const onboardingMsg = `Authorize PKP Onboarding for ${accountId} at ${new Date().toISOString()}`;

            // 2. Request Signature
            console.log("Requesting NEAR signature for manual mint...");
            const wallet = await selector.wallet();
            const signResult = await wallet.signMessage({
                message: onboardingMsg,
                recipient: accountId,
                nonce: Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))),
                callbackUrl: window.location.href
            });

            if (!signResult) throw new Error("Signature rejected");

            // 3. Call Relayer
            setStatus('minting');
            console.log("Calling relayer for manual sponsored mint...");
            const response = await fetch('/api/relayer/mint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nearAccountId: accountId,
                    nearPublicKey: signResult.publicKey,
                    signature: signResult.signature,
                    message: onboardingMsg
                })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || data.details || "Relayer error");
            }

            // 4. Update Local Storage and State
            const pkpWithVerification = {
                ...data.pkp,
                nearSignature: signResult.signature,
                nearMessage: onboardingMsg,
                nearPublicKey: signResult.publicKey,
                isManual: true
            };

            localStorage.setItem(`lit_pkp_${accountId}`, JSON.stringify(pkpWithVerification));
            localStorage.setItem(`lit_pkp_sig_${accountId}`, signResult.signature);
            localStorage.setItem(`lit_pkp_msg_${accountId}`, onboardingMsg);
            localStorage.setItem(`lit_pkp_pubkey_${accountId}`, signResult.publicKey);

            setPkpResult(pkpWithVerification);
            setStatus('success');
            console.log("Manual minting successful!");

        } catch (err: any) {
            console.error("Manual minting failed:", err);
            setError(err.message || String(err));
            setStatus('error');
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-yellow-500" />
                    Custom PKP Production
                </CardTitle>
                <CardDescription>
                    Trigger the sponsored PKP minting flow for your contract account.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {status === 'success' && (
                    <Alert className="bg-green-500/10 border-green-500/50 text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <AlertTitle>Successfully Produced!</AlertTitle>
                        <AlertDescription className="font-mono text-[10px] break-all">
                            ETH Address: {pkpResult?.ethAddress}
                        </AlertDescription>
                    </Alert>
                )}

                {error && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Production Failed</AlertTitle>
                        <AlertDescription className="text-xs">
                            {error}
                        </AlertDescription>
                    </Alert>
                )}

                {!pkpResult && (
                    <div className="text-sm text-zinc-500 bg-zinc-50 p-3 rounded-lg border border-dashed">
                        This will use the Relayer account to pay the LIT token fee and mint a permanent PKP (Programmable Key Pair) for your currently connected account.
                    </div>
                )}
            </CardContent>
            <CardFooter>
                <Button
                    onClick={handleManualMint}
                    disabled={status === 'onboarding' || status === 'minting' || !accountId}
                    className="w-full"
                >
                    {status === 'onboarding' && <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Authorizing...</>}
                    {status === 'minting' && <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Minting on Chronicle...</>}
                    {status === 'idle' && "Produce PKP (Signless Prep)"}
                    {status === 'success' && "Produce Another"}
                    {status === 'error' && "Retry Production"}
                </Button>
            </CardFooter>
        </Card>
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
            console.log("Acquiring REAL PKP Session Signatures...");
            const sessionSigs = await lit.getSessionSigsWithPKP(
                pkp.publicKey,
                pkp.ethAddress,
                accountId,
                pkp.nearSignature,
                pkp.nearMessage,
                pkp.nearPublicKey
            );

            console.log("Success! Acquired session sigs:", sessionSigs);
            setSignature(JSON.stringify(sessionSigs, null, 2));
            setStatus('success');
        } catch (e: any) {
            console.error("PKP Signing failed:", e);
            setStatus('error');
            alert(`Signing failed: ${e.message || String(e)}`);
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
