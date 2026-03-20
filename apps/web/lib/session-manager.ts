import {
    Account,
    KeyPair,
    KeyPairSigner,
    JsonRpcProvider,
    TypedError,
    actions,
    getTransactionLastResult,
    yoctoToNear,
    type KeyPairString,
} from 'near-api-js';
import { batchInitialSetup } from './batch-transactions';
import { BrowserKeyStore } from './keystore-v7';
import { GAS_CONSTANTS, NEAR_CONFIG } from './constants';
import { nearAmountToYocto } from './near-amount';
import { getCurrentRpcUrl, withRpcFailover } from './rpc-failover';
import type { WalletInstance } from './types';

const NETWORK_ID = NEAR_CONFIG.networkId;
const CONTRACT_ID = NEAR_CONFIG.contractId;

export class SessionManager {
    private readonly keyStore = new BrowserKeyStore();

    constructor(private readonly accountId: string) {}

    async importWalletFunctionCallKey(): Promise<boolean> {
        const existingKey = await this.keyStore.getKey(NETWORK_ID, this.accountId);
        if (existingKey || typeof window === 'undefined') {
            return !!existingKey;
        }

        const raw = localStorage.getItem('mynearwallet:functionCallKey');
        if (!raw) {
            return false;
        }

        try {
            const parsed = JSON.parse(raw) as {
                privateKey?: string;
                contractId?: string;
            };

            if (!parsed.privateKey || parsed.contractId !== CONTRACT_ID) {
                return false;
            }

            await this.keyStore.setKey(
                NETWORK_ID,
                this.accountId,
                KeyPair.fromString(parsed.privateKey as KeyPairString),
            );
            return true;
        } catch {
            return false;
        }
    }

    async hasSessionKey(): Promise<boolean> {
        const keyPair = await this.keyStore.getKey(NETWORK_ID, this.accountId);
        if (!keyPair) {
            return false;
        }

        try {
            return await withRpcFailover(async (rpcUrl) => {
                const account = new Account(this.accountId, rpcUrl);
                const accessKeyList = await account.getAccessKeyList();
                const publicKey = keyPair.getPublicKey().toString();
                const accessKeyInfo = accessKeyList.keys.find(
                    (key) => key.public_key === publicKey,
                );

                if (!accessKeyInfo) {
                    await this.keyStore.removeKey(NETWORK_ID, this.accountId);
                    return false;
                }

                const permission = accessKeyInfo.access_key.permission;
                if (
                    typeof permission === 'object' &&
                    'FunctionCall' in permission &&
                    permission.FunctionCall.receiver_id !== CONTRACT_ID
                ) {
                    await this.keyStore.removeKey(NETWORK_ID, this.accountId);
                    return false;
                }

                return true;
            });
        } catch (error) {
            if (error instanceof TypedError) {
                console.warn('[SessionManager] Failed to validate session key:', error.message);
            }
            return true;
        }
    }

    async createSessionKey(wallet: WalletInstance, depositNear: string): Promise<void> {
        const keyPair = KeyPair.fromRandom('ed25519');
        const publicKey = keyPair.getPublicKey().toString();

        await this.keyStore.setKey(NETWORK_ID, this.accountId, keyPair);

        await batchInitialSetup(
            wallet,
            this.accountId,
            CONTRACT_ID,
            publicKey,
            depositNear,
        );
    }

    async callMethod(
        method: string,
        args: Record<string, unknown>,
        gas: string = GAS_CONSTANTS.standardGas.toString(),
    ): Promise<unknown> {
        const keyPair = await this.keyStore.getKey(NETWORK_ID, this.accountId);
        if (!keyPair) {
            throw new Error('No session key found. Please set up the legacy upload flow first.');
        }

        const signer = new KeyPairSigner(keyPair);
        const account = new Account(this.accountId, getCurrentRpcUrl(), signer);

        const outcome = await account.signAndSendTransaction({
            receiverId: CONTRACT_ID,
            actions: [actions.functionCall(method, args, BigInt(gas), BigInt(0))],
        });

        return getTransactionLastResult(outcome);
    }

    async getAccountBalance(nodeUrl: string = getCurrentRpcUrl()): Promise<number> {
        try {
            const provider = new JsonRpcProvider({ url: nodeUrl });
            const result = await provider.query({
                request_type: 'call_function',
                account_id: CONTRACT_ID,
                method_name: 'get_user_balance',
                args_base64: Buffer.from(
                    JSON.stringify({ account_id: this.accountId }),
                ).toString('base64'),
                finality: 'final',
            }) as { result: number[] };

            const balance = JSON.parse(Buffer.from(result.result).toString()) as string;
            return parseFloat(yoctoToNear(BigInt(balance)));
        } catch (error) {
            if (error instanceof TypedError) {
                console.warn('[SessionManager] Failed to fetch prepaid balance:', error.message);
            }
            return 0;
        }
    }

    async topUpGas(wallet: WalletInstance, amount: string): Promise<void> {
        await wallet.signAndSendTransaction({
            receiverId: CONTRACT_ID,
            actions: [
                actions.functionCall(
                    'deposit_funds',
                    {},
                    GAS_CONSTANTS.smallGas,
                    nearAmountToYocto(amount),
                ),
            ],
        });
    }
}

export { CONTRACT_ID, NETWORK_ID };
