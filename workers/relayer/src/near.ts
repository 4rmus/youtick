// Minimal NEAR JSON-RPC client for the relayer. Every read uses final state.
import { baseDecode, baseEncode } from 'near-api-js';

/**
 * `failed` only ever means a final transaction status with `Failure`. `expired` and `invalid_nonce`
 * come from `send_tx` validation; `not_found` from `tx` (UNKNOWN_TRANSACTION). Every other error,
 * timeout or unexpected shape is `unknown` and must never be read as "did not happen".
 */
export type TxOutcome =
    | { kind: 'success'; value: string | null }
    | { kind: 'failed' }
    | { kind: 'expired' }
    | { kind: 'invalid_nonce' }
    | { kind: 'not_found' }
    | { kind: 'unknown' };

export interface NearClient {
    view<T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T>;
    accountExists(accountId: string): Promise<boolean>;
    accessKey(accountId: string, publicKey: string): Promise<{ nonce: bigint; blockHash: string; fullAccess: boolean }>;
    sendTx(signedTxBase64: string): Promise<TxOutcome>;
    txStatus(txHash: string, senderId: string): Promise<TxOutcome>;
}

function base64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function errorName(error: unknown): string {
    const value = error as { name?: unknown; cause?: { name?: unknown; info?: unknown } } | null;
    return typeof value?.cause?.name === 'string' ? value.cause.name : typeof value?.name === 'string' ? value.name : '';
}

export function classifySendError(error: unknown): TxOutcome {
    const text = JSON.stringify(error);
    if (errorName(error) === 'EXPIRED_TRANSACTION' || /"Expired"|EXPIRED_TRANSACTION/.test(text)) return { kind: 'expired' };
    if (/InvalidNonce/.test(text)) return { kind: 'invalid_nonce' };
    return { kind: 'unknown' };
}

export function classifyStatusError(error: unknown): TxOutcome {
    return errorName(error) === 'UNKNOWN_TRANSACTION' ? { kind: 'not_found' } : { kind: 'unknown' };
}

function outcomeFromResult(result: unknown): TxOutcome {
    const status = (result as { status?: unknown } | null)?.status;
    if (!status || typeof status !== 'object' || Array.isArray(status)) return { kind: 'unknown' };
    if ('Failure' in status) return { kind: 'failed' };
    if ('SuccessValue' in status) {
        const value = (status as { SuccessValue: unknown }).SuccessValue;
        return typeof value === 'string' ? { kind: 'success', value } : { kind: 'unknown' };
    }
    if ('SuccessReceiptId' in status) return { kind: 'success', value: null };
    return { kind: 'unknown' };
}

export function createNearClient(rpcUrl: string, fetcher: typeof fetch = (...args) => fetch(...args)): NearClient {
    async function rpc(method: string, params: unknown, timeoutMs = 10_000): Promise<{ result?: unknown; error?: unknown }> {
        let response: Response;
        try {
            response = await fetcher(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: `relayer-${method}`, method, params }),
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch {
            throw new Error('rpc_unavailable');
        }
        if (!response.ok) throw new Error('rpc_unavailable');
        const body = await response.json().catch(() => null) as { result?: unknown; error?: unknown } | null;
        if (!body || typeof body !== 'object') throw new Error('rpc_unavailable');
        return body;
    }

    async function query(params: Record<string, unknown>, allowUnknownAccount = false) {
        const body = await rpc('query', { ...params, finality: 'final' });
        const cause = JSON.stringify(body.error ?? (body.result as { error?: unknown } | undefined)?.error ?? '');
        if (allowUnknownAccount && /UNKNOWN_ACCOUNT|does not exist while viewing/.test(cause)) return null;
        if (body.error || !body.result || typeof body.result !== 'object' || 'error' in body.result) throw new Error('rpc_unavailable');
        return body.result as Record<string, unknown>;
    }

    return {
        async view<T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T> {
            const result = await query({
                request_type: 'call_function', account_id: contractId, method_name: method,
                args_base64: base64(new TextEncoder().encode(JSON.stringify(args))),
            });
            const bytes = result?.result;
            if (!Array.isArray(bytes) || bytes.length > 64 * 1024
                || !bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
                throw new Error('rpc_unavailable');
            }
            return JSON.parse(new TextDecoder().decode(Uint8Array.from(bytes as number[]))) as T;
        },
        async accountExists(accountId) {
            return (await query({ request_type: 'view_account', account_id: accountId }, true)) !== null;
        },
        async accessKey(accountId, publicKey) {
            const result = await query({ request_type: 'view_access_key', account_id: accountId, public_key: publicKey });
            if (!result || typeof result.nonce !== 'number' || !Number.isSafeInteger(result.nonce)
                || typeof result.block_hash !== 'string') {
                throw new Error('rpc_unavailable');
            }
            return { nonce: BigInt(result.nonce), blockHash: result.block_hash, fullAccess: result.permission === 'FullAccess' };
        },
        async sendTx(signedTxBase64) {
            try {
                // Returns early; the outcome is read with `tx`, outside the relayer's signing lock.
                const body = await rpc('send_tx', { signed_tx_base64: signedTxBase64, wait_until: 'NONE' }, 10_000);
                return body.error ? classifySendError(body.error) : outcomeFromResult(body.result);
            } catch {
                return { kind: 'unknown' };
            }
        },
        async txStatus(txHash, senderId) {
            try {
                // EXECUTED_OPTIMISTIC: CKD settles through MPC yield/resume, which can outlast a FINAL wait.
                const body = await rpc('tx', { tx_hash: txHash, sender_account_id: senderId, wait_until: 'EXECUTED_OPTIMISTIC' }, 10_000);
                return body.error ? classifyStatusError(body.error) : outcomeFromResult(body.result);
            } catch {
                return { kind: 'unknown' };
            }
        },
    };
}

export interface FastAuthProvider {
    issuer: string;
    fastAuthContractId: string;
    mpcContractId: string;
    fastAuthDomainId: number;
}

/** The fast-auth implicit account for an identity (hex of the MPC key derived at `jwt#<iss>#<sub>`). */
export async function fastAuthAccount(near: NearClient, provider: FastAuthProvider, sub: string): Promise<string> {
    const [paused, mpcAddress, mpcDomain] = await Promise.all([
        near.view<unknown>(provider.fastAuthContractId, 'paused', {}),
        near.view<unknown>(provider.fastAuthContractId, 'mpc_address', {}),
        near.view<unknown>(provider.fastAuthContractId, 'mpc_domain_id', {}),
    ]);
    if (paused !== false || mpcAddress !== provider.mpcContractId || mpcDomain !== provider.fastAuthDomainId) {
        throw new Error('provider_configuration_changed');
    }
    const derived = await near.view<unknown>(provider.mpcContractId, 'derived_public_key', {
        path: `jwt#${provider.issuer}#${sub}`, predecessor: provider.fastAuthContractId, domain_id: provider.fastAuthDomainId,
    });
    if (typeof derived !== 'string' || !derived.startsWith('ed25519:')) throw new Error('invalid_public_key');
    let raw: Uint8Array;
    try {
        raw = baseDecode(derived.slice('ed25519:'.length));
    } catch {
        throw new Error('invalid_public_key');
    }
    if (raw.length !== 32 || `ed25519:${baseEncode(raw)}` !== derived) throw new Error('invalid_public_key');
    return Array.from(raw, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
