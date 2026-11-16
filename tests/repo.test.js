'use strict';
// The repository itself and the promises of the demo page that can be read
// from its files (requirements 26, 29, 33, 34, 37, 38). Private names and
// links are checked in private-names.test.js and links.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT, read } = require('./helpers.js');
const { samplesJS, fontsJS, SAMPLES } = require('../tools/build-demo-data.js');

test('the tool makes no network request: no request code anywhere, and the page forbids any (requirements 26, 33)', () => {
  for (const f of ['src/board.js', 'src/picture.js', 'src/pdf.js', 'src/fontsubset.js', 'bin/board.js', 'demo/app.js']) {
    assert.doesNotMatch(read(f), /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts|require\(['"](?:node:)?(?:https?|net|dns|tls|dgram|http2)['"]\)/, f);
  }
  const html = read('index.html');
  for (const rule of ["default-src 'none'", "connect-src 'none'", "script-src 'self'", "style-src 'self'", "form-action 'none'"]) assert.ok(html.includes(rule), rule);
  for (const m of html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) assert.doesNotMatch(m[1], /^(?:https?:)?\/\//, m[1]);
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) if (!/^https:\/\/github\.com\//.test(m[1])) assert.ok(fs.existsSync(path.join(ROOT, m[1])), m[1]);
  assert.doesNotMatch(html, /\sstyle="|<style/);
});

test('the board script adds nothing outside its place and uses no inline style attributes (requirement 34)', () => {
  const src = read('src/board.js');
  assert.doesNotMatch(src, /document\.(body|head|documentElement)|window\.(onerror|location)\s*=|localStorage|document\.cookie/);
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ''), /style="/);
  assert.match(src, /attachShadow\(\{ mode: 'open' \}\)/);
});

test('the demo page data is up to date with samples/ and fonts/, and offers the five samples (requirement 29)', () => {
  assert.equal(read('demo', 'samples.js'), samplesJS());
  assert.equal(read('demo', 'fonts.js'), fontsJS());
  assert.deepEqual(SAMPLES.map(s => s[0]), fs.readdirSync(path.join(ROOT, 'samples')).sort());
  assert.match(read('index.html'), /href="https:\/\/github\.com\/[^/]+\/board-generator\/blob\/main\/docs\/file-format\.md"/);
});

test('the repository holds what requirement 37 lists, under the MIT licence', () => {
  assert.match(read('LICENSE'), /^MIT License/);
  for (const f of ['README.md', 'docs/guide.md', 'docs/file-format.md', 'src/board.js', 'src/picture.js', 'src/pdf.js', 'bin/board.js', 'index.html', 'vendor/README.md', 'fonts/OFL.txt'])
    assert.ok(fs.existsSync(path.join(ROOT, f)), f);
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'samples')).sort(), ['1-smallest.json', '2-comprehensive.json', '3-many-columns.json', '4-custom-colours.json', '5-broken.json']);
  const expected = fs.readdirSync(path.join(ROOT, 'expected')).sort();
  assert.equal(expected.length, 13);
  assert.ok(expected.includes('5-broken.problems.txt'));
  const guide = read('docs', 'file-format.md');
  for (let i = 1; i <= 10; i++) assert.match(guide, new RegExp(`^## ${i} · `, 'm'));
  assert.doesNotMatch(guide, /^## 1[12] · |Decisions|Open questions|design chat/m);
});

test('the front page fits a newcomer: what it does, one picture made by the tool, three ways to use it (requirement 38)', () => {
  const md = read('README.md');
  const first = md.split('\n').slice(0, 45).join('\n');
  assert.match(first, /!\[[^\]]*\]\(docs\/example\.svg\)/);
  for (const s of [/demo page/i, /command/i, /script/i]) assert.match(first, s);
  assert.match(read('docs', 'example.svg'), /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="1280"/);
  const g = read('docs', 'guide.md');
  for (const s of ['## 1 · The demo page', '## 2 · The command', '## 3 · The script for other pages']) assert.ok(g.includes(s), s);
});

test('the package needs nothing installed and runs on Node 18 and up', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.bin.board, 'bin/board.js');
});
