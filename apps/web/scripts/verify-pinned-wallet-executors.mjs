import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const source = JSON.parse(await readFile(
    new URL('../lib/pinned-wallet-manifest.json', import.meta.url),
    'utf8',
));
if (source.schema !== 'youtick.pinned-wallet-manifest.v1'
    || !/^[0-9a-f]{64}$/.test(source.executorSha256)
    || !Array.isArray(source.manifest?.wallets)
    || source.manifest.wallets.length !== 1) {
    throw new Error('pinned_wallet_manifest_invalid');
}
const wallet = source.manifest.wallets[0];
if (wallet.id !== 'meteor-wallet'
    || wallet.type !== 'sandbox'
    || wallet.debug === true
    || !/^https:\/\/raw\.githubusercontent\.com\/Meteor-Wallet\/meteor_wallet_sdk\/[0-9a-f]{40}\/storage\/meteor-near-connect-latest\.js$/.test(wallet.executor)) {
    throw new Error('pinned_wallet_executor_invalid');
}
const response = await fetch(wallet.executor, {
    headers: { Accept: 'application/javascript' },
    signal: AbortSignal.timeout(20_000),
});
if (!response.ok) throw new Error(`pinned_wallet_executor_status_${response.status}`);
const digest = createHash('sha256').update(new Uint8Array(await response.arrayBuffer())).digest('hex');
if (digest !== source.executorSha256) throw new Error('pinned_wallet_executor_digest_mismatch');
console.log(`pinned wallet executor: OK ${wallet.id} ${digest}`);
