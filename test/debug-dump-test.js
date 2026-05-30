#!/usr/bin/env node
/**
 * Static verification for the X-PDF-Debug-Dump opt-in feature.
 *
 * Confirms that the dump hooks are wired at the four required pipeline
 * stages without booting puppeteer/express. A full E2E hit against a
 * running container should be the deploy-time smoke check.
 *
 * Usage: node test/debug-dump-test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

const checks = [
  { name: 'header parsed in handleRender',                  re: /req\.headers\['x-pdf-debug-dump'\]/ },
  { name: 'makeDumper helper defined',                      re: /function\s+makeDumper\s*\(/ },
  { name: 'DEBUG_DUMP_DIR env-configurable',                re: /PDF_DEBUG_DUMP_DIR/ },
  { name: 'sanitize accepts a dumper',                      re: /function\s+sanitize\s*\(\s*html\s*,\s*dumper\s*\)/ },
  { name: 'stage 1-raw dumped before stripAtRules',         re: /dumper\.dump\(\s*'1-raw'/ },
  { name: 'stage 2-stripped dumped after stripAtRules',     re: /dumper\.dump\(\s*'2-stripped'/ },
  { name: 'stage 3-consolidated dumped after minifySoft',   re: /dumper\.dump\(\s*'3-consolidated'/ },
  { name: 'stage 4-rendered dumped from page.content()',    re: /dumper\.dump\(\s*'4-rendered'/ },
  { name: 'page.content() called for stage 4',              re: /await\s+page\.content\(\)/ },
  { name: 'logger marker [PDF-DEBUG-DUMP] present',         re: /\[PDF-DEBUG-DUMP\]/ },
  { name: 'response surfaces X-PDF-Debug-Dump-Id',          re: /X-PDF-Debug-Dump-Id/ },
  { name: 'sanitize call passes dumper',                    re: /sanitize\(\s*html\s*,\s*dumper\s*\)/ },
];

// Also exercise the dumper semantics in isolation by replicating its core.
const os = require('os');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-dump-unit-'));
function makeDumperLocal(enabled) {
  if (!enabled) return null;
  const id = `${Date.now()}-test`;
  return {
    id,
    dump(stage, content) {
      fs.writeFileSync(`${tmpDir}/pdf-dump-${id}-${stage}.html`, String(content), 'utf8');
    },
  };
}

const sem = [
  {
    name: 'enabled=false yields null dumper (zero-impact path)',
    run: () => makeDumperLocal(false) === null,
  },
  {
    name: 'enabled=true writes a file per dump() call',
    run: () => {
      const d = makeDumperLocal(true);
      d.dump('1-raw', '<html>raw</html>');
      d.dump('2-stripped', '<html>stripped</html>');
      d.dump('3-consolidated', '<html>consolidated</html>');
      d.dump('4-rendered', '<html>rendered</html>');
      const files = fs.readdirSync(tmpDir).filter((f) => f.includes(d.id));
      return files.length === 4 && files.every((f) => /-[1-4]-(raw|stripped|consolidated|rendered)\.html$/.test(f));
    },
  },
  {
    name: 'dumped file content round-trips intact',
    run: () => {
      const d = makeDumperLocal(true);
      const payload = '<ul><li>One</li><li>Two</li><li>Three</li></ul>';
      d.dump('1-raw', payload);
      const file = fs.readdirSync(tmpDir).find((f) => f.includes(d.id) && f.endsWith('-1-raw.html'));
      return fs.readFileSync(`${tmpDir}/${file}`, 'utf8') === payload;
    },
  },
];

let pass = 0;
let fail = 0;

console.log('── static source hooks ──');
for (const c of checks) {
  const ok = c.re.test(SRC);
  console.log(`  ${ok ? 'OK ' : 'FAIL'}  ${c.name}`);
  if (ok) pass += 1; else fail += 1;
}

console.log('── dumper semantics ──');
for (const c of sem) {
  let ok = false;
  try { ok = !!c.run(); } catch (e) { ok = false; }
  console.log(`  ${ok ? 'OK ' : 'FAIL'}  ${c.name}`);
  if (ok) pass += 1; else fail += 1;
}

// Cleanup
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
