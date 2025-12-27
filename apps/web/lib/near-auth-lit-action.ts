/**
 * Lit Action for NEAR Wallet Authentication
 * 
 * This Lit Action verifies a NEAR Ed25519 signature and authorizes PKP usage.
 * It runs inside Lit Protocol nodes and generates session signatures when verification succeeds.
 */

// Lit Action code that will be executed on Lit nodes
// Uses tweetnacl for Ed25519 signature verification
// Sourced from robust implementation in pkp.ts
export const NEAR_AUTH_LIT_ACTION_CODE = `
(async () => {
  try {
    const params = typeof jsParams !== 'undefined' ? jsParams : {};
    const { publicKey, sig, message } = params;
    
    if (!publicKey || !sig || !message) {
      throw new Error("Missing params: publicKey, sig, message in jsParams");
    }

    const nacl = await import("https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/+esm");
    const bs58 = await import("https://cdn.jsdelivr.net/npm/bs58@5.0.0/+esm");
    
    console.log("Verifying NEAR signature for:", publicKey);

    let pubKeyBytes;
    if (publicKey.startsWith("ed25519:")) {
        pubKeyBytes = bs58.default.decode(publicKey.split(":")[1]);
    } else {
        pubKeyBytes = bs58.default.decode(publicKey);
    }

    let sigBytes;
    // Check if it looks like base64 (NEAR wallet typically returns base64)
    const isBase64 = (sig.length % 4 === 0) && (/[A-Za-z0-9+/=]/.test(sig));
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
        const cleanSig = sig.startsWith("0x") ? sig.slice(2) : sig;
        sigBytes = new Uint8Array(cleanSig.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    }

    const msgBytes = new TextEncoder().encode(message);
    const verified = nacl.default.sign.detached.verify(msgBytes, sigBytes, pubKeyBytes);

    if (!verified) {
      throw new Error("NEAR Signature Verification Failed");
    }

    // Success Response
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
`;

// Base64 encoded version for getLitActionSessionSigs
export const NEAR_AUTH_LIT_ACTION_BASE64 = typeof Buffer !== 'undefined'
    ? Buffer.from(NEAR_AUTH_LIT_ACTION_CODE).toString('base64')
    : btoa(NEAR_AUTH_LIT_ACTION_CODE);

/**
 * Generate the message that user should sign for PKP authorization
 */
export function generateAuthMessage(nearAccountId: string): string {
    const timestamp = new Date().toISOString();
    return `I authorize Lit Protocol PKP for account ${nearAccountId} at ${timestamp}`;
}

