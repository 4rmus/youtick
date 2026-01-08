import { ethers } from 'ethers';
import { providers, utils, transactions } from 'near-api-js';
import { ec as EC } from 'elliptic';
import BN from 'bn.js';
import { sha3_256 } from 'js-sha3';

const MPC_CONTRACT = 'v1.signer-prod.testnet';

export async function deriveEthAddress(accountId: string, path: string, wallet?: any): Promise<string> {
    const cacheKey = `mpc_address_v8_${accountId}_${path}`;
    if (typeof window !== 'undefined') {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            console.log("Using cached MPC address:", cached);
            return cached;
        }
    }

    console.log("Deriving MPC address mathematically...");

    // 1. Get Master Public Key (View Call - No Signature)
    // We use a provider directly to avoid wallet interaction
    // Use proxy to avoid CORS errors in browser
    const rpcUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/api/near-rpc`
        : "https://rpc.testnet.near.org";

    const provider = new providers.JsonRpcProvider({ url: rpcUrl });

    let masterKey: string;
    try {
        const result = await provider.query({
            request_type: "call_function",
            account_id: MPC_CONTRACT,
            method_name: "public_key",
            args_base64: Buffer.from("{}").toString("base64"),
            finality: "final"
        }) as any;

        const keyBytes = result.result;
        const rawString = String.fromCharCode(...keyBytes);
        masterKey = JSON.parse(rawString);
        console.log("Fetched MPC Master Key:", masterKey);
    } catch (e) {
        console.error("Failed to fetch MPC master key:", e);
        // Fallback to known testnet key if fetch fails (unlikely)
        masterKey = "secp256k1:4HFcTSodRLVCGNVreQW2nRoAT1g8jU6db747155tYf49P7c5t578D5588C889988";
        throw new Error("Could not fetch MPC master key");
    }

    // 2. Derive Child Public Key
    // IMPORTANT: Since we are using a proxy contract (nft-ticket) to call the MPC,
    // the MPC sees the CONTRACT as the caller.
    // The contract prepends the user's accountId to the path: "user.near/path"
    // So we must derive using:
    // - accountId: CONTRACT_ID (v1.utick.testnet)
    // - path: "user.testnet/lit/pkp-minting"

    const CONTRACT_ID = process.env.NEXT_PUBLIC_NFT_CONTRACT_ID || 'v1.utick.testnet';
    const relativePath = `${accountId},${path}`; // Comma is standard separator in MPC v0.1.0 convention? No, contract uses slash.

    // Note: The contract code uses format!("{}/{}", account_id, path)
    // BUT the MPC derivation string is "near-mpc-recovery v0.1.0 epsilon derivation:{caller_id},{path}"
    // So effective derivation string becomes: "... derivation:{contract_id},{user_id}/{path}"
    // which effectively is derivation:{contract_id},{user_id}/{path}

    // So here we pass:
    // masterKey
    // accountId = CONTRACT_ID
    // path = `${accountId}/${path}`
    const compositePath = `${accountId}/${path}`;
    const derivedKey = deriveChildKey(masterKey, CONTRACT_ID, compositePath);

    // 3. Convert to Ethereum Address
    // Uncompressed key (65 bytes) -> remove 0x04 prefix -> keccak256 -> last 20 bytes
    const derivedPoint = derivedKey.replace(/^secp256k1:/, '');

    // Let's use ethers for address computation
    // Ethers expects '0x' + hex
    const address = ethers.computeAddress('0x' + derivedPoint);

    console.log("Derived MPC Address:", address);

    if (typeof window !== 'undefined') {
        localStorage.setItem(cacheKey, address);
    }

    return address;
}

function deriveChildKey(masterKeyStr: string, accountId: string, path: string): string {
    const ec = new EC('secp256k1');

    // Remove protocol prefix if present
    const masterKeyBase58 = masterKeyStr.replace('secp256k1:', '');

    // Decode Base58 to Buffer/Hex
    // NEAR keys are Base58 encoded.
    const masterKeyBytes = utils.serialize.base_decode(masterKeyBase58);

    // If raw 64 bytes, prepend '04' to make it a standard uncompressed key
    let masterKeyHex = Buffer.from(masterKeyBytes).toString('hex');
    if (masterKeyHex.length === 128) { // 64 bytes * 2 hex chars
        masterKeyHex = '04' + masterKeyHex;
    }

    const masterPoint = ec.keyFromPublic(masterKeyHex, 'hex').getPublic();

    // Standard NEAR MPC Derivation Prefix - MUST match exactly
    // The contract uses "near-mpc-recovery v0.1.0 epsilon derivation:${accountId},${path}"
    const derivation_path = `near-mpc-recovery v0.1.0 epsilon derivation:${accountId},${path}`;

    // Hash payload using SHA3-256 (NOT SHA256, NOT Keccak-256)
    // This is exactly what the official chainsig-script uses via js-sha3
    const scalarHex = sha3_256(derivation_path);

    // Debug logging
    console.log("Derivation path:", derivation_path);
    console.log("Scalar (SHA3-256):", scalarHex);
    console.log("Master key hex:", masterKeyHex);

    const scalar = new BN(scalarHex, 16);
    const pointToAdd = ec.g.mul(scalar);
    const derivedPoint = masterPoint.add(pointToAdd);

    const result = derivedPoint.encode('hex', false);
    console.log("Derived public key (uncompressed):", result);

    return result;
}

// Keep signWithMPC for actual signing, but not for address derivation
export async function signWithMPC(
    wallet: any,
    accountId: string,
    path: string,
    message: string
): Promise<any> {
    const messageHash = ethers.hashMessage(message);
    const payload = Array.from(ethers.getBytes(messageHash));

    const args = {
        request: {
            payload,
            path,
            key_version: 0
        }
    };

    const functionCallAction = transactions.functionCall(
        'sign',
        Buffer.from(JSON.stringify(args)),
        BigInt('300000000000000'), // 300 TGas
        BigInt('100000000000000000000000') // 0.1 NEAR
    );

    const result = await wallet.signAndSendTransaction({
        receiverId: MPC_CONTRACT,
        actions: [functionCallAction as any]
    });

    const successValue = result.status.SuccessValue;
    if (!successValue) {
        throw new Error('Failed to get signature from transaction result');
    }

    const signatureObj = JSON.parse(Buffer.from(successValue, 'base64').toString());
    return signatureObj;
}

/**
 * Custom Signer that uses NEAR MPC for signing EVM transactions.
 * This allows using NEAR Chain Signatures with ethers.js contracts.
 */
export class MPCSigner extends ethers.AbstractSigner {
    private wallet: any;
    private nearAccountId: string;
    private derivationPath: string;
    private _address: string | null = null;

    constructor(
        wallet: any,
        nearAccountId: string,
        derivationPath: string = 'lit/pkp-minting',
        provider?: ethers.Provider
    ) {
        super(provider);
        this.wallet = wallet;
        this.nearAccountId = nearAccountId;
        this.derivationPath = derivationPath;
    }

    async getAddress(): Promise<string> {
        if (!this._address) {
            this._address = await deriveEthAddress(this.nearAccountId, this.derivationPath);
        }
        return this._address;
    }

    connect(provider: ethers.Provider): MPCSigner {
        return new MPCSigner(this.wallet, this.nearAccountId, this.derivationPath, provider);
    }

    async signTransaction(tx: ethers.TransactionRequest): Promise<string> {
        // Serialize the transaction
        const address = await this.getAddress();
        const populatedTx = await this.populateTransaction(tx);

        // Get the unsigned transaction hash
        const unsignedTx = ethers.Transaction.from({
            ...populatedTx,
            from: address
        } as any);

        const txHash = unsignedTx.unsignedHash;
        const payload = Array.from(ethers.getBytes(txHash));

        // Sign via MPC
        const args = {
            request: {
                payload,
                path: this.derivationPath,
                key_version: 0
            }
        };

        const functionCallAction = transactions.functionCall(
            'sign',
            Buffer.from(JSON.stringify(args)),
            BigInt('300000000000000'), // 300 TGas
            BigInt('100000000000000000000000') // 0.1 NEAR
        );

        const result = await this.wallet.signAndSendTransaction({
            receiverId: MPC_CONTRACT,
            actions: [functionCallAction as any]
        });

        const successValue = result.status.SuccessValue;
        if (!successValue) {
            throw new Error('MPC signing failed');
        }

        const mpcSig = JSON.parse(Buffer.from(successValue, 'base64').toString());

        // Convert MPC signature to ethers format
        const r = '0x' + mpcSig.big_r.affine_point.substring(2, 66);
        const s = '0x' + mpcSig.s.scalar;
        const v = mpcSig.recovery_id + 27;

        // Create signed transaction
        const signedTx = unsignedTx.clone();
        signedTx.signature = ethers.Signature.from({ r, s, v });

        return signedTx.serialized;
    }

    async signMessage(message: string | Uint8Array): Promise<string> {
        const msgBytes = typeof message === 'string'
            ? ethers.toUtf8Bytes(message)
            : message;
        const messageHash = ethers.hashMessage(msgBytes);
        const payload = Array.from(ethers.getBytes(messageHash));

        const args = {
            request: {
                payload,
                path: this.derivationPath,
                key_version: 0
            }
        };

        const functionCallAction = transactions.functionCall(
            'sign',
            Buffer.from(JSON.stringify(args)),
            BigInt('300000000000000'),
            BigInt('100000000000000000000000')
        );

        const result = await this.wallet.signAndSendTransaction({
            receiverId: MPC_CONTRACT,
            actions: [functionCallAction as any]
        });

        const successValue = result.status.SuccessValue;
        if (!successValue) {
            throw new Error('MPC message signing failed');
        }

        const mpcSig = JSON.parse(Buffer.from(successValue, 'base64').toString());
        const r = '0x' + mpcSig.big_r.affine_point.substring(2, 66);
        const s = '0x' + mpcSig.s.scalar;
        const v = mpcSig.recovery_id + 27;

        return ethers.Signature.from({ r, s, v }).serialized;
    }

    async signTypedData(
        domain: ethers.TypedDataDomain,
        types: Record<string, ethers.TypedDataField[]>,
        value: Record<string, any>
    ): Promise<string> {
        const hash = ethers.TypedDataEncoder.hash(domain, types, value);
        const payload = Array.from(ethers.getBytes(hash));

        const args = {
            request: {
                payload,
                path: this.derivationPath,
                key_version: 0
            }
        };

        const functionCallAction = transactions.functionCall(
            'sign',
            Buffer.from(JSON.stringify(args)),
            BigInt('300000000000000'),
            BigInt('100000000000000000000000')
        );

        const result = await this.wallet.signAndSendTransaction({
            receiverId: MPC_CONTRACT,
            actions: [functionCallAction as any]
        });

        const successValue = result.status.SuccessValue;
        if (!successValue) {
            throw new Error('MPC typed data signing failed');
        }

        const mpcSig = JSON.parse(Buffer.from(successValue, 'base64').toString());
        const r = '0x' + mpcSig.big_r.affine_point.substring(2, 66);
        const s = '0x' + mpcSig.s.scalar;
        const v = mpcSig.recovery_id + 27;

        return ethers.Signature.from({ r, s, v }).serialized;
    }
}

/**
 * Ethers v5 compatible MPC Signer for LitContracts.
 * LitContracts uses ethers v5 internally, so we need a v5 Signer.
 */
import * as ethers5 from 'ethers5';

export class MPCSignerV5 extends ethers5.Signer {
    private wallet: any;
    private nearAccountId: string;
    private derivationPath: string;
    private _address: string | null = null;

    constructor(
        wallet: any,
        nearAccountId: string,
        derivationPath: string = 'lit/pkp-minting',
        provider?: ethers5.providers.Provider
    ) {
        super();
        ethers5.utils.defineReadOnly(this, 'provider', provider || null as any);
        this.wallet = wallet;
        this.nearAccountId = nearAccountId;
        this.derivationPath = derivationPath;
    }

    async getAddress(): Promise<string> {
        if (!this._address) {
            this._address = await deriveEthAddress(this.nearAccountId, this.derivationPath);
        }
        return this._address;
    }

    connect(provider: ethers5.providers.Provider): MPCSignerV5 {
        return new MPCSignerV5(this.wallet, this.nearAccountId, this.derivationPath, provider);
    }

    async signTransaction(tx: ethers5.providers.TransactionRequest): Promise<string> {
        const address = await this.getAddress();

        // Resolve any promises in the transaction
        const resolvedTx = await ethers5.utils.resolveProperties(tx);

        // Serialize for signing
        const serializedTx = ethers5.utils.serializeTransaction(resolvedTx as any);
        const txHash = ethers5.utils.keccak256(serializedTx);
        const payload = Array.from(ethers5.utils.arrayify(txHash));

        // Sign via MPC
        const args = {
            request: {
                payload,
                path: this.derivationPath,
                key_version: 0
            }
        };

        const functionCallAction = transactions.functionCall(
            'sign',
            Buffer.from(JSON.stringify(args)),
            BigInt('300000000000000'),
            BigInt('100000000000000000000000')
        );

        const result = await this.wallet.signAndSendTransaction({
            receiverId: MPC_CONTRACT,
            actions: [functionCallAction as any]
        });

        const successValue = result.status.SuccessValue;
        if (!successValue) {
            throw new Error('MPC signing failed');
        }

        const mpcSig = JSON.parse(Buffer.from(successValue, 'base64').toString());

        const r = '0x' + mpcSig.big_r.affine_point.substring(2, 66);
        const s = '0x' + mpcSig.s.scalar;
        const v = mpcSig.recovery_id + 27;

        // Serialize signed transaction
        return ethers5.utils.serializeTransaction(resolvedTx as any, { r, s, v });
    }

    async signMessage(message: ethers5.Bytes | string): Promise<string> {
        const msgBytes = typeof message === 'string'
            ? ethers5.utils.toUtf8Bytes(message)
            : message;
        const messageHash = ethers5.utils.hashMessage(msgBytes);
        const payload = Array.from(ethers5.utils.arrayify(messageHash));

        const args = {
            request: {
                payload,
                path: this.derivationPath,
                key_version: 0
            }
        };

        const functionCallAction = transactions.functionCall(
            'sign',
            Buffer.from(JSON.stringify(args)),
            BigInt('300000000000000'),
            BigInt('100000000000000000000000')
        );

        const result = await this.wallet.signAndSendTransaction({
            receiverId: MPC_CONTRACT,
            actions: [functionCallAction as any]
        });

        const successValue = result.status.SuccessValue;
        if (!successValue) {
            throw new Error('MPC message signing failed');
        }

        const mpcSig = JSON.parse(Buffer.from(successValue, 'base64').toString());
        const r = '0x' + mpcSig.big_r.affine_point.substring(2, 66);
        const s = '0x' + mpcSig.s.scalar;
        const v = mpcSig.recovery_id + 27;

        return ethers5.utils.joinSignature({ r, s, v });
    }
}
