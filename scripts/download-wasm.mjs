#!/usr/bin/env node
import { writeFileSync } from 'node:fs';

const RPC_URL = 'https://rpc.mainnet.near.org';
const accountId = process.argv[2] || 'youtick.near';
const outPath = process.argv[3] || `/tmp/${accountId.replace(/\./g, '_')}.wasm`;

const res = await fetch(RPC_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: '1',
    method: 'query',
    params: {
      request_type: 'view_code',
      finality: 'final',
      account_id: accountId,
    },
  }),
});

const data = await res.json();
if (data.error) {
  console.error('RPC error:', data.error);
  process.exit(1);
}

const wasmBase64 = data.result.code_base64;
const wasm = Buffer.from(wasmBase64, 'base64');
writeFileSync(outPath, wasm);
console.log(`Downloaded ${wasm.length} bytes to ${outPath}`);
