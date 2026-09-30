import { FEATURE_FLAGS } from '@/lib/constants';

export type DeviceStatus = 'ready' | 'needed' | 'unknown' | 'checking';

/** The explicit device dialog only exists for the public testnet playback authorizer. */
export function usesDeviceActivation(): boolean {
    return FEATURE_FLAGS.publicTestnetVideoV1 && FEATURE_FLAGS.enablePlaybackAuthorizerV2;
}

/** Enter directly unless this device is known to need activation; unknown lets the player check again. */
export function salonEntry(status: DeviceStatus | null): 'enter' | 'activate' {
    return usesDeviceActivation() && status === 'needed' ? 'activate' : 'enter';
}
