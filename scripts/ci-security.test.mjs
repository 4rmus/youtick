import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflows = [
    'ci.yml',
    'codeql.yml',
    'deploy-preview.yml',
    'promote-production.yml',
];

test('every third-party GitHub Action is pinned to a full commit SHA', async () => {
    for (const workflow of workflows) {
        const source = await readFile(new URL(`../.github/workflows/${workflow}`, import.meta.url), 'utf8');
        const uses = [...source.matchAll(/\buses:\s+([^\s#]+)@([^\s#]+)/g)];
        assert.ok(uses.length > 0, `${workflow} has no action references`);
        for (const [, action, ref] of uses) {
            assert.match(ref, /^[0-9a-f]{40}$/, `${action} in ${workflow} is not SHA-pinned`);
        }
    }
});

test('release provenance and runtime SBOM attestations stay mandatory', async () => {
    const source = await readFile(
        new URL('../.github/workflows/deploy-preview.yml', import.meta.url),
        'utf8',
    );
    const assemble = source.slice(source.indexOf('  assemble:'));

    assert.match(assemble, /attestations: write/);
    assert.match(assemble, /id-token: write/);
    assert.match(source, /npm sbom --omit=dev --sbom-format=spdx/);
    assert.match(assemble, /subject-checksums: \$\{\{ runner\.temp \}\}\/release\/SHA256SUMS/);
    assert.match(assemble, /sbom-path: \$\{\{ runner\.temp \}\}\/components\/preview\/web\.spdx\.json/);
    assert.match(assemble, /sbom-path: \$\{\{ runner\.temp \}\}\/components\/bridge\/bridge\.spdx\.json/);
});

test('normal-WASM contract SBOM artifacts stay mandatory', async () => {
    const source = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
    const audit = source.slice(
        source.indexOf('  rust-wasm-audit:'),
        source.indexOf('  detect-changes:'),
    );
    assert.match(audit, /cargo metadata/);
    assert.match(audit, /--filter-platform wasm32-unknown-unknown/);
    assert.match(audit, /generate-contract-spdx\.mjs/);
    assert.match(audit, /name: contract-sbom-\$\{\{ github\.sha \}\}/);
    assert.match(audit, /retention-days: 30/);
});
