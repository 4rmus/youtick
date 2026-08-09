import { KeyPair, PublicKey, actions } from 'near-api-js';
import { GAS_CONSTANTS, NEAR_CONFIG, NEAR_NETWORK } from './constants';
import { getProvider } from './near';
import { nearAmountToYocto } from './near-amount';
import type { WalletInstance } from './types';

const SIGNLESS_ACCESS_KEY_METHODS = ['issue_session_grant'] as const;
const SIGNLESS_ACCESS_KEY_ALLOWANCE_YOCTO = nearAmountToYocto(GAS_CONSTANTS.sessionKeyAllowance);
// Below this remaining allowance a grant call may no longer fit; reprovision.
const SIGNLESS_ACCESS_KEY_MIN_ALLOWANCE_YOCTO = nearAmountToYocto(0.01);

const SIGNLESS_KEY_STORAGE_PREFIX = 'youtick:signless-keystore:';

function signlessKeyStorageKey(accountId: string): string {
    return `${SIGNLESS_KEY_STORAGE_PREFIX}${accountId}:${NEAR_NETWORK}`;
}

function clearLegacyPersistentKey(accountId: string): void {
    if (typeof window !== 'undefined') {
        window.localStorage.removeItem(signlessKeyStorageKey(accountId));
    }
}

if (typeof window !== 'undefined') {
    const legacyKeys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith(SIGNLESS_KEY_STORAGE_PREFIX)) legacyKeys.push(key);
    }
    for (const key of legacyKeys) window.localStorage.removeItem(key);
}

export function createSignlessAccessKey(): KeyPair {
    return KeyPair.fromRandom('ed25519');
}

export async function persistSignlessAccessKey(accountId: string, keyPair: KeyPair): Promise<void> {
    if (typeof window === 'undefined') return;
    clearLegacyPersistentKey(accountId);
    window.sessionStorage.setItem(signlessKeyStorageKey(accountId), keyPair.toString());
}

export async function getSignlessAccessKey(accountId: string): Promise<KeyPair | null> {
    if (typeof window === 'undefined') return null;
    clearLegacyPersistentKey(accountId);
    const storageKey = signlessKeyStorageKey(accountId);
    const value = window.sessionStorage.getItem(storageKey);
    if (!value) return null;
    try {
        return KeyPair.fromString(value as `ed25519:${string}`);
    } catch {
        window.sessionStorage.removeItem(storageKey);
        return null;
    }
}

export async function clearSignlessAccessKey(accountId: string): Promise<void> {
    if (typeof window === 'undefined') return;
    clearLegacyPersistentKey(accountId);
    window.sessionStorage.removeItem(signlessKeyStorageKey(accountId));
}

export async function revokeBrowserAuthority(
    wallet: Pick<WalletInstance, 'signAndSendTransactions'>,
    accountId: string,
): Promise<void> {
    const keyPair = await getSignlessAccessKey(accountId);
    const transactions: Array<{ receiverId: string; actions: unknown[] }> = [
        {
            receiverId: NEAR_CONFIG.accessContractId,
            actions: [
                actions.functionCall(
                    'revoke_subject_sessions',
                    { owner_id: accountId },
                    GAS_CONSTANTS.mediumGas,
                    BigInt(0),
                ),
            ],
        },
    ];

    if (keyPair) {
        transactions.push({
            receiverId: accountId,
            actions: [actions.deleteKey(PublicKey.fromString(keyPair.getPublicKey().toString()))],
        });
    }

    await wallet.signAndSendTransactions({ transactions });
    await clearSignlessAccessKey(accountId);
}

export function buildSignlessAccessKeyRequest(keyPair: KeyPair) {
    return {
        contractId: NEAR_CONFIG.accessContractId,
        publicKey: keyPair.getPublicKey().toString(),
        allowMethods: {
            anyMethod: false as const,
            methodNames: [...SIGNLESS_ACCESS_KEY_METHODS],
        },
        gasAllowance: {
            kind: 'limited' as const,
            amount: SIGNLESS_ACCESS_KEY_ALLOWANCE_YOCTO.toString(),
        },
    };
}

export interface SignlessKeyProvision {
    transaction: { receiverId: string; actions: unknown[] };
    /** Persist the key locally. Call BEFORE sending: redirect wallets navigate
     * away and never resolve, which would otherwise lose the secret while the
     * AddKey lands on-chain. */
    commit(): Promise<void>;
    /** Drop the persisted key after a failed send so the next signless attempt
     * does not run against a key that never landed on-chain. */
    rollback(): Promise<void>;
}

type OnChainKeyState = 'usable' | 'missing' | 'invalid' | 'unknown';

interface ViewAccessKeyResult {
    error?: string;
    permission?:
        | 'FullAccess'
        | { FunctionCall?: { receiver_id?: string; method_names?: string[]; allowance?: string | null } };
}

function isMissingKeyError(message: string): boolean {
    return /does not exist|UNKNOWN_ACCESS_KEY|access key.*not found/i.test(message);
}

