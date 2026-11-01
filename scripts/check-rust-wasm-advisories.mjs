#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import process from 'node:process';

// Reachable advisories accepted after review. Each entry names one advisory, one exact package
// version and one contract graph; a new version or any other contract fails again.
const ACCEPTED = Object.freeze([
    Object.freeze({
        id: 'RUSTSEC-2026-0387',
        package: 'crypto-bigint@0.7.0-pre.4',
        label: 'ckd-gate',
        // 2026-10-26 (owner): timing variability in operations meant to be constant-time. In
        // ckd-gate it is reached only through base-jwt-guard's RS256 verification
        // (fast-auth 8f84383, src/rsa/rs256.rs), whose inputs are the public key, the signature
        // and the signed payload; there is no secret to leak, and on-chain execution time is not
        // observable. The fix (>= 0.7.6) needs Rust 1.87 and the testnet gate has no upgrade path;
        // the upgrade is a mainnet prerequisite.
    }),
]);

function accepted(entry, label) {
    return ACCEPTED.some((item) => item.id === entry.id && item.package === entry.package && item.label === label);
}

function fail(message) {
    throw new Error(message);
}

function parseArgs(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index += 2) {
        const name = argv[index];
        const value = argv[index + 1];
        if (!name?.startsWith('--') || !value || value.startsWith('--')) {
            fail(`invalid option near ${name ?? 'end of command'}`);
        }
        options[name.slice(2)] = value;
    }
    for (const name of ['audit-json', 'packages', 'label']) {
        if (!options[name]) fail(`--${name} is required`);
    }
    if (Object.keys(options).some((name) => !['audit-json', 'packages', 'label'].includes(name))) {
        fail('unknown option');
    }
    return options;
}

function productionPackages(source) {
    const packages = new Set();
    for (const line of source.split('\n')) {
        if (!line.trim()) continue;
        const match = /^([A-Za-z0-9_-]+) v([^\s]+)/.exec(line);
        if (!match) fail('production package list is invalid');
        packages.add(`${match[1]}@${match[2]}`);
    }
    if (packages.size === 0) fail('production package list is empty');
    return packages;
}

function auditVulnerabilities(value) {
    const list = value?.vulnerabilities?.list;
    if (!Array.isArray(list)) fail('cargo-audit JSON is invalid');
    return list.map((entry) => {
        const id = entry?.advisory?.id;
        const name = entry?.package?.name;
        const version = entry?.package?.version;
        if (!/^RUSTSEC-[0-9]{4}-[0-9]{4}$/.test(id ?? '') || !name || !version) {
            fail('cargo-audit vulnerability record is invalid');
        }
        return { id, package: `${name}@${version}` };
    });
}

function auditWarnings(value) {
    if (!value?.warnings || typeof value.warnings !== 'object' || Array.isArray(value.warnings)) {
        fail('cargo-audit warnings are invalid');
    }
    return Object.values(value.warnings)
        .flatMap((entries) => Array.isArray(entries) ? entries : [])
        .flatMap((entry) => {
            const id = entry?.advisory?.id;
            const name = entry?.package?.name;
            const version = entry?.package?.version;
            return /^RUSTSEC-[0-9]{4}-[0-9]{4}$/.test(id ?? '') && name && version
                ? [{ id, package: `${name}@${version}` }]
                : [];
        });
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const [auditSource, packageSource] = await Promise.all([
        readFile(options['audit-json'], 'utf8'),
        readFile(options.packages, 'utf8'),
    ]);
    let audit;
    try {
        audit = JSON.parse(auditSource);
    } catch {
        fail('cargo-audit JSON is invalid');
    }

    const packages = productionPackages(packageSource);
    const vulnerabilities = auditVulnerabilities(audit);
    const warnings = auditWarnings(audit);
    const reachableAll = vulnerabilities.filter((entry) => packages.has(entry.package));
    const acceptedReachable = reachableAll.filter((entry) => accepted(entry, options.label));
    const reachable = reachableAll.filter((entry) => !accepted(entry, options.label));
    if (reachable.length > 0) {
        fail(`production WASM vulnerability: ${reachable.map((entry) => `${entry.id}:${entry.package}`).join(',')}`);
    }
    const devOnly = vulnerabilities
        .filter((entry) => !packages.has(entry.package))
        .map((entry) => entry.id)
        .sort();
    const reachableWarnings = warnings
        .filter((entry) => packages.has(entry.package))
        .map((entry) => entry.id)
        .sort();
    console.log(
        `rust-wasm-audit PASS label=${options.label} packages=${packages.size} dev_only=${devOnly.join(',') || 'none'} accepted=${acceptedReachable.map((entry) => entry.id).sort().join(',') || 'none'} warnings=${reachableWarnings.join(',') || 'none'}`,
    );
}

main().catch((error) => {
    console.error(`rust-wasm-audit: ${error.message}`);
    process.exitCode = 1;
});
