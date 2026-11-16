'use strict';
// Nothing in this repository names private boards, servers, people or
// addresses. The names are checked by fingerprint (a one-way hash of each word
// and each pair of words), so this test does not itself name them.
// The fingerprints come from tests/private-fingerprints.json.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const { salt, fingerprints } = JSON.parse(fs.readFileSync(path.join(__dirname, 'private-fingerprints.json'), 'utf8'));
const PRIVATE = new Set(fingerprints);
const fp = s => crypto.createHash('sha256').update(salt + s).digest('hex').slice(0, 20);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'out']);
const BINARY = /\.(ttf|otf|woff2?|png|jpe?g|gif|pdf|ico|zip|gz)$/i;

function files(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, out); else if (!BINARY.test(e.name)) out.push(p);
  }
  return out;
}

// The repository's own public addresses name the account; they are allowed.
// The owner is read from the repository's page address on the front page.
const front = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const m = /([A-Za-z0-9-]+)\.github\.io\/([A-Za-z0-9._-]+)/.exec(front);
const OWNER = m ? m[1] : null, REPO = m ? m[2].replace(/\/$/, '') : null;
const ALLOWED = OWNER ? [`github.com/${OWNER}/${REPO}`, `${OWNER}.github.io/${REPO}`, `${OWNER}@users.noreply.github.com`, `Copyright (c) 2026 ${OWNER}`] : [];
const ADDRESSES = [/\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, /\b192\.168\.\d{1,3}\.\d{1,3}\b/, /\b172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/, /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{2,5}\b/];

test('the front page gives the repository page address', () => assert.ok(OWNER, 'README.md must link <owner>.github.io/<repo>'));

test('nothing in the repository names private boards, servers, people or addresses', () => {
  const hits = [];
  for (const p of files()) {
    let t = fs.readFileSync(p, 'utf8');
    for (const a of ALLOWED) t = t.split(a).join(' ');
    const words = t.toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean);
    const seen = new Set(words.map(fp));
    for (let i = 1; i < words.length; i++) seen.add(fp(words[i - 1] + ' ' + words[i]));
    for (const ip of t.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) || []) seen.add(fp(ip));
    for (const h of seen) if (PRIVATE.has(h)) hits.push(`${path.relative(ROOT, p)}: a private name (fingerprint ${h})`);
    for (const re of ADDRESSES) { const x = re.exec(t); if (x) hits.push(`${path.relative(ROOT, p)}: "${x[0]}"`); }
  }
  assert.deepEqual(hits, []);
});
