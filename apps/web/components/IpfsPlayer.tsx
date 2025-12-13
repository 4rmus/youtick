'use client';

import React, { useEffect, useState, useRef } from 'react';
import { lit } from '@/lib/lit';
import { useWallet } from '@/components/providers/WalletProvider';
import { ethers } from 'ethers';
import { Loader2, Play, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MintButton } from '@/components/MintButton'; // Keep for legacy/fallback
import { TicketPurchaseCard } from '@/components/TicketPurchaseCard';
import { SessionManager } from '@/lib/session-manager';

interface IpfsPlayerProps {
    cid: string;
    filename?: string;
    thumbnailUrl?: string;
}

export function IpfsPlayer({ cid, filename, thumbnailUrl }: IpfsPlayerProps) {
    const { selector, accountId } = useWallet();
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string>('');
    const videoRef = useRef<HTMLVideoElement>(null);

    const [checkingAccess, setCheckingAccess] = useState(true);
    const [hasAccess, setHasAccess] = useState<boolean | null>(null);

    useEffect(() => {
        let mounted = true;

        const checkAccess = async () => {
            if (!accountId || !cid) {
                setCheckingAccess(false);
                setHasAccess(false); // No account = no access
                return;
            }

            setCheckingAccess(true);
            try {
                // Check specific access for this video
                // We pass 'cid' directly because that's what is stored as 'encrypted_cid' in the contract for `buy_ticket`
                // (Ticket purchases reference the ID used in the URL/listing)
                const isAllowed = await checkSpecificAccess(accountId, cid);
                if (mounted) setHasAccess(isAllowed);
            } catch (e) {
                console.error("Access check failed:", e);
                // If check fails, we default to showing the lock screen (safe fail)
                if (mounted) setHasAccess(false);
            } finally {
                if (mounted) setCheckingAccess(false);
            }
        };

        checkAccess();

        return () => { mounted = false; };
    }, [cid, accountId]);


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
                    const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v0-2.utick.testnet';
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

    const checkSpecificAccess = async (viewerId: string, targetCid: string) => {
        const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v0-2.utick.testnet';
        const rpcUrl = "/api/near-rpc";
        const body = JSON.stringify({
            jsonrpc: "2.0",
            id: "dontcare",
            method: "query",
            params: {
                request_type: "call_function",
                finality: "final",
                account_id: contractId,
                method_name: "get_tokens_with_video",
                args_base64: btoa(JSON.stringify({ account_id: viewerId, limit: 100 })) // Check last 100 tokens
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

            // Defensive check: ensure result exists and is iterable
            const resultBytes = data?.result?.result;
            if (!resultBytes || !Array.isArray(resultBytes)) {
                console.warn("No result bytes from contract, possibly empty state");
                return false;
            }

            const resultString = String.fromCharCode(...resultBytes);
            // Returns Vec<(Token, Option<VideoMetadata>)>
            const tokens = JSON.parse(resultString);

            // Check if user owns a token for this specific CID or a Global Access Pass
            const hasAccess = tokens.some(([token, metadata]: [any, any]) => {
                if (!metadata) return false;
                return metadata.encrypted_cid === targetCid || metadata.encrypted_cid === 'ACCESS_PASS';
            });

            return hasAccess;
        } catch (e) {
            console.error("Check Access Error:", e);
            return false;
        }
    };

    return (
        <div className="w-full aspect-video bg-slate-900 rounded-lg overflow-hidden relative group">
            {!videoUrl ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white p-4">
                    {checkingAccess ? (
                        <div className="text-center">
                            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-zinc-500" />
                            <p className="text-xs text-zinc-500">Verifying access...</p>
                        </div>
                    ) : loading ? (
                        <div className="text-center">
                            <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
                            <p className="text-sm text-slate-300">{status}</p>
                        </div>
                    ) : (hasAccess === false || error) ? (
                        // SHOW TICKET CARD IF NO ACCESS OR ERROR
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 backdrop-blur-md w-full h-full p-4">
                            <div className="w-full max-w-sm">
                                <TicketPurchaseCard cid={cid} onPurchaseSuccess={() => window.location.reload()} />
                                <div className="mt-4 text-center">
                                    <Button onClick={handlePlay} variant="ghost" className="text-zinc-400 hover:text-white text-xs">
                                        Already bought? Check Access Again
                                    </Button>
                                    {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
                                </div>
                            </div>
                        </div>
                    ) : (
                        // SHOW PLAY BUTTON IF HAS ACCESS
                        <div className="relative z-10 text-center w-full h-full flex flex-col items-center justify-center">
                            {/* Background Thumbnail */}
                            {
                                thumbnailUrl && (
                                    <div className="absolute inset-0 z-0">
                                        <img
                                            src={thumbnailUrl}
                                            alt="Video Thumbnail"
                                            className="w-full h-full object-cover opacity-50 blur-sm"
                                        />
                                        <div className="absolute inset-0 bg-black/40" />
                                    </div>
                                )
                            }

                            <div className="relative z-10 p-6 bg-black/30 backdrop-blur-sm rounded-xl border border-white/10">
                                <Lock className="h-12 w-12 mx-auto mb-4 text-primary" />
                                <h3 className="text-xl font-bold mb-2 text-white">Encrypted Content</h3>
                                <p className="text-sm text-slate-200 mb-6 font-medium">
                                    Valid ticket found. You can watch this video.
                                </p>
                                <Button onClick={handlePlay} size="lg" className="gap-2 shadow-xl shadow-primary/20">
                                    <Play className="h-5 w-5" />
                                    Decrypt & Play
                                </Button>
                            </div>
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
