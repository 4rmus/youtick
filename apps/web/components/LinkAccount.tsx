"use client";

import React, { useState, useEffect } from 'react';
import { useWallet } from '@/components/providers/WalletProvider';
import { PKPManager } from '@/lib/pkp';
import { lit } from '@/lib/lit';
import { deriveEthAddress, MPCSignerV5 } from '@/lib/chain-signatures';
import * as ethers5 from 'ethers5';
import { ethers } from 'ethers';

const CHRONICLE_YELLOWSTONE_RPC = 'https://yellowstone-rpc.litprotocol.com';

export function LinkAccount() {
    const { selector, accountId } = useWallet();
    const [status, setStatus] = useState<'idle' | 'signing' | 'minting' | 'success' | 'error'>('idle');
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
        if (!selector || !accountId) return;

        try {
            setStatus('signing');
            const wallet = await selector.wallet();

            const message = "Allow this NEAR account to control a Lit PKP";
            const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(32)));
            const recipient = "v1.utick.testnet";

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

    const handleDirectMint = async () => {
        if (!selector || !accountId) return;

        try {
            setStatus('minting');
            const wallet = await selector.wallet();

            // Create Chronicle provider using ethers v5 (LitContracts requires v5)
            const provider = new ethers5.providers.JsonRpcProvider(CHRONICLE_YELLOWSTONE_RPC);

            // Create MPC Signer (v5 compatible)
            const mpcSigner = new MPCSignerV5(wallet, accountId, 'lit/pkp-minting', provider);

            console.log("MPC Signer Address:", await mpcSigner.getAddress());

            // Use mintPKPDirect
            const pkpManager = new PKPManager((lit as any).litNodeClient);
            await lit.connect();

            const mintedPkp = await pkpManager.mintPKPDirect(mpcSigner);

            if (typeof window !== 'undefined') {
                localStorage.setItem(`lit_pkp_${accountId}`, JSON.stringify(mintedPkp));
            }

            setPkpInfo(mintedPkp);
            setStatus('success');
        } catch (e: any) {
            console.error("Direct mint failed:", e);
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
                        <div className="text-xs p-3 bg-muted/50 rounded space-y-1">
                            <div><strong>MPC ETH Address:</strong> <span className="font-mono">{mpcAddress}</span></div>
                            <div><strong>Chronicle Balance:</strong> {mpcBalance} tstLPX</div>
                            {parseFloat(mpcBalance) === 0 && (
                                <a
                                    href="https://chronicle-yellowstone-faucet.getlit.dev/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-500 underline"
                                >
                                    Get testnet tokens from faucet →
                                </a>
                            )}
                        </div>
                    )}

                    {status === 'idle' && (
                        <div className="flex gap-2 flex-wrap">
                            <button
                                onClick={handleMockLink}
                                className="px-4 py-2 bg-gray-600 text-white hover:bg-gray-700 rounded-md text-sm font-medium transition-colors"
                            >
                                Mock Mint (Demo)
                            </button>
                            <button
                                onClick={handleDirectMint}
                                disabled={parseFloat(mpcBalance) === 0}
                                className="px-4 py-2 bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-sm font-medium transition-colors"
                            >
                                Real Mint (MPC + Chronicle)
                            </button>
                        </div>
                    )}

                    {status === 'signing' && <div className="text-blue-500 text-sm">✍️ Please sign the message in your wallet...</div>}
                    {status === 'minting' && <div className="text-purple-500 text-sm">⛓️ Minting PKP on Lit Protocol (Chronicle Yellowstone)...</div>}

                    {status === 'success' && (
                        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded text-green-700 dark:text-green-400 text-sm">
                            <p className="font-bold mb-2">✅ PKP Linked Successfully!</p>
                            <pre className="overflow-x-auto p-2 bg-background rounded border text-xs">
                                {JSON.stringify(pkpInfo, null, 2)}
                            </pre>
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
