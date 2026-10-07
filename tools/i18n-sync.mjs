#!/usr/bin/env node
/**
 * Propagates the canonical Arabic translations into the web and mobile apps.
 *
 * Canonical source: i18n/<locale>.json  (add locales here, nothing else)
 * Targets:
 *   web/src/assets/i18n/<locale>.json
 *   mobile/assets/i18n/<locale>.json
 *
 * Usage:
 *   node tools/i18n-sync.mjs           # write targets
 *   node tools/i18n-sync.mjs --check   # fail (exit 1) if targets are stale
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = join(ROOT, 'i18n');

const TARGETS = [
  join(ROOT, 'web', 'src', 'assets', 'i18n'),
  join(ROOT, 'mobile', 'assets', 'i18n'),
];

const LOCALES = ['ar'];

/** CLDR plural categories that mark an object as a plural group. */
const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];

/** Collects the locale codes available in i18n/. */
async function discoverLocales() {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(SOURCE_DIR, { withFileTypes: true });
  const found = entries
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => e.name.replace(/\.json$/, ''));

  return [...new Set([...found, ...LOCALES])].sort();
}

/**
 * Flattens nested translation objects into dotted keys.
 * Returns Map<dottedKey, string | Record<category, string>>.
 */
function flatten(node, prefix = '', out = new Map()) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    out.set(prefix, node);
    return out;
  }

  const keys = Object.keys(node);
  const isPluralGroup =
    keys.length > 0 && keys.every((k) => PLURAL_CATEGORIES.includes(k));

  if (isPluralGroup) {
    const missing = PLURAL_CATEGORIES.filter((c) => !keys.includes(c));
    if (missing.length > 0) {
      throw new Error(
        `Plural group "${prefix}" is missing categories: ${missing.join(', ')}`,
      );
    }
    out.set(prefix, node);
    return out;
  }

  for (const [key, value] of Object.entries(node)) {
    flatten(value, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

/** Reads a target file and flattens it, or returns an empty Map. */
async function readTargetKeys(file) {
  if (!existsSync(file)) return new Map();
  try {
    return flatten(JSON.parse(await readFile(file, 'utf8')));
  } catch {
    return new Map();
  }
}

function diffKeys(source, target) {
  const missing = [...source.keys()].filter((k) => !target.has(k));
  const extra = [...target.keys()].filter((k) => !source.has(k));
  return { missing, extra };
}

const isCheck = process.argv.includes('--check');
const locales = await discoverLocales();
let stale = false;

for (const locale of locales) {
  const sourceFile = join(SOURCE_DIR, `${locale}.json`);
  if (!existsSync(sourceFile)) {
    console.error(`✗ missing source: ${pathRelative(sourceFile)}`);
    stale = true;
    continue;
  }

  const source = flatten(JSON.parse(await readFile(sourceFile, 'utf8')));

  for (const targetDir of TARGETS) {
    const targetFile = join(targetDir, `${locale}.json`);
    const targetKeys = await readTargetKeys(targetFile);
    const { missing, extra } = diffKeys(source, targetKeys);

    if (isCheck) {
      if (missing.length || extra.length) {
        stale = true;
        console.error(`✗ ${pathRelative(targetFile)}`);
        if (missing.length) {
          console.error(`   missing keys (${missing.length}):`);
          for (const k of missing) console.error(`     - ${k}`);
        }
        if (extra.length) {
          console.error(`   stale keys (${extra.length}):`);
          for (const k of extra) console.error(`     - ${k}`);
        }
      }
      continue;
    }

    if (!existsSync(targetDir)) {
      await mkdir(targetDir, { recursive: true });
    }

    const serialised = `${JSON.stringify(JSON.parse(await readFile(sourceFile, 'utf8')), null, 2)}\n`;
    const existing = existsSync(targetFile) ? await readFile(targetFile, 'utf8') : null;
    if (existing !== serialised) {
      await writeFile(targetFile, serialised, 'utf8');
    }

    const status = missing.length || extra.length ? 'updated' : 'current';
    console.log(`✓ ${pathRelative(targetFile)} — ${source.size} keys (${status})`);
  }
}

function pathRelative(absolute) {
  return absolute.startsWith(ROOT) ? absolute.slice(ROOT.length + 1) : absolute;
}

if (isCheck) {
  if (stale) {
    console.error('\ni18n targets are out of sync. Run: node tools/i18n-sync.mjs');
    process.exit(1);
  }
  console.log(`✓ i18n in sync (${locales.join(', ')})`);
} else {
  console.log(`\nSynced ${locales.length} locale(s) to ${TARGETS.length} target(s).`);
}