// OIDC authorization code + PKCE in a popup with response_mode=web_message, carrying our own
// `nonce`. The Auth0 SPA SDK generates its own nonce, but `ckd-gate` needs the id_token nonce to
// bind the CKD ephemeral key, so this flow is hand-rolled (from the youtick-v2-spikes gate page).
// The id_token stays in memory and is never logged.

export interface PopupLike {
    closed: boolean;
    location: { href: string };
    close(): void;
}

export interface OidcLoginInput {
    issuer: string;
    clientId: string;
    nonce: string;
    redirectUri: string;
    /** `login` forces the provider's sign-in screen; omit it to reuse an existing provider session. */
    prompt?: 'login';
}

export interface OidcEnvironment {
    addMessageListener(listener: (event: { origin: string; data: unknown; source?: unknown }) => void): () => void;
    fetch: typeof fetch;
    randomBytes(length: number): Uint8Array;
    sha256(data: Uint8Array): Promise<Uint8Array>;
    setInterval(callback: () => void, ms: number): unknown;
    clearInterval(handle: unknown): void;
}

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const TOKEN_EXCHANGE_TIMEOUT_MS = 20_000;
const MAX_ID_TOKEN_LENGTH = 16 * 1024;

export function base64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function browserOidcEnvironment(): OidcEnvironment {
    return {
        addMessageListener(listener) {
            const handler = (event: MessageEvent) => listener({ origin: event.origin, data: event.data, source: event.source });
            window.addEventListener('message', handler);
            return () => window.removeEventListener('message', handler);
        },
        fetch: (...args) => fetch(...args),
        randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
        sha256: async (data) => new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource)),
        setInterval: (callback, ms) => window.setInterval(callback, ms),
        clearInterval: (handle) => window.clearInterval(handle as number),
    };
}

export async function authorizeUrl(input: OidcLoginInput, state: string, challenge: string): Promise<string> {
    const url = new URL('authorize', input.issuer);
    const params: Record<string, string> = {
        client_id: input.clientId,
        response_type: 'code',
        response_mode: 'web_message',
        redirect_uri: input.redirectUri,
        scope: 'openid',
        state,
        nonce: input.nonce,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        ...(input.prompt ? { prompt: input.prompt } : {}),
    };
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.href;
}

/**
 * Runs the login in `popup`, which the caller must open synchronously in the click handler
 * (`window.open('about:blank', …)`) so the browser does not block it. Resolves with the raw id_token.
 */
export async function loginWithNonce(
    popup: PopupLike, input: OidcLoginInput, env: OidcEnvironment = browserOidcEnvironment(),
): Promise<string> {
    let issuerOrigin: string;
    let state: string;
    let verifier: string;
    try {
        issuerOrigin = new URL(input.issuer).origin;
        state = base64Url(env.randomBytes(32));
        verifier = base64Url(env.randomBytes(32));
        const challenge = base64Url(await env.sha256(new TextEncoder().encode(verifier)));
        popup.location.href = await authorizeUrl(input, state, challenge);
    } catch {
        if (!popup.closed) popup.close();
        throw new Error('near_auth_login_failed');
    }

    const code = await new Promise<string>((resolve, reject) => {
        const startedAt = Date.now();
        let removeListener = () => {};
        const timer = env.setInterval(() => {
            if (popup.closed) finish(new Error('near_auth_login_cancelled'));
            else if (Date.now() - startedAt > LOGIN_TIMEOUT_MS) finish(new Error('near_auth_login_timeout'));
        }, 500);
        function finish(error: Error | null, value?: string) {
            env.clearInterval(timer);
            removeListener();
            if (!popup.closed) popup.close();
            if (error) reject(error);
            else resolve(value!);
        }
        removeListener = env.addMessageListener((event) => {
            // Only our popup's response for this state counts; anything else (another login, another
            // frame from the issuer) is ignored rather than ending this login.
            if (event.origin !== issuerOrigin || event.source !== popup) return;
            const data = event.data as { type?: unknown; response?: Record<string, unknown> } | null;
            if (!data || data.type !== 'authorization_response' || !data.response) return;
            const response = data.response;
            if (response.state !== state) return;
            if (typeof response.error === 'string') {
                const known = ['access_denied', 'login_required', 'consent_required', 'interaction_required'];
                return finish(new Error(`near_auth_${known.includes(response.error) ? response.error : 'login_failed'}`));
            }
            if (typeof response.code !== 'string' || !response.code) return finish(new Error('near_auth_login_failed'));
            finish(null, response.code);
        });
    });

    const tokenResponse = await env.fetch(new URL('oauth/token', input.issuer), {
        method: 'POST',
        signal: AbortSignal.timeout(TOKEN_EXCHANGE_TIMEOUT_MS),
        cache: 'no-store',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grant_type: 'authorization_code', client_id: input.clientId, code, code_verifier: verifier,
            redirect_uri: input.redirectUri,
        }),
    });
    if (!tokenResponse.ok) throw new Error('near_auth_token_exchange_failed');
    const tokens = await tokenResponse.json().catch(() => null) as { id_token?: unknown } | null;
    if (typeof tokens?.id_token !== 'string' || !tokens.id_token || tokens.id_token.length > MAX_ID_TOKEN_LENGTH) {
        throw new Error('near_auth_token_exchange_failed');
    }
    return tokens.id_token;
}
