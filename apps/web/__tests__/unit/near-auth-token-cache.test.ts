import { expect, it, vi } from 'vitest';
import { Auth0Client } from '@auth0/auth0-spa-js';

vi.unmock('@auth0/auth0-spa-js');

it('keeps the original root redirect URI and state checks after a same-origin callback handoff', async () => {
    const originalFetch = window.fetch;
    const noNetwork = vi.fn(async () => { throw new Error('network_forbidden'); });
    window.fetch = noNetwork;
    try {
        const client = new Auth0Client({ domain: 'synthetic.invalid', clientId: 'synthetic-root', cacheLocation: 'memory' });
        const internals = client as unknown as {
            transactionManager: { create(transaction: object): void };
            _requestToken(...args: unknown[]): Promise<unknown>;
        };
        const exchange = vi.spyOn(internals, '_requestToken').mockResolvedValue({});
        const transaction = { nonce: 'synthetic-nonce', scope: 'openid', audience: 'default', response_type: 'code',
            state: 'synthetic-state', code_verifier: 'synthetic-verifier', redirect_uri: 'http://localhost:3000',
            appState: { returnTo: '/upload?job=existing' } };
        const callback = 'http://localhost:3000/auth/callback?code=synthetic&state=synthetic-state';
        internals.transactionManager.create(transaction);
        await expect(client.handleRedirectCallback(callback.replace('state=synthetic-state', 'state=wrong'))).rejects.toThrow('Invalid state');
        expect(exchange).not.toHaveBeenCalled();
        internals.transactionManager.create(transaction);
        expect((await client.handleRedirectCallback(callback)).appState).toEqual(transaction.appState);
        expect(exchange).toHaveBeenCalledWith(expect.objectContaining({ redirect_uri: transaction.redirect_uri,
            code_verifier: transaction.code_verifier, code: 'synthetic' }), expect.objectContaining({ nonceIn: transaction.nonce }));
        await expect(client.handleRedirectCallback(callback)).rejects.toThrow('Invalid state');
        expect(exchange).toHaveBeenCalledOnce();
        expect(noNetwork).not.toHaveBeenCalled();
    } finally { window.fetch = originalFetch; vi.restoreAllMocks(); }
});

it('the installed SDK returns a valid short-lived popup token while silent cache lookup discards it', async () => {
    const originalFetch = window.fetch;
    const noNetwork = vi.fn(async () => { throw new Error('network_forbidden'); });
    window.fetch = noNetwork;
    try {
        const client = new Auth0Client({ domain: 'synthetic.invalid', clientId: 'synthetic', cacheLocation: 'memory', nowProvider: () => 1700000000000 });
        // Exercise the installed SDK cache, not a reimplementation of its expiration rules.
        const internals = client as unknown as {
            cacheManager: { set(entry: object): Promise<void> };
            _getEntryFromCache(input: { audience: string; scope: string; clientId: string }): Promise<unknown>;
        };
        let scope = '';
        vi.spyOn(client, 'loginWithPopup').mockImplementation(async (options) => {
            scope = options!.authorizationParams!.scope!;
            await internals.cacheManager.set({ client_id: 'synthetic', audience: 'signing-audience', scope,
                access_token: 'synthetic-short-token', expires_in: 30 });
        });
        expect(await client.getTokenWithPopup({ authorizationParams: { audience: 'signing-audience', scope: 'transaction:sign', delegateAction: [1, 2, 3] } }))
            .toBe('synthetic-short-token');
        expect(await internals._getEntryFromCache({ audience: 'signing-audience', scope, clientId: 'synthetic' })).toBeUndefined();
        expect(noNetwork).not.toHaveBeenCalled();
    } finally { window.fetch = originalFetch; vi.restoreAllMocks(); }
});
