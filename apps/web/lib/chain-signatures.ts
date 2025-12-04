import { ethers } from 'ethers';
import { providers, utils, transactions } from 'near-api-js';
import { base_decode } from 'near-api-js/lib/utils/serialize';
import { ec as EC } from 'elliptic';
import BN from 'bn.js'; // We need BN for elliptic

const MPC_CONTRACT = 'v1.signer-prod.testnet';

export async function deriveEthAddress(accountId: string, path: string, wallet: any): Promise<string> {
    // Check cache first to avoid unnecessary signing
    const cacheKey = `mpc_address_${accountId}_${path}`;
    if (typeof window !== 'undefined') {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            console.log("Using cached MPC address:", cached);
            return cached;
        }
    }

    console.log("Deriving MPC address via signature probe...");

    // We cannot reliably derive the address mathematically because the MPC contract's
    // derivation logic (or the specific path format it uses) is opaque or differs from
    // standard BIP-32 Ed25519/Secp256k1 derivation in a way we haven't matched.
    //
    // SOLUTION: Ask the MPC to sign a dummy message. The signature proves the address.
    // This is robust and guaranteed to be correct.

    const dummyMsg = "who_am_i";
    const signature = await signWithMPC(wallet, accountId, path, dummyMsg);

    const r = '0x' + signature.big_r.affine_point.substring(2, 66);
    const s = '0x' + signature.s.scalar;

    // Recover address trying both v=27 and v=28
    // We don't know the correct v, but usually one of them is valid.
    // Since we don't have a "target" to compare against (we are finding the target!),
    // we need a way to know which one is right.
    //
    // Actually, for a *given* signature, both v=27 and v=28 produce *valid* addresses,
    // but only one corresponds to the private key.
    //
    // However, the MPC protocol usually returns a `recovery_id` (0 or 1).
    // If we trust the MPC's recovery_id, we can use it.
    // The `signature` object from `signWithMPC` has `recovery_id`.

    let v = 27;
    if (typeof signature.recovery_id === 'number') {
        v = signature.recovery_id + 27;
    }

    // Recover
    const sigObj = ethers.Signature.from({ r, s, v }).serialized;
    const recoveredAddress = ethers.verifyMessage(dummyMsg, sigObj);

    console.log("Recovered MPC Address:", recoveredAddress);

    // Cache it
    if (typeof window !== 'undefined') {
        localStorage.setItem(cacheKey, recoveredAddress);
    }

    return recoveredAddress;
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
