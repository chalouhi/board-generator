'use strict';
// The demo page and the script for other pages, in a real browser
// (scenarios 1, 3, 4, 5; requirements 14–21, 25–30, 34–36). Needs Playwright
// with Chromium; skipped when it is not installed. No network is used: the
// pages are served from this machine, every request after a page has loaded
// fails the test, and links to example.com are answered here.
//   SHOTS=<folder> also saves screenshots there.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.js');
const { ROOT, sample, toXML } = require('../helpers.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { /* skipped below */ }
const SHOTS = process.env.SHOTS;
const skip = chromium ? false : 'Playwright is not installed';

let server, browser;
test.before(async () => { if (skip) return; server = await serve(); browser = await chromium.launch(); });
test.after(async () => { if (browser) await browser.close(); if (server) server.close(); });

async function open(width, url = '', height = 900) {
  const context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
  // Links that open a card's page are answered here, so no network is needed.
  await context.route(/^https?:\/\/example\.com\//, r => r.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' }));
  const page = await context.newPage();
  const errors = [], dialogs = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
  await page.goto(server.url + url, { waitUntil: 'load' });
  const late = [];
  page.on('request', r => { if (!/^(data|blob):/.test(r.url())) late.push(r.url()); });
  return { page, context, late, errors, dialogs };
}
// Waits until fn (run in the page) is true. Plain polling: the pages'
// security policy forbids the string evaluation waitForFunction uses.
async function until(page, fn, arg, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    if (await page.evaluate(fn, arg)) return;
    if (Date.now() > end) throw new Error('timed out waiting for ' + fn);
    await new Promise(r => setTimeout(r, 20));
  }
}
async function give(page, name, text, how = 'drop') {
  await page.evaluate(() => document.getElementById('out').removeAttribute('data-state'));
  if (how === 'drop') {
    await page.evaluate(([name, text]) => {
      const dt = new DataTransfer();
      dt.items.add(new File([text], name, { type: name.endsWith('.xml') ? 'application/xml' : 'application/json' }));
      document.getElementById('drop').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, [name, text]);
  } else if (how === 'choose') {
    await page.setInputFiles('#file', { name, mimeType: 'application/json', buffer: Buffer.from(text) });
  } else {
    await page.evaluate(() => { document.getElementById('pastebox').open = true; });
    await page.fill('#paste', text);
  }
  await until(page, () => document.getElementById('out').getAttribute('data-state'));
}
// What the board shows, read from the page (inside the shadow root).
const look = (page, sel = '#out') => page.evaluate(sel => {
  const host = document.querySelector(sel).shadowRoot.querySelector('.bg');
  const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null);
  const cols = [...host.querySelectorAll('.bg-col, .bg-ncol')].map(s => ({
    name: txt(s.querySelector('.bg-name')), count: txt(s.querySelector('.bg-count')), top: s.getBoundingClientRect().top,
    cards: [...s.querySelectorAll('[data-i]')].map(c => ({ l1: txt(c.querySelector('.bg-l1')), title: txt(c.querySelector('.bg-t')), l3: txt(c.querySelector('.bg-l3')), h: c.getBoundingClientRect().height })),
  }));
  const strip = host.querySelector('.bg-strip');
  const err = host.querySelector('.bg-problems');
  return {
    form: host.getAttribute('data-form'), html: host.innerHTML, cols,
    strip: strip && { name: txt(strip.querySelector('.bg-name')), cards: [...strip.querySelectorAll('[data-i]')].map(c => txt(c.querySelector('.bg-t'))) },
    chips: [...host.querySelectorAll('.bg-chip')].map(txt), nsum: txt(host.querySelector('.bg-nsum')),
    buttonsOnFaces: host.querySelectorAll('.bg-board .bg-btn, .bg-board button').length,
    err: err && { head: txt(err.querySelector('h1')), items: [...err.querySelectorAll('li')].map(txt) },
    downloads: ['dl-svg', 'dl-pdf'].map(id => { const b = document.getElementById(id); return b ? b.disabled : null; }),
    scrollW: document.documentElement.scrollWidth,
  };
}, sel);
// Opens a card by its id, by clicking it (or with the keyboard).
async function openCard(page, id, sel = '#out') {
  await page.locator(`${sel} >> [data-i][aria-label*="#${id}:"]`).click();
  await until(page, sel => !!document.querySelector(sel).shadowRoot.querySelector('.bg-dialog'), sel);
}
const dialog = (page, sel = '#out') => page.evaluate(sel => {
  const d = document.querySelector(sel).shadowRoot.querySelector('.bg-dialog');
  if (!d) return null;
  return {
    label: d.querySelector('.bg-l1').textContent, title: d.querySelector('.bg-dtitle').textContent, text: (d.querySelector('.bg-text') || {}).textContent || null,
    fields: [...d.querySelectorAll('.bg-field')].map(f => [f.querySelector('.bg-fl').textContent, f.querySelector('.bg-fv').textContent]),
    buttons: [...d.querySelectorAll('.bg-btn')].map(b => ({ name: b.textContent, main: b.classList.contains('bg-main'), tag: b.tagName, href: b.getAttribute('href'), h: b.getBoundingClientRect().height })),
  };
}, sel);
const press = (page, name, sel = '#out') => page.locator(`${sel} >> .bg-dialog .bg-btn`, { hasText: name }).click();
async function shot(page, name, opts) { if (SHOTS) await page.screenshot(Object.assign({ path: path.join(SHOTS, name + '.png'), fullPage: true }, opts)); }
const boardShot = async (page, name) => { if (SHOTS) await page.locator('#out').screenshot({ path: path.join(SHOTS, name + '.png') }); };

test('scenario 1: a newcomer drops the smallest file, then pastes it as XML', { skip }, async () => {
  const { page, context, late, errors } = await open(1280);
  assert.deepEqual(await page.evaluate(() => ['dl-svg', 'dl-pdf'].map(id => document.getElementById(id).disabled)), [true, true]);
  await give(page, '1-smallest.json', sample('1-smallest.json'));
  const a = await look(page);
  assert.equal(a.form, 'wide');
  assert.deepEqual(a.cols.map(c => [c.name, c.count, c.cards.map(x => x.l1 + ' ' + x.title)]),
    [['To do', '1', ['#2 Pack the kitchen']], ['Doing', '1', ['#1 Book the van']], ['Done', '1', ['#3 Tell the bank']]]);
  assert.equal(a.strip, null); assert.deepEqual(a.chips, []);
  assert.match(a.html, /<h1 class="bg-title">House move<\/h1>/);
  assert.deepEqual(a.downloads, [false, false]);
  await give(page, 'the pasted text', toXML(JSON.parse(sample('1-smallest.json'))), 'paste');
  assert.equal((await look(page)).html, a.html);
  await give(page, '1-smallest.json', sample('1-smallest.json'), 'choose');
  assert.equal((await look(page)).html, a.html);
  await boardShot(page, '1-smallest.wide');
  assert.deepEqual(late, []); assert.deepEqual(errors, []);
  await context.close();
});

test('scenario 3: many columns in two rows of four, then a phone width without asking again', { skip }, async () => {
  const { page, context, late, errors } = await open(1280);
  await give(page, '3-many-columns.json', sample('3-many-columns.json'));
  const a = await look(page);
  assert.deepEqual(a.cols.map(c => c.name), ['Proposed', 'Outline', 'Drafting', 'Editing', 'Photography', 'Proofs', 'Printing', 'Published']);
  const tops = a.cols.map(c => Math.round(c.top));
  assert.equal(new Set(tops.slice(0, 4)).size, 1); assert.equal(new Set(tops.slice(4)).size, 1); assert.ok(tops[4] > tops[0]);
  const printing = a.cols.find(c => c.name === 'Printing'); assert.equal(printing.count, '0'); assert.equal(printing.cards.length, 0);
  assert.deepEqual(a.chips, ['12 chapters', '3 with the editor', 'Printer booked for June']);
  const cut = await page.evaluate(() => [...document.getElementById('out').shadowRoot.querySelectorAll('.bg-t')].filter(t => t.scrollHeight > t.clientHeight + 1).map(t => [t.closest('[data-i]').getAttribute('aria-label').split(':')[0], t.clientHeight]));
  assert.deepEqual(cut.map(c => c[0]).sort(), ['Chapter · #CH-02', 'Chapter · #CH-06']);
  for (const [, h] of cut) assert.equal(h, 40); // two lines of 20
  await boardShot(page, '3-many-columns.wide');
  await page.setViewportSize({ width: 375, height: 800 });
  await until(page, () => document.getElementById('out').shadowRoot.querySelector('.bg').getAttribute('data-form') === 'narrow');
  const n = await look(page);
  assert.ok(n.scrollW <= 375, String(n.scrollW));
  assert.deepEqual(n.cols.map(c => c.name), ['Proposed', 'Outline', 'Drafting', 'Editing', 'Photography', 'Proofs', 'Printing', 'Published']);
  for (const c of n.cols) for (const x of c.cards) assert.ok(x.h >= 44, `${c.name}: ${x.h}`);
  const small = await page.evaluate(() => [...document.querySelectorAll('button, summary'), ...document.getElementById('out').shadowRoot.querySelectorAll('button, a.bg-more')]
    .filter(b => b.getBoundingClientRect().height > 0 && b.getBoundingClientRect().height < 44).map(b => b.textContent));
  assert.deepEqual(small, []);
  await shot(page, '3-many-columns.phone');
  assert.deepEqual(late, []); assert.deepEqual(errors, []);
  await context.close();
});

test('scenario 4: a board inside another page, with buttons that tell the page', { skip }, async () => {
  const { page, context, late, errors, dialogs } = await open(1280, 'tests/fixtures/embed.html');
  const before = await page.evaluate(() => ({ body: document.body.children.length, head: document.head.innerHTML, font: getComputedStyle(document.getElementById('before')).fontFamily }));
  await until(page, () => window.RESULT && window.RESULT.ok);
  const a = await look(page, '#place');
  assert.equal(a.form, 'wide');
  assert.equal(a.buttonsOnFaces, 0);
  assert.equal(await page.evaluate(() => document.querySelector('#place').shadowRoot.querySelector('.bg').clientWidth), 1000);
  await openCard(page, '41', '#place');
  const d41 = await dialog(page, '#place');
  assert.equal(d41.text, 'Two quotes are in. Northline is cheaper; Swift collects on Saturdays.');
  assert.deepEqual(d41.buttons.map(b => b.name), ['Swift', 'Discuss', 'Add note', 'Archive', 'Northline']); // the main one is drawn last, on the right
  assert.deepEqual(d41.buttons.filter(b => b.main).map(b => b.name), ['Northline']);
  const order = await page.evaluate(() => [...document.querySelector('#place').shadowRoot.querySelectorAll('.bg-dialog .bg-btn')].map(b => +b.getAttribute('data-b')));
  assert.deepEqual(order.map(i => ['Northline', 'Swift', 'Discuss', 'Add note', 'Archive'][i]), ['Swift', 'Discuss', 'Add note', 'Archive', 'Northline']);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, '2-comprehensive.card41.listening.png') });
  let popups = 0; context.on('page', () => popups++);
  await press(page, 'Northline', '#place');
  assert.deepEqual(await page.evaluate(() => window.ACTIONS), [['answer-northline', '41']]);
  await new Promise(r => setTimeout(r, 300));
  assert.equal(popups, 0);
  assert.equal(await dialog(page, '#place'), null);
  await openCard(page, '41', '#place');
  await press(page, 'Archive', '#place');
  assert.deepEqual(dialogs, ['Archive this card?']);
  assert.deepEqual(await page.evaluate(() => window.ACTIONS), [['answer-northline', '41']]);
  assert.notEqual(await dialog(page, '#place'), null); // "no": the card stays open, nothing happens
  await page.keyboard.press('Escape');
  await openCard(page, '44', '#place');
  const d44 = await dialog(page, '#place');
  assert.deepEqual(d44.buttons.map(b => [b.name, b.main]), [['Discuss', false], ['Add note', false], ['Archive', false], ['Send to checking', true]]);
  // a button with no action still opens its link
  const [pop] = await Promise.all([context.waitForEvent('page'), press(page, 'Discuss', '#place')]);
  await pop.waitForLoadState();
  assert.equal(pop.url(), 'https://example.com/cards/44/discuss');
  await pop.close();
  // new content for the same place, no reload (requirement 36)
  await page.evaluate(() => window.drawSample('3-many-columns.json'));
  const b = await look(page, '#place');
  assert.equal(b.cols.length, 8);
  assert.equal(await page.evaluate(() => typeof window.LOADED_AT), 'number');
  // nothing else on the page changed (requirement 34)
  const after = await page.evaluate(() => ({ body: document.body.children.length, head: document.head.innerHTML, font: getComputedStyle(document.getElementById('before')).fontFamily }));
  assert.deepEqual(after, before);
  assert.deepEqual(late, []); assert.deepEqual(errors, []);
  await context.close();

  // The demo page with the same file: it does not listen, so links only.
  const demo = await open(1280);
  await give(demo.page, '2-comprehensive.json', sample('2-comprehensive.json'));
  await openCard(demo.page, '41');
  const dd = await dialog(demo.page);
  assert.deepEqual(dd.buttons.map(x => x.name), ['Swift', 'Discuss', 'Archive', 'Northline']);
  assert.ok(dd.buttons.every(x => x.tag === 'A'));
  if (SHOTS) await demo.page.screenshot({ path: path.join(SHOTS, '2-comprehensive.card41.png') });
  const [p2] = await Promise.all([demo.context.waitForEvent('page'), press(demo.page, 'Discuss')]);
  await p2.waitForLoadState();
  assert.equal(p2.url(), 'https://example.com/cards/41/discuss');
  await p2.close();
  await give(demo.page, '4-custom-colours.json', sample('4-custom-colours.json'));
  const colours = await demo.page.evaluate(() => {
    const r = document.getElementById('out').shadowRoot, bg = s => getComputedStyle(r.querySelector(s)).backgroundColor;
    return { col: bg('.bg-col'), strip: bg('.bg-strip'), dot: bg('.bg-dot') };
  });
  assert.deepEqual(colours, { col: 'rgb(246, 247, 239)', strip: 'rgb(244, 246, 232)', dot: 'rgb(75, 83, 32)' });
  const g = await look(demo.page);
  const sow = g.cols.flatMap(c => c.cards).find(x => x.title === 'Sow tomatoes indoors');
  assert.equal(sow.l1, null); assert.equal(sow.l3, 'Sow · #3 · Greenhouse · due 5 Apr');
  await boardShot(demo.page, '4-custom-colours.wide');
  assert.deepEqual(demo.late, []); assert.deepEqual(demo.errors, []);
  await demo.context.close();
});

