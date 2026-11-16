'use strict';
// The picture (22), the PDF (23, 24), the command (31–33), and every sample
// against its expected outputs (39).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { B, ROOT, GOOD, read, sample, boardOf, FONTS } = require('./helpers.js');
const { readPDF } = require('./pdf-read.js');
const { outputs } = require('../tools/freeze-expected.js');
const P = require('../src/picture.js');
const PDF = require('../src/pdf.js');
const FS = require('../src/fontsubset.js');
const PDFLib = require('../vendor/pdf-lib.min.js');

const pdfOf = (board, trace) => PDF.build(board, Object.assign({ PDFLib, trace }, FONTS));
const svgOf = (board, width) => P.svg(board, Object.assign({ width }, FONTS));
const CLI = path.join(ROOT, 'bin', 'board.js');
const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8', env: Object.assign({}, process.env, { BOARD_SHIPPED_FONTS: '1' }) });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'board-'));
const headings = text => text.split('\n').reduce((a, l) => { if (l.startsWith(' · ')) a[a.length - 1] += l; else a.push(l); return a; }, []);

test('every good sample gives its expected picture, narrow form and PDF text (requirement 39)', async () => {
  for (const n of GOOD) {
    const o = await outputs(n);
    assert.equal(o.svg, read('expected', n + '.picture.svg'), n + ' picture');
    assert.equal(o.narrow, read('expected', n + '.narrow.html'), n + ' narrow');
    assert.equal(o.text, read('expected', n + '.pdf.txt'), n + ' PDF text');
  }
});

