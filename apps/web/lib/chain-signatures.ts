import { ethers } from 'ethers';
import { providers, utils, transactions } from 'near-api-js';
import { base_decode } from 'near-api-js/lib/utils/serialize';
import { ec as EC } from 'elliptic';
import BN from 'bn.js'; // We need BN for elliptic

const MPC_CONTRACT = 'v1.signer-prod.testnet';

export async function deriveEthAddress(accountId: string, path: string, wallet: any): Promise<string> {
    // Use local proxy to avoid CORS issues
    const provider = new providers.JsonRpcProvider({ url: '/api/rpc' });

    // Get the MASTER public key from the MPC contract
    // The contract returns the same key regardless of path arguments in view calls
    const result = await provider.query({
        request_type: 'call_function',
        account_id: MPC_CONTRACT,
        method_name: 'public_key',
        args_base64: 'e30=', // {} encoded as base64
        finality: 'final',
    }) as any;

    const resultStr = Buffer.from(result.result).toString();
    const resultObj = JSON.parse(resultStr);
    const publicKeyBase58 = resultObj.replace('secp256k1:', '');
    let masterKeyBytes = base_decode(publicKeyBase58);

    // Prepend 0x04 if it's a raw 64-byte key (uncompressed without prefix)
    if (masterKeyBytes.length === 64) {
        const newKey = new Uint8Array(65);
        newKey[0] = 0x04;
        newKey.set(masterKeyBytes, 1);
        masterKeyBytes = newKey;
    }

    // Derive the child public key client-side
    // Formula: ChildKey = MasterKey + Hash(PredecessorId || "," || Path) * G

    const derivationPath = `${accountId},${path}`;
    const derivedKey = deriveChildPublicKey(masterKeyBytes, accountId, path);

    // Debugging: Try multiple path formats to find the one that matches 0x5D1...
    const candidates = [
        `${accountId},${path}`,
        `${accountId}${path}`,
        `${path}`,
        `${accountId}/${path}`,
        `${accountId}\n${path}`,
        `testnet,${accountId},${path}`, // Maybe chainId prefix?
        `${accountId},${path},0`, // Maybe key version suffix?
    ];

    const targetAddress = '0x5D1AeA33574e0A2533aE411c4EeeEfcB1ad7E362'.toLowerCase();

    for (const p of candidates) {
        const k = deriveChildPublicKeyForPath(masterKeyBytes, p);
        const addr = ethers.computeAddress('0x' + k);
        console.log(`Testing path: "${p}" -> ${addr}`);
        if (addr.toLowerCase() === targetAddress) {
            console.log('FOUND MATCHING PATH FORMAT:', p);
        }
    }

    // Compute ETH address from derived key
    // derivedKey is a hex string (uncompressed, 65 bytes starting with 04)
    return ethers.computeAddress('0x' + derivedKey);
}

function deriveChildPublicKey(parentKey: Uint8Array, accountId: string, path: string): string {
    return deriveChildPublicKeyForPath(parentKey, `${accountId},${path}`);
}

function deriveChildPublicKeyForPath(parentKey: Uint8Array, derivationPath: string): string {
    const ec = new EC('secp256k1');
    const parentPoint = ec.keyFromPublic(parentKey).getPublic();

    const payload = new TextEncoder().encode(derivationPath);
    const hashedPath = ethers.sha256(payload); // Returns hex string

    // Convert hex hash to BN
    const scalar = new BN(hashedPath.slice(2), 16);

    // Compute G * scalar
    const pointToAdd = ec.g.mul(scalar);

    // Add to parent point
    const childPoint = parentPoint.add(pointToAdd);

    // Return hex string (uncompressed)
    return childPoint.encode('hex', false);
}

function deriveChildPublicKeyKeccak(parentKey: Uint8Array, accountId: string, path: string): string {
    const ec = new EC('secp256k1');
    const parentPoint = ec.keyFromPublic(parentKey).getPublic();

    const derivationPath = `${accountId},${path}`;
    const payload = new TextEncoder().encode(derivationPath);
    const hashedPath = ethers.keccak256(payload); // Returns hex string

    const scalar = new BN(hashedPath.slice(2), 16);
    const pointToAdd = ec.g.mul(scalar);
    const childPoint = parentPoint.add(pointToAdd);

    return childPoint.encode('hex', false);
}

export async function signWithMPC(
    wallet: any,
    accountId: string,
    path: string,
    message: string
): Promise<{ signature: string, r: string, s: string, v: number }> {
    // 1. Hash the message (EIP-191)
    const messageHash = ethers.hashMessage(message);
    const payload = Array.from(ethers.getBytes(messageHash));

    // 2. Call MPC contract to sign
    // We use near-api-js transaction builder to ensure compatibility with serialization

    const args = {
        request: {
            payload,
            path,
            key_version: 0
        }
    };

    // Use the wallet's signAndSendTransaction
    // We try to pass the action in a format that works. 
    // Since the "type: FunctionCall" format failed, we'll try constructing the Action object directly
    // or passing the mapped format if the wallet allows it.

    // However, wallet-selector types are strict. We might need to cast to any.
    // Let's try the standard wallet-selector format again but ensure args is strictly correct?
    // No, the error "Enum key (type) not found" is very specific to the object structure.

    // Let's try passing the action as a plain object but with the structure expected by near-api-js serialization?
    // No, that's internal.

    // Best bet: The user's wallet might be expecting the 'params' to be flattened or something?
    // Actually, let's look at the error again. It expects an enum.
    // This usually means we should use the `functionCall` helper from near-api-js/lib/transaction
    // BUT we need to make sure we import it correctly.

    // Note: 'transactions' import from 'near-api-js' should have 'functionCall'.

    const functionCallAction = transactions.functionCall(
        'sign',
        Buffer.from(JSON.stringify(args)),
        BigInt('300000000000000'), // 300 TGas
        BigInt('100000000000000000000000') // 0.1 NEAR
    );

    // We need to cast this to any because wallet-selector expects its own Action interface
    const result = await wallet.signAndSendTransaction({
        receiverId: MPC_CONTRACT,
        actions: [functionCallAction as any]
    });

    // 3. Parse signature from the receipt
    // The signature is returned in the SuccessValue of the transaction outcome
    // However, wallet.signAndSendTransaction might return the outcome directly or just the tx hash depending on the wallet.
    // We need to fetch the transaction result if it's not full.

    // Assuming 'result' contains the outcome.
    const successValue = result.status.SuccessValue;
    if (!successValue) {
        throw new Error('Failed to get signature from transaction result');
    }

    const signatureObj = JSON.parse(Buffer.from(successValue, 'base64').toString());

    // MPC returns { big_r: { affine_point: "..." }, s: { scalar: "..." }, recovery_id: 0/1 }
    // We need to construct the ETH signature

    // NOTE: The actual return format of v1.signer-prod.testnet might differ slightly.
    // Standard MPC return is usually [Big_R_x, Big_R_y], s, recovery_id

    // For now, let's assume we get the standard format and might need to debug the exact JSON structure.
    // But to proceed, we'll return the raw object and handle it.

    // Actually, let's look at the guide provided by the user.
    // It says "parseSignatureFromReceipt(result)".

    // Let's implement a basic parser assuming standard format.
    // If it fails, we will debug.

    return signatureObj;
}