test('scenario 5: a wrong file removes the board and lists its ten problems', { skip }, async () => {
  const { page, context, late, errors } = await open(1280);
  await give(page, '2-comprehensive.json', sample('2-comprehensive.json'));
  await give(page, '5-broken.json', sample('5-broken.json'));
  const a = await look(page);
  assert.equal(a.cols.length, 0); assert.doesNotMatch(a.html, /bg-board/);
  assert.equal(a.err.head, 'No board drawn. 10 problems in this file');
  assert.equal(a.err.items.length, 10);
  assert.equal(a.err.items[0], 'The board name ("title") is missing.');
  assert.ok(a.err.items.includes('Card 2 (id "2"): the column "Review" is not defined. Defined: To do, Doing.'));
  assert.deepEqual(a.err.items, fs.readFileSync(path.join(ROOT, 'expected', '5-broken.problems.txt'), 'utf8').trimEnd().split('\n'));
  assert.deepEqual(a.downloads, [true, true]);
  await boardShot(page, '5-broken.problems');
  assert.deepEqual(late, []); assert.deepEqual(errors, []);
  await context.close();
});

test('every sample, wide and narrow, never wider than the page (requirement 14) and the screenshots', { skip }, async () => {
  const names = ['1-smallest', '2-comprehensive', '3-many-columns', '4-custom-colours'];
  for (const w of [320, 375, 390, 500, 767, 768, 900, 1024, 1280, 1600]) {
    const { page, context, late, errors } = await open(w);
    for (const n of names) {
      await give(page, n + '.json', sample(n + '.json'));
      const a = await look(page);
      assert.equal(a.form, w < 768 ? 'narrow' : 'wide', `${n} at ${w}`);
      assert.ok(a.scrollW <= w, `${n} at ${w}: ${a.scrollW}`);
      if (w === 1280) await boardShot(page, n + '.wide');
      if (w === 390) await shot(page, n + '.phone', { clip: undefined });
    }
    assert.deepEqual(late, []); assert.deepEqual(errors, []);
    await context.close();
  }
});

