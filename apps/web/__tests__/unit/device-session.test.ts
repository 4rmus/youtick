import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('near-api-js', async () => {
    const actual = await vi.importActual<typeof import('near-api-js')>('near-api-js');
    return { baseEncode: actual.baseEncode, baseDecode: actual.baseDecode };
});
const config = vi.hoisted(() => ({
    APP_CONFIG: { publicAppUrl: 'https://app.youtick.net' },
    NEAR_CONFIG: { marketContractId: 'market.testnet' },
    NEAR_NETWORK: 'testnet',
}));
vi.mock('@/lib/constants', () => config);
const chain = vi.hoisted(() => ({ view: vi.fn() }));
vi.mock('@/lib/near', () => ({ getProvider: () => ({}), viewContract: chain.view }));

// Only the IDB transaction adapter is mocked here. CryptoKey generation, cloning,
// signing, verification and export rejection use the real Node WebCrypto API.
function installStore() {
    const databases = new Map<string, Map<string, unknown>>();
    let serial = Promise.resolve();
    vi.stubGlobal('indexedDB', {
        open(name: string) {
            const request = {} as IDBOpenDBRequest;
            queueMicrotask(() => {
                if (!databases.has(name)) databases.set(name, new Map());
                Object.assign(request, { result: {
                    close() {},
                    transaction() {
                        const tx: Record<string, unknown> = {};
                        let aborted = false;
                        const jobs: Array<() => void> = [];
                        let data: Map<string, unknown>;
                        const store = {
                            get(key: string) {
                                const req: Record<string, unknown> = {};
                                jobs.push(() => { req.result = structuredClone(data.get(key)); (req.onsuccess as (() => void))?.(); });
                                return req;
                            },
                            put(value: unknown, key: string) { jobs.push(() => data.set(key, structuredClone(value))); },
                            clear() { jobs.push(() => data.clear()); },
                        };
                        tx.objectStore = () => store;
                        tx.abort = () => { aborted = true; };
                        serial = serial.then(() => {
                            data = new Map(databases.get(name));
                            while (jobs.length && !aborted) jobs.shift()!();
                            if (aborted) (tx.onabort as (() => void))?.();
                            else { databases.set(name, data); (tx.oncomplete as (() => void))?.(); }
                        });
                        return tx;
                    },
                } });
                request.onsuccess?.(new Event('success'));
            });
            return request;
        },
    });
    return databases;
}

const proof = () => ({
    accountId: 'buyer.testnet',
    publicKey: 'ed25519:11111111111111111111111111111111',
    signature: btoa(String.fromCharCode(...new Uint8Array(64).fill(7))),
});

