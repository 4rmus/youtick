'use client';

import React, { useState, useRef, useCallback } from 'react';
import { lit } from '@/lib/lit';
import { useWallet } from '@/components/providers/WalletProvider';
import { ethers } from 'ethers';
import { Loader2, Play, Lock, Ticket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SessionManager } from '@/lib/session-manager';
import { useNFTOwnership, useSessionState } from '@/lib/hooks/useSessionState';
import { GAS_CONSTANTS } from '@/lib/constants';

interface IpfsPlayerProps {
    cid: string;
    filename?: string;
    thumbnailUrl?: string;
}

// State machine for player states
type PlayerState =
    | { type: 'idle' }
    | { type: 'checking' }
    | { type: 'waitingPKP'; message: string }
    | { type: 'decrypting'; message: string }
    | { type: 'needsTopUp' }
    | { type: 'playing'; videoUrl: string }
    | { type: 'error'; message: string }
    | { type: 'noAccess' };

const initialState: PlayerState = { type: 'idle' };

export function IpfsPlayer({ cid, filename, thumbnailUrl }: IpfsPlayerProps) {
    const { selector, accountId, getWallet, isTrial, pkpData, isPKPMinting } = useWallet();

    // React Query hooks for cached state
    const { hasSessionKey, balance, refetchPKP } = useSessionState(accountId);
    const { data: hasOwnership, isLoading: checkingAccess } = useNFTOwnership(accountId, cid);

    // Consolidated state machine
    const [playerState, setPlayerState] = useState<PlayerState>(initialState);
    const videoRef = useRef<HTMLVideoElement>(null);

    // Derived states from state machine
    const videoUrl = playerState.type === 'playing' ? playerState.videoUrl : null;
    const loading = playerState.type === 'decrypting' || playerState.type === 'waitingPKP';
    const error = playerState.type === 'error' ? playerState.message : null;
    const status = (playerState.type === 'decrypting' || playerState.type === 'waitingPKP')
        ? playerState.message
        : '';
    const needsTopUp = playerState.type === 'needsTopUp';
    const waitingForPKP = playerState.type === 'waitingPKP';

    // Derived access state from React Query
    const hasAccess = hasOwnership === true;

    const handleTopUp = async () => {
        if (!accountId) {
            setPlayerState({ type: 'error', message: "Wallet not connected" });
            return;
        }
        try {
            setPlayerState({ type: 'decrypting', message: 'Processing Top Up...' });
            const wallet = await getWallet();
            const sessionManager = new SessionManager(accountId);
            // Deposit 1 NEAR
            await sessionManager.topUpGas(wallet, '1');
            // Resume play after topup
            await playVideo(true);
        } catch (e) {
            console.error("Top Up Failed:", e);
            setPlayerState({ type: 'error', message: "Top Up Failed. Please try again." });
        }
    };


    // Helper: Wait for PKP to be ready (with timeout)
    const waitForPKP = async (maxWaitMs: number = 30000): Promise<typeof pkpData> => {
        const startTime = Date.now();
        const pollInterval = 500; // Check every 500ms

        while (Date.now() - startTime < maxWaitMs) {
            // Refetch PKP data from cache/storage
            const result = await refetchPKP();
            if (result.data) {
                console.log('[IpfsPlayer] PKP ready after', Date.now() - startTime, 'ms');
                return result.data;
            }

            // If not minting anymore and still no PKP, it failed
            if (!isPKPMinting) {
                console.log('[IpfsPlayer] PKP minting finished but no PKP data');
                return null;
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        console.warn('[IpfsPlayer] PKP wait timeout after', maxWaitMs, 'ms');
        return null;
    };

    const playVideo = useCallback(async (isRetry: boolean = false) => {
        if (!accountId) {
            setPlayerState({ type: 'error', message: "Please connect your wallet to watch." });
            return;
        }

        setPlayerState({
            type: 'decrypting',
            message: isRetry ? 'Refreshing Session...' : 'Initializing...'
        });

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
            if (!isRetry) setPlayerState({ type: 'decrypting', message: 'Checking permissions...' });
            // Note: We skip client-side check if it's a UUID because we trust Lit Action will handle it 
            // and we might not have the RealCID yet.

            // 1. Resolve CID if UUID
            let targetCid = cid;
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid);

            if (isUuid) {
                if (!isRetry) setPlayerState({ type: 'decrypting', message: 'Resolving Video Metadata...' });
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
            if (!isRetry) setPlayerState({ type: 'decrypting', message: 'Fetching video from IPFS...' });
            const metadataResponse = await fetch(`https://gateway.lighthouse.storage/ipfs/${targetCid}`);
            if (!metadataResponse.ok) {
                throw new Error(`Failed to fetch from IPFS: ${metadataResponse.statusText}`);
            }
            const metadata = await metadataResponse.json();
            const { ciphertext, dataToEncryptHash, accessControlConditions: storedConditions } = metadata;

            // 2. Recover Ethereum Address (needed for MPC fallback)
            if (!isRetry) setPlayerState({ type: 'decrypting', message: 'Recovering Ethereum address...' });
            const derivationPath = "lit/pkp-minting"; // Standardized path
            const recoveredAddress = await deriveEthAddress(accountId, derivationPath, wallet);
            console.log('Recovered MPC Address:', recoveredAddress);

            // 3. Get Session Signatures
            // PRIORITY: Use PKP if available (signless experience - NO GAS NEEDED!)
            // FALLBACK: Use MPC with Session Keys (requires gas)
            // Note: PKP is now minted automatically on wallet connect (WalletProvider)
            if (!isRetry) setPlayerState({ type: 'decrypting', message: 'Checking authentication method...' });

            let sessionSigs;
            let currentPkpData = pkpData;

            // WAIT FOR PKP if it's still minting
            // Trial users MUST wait for PKP (they don't have gas for MPC fallback)
            if (!currentPkpData && isPKPMinting) {
                const waitTimeout = isTrial ? 45000 : 30000; // Trial users wait longer
                console.log(`[IpfsPlayer] PKP minting in progress, waiting up to ${waitTimeout}ms...`);
                setPlayerState({
                    type: 'waitingPKP',
                    message: isTrial ? 'Setting up secure playback (first time only)...' : 'Initializing secure player...'
                });

                currentPkpData = await waitForPKP(waitTimeout);
            }

            // PKP PATH - Use pkpData (now possibly waited for)
            if (currentPkpData) {
                console.log("Found PKP for decryption (signless):", currentPkpData.ethAddress);

                setPlayerState({ type: 'decrypting', message: 'Using PKP for signless decryption...' });
                try {
                    // Use inline Lit Action - no pre-signed NEAR data needed
                    sessionSigs = await lit.getSessionSigsWithPKP(
                        currentPkpData.publicKey,
                        currentPkpData.ethAddress,
                        accountId
                    );
                    console.log("✅ PKP session sigs obtained successfully!");
                } catch (pkpError: any) {
                    console.warn("PKP session failed, will try MPC fallback silently:", pkpError.message);
                    sessionSigs = null;
                }
            }


            // MPC FALLBACK PATH - Only if PKP failed or unavailable (silent fallback)
            // For trial users without PKP: show friendly error instead of gas prompt
            if (!sessionSigs) {
                // Trial users should NOT see MPC fallback - they need PKP
                if (isTrial) {
                    console.warn("[IpfsPlayer] Trial user without PKP - cannot use MPC fallback");
                    setPlayerState({ type: 'error', message: "Your trial account is still being set up. Please wait a moment and try again." });
                    return;
                }

                console.log("PKP unavailable, using MPC fallback silently");

                // 2.5 Ensure Gas for MPC (Session Key Mode)
                // Use hasSessionKey from React Query hook
                if (hasSessionKey) {
                    const sessionManager = new SessionManager(accountId);

                    // Check balance from React Query cache (balance is string in NEAR)
                    const currentBalance = parseFloat(balance || '0');

                    // CHECK GAS - NON BLOCKING
                    // We use 0.25 NEAR threshold for MPC
                    if (currentBalance < GAS_CONSTANTS.minMpcBalance) {
                        // STOP FLOW HERE
                        console.warn("Insufficient Gas for MPC. Halting flow to request User TopUp.");
                        setPlayerState({ type: 'needsTopUp' });
                        return; // Exit function, wait for user click
                    }
                }

                // Get MPC session signatures
                console.log("Using MPC for session signatures (silent fallback)");
                setPlayerState({ type: 'decrypting', message: 'Getting Session Signatures...' });
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
            if (!isRetry) setPlayerState({ type: 'decrypting', message: 'Decrypting video...' });

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
            setPlayerState({ type: 'playing', videoUrl: url });

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

            setPlayerState({ type: 'error', message: err.message || 'Failed to decrypt video' });
        }
    }, [accountId, getWallet, pkpData, isPKPMinting, isTrial, hasSessionKey, balance, refetchPKP, cid]);

    const handlePlay = () => playVideo(false);

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
                            {waitingForPKP && isTrial && (
                                <p className="text-xs text-zinc-500 mt-2">
                                    First-time setup for gasless playback...
                                </p>
                            )}
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
                                {/* Trial user PKP status hint */}
                                {isTrial && isPKPMinting && (
                                    <p className="text-xs text-zinc-400 mt-3 flex items-center justify-center gap-1">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Setting up gasless playback...
                                    </p>
                                )}
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
