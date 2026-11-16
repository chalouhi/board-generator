'use strict';
// Every relative link in the Markdown files points at a file that exists.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function md(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) md(p, out); else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}
test('relative links in the documents lead somewhere', () => {
  const broken = [];
  for (const f of md()) for (const [, target] of fs.readFileSync(f, 'utf8').matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
    if (/^(https?:|mailto:)/.test(target)) continue;
    if (!fs.existsSync(path.resolve(path.dirname(f), target))) broken.push(`${path.relative(ROOT, f)} -> ${target}`);
  }
  assert.deepEqual(broken, []);
});
