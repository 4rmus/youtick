#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import schema from '../../../protocol/l3-account-canary-v1/schema.json' with { type: 'json' };
import { verifyEvidenceDocument } from './l3-account-canary.mjs';

const schemaBytes = await readFile(
  new URL('../../../protocol/l3-account-canary-v1/schema.json', import.meta.url),
);
export const evidenceSchemaSha256 =
  createHash('sha256').update(schemaBytes).digest('hex');

const validateSchema = new Ajv2020({
  strict: true,
  formats: {
    uuid: true,
    'date-time': true,
  },
}).compile(schema);

export function checkL3AccountCanaryEvidence(evidence) {
  return validateSchema(evidence)
    && verifyEvidenceDocument(evidence, evidenceSchemaSha256);
}

async function main() {
  if (process.argv.length !== 3) {
    console.error('[check-l3-account-canary-evidence] EXPECTED_ONE_JSON_PATH');
    process.exitCode = 1;
    return;
  }
  try {
    const evidence = JSON.parse(await readFile(process.argv[2], 'utf8'));
    if (!checkL3AccountCanaryEvidence(evidence)) {
      console.error('[check-l3-account-canary-evidence] INVALID_EVIDENCE');
      process.exitCode = 2;
      return;
    }
    console.log(JSON.stringify({
      schema: evidence.schema,
      technicalResult: evidence.technicalResult,
      verdict: evidence.verdict,
      evidencePayloadSha256: evidence.evidencePayloadSha256,
    }));
  } catch {
    console.error('[check-l3-account-canary-evidence] READ_OR_PARSE_FAILED');
    process.exitCode = 1;
  }
}

if (fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main();
}