async function getSignlessKeyOnChainState(accountId: string, publicKey: string): Promise<OnChainKeyState> {
    let result: ViewAccessKeyResult;
    try {
        result = await getProvider().query({
            request_type: 'view_access_key',
            finality: 'final',
            account_id: accountId,
            public_key: publicKey,
        }) as ViewAccessKeyResult;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return isMissingKeyError(message) ? 'missing' : 'unknown';
    }

    if (typeof result?.error === 'string') {
        return isMissingKeyError(result.error) ? 'missing' : 'unknown';
    }

    const permission = result?.permission;
    if (!permission) {
        return 'unknown';
    }
    if (permission === 'FullAccess') {
        return 'invalid';
    }

    const functionCall = permission.FunctionCall;
    if (!functionCall) {
        return 'invalid';
    }
    if (functionCall.receiver_id !== NEAR_CONFIG.accessContractId) {
        return 'invalid';
    }
    const methodNames = functionCall.method_names ?? [];
    if (methodNames.length !== 1 || methodNames[0] !== SIGNLESS_ACCESS_KEY_METHODS[0]) {
        return 'invalid';
    }
    if (typeof functionCall.allowance !== 'string') {
        return 'invalid';
    }
    try {
        const allowance = BigInt(functionCall.allowance);
        if (allowance < SIGNLESS_ACCESS_KEY_MIN_ALLOWANCE_YOCTO
            || allowance > SIGNLESS_ACCESS_KEY_ALLOWANCE_YOCTO) {
            return 'invalid';
        }
    } catch {
        return 'invalid';
    }
    return 'usable';
}

export async function getUsableSignlessAccessKey(accountId: string): Promise<KeyPair | null> {
    const keyPair = await getSignlessAccessKey(accountId);
    if (!keyPair) return null;

    const state = await getSignlessKeyOnChainState(accountId, keyPair.getPublicKey().toString());
    if (state === 'usable') return keyPair;
    if (state === 'missing' || state === 'invalid') {
        await clearSignlessAccessKey(accountId);
    }
    return null;
}

export function buildAddSignlessKeyTransaction(accountId: string, keyPair: KeyPair) {
    return {
        receiverId: accountId,
        actions: [
            actions.addFunctionCallAccessKey(
                PublicKey.fromString(keyPair.getPublicKey().toString()),
                NEAR_CONFIG.accessContractId,
                [...SIGNLESS_ACCESS_KEY_METHODS],
                SIGNLESS_ACCESS_KEY_ALLOWANCE_YOCTO,
            ),
        ],
    };
}

/**
 * Decide whether the account needs a fresh signless key. Returns null when the
 * locally stored key is still usable — or when its on-chain state can't be
 * determined (RPC hiccup), to avoid piling spurious keys onto the account.
 * Otherwise returns an AddKey transaction to batch into a wallet approval the
 * user is already making, plus a commit() to persist the key once it lands.
 */
export async function prepareSignlessKeyProvision(accountId: string): Promise<SignlessKeyProvision | null> {
    const localKey = await getSignlessAccessKey(accountId);
    if (localKey) {
        const state = await getSignlessKeyOnChainState(accountId, localKey.getPublicKey().toString());
        if (state === 'usable' || state === 'unknown') {
            return null;
        }
        await clearSignlessAccessKey(accountId);
    }

    const keyPair = createSignlessAccessKey();
    const publicKey = keyPair.getPublicKey().toString();
    return {
        transaction: buildAddSignlessKeyTransaction(accountId, keyPair),
        commit: () => persistSignlessAccessKey(accountId, keyPair),
        rollback: async () => {
            const current = await getSignlessAccessKey(accountId);
            if (current && current.getPublicKey().toString() === publicKey) {
                await clearSignlessAccessKey(accountId);
            }
        },
    };
}

/**
 * Send wallet transactions, opportunistically batching a signless-key AddKey
 * into the same wallet approval when the account is missing one.
 */
export async function signAndSendWithSignlessProvision(
    wallet: WalletInstance,
    accountId: string,
    transactions: Array<{ receiverId: string; actions: unknown[] }>,
): Promise<unknown> {
    let provision: SignlessKeyProvision | null = null;
    if (typeof wallet.signAndSendTransactions === 'function') {
        try {
            provision = await prepareSignlessKeyProvision(accountId);
        } catch {
            provision = null;
        }
    }

    if (provision) {
        await provision.commit();
        try {
            return await wallet.signAndSendTransactions({
                transactions: [...transactions, provision.transaction],
            });
        } catch (error) {
            await provision.rollback().catch(() => {});
            throw error;
        }
    }

    if (transactions.length === 1) {
        return wallet.signAndSendTransaction(transactions[0]);
    }
    return wallet.signAndSendTransactions({ transactions });
}

/**
 * Post-connect check: some wallets silently ignore the addFunctionCallKey
 * sign-in request. If the key never lands on-chain, drop the locally persisted
 * secret so purchase/playback flows re-provision it instead of failing into a
 * wallet prompt on every grant.
 */
export async function reconcileSignlessAccessKey(
    accountId: string,
    keyPair: KeyPair,
    attempts = 5,
    delayMs = 2_000,
): Promise<void> {
    const publicKey = keyPair.getPublicKey().toString();
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        const state = await getSignlessKeyOnChainState(accountId, publicKey);
        if (state === 'usable' || state === 'unknown') {
            return;
        }
        if (state === 'invalid') break;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const current = await getSignlessAccessKey(accountId);
    if (current && current.getPublicKey().toString() === publicKey) {
        await clearSignlessAccessKey(accountId);
    }
}
