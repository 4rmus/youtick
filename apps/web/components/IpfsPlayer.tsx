'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    MediaControlBar,
    MediaController,
    MediaFullscreenButton,
    MediaMuteButton,
    MediaPlayButton,
} from 'media-chrome/react';
import { KMSError, retrieveEncryptionKey } from '@/lib/kms/client';
import {
    createDeliveryPlaybackSession,
    isDeliveryPlaybackSupported,
    type DeliveryPlaybackMetrics,
    type DeliveryPlaybackSession,
} from '@/lib/video-delivery-player';
import {
    fetchDeliveryManifest,
    getEffectiveManifestDurationMs,
    isDeliveryManifestV2,
    pickPreferredPosterUrl,
    resolveDeliveryManifestRefs,
    shouldUseSegmentedPlayback,
} from '@/lib/video-delivery';
import { useWallet } from '@/components/providers/WalletProvider';
import { Loader2, Lock, Play, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNFTOwnership } from '@/lib/hooks/useSessionState';
import { IPFSThumbnail } from './IPFSThumbnail';
import { TicketPurchaseCard } from './TicketPurchaseCard';
import { NEAR_CONFIG } from '@/lib/constants';
import { getProvider, viewContract } from '@/lib/near';
import { parseTitleMetadata } from '@/lib/metadata-parser';
import { useLanguage } from '@/components/providers/LanguageContext';
import {
    extractIpfsCid,
    getIpfsMediaCandidates,
    getIpfsMediaSourceKey,
    getNextIpfsMediaUrl,
    rememberFailedIpfsMediaUrl,
    resolveIpfsMediaUrl,
} from '@/lib/ipfs-media';
import { hasRecentTicketPurchase, markRecentTicketPurchase } from '@/lib/ticket-access-cache';
import type { NFTEvent } from '@/lib/types';

interface IpfsPlayerProps {
    cid: string;
    thumbnailUrl?: string;
    initialDurationSeconds?: number;
    event?: NFTEvent;
}

type EventAccessMode = 'paid' | 'free_collectible';

// State machine for player states
type PlayerState =
    | { type: 'idle' }
    | { type: 'decrypting'; message: string }
    | { type: 'playing'; videoUrl: string }
    | { type: 'banned' }
    | { type: 'error'; message: string };

const initialState: PlayerState = { type: 'idle' };
const mediaChromeButtonClassName = 'flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green';

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return '0:00';
    }

    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function formatReadySeconds(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return '0.0';
    }

    return seconds.toFixed(seconds >= 10 ? 0 : 1);
}

function isTimeBuffered(video: HTMLVideoElement, targetTimeSeconds: number): boolean {
    for (let i = 0; i < video.buffered.length; i += 1) {
        if (
            video.buffered.start(i) <= targetTimeSeconds + 0.05
            && video.buffered.end(i) >= targetTimeSeconds + 0.25
        ) {
            return true;
        }
    }

    return false;
}

async function playVideoSafely(video: HTMLVideoElement): Promise<boolean> {
    try {
        await video.play();
        return true;
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            return false;
        }

        throw error;
    }
}

