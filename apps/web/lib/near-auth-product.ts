export const PRODUCT_AUTH_CALLBACK = '/auth/callback';
export const PRODUCT_AUTH_SESSION = '/api/auth/session';
export const PRODUCT_AUTH_ACCOUNT = '/api/auth/account';
export const AUTH_METHOD_KEY = 'youtick:auth-method:v1';

export function authReturnPath(value: unknown): string {
    if (typeof value !== 'string') return '/profile';
    if (['/profile', '/upload'].includes(value)) return value;
    const match = /^\/(watch|upload)\?job=([A-Za-z0-9._:%-]+)$/.exec(value);
    if (!match) return '/profile';
    try {
        const job = decodeURIComponent(match[2]);
        return /^[A-Za-z0-9._:-]{1,128}$/.test(job) ? `/${match[1]}?job=${encodeURIComponent(job)}` : '/profile';
    } catch { return '/profile'; }
}

export type ProductAccount = { accountId: string; accountReady: boolean; expiresAt: number };
export async function readProductAccount(signal?: AbortSignal): Promise<ProductAccount> {
    const response = await fetch(PRODUCT_AUTH_ACCOUNT, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(response.status === 401 ? 'session_expired' : 'account_check_failed');
    const value = await response.json();
    if (!value || typeof value.accountId !== 'string' || !/^[a-f0-9]{64}$/.test(value.accountId)
        || typeof value.accountReady !== 'boolean' || !Number.isSafeInteger(value.expiresAt)
        || value.expiresAt <= Date.now() || value.expiresAt > Date.now() + 3_600_000) throw new Error('account_check_failed');
    return value;
}
