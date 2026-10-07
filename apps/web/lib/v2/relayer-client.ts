// Browser client for workers/relayer. During sign-in the same id_token opens the account, redeems
// an invite (when the page carries one) and requests the CKD key. The token is sent only to the
// relayer and never stored.
import type { CkdRequestSubmitter } from '../near-auth/ckd-sign-in';
import type { CkdGateResult } from '../ticket-keys/ckd';

export interface RelayerClientOptions {
    relayerUrl: string;
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    /** Number of follow-up requests while the relayer answers 202 (transaction still settling). */
    pendingRetries?: number;
}

export interface InviteResult {
    amountMicro: string;
    paid: boolean;
}

export class RelayerError extends Error {
    constructor(code: string, readonly status: number) {
        super(code);
    }
}

const RETRY_MS = 3_000;

export function createRelayerClient(options: RelayerClientOptions) {
    const fetcher = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
    const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    const retries = options.pendingRetries ?? 20;

    async function post(path: string, body: unknown): Promise<{ status: number; value: Record<string, unknown> }> {
        for (let attempt = 0; ; attempt += 1) {
            let response: Response;
            try {
                response = await fetcher(`${options.relayerUrl}${path}`, {
                    method: 'POST', cache: 'no-store', credentials: 'omit',
                    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
                    signal: AbortSignal.timeout(45_000),
                });
            } catch {
                throw new RelayerError('relayer_unavailable', 0);
            }
            const value = await response.json().catch(() => ({})) as Record<string, unknown>;
            if (response.status === 202 && attempt < retries) {
                await sleep(RETRY_MS);
                continue;
            }
            if (response.status === 202) throw new RelayerError('relayer_pending', 202);
            if (!response.ok) {
                const code = typeof value.error === 'string' && /^[a-z_]{1,64}$/.test(value.error) ? value.error : 'relayer_failed';
                throw new RelayerError(code, response.status);
            }
            return { status: response.status, value };
        }
    }

    async function ensureAccount(idToken: string): Promise<string> {
        const { value } = await post('/v1/accounts', { id_token: idToken });
        if (value.ready !== true || typeof value.accountId !== 'string' || !/^[0-9a-f]{64}$/.test(value.accountId)) {
            throw new RelayerError('relayer_failed', 200);
        }
        return value.accountId;
    }

    async function redeemInvite(idToken: string, code: string): Promise<InviteResult> {
        const { value } = await post('/v1/invites/redeem', { id_token: idToken, code });
        if (typeof value.amountMicro !== 'string' || value.paid !== true) throw new RelayerError('relayer_failed', 200);
        return { amountMicro: value.amountMicro, paid: true };
    }

    async function requestCkd(request: Parameters<CkdRequestSubmitter>[0]): Promise<CkdGateResult> {
        const { value } = await post('/v1/ckd', { gate_account_id: request.gateAccountId, args: request.args });
        const result = value.result as CkdGateResult | undefined;
        if (!result || typeof result !== 'object') throw new RelayerError('relayer_failed', 200);
        return result;
    }

    return { ensureAccount, redeemInvite, requestCkd };
}

/**
 * The submitter used by `signInWithCkd`: account first (so the user has a funded, USDC-registered
 * account), then the optional invite, then the CKD request.
 */
export function relayerSubmitter(
    client: ReturnType<typeof createRelayerClient>,
    options: { inviteCode?: string; onInvite?: (result: InviteResult | { error: string }) => void } = {},
): CkdRequestSubmitter {
    return async (request) => {
        await client.ensureAccount(request.args.jwt);
        if (options.inviteCode) {
            // An invite problem (used, expired, pending) is reported but never blocks sign-in.
            try {
                options.onInvite?.(await client.redeemInvite(request.args.jwt, options.inviteCode));
            } catch (error) {
                options.onInvite?.({ error: error instanceof Error ? error.message : 'relayer_failed' });
            }
        }
        return client.requestCkd(request);
    };
}