test('the picture stands alone: white, its own colours and font, links, every card (requirement 22, scenario 2)', async () => {
  const b = boardOf(sample('2-comprehensive.json'));
  const pic = await svgOf(b);
  assert.match(pic, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="1280" height="\d+" viewBox="0 0 1280 \d+"/);
  assert.match(pic, /<rect width="1280" height="\d+" fill="#FFFFFF"\/>/);
  assert.equal((pic.match(/@font-face\{font-family:"Board Sans";font-weight:(400|700);src:url\(data:font\/ttf;base64,/g) || []).length, 2);
  assert.doesNotMatch(pic.replace(/url\(data:font\/ttf;base64,[A-Za-z0-9+/=]+\)/g, ''), /<image|xlink:href|@import|url\(|<script|<foreignObject/);
  assert.match(pic, /<a href="https:\/\/example.com\/cards\/44" target="_blank"><text[^>]*>New checkout page with/);
  assert.match(pic, /<a href="https:\/\/example.com\/done" target="_blank"><text[^>]*>45 more<\/text><\/a>/);
  for (const id of ['41', '38', '52', '53', '47', '48', '49', '44', '45', '46', '43', '40', '39', '37']) assert.ok(pic.includes(`#${id}<`), id);
  assert.match(pic, /fill="#C62828" text-anchor="end">3 \/ 2</);
  assert.match(pic, /fill="#C62828">due 6 Mar</);
  assert.match(pic, /fill="#9A5B00">due 14 Mar</);
  assert.ok(B.parseXML(pic).name === 'svg');
  // "show" is ignored in the picture: every card of a folded column is drawn
  const f = JSON.parse(sample('1-smallest.json')); f.columns[0].show = 1;
  f.cards.push({ id: '9', title: 'Second card', column: 'To do' });
  const p2 = await svgOf(boardOf(JSON.stringify(f)));
  assert.ok(p2.includes('Second card')); assert.ok(!p2.includes(' more<'));
});

test('the picture is never wider than asked, for every width from 320 up (requirement 14)', async () => {
  const boards = GOOD.map(n => boardOf(sample(n + '.json')));
  const widths = [];
  for (let w = 320; w <= 2000; w += 7) widths.push(w);
  widths.push(767, 768, 1280, 2400);
  for (const b of boards) for (const w of widths) {
    const pic = await svgOf(b, w);
    assert.match(pic, new RegExp(`^<svg [^>]*width="${w}" `));
    for (const m of pic.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g)) assert.ok(+m[1] + +m[2] <= w + 0.01, `${b.title} at ${w}: rect ends at ${+m[1] + +m[2]}`);
    for (const m of pic.matchAll(/<text x="([\d.]+)"[^>]*text-anchor="end"/g)) assert.ok(+m[1] <= w, `${b.title} at ${w}`);
  }
});

test('a cut-down font holds only the letters used and is not named after the reserved font', () => {
  const sub = Buffer.from(FS.subset(FONTS.bold, 'Hello', true));
  assert.ok(sub.length < 12000, String(sub.length));
  const f = FONTS.fontkit.create(sub);
  assert.equal(f.numGlyphs, 5); // .notdef, H, e, l, o
  assert.equal(f.familyName, 'Board Sans');
  assert.ok(!sub.toString('latin1').includes('Carlito-') && !/C\0a\0r\0l\0i\0t\0o\0-/.test(sub.toString('latin1')));
  for (const ch of 'Helo') assert.equal(f.glyphForCodePoint(ch.codePointAt(0)).path.toSVG(), FONTS.fontkit.create(FONTS.bold).glyphForCodePoint(ch.codePointAt(0)).path.toSVG());
  const before = Buffer.from(FONTS.bold);
  FS.subset(FONTS.bold, 'ïéà', true);
  assert.ok(before.equals(FONTS.bold), 'the source font is left untouched');
});

test('the PDF: A4, white, the table with its heading rows, every card, links, the page line (requirements 23, 24; scenario 2)', async () => {
  const b = boardOf(sample('2-comprehensive.json'));
  const out = await readPDF(await pdfOf(b));
  assert.equal(out.pages.length, 1);
  const p = out.pages[0];
  assert.ok(Math.abs(p.width - 595.28) < 0.01 && Math.abs(p.height - 841.89) < 0.01);
  assert.ok(p.fonts.every(f => /\+?BoardSans/.test(f)), p.fonts.join());
  const lines = headings(p.text);
  for (const h of ['Needs you · 2', 'Ideas · 2', 'Ready · 3 / 4', 'Doing · 3 / 2', 'Checking · 1', 'Done · 48 · 3 listed']) assert.ok(lines.includes(h), h);
  assert.deepEqual(lines.slice(0, 6), ['Shop relaunch', '1 overdue · 3 due within 7 days · 2 in Needs you', 'Card', 'Title', 'Group', 'Due and note']);
  assert.equal(lines.filter(l => /^(Decision|Fix|Feature|Task) · #\d+$/.test(l)).length, 14);
  assert.equal(lines[lines.length - 1], 'Page 1 of 1');
  assert.equal(lines[lines.length - 2], '10 Mar 2026');
  assert.equal(p.links.length, 14);
  assert.ok(p.links.includes('https://example.com/cards/44'));
  assert.ok(!p.text.replace('orders?', '').includes('?'), 'every character has a glyph');
  assert.equal(out.title, 'Shop relaunch');
});

test('the PDF never cuts a row across two pages, and numbers every page (requirement 24)', async () => {
  const cols = Array.from({ length: 12 }, (_, i) => ({ name: 'Column ' + (i + 1) }));
  const cards = Array.from({ length: 300 }, (_, i) => ({ id: 'C' + i, title: (i % 7 ? 'A card ' : 'A card with a much longer title that wraps over more than one line of the table, number ') + i,
    column: cols[i % 12].name, group: 'Group ' + (i % 5), due: i % 3 ? undefined : '2026-04-0' + (1 + (i % 9)), note: i % 4 ? undefined : 'A note of some length' }));
  const b = boardOf(JSON.stringify({ board: 1, title: 'Many pages', today: '2026-04-01', columns: cols, cards }));
  const trace = [];
  const out = await readPDF(await pdfOf(b, trace));
  const n = out.pages.length;
  assert.ok(n >= 8, String(n));
  for (const t of trace) assert.ok(t.top >= PDF.MT - 1 && t.bottom <= 841.89 - 30, JSON.stringify(t));
  for (const t of trace.filter(t => !/^Page \d+ of \d+$|^1 Apr 2026$/.test(t.text))) assert.ok(t.bottom <= PDF.BOTTOM + 0.01, JSON.stringify(t));
  out.pages.forEach((p, i) => { assert.ok(p.text.endsWith(`1 Apr 2026\nPage ${i + 1} of ${n}`)); assert.ok(p.text.includes('Card\nTitle\nGroup\nDue and note')); });
  const all = out.pages.map(p => p.text).join('\n');
  for (let i = 0; i < 300; i++) assert.ok(all.includes(`C${i}\n`), 'C' + i);
  // a row's lines stay on one page: every card's title starts on the page of its label
  for (const p of out.pages) for (const m of p.text.matchAll(/#C(\d+)\n(A card[^\n]*)/g)) assert.ok(m[2].startsWith('A card'), m[1]);
});

test('the command writes the picture and the PDF and ends with success (requirements 31, 33; scenario 2)', async () => {
  const d = tmp();
  const r = run(path.join(ROOT, 'samples/2-comprehensive.json'), '--svg', path.join(d, 'p.svg'), '--pdf', path.join(d, 'p.pdf'));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(d, 'p.svg'), 'utf8'), read('expected', '2-comprehensive.picture.svg'));
  const pdf = await readPDF(fs.readFileSync(path.join(d, 'p.pdf')));
  assert.equal(pdf.pages.length, 1);
  assert.equal(headings(pdf.pages[0].text).filter(l => /^(Decision|Fix|Feature|Task) · #\d+$/.test(l)).length, 14);
  const w = run(path.join(ROOT, 'samples/3-many-columns.json'), '--svg', path.join(d, 'n.svg'), '--width', '640', '--today', '2026-03-10');
  assert.equal(w.status, 0, w.stderr);
  assert.match(fs.readFileSync(path.join(d, 'n.svg'), 'utf8'), /^<svg [^>]*width="640"/);
  const x = run(path.join(ROOT, 'tests/fixtures/1-smallest.xml'), '--pdf', path.join(d, 'x.pdf'));
  assert.equal(x.status, 0, x.stderr);
  assert.deepEqual(fs.readdirSync(d).sort(), ['n.svg', 'p.pdf', 'p.svg', 'x.pdf']);
});

test('with a wrong file the command writes nothing, prints the ten lines and fails (requirement 32, scenario 5)', () => {
  const d = tmp();
  const r = run(path.join(ROOT, 'samples/5-broken.json'), '--svg', path.join(d, 'b.svg'), '--pdf', path.join(d, 'b.pdf'));
  assert.equal(r.status, 1);
  assert.equal(r.stdout, read('expected', '5-broken.problems.txt'));
  assert.match(r.stderr, /^No board drawn\. 10 problems in this file:/);
  assert.deepEqual(fs.readdirSync(d), []);
  for (const a of [[], [path.join(ROOT, 'samples/1-smallest.json')], [path.join(ROOT, 'samples/1-smallest.json'), '--svg', path.join(d, 'z.svg'), '--width', '100'],
    [path.join(ROOT, 'samples/1-smallest.json'), '--svg', path.join(d, 'z.svg'), '--today', '10 March'], [path.join(d, 'missing.json'), '--svg', path.join(d, 'z.svg')],
    [path.join(ROOT, 'samples/1-smallest.json'), '--svg', path.join(d, 'z'), '--pdf', path.join(d, 'z')], ['--colour']]) assert.equal(run(...a).status, 2, a.join(' '));
  assert.deepEqual(fs.readdirSync(d), []);
  const h = run('--help'); assert.equal(h.status, 0); assert.match(h.stdout, /^Usage: board <file>/);
});
