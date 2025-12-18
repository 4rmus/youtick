/**
 * Lit Action that verifies a NEAR signature.
 * 
 * Params:
 * - publicKey: string (hex encoded public key of the NEAR account)
 * - sig: string (hex encoded signature)
 * - message: string (the message that was signed)
 */


const verifyNearSignature = async () => {
    try {
        const { publicKey, sig, message } = jsParams;
        if (!publicKey || !sig || !message) {
            throw new Error("Missing params: publicKey, sig, message");
        }

        // Import TweetNaCl from an ESM CDN supported by Lit
        // Lit Actions Environment supports fetch and standard APIs.
        // We use unpkg or esm.sh. 
        // Note: In production, it is safer to bundle this code.
        const nacl = await import("https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/+esm");
        const bs58 = await import("https://cdn.jsdelivr.net/npm/bs58@5.0.0/+esm");

        console.log("Verifying for:", publicKey);

        // 1. Prepare Public Key
        // NEAR Public Keys are often "ed25519:<base58>" or just hex.
        // We expect the input 'publicKey' to be the HEX representation of the Ed25519 key (32 bytes).
        // If it's base58 (common in NEAR), we decode it.
        let pubKeyBytes;
        if (publicKey.startsWith("ed25519:")) {
            pubKeyBytes = bs58.default.decode(publicKey.split(":")[1]);
        } else if (publicKey.length === 64 || publicKey.length === 66) {
            // Hex string
            const cleanHex = publicKey.startsWith("0x") ? publicKey.slice(2) : publicKey;
            pubKeyBytes = new Uint8Array(cleanHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        } else {
            // Assume raw base58
            pubKeyBytes = bs58.default.decode(publicKey);
        }

        // 2. Prepare Signature
        // Signature is expected to be Hex or Base64. Let's assume Hex for Consistency with PKP module.
        const cleanSig = sig.startsWith("0x") ? sig.slice(2) : sig;
        const sigBytes = new Uint8Array(cleanSig.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

        // 3. Prepare Message
        // The message is a string, we need to sign the bytes.
        const msgBytes = new TextEncoder().encode(message);

        // 4. Verify
        const verified = nacl.default.sign.detached.verify(msgBytes, sigBytes, pubKeyBytes);

        console.log("Verification Result:", verified);

        Lit.Actions.setResponse({
            response: JSON.stringify({
                verified: verified,
                uid: publicKey // Using Public Key as the unique User ID
            })
        });
    } catch (e) {
        console.log("Verification Error:", e);
        Lit.Actions.setResponse({ response: JSON.stringify({ verified: false, error: e.toString() }) });
    }
};

verifyNearSignature();
