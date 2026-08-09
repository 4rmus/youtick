import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const CLI = resolve(import.meta.dirname, 'check-rust-wasm-advisories.mjs');

function run(vulnerabilities, packages, warnings = {}) {
    const root = mkdtempSync(join(tmpdir(), 'youtick-rust-audit-'));
    const auditPath = join(root, 'audit.json');
    const packagesPath = join(root, 'packages.txt');
    writeFileSync(auditPath, `${JSON.stringify({ vulnerabilities: { list: vulnerabilities }, warnings })}\n`);
    writeFileSync(packagesPath, `${packages.join('\n')}\n`);
    return spawnSync(process.execPath, [
        CLI,
        '--audit-json', auditPath,
        '--packages', packagesPath,
        '--label', 'market',
    ], { encoding: 'utf8' });
}

function vulnerability(id, name, version) {
    return { advisory: { id }, package: { name, version } };
}

test('allows a vulnerability that is absent from the normal WASM graph', () => {
    const result = run(
        [vulnerability('RUSTSEC-2026-0009', 'time', '0.3.36')],
        ['youtick-nft v1.0.0 (/repo/contracts/nft-ticket)', 'near-sdk v5.5.0'],
        { unmaintained: [vulnerability('RUSTSEC-2022-0054', 'near-sdk', '5.5.0')] },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /dev_only=RUSTSEC-2026-0009/);
    assert.match(result.stdout, /warnings=RUSTSEC-2022-0054/);
});

test('rejects a vulnerability reachable from the normal WASM graph', () => {
    const result = run(
        [vulnerability('RUSTSEC-2026-0001', 'near-sdk', '5.5.0')],
        ['youtick-nft v1.0.0 (/repo/contracts/nft-ticket)', 'near-sdk v5.5.0 (*)'],
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /RUSTSEC-2026-0001:near-sdk@5\.5\.0/);
});

test('rejects malformed cargo-audit input', () => {
    const root = mkdtempSync(join(tmpdir(), 'youtick-rust-audit-invalid-'));
    const auditPath = join(root, 'audit.json');
    const packagesPath = join(root, 'packages.txt');
    writeFileSync(auditPath, '{}\n');
    writeFileSync(packagesPath, 'near-sdk v5.5.0\n');
    const result = spawnSync(process.execPath, [
        CLI,
        '--audit-json', auditPath,
        '--packages', packagesPath,
        '--label', 'access',
    ], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /cargo-audit JSON is invalid/);
});
