const verifyNearSignature = async () => {
    try {
        const { publicKey, sig, message } = jsParams;
        if (!publicKey || !sig || !message) {
            throw new Error("Missing params: publicKey, sig, message");
        }

        // Import TweetNaCl from an ESM CDN supported by Lit
        const nacl = await import("https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/+esm");
        const bs58 = await import("https://cdn.jsdelivr.net/npm/bs58@5.0.0/+esm");

        console.log("Verifying for:", publicKey);

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

        const cleanSig = sig.startsWith("0x") ? sig.slice(2) : sig;
        const sigBytes = new Uint8Array(cleanSig.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

        const msgBytes = new TextEncoder().encode(message);

        const verified = nacl.default.sign.detached.verify(msgBytes, sigBytes, pubKeyBytes);

        console.log("Verification Result:", verified);

        Lit.Actions.setResponse({
            response: JSON.stringify({
                verified: verified,
                uid: publicKey
            })
        });
    } catch (e) {
        console.log("Verification Error:", e);
        Lit.Actions.setResponse({ response: JSON.stringify({ verified: false, error: e.toString() }) });
    }
};

verifyNearSignature();
