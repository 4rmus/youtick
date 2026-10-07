// Run by the owner on their own machine, never in CI or by an agent:
//   node workers/livepeer-bridge/scripts/v2-testnet-keygen.mjs <new-directory-outside-the-repo>
// Writes one private key per file (mode 0600) into a new directory and prints only public keys,
// in the shape v2-testnet-bootstrap-policy.json expects. Keep the directory offline; the relayer,
// Bridge operator, quote and VAT keys later become Worker secrets.
import { mkdirSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { KeyPair, PublicKey } from 'near-api-js';

export const KEY_NAMES = ['market_v2', 'relayer', 'bridge_management', 'bridge_operator', 'payment_operator', 'tax', 'quote', 'vat'];

export function generate(directory, repositoryRoot) {
    const target = resolve(directory);
    if (existsSync(target)) throw new Error('keygen_directory_exists');
    const inside = relative(realpathSync(repositoryRoot), target);
    if (!inside.startsWith('..')) throw new Error('keygen_directory_inside_repository');
    mkdirSync(target, { mode: 0o700 });
    const publicKeys = {};
    for (const name of KEY_NAMES) {
        const pair = KeyPair.fromRandom('ed25519');
        writeFileSync(resolve(target, `${name}.json`), `${JSON.stringify({ name, public_key: pair.getPublicKey().toString(), private_key: pair.toString() })}\n`,
            { flag: 'wx', mode: 0o600 });
        publicKeys[name] = pair.getPublicKey().toString();
    }
    publicKeys.quote_base64 = Buffer.from(PublicKey.from(publicKeys.quote).data).toString('base64');
    return publicKeys;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
    const [directory] = process.argv.slice(2);
    if (!directory) {
        console.error('usage: node v2-testnet-keygen.mjs <new-directory-outside-the-repo>');
        process.exitCode = 1;
    } else {
        try {
            console.log(JSON.stringify(generate(directory, new URL('../../..', import.meta.url).pathname), null, 2));
        } catch (error) {
            console.error(error instanceof Error ? error.message : 'keygen_failed');
            process.exitCode = 1;
        }
    }
}
