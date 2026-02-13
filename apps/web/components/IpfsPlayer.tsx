'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { fetchFile } from '@/lib/nova';
import { hasApiKey } from '@/lib/nova/config';
import { NovaError } from '@/lib/nova/types';
import { addBuyerToNovaGroup } from '@/lib/nova/post-purchase';
import { pendingAccessQueue } from '@/lib/nova/pending-access-queue';
import { fetchFromGateways } from '@/lib/crust';
import { useWallet } from '@/components/providers/WalletProvider';
import { Loader2, Play, Lock, KeyRound, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNFTOwnership } from '@/lib/hooks/useSessionState';
import { NovaThumbnail } from './NovaThumbnail';
import { TicketPurchaseCard } from './TicketPurchaseCard';
import { SessionManager } from '@/lib/session-manager';
import { NEAR_CONFIG } from '@/lib/constants';
import { getProvider, viewContract } from '@/lib/near';

interface IpfsPlayerProps {
    cid: string;
    filename?: string;
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

export function IpfsPlayer({ cid, filename, thumbnailUrl }: IpfsPlayerProps) {
    const { accountId, getWallet } = useWallet();

    // React Query hooks for cached state
    const { data: hasOwnership, isLoading: checkingAccess, refetch: refetchOwnership } = useNFTOwnership(accountId, cid);

    // Consolidated state machine
    const [playerState, setPlayerState] = useState<PlayerState>(initialState);
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
        && error !== 'SIMULATION_MODE'
        && playerState.type !== 'needs-session-key'
        && hasAccess === false
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
            // 1. Resolve UUID to NOVA CID and groupId
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid);
            let novaCid = cid;
            let novaGroupId: string | null = null;

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
                            // Paid: "CID:::Thumbnail:::KeyCID:::Title" (4+ segments)
                            novaCid = parts[0];
                            keyCid = parts[2];
                        } else if (parts.length === 3) {
                            // Could be free ("CID:::Thumbnail:::Title") or
                            // legacy paid without thumbnail ("CID:::KeyCID:::Title").
                            // Disambiguate using event price: paid videos always have keyCid.
                            novaCid = parts[0];
                            const isPaid = event.price && event.price !== '0';
                            if (isPaid) {
                                keyCid = parts[1];
                            }
                        } else {
                            // Legacy 2-segment: "CID:::Title"
                            novaCid = parts[0];
                        }
                    }

                    // Get NOVA group ID and storage type
                    if (event?.creator_id) {
                        const novaVideos = await viewContract<[string, { encrypted_cid: string; nova_group_id: string | null }][]>(
                            provider, contractId, 'get_nova_videos', { account_id: event.creator_id }
                        );
                        const match = novaVideos?.find(([, meta]) => meta.encrypted_cid === cid);
                        novaGroupId = match ? match[1].nova_group_id : null;
                    }
                } catch (e) {
                    console.error("Error resolving metadata:", e);
                    throw new Error("Failed to resolve video metadata");
                }
            }

            // Check for simulation mode (no Nova API key)
            if (!hasApiKey()) {
                setPlayerState({
                    type: 'error',
                    message: 'SIMULATION_MODE'
                });
                return;
            }

            // 2. Fetch video based on keyCid presence
            //    keyCid present  → paid video (encrypted, needs Nova decrypt)
            //    keyCid absent   → free video (unencrypted, raw fetch from Crust)
            let videoData: Uint8Array | undefined;

            if (keyCid) {
                // Paid video: decrypt via Crust data + Nova key
                if (!novaGroupId) {
                    throw new Error("No NOVA group ID found - video may not be uploaded correctly");
                }

                setPlayerState({ type: 'decrypting', message: 'Decrypting video...' });

                try {
                    videoData = await fetchFile(novaCid, accountId, {
                        groupId: novaGroupId,
                        keyCid,
                    });
                } catch (fetchErr) {
                    // Self-healing: if not authorized, add user to group and retry with escalating delays
                    const isAccessDenied = fetchErr instanceof NovaError &&
                        (fetchErr.code === 'ACCESS_DENIED' || fetchErr.message.includes('not authorized'));
                    if (!isAccessDenied) throw fetchErr;

                    console.log('[IpfsPlayer] Access denied — self-healing group add for:', accountId);
                    setPlayerState({ type: 'decrypting', message: 'Syncing access rights...' });
                    // First: try processing any pending queue entries for this video
                    await pendingAccessQueue.processQueue();
                    await addBuyerToNovaGroup(cid, accountId);

                    // Retry with escalating delays for TEE propagation
                    const delays = [5000, 8000, 12000];
                    let lastErr: unknown = fetchErr;
                    for (const delay of delays) {
                        await new Promise(resolve => setTimeout(resolve, delay));
                        try {
                            videoData = await fetchFile(novaCid, accountId, {
                                groupId: novaGroupId,
                                keyCid,
                            });
                            lastErr = null;
                            break;
                        } catch (retryErr) {
                            lastErr = retryErr;
                            console.warn(`[IpfsPlayer] Retry after ${delay}ms failed, will try again...`);
                        }
                    }
                    if (lastErr) {
                        pendingAccessQueue.add(cid, accountId);
                        throw lastErr;
                    }
                }
            } else {
                // Free video: fetch raw (unencrypted) from Crust gateways
                setPlayerState({ type: 'decrypting', message: 'Fetching video from IPFS...' });
                const response = await fetchFromGateways(novaCid);
                const buffer = await response.arrayBuffer();
                videoData = new Uint8Array(buffer);
            }

            // 3. Create video URL (convert to ArrayBuffer for Blob)
            // Revoke previous blob URL if any
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
            }
            if (!videoData) {
                throw new Error('Failed to load video data');
            }
            const arrayBuffer = new Uint8Array(videoData).buffer;
            const videoBlob = new Blob([arrayBuffer], { type: 'video/mp4' });
            const url = URL.createObjectURL(videoBlob);
            blobUrlRef.current = url;
            setPlayerState({ type: 'playing', videoUrl: url });

        } catch (err: unknown) {
            console.error('Playback failed:', err);
            if (err instanceof NovaError && err.code === 'NO_SESSION_KEY') {
                setPlayerState({ type: 'needs-session-key' });
            } else {
                setPlayerState({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load video' });
            }
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
                    ) : checkingAccess ? (
                        <div className="text-center">
                            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-zinc-500" />
                            <p className="text-xs text-zinc-500">Verifying access...</p>
                        </div>
                    ) : loading ? (
                        <div className="text-center">
                            <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
                            <p className="text-sm text-slate-300">{status}</p>
                        </div>
                    ) : error === 'SIMULATION_MODE' ? (
                        // SHOW SIMULATION MODE MESSAGE
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md w-full h-full p-6 text-center">
                            <div className="text-yellow-400 text-5xl mb-4">⚠️</div>
                            <h3 className="text-2xl font-bold text-yellow-400 mb-2">Simulation Mode</h3>
                            <p className="text-zinc-400 max-w-sm mb-4">
                                Nova API key is not configured. Video playback requires a real Nova integration.
                            </p>
                            <p className="text-zinc-500 text-sm max-w-sm mb-6">
                                UI flow verified successfully. Set <code className="bg-zinc-800 px-1 rounded">NEXT_PUBLIC_NOVA_API_KEY</code> for real playback.
                            </p>
                            <Button
                                variant="outline"
                                onClick={() => setPlayerState({ type: 'idle' })}
                            >
                                Dismiss
                            </Button>
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
                    ) : hasAccess === false && !error ? (
                        // SHOW INLINE PURCHASE CARD
                        <div className="z-10 flex flex-col items-center bg-black/95 backdrop-blur-md w-full p-4">
                            <TicketPurchaseCard
                                cid={cid}
                                onPurchaseSuccess={() => {
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
                                        <NovaThumbnail
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
                    className="w-full h-full"
                    autoPlay
                />
            )}
        </div>
    );
}
