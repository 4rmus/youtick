#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const wikiDir = path.join(root, 'docs', 'llm-wiki');
const validStatus = new Set(['live', 'target', 'legacy', 'experimental', 'stale']);
const validConfidence = new Set(['high', 'medium', 'low']);
const requiredFrontmatter = ['title', 'status', 'area', 'last_checked', 'confidence', 'sources'];
const moduleCardMaxLines = 150;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
// Entry-point pages that need not be linked from any other page.
const orphanExempt = new Set(['index.md', 'log.md']);

const errors = [];
const warnings = [];

function rel(filePath) {
  return path.relative(root, filePath);
}

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (entry.isFile() && entry.name.endsWith('.md')) return [fullPath];
    return [];
  });
}

function parseFrontmatter(content, filePath) {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== '---') {
    errors.push(`${rel(filePath)}: missing frontmatter start`);
    return null;
  }

  const end = lines.indexOf('---', 1);
  if (end === -1) {
    errors.push(`${rel(filePath)}: missing frontmatter end`);
    return null;
  }

  const raw = lines.slice(1, end);
  const fields = new Map();
  const sources = [];
  let inSources = false;

  for (const line of raw) {
    const keyMatch = line.match(/^([a-z_]+):\s*(.*)$/);
    if (keyMatch) {
      inSources = keyMatch[1] === 'sources';
      fields.set(keyMatch[1], keyMatch[2] || true);
      continue;
    }

    const sourceMatch = line.match(/^\s*-\s+(.+)$/);
    if (inSources && sourceMatch) {
      sources.push(sourceMatch[1].trim());
    }
  }

  return { fields, sources };
}

function sourceExists(source) {
  if (/^https?:\/\//.test(source)) return true;

  const wildcardIndex = source.search(/[*{]/);
  const trimmed = wildcardIndex === -1 ? source : source.slice(0, wildcardIndex);
  const normalized = trimmed.replace(/\/+$/, '');
  if (!normalized) return true;

  return existsSync(path.join(root, normalized));
}

function allowedGuardrailLine(line) {
  const lower = line.toLowerCase();
  return lower.includes('rg -n')
    || lower.includes('desteklenmeyen')
    || lower.includes('do not')
    || lower.includes('anlatma')
    || lower.includes('anlatilmamal')
    || lower.includes('deme')
    || lower.includes('yapilmaz')
    || lower.includes('kacin')
    || lower.includes('not production-ready')
    || lower.includes('durusunu')
    || lower.includes('yanlis')
    || lower.includes('guardrail');
}

function checkGuardrails(content, filePath) {
  const risky = ['production-ready', 'fully decentralized', 'NEXT_PUBLIC_KMS_URL'];
  const lines = content.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    for (const phrase of risky) {
      if (line.includes(phrase) && !allowedGuardrailLine(line)) {
        warnings.push(`${rel(filePath)}:${index + 1}: review guarded phrase "${phrase}"`);
      }
    }
  }
}

// Remove fenced and inline code so example wikilinks inside code are not
// validated (docs legitimately mention `[[wikilink]]` as a term).
function stripCode(content) {
  return content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '');
}

// Resolve an Obsidian wikilink target to a wiki file. Mirrors Obsidian
// resolution: relative to the linking file, then wiki root, then basename.
function resolveLink(rawTarget, fromFileAbs, baseSet) {
  let target = rawTarget.split('|')[0].split('#')[0].trim();
  if (!target) return true; // heading-only link within the same page
  if (target.toLowerCase().endsWith('.md')) target = target.slice(0, -3);

  const relCandidate = `${path.resolve(path.dirname(fromFileAbs), target)}.md`;
  if (relCandidate.startsWith(wikiDir) && existsSync(relCandidate)) return true;

  const rootCandidate = `${path.join(wikiDir, target)}.md`;
  if (existsSync(rootCandidate)) return true;

  return baseSet.has(path.basename(target));
}

