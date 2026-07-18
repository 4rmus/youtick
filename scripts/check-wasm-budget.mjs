import { statSync } from 'node:fs';

const wasm = new URL('../contracts/nft-ticket/target/near/youtick_nft.wasm', import.meta.url);
const maxBytes = 2 * 1024 * 1024;
const size = statSync(wasm).size;
console.log(JSON.stringify({ wasmBytes: size, maxBytes }));
if (size > maxBytes) throw new Error(`NFT WASM budget exceeded: ${size} > ${maxBytes}`);
