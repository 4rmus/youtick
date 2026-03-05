import { KeyPair } from 'near-api-js';
import fetch from 'node-fetch';

async function testCrustIpfsPin() {
    const keyPair = KeyPair.fromRandom('ed25519');
    const addressRaw = keyPair.getPublicKey().toString();
    const address = addressRaw.substring(8);

    const { signature } = keyPair.sign(Buffer.from(address));
    const signatureHex = Buffer.from(signature).toString('hex');

    const payload = `near-${address}:${signatureHex}`;
    const header = `Basic ${Buffer.from(payload).toString('base64')}`;

    const cidToPin = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

    try {
        const response = await fetch(`https://crustipfs.xyz/api/v0/pin/add?arg=${cidToPin}`, {
            method: 'POST',
            headers: {
                'Authorization': header
            }
        });

        const text = await response.text();
        console.log("Status:", response.status);
        console.log("Body:", text);
    } catch (e) {
        console.error("Fetch failed", e);
    }
}

testCrustIpfsPin().catch(console.error);
