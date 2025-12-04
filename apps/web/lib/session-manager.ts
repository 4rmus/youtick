import { keyStores, KeyPair, connect, Contract, utils, providers, transactions } from 'near-api-js';

const NETWORK_ID = 'testnet';
const CONTRACT_ID = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'utick-demo-v3.testnet';

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
                nodeUrl: 'https://archival-rpc.testnet.near.org',
                walletUrl: 'https://wallet.testnet.near.org',
                helperUrl: 'https://helper.testnet.near.org',
            });
            const account = await near.account(this.accountId);
            const accessKeys = await account.getAccessKeys();
            const publicKey = keyPair.getPublicKey().toString();
            const keyExists = accessKeys.some(k => k.public_key === publicKey);

            if (!keyExists) {
                console.warn("Session key found locally but not on-chain. Removing.");
                await this.keyStore.removeKey(NETWORK_ID, this.accountId);
                return false;
            }
            return true;
        } catch (e) {
            console.warn("Error checking session key on-chain (network issue?). Assuming local key is valid.", e);
            // Fallback: if we have a local key but can't check chain, assume it's valid to allow progress.
            // If it's actually invalid, the subsequent transaction will fail, which is handled.
            return true;
        }
    }

    async createSessionKey(wallet: any): Promise<void> {
        // Generate new key pair
        const keyPair = KeyPair.fromRandom('ed25519');
        const publicKey = keyPair.getPublicKey().toString();

        // Store in local storage
        await this.keyStore.setKey(NETWORK_ID, this.accountId, keyPair);

        // Add key to account via wallet (requires popup)
        // We use the raw near-api-js action format to avoid "Enum key" errors
        const allowance = utils.format.parseNearAmount('0.25');

        // Construct the action manually to match Borsh schema
        const action = {
            addKey: {
                publicKey: KeyPair.fromRandom('ed25519').getPublicKey(), // Wait, we need the specific public key
                accessKey: {
                    permission: {
                        functionCall: {
                            receiverId: CONTRACT_ID,
                            methodNames: [],
                            allowance: allowance ? BigInt(allowance) : undefined
                        }
                    },
                    nonce: 0 // Nonce is ignored/handled by protocol
                }
            }
        };

        // Fix public key
        // PublicKey.from(publicKey) returns a PublicKey object
        // We need to pass that object.
        action.addKey.publicKey = utils.PublicKey.from(publicKey);

        await wallet.signAndSendTransaction({
            receiverId: this.accountId,
            actions: [action as any],
        });
    }

    async callMethod(method: string, args: any, gas: string = '300000000000000'): Promise<any> {
        const keyPair = await this.keyStore.getKey(NETWORK_ID, this.accountId);
        if (!keyPair) {
            throw new Error("No session key found. Please setup account first.");
        }

        const near = await connect({
            networkId: NETWORK_ID,
            keyStore: this.keyStore,
            nodeUrl: 'https://archival-rpc.testnet.near.org',
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
}
