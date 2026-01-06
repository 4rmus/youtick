"use client";

import React, { useState, useEffect } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { PKPManager } from '@/lib/pkp';
import { lit } from '@/lib/lit';
import { deriveEthAddress, MPCSignerV5 } from '@/lib/chain-signatures';
import * as ethers5 from 'ethers5';
import { ethers } from 'ethers';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const CHRONICLE_YELLOWSTONE_RPC = 'https://yellowstone-rpc.litprotocol.com';

export function LinkAccount() {
    const { selector, accountId, getWallet } = useWallet();
    const [status, setStatus] = useState<'idle' | 'signing' | 'minting' | 'minting & permissioning' | 'success' | 'error'>('idle');
    const [pkpInfo, setPkpInfo] = useState<any>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [mpcAddress, setMpcAddress] = useState<string | null>(null);
    const [mpcBalance, setMpcBalance] = useState<string>('0');

    // Derive MPC address on mount
    useEffect(() => {
        if (accountId) {
            deriveEthAddress(accountId, 'lit/pkp-minting').then(addr => {
                setMpcAddress(addr);
                // Check balance on Chronicle Yellowstone
                const provider = new ethers.JsonRpcProvider(CHRONICLE_YELLOWSTONE_RPC);
                provider.getBalance(addr).then(bal => {
                    setMpcBalance(ethers.formatEther(bal));
                });
            });
        }
    }, [accountId]);

    const handleMockLink = async () => {
        if (!accountId) return;

        try {
            setStatus('signing');
            const wallet = await getWallet();

            const message = "Allow this NEAR account to control a Lit PKP";
            const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(32)));
            const recipient = "dev-gift-1767641243.testnet";

            console.log("Requesting signature...");
            const result = await wallet.signMessage({ message, nonce, recipient });
            if (!result) throw new Error("User rejected signature");
            console.log("Signature received:", result);

            setStatus('minting');
            const pkpManager = new PKPManager((lit as any).litNodeClient);
            await lit.connect();

            // Mock minting (useMock = true by default)
            const mintedPkp = await pkpManager.mintPKPWithNear(
                accountId, result.publicKey, result.signature, message
            );

            if (typeof window !== 'undefined') {
                localStorage.setItem(`lit_pkp_${accountId}`, JSON.stringify(mintedPkp));
            }

            setPkpInfo(mintedPkp);
            setStatus('success');
        } catch (e: any) {
            console.error("Link failed:", e);
            setStatus('error');
            setErrorMsg(e.message || e.toString());
        }
    };

    const handleSponsoredMint = async () => {
        if (!accountId) return;

        try {
            // Step 1: Request NEAR signature for Lit Action verification
            setStatus('signing');
            const wallet = await getWallet();

            const message = `I authorize Lit Protocol PKP for account ${accountId} at ${Date.now()}`;
            const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(32)));
            const recipient = "dev-gift-1767641243.testnet";

            console.log("Requesting NEAR signature for Lit Action...");
            const signResult = await wallet.signMessage({ message, nonce, recipient });
            if (!signResult) throw new Error("User rejected signature");
            console.log("NEAR Signature received:", signResult);

            // Step 2: Use Relayer API for Sponsored Mint (App pays gas!)
            setStatus('minting & permissioning');
            console.log("Sending mint request to Relayer...");

            const response = await fetch('/api/relayer/mint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nearAccountId: accountId,
                    nearPublicKey: signResult.publicKey,
                    signature: signResult.signature,
                    message: message
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Relayer failed');

            const mintedPkp = data.pkp;

            // Step 3: Store PKP info WITH NEAR signature
            const pkpWithSignature = {
                ...mintedPkp,
                nearSignature: signResult.signature,
                nearMessage: message,
                nearPublicKey: signResult.publicKey
            };

            if (typeof window !== 'undefined') {
                localStorage.setItem(`lit_pkp_${accountId}`, JSON.stringify(pkpWithSignature));
            }

            setPkpInfo(pkpWithSignature);
            setStatus('success');
            console.log("PKP linked via Sponsored Relayer!");
        } catch (e: any) {
            console.error("Sponsored mint failed:", e);
            setStatus('error');
            setErrorMsg(e.message || e.toString());
        }
    };

    return (
        <div className="p-6 border rounded-xl bg-card text-card-foreground shadow-sm">
            <h3 className="text-lg font-semibold mb-2">Link NEAR Account to PKP</h3>
            <p className="text-sm text-muted-foreground mb-4">
                Create a programmable key pair controlled by your NEAR wallet.
            </p>

            {!accountId ? (
                <div className="text-yellow-600 bg-yellow-500/10 p-3 rounded text-sm">
                    Please connect your wallet first.
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="font-bold">Account:</span>
                        <span className="font-mono bg-muted px-2 py-1 rounded">{accountId}</span>
                    </div>

                    {mpcAddress && (
                        <div className="space-y-4">
                            <Card className="bg-primary/5 border-primary/20 border">
                                <CardHeader className="py-3">
                                    <div className="flex justify-between items-center">
                                        <CardTitle className="text-sm font-bold text-primary">Sponsored Onboarding</CardTitle>
                                        <div className="px-2 py-0.5 bg-green-500/10 text-green-600 text-[10px] font-bold rounded-full animate-pulse">
                                            GAS FREE
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="py-2 space-y-3">
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        We use a <strong>Gas Relayer</strong> to sponsor your account setup. No testnet tokens are required for this step.
                                    </p>

                                    <div className="text-[9px] text-muted-foreground italic border-t pt-2">
                                        💡 Tip: The app pays the gas fees on the Chronicle network so you can start watching instantly.
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    {pkpInfo && (
                        <div className="text-xs p-3 bg-green-500/5 border border-green-500/20 rounded space-y-1">
                            <div className="flex justify-between">
                                <strong>PKP Key Identity:</strong>
                                <span className="font-mono text-green-600 dark:text-green-400 font-bold">{pkpInfo.ethAddress.substring(0, 10)}...</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                                This secure identity handles your signless decryption.
                            </div>
                        </div>
                    )}

                    {status === 'idle' && (
                        <div className="flex flex-col gap-3">
                            <Button
                                onClick={handleSponsoredMint}
                                className="w-full bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/40 py-6 text-base font-bold"
                            >
                                Link Sponsored Identity (Free)
                            </Button>

                            <p className="text-[10px] text-center text-muted-foreground">
                                Powered by YouTick Gas Relayer
                            </p>
                        </div>
                    )}

                    {status === 'signing' && <div className="text-blue-500 text-sm">✍️ Please sign the message in your wallet...</div>}
                    {status === 'minting' && <div className="text-purple-500 text-sm">⛓️ Minting PKP on Lit Protocol (Chronicle Yellowstone)...</div>}

                    {status === 'success' && (
                        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded text-green-700 dark:text-green-400 text-sm">
                            <p className="font-bold">✅ PKP Linked Successfully!</p>
                            <p className="text-xs mt-1">You can now watch videos without further signature prompts.</p>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded text-red-700 dark:text-red-400 text-sm">
                            <p className="font-bold">❌ Error</p>
                            <p>{errorMsg}</p>
                            <button onClick={() => setStatus('idle')} className="mt-2 underline">Try Again</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
