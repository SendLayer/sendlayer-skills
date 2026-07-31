#!/usr/bin/env node
// Parse-checks fenced code blocks in every skill file.
//
// Two documented exception classes are skipped (see AGENTS.md rule 4):
//   1. config / class-member fragments, introduced by a file-path comment
//   2. correct-vs-wrong illustrations, where the bad line is labelled with its error
//
// Anything else must parse with the language's own syntax checker. Checkers that
// are not installed are reported as skipped rather than failing the run.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'snip-'));

const files = execFileSync('git', ['ls-files', 'skills/**/*.md'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

/** A fragment introduced by a `// path/to/file.ext` or `# path/to/file.ext` comment. */
const isPathHeadedFragment = (code) =>
  /^\s*(\/\/|#)\s*\S+\.(php|py|rb|js|ts|json|ya?ml)\b/.test(code);

/** A correct-vs-wrong illustration: a line labelled with the error it raises. */
const isErrorIllustration = (code) =>
  /(SyntaxError|NoMethodError|TypeError|ImportError|wrong|WRONG|fails|Unknown named parameter)/.test(
    code,
  ) && /(\.\.\.|#|\/\/)/.test(code);

/** A bare object/hash-literal fragment showing field shapes. */
const isLiteralFragment = (code) => /^\s*['"]?[\w$-]+['"]?\s*(:|=>)/.test(code.trim());

const langs = {
  js: { ext: 'mjs', cmd: (f) => ['node', ['--check', f]] },
  javascript: { ext: 'mjs', cmd: (f) => ['node', ['--check', f]] },
  python: { ext: 'py', cmd: (f) => ['python3', ['-c', `import ast,sys;ast.parse(open(${JSON.stringify(f)}).read())`]] },
  ruby: { ext: 'rb', cmd: (f) => ['ruby', ['-c', f]] },
  php: { ext: 'php', cmd: (f) => ['php', ['-l', f]], wrap: (c) => (c.trimStart().startsWith('<?php') ? c : `<?php\n${c}`) },
  go: { ext: 'go', cmd: (f) => ['gofmt', ['-e', f]], only: (c) => c.includes('package ') },
};

let checked = 0;
let failed = 0;
const skippedTools = new Set();

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const blocks = [...text.matchAll(/```(\w+)\n([\s\S]*?)```/g)];

  // Ordinal per language, so a failure message points at the Nth block of that language.
  const seen = {};

  blocks.forEach(([, lang, code]) => {
    const spec = langs[lang];
    if (!spec) return;
    const index = (seen[lang] = (seen[lang] ?? -1) + 1);
    if (spec.only && !spec.only(code)) return;
    if (isPathHeadedFragment(code) || isErrorIllustration(code) || isLiteralFragment(code)) return;

    const slug = `${file.replace(/[^\w]/g, '_')}-${index}`;
    const path = join(tmp, `snip-${slug}.${spec.ext}`);
    writeFileSync(path, spec.wrap ? spec.wrap(code) : code);

    const [bin, args] = spec.cmd(path);
    const result = spawnSync(bin, args, { encoding: 'utf8' });

    if (result.error?.code === 'ENOENT') {
      skippedTools.add(`${lang} (${bin} not installed)`);
      return;
    }

    checked += 1;
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || '').trim().split('\n')[0];
      console.error(`FAIL ${file} ${lang}#${index}: ${detail}`);
      failed += 1;
    }
  });
}

if (skippedTools.size > 0) {
  console.log(`skipped: ${[...skippedTools].join(', ')}`);
}
console.log(`${checked} snippets parse-checked, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
