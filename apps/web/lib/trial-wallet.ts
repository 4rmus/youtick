import { connect, keyStores, Account } from "near-api-js";

const NETWORK_ID = process.env.NEXT_PUBLIC_NEAR_NETWORK || 'testnet';

/**
 * TrialWallet behaves like a Wallet Selector wallet but uses local browser keys
 * Created during gift claim flow when new trial accounts are made
 */
export class TrialWallet {
    private accountId: string;
    private near: any = null;
    private account: Account | null = null;
    private keyStore: InstanceType<typeof keyStores.BrowserLocalStorageKeyStore>;

    constructor(accountId: string) {
        this.accountId = accountId;
        this.keyStore = new keyStores.BrowserLocalStorageKeyStore();
    }

    private async getAccount(): Promise<Account> {
        if (!this.account) {
            this.near = await connect({
                networkId: NETWORK_ID,
                keyStore: this.keyStore,
                nodeUrl: NETWORK_ID === 'mainnet'
                    ? 'https://rpc.mainnet.near.org'
                    : 'https://test.rpc.fastnear.com',
            });
            this.account = await this.near.account(this.accountId);
        }
        return this.account!;
    }

    async signAndSendTransaction(params: { receiverId: string; actions: any[] }) {
        const account = await this.getAccount();
        return await account.signAndSendTransaction({
            receiverId: params.receiverId,
            actions: params.actions
        });
    }

    async signAndSendTransactions(params: { transactions: { receiverId: string; actions: any[] }[] }) {
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

    async signMessage(params: { message: string, recipient: string, nonce: Buffer, callbackUrl?: string }) {
        // Get key from browser keystore
        const keyPair = await this.keyStore.getKey(NETWORK_ID, this.accountId);

        if (!keyPair) {
            throw new Error("No key pair found for trial account");
        }

        const msgValues = {
            accountId: this.accountId,
            publicKey: keyPair.getPublicKey().toString(),
            nonce: params.nonce.toString('base64'),
            recipient: params.recipient,
            message: params.message
        };

        const payload = new TextEncoder().encode(JSON.stringify(msgValues));
        const { signature } = keyPair.sign(payload);

        return {
            signature: Buffer.from(signature).toString('base64'),
            publicKey: keyPair.getPublicKey().toString(),
            accountId: this.accountId
        };
    }

    // Check if trial account has valid key
    static async hasValidKey(accountId: string): Promise<boolean> {
        if (typeof window === "undefined") return false;
        const keyStore = new keyStores.BrowserLocalStorageKeyStore();
        const key = await keyStore.getKey(NETWORK_ID, accountId);
        return !!key;
    }
}
