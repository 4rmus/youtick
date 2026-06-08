#!/usr/bin/env node

// LLM wiki freshness report.
// For every wiki page, compares `last_checked` against the most recent git
// change of its frontmatter `sources`. Surfaces pages whose evidence moved
// after the page was last verified, plus pages that have simply aged out.
//
// Usage:
//   node scripts/wiki-freshness.mjs           print report to stdout
//   node scripts/wiki-freshness.mjs --write   also regenerate
//                                             docs/llm-wiki/operations/freshness.md

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const wikiDir = path.join(root, 'docs', 'llm-wiki');
const write = process.argv.includes('--write');
const today = new Date().toISOString().slice(0, 10);

// Age thresholds in days, by frontmatter `area`. Past this a page is "aged".
const ageThresholds = { operations: 21, claims: 21, default: 60 };

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && entry.name.endsWith('.md') ? [full] : [];
  });
}

function parseFrontmatter(content) {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end === -1) return null;

  const fields = new Map();
  const sources = [];
  let inSources = false;
  for (const line of lines.slice(1, end)) {
    const keyMatch = line.match(/^([a-z_]+):\s*(.*)$/);
    if (keyMatch) {
      inSources = keyMatch[1] === 'sources';
      fields.set(keyMatch[1], keyMatch[2] || '');
      continue;
    }
    const sourceMatch = line.match(/^\s*-\s+(.+)$/);
    if (inSources && sourceMatch) sources.push(sourceMatch[1].trim());
  }
  return { fields, sources };
}

// Most recent git commit date (YYYY-MM-DD) touching a source path. Wildcards
// are reduced to their leading directory. Returns null when unknown.
function lastChangeDate(source) {
  if (/^https?:\/\//.test(source)) return null;
  const wildcardIndex = source.search(/[*{]/);
  const target = (wildcardIndex === -1 ? source : source.slice(0, wildcardIndex)).replace(/\/+$/, '');
  if (!target || !existsSync(path.join(root, target))) return null;
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', target], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function ageDays(dateStr) {
  const then = Date.parse(dateStr);
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.parse(today) - then) / 86400000);
}

if (!existsSync(wikiDir) || !statSync(wikiDir).isDirectory()) {
  console.error('docs/llm-wiki directory is missing');
  process.exit(1);
}

const stale = []; // source changed after last_checked
const aged = []; // last_checked older than the area threshold
const fresh = [];

for (const filePath of walk(wikiDir)) {
  const relPath = path.relative(root, filePath);
  const parsed = parseFrontmatter(readFileSync(filePath, 'utf8'));
  if (!parsed) continue;

  const lastChecked = parsed.fields.get('last_checked');
  const area = parsed.fields.get('area') || 'default';
  const wikiName = path.basename(filePath, '.md');

  let newestSource = null;
  for (const source of parsed.sources) {
    const date = lastChangeDate(source);
    if (date && (!newestSource || date > newestSource)) newestSource = date;
  }

  const threshold = ageThresholds[area] ?? ageThresholds.default;
  const age = lastChecked ? ageDays(lastChecked) : null;
  const entry = { relPath, wikiName, lastChecked, newestSource, age, threshold };

  if (newestSource && lastChecked && newestSource > lastChecked) {
    stale.push(entry);
  } else if (age != null && age > threshold) {
    aged.push(entry);
  } else {
    fresh.push(entry);
  }
}

stale.sort((a, b) => (b.newestSource || '').localeCompare(a.newestSource || ''));
aged.sort((a, b) => (b.age || 0) - (a.age || 0));

const lines = [];
lines.push(`# LLM Wiki freshness report (${today})`);
lines.push('');
lines.push(`- Stale candidates: ${stale.length} | Aged: ${aged.length} | Fresh: ${fresh.length}`);
lines.push('');

lines.push('## Stale candidates (source changed after last_checked)');
lines.push('');
if (stale.length === 0) {
  lines.push('None.');
} else {
  lines.push('| Page | last_checked | Newest source |');
  lines.push('|---|---|---|');
  for (const e of stale) lines.push(`| [[${e.wikiName}]] | ${e.lastChecked} | ${e.newestSource} |`);
}
lines.push('');

lines.push('## Aged (threshold exceeded)');
lines.push('');
if (aged.length === 0) {
  lines.push('None.');
} else {
  lines.push('| Page | last_checked | Age (days) | Threshold |');
  lines.push('|---|---|---|---|');
  for (const e of aged) lines.push(`| [[${e.wikiName}]] | ${e.lastChecked} | ${e.age} | ${e.threshold} |`);
}
lines.push('');

const report = lines.join('\n');
console.log(report);

if (write) {
  const page = [
    '---',
    'title: Wiki Freshness',
    'status: live',
    'area: operations',
    `last_checked: ${today}`,
    'confidence: high',
    'sources:',
    '  - scripts/wiki-freshness.mjs',
    '---',
    '',
    '> This page is generated by `node scripts/wiki-freshness.mjs --write`; do not edit by hand.',
    '',
    report,
    '## Related pages',
    '',
    '- [[index|Wiki index]]',
    '- [[claims|Claim register]]',
    '',
    '## Next check',
    '',
    '- Re-verify stale candidate rows via the ingest workflow and update `last_checked`.',
    '',
  ].join('\n');
  const outPath = path.join(wikiDir, 'operations', 'freshness.md');
  writeFileSync(outPath, page);
  console.log(`\n(written ${path.relative(root, outPath)})`);
}
