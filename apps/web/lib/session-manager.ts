import { keyStores, KeyPair, connect, Contract, utils, providers, transactions } from 'near-api-js';

const NETWORK_ID = 'testnet';
const CONTRACT_ID = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v0-2.utick.testnet';

export class SessionManager {
    private keyStore: any;
    private accountId: string;

    constructor(accountId: string) {
        this.accountId = accountId;
        this.keyStore = new keyStores.BrowserLocalStorageKeyStore();
    }

    async hasSessionKey(): Promise<boolean> {
        const keyPair = await this.keyStore.getKey(NETWORK_ID, this.accountId);
        if (!keyPair) return false;

        // Verify key exists on-chain to avoid stale keys
        try {
            const near = await connect({
                networkId: NETWORK_ID,
                keyStore: this.keyStore,
                nodeUrl: 'https://test.rpc.fastnear.com',
                walletUrl: 'https://wallet.testnet.near.org',
                helperUrl: 'https://helper.testnet.near.org',
            });
            const account = await near.account(this.accountId);
            const accessKeys = await account.getAccessKeys();
            const publicKey = keyPair.getPublicKey().toString();
            const accessKeyInfo = accessKeys.find(k => k.public_key === publicKey);

            if (!accessKeyInfo) {
                console.warn("Session key found locally but not on-chain. Removing.");
                await this.keyStore.removeKey(NETWORK_ID, this.accountId);
                return false;
            }

            // Verify the key is for the correct contract
            const permission = accessKeyInfo.access_key.permission;
            // Permission can be 'FullAccess' (string) or object with FunctionCall
            if (typeof permission === 'object' && 'FunctionCall' in permission) {
                if (permission.FunctionCall.receiver_id !== CONTRACT_ID) {
                    console.warn(`Session key found but for wrong contract (${permission.FunctionCall.receiver_id} vs ${CONTRACT_ID}). Removing.`);
                    await this.keyStore.removeKey(NETWORK_ID, this.accountId);
                    return false;
                }
            } else if (permission !== 'FullAccess') {
                // Should be FullAccess or FunctionCall. If it's something else weird, remove.
                // But wait, if it IS FullAccess, it's valid for everything.
                // So we only care if it IS FunctionCall AND wrong receiver.
            }

            return true;
        } catch (e) {
            console.warn("Error checking session key on-chain (network issue?). Assuming local key is valid.", e);
            // Fallback: if we have a local key but can't check chain, assume it's valid to allow progress.
            // If it's actually invalid, the subsequent transaction will fail, which is handled.
            return true;
        }
    }

    async createSessionKey(wallet: any, gasAmount: string = '1'): Promise<void> {
        // Generate new key pair
        const keyPair = KeyPair.fromRandom('ed25519');
        const publicKey = keyPair.getPublicKey().toString();

        // Store in local storage
        await this.keyStore.setKey(NETWORK_ID, this.accountId, keyPair);

        // Use batch transaction to add key AND deposit gas in one signature
        const { batchInitialSetup } = await import('./batch-transactions');

        await batchInitialSetup(
            wallet,
            this.accountId,
            CONTRACT_ID,
            publicKey,
            gasAmount
        );
    }

    async callMethod(method: string, args: any, gas: string = '300000000000000'): Promise<any> {
        const keyPair = await this.keyStore.getKey(NETWORK_ID, this.accountId);
        if (!keyPair) {
            throw new Error("No session key found. Please setup account first.");
        }

        const near = await connect({
            networkId: NETWORK_ID,
            keyStore: this.keyStore,
            nodeUrl: 'https://test.rpc.fastnear.com',
            walletUrl: 'https://wallet.testnet.near.org',
            helperUrl: 'https://helper.testnet.near.org',
        });

        const account = await near.account(this.accountId);

        // Call contract method using the session key
        // Note: We cannot attach deposit with a FunctionCallKey!
        // This is why we use the Prepaid Proxy pattern.
        const outcome = await account.functionCall({
            contractId: CONTRACT_ID,
            methodName: method,
            args,
            gas: BigInt(gas),
            attachedDeposit: BigInt(0)
        });

        // Parse result
        const result = providers.getTransactionLastResult(outcome);
        return result;
    }

    async getAccountBalance(nodeUrl: string): Promise<number> {
        try {
            const provider = new providers.JsonRpcProvider({ url: nodeUrl });
            const res = await provider.query({
                request_type: 'call_function',
                account_id: CONTRACT_ID,
                method_name: 'get_user_balance',
                args_base64: Buffer.from(JSON.stringify({ account_id: this.accountId })).toString('base64'),
                finality: 'final',
            }) as any;
            const balString = JSON.parse(Buffer.from(res.result).toString());
            return parseFloat(utils.format.formatNearAmount(balString));
        } catch (e) {
            console.warn("Error getting gas balance (maybe not registered?):", e);
            return 0;
        }
    }

    async ensureGas(wallet: any, nodeUrl: string, minAmount: number = 0.2): Promise<void> {
        const currentBalance = await this.getAccountBalance(nodeUrl);
        console.log(`Current Prepaid Gas Balance: ${currentBalance} NEAR`);

        if (currentBalance < minAmount) {
            console.log(`Low gas (< ${minAmount}), triggering Top Up...`);
            // Deposit 1 NEAR if low
            await this.topUpGas(wallet, '1');
        }
    }

    async topUpGas(wallet: any, amount: string) {
        console.log(`Topping up gas: ${amount} NEAR`);
        const action = transactions.functionCall(
            'deposit_funds',
            Buffer.from(JSON.stringify({})),
            BigInt('30000000000000'), // 30 TGas
            BigInt(utils.format.parseNearAmount(amount) || '0')
        );

        await wallet.signAndSendTransaction({
            receiverId: CONTRACT_ID,
            actions: [action as any]
        });
    }

    async withdrawFunds(wallet: any, amount: string) {
        console.log(`Withdrawing funds: ${amount} NEAR`);
        const action = transactions.functionCall(
            'withdraw_funds',
            Buffer.from(JSON.stringify({ amount: utils.format.parseNearAmount(amount) || '0' })),
            BigInt('30000000000000'), // 30 TGas
            BigInt('1') // Attach 1 yocto for security
        );

        await wallet.signAndSendTransaction({
            receiverId: CONTRACT_ID,
            actions: [action as any]
        });
    }

    async withdrawFundsSilent(amount: string) {
        console.log(`Withdrawing funds silently (Session Key): ${amount} NEAR`);
        // Uses Session Key -> No User Signature required!
        // Constraint: Cannot attach deposit (0 yocto). 
        // If contract requires 1 yocto, this will fail.
        return await this.callMethod(
            'withdraw_funds',
            { amount: utils.format.parseNearAmount(amount) || '0' },
            '30000000000000'
        );
    }
}
