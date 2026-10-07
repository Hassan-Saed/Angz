/**
 * One-off maintenance script: (re)writes the project copyright header on every
 * source file. Run with: node tools/add-copyright.mjs
 *
 * Uses Node's fs rather than shell redirection because the project contains
 * Arabic copy, and several shells default to a codepage that silently
 * rewrites those bytes. Safe to re-run: existing headers are replaced rather
 * than duplicated, so this also migrates older header text.
 */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OWNER = 'Hassan Saed Mohamed';
const YEAR = 2026;

const TARGETS = [
  { dir: join(ROOT, 'web', 'src'), exts: ['.ts', '.html', '.css'] },
  { dir: join(ROOT, 'backend'), exts: ['.js'] },
];

const SKIP_DIRS = new Set(['node_modules', 'dist', '.angular', '.git']);

/** Canonical header body, without comment delimiters. */
const BODY = [
  `Copyright (c) ${YEAR} ${OWNER}. All Rights Reserved.`,
  'SPDX-License-Identifier: LicenseRef-Proprietary',
  'No licence is granted. See LICENSE for permitted and prohibited uses.',
];

/** Lines that mark an existing header so it can be stripped and rewritten. */
const LEGACY_MARKERS = [/Copyright \(c\) \d{4}/, /SPDX-License-Identifier/];

/** Strips a previously written header block from the top of a file. */
function stripHeader(source, ext) {
  let text = source;
  const isBlock =
    (ext === '.ts' || ext === '.js') && text.startsWith('/*');
  const isCss = ext === '.css' && text.startsWith('/*');
  const isHtml = ext === '.html' && text.startsWith('<!--');

  if (isBlock || isCss) {
    const end = text.indexOf('*/');
    if (end !== -1) {
      const head = text.slice(0, end);
      if (LEGACY_MARKERS.some((re) => re.test(head))) {
        text = text.slice(end + 2).replace(/^\r?\n/, '');
      }
    }
  } else if (isHtml) {
    const end = text.indexOf('-->');
    if (end !== -1) {
      const head = text.slice(0, end);
      if (LEGACY_MARKERS.some((re) => re.test(head))) {
        text = text.slice(end + 3).replace(/^\r?\n/, '');
      }
    }
  }
  return text;
}

function headerFor(ext) {
  if (ext === '.css') {
    return `/*\n * ${BODY.join('\n * ')}\n */\n`;
  }
  if (ext === '.html') {
    return `<!--\n  ${BODY.join('\n  ')}\n-->\n`;
  }
  return `/*\n * ${BODY.join('\n * ')}\n */\n`;
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

let changed = 0;
let unchanged = 0;

for (const { dir, exts } of TARGETS) {
  try {
    await stat(dir);
  } catch {
    console.warn(`! missing: ${relative(ROOT, dir)}`);
    continue;
  }

  for await (const file of walk(dir)) {
    if (!exts.includes(extname(file))) continue;

    const original = await readFile(file, 'utf8');
    const expected = headerFor(extname(file));

    const shebang = original.startsWith('#!')
      ? `${original.slice(0, original.indexOf('\n') + 1)}\n`
      : '';
    const body = stripHeader(shebang ? original.slice(shebang.length) : original, extname(file));

    if (shebang + body === original) {
      unchanged += 1;
      continue;
    }

    await writeFile(file, `${shebang}${expected}${body}`, 'utf8');
    changed += 1;
  }
}

console.log(`copyright headers: ${changed} written, ${unchanged} already current`);