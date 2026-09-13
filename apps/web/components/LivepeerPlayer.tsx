'use client';

import { useMemo, useRef, useState, useEffect, useSyncExternalStore } from 'react';
import Image from 'next/image';
import * as Player from '@livepeer/react/player';
import { getSrc } from '@livepeer/react/external';
import { Loader2 } from 'lucide-react';
import { ensureSessionGrant } from '@/lib/access-grants';
import { useWallet } from '@/components/providers/WalletProvider';
import { Button } from '@/components/ui/button';
import { ensureDeviceSession } from '@/lib/device-session';
import { FEATURE_FLAGS } from '@/lib/constants';
import { recordVideoPlaybackEvents, startVideoMeasurement } from '@/lib/video-measurements';
import { startLivepeerPlaybackSession, type LivepeerPlaybackInput } from '@/lib/livepeer-playback';
import { playbackMode } from '@/lib/livepeer-player-media';
import { playerCopy, playerLanguage, subscribePlayerLanguage, type PlayerLanguage } from '@/lib/player-copy';
import { LivepeerPlayerSurface, type PlaybackRecovery } from './LivepeerPlayerSurface';
import { activatePlaybackDevice } from '@/lib/playback-device-activation';

type LivepeerPlayerProps = LivepeerPlaybackInput & {
    title: string;
    poster?: string;
};

export function LivepeerPlayer(props: LivepeerPlayerProps) {
    return <LivepeerPlayerSession key={`${props.accountId}:${props.jobId}:${props.generation}:${props.playbackId}`} {...props} />;
}

