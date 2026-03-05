import fetch from 'node-fetch';
import { KeyPair } from 'near-api-js';

async function scanPsa() {
    const keyPair = KeyPair.fromRandom('ed25519');
    const addressRaw = keyPair.getPublicKey().toString();
    const address = addressRaw.substring(8);

    const { signature } = keyPair.sign(Buffer.from(address));
    const signatureHex = Buffer.from(signature).toString('hex');
    const payload = `near-${address}:${signatureHex}`;
    const header = `Basic ${Buffer.from(payload).toString('base64')}`;

    const endpoints = [
        'https://gw.crustgw.work/psa/pins',
        'https://gw.crustgw.org/psa/pins',
        'https://crustipfs.xyz/psa/pins',
        'https://w3auth.crustnetwork.xyz/psa/pins'
    ];

    for (const url of endpoints) {
        try {
            const res = await fetch(url, {
                method: 'GET',
                headers: { 'Authorization': header },
                timeout: 5000
            });
            const text = await res.text();
            console.log(`[${res.status}] ${url}`);
            console.log(`Body partial: ${text.slice(0, 100)}`);
        } catch (e) {
            console.log(`[ERROR] ${url}: ${e.message}`);
        }
    }
}
scanPsa().catch(console.error);
