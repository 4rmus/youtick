#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

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
        const key = name.slice(2);
        if (Object.hasOwn(options, key)) fail(`duplicate option --${key}`);
        options[key] = value;
    }
    const expected = ['created', 'metadata', 'name', 'namespace', 'output', 'packages'];
    if (expected.some((name) => !options[name])) fail('required option is missing');
    if (Object.keys(options).some((name) => !expected.includes(name))) fail('unknown option');
    return options;
}

function packageKeys(source) {
    const keys = new Set();
    for (const line of source.split('\n')) {
        if (!line.trim()) continue;
        const match = /^([A-Za-z0-9_-]+) v([^\s]+)/.exec(line);
        if (!match) fail('production package list is invalid');
        keys.add(`${match[1]}@${match[2]}`);
    }
    if (keys.size === 0) fail('production package list is empty');
    return keys;
}

function canonicalCreated(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) fail('--created must be an RFC3339 timestamp');
    return date.toISOString();
}

function documentNamespace(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        fail('--namespace must be an absolute URL');
    }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) {
        fail('--namespace must be a public HTTP(S) URL without credentials or fragment');
    }
    return url.toString();
}

function spdxId(pkg) {
    const label = `${pkg.name}-${pkg.version}`.replace(/[^A-Za-z0-9.-]/g, '-');
    const identity = `${pkg.name}@${pkg.version}:${pkg.source ?? 'workspace'}`;
    return `SPDXRef-Package-${label}-${createHash('sha256').update(identity).digest('hex').slice(0, 12)}`;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const [metadataSource, packageSource] = await Promise.all([
        readFile(options.metadata, 'utf8'),
        readFile(options.packages, 'utf8'),
    ]);
    let metadata;
    try {
        metadata = JSON.parse(metadataSource);
    } catch {
        fail('cargo metadata JSON is invalid');
    }
    if (!Array.isArray(metadata.packages)
        || !Array.isArray(metadata.workspace_default_members)
        || metadata.workspace_default_members.length !== 1) {
        fail('cargo metadata workspace is invalid');
    }

    const wanted = packageKeys(packageSource);
    const packages = [...wanted].map((key) => {
        const matches = metadata.packages.filter((pkg) => `${pkg.name}@${pkg.version}` === key);
        if (matches.length !== 1) fail(`cargo metadata package is missing or ambiguous: ${key}`);
        return matches[0];
    }).sort((left, right) => (
        left.name.localeCompare(right.name)
        || left.version.localeCompare(right.version)
        || String(left.source).localeCompare(String(right.source))
    ));
    const root = packages.find((pkg) => pkg.id === metadata.workspace_default_members[0]);
    if (!root) fail('workspace root is absent from the production package list');

    const ids = new Map(packages.map((pkg) => [pkg.id, spdxId(pkg)]));
    const document = {
        spdxVersion: 'SPDX-2.3',
        dataLicense: 'CC0-1.0',
        SPDXID: 'SPDXRef-DOCUMENT',
        name: options.name,
        documentNamespace: documentNamespace(options.namespace),
        creationInfo: {
            created: canonicalCreated(options.created),
            creators: ['Tool: youtick-contract-spdx/1.0'],
        },
        packages: packages.map((pkg) => ({
            name: pkg.name,
            SPDXID: ids.get(pkg.id),
            versionInfo: pkg.version,
            downloadLocation: 'NOASSERTION',
            filesAnalyzed: false,
            licenseConcluded: 'NOASSERTION',
            licenseDeclared: pkg.license || 'NOASSERTION',
            copyrightText: 'NOASSERTION',
            primaryPackagePurpose: 'LIBRARY',
            externalRefs: [{
                referenceCategory: 'PACKAGE-MANAGER',
                referenceType: 'purl',
                referenceLocator: `pkg:cargo/${encodeURIComponent(pkg.name)}@${encodeURIComponent(pkg.version)}`,
            }],
        })),
        relationships: [
            {
                spdxElementId: 'SPDXRef-DOCUMENT',
                relationshipType: 'DESCRIBES',
                relatedSpdxElement: ids.get(root.id),
            },
            ...packages.filter((pkg) => pkg.id !== root.id).map((pkg) => ({
                spdxElementId: ids.get(root.id),
                relationshipType: 'DEPENDS_ON',
                relatedSpdxElement: ids.get(pkg.id),
            })),
        ],
    };
    const output = `${JSON.stringify(document, null, 2)}\n`;
    if (/file:\/\/|\/Users\/|\/home\/runner\//.test(output)) fail('SPDX contains a local path');
    await writeFile(options.output, output, { flag: 'w' });
    console.log(`contract-spdx PASS name=${options.name} packages=${packages.length}`);
}

main().catch((error) => {
    console.error(`contract-spdx: ${error.message}`);
    process.exitCode = 1;
});
