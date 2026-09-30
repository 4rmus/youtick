import { FEATURE_FLAGS } from '@/lib/constants';
import { playerCopy, type PlayerLanguage } from '@/lib/player-copy';

// Shared by the player and the device dialog; kept apart so the dialog does not load the player bundle.
export function isDeviceSessionError(error: unknown): boolean {
    return error instanceof Error && error.message.startsWith('device_session_');
}

export function playbackErrorMessage(error: Error, language: PlayerLanguage): string {
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
