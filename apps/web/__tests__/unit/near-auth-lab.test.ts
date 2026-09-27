import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const sdk = vi.hoisted(() => ({ construct: vi.fn(), callback: vi.fn(), login: vi.fn(), redirect: vi.fn(), claims: vi.fn(), logout: vi.fn(), token: vi.fn(), popupToken: vi.fn() }));
const navigation = vi.hoisted(() => ({ pathname: '/auth-lab' }));
const device = vi.hoisted(() => ({ suspend: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/device-session', () => ({ suspendDeviceSession: device.suspend }));
vi.mock('@/components/LivepeerPlayer', () => ({ LivepeerPlayerContent: () => null }));
vi.mock('@auth0/auth0-spa-js', () => ({
    Auth0Client: class {
        constructor(options: unknown) { sdk.construct(options); }
        handleRedirectCallback() { return sdk.callback(); }
        loginWithPopup(options: unknown) { return sdk.login(options); }
        loginWithRedirect(options: unknown) { return sdk.redirect(options); }
        getIdTokenClaims() { return sdk.claims(); }
        getTokenSilently(options: unknown) { return sdk.token(options); }
        getTokenWithPopup(options: unknown) { return sdk.popupToken(options); }
        logout(options: unknown) { return sdk.logout(options); }
    },
}));
vi.mock('next/navigation', () => ({
    notFound: () => { throw new Error('not_found'); },
    usePathname: () => navigation.pathname,
}));

import { createNearAuthLab, nearAuthLabEnabled, nearAuthJobHref } from '@/lib/near-auth-lab';
import NearAuthLabPage from '@/app/auth-lab/page';
import { AuthLabBoundary } from '@/components/AuthLabBoundary';

const originalLocation = window.location;
const originalHistory = window.history;
const sessionFetch = vi.fn();
let serverAuthenticated = false;
beforeEach(() => {
    navigation.pathname = '/auth-lab';
    serverAuthenticated = false;
    device.suspend.mockReset().mockResolvedValue(undefined);
    Object.values(sdk).forEach((mock) => mock.mockReset());
    sdk.callback.mockResolvedValue({});
    sdk.login.mockResolvedValue(undefined);
    sdk.redirect.mockResolvedValue(undefined);
    sdk.claims.mockResolvedValue({ __raw: 'synthetic-id-token' });
    sdk.logout.mockResolvedValue(undefined);
    sessionFetch.mockReset().mockImplementation(async (_url: string, options: RequestInit) => {
        if (options.method === 'POST') serverAuthenticated = true;
        if (options.method === 'DELETE') serverAuthenticated = false;
        return Response.json({ authenticated: serverAuthenticated });
    });
    vi.stubGlobal('fetch', sessionFetch);
    Object.assign(window, {
        location: { origin: 'http://localhost:3000', search: '' },
        history: { state: null, replaceState: vi.fn() },
    });
});
afterEach(() => {
    if (originalLocation) Object.assign(window, { location: originalLocation });
    else Reflect.deleteProperty(window, 'location');
    if (originalHistory) Object.assign(window, { history: originalHistory });
    else Reflect.deleteProperty(window, 'history');
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe('closed local-only NEAR Auth lab', () => {
    it('requests signing approval on the same Auth0 client with a transaction-bound audience and scope', async () => {
        sdk.popupToken.mockResolvedValue('synthetic-access-token');
        sdk.token.mockRejectedValue(new Error('silent request would omit the transaction payload'));
        const auth = createNearAuthLab('local-test-client');
        await auth.login();
        sdk.login.mockClear();
        expect(await auth.requestSigningAuthorization([0, 255, 1])).toBe('synthetic-access-token');
        expect(sdk.construct).toHaveBeenCalledTimes(1);
        expect(sdk.popupToken).toHaveBeenCalledWith({ authorizationParams: {
            audience: 'auth0.jwt.fast-auth.testnet', scope: 'transaction:sign', transaction: [0, 255, 1], prompt: 'login',
        } });
        expect(sdk.token).not.toHaveBeenCalled();
        expect(sdk.login).not.toHaveBeenCalled();
        expect(sessionFetch).toHaveBeenCalledTimes(1);
    });

    it('rejects malformed signing bytes without opening Auth0', async () => {
        const auth = createNearAuthLab('local-test-client');
        await expect(auth.requestSigningAuthorization([256])).rejects.toThrow('invalid_transaction');
        expect(sdk.login).not.toHaveBeenCalled();
    });

    it('uses the official delegateAction parameter for upload approval without creating a new app session', async () => {
        sdk.popupToken.mockResolvedValue('synthetic-access-token');
        const auth = createNearAuthLab('local-test-client');
        expect(await auth.requestSigningAuthorization([0, 255, 1], 'delegateAction')).toBe('synthetic-access-token');
        expect(sdk.popupToken).toHaveBeenCalledWith({ authorizationParams: {
            audience: 'auth0.jwt.fast-auth.testnet', scope: 'transaction:sign', delegateAction: [0, 255, 1], prompt: 'login',
        } });
        expect(sessionFetch).not.toHaveBeenCalled();
        await expect(auth.requestSigningAuthorization(Array(4097).fill(0), 'delegateAction')).rejects.toThrow('invalid_transaction');
        expect(sdk.popupToken).toHaveBeenCalledOnce();
        expect(sdk.token).not.toHaveBeenCalled();
    });

    it('does not accept an empty signing token', async () => {
        sdk.popupToken.mockResolvedValue(undefined);
        await expect(createNearAuthLab('local-test-client').requestSigningAuthorization([1])).rejects.toThrow('signing_approval_failed');
    });
    it('retains the provider denial reason while redacting identity, URLs and token-shaped values', async () => {
        sdk.popupToken.mockRejectedValue(Object.assign(new Error('private message'), {
            error: 'access_denied',
            error_description: 'Unable to render form.\nuser@example.com google-oauth2|1234567890 https://example.com/?code=private eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJwcml2YXRlIn0.signature',
        }));
        await expect(createNearAuthLab('local-test-client').requestSigningAuthorization([1], 'delegateAction'))
            .rejects.toThrow(new Error('signing_approval_access_denied: Unable to render form. [redacted] [redacted] [redacted] [redacted]'));
        expect(sdk.token).not.toHaveBeenCalled();
        expect(sessionFetch).not.toHaveBeenCalled();
    });
    it('bounds provider denial text and drops control characters', async () => {
        sdk.popupToken.mockRejectedValue(Object.assign(new Error('private message'), {
            error: 'access_denied', error_description: '\u0000' + 'bad form '.repeat(500),
        }));
        await expect(createNearAuthLab('local-test-client').requestSigningAuthorization([1]))
            .rejects.toThrow(new Error(`signing_approval_access_denied: ${'bad form '.repeat(50).slice(0, 400)}`));
    });
    it.each(['access_denied', 'login_required', 'consent_required', 'cancelled', 'popup_open_error', 'timeout', 'private-unknown-code'])('reports only a safe signing failure code: %s', async (code) => {
        const close = vi.fn();
        sdk.popupToken.mockRejectedValue(Object.assign(new Error('private identity and token details'), { error: code, popup: { close } }));
        await expect(createNearAuthLab('local-test-client').requestSigningAuthorization([1], 'delegateAction'))
            .rejects.toThrow(code === 'private-unknown-code' ? 'signing_approval_failed' : `signing_approval_${code}`);
        expect(sdk.token).not.toHaveBeenCalled();
        expect(close).toHaveBeenCalledTimes(code === 'timeout' ? 1 : 0);
    });
    it('does not mount the old wallet shell on the auth lab page', () => {
        const walletShell = () => { throw new Error('old_wallet_mounted'); };
        expect(renderToStaticMarkup(createElement(AuthLabBoundary, {
            lab: createElement('p', null, 'AUTH LAB'),
        }, createElement(walletShell)))).toBe('<main><p>AUTH LAB</p></main>');
    });

    it.each(['/', '/watch', '/profile', '/upload'])('preserves the normal application shell on %s', (pathname) => {
        navigation.pathname = pathname;
        const lab = () => { throw new Error('lab_mounted_outside_lab'); };
        expect(renderToStaticMarkup(createElement(AuthLabBoundary, {
            lab: createElement(lab),
        }, createElement('p', null, 'NORMAL APP')))).toBe('<p>NORMAL APP</p>');
    });

    it.each([
        ['production', 'true', 'testnet'], ['development', undefined, 'testnet'],
        ['development', 'false', 'testnet'], ['development', 'true', 'mainnet'],
    ])('returns 404 for %s / %s / %s without initializing the SDK', (environment, enabled, network) => {
        vi.stubEnv('NODE_ENV', environment);
        vi.stubEnv('NEAR_AUTH_LAB_ENABLED', enabled);
        vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', network);
        expect(() => NearAuthLabPage()).toThrow('not_found');
        expect(sdk.construct).not.toHaveBeenCalled();
    });

    it('requires a server session key before enabling login and never sends it as a page prop', () => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('NEAR_AUTH_LAB_ENABLED', 'true');
        vi.stubEnv('NEXT_PUBLIC_NEAR_NETWORK', 'testnet');
        vi.stubEnv('NEAR_AUTH_LAB_CLIENT_ID', 'local-test-client');
        vi.stubEnv('NEAR_AUTH_LAB_SESSION_SECRET', undefined);
        expect(nearAuthLabEnabled('development', 'true', 'testnet')).toBe(true);
        expect(NearAuthLabPage().props.clientId).toBeNull();
        vi.stubEnv('NEAR_AUTH_LAB_SESSION_SECRET', '11'.repeat(32));
        expect(NearAuthLabPage().props).toEqual({ clientId: 'local-test-client' });
    });

    it('restores the server session after recreating the client without loading Auth0 or persisting tokens', async () => {
        const first = createNearAuthLab('local-test-client');
        await expect(first.login()).resolves.toBe(true);
        const fresh = createNearAuthLab('local-test-client');
        const restored = fresh.restore();
        expect(fresh.restore()).toBe(restored);
        await expect(restored).resolves.toBe(true);
        expect(sdk.construct).toHaveBeenCalledOnce();
        expect(sdk.construct).toHaveBeenCalledWith({ domain: 'login.testnet.fast-auth.com', clientId: 'local-test-client', cacheLocation: 'memory' });
        expect(sessionFetch).toHaveBeenLastCalledWith('/api/auth-lab/session', { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
        expect(localStorage.setItem).not.toHaveBeenCalled();
        expect(sessionStorage.setItem).not.toHaveBeenCalled();
    });

    it('handles the callback once, establishes a verified server session and clears the query', async () => {
        window.location.search = '?code=fixture&state=fixture';
        const client = createNearAuthLab('local-test-client');
        const first = client.restore();
        expect(client.restore()).toBe(first);
        await expect(first).resolves.toBe(true);
        expect(sdk.callback).toHaveBeenCalledOnce();
        expect(sessionFetch).toHaveBeenCalledWith('/api/auth-lab/session', expect.objectContaining({ method: 'POST', body: JSON.stringify({ idToken: 'synthetic-id-token' }) }));
        expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '/auth-lab');
    });

    it.each(['?code=partial', '?state=partial', '?error=access_denied&error_description=private-data'])('rejects incomplete or denied callbacks: %s', async (search) => {
        window.location.search = search;
        await expect(createNearAuthLab('local-test-client').restore()).rejects.toThrow('near_auth_callback_failed');
        expect(sdk.construct).not.toHaveBeenCalled();
        expect(sessionFetch).not.toHaveBeenCalled();
        expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '/auth-lab');
    });

    it('never establishes a session after an invalid OAuth state', async () => {
        window.location.search = '?code=invalid&state=invalid';
        sdk.callback.mockRejectedValueOnce(new Error('Invalid state'));
        await expect(createNearAuthLab('local-test-client').restore()).rejects.toThrow('Invalid state');
        expect(sessionFetch).not.toHaveBeenCalled();
        expect(window.history.replaceState).toHaveBeenCalledOnce();
    });

    it('does not report success when the server rejects the identity token', async () => {
        sessionFetch.mockResolvedValueOnce(Response.json({ error: 'identity_not_verified' }, { status: 401 }));
        await expect(createNearAuthLab('local-test-client').login()).rejects.toThrow('near_auth_session_failed');
    });

    it('rejects malformed session responses instead of trusting a truthy value', async () => {
        sessionFetch.mockResolvedValueOnce(Response.json({ authenticated: 'true' }));
        await expect(createNearAuthLab('local-test-client').restore()).rejects.toThrow('near_auth_session_failed');
    });

    it('keeps redirect and logout destinations fixed and clears the server session first', async () => {
        window.location.search = '?returnTo=https://untrusted.example';
        const client = createNearAuthLab('local-test-client');
        await client.login(true);
        expect(sdk.redirect).toHaveBeenCalledWith({ authorizationParams: { redirect_uri: 'http://localhost:3000/auth-lab', prompt: 'login' } });
        expect(sessionFetch).not.toHaveBeenCalled();
        serverAuthenticated = true;
        await client.logout();
        expect(serverAuthenticated).toBe(false);
        expect(sdk.logout).toHaveBeenCalledWith({ logoutParams: { returnTo: 'http://localhost:3000' } });
        expect(sessionFetch.mock.invocationCallOrder[0]).toBeLessThan(sdk.logout.mock.invocationCallOrder[0]);
    });

    it('keeps the local logout truthful if provider logout fails afterward', async () => {
        serverAuthenticated = true;
        sdk.logout.mockRejectedValueOnce(new Error('provider unavailable'));
        await expect(createNearAuthLab('local-test-client').logout()).rejects.toThrow('near_auth_local_logout_complete');
        expect(serverAuthenticated).toBe(false);
        expect(device.suspend).toHaveBeenCalledOnce();
    });

    it('suspends playback after session writes, without removing the saved device', async () => {
        const auth = createNearAuthLab('local-test-client');
        await auth.login();
        expect(device.suspend).toHaveBeenCalledOnce();
        expect(sessionFetch.mock.invocationCallOrder[0]).toBeLessThan(device.suspend.mock.invocationCallOrder[0]);
        await auth.logout();
        expect(device.suspend).toHaveBeenCalledTimes(2);
        expect(device.suspend.mock.invocationCallOrder[1]).toBeLessThan(sdk.logout.mock.invocationCallOrder[0]);
    });

    it('keeps the verified job across redirect login using appState and a fixed callback', async () => {
        window.location.search = '?job=lp-job:1&returnTo=https://untrusted.example';
        await createNearAuthLab('local-test-client').login(true);
        expect(sdk.redirect).toHaveBeenCalledWith({ appState: { job: 'lp-job:1' }, authorizationParams: {
            redirect_uri: 'http://localhost:3000/auth-lab', prompt: 'login',
        } });
        window.location.search = '?code=fixture&state=fixture';
        sdk.callback.mockResolvedValue({ appState: { job: 'lp-job:1', returnTo: 'https://untrusted.example' } });
        await expect(createNearAuthLab('local-test-client').restore()).resolves.toBe(true);
        expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/auth-lab?job=lp-job%3A1');
    });

    it.each(['https://untrusted.example', '../bad', 'x'.repeat(129), {}, null])('discards untrusted callback job: %s', async job => {
        window.location.search = '?code=fixture&state=fixture';
        sdk.callback.mockResolvedValue({ appState: { job } });
        await createNearAuthLab('local-test-client').restore();
        expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/auth-lab');
    });

    it('keeps job links local and drops invalid identifiers', () => {
        expect(nearAuthJobHref('lp-job:1')).toBe('/auth-lab?job=lp-job%3A1');
        expect(nearAuthJobHref('https://untrusted.example')).toBe('/auth-lab');
    });

    it('does not clear the provider session when server logout failed', async () => {
        sessionFetch.mockResolvedValueOnce(Response.json({}, { status: 503 }));
        await expect(createNearAuthLab('local-test-client').logout()).rejects.toThrow('near_auth_session_failed');
        expect(sdk.logout).not.toHaveBeenCalled();
    });

    it('does not create a server session after cancellation or popup timeout', async () => {
        const close = vi.fn();
        sdk.login.mockRejectedValueOnce(Object.assign(new Error('Timeout'), { error: 'timeout', popup: { close } }));
        await expect(createNearAuthLab('local-test-client').login()).rejects.toThrow('near_auth_login_timeout');
        expect(close).toHaveBeenCalledOnce();
        sdk.login.mockRejectedValueOnce(new Error('popup_closed'));
        await expect(createNearAuthLab('local-test-client').login()).rejects.toThrow('popup_closed');
        expect(sessionFetch).not.toHaveBeenCalled();
    });

    it('rejects invalid client configuration before loading Auth0', () => {
        expect(() => createNearAuthLab('')).toThrow('near_auth_lab_not_configured');
        expect(() => createNearAuthLab('https://untrusted.example')).toThrow('near_auth_lab_not_configured');
        expect(sdk.construct).not.toHaveBeenCalled();
    });
});

import { authReturnPath } from '@/lib/near-auth-product';
it.each(['https://evil.invalid', '//evil.invalid', '/watch?job=../bad', '/watch?job=ok&returnTo=evil', '/watch?job=%ZZ', '/profile/../evil',
    '/upload?job=../bad', '/upload?job=ok&returnTo=evil', '/upload?job=%ZZ', '/upload?job=',
    '/upload?job=%2F%2Fevil.invalid', '/upload?job=%252F', '/upload?job=ok#other', `/upload?job=${'a'.repeat(129)}`,
])('keeps product callback return paths local: %s', path => {
    expect(authReturnPath(path)).toBe('/profile');
});
it.each(['/profile', '/upload'])('preserves the plain product return path: %s', path => {
    expect(authReturnPath(path)).toBe(path);
});
it.each(['/watch', '/upload'])('preserves the job through product redirect login and callback: %s', async path => {
    Object.assign(window.location, { pathname: path, search: '?job=lp-job:1' });
    await createNearAuthLab('local-test-client', 'product').login(true);
    expect(sdk.redirect).toHaveBeenCalledWith({ appState: { returnTo: `${path}?job=lp-job%3A1` }, authorizationParams: {
        redirect_uri: 'http://localhost:3000', prompt: 'login',
    } });
    expect(sessionFetch).not.toHaveBeenCalled();
    window.location.pathname = '/auth/callback';
    window.location.search = '?code=fixture&state=fixture';
    sdk.callback.mockResolvedValue({ appState: sdk.redirect.mock.calls[0][0].appState });
    const auth = createNearAuthLab('local-test-client', 'product');
    await expect(auth.restore()).resolves.toBe(true);
    expect(auth.returnPath()).toBe(`${path}?job=lp-job%3A1`);
    expect(sessionFetch).toHaveBeenCalledWith('/api/auth/session', expect.objectContaining({ method: 'POST' }));
    expect(window.history.replaceState).toHaveBeenLastCalledWith(null, '', '/auth/callback');
});
it('cancels a stale popup before it creates an application session', async () => {
    let finish!: () => void;
    sdk.login.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    const auth = createNearAuthLab('local-test-client', 'product');
    const login = auth.login();
    await vi.waitFor(() => expect(sdk.login).toHaveBeenCalledOnce());
    auth.cancelLogin(); finish();
    await expect(login).rejects.toThrow('near_auth_login_cancelled');
    expect(sessionFetch).not.toHaveBeenCalled();
});
it('orders logout after an already submitted session write', async () => {
    let finish!: (response: Response) => void;
    sessionFetch.mockImplementation(async (_url, options) => options.method === 'POST'
        ? new Promise<Response>(resolve => { finish = resolve; }) : Response.json({ authenticated: false }));
    const auth = createNearAuthLab('local-test-client', 'product');
    const login = auth.login();
    const rejectedLogin = expect(login).rejects.toThrow('near_auth_login_cancelled');
    await vi.waitFor(() => expect(sessionFetch).toHaveBeenCalledOnce());
    const logout = auth.logout();
    expect(sessionFetch).toHaveBeenCalledOnce();
    finish(Response.json({ authenticated: true }));
    await rejectedLogin; await logout;
    expect(sessionFetch.mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'DELETE']);
});
