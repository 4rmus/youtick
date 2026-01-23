'use client';

import React, { useEffect, useState, useRef } from 'react';
import { lit } from '@/lib/lit';
import { useWallet } from '@/components/providers/WalletProvider';
import { ethers } from 'ethers';
import { Loader2, Play, Lock, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MintButton } from '@/components/MintButton'; // Keep for legacy/fallback
import { TicketPurchaseCard } from '@/components/TicketPurchaseCard';
import { SessionManager } from '@/lib/session-manager';
import { PKPManager } from '@/lib/pkp';

interface IpfsPlayerProps {
    cid: string;
    filename?: string;
    thumbnailUrl?: string;
}

export function IpfsPlayer({ cid, filename, thumbnailUrl }: IpfsPlayerProps) {
    const { selector, accountId, getWallet, isTrial } = useWallet();
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string>('');
    const videoRef = useRef<HTMLVideoElement>(null);

    const [checkingAccess, setCheckingAccess] = useState(true);
    const [hasAccess, setHasAccess] = useState<boolean | null>(null);
    const [needsTopUp, setNeedsTopUp] = useState(false);

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

    const handleTopUp = async () => {
        if (!accountId) {
            setError("Wallet not connected");
            return;
        }
        try {
            setLoading(true);
            setStatus('Processing Top Up...');
            const wallet = await getWallet();
            const sessionManager = new SessionManager(accountId);
            // Deposit 1 NEAR
            await sessionManager.topUpGas(wallet, '1');
            setNeedsTopUp(false);
            // Resume play after topup
            await playVideo(true);
        } catch (e) {
            console.error("Top Up Failed:", e);
            setError("Top Up Failed. Please try again.");
            setLoading(false);
        }
    };


    const playVideo = async (isRetry: boolean = false) => {
        if (!accountId) {
            setError("Please connect your wallet to watch.");
            return;
        }

        setLoading(true);
        setError(null);
        setNeedsTopUp(false);
        setStatus(isRetry ? 'Refreshing Session...' : 'Initializing...');

        try {
            const wallet = await getWallet();
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
            if (!isRetry) setStatus('Checking permissions...');
            // Note: We skip client-side check if it's a UUID because we trust Lit Action will handle it 
            // and we might not have the RealCID yet.

            // 1. Resolve CID if UUID
            let targetCid = cid;
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid);

            if (isUuid) {
                if (!isRetry) setStatus('Resolving Video Metadata...');
                try {
                    const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v1.utick.testnet';
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
            if (!isRetry) setStatus('Fetching video from IPFS...');
            const metadataResponse = await fetch(`https://gateway.lighthouse.storage/ipfs/${targetCid}`);
            if (!metadataResponse.ok) {
                throw new Error(`Failed to fetch from IPFS: ${metadataResponse.statusText}`);
            }
            const metadata = await metadataResponse.json();
            const { ciphertext, dataToEncryptHash, accessControlConditions: storedConditions } = metadata;

            // 2. Recover Ethereum Address (needed for MPC fallback)
            if (!isRetry) setStatus('Recovering Ethereum address...');
            const derivationPath = "lit/pkp-minting"; // Standardized path
            const recoveredAddress = await deriveEthAddress(accountId, derivationPath, wallet);
            console.log('Recovered MPC Address:', recoveredAddress);

            // 3. Get Session Signatures
            // PRIORITY: Use PKP if available (signless experience - NO GAS NEEDED!)
            // FALLBACK: Use MPC with Session Keys (requires gas)
            if (!isRetry) setStatus('Checking authentication method...');

            let sessionSigs;
            const storedPkp = typeof window !== 'undefined'
                ? localStorage.getItem(`lit_pkp_${accountId}`)
                : null;

            // PKP PATH - Check FIRST before gas (PKP doesn't need gas!)
            if (storedPkp) {
                const pkp = JSON.parse(storedPkp);
                console.log("Found PKP for decryption (signless):", pkp.ethAddress);

                setStatus('Using PKP for signless decryption...');
                try {
                    // Use inline Lit Action - no pre-signed NEAR data needed
                    // The Lit Action handles authentication internally
                    sessionSigs = await lit.getSessionSigsWithPKP(
                        pkp.publicKey,
                        pkp.ethAddress,
                        accountId
                        // No NEAR signature params needed for inline Lit Action
                    );
                    console.log("✅ PKP session sigs obtained successfully!");
                } catch (pkpError: any) {
                    console.warn("PKP session failed, will try MPC fallback:", pkpError.message);
                    sessionSigs = null;
                }
            }

            // LAZY PKP MINTING - Mint PKP for any account that doesn't have one yet
            // Uses relay-based minting (gas-free for users)
            // This eliminates MPC gas costs for all future video plays
            if (!sessionSigs && !storedPkp) {
                console.log("🔐 Account without PKP - minting now for signless experience...");
                setStatus('Setting up signless access (one-time)...');

                try {
                    // Initialize PKP Manager
                    const pkpManager = new PKPManager(lit.getLitNodeClient());

                    // Relay-based minting (gas-free for users)
                    const result = await pkpManager.mintPKPSmart(accountId);

                    // Store PKP for future use
                    localStorage.setItem(`lit_pkp_${accountId}`, JSON.stringify({
                        publicKey: result.publicKey,
                        ethAddress: result.ethAddress,
                        tokenId: result.tokenId
                    }));
                    console.log(`✅ PKP minted via ${result.method}:`, result.ethAddress);

                    // Now use the newly minted PKP for this session
                    setStatus('Using new PKP for signless decryption...');
                    sessionSigs = await lit.getSessionSigsWithPKP(
                        result.publicKey,
                        result.ethAddress,
                        accountId
                    );
                    console.log("✅ First play with new PKP successful!");
                } catch (pkpMintError: any) {
                    console.warn("Lazy PKP minting failed, falling back to MPC:", pkpMintError.message);
                }
            }


            // MPC FALLBACK PATH - Only if PKP failed or unavailable
            if (!sessionSigs) {
                console.log("PKP unavailable, using MPC fallback");

                // 2.5 Ensure Gas for MPC (Session Key Mode)
                // We check if the user has enough prepaid gas to cover the MPC signature cost
                const sessionManager = new SessionManager(accountId);
                if (await sessionManager.hasSessionKey()) {
                    const rpcUrl = typeof window !== 'undefined'
                        ? `${window.location.origin}/api/near-rpc`
                        : "https://rpc.testnet.near.org";

                    // CHECK GAS - NON BLOCKING
                    // We use 0.25 NEAR threshold (0.75 was too high for trials)
                    const hasGas = await sessionManager.hasSufficientGas(rpcUrl, 0.25);

                    if (!hasGas) {
                        // STOP FLOW HERE
                        console.warn("Insufficient Gas for MPC. Halting flow to request User TopUp.");
                        setNeedsTopUp(true);
                        setLoading(false);
                        return; // Exit function, wait for user click
                    }
                }

                // Get MPC session signatures
                console.log("Using MPC for session signatures");
                setStatus('Getting MPC Session Signatures...');
                sessionSigs = await lit.getSessionSigs(
                    wallet,
                    accountId,
                    recoveredAddress,
                    signWithSessionKey,
                    storedConditions,
                    dataToEncryptHash,
                    derivationPath
                );
            }

            // 4. Decrypt
            if (!isRetry) setStatus('Decrypting video...');

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

            // Check for Stale Session / Capability Error
            if (
                (err.message && err.message.includes('Could not find valid capability')) ||
                (err.shortMessage && err.shortMessage.includes('Could not find valid capability')) ||
                (err.message && err.message.includes('400')) // 400 Bad Request often from Lit Node on invalid sig
            ) {
                if (!isRetry) {
                    console.warn('Caught capability error. Clearing stale session and retrying...');
                    const { clearSessionCache } = await import('@/lib/lit');
                    clearSessionCache(accountId);
                    // Retry ONCE
                    await playVideo(true);
                    return;
                }
            }

            setError(err.message || 'Failed to decrypt video');
            setLoading(false);
        }
    };

    const handlePlay = () => playVideo(false);

    const checkSpecificAccess = async (viewerId: string, targetCid: string) => {
        const contractId = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v1.utick.testnet';
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
                    ) : needsTopUp ? (
                        <div className="relative z-10 p-6 bg-black/80 backdrop-blur-md rounded-xl border border-yellow-500/30 text-center max-w-sm">
                            <div className="h-12 w-12 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                <span className="text-2xl">⛽</span>
                            </div>
                            <h3 className="text-xl font-bold mb-2 text-white">Prepaid Gas Low</h3>
                            <p className="text-sm text-slate-300 mb-6">
                                The MPC signer needs a small gas deposit to verify your identity without popups.
                                Your balance is low.
                            </p>
                            <Button onClick={handleTopUp} size="lg" className="w-full gap-2 bg-yellow-500 hover:bg-yellow-600 text-black font-bold">
                                Top Up Gas (1 NEAR)
                            </Button>
                            <p className="text-xs text-zinc-500 mt-3">
                                This is a one-time deposit. Unused funds remain yours.
                            </p>
                        </div>
                    ) : loading ? (
                        <div className="text-center">
                            <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
                            <p className="text-sm text-slate-300">{status}</p>
                        </div>
                    ) : (hasAccess === false || error) ? (
                        // SHOW LOCKED SCREEN IF NO ACCESS OR ERROR
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md w-full h-full p-6 text-center">
                            <Lock className="w-16 h-16 text-zinc-600 mb-4" />
                            <h3 className="text-2xl font-bold text-white mb-2">Content Locked</h3>
                            <p className="text-zinc-400 max-w-sm mb-8">
                                You need a ticket to watch this video. Purchase one to unlock permanent access.
                            </p>

                            <div className="flex flex-col gap-4 w-full max-w-xs">
                                <Button
                                    className="w-full h-12 text-lg font-bold gap-2"
                                    onClick={() => window.location.href = `/ticket/${cid}`}
                                >
                                    <Ticket className="w-5 h-5" />
                                    Get Ticket
                                </Button>

                                {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
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
                    controlsList="nodownload"
                    onContextMenu={(e) => e.preventDefault()}
                    className="w-full h-full"
                    autoPlay
                />
            )}
        </div>
    );
}
