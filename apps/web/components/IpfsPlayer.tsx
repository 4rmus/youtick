'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { streamKmsVideo } from '@/lib/kms/streaming';
import { retrieveEncryptionKey } from '@/lib/kms/client';
import { fetchFromGateways } from '@/lib/crust';
import { useWallet } from '@/components/providers/WalletProvider';
import { Loader2, Play, Lock, KeyRound, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNFTOwnership } from '@/lib/hooks/useSessionState';
import { IPFSThumbnail } from './IPFSThumbnail';
import { TicketPurchaseCard } from './TicketPurchaseCard';
import { SessionManager } from '@/lib/session-manager';
import { NEAR_CONFIG } from '@/lib/constants';
import { getProvider, viewContract } from '@/lib/near';

interface IpfsPlayerProps {
    cid: string;
    thumbnailUrl?: string;
}

// State machine for player states
type PlayerState =
    | { type: 'idle' }
    | { type: 'decrypting'; message: string }
    | { type: 'playing'; videoUrl: string }
    | { type: 'needs-session-key' }
    | { type: 'banned' }
    | { type: 'error'; message: string };

const initialState: PlayerState = { type: 'idle' };

export function IpfsPlayer({ cid, thumbnailUrl }: IpfsPlayerProps) {
    const { accountId, getWallet } = useWallet();

    // React Query hooks for cached state
    const { data: hasOwnership, isLoading: checkingAccess, refetch: refetchOwnership } = useNFTOwnership(accountId, cid);

    // Consolidated state machine
    const [playerState, setPlayerState] = useState<PlayerState>(initialState);
    // Tracks successful purchase — forces transition from purchase card to player
    const [purchased, setPurchased] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    // Track blob URL for cleanup
    const blobUrlRef = useRef<string | null>(null);

    // Revoke blob URL on unmount or when player state changes away from playing
    useEffect(() => {
        return () => {
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
        };
    }, []);

    // Derived states from state machine
    const videoUrl = playerState.type === 'playing' ? playerState.videoUrl : null;
    const loading = playerState.type === 'decrypting';
    const error = playerState.type === 'error' ? playerState.message : null;
    const status = playerState.type === 'decrypting' ? playerState.message : '';

    // Derived access state from React Query
    const hasAccess = hasOwnership === true;

    // Show inline purchase card when no access, no error, not loading, and not in special states
    const showPurchaseCard = !videoUrl
        && playerState.type !== 'banned'
        && !checkingAccess
        && !loading
        && playerState.type !== 'needs-session-key'
        && hasAccess === false
        && !purchased
        && !error;

    const playVideo = useCallback(async (isRetry: boolean = false) => {
        if (!accountId) {
            setPlayerState({ type: 'error', message: "Please connect your wallet to watch." });
            return;
        }

        setPlayerState({
            type: 'decrypting',
            message: isRetry ? 'Retrying...' : 'Initializing...'
        });

        try {
            // 1. Resolve UUID to KMS CID
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid);
            let ipfsCid = cid;

            let keyCid: string | undefined;

            if (isUuid) {
                setPlayerState({ type: 'decrypting', message: 'Resolving Video Metadata...' });
                try {
                    const contractId = NEAR_CONFIG.contractId;
                    const provider = getProvider();

                    // Get event to extract CID from title (direct RPC, no server proxy)
                    const event = await viewContract<{
                        title: string;
                        price: string;
                        creator_id: string;
                        banned?: boolean;
                    }>(provider, contractId, 'get_event', { encrypted_cid: cid });

                    if (event?.banned) {
                        setPlayerState({ type: 'banned' });
                        return;
                    }

                    if (event && event.title && event.title.includes(':::')) {
                        const parts = event.title.split(':::');
                        if (parts.length >= 4) {
                            // Paid: "CID:::Thumbnail:::ManifestCID:::Title" (4+ segments)
                            ipfsCid = parts[0];
                            keyCid = parts[2];
                        } else if (parts.length === 3) {
                            // Could be free ("CID:::Thumbnail:::Title") or
                            // legacy paid without thumbnail ("CID:::KeyCID:::Title").
                            // Disambiguate using event price: paid videos always have keyCid.
                            ipfsCid = parts[0];
                            const isPaid = event.price && event.price !== '0';
                            if (isPaid) {
                                keyCid = parts[1];
                            }
                        } else {
                            // Legacy 2-segment: "CID:::Title"
                            ipfsCid = parts[0];
                        }
                    }
                } catch (e) {
                    console.error("Error resolving metadata:", e);
                    throw new Error("Failed to resolve video metadata");
                }
            }

            // Simulation mode check removed as KMS is the primary flow

            // 2. Fetch video based on keyCid presence
            //    keyCid present  → paid video (encrypted, needs KMS key retrieval)
            //    keyCid absent   → free video (unencrypted, raw fetch from Crust)
            if (keyCid) {
                setPlayerState({ type: 'decrypting', message: 'Retrieving encryption key...' });

                try {
                    const sessionManager = new SessionManager(accountId);
                    await sessionManager.importWalletFunctionCallKey();
                    const hasValidSessionKey = await sessionManager.hasSessionKey();

                    if (!hasValidSessionKey) {
                        setPlayerState({ type: 'needs-session-key' });
                        return;
                    }

                    // Fetch manifest from IPFS
                    const manifestResp = await fetchFromGateways(keyCid);
                    const manifest = await manifestResp.json();

                    // Retrieve AES Key from KMS
                    const { privateKey, publicKeyB58 } = await sessionManager.getKeyForKMS();
                    const aesKeyB64 = await retrieveEncryptionKey(cid, accountId, privateKey, publicKeyB58);

                    setPlayerState({ type: 'decrypting', message: 'Starting video stream...' });

                    const streamingOptions = {
                        onProgress: (loaded: number, total: number) => {
                            const pct = Math.round((loaded / total) * 100);
                            setPlayerState({ type: 'decrypting', message: `Loading... ${pct}%` });
                        },
                        onSourceUpdate: (url: string) => {
                            if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
                            blobUrlRef.current = url;
                            setPlayerState({ type: 'playing', videoUrl: url });
                        }
                    };

                    await streamKmsVideo(ipfsCid, aesKeyB64, manifest, streamingOptions);
                    return;

                } catch (fetchErr: unknown) {
                    const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr || '');
                    const errCode = typeof fetchErr === 'object' && fetchErr !== null && 'code' in fetchErr
                        ? String((fetchErr as { code?: unknown }).code || '')
                        : '';
                    if (errMsg.includes('No session key found') || errMsg.includes('setup account first')) {
                        setPlayerState({ type: 'needs-session-key' });
                    } else if (errCode === 'ACCESS_DENIED') {
                        setPlayerState({ type: 'error', message: "Access denied. Please ensure you own this ticket." });
                    } else if (errCode === 'NOT_FOUND') {
                        setPlayerState({ type: 'error', message: "Encryption key not found." });
                    } else if (errMsg.includes('No valid ticket')) {
                        setPlayerState({ type: 'error', message: "Access denied. Please ensure you own this ticket." });
                    } else {
                        setPlayerState({ type: 'error', message: errMsg || "Failed to stream video." });
                    }
                    console.error("KMS Streaming error:", fetchErr);
                    return;
                }
            } else {
                // Free video: native browser streaming via IPFS gateway
                // ipfs.io supports Range requests + Cloudflare CDN caching
                // Browser handles progressive download automatically
                const targetCid = ipfsCid || cid;
                const streamUrl = `https://ipfs.io/ipfs/${targetCid}`;

                // Revoke previous blob URL if any
                if (blobUrlRef.current) {
                    URL.revokeObjectURL(blobUrlRef.current);
                    blobUrlRef.current = null;
                }

                setPlayerState({ type: 'playing', videoUrl: streamUrl });
                return; // Skip blob creation below for free videos
            }

        } catch (err: unknown) {
            console.error('Playback failed:', err);
            setPlayerState({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load video' });
        }
    }, [accountId, cid]);

    const handleSetupSessionKey = useCallback(async () => {
        if (!accountId) return;
        setPlayerState({ type: 'decrypting', message: 'Creating Session Key...' });
        try {
            const wallet = await getWallet();
            const sessionManager = new SessionManager(accountId);
            await sessionManager.createSessionKey(wallet, '0.5');
            // Session key created, auto-retry playback
            await playVideo(true);
        } catch (err: unknown) {
            console.error('Session key creation failed:', err);
            setPlayerState({ type: 'error', message: err instanceof Error ? err.message : 'Failed to create session key' });
        }
    }, [accountId, getWallet, playVideo]);

    const handlePlay = () => playVideo(false);

    const handleVideoError = () => {
        if (playerState.type !== 'playing' || !playerState.videoUrl) return;

        // If it's a blob component (from our decrypted streams), don't fallback this route
        if (playerState.videoUrl.startsWith('blob:')) {
            console.error("Video playback error with blob");
            return;
        }

        // Try extracting CID to fallback
        const cidMatch = playerState.videoUrl.match(/\/ipfs\/([a-zA-Z0-9]+)$/);
        if (!cidMatch) return;
        const videoCid = cidMatch[1];

        console.warn(`Video load error from ${playerState.videoUrl}. Attempting fallback...`);

        if (playerState.videoUrl.includes('ipfs.io')) {
            setPlayerState({ type: 'playing', videoUrl: `https://dweb.link/ipfs/${videoCid}` });
        } else if (playerState.videoUrl.includes('dweb.link')) {
            setPlayerState({ type: 'playing', videoUrl: `https://w3s.link/ipfs/${videoCid}` });
        } else {
            console.error("All fallback gateways failed for video playback");
            setPlayerState({ type: 'error', message: 'Failed to load video from IPFS gateways. Please try again later.' });
        }
    };

    return (
        <div className={`w-full bg-slate-900 rounded-lg relative group ${showPurchaseCard ? 'min-h-[56.25%] overflow-visible' : 'aspect-video overflow-hidden'}`}>
            {!videoUrl ? (
                <div className={`flex flex-col items-center text-white ${showPurchaseCard ? 'w-full' : 'absolute inset-0 justify-center p-4'}`}>
                    {playerState.type === 'banned' ? (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md w-full h-full p-6 text-center">
                            <ShieldOff className="w-16 h-16 text-red-500 mb-4" />
                            <h3 className="text-2xl font-bold text-white mb-2">Content Removed</h3>
                            <p className="text-zinc-400 max-w-sm mb-6">
                                This content has been removed for violating platform guidelines.
                            </p>
                            <Button
                                variant="outline"
                                onClick={() => window.location.href = '/discover'}
                            >
                                Back to Discover
                            </Button>
                        </div>
                    ) : checkingAccess && !purchased ? (
                        <div className="text-center">
                            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-zinc-500" />
                            <p className="text-xs text-zinc-500">Verifying access...</p>
                        </div>
                    ) : loading ? (
                        <div className="text-center">
                            <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
                            <p className="text-sm text-slate-300">{status}</p>
                        </div>
                    ) : playerState.type === 'needs-session-key' ? (
                        // SHOW SESSION KEY SETUP
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md w-full h-full p-6 text-center">
                            <KeyRound className="w-16 h-16 text-yellow-400 mb-4" />
                            <h3 className="text-2xl font-bold text-white mb-2">Session Key Required</h3>
                            <p className="text-zinc-400 max-w-sm mb-6">
                                A one-time session key setup is needed to decrypt and play videos. This requires a wallet signature.
                            </p>
                            <Button
                                onClick={handleSetupSessionKey}
                                size="lg"
                                className="gap-2 shadow-xl shadow-primary/20"
                            >
                                <KeyRound className="h-5 w-5" />
                                Setup Session Key
                            </Button>
                        </div>
                    ) : hasAccess === false && !purchased && !error ? (
                        // SHOW INLINE PURCHASE CARD
                        <div className="z-10 flex flex-col items-center bg-black/95 backdrop-blur-md w-full p-4">
                            <TicketPurchaseCard
                                cid={cid}
                                onPurchaseSuccess={() => {
                                    setPurchased(true);
                                    refetchOwnership();
                                }}
                                className="w-full max-w-sm"
                            />
                        </div>
                    ) : error ? (
                        // SHOW ERROR / RETRY
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md w-full h-full p-6 text-center">
                            <Lock className="w-16 h-16 text-zinc-600 mb-4" />
                            <h3 className="text-2xl font-bold text-white mb-2">Playback Error</h3>
                            <p className="text-zinc-400 max-w-sm mb-8">
                                {hasAccess
                                    ? 'Access sync in progress. Try again in a moment.'
                                    : error}
                            </p>
                            <div className="flex flex-col gap-4 w-full max-w-xs">
                                <Button
                                    className="w-full h-12 text-lg font-bold gap-2"
                                    onClick={handlePlay}
                                >
                                    <Play className="w-5 h-5" />
                                    Retry Playback
                                </Button>
                            </div>
                        </div>
                    ) : (
                        // SHOW PLAY BUTTON IF HAS ACCESS
                        <div className="relative z-10 text-center w-full h-full flex flex-col items-center justify-center">
                            {/* Background Thumbnail */}
                            {
                                thumbnailUrl && (
                                    <div className="absolute inset-0 z-0">
                                        <IPFSThumbnail
                                            url={thumbnailUrl}
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
                    onError={handleVideoError}
                    className="w-full h-full"
                    autoPlay
                />
            )}
        </div>
    );
}