function checkClaimsTable(content, filePath) {
  const lines = content.split(/\r?\n/);
  let afterSeparator = false;

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      afterSeparator = false;
      continue;
    }
    if (/^\|[\s:|-]+\|$/.test(trimmed)) {
      afterSeparator = true;
      continue;
    }
    if (!afterSeparator) continue; // header row or stray pipe line

    const cells = trimmed.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 5) {
      errors.push(`${rel(filePath)}:${index + 1}: claims row must have 5 columns, found ${cells.length}`);
      continue;
    }

    const [, status, evidence, lastChecked, risk] = cells;
    if (!validStatus.has(status)) {
      errors.push(`${rel(filePath)}:${index + 1}: invalid claim status "${status}"`);
    }
    if (!dateRe.test(lastChecked)) {
      errors.push(`${rel(filePath)}:${index + 1}: claim "Last checked" must be YYYY-MM-DD, found "${lastChecked}"`);
    }
    if (!evidence) {
      errors.push(`${rel(filePath)}:${index + 1}: claim evidence is empty`);
    }
    if (!risk) {
      warnings.push(`${rel(filePath)}:${index + 1}: claim risk is empty`);
    }
  }
}

if (!existsSync(wikiDir) || !statSync(wikiDir).isDirectory()) {
  errors.push('docs/llm-wiki directory is missing');
} else {
  const files = walk(wikiDir);
  const baseSet = new Set(files.map((filePath) => path.basename(filePath, '.md')));
  const linkedBasenames = new Set();

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8');
    const parsed = parseFrontmatter(content, filePath);
    const lineCount = content.split(/\r?\n/).length;
    const relPath = rel(filePath);

    if (parsed) {
      for (const key of requiredFrontmatter) {
        if (!parsed.fields.has(key)) {
          errors.push(`${relPath}: missing frontmatter field "${key}"`);
        }
      }

      const status = parsed.fields.get('status');
      if (typeof status === 'string' && !validStatus.has(status)) {
        errors.push(`${relPath}: invalid status "${status}"`);
      }

      const confidence = parsed.fields.get('confidence');
      if (typeof confidence === 'string' && !validConfidence.has(confidence)) {
        errors.push(`${relPath}: invalid confidence "${confidence}"`);
      }

      const lastChecked = parsed.fields.get('last_checked');
      if (typeof lastChecked === 'string' && !dateRe.test(lastChecked)) {
        errors.push(`${relPath}: last_checked must be YYYY-MM-DD, found "${lastChecked}"`);
      }

      if (parsed.sources.length === 0) {
        errors.push(`${relPath}: sources list is empty`);
      }

      for (const source of parsed.sources) {
        if (!sourceExists(source)) {
          errors.push(`${relPath}: source does not exist: ${source}`);
        }
      }
    }

    // Wikilink integrity: every [[target]] must resolve to a wiki page.
    const body = stripCode(content);
    for (const match of body.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const rawTarget = match[1];
      if (!resolveLink(rawTarget, filePath, baseSet)) {
        errors.push(`${relPath}: broken wikilink [[${rawTarget}]]`);
      }
      const normalized = rawTarget.split('|')[0].split('#')[0].trim();
      if (normalized) {
        linkedBasenames.add(path.basename(normalized.replace(/\.md$/i, '')));
      }
    }

    if (relPath.startsWith('docs/llm-wiki/module-cards/') && lineCount > moduleCardMaxLines) {
      warnings.push(`${relPath}: module card is ${lineCount} lines; target is <= ${moduleCardMaxLines}`);
    }

    if (content.includes('needs check') && !relPath.endsWith('log.md')) {
      warnings.push(`${relPath}: contains "needs check"`);
    }

    if (relPath.endsWith('claims.md')) {
      checkClaimsTable(content, filePath);
    }

    checkGuardrails(content, filePath);
  }

  // Orphan detection: warn for pages no other page links to.
  for (const filePath of files) {
    const name = path.basename(filePath);
    if (orphanExempt.has(name)) continue;
    if (!linkedBasenames.has(path.basename(filePath, '.md'))) {
      warnings.push(`${rel(filePath)}: orphan page (no wikilink points to it)`);
    }
  }
}

if (warnings.length > 0) {
  console.log('LLM wiki warnings:');
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (errors.length > 0) {
  console.error('LLM wiki errors:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`LLM wiki check passed (${warnings.length} warning(s)).`);
}
