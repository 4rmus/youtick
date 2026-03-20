import {
    Account,
    KeyPair,
    KeyPairSigner,
    PublicKey,
    actions,
    getTransactionLastResult,
} from 'near-api-js';
import { GAS_CONSTANTS, NEAR_CONFIG } from './constants';
import { nearAmountToYocto } from './near-amount';
import { getCurrentRpcUrl } from './rpc-failover';
import type { WalletInstance } from './types';

const CONTRACT_ID = NEAR_CONFIG.contractId;
const DEFAULT_UPLOAD_BUDGET_NEAR = '0.2';
const DEFAULT_UPLOAD_ALLOWANCE_NEAR = '0.15';
const DEFAULT_UPLOAD_TTL_MS = 15 * 60 * 1000;

const uploadSessionKeys = new Map<string, KeyPair>();

export function getActiveUploadSessionKey(accountId: string): KeyPair | null {
    return uploadSessionKeys.get(accountId) ?? null;
}

export class UploadSessionManager {
    constructor(private readonly accountId: string) {}

    async createSession(
        wallet: WalletInstance,
        options?: {
            budgetNear?: string;
            allowanceNear?: string;
            ttlMs?: number;
        },
    ): Promise<string> {
        const budgetNear = options?.budgetNear ?? DEFAULT_UPLOAD_BUDGET_NEAR;
        const allowanceNear = options?.allowanceNear ?? DEFAULT_UPLOAD_ALLOWANCE_NEAR;
        const ttlMs = options?.ttlMs ?? DEFAULT_UPLOAD_TTL_MS;

        const keyPair = KeyPair.fromRandom('ed25519');
        const publicKey = keyPair.getPublicKey().toString();
        const budgetYocto = nearAmountToYocto(budgetNear);
        const allowanceYocto = nearAmountToYocto(allowanceNear);

        uploadSessionKeys.set(this.accountId, keyPair);

        try {
            await wallet.signAndSendTransactions({
                transactions: [
                    {
                        receiverId: CONTRACT_ID,
                        actions: [
                            actions.functionCall(
                                'create_upload_session',
                                {
                                    public_key: publicKey,
                                    budget_yocto: budgetYocto.toString(),
                                    ttl_ms: ttlMs,
                                },
                                GAS_CONSTANTS.mediumGas,
                                budgetYocto,
                            ),
                        ],
                    },
                    {
                        receiverId: this.accountId,
                        actions: [
                            actions.addFunctionCallAccessKey(
                                PublicKey.fromString(publicKey),
                                CONTRACT_ID,
                                ['nft_mint_prepaid', 'create_event_prepaid'],
                                allowanceYocto,
                            ),
                        ],
                    },
                ],
            });

            return publicKey;
        } catch (error) {
            uploadSessionKeys.delete(this.accountId);
            throw error;
        }
    }

    async callMethod(
        method: string,
        args: Record<string, unknown>,
        gas: string = GAS_CONSTANTS.standardGas.toString(),
    ): Promise<unknown> {
        const keyPair = uploadSessionKeys.get(this.accountId);
        if (!keyPair) {
            throw new Error('No active upload session. Start a new upload authorization first.');
        }

        const signer = new KeyPairSigner(keyPair);
        const account = new Account(this.accountId, getCurrentRpcUrl(), signer);
        const outcome = await account.signAndSendTransaction({
            receiverId: CONTRACT_ID,
            actions: [
                actions.functionCall(method, args, BigInt(gas), BigInt(0)),
            ],
        });

        return getTransactionLastResult(outcome);
    }

    getPublicKey(): string | null {
        return uploadSessionKeys.get(this.accountId)?.getPublicKey().toString() ?? null;
    }

    clearSession(): void {
        uploadSessionKeys.delete(this.accountId);
    }
}
