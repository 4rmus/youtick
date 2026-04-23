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
import { withRpcFailover } from './rpc-failover';
import type { WalletInstance } from './types';

const CONTRACT_ID = NEAR_CONFIG.contractId;
const DEFAULT_UPLOAD_BUDGET_NEAR = '0.2';
const DEFAULT_UPLOAD_ALLOWANCE_NEAR = '0.15';
const DEFAULT_UPLOAD_TTL_MS = 15 * 60 * 1000;

const uploadSessionKeys = new Map<string, KeyPair>();
const uploadSessionTimestamps = new Map<string, number>();
const UPLOAD_SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

function evictExpiredSessions(): void {
    const now = Date.now();
    for (const [id, ts] of uploadSessionTimestamps.entries()) {
        if (now - ts > UPLOAD_SESSION_TTL_MS) {
            uploadSessionKeys.delete(id);
            uploadSessionTimestamps.delete(id);
        }
    }
}

export function getActiveUploadSessionKey(accountId: string): KeyPair | null {
    evictExpiredSessions();
    const ts = uploadSessionTimestamps.get(accountId);
    if (!ts || Date.now() - ts > UPLOAD_SESSION_TTL_MS) {
        uploadSessionKeys.delete(accountId);
        uploadSessionTimestamps.delete(accountId);
        return null;
    }
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
        uploadSessionTimestamps.set(this.accountId, Date.now());

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

        return withRpcFailover(async (rpcUrl) => {
            const signer = new KeyPairSigner(keyPair);
            const account = new Account(this.accountId, rpcUrl, signer);
            const outcome = await account.signAndSendTransaction({
                receiverId: CONTRACT_ID,
                actions: [
                    actions.functionCall(method, args, BigInt(gas), BigInt(0)),
                ],
            });

            const outcomeAny = outcome as Record<string, unknown>;
            const receiptsOutcome = (outcomeAny as { receipts_outcome?: Array<{
                outcome?: { status?: unknown };
            }> }).receipts_outcome;
            if (Array.isArray(receiptsOutcome)) {
                for (const receipt of receiptsOutcome) {
                    const status = receipt?.outcome?.status;
                    if (status && typeof status === 'object' && 'Failure' in status) {
                        const txHash = (outcomeAny as { transaction_outcome?: { id?: string } })
                            .transaction_outcome?.id ?? 'unknown';
                        throw new Error(
                            `Cross-contract call failed in ${method} (tx: ${txHash}): ${JSON.stringify(status)}`,
                        );
                    }
                }
            }

            const result = getTransactionLastResult(outcome);

            if (method === 'nft_mint_prepaid') {
                console.log(`[UploadSession] ${method} result:`, result);
            }

            return result;
        });
    }

    getPublicKey(): string | null {
        return uploadSessionKeys.get(this.accountId)?.getPublicKey().toString() ?? null;
    }

    clearSession(): void {
        uploadSessionKeys.delete(this.accountId);
    }
}
