/**
 * Upload Lit Action to IPFS via Pinata
 * Run: node scripts/upload-lit-action.js
 */

const path = require('path');
const fs = require('fs');

// Read .env.local manually (no dotenv dependency)
const envPath = path.join(__dirname, '../apps/web/.env.local');
let PINATA_JWT = process.env.PINATA_JWT;

if (!PINATA_JWT && fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/PINATA_JWT=(.+)/);
  if (match) {
    PINATA_JWT = match[1].trim().replace(/^["'](.+)["']$/, '$1');
  }
}

if (!PINATA_JWT) {
  console.error("Error: PINATA_JWT not found in apps/web/.env.local or environment");
  console.log("Please add PINATA_JWT=your-jwt-here to apps/web/.env.local");
  process.exit(1);
}

console.log("Found PINATA_JWT, uploading Lit Action to IPFS...");

const VERIFY_NEAR_LIT_ACTION_CODE = `
// Lit Action to verify NEAR signature
// Parameters: publicKey, sig, message (passed via jsParams)

(async () => {
  try {
    // Defensive parameter access
    const params = typeof jsParams !== 'undefined' ? jsParams : {};
    const { publicKey, sig, message } = params;
    
    if (!publicKey || !sig || !message) {
      console.log("Missing parameters in jsParams:", { hasPublicKey: !!publicKey, hasSig: !!sig, hasMessage: !!message });
      throw new Error("Missing params: publicKey, sig, message in jsParams");
    }

    // Import libraries from CDN
    const nacl = await import("https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/+esm");
    const bs58 = await import("https://cdn.jsdelivr.net/npm/bs58@5.0.0/+esm");
    
    console.log("Verifying NEAR signature for:", publicKey);

    // 1. Decode Public Key
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

    // 2. Decode Signature (Handle Base64 - NEAR standard)
    let sigBytes;
    const isBase64 = (sig.length % 4 === 0) && (/[A-Za-z0-9+/=]/.test(sig));
    
    if (isBase64 && (sig.includes('/') || sig.includes('+') || sig.endsWith('='))) {
        console.log("Decoding signature as Base64...");
        try {
            const binaryString = atob(sig);
            sigBytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                sigBytes[i] = binaryString.charCodeAt(i);
            }
        } catch (e) {
            console.log("atob failed, trying hex fallback");
            const cleanSig = sig.startsWith("0x") ? sig.slice(2) : sig;
            sigBytes = new Uint8Array(cleanSig.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        }
    } else {
        console.log("Decoding signature as Hex...");
        const cleanSig = sig.startsWith("0x") ? sig.slice(2) : sig;
        sigBytes = new Uint8Array(cleanSig.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    }

    // 3. Encode Message
    const msgBytes = new TextEncoder().encode(message);

    // 4. Verify Signature
    const verified = nacl.default.sign.detached.verify(msgBytes, sigBytes, pubKeyBytes);
    console.log("Verification Result:", verified);

    if (!verified) {
      throw new Error("NEAR Signature Verification Failed");
    }

    // 5. Success Response
    Lit.Actions.setResponse({ 
      response: JSON.stringify({ 
        verified: verified, 
        uid: publicKey 
      })
    });
  } catch (e) {
    console.log("Lit Action Error:", e.toString());
    // Throwing ensures the nodes fail the session signature request correctly
    throw e;
  }
})();
`;

async function uploadToIPFS() {
  const blob = new Blob([VERIFY_NEAR_LIT_ACTION_CODE], { type: 'application/javascript' });
  const formData = new FormData();
  formData.append('file', blob, 'verify-near-lit-action.js');

  const pinataMetadata = JSON.stringify({
    name: 'verify-near-lit-action'
  });
  formData.append('pinataMetadata', pinataMetadata);

  const pinataOptions = JSON.stringify({
    cidVersion: 0
  });
  formData.append('pinataOptions', pinataOptions);

  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PINATA_JWT}`
    },
    body: formData
  });

  const result = await response.json();
  console.log('Upload Result:', result);
  console.log('\n=== IMPORTANT ===');
  console.log('IPFS CID:', result.IpfsHash);
  console.log('Add this to your .env.local:');
  console.log(`NEXT_PUBLIC_LIT_ACTION_IPFS_CID=${result.IpfsHash}`);

  return result.IpfsHash;
}

uploadToIPFS().catch(console.error);