describe('device session', () => {
    let databases: ReturnType<typeof installStore>;
    beforeEach(() => {
        vi.useRealTimers();
        vi.resetModules();
        config.NEAR_NETWORK = 'testnet';
        config.NEAR_CONFIG.marketContractId = 'market.testnet';
        config.APP_CONFIG.publicAppUrl = 'https://app.youtick.net';
        databases = installStore();
        chain.view.mockReset().mockResolvedValue(null);
    });

    it('reuses one non-extractable eight-hour key after reload and coalesces parallel preparation', async () => {
        const wallet = { signMessage: vi.fn().mockResolvedValue(proof()) };
        const { ensureDeviceSession, getDeviceSession } = await import('@/lib/device-session');
        const [first, second] = await Promise.all([
            ensureDeviceSession(wallet, 'buyer.testnet'), ensureDeviceSession(wallet, 'buyer.testnet'),
        ]);
        expect(first).toBe(second);
        expect(wallet.signMessage).toHaveBeenCalledOnce();
        expect(first.certificate).toMatchObject({ version: '2', contract_id: 'market.testnet', scopes: ['play'] });
        expect(first.certificate).not.toHaveProperty('account_id');
        if (first.certificate.version !== '2') throw new Error('Expected legacy certificate');
        expect(Number(('expires_at_ms' in first.certificate) ? first.certificate.expires_at_ms : 0) - Number(first.certificate.issued_at_ms)).toBe(28_800_000);
        expect(first).not.toHaveProperty('secret_key');
        expect(first.privateKey.extractable).toBe(false);
        await expect(crypto.subtle.exportKey('pkcs8', first.privateKey)).rejects.toThrow();
        await expect(crypto.subtle.exportKey('jwk', first.privateKey)).rejects.toThrow();
        expect(await getDeviceSession('other.testnet')).toBeNull();
        vi.resetModules();
        const reloaded = await import('@/lib/device-session');
        const restored = await reloaded.ensureDeviceSession(wallet, 'buyer.testnet');
        expect(restored.certificate).toEqual(first.certificate);
        expect(restored.privateKey.extractable).toBe(false);
        expect(wallet.signMessage).toHaveBeenCalledOnce();
        expect(localStorage.setItem).not.toHaveBeenCalled();
        expect(sessionStorage.setItem).not.toHaveBeenCalled();
    });

    it('binds the selected account from a combined sign-in proof', async () => {
        const { connectDeviceSession, getDeviceSession } = await import('@/lib/device-session');
        const sign = vi.fn().mockResolvedValue(proof());
        await connectDeviceSession(sign);
        expect(sign).toHaveBeenCalledOnce();
        expect(sign.mock.calls[0][0]).toMatchObject({ recipient: 'market.testnet', nonce: expect.any(Uint8Array) });
        expect((await getDeviceSession('buyer.testnet'))?.certificate_proof.account_id).toBe('buyer.testnet');
    });

    it('does not restore a session from another network, Market or site', async () => {
        const api = await import('@/lib/device-session');
        await api.ensureDeviceSession({ signMessage: vi.fn().mockResolvedValue(proof()) }, 'buyer.testnet');
        config.NEAR_NETWORK = 'mainnet';
        expect(await api.getDeviceSession('buyer.testnet')).toBeNull();
        config.NEAR_NETWORK = 'testnet';
        config.NEAR_CONFIG.marketContractId = 'other.testnet';
        expect(await api.getDeviceSession('buyer.testnet')).toBeNull();
        config.NEAR_CONFIG.marketContractId = 'market.testnet';
        config.APP_CONFIG.publicAppUrl = 'https://other.youtick.net';
        expect(await api.getDeviceSession('buyer.testnet')).toBeNull();
    });

    it.each(['expired', 'wrong account', 'wrong network', 'wrong Market', 'wrong site', 'mismatched key', 'extractable key'])(
        'deletes a stored %s session', async (invalid) => {
            const api = await import('@/lib/device-session');
            await api.ensureDeviceSession({ signMessage: vi.fn().mockResolvedValue(proof()) }, 'buyer.testnet');
            const store = [...databases.values()][0];
            const session = store.get('account:buyer.testnet') as Awaited<ReturnType<typeof api.ensureDeviceSession>>;
            if (session.certificate.version !== '2') throw new Error('Expected legacy certificate');
            if (invalid === 'expired') vi.spyOn(Date, 'now').mockReturnValue(Number(session.certificate.expires_at_ms));
            if (invalid === 'wrong account') session.certificate_proof.account_id = 'other.testnet';
            if (invalid === 'wrong network') session.certificate.network = 'mainnet';
            if (invalid === 'wrong Market') session.certificate.contract_id = 'other.testnet';
            if (invalid === 'wrong site') session.certificate.origin_hash = 'a'.repeat(64);
            if (invalid.endsWith('key')) session.privateKey = (await crypto.subtle.generateKey('Ed25519', invalid === 'extractable key', ['sign', 'verify']) as CryptoKeyPair).privateKey;
            expect(await api.getDeviceSession('buyer.testnet')).toBeNull();
            expect([...databases.values()][0].has('account:buyer.testnet')).toBe(false);
            vi.restoreAllMocks();
        },
    );

    it.each(['logout', 'abort', 'other tab'])('rejects a late proof after %s and permits a new explicit attempt', async (reason) => {
        const api = await import('@/lib/device-session');
        let finish!: (value: ReturnType<typeof proof>) => void;
        const wallet = { signMessage: vi.fn(() => new Promise<ReturnType<typeof proof>>((resolve) => { finish = resolve; })) };
        const controller = new AbortController();
        const request = api.ensureDeviceSession(wallet, 'buyer.testnet', controller.signal);
        const rejected = expect(request).rejects.toThrow('device_session_cancelled');
        await vi.waitFor(() => expect(wallet.signMessage).toHaveBeenCalledOnce());
        if (reason === 'abort') controller.abort();
        else if (reason === 'other tab') {
            vi.resetModules();
            await (await import('@/lib/device-session')).clearDeviceSession();
        } else await api.clearDeviceSession();
        finish(proof());
        await rejected;
        expect(await api.getDeviceSession('buyer.testnet')).toBeNull();
        await api.ensureDeviceSession({ signMessage: vi.fn().mockResolvedValue(proof()) }, 'buyer.testnet');
        expect(await api.getDeviceSession('buyer.testnet')).not.toBeNull();
    });

    it('does not persist wrong-account proofs or automatically retry a rejected wallet', async () => {
        const api = await import('@/lib/device-session');
        const wallet = { signMessage: vi.fn().mockResolvedValue({ ...proof(), accountId: 'other.testnet' }) };
        await expect(api.ensureDeviceSession(wallet, 'buyer.testnet')).rejects.toThrow('device_session_wallet_proof_invalid');
        wallet.signMessage.mockRejectedValue(new Error('User rejected'));
        await expect(api.ensureDeviceSession(wallet, 'buyer.testnet')).rejects.toThrow('User rejected');
        expect(wallet.signMessage).toHaveBeenCalledTimes(2);
        expect(await api.getDeviceSession('buyer.testnet')).toBeNull();
    });

    it('verifies an expired stored session in one new explicit attempt', async () => {
        const api = await import('@/lib/device-session');
        const wallet = { signMessage: vi.fn().mockResolvedValue(proof()) };
        const original = await api.ensureDeviceSession(wallet, 'buyer.testnet');
        if (original.certificate.version !== '2') throw new Error('Expected legacy certificate');
        vi.spyOn(Date, 'now').mockReturnValue(Number(original.certificate.expires_at_ms));
        const renewed = await api.ensureDeviceSession(wallet, 'buyer.testnet');
        if (renewed.certificate.version !== '2') throw new Error('Expected legacy certificate');
        expect(renewed.certificate.issued_at_ms).toBe(original.certificate.expires_at_ms);
        expect(wallet.signMessage).toHaveBeenCalledTimes(2);
        vi.restoreAllMocks();
    });

    it('rejects malformed account metadata from a combined wallet response', async () => {
        const api = await import('@/lib/device-session');
        const sign = vi.fn().mockResolvedValue({ ...proof(), accountId: 123 });
        await expect(api.connectDeviceSession(sign)).rejects.toThrow('device_session_wallet_proof_invalid');
        expect(await api.getDeviceSession('123')).toBeNull();
    });

    it('fails closed before opening a wallet when Ed25519 is unsupported', async () => {
        const generate = vi.spyOn(crypto.subtle, 'generateKey').mockRejectedValue(new Error('Not supported'));
        const wallet = { signMessage: vi.fn() };
        const api = await import('@/lib/device-session');
        await expect(api.ensureDeviceSession(wallet, 'buyer.testnet')).rejects.toThrow('device_session_crypto_unavailable');
        expect(wallet.signMessage).not.toHaveBeenCalled();
        generate.mockRestore();
    });

    it('fails closed before opening a wallet when secure storage is unavailable', async () => {
        vi.stubGlobal('indexedDB', undefined);
        const wallet = { signMessage: vi.fn() };
        const api = await import('@/lib/device-session');
        await expect(api.ensureDeviceSession(wallet, 'buyer.testnet')).rejects.toThrow('device_session_storage_unavailable');
        expect(wallet.signMessage).not.toHaveBeenCalled();
    });
    it('persists one payment device across tabs and reload before any wallet call', async () => {
        const api = await import('@/lib/device-session');
        const first = api.preparePlaybackDevice('buyer.testnet');
        vi.resetModules();
        const otherTab = await import('@/lib/device-session');
        const [a, b] = await Promise.all([first, otherTab.preparePlaybackDevice('buyer.testnet')]);
        expect(a).toEqual(b);
        expect(a.authorization_duration_ms).toBe('2592000000');
        expect(await api.getDeviceSession('buyer.testnet')).toBeNull();
        const stored = [...databases.values()][0].get('account:buyer.testnet') as { privateKey: CryptoKey };
        expect(stored.privateKey.extractable).toBe(false);
        await expect(crypto.subtle.exportKey('jwk', stored.privateKey)).rejects.toThrow();
        const now = Date.now();
        chain.view.mockResolvedValue({ ...a, authorized_at_ms: String(now), expires_at_ms: String(now + 30 * 86400000) });
        const restored = await otherTab.getDeviceSession('buyer.testnet');
        expect(restored?.certificate.session_public_key).toBe(a.session_public_key);
        expect(chain.view).toHaveBeenLastCalledWith({}, 'market.testnet', 'get_playback_device', {
            account_id: 'buyer.testnet', session_public_key: a.session_public_key,
        });
    });

    it('restores a cold page after logout and reauthorization without stopping playback', async () => {
        const api = await import('@/lib/device-session');
        await api.clearDeviceSession();
        const authorization = await api.preparePlaybackDevice('buyer.testnet');
        const now = Date.now();
        chain.view.mockResolvedValue({
            ...authorization, authorized_at_ms: String(now), expires_at_ms: String(now + 30 * 86400000),
        });
        vi.resetModules();
        const reloaded = await import('@/lib/device-session');
        const controller = new AbortController();
        const cleared = vi.fn(() => controller.abort());
        const unsubscribe = reloaded.onDeviceSessionCleared(cleared);
        try {
            const restored = await reloaded.getDeviceSession('buyer.testnet');
            expect(restored?.certificate.session_public_key).toBe(authorization.session_public_key);
            expect(restored?.privateKey.extractable).toBe(false);
            expect(controller.signal.aborted).toBe(false);
            expect(cleared).not.toHaveBeenCalled();
        } finally { unsubscribe(); }
    });

    it('still observes a missed logout and ignores its later duplicate broadcast', async () => {
        const originalBroadcastChannel = globalThis.BroadcastChannel;
        const channels: Array<{ onmessage?: (event: { data: number }) => void }> = [];
        vi.stubGlobal('BroadcastChannel', class {
            onmessage?: (event: { data: number }) => void;
            constructor() { channels.push(this); }
            postMessage() {}
        });
        try {
            const api = await import('@/lib/device-session');
            await api.getDeviceSession('buyer.testnet');
            const cleared = vi.fn();
            api.onDeviceSessionCleared(cleared);
            vi.resetModules();
            const otherTab = await import('@/lib/device-session');
            await otherTab.clearDeviceSession();
            expect(cleared).not.toHaveBeenCalled();
            expect(await api.getDeviceSession('buyer.testnet')).toBeNull();
            expect(cleared).toHaveBeenCalledOnce();
            channels[0].onmessage?.({ data: 1 });
            expect(cleared).toHaveBeenCalledOnce();

            // A real broadcast must also stop a fresh subscriber before its first read.
            vi.resetModules();
            const coldTab = await import('@/lib/device-session');
            const coldCleared = vi.fn();
            coldTab.onDeviceSessionCleared(coldCleared);
            await otherTab.clearDeviceSession();
            channels.at(-1)?.onmessage?.({ data: 2 });
            expect(coldCleared).toHaveBeenCalledOnce();
            expect(await coldTab.getDeviceSession('buyer.testnet')).toBeNull();
        } finally { vi.stubGlobal('BroadcastChannel', originalBroadcastChannel); }
    });

    it('reconciles a day-20 renewal after reload without changing key or inventing expiry', async () => {
        const now = Date.now();
        const time = vi.spyOn(Date, 'now').mockReturnValue(now);
        const api = await import('@/lib/device-session');
        const a = await api.preparePlaybackDevice('buyer.testnet');
        chain.view.mockResolvedValue({ ...a, authorized_at_ms: String(now), expires_at_ms: String(now + 30 * 86400000) });
        time.mockReturnValue(now + 20 * 86400000);
        expect(await api.preparePlaybackDevice('buyer.testnet')).toEqual(a);
        expect(await api.getDeviceSession('buyer.testnet')).not.toBeNull();
        // Only a changed final chain record represents the successful new payment.
        chain.view.mockResolvedValue({ ...a, authorized_at_ms: String(now + 20 * 86400000), expires_at_ms: String(now + 50 * 86400000) });
        vi.resetModules();
        const reloaded = await import('@/lib/device-session');
        time.mockReturnValue(now + 49 * 86400000);
        expect(await reloaded.getDeviceSession('buyer.testnet')).not.toBeNull();
        time.mockReturnValue(now + 50 * 86400000);
        expect(await reloaded.getDeviceSession('buyer.testnet')).toBeNull();
        expect(await reloaded.preparePlaybackDevice('buyer.testnet')).toEqual(a);
        time.mockRestore();
    });

    it('rejects wrong or unavailable chain authorization and a late read after logout', async () => {
        const api = await import('@/lib/device-session');
        const a = await api.preparePlaybackDevice('buyer.testnet');
        chain.view.mockResolvedValue({ ...a, certificate_sha256: 'a'.repeat(64) });
        expect(await api.getDeviceSession('buyer.testnet')).toBeNull();
        chain.view.mockRejectedValue(new Error('RPC unavailable'));
        await expect(api.getDeviceSession('buyer.testnet')).rejects.toThrow('playback_authorization_unavailable');
        expect(await api.preparePlaybackDevice('buyer.testnet')).toEqual(a);
        let finish!: (value: unknown) => void;
        chain.view.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
        const loading = api.getDeviceSession('buyer.testnet');
        await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
        await api.clearDeviceSession();
        finish(null);
        await expect(loading).rejects.toThrow('device_session_cancelled');
        expect(await api.getDeviceSession('buyer.testnet')).toBeNull();
    });

});
