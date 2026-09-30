/** Whether this browser can keep a viewing session (same requirements as lib/device-session). */
export function deviceStorageAvailable(): boolean {
    return typeof indexedDB !== 'undefined'
        && typeof crypto !== 'undefined'
        && Boolean(crypto.subtle)
        && (typeof isSecureContext === 'undefined' || isSecureContext);
}
