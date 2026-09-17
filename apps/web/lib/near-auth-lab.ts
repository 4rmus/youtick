export const NEAR_AUTH_LAB_PATH = '/auth-lab';
export const NEAR_AUTH_LAB_DOMAIN = 'login.testnet.fast-auth.com';
export const NEAR_AUTH_TESTNET_RPC = 'https://test.rpc.fastnear.com/';
export const NEAR_AUTH_SIGNING_CHECK_ERRORS = new Set([
    'account_changed', 'account_required', 'budget_not_verified', 'provider_changed', 'provider_configuration_changed',
    'rpc_unavailable', 'rpc_invalid', 'discovery_unavailable', 'invalid_discovery', 'invalid_sponsored_upload_quote',
    'invalid_upload', 'upload_not_ready', 'upload_expired', 'upload_first_device_only', 'invalid_approval',
    'unapproved_claims', 'invalid_signature', 'outer_not_verified', 'authorization_expired', 'check_timeout', 'compact_upload_unavailable',
]);
const SESSION_API = '/api/auth-lab/session';

export const nearAuthJobId = (value: unknown): string | null => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : null;
export const nearAuthJobHref = (jobId: string) => nearAuthJobId(jobId) ? `${NEAR_AUTH_LAB_PATH}?job=${encodeURIComponent(jobId)}` : NEAR_AUTH_LAB_PATH;

// Keep browser device/session code out of the server-side lab gate imports.
async function suspendPlayback() {
    await (await import('./device-session')).suspendDeviceSession();
}

export function nearAuthLabEnabled(environment: string | undefined, enabled: string | undefined, network: string | undefined) {
    return environment === 'development' && enabled === 'true' && network === 'testnet';
}

// Session restoration never requests a wallet or signing approval.
export function createNearAuthLab(clientId: string) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(clientId)) throw new Error('near_auth_lab_not_configured');
    let provider: Promise<import('@auth0/auth0-spa-js').Auth0Client> | undefined;
    let restored: Promise<boolean> | undefined;
    const getProvider = () => provider ??= import('@auth0/auth0-spa-js').then(({ Auth0Client }) => (
        new Auth0Client({ domain: NEAR_AUTH_LAB_DOMAIN, clientId, cacheLocation: 'memory' })
    ));
    const returnTo = () => new URL(NEAR_AUTH_LAB_PATH, window.location.origin).href;

    async function session(method = 'GET', idToken?: string) {
        const response = await fetch(SESSION_API, {
            method, credentials: 'same-origin', cache: 'no-store',
            ...(idToken ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) } : {}),
        });
        if (response.status === 401) await suspendPlayback();
        if (!response.ok) throw new Error('near_auth_session_failed');
        const value: unknown = await response.json();
        if (!value || typeof value !== 'object' || !('authenticated' in value) || typeof value.authenticated !== 'boolean') {
            throw new Error('near_auth_session_failed');
        }
        return value.authenticated;
    }

    async function saveSession() {
        const claims = await (await getProvider()).getIdTokenClaims();
        if (!claims?.__raw) throw new Error('near_auth_callback_failed');
        if (!await session('POST', claims.__raw)) throw new Error('near_auth_session_failed');
        await suspendPlayback();
        return true;
    }

    async function restore() {
        const query = new URLSearchParams(window.location.search);
        const callback = ['code', 'state', 'error', 'error_description'].some((key) => query.has(key));
        let job: string | null = null;
        try {
            if (callback && (query.has('error') || !query.get('code') || !query.get('state'))) {
                throw new Error('near_auth_callback_failed');
            }
            if (callback) {
                const result = await (await getProvider()).handleRedirectCallback<{ job?: unknown }>();
                job = nearAuthJobId(result.appState?.job);
                return await saveSession();
            }
            return await session();
        } finally {
            if (callback) window.history.replaceState(window.history.state, '', job ? nearAuthJobHref(job) : NEAR_AUTH_LAB_PATH);
        }
    }

    return {
        // Share callback handling across React StrictMode's repeated effect setup.
        restore: () => restored ??= restore(),
        async requestSigningAuthorization(transaction: number[], kind: 'transaction' | 'delegateAction' = 'transaction') {
            if (!Array.isArray(transaction) || !transaction.length || transaction.length > (kind === 'delegateAction' ? 4096 : 2048)
                || !transaction.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) throw new Error('invalid_transaction');
            const auth = await getProvider();
            const authorizationParams = { audience: 'auth0.jwt.fast-auth.testnet', scope: 'transaction:sign' };
            try {
                // Signing tokens can live for 60s; silent retrieval renews anything within 60s without this payload.
                const token = await auth.getTokenWithPopup({ authorizationParams: { ...authorizationParams, [kind]: transaction, prompt: 'login' } });
                if (typeof token !== 'string' || !token) throw new Error('signing_approval_failed');
                return token;
            } catch (error) {
                if (error instanceof Error && 'error' in error && error.error === 'timeout' && 'popup' in error) {
                    const popup = error.popup;
                    if (popup && typeof popup === 'object' && 'close' in popup && typeof popup.close === 'function') popup.close();
                }
                const code = error instanceof Error && 'error' in error && typeof error.error === 'string'
                    && ['access_denied', 'login_required', 'consent_required', 'timeout', 'cancelled', 'popup_open_error'].includes(error.error)
                    ? error.error : 'failed';
                // Local lab diagnosis only: retain bounded provider text, never the error object or auth payload.
                const description = code === 'access_denied' && error instanceof Error && 'error_description' in error && typeof error.error_description === 'string'
                    ? error.error_description.slice(0, 2048)
                        .replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+|(?:google-oauth2|auth0)\|[^\s,;]+|[A-Za-z0-9_+=./-]{20,}/g, '[redacted]')
                        .replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 400) : '';
                throw new Error(`signing_approval_${code}${description ? `: ${description}` : ''}`);
            }
        },
        async login(redirect = false) {
            const auth = await getProvider();
            try {
                if (redirect) {
                    const job = nearAuthJobId(new URLSearchParams(window.location.search).get('job'));
                    await auth.loginWithRedirect({ ...(job ? { appState: { job } } : {}), authorizationParams: { redirect_uri: returnTo(), prompt: 'login' } });
                    return false;
                }
                await auth.loginWithPopup({ authorizationParams: { prompt: 'login' } });
            } catch (error) {
                if (error instanceof Error && 'error' in error && error.error === 'timeout' && 'popup' in error) {
                    const popup = error.popup;
                    if (popup && typeof popup === 'object' && 'close' in popup && typeof popup.close === 'function') popup.close();
                    throw new Error('near_auth_login_timeout');
                }
                throw error;
            }
            return saveSession();
        },
        async logout() {
            await session('DELETE');
            try {
                await suspendPlayback();
                await (await getProvider()).logout({ logoutParams: { returnTo: window.location.origin } });
            } catch {
                throw new Error('near_auth_local_logout_complete');
            }
        },
    };
}
