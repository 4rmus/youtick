import { authReturnPath, PRODUCT_AUTH_CALLBACK, PRODUCT_AUTH_SESSION } from './near-auth-product';

export const NEAR_AUTH_LAB_PATH = '/auth-lab';
export const NEAR_AUTH_LAB_DOMAIN = 'login.testnet.fast-auth.com';
export const NEAR_AUTH_TESTNET_RPC = 'https://test.rpc.fastnear.com/';
export const NEAR_AUTH_SIGNING_CHECK_ERRORS = new Set([
    'account_changed', 'account_required', 'budget_not_verified', 'provider_changed', 'provider_configuration_changed',
    'rpc_unavailable', 'rpc_invalid', 'discovery_unavailable', 'invalid_discovery', 'invalid_sponsored_upload_quote',
    'invalid_upload', 'upload_not_ready', 'upload_expired', 'upload_first_device_only', 'invalid_approval',
    'unapproved_claims', 'invalid_signature', 'outer_not_verified', 'authorization_expired', 'check_timeout', 'compact_upload_unavailable',
    'ticket_disabled', 'ticket_unavailable', 'ticket_not_available', 'ticket_balance_required', 'ticket_first_device_only',
    'invalid_ticket_device', 'invalid_sponsor',
]);

// Only fixed diagnostic labels may cross the server/client boundary, never error values.
export function safeSigningDiagnostic(value: unknown): Record<string, string> {
    if (!value || typeof value !== 'object') return {};
    const allowed: Record<string, readonly string[]> = {
        stage: ['upload_review', 'google_approval', 'upload_preflight'],
        code: ['ERR_JWT_EXPIRED', 'ERR_JWT_CLAIM_VALIDATION_FAILED', 'ERR_JWT_INVALID',
            'ERR_JWS_INVALID', 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED', 'ERR_JOSE_ALG_NOT_ALLOWED',
            'ERR_JOSE_NOT_SUPPORTED', 'ERR_JOSE_GENERIC', 'ERR_JWE_INVALID', 'ERR_JWE_DECRYPTION_FAILED',
            'ERR_JWKS_TIMEOUT', 'ERR_JWKS_NO_MATCHING_KEY', 'ERR_JWKS_MULTIPLE_MATCHING_KEYS',
            'ERR_JWKS_INVALID', 'TypeError', 'SyntaxError'],
        claim: ['iss', 'aud', 'sub', 'iat', 'exp', 'nbf', 'azp', 'scope', 'fatxn'],
        claimCheck: ['missing', 'invalid', 'check_failed'],
    };
    const result: Record<string, string> = {};
    for (const [field, values] of Object.entries(allowed)) {
        const item = (value as Record<string, unknown>)[field];
        if (typeof item === 'string' && values.includes(item)) result[field] = item;
    }
    return result;
}
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
export function createNearAuthLab(clientId: string, surface: 'lab' | 'product' = 'lab') {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(clientId)) throw new Error('near_auth_lab_not_configured');
    let provider: Promise<import('@auth0/auth0-spa-js').Auth0Client> | undefined;
    let restored: Promise<boolean> | undefined;
    let loginGeneration = 0;
    let sessionWrite: Promise<boolean> | undefined;
    let destination = '/profile';
    const getProvider = () => provider ??= import('@auth0/auth0-spa-js').then(({ Auth0Client }) => (
        new Auth0Client({ domain: NEAR_AUTH_LAB_DOMAIN, clientId, cacheLocation: 'memory' })
    ));
    const returnTo = () => surface === 'product' ? window.location.origin : new URL(NEAR_AUTH_LAB_PATH, window.location.origin).href;

    async function session(method = 'GET', idToken?: string) {
        const response = await fetch(surface === 'product' ? PRODUCT_AUTH_SESSION : SESSION_API, {
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

    async function saveSession(expectedGeneration = loginGeneration) {
        const claims = await (await getProvider()).getIdTokenClaims();
        if (!claims?.__raw) throw new Error('near_auth_callback_failed');
        if (expectedGeneration !== loginGeneration) throw new Error('near_auth_login_cancelled');
        sessionWrite = session('POST', claims.__raw);
        if (!await sessionWrite) throw new Error('near_auth_session_failed');
        if (expectedGeneration !== loginGeneration) throw new Error('near_auth_login_cancelled');
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
                const expectedGeneration = loginGeneration;
                const result = await (await getProvider()).handleRedirectCallback<{ job?: unknown; returnTo?: unknown }>();
                destination = authReturnPath(result.appState?.returnTo);
                job = nearAuthJobId(result.appState?.job);
                return await saveSession(expectedGeneration);
            }
            return await session();
        } finally {
            if (callback) window.history.replaceState(window.history.state, '', surface === 'product' ? PRODUCT_AUTH_CALLBACK : job ? nearAuthJobHref(job) : NEAR_AUTH_LAB_PATH);
        }
    }

    return {
        returnPath: () => destination,
        cancelLogin: () => { loginGeneration += 1; },
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
            const expectedGeneration = ++loginGeneration;
            const auth = await getProvider();
            try {
                if (redirect) {
                    const job = nearAuthJobId(new URLSearchParams(window.location.search).get('job'));
                    await auth.loginWithRedirect({ ...(surface === 'product' ? { appState: { returnTo: authReturnPath(window.location.pathname + window.location.search) } } : job ? { appState: { job } } : {}), authorizationParams: { redirect_uri: returnTo(), prompt: 'login' } });
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
            return saveSession(expectedGeneration);
        },
        async logout() {
            loginGeneration += 1;
            await sessionWrite?.catch(() => {});
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
