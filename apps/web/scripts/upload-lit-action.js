// Upload Lit Action to IPFS via Lighthouse
const lighthouse = require('@lighthouse-web3/sdk');

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
    const apiKey = process.env.LIGHTHOUSE_API_KEY || 'f35a3cbe.690fe7aa6a1b4539906cd0cbcb5566d0';

    console.log('Uploading Lit Action to IPFS via Lighthouse...');

    // Upload text as file
    const response = await lighthouse.uploadText(simpleLitActionCode, apiKey, 'lit-action.js');

    console.log('✅ Upload successful!');
    console.log('IPFS Hash (CID):', response.data.Hash);
    console.log('Name:', response.data.Name);
    console.log('Size:', response.data.Size);
    console.log('\n📋 Add this to .env.local:');
    console.log(`NEXT_PUBLIC_LIT_ACTION_IPFS_CID=${response.data.Hash}`);
}

main().catch(console.error);
