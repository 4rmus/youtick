/**
 * Lit Action for NEAR Wallet Authentication
 * 
 * This Lit Action verifies a NEAR Ed25519 signature and authorizes PKP usage.
 * It runs inside Lit Protocol nodes and generates session signatures when verification succeeds.
 */

// Lit Action code that will be executed on Lit nodes
// Uses tweetnacl for Ed25519 signature verification
export const NEAR_AUTH_LIT_ACTION_CODE = `
(async () => {
    try {
        // jsParams is injected by Lit SDK
        const { publicKey, signature, message } = jsParams;
        
        if (!publicKey || !signature || !message) {
            throw new Error("Missing required params: publicKey, signature, message");
        }
        
        console.log("NEAR Auth Lit Action executing...");
        console.log("Public Key:", publicKey);
        console.log("Message:", message);
        
        // Import nacl for Ed25519 verification
        const nacl = await import('tweetnacl');
        
        // Decode NEAR public key (format: ed25519:base58string)
        let pubKeyBytes;
        if (publicKey.startsWith('ed25519:')) {
            const base58Key = publicKey.slice(8); // Remove 'ed25519:' prefix
            
            // Base58 decode implementation
            const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
            const base58Decode = (str) => {
                const bytes = [];
                for (let i = 0; i < str.length; i++) {
                    const char = str[i];
                    const charIndex = ALPHABET.indexOf(char);
                    if (charIndex === -1) throw new Error('Invalid base58 character');
                    
                    let carry = charIndex;
                    for (let j = 0; j < bytes.length; j++) {
                        carry += bytes[j] * 58;
                        bytes[j] = carry & 0xff;
                        carry >>= 8;
                    }
                    while (carry > 0) {
                        bytes.push(carry & 0xff);
                        carry >>= 8;
                    }
                }
                // Handle leading zeros
                for (let i = 0; i < str.length && str[i] === '1'; i++) {
                    bytes.push(0);
                }
                return new Uint8Array(bytes.reverse());
            };
            
            pubKeyBytes = base58Decode(base58Key);
        } else {
            throw new Error("Invalid public key format - must start with 'ed25519:'");
        }
        
        // Decode signature (base64)
        const sigBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
        
        // Encode message
        const msgBytes = new TextEncoder().encode(message);
        
        console.log("Verifying Ed25519 signature...");
        console.log("PubKey bytes length:", pubKeyBytes.length);
        console.log("Signature bytes length:", sigBytes.length);
        console.log("Message bytes length:", msgBytes.length);
        
        // Verify the signature
        const isValid = nacl.default.sign.detached.verify(msgBytes, sigBytes, pubKeyBytes);
        
        if (!isValid) {
            throw new Error("NEAR signature verification failed");
        }
        
        console.log("✅ NEAR signature verified successfully!");
        
        // Set response - this tells Lit nodes the auth was successful
        Lit.Actions.setResponse({ 
            response: JSON.stringify({ 
                verified: true, 
                uid: publicKey,
                accountId: message.match(/account\\s+(\\S+)/)?.[1] || publicKey
            }) 
        });
        
    } catch (error) {
        console.error("Lit Action Error:", error.message);
        Lit.Actions.setResponse({ 
            response: JSON.stringify({ 
                verified: false, 
                error: error.message 
            }) 
        });
        throw error;
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
