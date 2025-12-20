/**
 * Lit Action that verifies a NEAR signature.
 * Supports both Base64 and Hex signature formats from NEAR Wallet.
 * 
 * Params (via jsParams global):
 * - publicKey: string (ed25519:xxx base58 format from NEAR)
 * - sig: string (base64 or hex encoded signature)
 * - message: string (the message that was signed)
 */

(async () => {
    try {
        // jsParams is injected by Lit Protocol - safely access it
        const params = typeof jsParams !== 'undefined' ? jsParams : {};
        const { publicKey, sig, message } = params;

        if (!publicKey || !sig || !message) {
            throw new Error("Missing params: publicKey, sig, message in jsParams");
        }

        const nacl = await import("https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/+esm");
        const bs58 = await import("https://cdn.jsdelivr.net/npm/bs58@5.0.0/+esm");

        console.log("Verifying NEAR signature for:", publicKey);

        // 1. Prepare Public Key (NEAR format: "ed25519:base58" or raw base58)
        let pubKeyBytes;
        if (publicKey.startsWith("ed25519:")) {
            pubKeyBytes = bs58.default.decode(publicKey.split(":")[1]);
        } else {
            pubKeyBytes = bs58.default.decode(publicKey);
        }

        // 2. Prepare Signature (supports both Base64 and Hex formats)
        let sigBytes;
        // Check if it looks like base64 (NEAR wallet typically returns base64)
        const isBase64 = (sig.length % 4 === 0) && (/^[A-Za-z0-9+/=]+$/.test(sig));

        if (isBase64) {
            try {
                const binaryString = atob(sig);
                sigBytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    sigBytes[i] = binaryString.charCodeAt(i);
                }
            } catch (e) {
                // Fallback to hex if base64 decode fails
                const cleanSig = sig.startsWith("0x") ? sig.slice(2) : sig;
                sigBytes = new Uint8Array(cleanSig.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            }
        } else {
            // Hex format
            const cleanSig = sig.startsWith("0x") ? sig.slice(2) : sig;
            sigBytes = new Uint8Array(cleanSig.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        }

        // 3. Prepare Message
        const msgBytes = new TextEncoder().encode(message);

        // 4. Verify
        const verified = nacl.default.sign.detached.verify(msgBytes, sigBytes, pubKeyBytes);

        console.log("Verification Result:", verified);

        if (!verified) {
            throw new Error("NEAR Signature Verification Failed");
        }

        Lit.Actions.setResponse({
            response: JSON.stringify({
                verified: true,
                uid: publicKey
            })
        });
    } catch (e) {
        console.log("Lit Action Error:", e.toString());
        throw e;
    }
})();
