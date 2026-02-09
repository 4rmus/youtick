'use client';

import React, { useState, useRef, useCallback } from 'react';
import { fetchFile } from '@/lib/nova';
import { hasApiKey } from '@/lib/nova/config';
import { NovaError } from '@/lib/nova/types';
import { useWallet } from '@/components/providers/WalletProvider';
import { Loader2, Play, Lock, Ticket, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNFTOwnership } from '@/lib/hooks/useSessionState';
import { NovaThumbnail } from './NovaThumbnail';
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
    | { type: 'error'; message: string };

const initialState: PlayerState = { type: 'idle' };

export function IpfsPlayer({ cid, filename, thumbnailUrl }: IpfsPlayerProps) {
    const { accountId, getWallet } = useWallet();

    // React Query hooks for cached state
    const { data: hasOwnership, isLoading: checkingAccess } = useNFTOwnership(accountId, cid);

    // Consolidated state machine
    const [playerState, setPlayerState] = useState<PlayerState>(initialState);
    const videoRef = useRef<HTMLVideoElement>(null);

    // Derived states from state machine
    const videoUrl = playerState.type === 'playing' ? playerState.videoUrl : null;
    const loading = playerState.type === 'decrypting';
    const error = playerState.type === 'error' ? playerState.message : null;
    const status = playerState.type === 'decrypting' ? playerState.message : '';

    // Derived access state from React Query
    const hasAccess = hasOwnership === true;

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

            if (isUuid) {
                setPlayerState({ type: 'decrypting', message: 'Resolving Video Metadata...' });
                try {
                    const contractId = NEAR_CONFIG.contractId;
                    const provider = getProvider();

                    // Get event to extract NOVA CID from title (direct RPC, no server proxy)
                    const event = await viewContract<{
                        title: string;
                        price: string;
                        creator_id: string;
                    }>(provider, contractId, 'get_event', { encrypted_cid: cid });

                    if (event && event.title && event.title.includes(':::')) {
                        // Extract NovaCID from "NovaCID:::ThumbnailCID:::Title"
                        const parts = event.title.split(':::');
                        novaCid = parts[0];
                        console.log("Resolved UUID", cid, "to NOVA CID", novaCid);
                    }

                    // Get NOVA group ID by finding the token with matching encrypted_cid
                    // Note: video_metadata is keyed by auto-incremented token_id, not UUID
                    // So we use get_nova_videos(creator_id) and match by encrypted_cid
                    if (event?.creator_id) {
                        const novaVideos = await viewContract<[string, { encrypted_cid: string; nova_group_id: string | null }][]>(
                            provider, contractId, 'get_nova_videos', { account_id: event.creator_id }
                        );
                        const match = novaVideos?.find(([, meta]) => meta.encrypted_cid === cid);
                        novaGroupId = match ? match[1].nova_group_id : null;
                    }
                    console.log("Resolved NOVA group ID:", novaGroupId);
                } catch (e) {
                    console.error("Error resolving metadata:", e);
                    throw new Error("Failed to resolve video metadata");
                }
            }

            // Check for simulation mode (no Nova API key)
            if (!hasApiKey()) {
                console.log('[IpfsPlayer] Simulation mode active - video playback not available');
                setPlayerState({
                    type: 'error',
                    message: 'SIMULATION_MODE'
                });
                return;
            }

            if (!novaGroupId) {
                throw new Error("No NOVA group ID found - video may not be uploaded correctly");
            }

            // 2. Fetch video from NOVA (with TEE decryption)
            setPlayerState({ type: 'decrypting', message: 'Fetching video from NOVA...' });
            console.log(`[NOVA] Fetching CID ${novaCid} from group ${novaGroupId}`);

            const videoData = await fetchFile(novaCid, accountId, {
                groupId: novaGroupId
            });

            // 3. Create video URL (convert to ArrayBuffer for Blob)
            const arrayBuffer = new Uint8Array(videoData).buffer;
            const videoBlob = new Blob([arrayBuffer], { type: 'video/mp4' });
            const url = URL.createObjectURL(videoBlob);
            setPlayerState({ type: 'playing', videoUrl: url });

            console.log('[NOVA] Video ready for playback!');

        } catch (err: any) {
            console.error('Playback failed:', err);
            if (err instanceof NovaError && err.code === 'NO_SESSION_KEY') {
                setPlayerState({ type: 'needs-session-key' });
            } else {
                setPlayerState({ type: 'error', message: err.message || 'Failed to load video' });
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
        } catch (err: any) {
            console.error('Session key creation failed:', err);
            setPlayerState({ type: 'error', message: err.message || 'Failed to create session key' });
        }
    }, [accountId, getWallet, playVideo]);

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
                    ) : (hasAccess === false || error) ? (
                        // SHOW LOCKED SCREEN IF NO ACCESS OR ERROR
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md w-full h-full p-6 text-center">
                            <Lock className="w-16 h-16 text-zinc-600 mb-4" />
                            <h3 className="text-2xl font-bold text-white mb-2">Content Locked</h3>
                            <p className="text-zinc-400 max-w-sm mb-8">
                                {hasAccess && error
                                    ? 'Access sync in progress. Try again in a moment.'
                                    : 'You need a ticket to watch this video. Purchase one to unlock permanent access.'}
                            </p>

                            <div className="flex flex-col gap-4 w-full max-w-xs">
                                {hasAccess && error ? (
                                    <Button
                                        className="w-full h-12 text-lg font-bold gap-2"
                                        onClick={handlePlay}
                                    >
                                        <Play className="w-5 h-5" />
                                        Retry Playback
                                    </Button>
                                ) : (
                                    <Button
                                        className="w-full h-12 text-lg font-bold gap-2"
                                        onClick={() => window.location.href = `/ticket/${cid}`}
                                    >
                                        <Ticket className="w-5 h-5" />
                                        Get Ticket
                                    </Button>
                                )}

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
