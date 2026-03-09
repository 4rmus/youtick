// lib/trial-wallet.ts - near-api-js v7 compatible
import { Account, KeyPairSigner, type Action } from "near-api-js";
import { BrowserKeyStore } from "./keystore-v7";

const NETWORK_ID = process.env.NEXT_PUBLIC_NEAR_NETWORK || 'mainnet';
const RPC_URL = NETWORK_ID === 'mainnet'
    ? 'https://free.rpc.fastnear.com'
    : 'https://test.rpc.fastnear.com';

/**
 * TrialWallet behaves like a Wallet Selector wallet but uses local browser keys
 * Created during gift claim flow when new trial accounts are made
 * near-api-js v7 compatible
 */
export class TrialWallet {
    private accountId: string;
    private keyStore: BrowserKeyStore;
    private account: Account | null = null;

    constructor(accountId: string) {
        this.accountId = accountId;
        this.keyStore = new BrowserKeyStore();
    }

    private async getAccount(): Promise<Account> {
        if (!this.account) {
            // v7: Get signer from keystore and create Account directly
            const signer = await this.keyStore.getSigner(NETWORK_ID, this.accountId);
            if (!signer) {
                throw new Error(`No key found for account ${this.accountId}`);
            }
            this.account = new Account(this.accountId, RPC_URL, signer);
        }
        return this.account;
    }

    async signAndSendTransaction(params: { receiverId: string; actions: Action[] }) {
        const account = await this.getAccount();
        return await account.signAndSendTransaction({
            receiverId: params.receiverId,
            actions: params.actions
        });
    }

    async signAndSendTransactions(params: { transactions: { receiverId: string; actions: Action[] }[] }) {
        const account = await this.getAccount();
        const results = [];

        for (const tx of params.transactions) {
            const result = await account.signAndSendTransaction({
                receiverId: tx.receiverId,
                actions: tx.actions
            });
            results.push(result);
        }
        return results;
    }

    async getAccounts() {
        return [{ accountId: this.accountId }];
    }

    async signOut() {
        if (typeof window !== "undefined") {
            localStorage.removeItem("trialAccountId");
            // Also remove the key from keystore
            await this.keyStore.removeKey(NETWORK_ID, this.accountId);
        }
    }

    async signMessage(params: { message: string, recipient: string, nonce: Uint8Array, callbackUrl?: string, state?: string }) {
        // Get key from browser keystore
        const keyPair = await this.keyStore.getKey(NETWORK_ID, this.accountId);

        if (!keyPair) {
            throw new Error("No key pair found for trial account");
        }

        const signer = new KeyPairSigner(keyPair);
        const signedMessage = await signer.signNep413Message(this.accountId, {
            message: params.message,
            recipient: params.recipient,
            nonce: params.nonce,
            callbackUrl: params.callbackUrl,
        });

        return {
            signature: Buffer.from(signedMessage.signature).toString('base64'),
            publicKey: signedMessage.publicKey.toString(),
            accountId: signedMessage.accountId,
            state: params.state,
        };
    }

    // Check if trial account has valid key
    static async hasValidKey(accountId: string): Promise<boolean> {
        if (typeof window === "undefined") return false;
        const keyStore = new BrowserKeyStore();
        const key = await keyStore.getKey(NETWORK_ID, accountId);
        return !!key;
    }
}
