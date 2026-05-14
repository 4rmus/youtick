import { KeyPair } from 'near-api-js';
import { GAS_CONSTANTS, NEAR_CONFIG } from './constants';
import { BrowserKeyStore } from './keystore-v7';
import { nearAmountToYocto } from './near-amount';

const SIGNLESS_ACCESS_KEY_METHODS = ['issue_session_grant'] as const;
const SIGNLESS_ACCESS_KEY_ALLOWANCE_YOCTO = nearAmountToYocto(GAS_CONSTANTS.sessionKeyAllowance).toString();

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
            amount: SIGNLESS_ACCESS_KEY_ALLOWANCE_YOCTO,
        },
    };
}
