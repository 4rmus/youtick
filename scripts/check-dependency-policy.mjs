import { existsSync, readFileSync } from 'node:fs';

const packages = [
    'apps/web',
    'workers/youtick-kms',
    'workers/web4-proxy',
    'workers/storage-api',
    'workers/media-delivery',
];
for (const directory of packages) {
    const pkg = JSON.parse(readFileSync(`${directory}/package.json`, 'utf8'));
    if (pkg.engines?.node !== '>=24 <25') throw new Error(`${directory}: Node engine policy drift`);
    if (!existsSync(`${directory}/package-lock.json`)) throw new Error(`${directory}: package-lock.json missing`);
}
console.log(`Dependency policy valid for ${packages.length} deployable packages.`);
