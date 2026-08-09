import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const CLI = resolve(import.meta.dirname, 'generate-contract-spdx.mjs');

function fixture(packages = 'youtick-nft v1.0.0 (/repo)\nnear-sdk v5.5.0\nnear-sdk v5.5.0 (*)\n') {
    const root = mkdtempSync(join(tmpdir(), 'youtick-contract-spdx-'));
    const metadataPath = join(root, 'metadata.json');
    const packagesPath = join(root, 'packages.txt');
    const outputPath = join(root, 'market.spdx.json');
    const rootId = 'path+file:///repo/contracts/nft-ticket#youtick-nft@1.0.0';
    writeFileSync(metadataPath, JSON.stringify({
        packages: [
            { id: rootId, name: 'youtick-nft', version: '1.0.0', source: null, license: null },
            { id: 'registry+near-sdk', name: 'near-sdk', version: '5.5.0', source: 'registry+crates.io', license: 'MIT OR Apache-2.0' },
            { id: 'registry+near-workspaces', name: 'near-workspaces', version: '0.14.0', source: 'registry+crates.io', license: 'MIT OR Apache-2.0' },
        ],
        workspace_default_members: [rootId],
    }));
    writeFileSync(packagesPath, packages);
    const args = [
        CLI,
        '--metadata', metadataPath,
        '--packages', packagesPath,
        '--name', 'youtick-market-wasm',
        '--namespace', 'https://github.com/4rmus/youtick/sbom/abcdef/market',
        '--created', '2026-08-09T20:00:00+03:00',
        '--output', outputPath,
    ];
    return { args, outputPath };
}

test('contract SPDX contains only the normal WASM graph and no local paths', () => {
    const input = fixture();
    const result = spawnSync(process.execPath, input.args, { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const source = readFileSync(input.outputPath, 'utf8');
    const document = JSON.parse(source);
    assert.equal(document.spdxVersion, 'SPDX-2.3');
    assert.equal(document.creationInfo.created, '2026-08-09T17:00:00.000Z');
    assert.deepEqual(document.packages.map(({ name }) => name), ['near-sdk', 'youtick-nft']);
    assert.equal(document.packages[0].licenseDeclared, 'MIT OR Apache-2.0');
    assert.equal(document.packages[1].licenseDeclared, 'NOASSERTION');
    assert.equal(document.relationships.length, 2);
    assert.doesNotMatch(source, /near-workspaces|file:\/\/|\/repo|\/Users\/|\/home\/runner\//);
});

test('contract SPDX rejects a package absent from cargo metadata', () => {
    const input = fixture('youtick-nft v1.0.0 (/repo)\nmissing-crate v1.0.0\n');
    const result = spawnSync(process.execPath, input.args, { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /package is missing or ambiguous/);
});
