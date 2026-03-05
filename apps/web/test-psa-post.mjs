import fetch from 'node-fetch';
import { KeyPair } from 'near-api-js';

async function testPostPsa() {
    const keyPair = KeyPair.fromRandom('ed25519');
    const addressRaw = keyPair.getPublicKey().toString();
    const address = addressRaw.substring(8);

    const { signature } = keyPair.sign(Buffer.from(address));
    const signatureHex = Buffer.from(signature).toString('hex');
    const payload = `near-${address}:${signatureHex}`;
    const header = `Basic ${Buffer.from(payload).toString('base64')}`;

    const cidToPin = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

    const res = await fetch('https://crustipfs.xyz/psa/pins', {
        method: 'POST',
        headers: {
            'Authorization': header,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ cid: cidToPin, name: 'youtick-test' })
    });
    const text = await res.text();
    console.log("POST Status:", res.status);
    console.log("Body:", text);
}
testPostPsa().catch(console.error);