export function IpfsPlayer({ cid, thumbnailUrl, initialDurationSeconds, event }: IpfsPlayerProps) {
    const { accountId, getWallet } = useWallet();
    const { t } = useLanguage();
    const playerCopy = t.video_player;
    const queryClient = useQueryClient();

    // React Query hooks for cached state
    const { data: hasOwnership, isLoading: checkingAccess, refetch: refetchOwnership } = useNFTOwnership(accountId, cid);

    // Consolidated state machine
    const [playerState, setPlayerState] = useState<PlayerState>(initialState);
    // Tracks successful purchase — forces transition from purchase card to player
    const [purchased, setPurchased] = useState(false);
    const [resolvedThumbnailUrl, setResolvedThumbnailUrl] = useState<string | undefined>(thumbnailUrl);
    const [posterUrl, setPosterUrl] = useState<string | undefined>(() => {
        const sourceKey = getIpfsMediaSourceKey(thumbnailUrl);
        return getIpfsMediaCandidates(thumbnailUrl, {
            sourceKey,
            purpose: 'image',
        })[0];
    });
    const [backgroundStatus, setBackgroundStatus] = useState<string | null>(null);
    const [knownDurationSeconds, setKnownDurationSeconds] = useState<number | null>(initialDurationSeconds ?? null);
    const [currentTimeSeconds, setCurrentTimeSeconds] = useState(0);
    const [bufferedSeconds, setBufferedSeconds] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [scrubTimeSeconds, setScrubTimeSeconds] = useState(0);
    const [playbackMetrics, setPlaybackMetrics] = useState<DeliveryPlaybackMetrics | null>(null);
    const [isWaitingForMedia, setIsWaitingForMedia] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [eventAccessMode, setEventAccessMode] = useState<EventAccessMode | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    // Track blob URL for cleanup
    const blobUrlRef = useRef<string | null>(null);
    const deliverySessionRef = useRef<DeliveryPlaybackSession | null>(null);
    const pendingDeliverySessionRef = useRef<DeliveryPlaybackSession | null>(null);
    const playbackStartedRef = useRef(false);
    const resumeAfterSeekRef = useRef(false);
    const pendingSeekTimeRef = useRef<number | null>(null);
    const seekFrameReadyRef = useRef(true);
    const pendingVideoFrameCallbackRef = useRef<number | null>(null);
    const pendingSeekFallbackTimerRef = useRef<number | null>(null);

    const clearPendingSeekWaiters = useCallback(() => {
        const video = videoRef.current;
        if (
            video
            && pendingVideoFrameCallbackRef.current !== null
            && 'cancelVideoFrameCallback' in video
            && typeof video.cancelVideoFrameCallback === 'function'
        ) {
            video.cancelVideoFrameCallback(pendingVideoFrameCallbackRef.current);
        }

        pendingVideoFrameCallbackRef.current = null;

        if (pendingSeekFallbackTimerRef.current !== null) {
            window.clearTimeout(pendingSeekFallbackTimerRef.current);
            pendingSeekFallbackTimerRef.current = null;
        }
    }, []);

    const tryResumeAfterSeek = useCallback(() => {
        const video = videoRef.current;
        if (!video || !resumeAfterSeekRef.current) {
            return;
        }

        const targetTime = pendingSeekTimeRef.current ?? video.currentTime;
        const hasBufferedMedia = isTimeBuffered(video, targetTime)
            || video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
        const requiresVideoFrame = 'requestVideoFrameCallback' in video
            && typeof video.requestVideoFrameCallback === 'function';

        if (!hasBufferedMedia || (requiresVideoFrame && !seekFrameReadyRef.current)) {
            return;
        }

        resumeAfterSeekRef.current = false;
        pendingSeekTimeRef.current = null;
        clearPendingSeekWaiters();
        setBackgroundStatus(null);
        void playVideoSafely(video)
            .then((started) => {
                if (started) {
                    return;
                }

                resumeAfterSeekRef.current = true;
                pendingSeekTimeRef.current = targetTime;
            })
            .catch(() => {
                resumeAfterSeekRef.current = true;
                pendingSeekTimeRef.current = targetTime;
            });
    }, [clearPendingSeekWaiters]);

    // Revoke blob URL on unmount or when player state changes away from playing
    useEffect(() => {
        return () => {
            pendingDeliverySessionRef.current?.destroy();
            pendingDeliverySessionRef.current = null;
            deliverySessionRef.current?.destroy();
            deliverySessionRef.current = null;
            clearPendingSeekWaiters();
            resumeAfterSeekRef.current = false;
            pendingSeekTimeRef.current = null;
            seekFrameReadyRef.current = true;
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
        };
    }, [clearPendingSeekWaiters]);

    useEffect(() => {
        setResolvedThumbnailUrl(thumbnailUrl);
    }, [thumbnailUrl, cid]);

    useEffect(() => {
        let cancelled = false;

        const resolveEventAccess = async () => {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid);
            if (!isUuid) {
                setEventAccessMode(null);
                return;
            }

            if (event) {
                if (event.banned) {
                    setPlayerState({ type: 'banned' });
                    return;
                }
                setEventAccessMode(event.access_mode === 'free_collectible' || event.price === '0'
                    ? 'free_collectible'
                    : 'paid');
                return;
            }

            try {
                const event = await viewContract<{
                    price: string;
                    access_mode?: EventAccessMode;
                    banned?: boolean;
                }>(
                    getProvider(),
                    NEAR_CONFIG.contractId,
                    'get_event',
                    { encrypted_cid: cid },
                );

                if (cancelled) {
                    return;
                }

                if (event?.banned) {
                    setPlayerState({ type: 'banned' });
                    return;
                }

                setEventAccessMode(event?.access_mode ?? (event?.price === '0' ? 'free_collectible' : 'paid'));
            } catch {
                if (!cancelled) {
                    setEventAccessMode(null);
                }
            }
        };

        void resolveEventAccess();

        return () => {
            cancelled = true;
        };
    }, [cid, event]);

    useEffect(() => {
        let cancelled = false;
        const sourceKey = getIpfsMediaSourceKey(resolvedThumbnailUrl);
        const nextCandidates = getIpfsMediaCandidates(resolvedThumbnailUrl, {
            sourceKey,
            purpose: 'image',
        });

        setPosterUrl(nextCandidates[0]);

        if (!resolvedThumbnailUrl) {
            setPosterUrl(undefined);
            return () => {
                cancelled = true;
            };
        }

        void resolveIpfsMediaUrl(resolvedThumbnailUrl, {
            sourceKey,
            purpose: 'image',
        }).then((resolvedUrl) => {
            if (cancelled) {
                return;
            }

            setPosterUrl(resolvedUrl ?? nextCandidates[0]);
        });

        return () => {
            cancelled = true;
        };
    }, [resolvedThumbnailUrl]);

    useEffect(() => {
        setPurchased(hasRecentTicketPurchase(accountId, cid));
    }, [accountId, cid]);

    useEffect(() => {
        setKnownDurationSeconds(initialDurationSeconds ?? null);
    }, [initialDurationSeconds, cid]);

    useEffect(() => {
        if (playerState.type !== 'playing' || !videoRef.current || !pendingDeliverySessionRef.current) {
            return;
        }

        const session = pendingDeliverySessionRef.current;
        pendingDeliverySessionRef.current = null;
        deliverySessionRef.current = session;
        session.start(videoRef.current);
        void playVideoSafely(videoRef.current).catch((error) => {
            console.warn('[IpfsPlayer] Initial playback request failed:', error);
        });
    }, [playerState]);

    useEffect(() => {
        const syncFullscreenState = () => {
            const fullscreenElement = document.fullscreenElement;
            setIsFullscreen(!!fullscreenElement && !!videoRef.current && (
                fullscreenElement === videoRef.current
                || fullscreenElement.contains(videoRef.current)
            ));
        };

        document.addEventListener('fullscreenchange', syncFullscreenState);
        syncFullscreenState();

        return () => {
            document.removeEventListener('fullscreenchange', syncFullscreenState);
        };
    }, []);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) {
            return;
        }

        const syncState = () => {
            setCurrentTimeSeconds(video.currentTime || 0);
            setIsPaused(video.paused);
            setIsMuted(video.muted);

            const mediaDuration = Number.isFinite(video.duration) ? video.duration : null;
            if ((knownDurationSeconds === null || knownDurationSeconds <= 0) && mediaDuration && mediaDuration > 0) {
                setKnownDurationSeconds(mediaDuration);
            }

            tryResumeAfterSeek();
        };

        const handleWaiting = () => {
            setIsWaitingForMedia(true);
        };

        const handlePlaying = () => {
            setIsWaitingForMedia(false);
        };

        video.addEventListener('timeupdate', syncState);
        video.addEventListener('play', syncState);
        video.addEventListener('pause', syncState);
        video.addEventListener('volumechange', syncState);
        video.addEventListener('loadedmetadata', syncState);
        video.addEventListener('durationchange', syncState);
        video.addEventListener('progress', syncState);
        video.addEventListener('seeked', syncState);
        video.addEventListener('canplay', syncState);
        video.addEventListener('loadeddata', syncState);
        video.addEventListener('waiting', handleWaiting);
        video.addEventListener('stalled', handleWaiting);
        video.addEventListener('playing', handlePlaying);

        syncState();

        return () => {
            video.removeEventListener('timeupdate', syncState);
            video.removeEventListener('play', syncState);
            video.removeEventListener('pause', syncState);
            video.removeEventListener('volumechange', syncState);
            video.removeEventListener('loadedmetadata', syncState);
            video.removeEventListener('durationchange', syncState);
            video.removeEventListener('progress', syncState);
            video.removeEventListener('seeked', syncState);
            video.removeEventListener('canplay', syncState);
            video.removeEventListener('loadeddata', syncState);
            video.removeEventListener('waiting', handleWaiting);
            video.removeEventListener('stalled', handleWaiting);
            video.removeEventListener('playing', handlePlaying);
        };
    }, [playerState, knownDurationSeconds, tryResumeAfterSeek]);

    useEffect(() => {
        if (playerState.type !== 'playing') {
            return;
        }

        if (!playbackMetrics) {
            if (isWaitingForMedia || resumeAfterSeekRef.current) {
                setBackgroundStatus(resumeAfterSeekRef.current ? playerCopy.buffering : playerCopy.loading_video);
            }
            return;
        }

        const ready = formatReadySeconds(Math.min(
            playbackMetrics.playableAheadSeconds,
            playbackMetrics.targetPlayableAheadSeconds,
        ));
        const target = formatReadySeconds(playbackMetrics.targetPlayableAheadSeconds);
        const details = playerCopy.ready_status
            .replace('{ready}', ready)
            .replace('{target}', target);

        if (
            playbackMetrics.phase === 'startup'
            && playbackMetrics.playableAheadSeconds < playbackMetrics.targetPlayableAheadSeconds
        ) {
            setBackgroundStatus(`${playerCopy.loading_video} ${details}`);
            return;
        }

        if (
            playbackMetrics.phase === 'seek'
            || resumeAfterSeekRef.current
            || isWaitingForMedia
        ) {
            setBackgroundStatus(`${playerCopy.buffering} ${details}`);
            return;
        }

        setBackgroundStatus(null);
    }, [isWaitingForMedia, playbackMetrics, playerCopy, playerState.type]);

    // Derived states from state machine
    const videoUrl = playerState.type === 'playing' ? playerState.videoUrl : null;
    const loading = playerState.type === 'decrypting';
    const error = playerState.type === 'error' ? playerState.message : null;
    const status = playerState.type === 'decrypting' ? playerState.message : '';

    // Derived access state from React Query
    const hasAccess = hasOwnership === true || purchased || hasRecentTicketPurchase(accountId, cid);
    // Show inline purchase card when no access, no error, not loading, and not in special states
    const showPurchaseCard = !videoUrl
        && playerState.type !== 'banned'
        && !checkingAccess
        && !loading
        && !hasAccess
        && !error;
    const shouldRenderPurchaseCard = showPurchaseCard && (!accountId || hasAccess === false);
    const effectiveDurationSeconds = knownDurationSeconds && knownDurationSeconds > 0
        ? knownDurationSeconds
        : Math.max(currentTimeSeconds, 1);
    const bufferedPercent = Math.max(
        0,
        Math.min(100, (bufferedSeconds / Math.max(effectiveDurationSeconds, 1)) * 100),
    );
    const displayedTimeSeconds = isScrubbing ? scrubTimeSeconds : currentTimeSeconds;
    const playedPercent = Math.max(
        0,
        Math.min(100, (displayedTimeSeconds / Math.max(effectiveDurationSeconds, 1)) * 100),
    );

    const cleanupPlaybackArtifacts = useCallback(() => {
        playbackStartedRef.current = false;
        setBackgroundStatus(null);
        setCurrentTimeSeconds(0);
        setBufferedSeconds(0);
        setKnownDurationSeconds(initialDurationSeconds ?? null);
        setIsPaused(false);
        setIsWaitingForMedia(false);
        setIsScrubbing(false);
        setScrubTimeSeconds(0);
        setPlaybackMetrics(null);
        clearPendingSeekWaiters();
        resumeAfterSeekRef.current = false;
        pendingSeekTimeRef.current = null;
        seekFrameReadyRef.current = true;
        pendingDeliverySessionRef.current?.destroy();
        pendingDeliverySessionRef.current = null;
        deliverySessionRef.current?.destroy();
        deliverySessionRef.current = null;

        if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
        }
    }, [clearPendingSeekWaiters, initialDurationSeconds]);

    const handleTogglePlayback = () => {
        const video = videoRef.current;
        if (!video) {
            return;
        }

        if (video.paused) {
            void playVideoSafely(video).catch((error) => {
                console.warn('[IpfsPlayer] Toggle play failed:', error);
            });
        } else {
            video.pause();
        }
    };

    const commitSeek = (nextValue: number) => {
        const video = videoRef.current;
        if (!video) {
            return;
        }

        const preferredSeekTime = deliverySessionRef.current?.getPreferredSeekTime(nextValue) ?? nextValue;

        const shouldResume = !video.paused;
        if (shouldResume) {
            video.pause();
        }

        clearPendingSeekWaiters();
        resumeAfterSeekRef.current = shouldResume;
        pendingSeekTimeRef.current = preferredSeekTime;
        seekFrameReadyRef.current = !('requestVideoFrameCallback' in video)
            || typeof video.requestVideoFrameCallback !== 'function';
        setBackgroundStatus(shouldResume ? playerCopy.buffering : null);

        if (!seekFrameReadyRef.current) {
            const targetTime = preferredSeekTime;
            const handleVideoFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
                if (pendingSeekTimeRef.current === null) {
                    return;
                }

                if (Math.abs(metadata.mediaTime - targetTime) <= 0.2) {
                    seekFrameReadyRef.current = true;
                    clearPendingSeekWaiters();
                    tryResumeAfterSeek();
                    return;
                }

                pendingVideoFrameCallbackRef.current = video.requestVideoFrameCallback(handleVideoFrame);
            };

            pendingVideoFrameCallbackRef.current = video.requestVideoFrameCallback(handleVideoFrame);
            pendingSeekFallbackTimerRef.current = window.setTimeout(() => {
                pendingVideoFrameCallbackRef.current = null;
                pendingSeekFallbackTimerRef.current = null;

                if (
                    !video.seeking
                    && Math.abs(video.currentTime - targetTime) <= 0.2
                    && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
                ) {
                    seekFrameReadyRef.current = true;
                    tryResumeAfterSeek();
                }
            }, 2000);
        }

        if ('fastSeek' in video && typeof video.fastSeek === 'function') {
            video.fastSeek(preferredSeekTime);
        } else {
            video.currentTime = preferredSeekTime;
        }
        setCurrentTimeSeconds(preferredSeekTime);
        setScrubTimeSeconds(preferredSeekTime);
        setIsScrubbing(false);
    };

    const handleSeekPreview = (nextValue: number) => {
        setScrubTimeSeconds(nextValue);
    };

    const playVideo = useCallback(async (isRetry: boolean = false) => {
        cleanupPlaybackArtifacts();
        setBackgroundStatus(null);

        setPlayerState({
            type: 'decrypting',
            message: isRetry ? playerCopy.retrying : playerCopy.initializing
        });

        try {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid);
            if (!isUuid) {
                throw new Error(playerCopy.invalid_release);
            }

            let manifestCid: string | undefined;
            let resolvedAccessMode = eventAccessMode;

            if (isUuid) {
                setPlayerState({ type: 'decrypting', message: playerCopy.resolving_metadata });
                try {
                    // Standalone players fetch metadata; watch passes the canonical query snapshot.
                    const resolvedEvent = event ?? await viewContract<{
                        title: string;
                        price: string;
                        creator_id: string;
                        access_mode?: EventAccessMode;
                        banned?: boolean;
                    }>(getProvider(), NEAR_CONFIG.contractId, 'get_event', { encrypted_cid: cid });

                    if (resolvedEvent?.banned) {
                        setPlayerState({ type: 'banned' });
                        return;
                    }

                    resolvedAccessMode = resolvedEvent?.access_mode === 'free_collectible' || resolvedEvent?.price === '0'
                        ? 'free_collectible'
                        : 'paid';
                    setEventAccessMode(resolvedAccessMode);

                    const parsed = parseTitleMetadata(resolvedEvent?.title, t.watch_page.untitled);
                    manifestCid = parsed.manifestCid || undefined;

                    if (parsed.thumbnailCid && parsed.thumbnailUrl) {
                        setResolvedThumbnailUrl(parsed.thumbnailUrl);
                    }
                } catch (e) {
                    console.error("Error resolving metadata:", e);
                    throw new Error(playerCopy.metadata_failed);
                }
            }

            if (!manifestCid) {
                throw new Error(playerCopy.missing_manifest);
            }

            const resolveAesKey = async (): Promise<string> => {
                if (!accountId) {
                    throw new Error(playerCopy.connect_or_guest);
                }
                setPlayerState({ type: 'decrypting', message: playerCopy.authorizing });
                const wallet = await getWallet();
                return await retrieveEncryptionKey(cid, accountId, wallet);
            };

            setPlayerState({ type: 'decrypting', message: playerCopy.resolving_manifest });
            const manifestData = await fetchDeliveryManifest(manifestCid);

            if (!isDeliveryManifestV2(manifestData)) {
                throw new Error(playerCopy.unsupported_manifest);
            }
            const resolvedManifest = resolveDeliveryManifestRefs(manifestData, manifestCid);

            if (process.env.NEXT_PUBLIC_DEBUG_PLAYBACK === 'true') {
                console.info('[IpfsPlayer] Using segmented delivery manifest', {
                    manifestCid,
                    encrypted: resolvedManifest.encrypted,
                    tracks: resolvedManifest.tracks.length,
                    segments: resolvedManifest.segments.length,
                });
            }
            setKnownDurationSeconds(getEffectiveManifestDurationMs(resolvedManifest) / 1000);
            const preferredPosterUrl = pickPreferredPosterUrl(resolvedThumbnailUrl ?? null, resolvedManifest);
            if (preferredPosterUrl) {
                setResolvedThumbnailUrl(preferredPosterUrl);
            }

            const canUseSegmentedPlayback = shouldUseSegmentedPlayback(resolvedManifest);
            if (!canUseSegmentedPlayback) {
                console.warn('[IpfsPlayer] Manifest is not segmented enough for smooth seek', {
                    manifestCid,
                    segments: resolvedManifest.segments.length,
                });
            }

            if (!isDeliveryPlaybackSupported(resolvedManifest)) {
                setPlayerState({
                    type: 'error',
                    message: playerCopy.unsupported_browser,
                });
                return;
            }

            const inferredAccessMode = resolvedAccessMode
                ?? 'free_collectible';

            if (inferredAccessMode === 'free_collectible' && !accountId) {
                throw new Error(playerCopy.connect_or_guest);
            }

            const aesKeyB64 = resolvedManifest.encrypted ? await resolveAesKey() : undefined;
            setPlayerState({ type: 'decrypting', message: playerCopy.preparing_stream });

            const session = createDeliveryPlaybackSession(resolvedManifest, {
                aesKeyB64,
                onBufferedTimeChange: (bufferedTime) => {
                    setBufferedSeconds(bufferedTime);
                },
                onMetricsChange: (metrics) => {
                    setPlaybackMetrics(metrics);
                },
                onError: async (sessionError) => {
                    console.error('[IpfsPlayer] Segmented playback failed:', sessionError);
                    cleanupPlaybackArtifacts();
                    setPlayerState({
                        type: 'error',
                        message: sessionError.message || playerCopy.segmented_failed,
                    });
                },
            });

            playbackStartedRef.current = true;
            blobUrlRef.current = session.objectUrl;
            pendingDeliverySessionRef.current = session;
            setBackgroundStatus(playerCopy.loading_video);
            setPlayerState({ type: 'playing', videoUrl: session.objectUrl });
        } catch (err: unknown) {
            console.error('Playback failed:', err);
            const message = err instanceof KMSError && err.code === 'SIGNLESS_PLAYBACK_UNAVAILABLE'
                ? playerCopy.signless_playback_unavailable
                : err instanceof Error
                    ? err.message
                    : playerCopy.load_failed;
            setPlayerState({ type: 'error', message });
        }
    }, [accountId, cid, cleanupPlaybackArtifacts, event, eventAccessMode, getWallet, playerCopy, resolvedThumbnailUrl, t.watch_page.untitled]);

    const handlePlay = () => playVideo(false);

    const handleVideoError = () => {
        if (playerState.type !== 'playing' || !playerState.videoUrl) return;

        // If it's a blob component (from our decrypted streams), don't fallback this route
        if (playerState.videoUrl.startsWith('blob:')) {
            console.error("Video playback error with blob");
            cleanupPlaybackArtifacts();
            setPlayerState({ type: 'error', message: playerCopy.segmented_failed });
            return;
        }

        const videoCid = extractIpfsCid(playerState.videoUrl);
        if (!videoCid) return;

        console.warn(`Video load error from ${playerState.videoUrl}. Attempting fallback...`);

        const videoSource = `ipfs://${videoCid}`;
        const sourceKey = getIpfsMediaSourceKey(videoSource);
        rememberFailedIpfsMediaUrl(playerState.videoUrl, {
            input: videoSource,
            sourceKey,
            purpose: 'video',
        });

        const nextUrl = getNextIpfsMediaUrl(videoSource, {
            currentUrl: playerState.videoUrl,
            sourceKey,
            purpose: 'video',
        });

        if (nextUrl) {
            setPlayerState({ type: 'playing', videoUrl: nextUrl });
        } else {
            console.error("All fallback gateways failed for video playback");
            setPlayerState({ type: 'error', message: playerCopy.gateway_failed });
        }
    };

    return (
        <div className={`w-full bg-zinc-950 rounded-lg relative group ${showPurchaseCard ? 'min-h-[56.25%] overflow-visible' : 'aspect-video overflow-hidden'}`}>
            {!videoUrl ? (
                <div className={`flex flex-col items-center text-white ${showPurchaseCard ? 'w-full' : 'absolute inset-0 justify-center p-4'}`}>
                    {playerState.type === 'banned' ? (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md w-full h-full p-6 text-center">
                            <ShieldOff className="w-16 h-16 text-near-red mb-4" />
                            <h3 className="text-2xl font-bold text-white mb-2">{t.moderation.content_removed}</h3>
                            <p className="text-zinc-400 max-w-sm mb-6">
                                {t.moderation.content_removed_desc}
                            </p>
                            <Button
                                variant="outline"
                                onClick={() => window.location.href = '/discover'}
                            >
                                {t.moderation.back_to_discover}
                            </Button>
                        </div>
                    ) : checkingAccess && !hasAccess ? (
                        <div className="text-center">
                            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-zinc-500" />
                            <p className="text-xs text-zinc-500">{playerCopy.authorizing}</p>
                        </div>
                    ) : loading ? (
                        <div className="text-center">
                            <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-near-green" />
                            <p className="text-sm text-zinc-300">{status}</p>
                        </div>
                    ) : shouldRenderPurchaseCard ? (
                        // SHOW INLINE PURCHASE CARD
                        <div className="z-10 flex flex-col items-center bg-black/95 backdrop-blur-md w-full p-4">
                            <TicketPurchaseCard
                                cid={cid}
                                onPurchaseSuccess={() => {
                                    markRecentTicketPurchase(accountId, cid);
                                    setPurchased(true);
                                    if (accountId && cid) {
                                        queryClient.setQueryData(['nftOwnership', accountId, cid], true);
                                        queryClient.setQueryData(['hasTicket', accountId, cid], true);
                                        void queryClient.invalidateQueries({ queryKey: ['nftOwnership', accountId, cid] });
                                        void queryClient.invalidateQueries({ queryKey: ['hasTicket', accountId, cid] });
                                        void queryClient.invalidateQueries({ queryKey: ['ownedTokens', accountId] });
                                    }
                                    void refetchOwnership();
                                    handlePlay();
                                }}
                                className="w-full max-w-sm"
                            />
                        </div>
                    ) : error ? (
                        // SHOW ERROR / RETRY
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md w-full h-full p-6 text-center">
                            <Lock className="w-16 h-16 text-zinc-600 mb-4" />
                            <h3 className="text-2xl font-bold text-white mb-2">{playerCopy.error_title}</h3>
                            <p className="text-zinc-400 max-w-sm mb-8">
                                {error}
                            </p>
                            <div className="flex flex-col gap-4 w-full max-w-xs">
                                <Button
                                    className="w-full h-12 text-lg font-bold gap-2"
                                    onClick={handlePlay}
                                >
                                    <Play className="w-5 h-5" />
                                    {playerCopy.retry}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        // SHOW PLAY BUTTON IF HAS ACCESS
                        <div className="relative z-10 text-center w-full h-full flex flex-col items-center justify-center">
                            {/* Background Thumbnail */}
                            {
                                resolvedThumbnailUrl && (
                                    <div className="absolute inset-0 z-0">
                                        <IPFSThumbnail
                                            url={resolvedThumbnailUrl}
                                            alt={playerCopy.thumbnail_alt}
                                            className="w-full h-full object-cover opacity-50 blur-sm"
                                            loading="eager"
                                        />
                                        <div className="absolute inset-0 bg-black/40" />
                                    </div>
                                )
                            }

                            <div className="relative z-10 flex max-w-sm flex-col items-center rounded-md border border-white/10 bg-black/55 p-5 shadow-2xl backdrop-blur-md">
                                <ShieldCheck className="h-12 w-12 mx-auto mb-4 text-near-green" />
                                <h3 className="text-xl font-bold mb-2 text-white">{playerCopy.protected_title}</h3>
                                <p className="text-sm text-zinc-200 mb-6 font-medium">
                                    {playerCopy.protected_desc}
                                </p>
                                <Button onClick={handlePlay} size="lg" className="h-12 gap-2 px-6 shadow-xl shadow-primary/20">
                                    <Play className="h-5 w-5" />
                                    {playerCopy.play}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <MediaController className="absolute inset-0 block h-full w-full bg-black">
                    <video
                        ref={videoRef}
                        slot="media"
                        disableRemotePlayback
                        src={videoUrl}
                        poster={posterUrl}
                        onContextMenu={(e) => e.preventDefault()}
                        onError={handleVideoError}
                        onClick={handleTogglePlayback}
                        className="h-full w-full bg-black object-contain"
                        playsInline
                        preload="auto"
                    />
                    <div
                        className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-3 pt-12 md:px-4"
                        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
                    >
                        <div className="space-y-2">
                            <input
                                type="range"
                                aria-label={playerCopy.seek_label}
                                aria-valuetext={`${formatTime(displayedTimeSeconds)} / ${formatTime(effectiveDurationSeconds)}`}
                                min={0}
                                max={Math.max(effectiveDurationSeconds, 1)}
                                step={0.1}
                                value={Math.min(displayedTimeSeconds, effectiveDurationSeconds)}
                                onPointerDown={() => {
                                    setIsScrubbing(true);
                                    setScrubTimeSeconds(currentTimeSeconds);
                                }}
                                onPointerUp={(event) => commitSeek(Number((event.target as HTMLInputElement).value))}
                                onPointerCancel={() => setIsScrubbing(false)}
                                onChange={(event) => handleSeekPreview(Number(event.target.value))}
                                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-transparent accent-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green"
                                style={{
                                    background: `linear-gradient(to right, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.95) ${playedPercent}%, rgba(255,255,255,0.35) ${playedPercent}%, rgba(255,255,255,0.35) ${bufferedPercent}%, rgba(255,255,255,0.16) ${bufferedPercent}%, rgba(255,255,255,0.16) 100%)`,
                                }}
                            />
                            <MediaControlBar className="flex w-full items-center justify-between gap-2 bg-transparent text-white">
                                <div className="flex min-w-0 items-center gap-2">
                                    <MediaPlayButton
                                        aria-label={isPaused ? playerCopy.play_label : playerCopy.pause_label}
                                        className={mediaChromeButtonClassName}
                                    />
                                    <MediaMuteButton
                                        aria-label={isMuted ? playerCopy.unmute_label : playerCopy.mute_label}
                                        className={mediaChromeButtonClassName}
                                    />
                                    <span className="truncate text-xs font-medium tabular-nums">
                                        {formatTime(displayedTimeSeconds)} / {formatTime(effectiveDurationSeconds)}
                                    </span>
                                </div>
                                <MediaFullscreenButton
                                    aria-label={isFullscreen ? playerCopy.fullscreen_exit_label : playerCopy.fullscreen_enter_label}
                                    className={mediaChromeButtonClassName}
                                />
                            </MediaControlBar>
                        </div>
                    </div>
                </MediaController>
            )}
            {videoUrl && backgroundStatus && (
                <div className="absolute right-3 top-3 z-30 rounded-full bg-black/70 px-3 py-1 text-xs text-white backdrop-blur">
                    {backgroundStatus}
                </div>
            )}
        </div>
    );
}
