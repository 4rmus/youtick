import { brotliCompressSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../apps/web/out/_next/static/', import.meta.url).pathname;
const files = [];
function walk(directory) {
    for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.js')) files.push(path);
    }
}
walk(root);

const sizes = files.map((path) => ({ path, size: brotliCompressSync(readFileSync(path)).byteLength }));
const largest = Math.max(0, ...sizes.map(({ size }) => size));
const total = sizes.reduce((sum, { size }) => sum + size, 0);
const maxChunk = 350 * 1024;
const maxTotal = 3 * 1024 * 1024;
console.log(JSON.stringify({ chunks: sizes.length, largestBrotliBytes: largest, totalBrotliBytes: total }));
if (largest > maxChunk || total > maxTotal) {
    throw new Error(`Web bundle budget exceeded (chunk ${largest}/${maxChunk}, total ${total}/${maxTotal})`);
}
