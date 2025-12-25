// Compute IPFS CID for Lit Action code
const Hash = require('ipfs-only-hash');

// Simple Lit Action for PKP authorization
const simpleLitActionCode = `
(async () => {
    // Simple PKP authorization - no external auth needed
    // PKP ownership is verified by Lit nodes
    // pkpPublicKey comes from jsParams
    const pubKey = pkpPublicKey;
    Lit.Actions.setResponse({ 
        response: JSON.stringify({ 
            verified: true, 
            uid: pubKey 
        }) 
    });
})();
`;

async function main() {
    const cid = await Hash.of(simpleLitActionCode);
    console.log('IPFS CID for Lit Action:', cid);
}

main();