function LivepeerPlayerSession({
    title,
    poster,
    accountId,
    jobId,
    generation,
    playbackId,
}: LivepeerPlayerProps) {
    const { getWallet } = useWallet();
    const tokenRef = useRef<string | null>(null);
    const [src, setSrc] = useState<ReturnType<typeof getSrc>>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [previewVttUrl, setPreviewVttUrl] = useState<string | undefined>();
    const [error, setError] = useState<Error | null>(null);
    const [needsSession, setNeedsSession] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [activationPending, setActivationPending] = useState(false);
    const verificationRef = useRef<AbortController | null>(null);
    const [attempt, setAttempt] = useState(0);
    const language = useSyncExternalStore(subscribePlayerLanguage, playerLanguage, () => 'en' as PlayerLanguage);
    const copy = playerCopy[language];
    const [mode, setMode] = useState<'hls' | 'native'>('hls');
    const recovery = useRef<PlaybackRecovery | null>(null);
    const input = useMemo(() => ({ accountId, jobId, generation, playbackId }), [accountId, jobId, generation, playbackId]);

    useEffect(() => {
        const finishPreparation = startVideoMeasurement('playback_preparation');
        const controller = new AbortController();
        let disposed = false;
        let destroy: (() => void) | undefined;
        tokenRef.current = null;
        setSrc(null);
        setAccessToken(null);
        setError(null);
        setNeedsSession(false);

        const ensurePlayGrant = async () => {
            const wallet = await getWallet();
            controller.signal.throwIfAborted();
            const grant = await ensureSessionGrant({
                accountId,
                scope: 'Play',
                resourceId: jobId,
                wallet,
            });
            if (!grant) throw new Error('livepeer_play_grant_missing');
        };

        const preparePlayback = async () => {
            if (FEATURE_FLAGS.enablePlaybackAuthorizerV2) return undefined;
            const wallet = await getWallet();
            controller.signal.throwIfAborted();
            if (!FEATURE_FLAGS.enablePlaybackAuthorizerV2) await ensurePlayGrant();
            return wallet;
        };

        void playbackMode()
            .then((selected) => {
                if (disposed) throw new Error('livepeer_playback_cancelled');
                setMode(selected);
                return preparePlayback();
            })
            .then((wallet) => {
                if (disposed) throw new Error('livepeer_playback_cancelled');
                finishPreparation('completed');
                return startLivepeerPlaybackSession({
                    accountId,
                    jobId,
                    generation,
                    playbackId,
                }, {
                    signal: controller.signal,
                    renewGrant: ensurePlayGrant,
                    onAccess: (access) => {
                        if (disposed) return;
                        const nextSrc = getSrc(access.hlsUrl);
                        if (!nextSrc) throw new Error('invalid_livepeer_playback_source');
                        tokenRef.current = access.token;
                        setActivationPending(false);
                        setAccessToken(access.token);
                        setPreviewVttUrl(access.previewVttUrl);
                        setSrc((current) => current ?? nextSrc);
                    },
                    onError: (nextError) => {
                        if (disposed) return;
                        tokenRef.current = null;
                        setAccessToken(null);
                        setSrc(null);
                        setNeedsSession(isDeviceSessionError(nextError));
                        setError(nextError);
                    },
                }, wallet);
            })
            .then((session) => {
                if (disposed) session.destroy();
                else destroy = session.destroy;
            })
            .catch((nextError) => {
                finishPreparation('failed');
                if (disposed) return;
                tokenRef.current = null;
                setAccessToken(null);
                setSrc(null);
                setNeedsSession(isDeviceSessionError(nextError));
                setError(nextError instanceof Error ? nextError : new Error('livepeer_playback_failed'));
            });

        return () => {
            finishPreparation('cancelled');
            disposed = true;
            verificationRef.current?.abort();
            controller.abort();
            tokenRef.current = null;
            destroy?.();
        };
    }, [accountId, attempt, generation, getWallet, jobId, playbackId]);

    const retry = () => {
        setError(null);
        setAttempt((current) => current + 1);
    };

    const verifySession = async () => {
        if (FEATURE_FLAGS.publicTestnetVideoV1 && !FEATURE_FLAGS.enablePlaybackAuthorizerV2) return;
        if (verificationRef.current && !verificationRef.current.signal.aborted) return;
        const controller = new AbortController();
        verificationRef.current = controller;
        setVerifying(true);
        try {
            const wallet = await getWallet();
            controller.signal.throwIfAborted();
            if (FEATURE_FLAGS.publicTestnetVideoV1) {
                await activatePlaybackDevice(wallet, input, controller.signal);
            } else {
                await ensureDeviceSession(wallet, accountId, controller.signal);
            }
            controller.signal.throwIfAborted();
            setActivationPending(false);
            retry();
        } catch (reason) {
            if (!controller.signal.aborted) {
                setActivationPending(reason instanceof Error && reason.message === 'device_activation_pending');
                setError(reason instanceof Error ? reason : new Error('device_verification_failed'));
            }
        } finally {
            if (verificationRef.current === controller) {
                verificationRef.current = null;
                setVerifying(false);
            }
        }
    };

    if (!src || !accessToken) {
        const publicActivation = FEATURE_FLAGS.publicTestnetVideoV1 && FEATURE_FLAGS.enablePlaybackAuthorizerV2;
        const canActivate = publicActivation && (error?.message === 'device_session_required' || error?.message === 'playback_denied' || activationPending);
        const primaryVerification = needsSession && !activationPending && (canActivate || !FEATURE_FLAGS.publicTestnetVideoV1);
        return <div lang={language} className={`relative flex items-center justify-center overflow-hidden rounded-lg bg-black p-6 text-center text-white ${canActivate ? 'min-h-64 sm:aspect-video' : 'aspect-video'}`}>
            {poster && <Image fill priority unoptimized src={poster} alt="" sizes="(min-width: 1024px) 1024px, 100vw" className="object-cover" onError={event => { event.currentTarget.hidden = true; }} />}
            <div aria-hidden="true" className="absolute inset-0 bg-black/75" />
            {error ? <div role="alert" className="relative max-w-sm">
                <p className="text-sm">{playbackErrorMessage(error, language)}</p>
                {canActivate && <p className="mt-3 text-xs text-zinc-300">{copy.activationInfo}</p>}
                <Button className="mt-4 min-h-11" variant="outline" disabled={verifying} onClick={primaryVerification ? () => void verifySession() : retry}>
                    {verifying ? copy.verifying : primaryVerification ? publicActivation ? copy.activate : copy.verify : activationPending ? copy.checkAgain : copy.retry}
                </Button>
                {canActivate && !primaryVerification && <Button className="mt-2 min-h-11" variant="outline" disabled={verifying} onClick={() => void verifySession()}>{copy.activate}</Button>}
            </div> : <div role="status" className="relative flex items-center gap-3 text-sm">
                <Loader2 size={20} className="motion-safe:animate-spin" aria-hidden="true" />{copy.checking}
            </div>}
        </div>;
    }

    return <Player.Root key={attempt}
        src={mode === 'native' ? src.map(source => ({ ...source, type: 'video' as const })) : src}
        playbackId={playbackId} jwt={accessToken} preload="metadata" videoQuality="auto" storage={null}
        onPlaybackEvents={recordVideoPlaybackEvents}>
        <LivepeerPlayerSurface input={input} title={title} poster={poster} language={language} mode={mode}
            token={accessToken} tokenRef={tokenRef} recoveryRef={recovery} retry={retry} previewVttUrl={previewVttUrl} />
    </Player.Root>;
}

function isDeviceSessionError(error: unknown): boolean {
    return error instanceof Error && error.message.startsWith('device_session_');
}

function playbackErrorMessage(error: Error, language: PlayerLanguage): string {
    const copy = playerCopy[language];
    if (error.message === 'device_activation_pending') return copy.activationPending;
    if (error.message === 'device_activation_account_changed') return copy.accountChanged;
    if (['device_activation_disabled', 'device_activation_unavailable'].includes(error.message)) return copy.activationUnavailable;
    if (['device_session_storage_unavailable', 'device_session_crypto_unavailable'].includes(error.message)) return copy.storage;
    if (isDeviceSessionError(error)) return FEATURE_FLAGS.publicTestnetVideoV1 ? copy.session : copy.legacySession;
    if (error.message === 'livepeer_playback_unsupported') return copy.unsupported;
    if (error.message === 'device_verification_failed') return copy.verificationFailed;
    if (['livepeer_play_grant_missing', 'livepeer_play_grant_pending', 'livepeer_play_grant_mismatch', 'playback_denied'].includes(error.message)) return copy.denied;
    if (error instanceof TypeError) return copy.network;
    return copy.unavailable;
}
