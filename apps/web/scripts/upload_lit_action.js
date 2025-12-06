/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const lighthouse = require('@lighthouse-web3/sdk');
require('dotenv').config({ path: '.env.local' });

const API_KEY = process.env.NEXT_PUBLIC_LIGHTHOUSE_API_KEY;

if (!API_KEY) {
    console.error('Error: NEXT_PUBLIC_LIGHTHOUSE_API_KEY is not set in .env.local');
    process.exit(1);
}

const LIT_ACTION_PATH = path.join(__dirname, '../lit_actions/check_near_ownership.js');

async function uploadLitAction() {
    console.log(`Uploading Lit Action from: ${LIT_ACTION_PATH}`);

    try {
        // Read the file content
        // Lighthouse expects a file path or buffer. We'll use uploadText for simplicity if it's just code
        const code = fs.readFileSync(LIT_ACTION_PATH, 'utf-8');

        // Upload using uploadText
        const response = await lighthouse.uploadText(code, API_KEY, "check_near_ownership.js");

        console.log('Upload Successful!');
        console.log('CID:', response.data.Hash);
        console.log('URL:', `https://gateway.lighthouse.storage/ipfs/${response.data.Hash}`);

    } catch (error) {
        console.error('Upload failed:', error);
    }
}

uploadLitAction();
