// After Sign out the next sign-in shows the provider's login screen (`prompt=login`) instead of
// silently reusing its session, so another account can be chosen. The flag lives in this tab's
// sessionStorage, so it survives a reload (which also signs out: the V2 session is memory-only).
const FORCE_LOGIN_KEY = 'youtick.v2.force-login';

type FlagStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function tabStorage(): FlagStorage | null {
    try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; }
}

export function signInPrompt(storage: FlagStorage | null = tabStorage()): 'login' | undefined {
    try { return storage?.getItem(FORCE_LOGIN_KEY) === '1' ? 'login' : undefined; } catch { return undefined; }
}

/** `true` after Sign out, `false` after a completed sign-in. Blocked storage keeps today's reuse. */
export function setForceLogin(value: boolean, storage: FlagStorage | null = tabStorage()): void {
    try {
        if (value) storage?.setItem(FORCE_LOGIN_KEY, '1');
        else storage?.removeItem(FORCE_LOGIN_KEY);
    } catch { /* storage blocked */ }
}