test('opening a card: click, Enter, Tab; Escape, the close button and outside close it (requirement 17)', { skip }, async () => {
  const { page, context, errors } = await open(1280);
  await give(page, '2-comprehensive.json', sample('2-comprehensive.json'));
  await page.focus('#out');
  await page.evaluate(() => document.getElementById('out').shadowRoot.querySelector('[data-i]').focus());
  await page.keyboard.press('Enter');
  let d = await dialog(page);
  assert.equal(d.label, 'Decision · #41');
  assert.deepEqual(d.fields, [['Column', 'Ideas'], ['Group', 'Launch day'], ['Due', '12 Mar'], ['Note', 'Holding up work']]);
  const focused = () => page.evaluate(() => { const a = document.getElementById('out').shadowRoot.activeElement; return a && (a.getAttribute('aria-label') || a.textContent); });
  assert.equal(await focused(), 'Close');
  await page.keyboard.press('Escape');
  assert.equal(await dialog(page), null);
  assert.equal(await focused(), 'Decision · #41: Which courier for next-day orders?');
  await page.keyboard.press('Tab');
  assert.equal(await focused(), 'Fix · #38: Photos for the new range are too dark');
  await page.keyboard.press(' ');
  assert.equal((await dialog(page)).label, 'Fix · #38');
  await page.locator('#out >> .bg-x').click();
  assert.equal(await dialog(page), null);
  await openCard(page, '44');
  await page.mouse.click(10, 10); // outside the card
  assert.equal(await dialog(page), null);
  // every card can be reached with Tab
  const n = await page.evaluate(() => document.getElementById('out').shadowRoot.querySelectorAll('[data-i][tabindex="0"]').length);
  assert.equal(n, 14);
  // on a phone the card opens full screen, the main button on top and full width
  await page.setViewportSize({ width: 390, height: 800 });
  await until(page, () => document.getElementById('out').shadowRoot.querySelector('.bg').getAttribute('data-form') === 'narrow');
  await openCard(page, '44');
  const box = await page.evaluate(() => {
    const r = document.getElementById('out').shadowRoot, m = r.querySelector('.bg-main').getBoundingClientRect(), o = r.querySelector('.bg-plain').getBoundingClientRect();
    return { mainW: m.width, mainTop: m.top, otherTop: o.top, sheet: !!r.querySelector('.bg-sheet') };
  });
  assert.ok(box.sheet); assert.ok(box.mainTop < box.otherTop); assert.ok(box.mainW > 300);
  await shot(page, '2-comprehensive.card44.phone', { fullPage: false });
  assert.deepEqual(errors, []);
  await context.close();
});

