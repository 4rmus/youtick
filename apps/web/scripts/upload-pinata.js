// Upload Lit Action to Pinata IPFS for CIDv0 format
const fs = require('fs');
const path = require('path');

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

async function uploadToPinata() {
    const PINATA_JWT = process.env.PINATA_JWT;

    if (!PINATA_JWT) {
        console.log('\n⚠️  PINATA_JWT environment variable not set.');
        console.log('Get your JWT from: https://app.pinata.cloud/developers/api-keys');
        console.log('\nAlternatively, save the Lit Action code to a file and upload manually:');

        // Save to file for manual upload
        const filePath = path.join(__dirname, 'lit-action-simple.js');
        fs.writeFileSync(filePath, simpleLitActionCode);
        console.log(`\n✅ Lit Action saved to: ${filePath}`);
        console.log('\n📋 Manual upload steps:');
        console.log('1. Go to https://app.pinata.cloud/');
        console.log('2. Click "Add Files" → "File"');
        console.log('3. Upload lit-action-simple.js');
        console.log('4. Copy the CID (should start with Qm...)');
        console.log('5. Update .env.local with: NEXT_PUBLIC_LIT_ACTION_IPFS_CID=<CID>');
        return;
    }

    const formData = new FormData();
    const blob = new Blob([simpleLitActionCode], { type: 'application/javascript' });
    formData.append('file', blob, 'lit-action.js');

    const options = JSON.stringify({ cidVersion: 0 }); // Force CIDv0 (Qm...)
    formData.append('pinataOptions', options);

    console.log('Uploading to Pinata...');

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${PINATA_JWT}`
        },
        body: formData
    });

    const data = await response.json();

    if (data.IpfsHash) {
        console.log('✅ Upload successful!');
        console.log('IPFS Hash (CID):', data.IpfsHash);
        console.log('\n📋 Add this to .env.local:');
        console.log(`NEXT_PUBLIC_LIT_ACTION_IPFS_CID=${data.IpfsHash}`);
    } else {
        console.error('Upload failed:', data);
    }
}

uploadToPinata().catch(console.error);
