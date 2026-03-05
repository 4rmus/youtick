import { KeyPair } from 'near-api-js';
import fetch from 'node-fetch';

async function testCrustPsa() {
    const keyPair = KeyPair.fromRandom('ed25519');
    const addressRaw = keyPair.getPublicKey().toString();
    const address = addressRaw.substring(8);

    const { signature } = keyPair.sign(Buffer.from(address));
    const signatureHex = Buffer.from(signature).toString('hex');

    const payload = `near-${address}:${signatureHex}`;
    const header = `Basic ${Buffer.from(payload).toString('base64')}`;

    console.log("Header:", header);

    const cidToPin = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

    try {
        const response = await fetch('https://pin.crustcode.com/psa/pins', {
            method: 'POST',
            headers: {
                'Authorization': header,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                cid: cidToPin,
                name: `test-pin`
            })
        });

        const text = await response.text();
        console.log("PSA Post Status:", response.status);
        console.log("PSA Post Body:", text);
    } catch (e) {
        console.error("Fetch failed", e);
    }
}

testCrustPsa().catch(console.error);