test('downloads give the picture and the PDF; nothing is sent; 500 cards within 1 second (requirements 26, 27, 30)', { skip }, async () => {
  const { page, context, late, errors } = await open(1280);
  await give(page, '2-comprehensive.json', sample('2-comprehensive.json'));
  const [svg] = await Promise.all([page.waitForEvent('download'), page.click('#dl-svg')]);
  assert.equal(svg.suggestedFilename(), 'shop-relaunch.svg');
  const svgText = fs.readFileSync(await svg.path(), 'utf8');
  assert.equal(svgText, fs.readFileSync(path.join(ROOT, 'expected', '2-comprehensive.picture.svg'), 'utf8'));
  const [pdf] = await Promise.all([page.waitForEvent('download'), page.click('#dl-pdf')]);
  assert.equal(pdf.suggestedFilename(), 'shop-relaunch.pdf');
  assert.equal(fs.readFileSync(await pdf.path()).subarray(0, 5).toString(), '%PDF-');
  const cols = ['To do', 'Doing', 'Checking', 'Done'].map(name => ({ name }));
  const many = JSON.stringify({ board: 1, title: 'Five hundred', today: '2026-03-10', strip: { name: 'Waiting' }, columns: cols,
    cards: Array.from({ length: 500 }, (_, i) => ({ id: String(i + 1), title: 'Card number ' + (i + 1) + ' with a title of a usual length', column: cols[i % 4].name, kind: 'Task', group: 'Group ' + (i % 6), due: `2026-03-${String(1 + (i % 28)).padStart(2, '0')}`, in_strip: i % 50 === 0 })) });
  const ms = await page.evaluate(text => {
    const t0 = performance.now();
    const dt = new DataTransfer(); dt.items.add(new File([text], 'many.json'));
    document.getElementById('out').removeAttribute('data-state');
    document.getElementById('drop').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    return new Promise(res => (function wait() { if (document.getElementById('out').getAttribute('data-state')) requestAnimationFrame(() => res(performance.now() - t0)); else setTimeout(wait, 1); })());
  }, many);
  assert.ok(ms < 1000, `${Math.round(ms)} ms`);
  assert.equal((await look(page)).cols.reduce((a, c) => a + c.cards.length, 0), 490);
  assert.deepEqual(late, []); assert.deepEqual(errors, []);
  await context.close();
});

test('the picture shows correctly by itself, with its own font loaded (requirement 22)', { skip }, async () => {
  for (const n of ['1-smallest', '2-comprehensive', '3-many-columns', '4-custom-colours']) {
    const { page, context, late, errors } = await open(1280, `expected/${n}.picture.svg`);
    const faces = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].map(f => f.family + ' ' + f.weight + ' ' + f.status); });
    assert.deepEqual(faces.sort(), ['Board Sans 400 loaded', 'Board Sans 700 loaded'], n);
    if (SHOTS) {
      const html = `<body style="margin:0"><img src="/expected/${n}.picture.svg"></body>`;
      const p = await context.newPage();
      await p.route('**/picture-page', r => r.fulfill({ contentType: 'text/html', body: html }));
      await p.goto(server.url + 'picture-page');
      await p.screenshot({ path: path.join(SHOTS, n + '.picture.png'), fullPage: true });
    }
    assert.deepEqual(late, []); assert.deepEqual(errors, []);
    await context.close();
  }
});
