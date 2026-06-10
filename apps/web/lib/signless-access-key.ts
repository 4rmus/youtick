import { KeyPair, PublicKey, actions } from 'near-api-js';
import { GAS_CONSTANTS, NEAR_CONFIG } from './constants';
import { BrowserKeyStore } from './keystore-v7';
import { getProvider } from './near';
import { nearAmountToYocto } from './near-amount';
import type { WalletInstance } from './types';

const SIGNLESS_ACCESS_KEY_METHODS = ['issue_session_grant'] as const;
const SIGNLESS_ACCESS_KEY_ALLOWANCE_YOCTO = nearAmountToYocto(GAS_CONSTANTS.sessionKeyAllowance);
// Below this remaining allowance a grant call may no longer fit; reprovision.
const SIGNLESS_ACCESS_KEY_MIN_ALLOWANCE_YOCTO = nearAmountToYocto(0.01);

const signlessKeyStore = new BrowserKeyStore();

export function createSignlessAccessKey(): KeyPair {
    return KeyPair.fromRandom('ed25519');
}

export async function persistSignlessAccessKey(accountId: string, keyPair: KeyPair): Promise<void> {
    await signlessKeyStore.setKey(NEAR_CONFIG.networkId, accountId, keyPair);
}

export async function getSignlessAccessKey(accountId: string): Promise<KeyPair | null> {
    return await signlessKeyStore.getKey(NEAR_CONFIG.networkId, accountId);
}

export async function clearSignlessAccessKey(accountId: string): Promise<void> {
    await signlessKeyStore.removeKey(NEAR_CONFIG.networkId, accountId);
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
    commit(): Promise<void>;
}

type OnChainKeyState = 'usable' | 'missing' | 'unknown';

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
            finality: 'optimistic',
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
        return 'usable';
    }

    const functionCall = permission.FunctionCall;
    if (!functionCall) {
        return 'unknown';
    }
    if (functionCall.receiver_id !== NEAR_CONFIG.accessContractId) {
        return 'missing';
    }
    const methodNames = functionCall.method_names ?? [];
    if (methodNames.length > 0 && !methodNames.includes('issue_session_grant')) {
        return 'missing';
    }
    if (typeof functionCall.allowance === 'string'
        && BigInt(functionCall.allowance) < SIGNLESS_ACCESS_KEY_MIN_ALLOWANCE_YOCTO) {
        return 'missing';
    }
    return 'usable';
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
        if (state !== 'missing') {
            return null;
        }
        await clearSignlessAccessKey(accountId);
    }

    const keyPair = createSignlessAccessKey();
    return {
        transaction: buildAddSignlessKeyTransaction(accountId, keyPair),
        commit: () => persistSignlessAccessKey(accountId, keyPair),
    };
}

/**
 * Send wallet transactions, opportunistically batching a signless-key AddKey
 * into the same approval when the account is missing one. Managed wallets
 * (guest/trial/evm) sign locally without prompts, so they are left untouched.
 */
export async function signAndSendWithSignlessProvision(
    wallet: WalletInstance,
    accountId: string,
    transactions: Array<{ receiverId: string; actions: unknown[] }>,
): Promise<unknown> {
    let provision: SignlessKeyProvision | null = null;
    if (!wallet.managedAccountKind && typeof wallet.signAndSendTransactions === 'function') {
        try {
            provision = await prepareSignlessKeyProvision(accountId);
        } catch {
            provision = null;
        }
    }

    if (provision) {
        const result = await wallet.signAndSendTransactions({
            transactions: [...transactions, provision.transaction],
        });
        await provision.commit();
        return result;
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
        if (state !== 'missing') {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const current = await getSignlessAccessKey(accountId);
    if (current && current.getPublicKey().toString() === publicKey) {
        await clearSignlessAccessKey(accountId);
    }
}
