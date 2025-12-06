'use client';

import React, { useEffect, useState, useRef } from 'react';
import { lit } from '@/lib/lit';
import { useWallet } from '@/components/providers/WalletProvider';
import { ethers } from 'ethers';
import { Loader2, Play, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MintButton } from '@/components/MintButton';
import { SessionManager } from '@/lib/session-manager';

interface IpfsPlayerProps {
    cid: string;
    filename?: string;
}

export function IpfsPlayer({ cid, filename }: IpfsPlayerProps) {
    const { selector, accountId } = useWallet();
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string>('');
    const videoRef = useRef<HTMLVideoElement>(null);

    const handlePlay = async () => {
        if (!accountId || !selector) {
            setError("Please connect your wallet to watch.");
            return;
        }

        setLoading(true);
        setError(null);
        setStatus('Initializing...');

        try {
            const wallet = await selector.wallet();
            const { deriveEthAddress } = await import('@/lib/chain-signatures');

            // Custom signWithMPC using Session Keys
            const signWithSessionKey = async (wallet: any, accountId: string, path: string, message: string) => {
                const sessionManager = new SessionManager(accountId);
                if (await sessionManager.hasSessionKey()) {
                    console.log("Signing with Session Key via Proxy...");
                    const messageHash = ethers.hashMessage(message);
                    const payload = Array.from(ethers.getBytes(messageHash));

                    const signature = await sessionManager.callMethod('sign_with_mpc', {
                        payload,
                        path,
                        key_version: 0
                    });
                    return signature;
                } else {
                    console.warn("No Session Key found, falling back to wallet prompt (not ideal for playback).");
                    // Fallback to standard wallet signing (will prompt)
                    const { signWithMPC } = await import('@/lib/chain-signatures');
                    return signWithMPC(wallet, accountId, path, message);
                }
            };

            // 0. Client-Side Access Control Check
            setStatus('Checking permissions...');
            // Note: We skip client-side check if it's a UUID because we trust Lit Action will handle it 
            // and we might not have the RealCID yet.

            // 1. Resolve CID if UUID
            let targetCid = cid;
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid);

            if (isUuid) {
                setStatus('Resolving Video Metadata...');
                try {
                    const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'utick-demo-v3.testnet';
                    const rpcUrl = "/api/near-rpc";
                    const body = JSON.stringify({
                        jsonrpc: "2.0",
                        id: "dontcare",
                        method: "query",
                        params: {
                            request_type: "call_function",
                            finality: "final",
                            account_id: contractId,
                            method_name: "get_event",
                            args_base64: btoa(JSON.stringify({ encrypted_cid: cid }))
                        }
                    });

                    const response = await fetch(rpcUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body
                    });
                    const data = await response.json();

                    if (data.result && data.result.result) {
                        const resultBytes = data.result.result;
                        const resultStr = String.fromCharCode(...resultBytes);
                        const event = JSON.parse(resultStr);

                        if (event && event.title && event.title.includes(':::')) {
                            // Extract RealCID from "RealCID:::Title"
                            const parts = event.title.split(':::');
                            targetCid = parts[0];
                            console.log("Resolved UUID", cid, "to RealCID", targetCid);
                        } else {
                            console.warn("Event found but title format unknown:", event?.title);
                        }
                    }
                } catch (e) {
                    console.error("Error resolving/fetching event:", e);
                    // Fallback: try to use cid as is
                }
            }

            // 1. Fetch Encrypted File from IPFS
            setStatus('Fetching video from IPFS...');
            const metadataResponse = await fetch(`https://gateway.lighthouse.storage/ipfs/${targetCid}`);
            if (!metadataResponse.ok) {
                throw new Error(`Failed to fetch from IPFS: ${metadataResponse.statusText}`);
            }
            const metadata = await metadataResponse.json();
            const { ciphertext, dataToEncryptHash, accessControlConditions: storedConditions } = metadata;

            // 2. Recover Ethereum Address (MPC)
            setStatus('Recovering Ethereum address...');
            const derivationPath = "test"; // Fixed path for demo
            const recoveredAddress = await deriveEthAddress(accountId, derivationPath, wallet);
            console.log('Recovered MPC Address:', recoveredAddress);

            // 3. Get Session Signatures (Specific to this file)
            setStatus('Getting Session Signatures...');
            const sessionSigs = await lit.getSessionSigs(
                wallet,
                accountId,
                recoveredAddress,
                signWithSessionKey,
                storedConditions,
                dataToEncryptHash,
                derivationPath
            );

            // 4. Decrypt
            setStatus('Decrypting video...');

            // SANITIZATION: Ensure 'chain' exists, remove 'key' (strict schema)
            const sanitizedConditions = storedConditions.map((cond: any) => {
                if (cond.conditionType === 'litAction') {
                    // Create a shallow copy
                    const newCond = { ...cond };

                    // Ensure chain is present (some nodes require it default to ethereum)
                    if (!newCond.chain) {
                        newCond.chain = 'ethereum';
                    }

                    // Remove key (Node validation might reject 'key' for boolean return type)
                    if (newCond.returnValueTest && 'key' in newCond.returnValueTest) {
                        const newTest = { ...newCond.returnValueTest };
                        delete newTest.key;
                        newCond.returnValueTest = newTest;
                    }

                    console.log("Sanitized litAction condition (chain added, key removed)");
                    return newCond;
                }
                return cond;
            });

            console.log('Decrypting with ACCs:', JSON.stringify(sanitizedConditions, null, 2));

            const decryptedBytes = await lit.decryptFile(
                ciphertext,
                dataToEncryptHash,
                sanitizedConditions, // Use sanitized conditions
                undefined, // No authSig
                'ethereum',
                sessionSigs
            );

            const decryptedBlob = new Blob([decryptedBytes as any], { type: 'video/mp4' });
            const url = URL.createObjectURL(decryptedBlob);
            setVideoUrl(url);
            setStatus('Ready to play!');
            setLoading(false);

        } catch (err: any) {
            console.error('Decryption failed:', err);
            setError(err.message || 'Failed to decrypt video');
            setLoading(false);
        }
    };

    const checkNearNFT = async (viewerId: string) => {
        const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'utick-demo-v3.testnet';
        // Use local proxy to avoid CORS issues
        const rpcUrl = "/api/near-rpc";
        const body = JSON.stringify({
            jsonrpc: "2.0",
            id: "dontcare",
            method: "query",
            params: {
                request_type: "call_function",
                finality: "final",
                account_id: contractId,
                method_name: "nft_supply_for_owner",
                args_base64: btoa(JSON.stringify({ account_id: viewerId }))
            }
        });

        try {
            const response = await fetch(rpcUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body
            });
            const data = await response.json();

            if (data.error) {
                console.error("RPC Error:", data.error);
                return false;
            }

            const resultBytes = data.result.result;
            const resultString = String.fromCharCode(...resultBytes);
            const supply = JSON.parse(resultString);

            return Number(supply) > 0;
        } catch (e) {
            console.error("Check NFT Error:", e);
            return false;
        }
    };

    return (
        <div className="w-full aspect-video bg-slate-900 rounded-lg overflow-hidden relative group">
            {!videoUrl ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-4">
                    {loading ? (
                        <div className="text-center">
                            <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
                            <p className="text-sm text-slate-300">{status}</p>
                        </div>


                    ) : error ? (
                        <div className="text-center max-w-md">
                            <Lock className="h-12 w-12 mx-auto mb-4 text-red-500" />
                            <p className="text-red-400 font-semibold mb-2">Access Restricted</p>
                            <p className="text-sm text-slate-400 mb-4">{error}</p>
                            <div className="flex flex-col gap-3 justify-center items-center">
                                <MintButton cid={cid} />
                                <Button onClick={handlePlay} variant="outline" className="border-red-500/50 hover:bg-red-500/10 h-8 text-xs">
                                    Check Access Again
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center">
                            <Lock className="h-12 w-12 mx-auto mb-4 text-primary" />
                            <h3 className="text-xl font-bold mb-2">Encrypted Content</h3>
                            <p className="text-sm text-slate-400 mb-6">
                                This video is encrypted. You need to sign in and own the NFT to watch.
                            </p>
                            <Button onClick={handlePlay} size="lg" className="gap-2">
                                <Play className="h-5 w-5" />
                                Decrypt & Play
                            </Button>
                        </div>
                    )}
                </div>
            ) : (
                <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    className="w-full h-full"
                    autoPlay
                />
            )}
        </div>
    );
}
