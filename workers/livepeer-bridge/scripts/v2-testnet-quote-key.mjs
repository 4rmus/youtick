// Run by the owner on their own machine, never in CI or by an agent:
//   node workers/livepeer-bridge/scripts/v2-testnet-quote-key.mjs ~/youtick-v2-testnet-keys/quote.json \
//     | gh secret set V2_CREATOR_FEE_QUOTE_PRIVATE_KEY --env v2-testnet --repo 4rmus/youtick
// Converts the keygen's NEAR `ed25519:<base58>` quote key into the base64 PKCS8 Ed25519 form that
// the Bridge's CREATOR_FEE_QUOTE_PRIVATE_KEY expects. Before writing anything it checks that the
// derived public key equals the quote key Market V2 was bootstrapped with. Output goes to stdout only.
import { readFileSync } from 'node:fs';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { baseDecode } from 'near-api-js';

const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

export function expectedQuotePublicKey() {
    const policy = JSON.parse(readFileSync(new URL('./v2-testnet-bootstrap-policy.json', import.meta.url)));
    return policy.market.quote_public_key_base64;
}

export function convert(keyFileContents, expectedPublicKeyBase64) {
    const { private_key: nearKey } = JSON.parse(keyFileContents);
    if (typeof nearKey !== 'string' || !nearKey.startsWith('ed25519:')) throw new Error('quote_key_not_ed25519');
    // A NEAR ed25519 secret key is the 32-byte seed followed by the 32-byte public key.
    const secret = Buffer.from(baseDecode(nearKey.slice('ed25519:'.length)));
    if (secret.length !== 64) throw new Error('quote_key_length_invalid');
    const der = Buffer.concat([PKCS8_ED25519_PREFIX, secret.subarray(0, 32)]);
    const publicKey = createPublicKey(createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }))
        .export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');
    if (publicKey !== expectedPublicKeyBase64) throw new Error('quote_public_key_mismatch');
    return der.toString('base64');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
    const [keyFile] = process.argv.slice(2);
    if (!keyFile) {
        console.error('usage: node v2-testnet-quote-key.mjs <quote.json> | gh secret set V2_CREATOR_FEE_QUOTE_PRIVATE_KEY ...');
        process.exitCode = 1;
    } else if (process.stdout.isTTY) {
        console.error('quote_key_refuses_terminal_output: pipe stdout into gh secret set');
        process.exitCode = 1;
    } else {
        try {
            process.stdout.write(convert(readFileSync(keyFile, 'utf8'), expectedQuotePublicKey()));
        } catch (error) {
            console.error(error instanceof Error ? error.message : 'quote_key_failed');
            process.exitCode = 1;
        }
    }
}
