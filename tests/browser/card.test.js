'use strict';
// Release 1.1 in a real browser: the opened card in full, buttons that ask
// for text, Refresh (scenarios 1-4; requirements 44-58). Needs Playwright with
// Chromium; skipped when it is not installed. No network is used.
//   SHOTS=<folder> also saves screenshots there.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { serve } = require('./serve.js');
const { ROOT, sample } = require('../helpers.js');

let chromium = null;
try { ({ chromium } = require('playwright')); } catch (e) { /* skipped below */ }
const SHOTS = process.env.SHOTS;
const skip = chromium ? false : 'Playwright is not installed';
const TEXTS = {
  card43: fs.readFileSync(path.join(ROOT, 'samples', 'cards', '2-comprehensive.card-43.json'), 'utf8'),
  broken: fs.readFileSync(path.join(ROOT, 'samples', 'cards', 'broken.card.json'), 'utf8'),
};

let server, browser;
test.before(async () => { if (skip) return; server = await serve(); browser = await chromium.launch(); });
test.after(async () => { if (browser) await browser.close(); if (server) server.close(); });

async function open(width, url, height = 900) {
  const context = await browser.newContext({ viewport: { width, height } });
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
// The test page of release 1.1, started in one of its modes.
async function testPage(mode, width = 1280, height = 900) {
  const o = await open(width, 'tests/fixtures/embed11.html', height);
  await o.page.evaluate(([mode, texts]) => window.start(mode, texts), [mode, TEXTS]);
  return o;
}
async function until(page, fn, arg, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    if (await page.evaluate(fn, arg)) return;
    if (Date.now() > end) throw new Error('timed out waiting for ' + fn);
    await new Promise(r => setTimeout(r, 20));
  }
}
const SEL = '#place';
const root = sel => `document.querySelector(${JSON.stringify(sel)}).shadowRoot`;
// What the opened card shows, read inside the shadow root.
const card = (page, sel = SEL) => page.evaluate(sel => {
  const d = document.querySelector(sel).shadowRoot.querySelector('.bg-dialog');
  if (!d) return null;
  // the words of every piece of text inside, joined by spaces
  const txt = el => { if (!el) return null; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), out = []; while (w.nextNode()) out.push(w.currentNode.nodeValue); return out.join(' ').replace(/\s+/g, ' ').trim(); };
  return {
    label: txt(d.querySelector('.bg-l1')), title: txt(d.querySelector('.bg-dtitle')),
    status: txt(d.querySelector('.bg-status')), text: [...d.querySelectorAll('.bg-text')].map(txt),
    fields: [...d.querySelectorAll('.bg-field')].map(f => [txt(f.querySelector('.bg-fl')), txt(f.querySelector('.bg-fv')),
      getComputedStyle(f.querySelector('.bg-fv').firstElementChild || f.querySelector('.bg-fv')).color, getComputedStyle(f.querySelector('.bg-fv').firstElementChild || f.querySelector('.bg-fv')).fontWeight]),
    sections: [...d.querySelectorAll('.bg-sec')].map(s => ({ head: txt(s.querySelector('.bg-sh')), items: [...s.querySelectorAll('li')].map(txt), toggle: s.querySelector('.bg-toggle') ? s.querySelector('.bg-toggle').getAttribute('aria-expanded') : null,
      ticks: [...s.querySelectorAll('.bg-tick')].map(t => t.getAttribute('aria-label')), none: !!s.querySelector('.bg-none') })),
    buttons: [...d.querySelectorAll('.bg-actions .bg-btn')].map(b => ({ name: txt(b), main: b.classList.contains('bg-main'), off: !!b.disabled, tag: b.tagName, b: b.getAttribute('data-b'), h: b.getBoundingClientRect().height })),
    problems: d.querySelector('.bg-cardproblems') && { head: txt(d.querySelector('.bg-cardproblems h2')), items: [...d.querySelectorAll('.bg-cardproblems li')].map(txt) },
    ask: d.querySelector('.bg-ask') && { label: txt(d.querySelector('.bg-askl')), box: d.querySelector('.bg-box').tagName, value: d.querySelector('.bg-box').value,
      focused: document.querySelector(sel).shadowRoot.activeElement === d.querySelector('.bg-box'), h: d.querySelector('.bg-box').getBoundingClientRect().height },
    tryAgain: !!d.querySelector('.bg-try'),
  };
}, sel);
const board = (page, sel = SEL) => page.evaluate(sel => {
  const host = document.querySelector(sel).shadowRoot.querySelector('.bg');
  const txt = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null);
  const r = host.querySelector('.bg-refresh');
  return {
    cols: [...host.querySelectorAll('.bg-col, .bg-ncol')].map(s => [txt(s.querySelector('.bg-name')), txt(s.querySelector('.bg-count')), [...s.querySelectorAll('[data-i]')].map(c => c.getAttribute('aria-label').split(':')[0])]),
    refresh: r && { text: txt(r), off: r.disabled, right: Math.round(host.querySelector('.bg-head, .bg-nt').getBoundingClientRect().right - r.getBoundingClientRect().right) },
    fail: txt(host.querySelector('.bg-rfail')), scrollW: document.documentElement.scrollWidth,
  };
}, sel);
const log = page => page.evaluate(() => window.LOG.slice());
async function openCard(page, id, sel = SEL) {
  await page.locator(`${sel} >> [data-i][aria-label*="#${id}:"]`).first().click();
  await until(page, sel => !!document.querySelector(sel).shadowRoot.querySelector('.bg-dialog'), sel);
}
const press = (page, name, sel = SEL) => page.locator(`${sel} >> .bg-dialog .bg-btn`, { hasText: name }).first().click();
const filledIn = (page, sel = SEL) => until(page, sel => !document.querySelector(sel).shadowRoot.querySelector('.bg-status'), sel, 12000);
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }

test('scenario 1: an opened card shows its full detail', { skip }, async () => {
  const { page, context, late, errors } = await testPage(1);
  assert.equal(await page.evaluate(() => document.querySelector('#place').shadowRoot.querySelector('.bg').clientWidth), 1000);
  await openCard(page, '43');
  let c = await card(page);
  assert.equal(c.label, 'Fix · #43'); // drawn in capitals
  assert.equal(c.title, 'Opening hours on the home page');
  assert.equal(c.status, 'Loading…');
  assert.deepEqual(c.sections, []);
  await page.evaluate(() => { document.querySelector('#place').shadowRoot.querySelector('.bg-dialog').MARK = 1; });
  await shot(page, '11-card43.loading');
  await filledIn(page);
  c = await card(page);
  assert.equal(await page.evaluate(() => document.querySelector('#place').shadowRoot.querySelector('.bg-dialog').MARK), 1, 'filled in without closing');
  assert.equal(c.status, null);
  assert.ok(c.text[0].startsWith('The home page still shows winter hours.'));
  assert.deepEqual(c.fields.map(f => [f[0], f[1]]), [['Column', 'Checking'], ['Group', 'Website'], ['Due', '14 Mar'], ['Held by', 'Sam'], ['Version', 'v14']]);
  assert.deepEqual(c.fields[2].slice(2), ['rgb(154, 91, 0)', '700']); // amber and bold
  assert.deepEqual(c.sections.map(s => s.head), ['Requirements 2 of 3 done', 'Notes 2', 'History 6']);
  assert.deepEqual(c.sections[0].ticks, ['Done', 'Done', 'Not done']);
  assert.ok(c.sections[1].items[0].startsWith('9 Mar · Sam'));
  assert.equal(c.sections[2].toggle, 'false'); assert.deepEqual(c.sections[2].items, []);
  assert.deepEqual(c.buttons.map(b => [b.name, b.main]), [['Send back', false], ['Discuss', false], ['Add note', false], ['Accept', true]]);
  assert.deepEqual(c.buttons.map(b => ['Accept', 'Send back', 'Discuss', 'Add note'][+b.b]), ['Send back', 'Discuss', 'Add note', 'Accept']); // file order: Accept first, drawn on the right
  assert.ok(!c.buttons.some(b => b.name === 'Archive'));
  await shot(page, '11-card43.screen');
  await page.locator(`${SEL} >> .bg-toggle`).click();
  c = await card(page);
  assert.equal(c.sections[2].toggle, 'true');
  assert.equal(c.sections[2].items.length, 6);
  assert.ok(c.sections[2].items[5].endsWith('Created'));
  // Enter closes it again (and the click/tap has opened it)
  await page.keyboard.press('Enter');
  assert.equal((await card(page)).sections[2].toggle, 'false');
  assert.deepEqual(await log(page), [['card', '43']]);
  // another card, with no card file, opens as in 1.0
  await page.keyboard.press('Escape');
  await openCard(page, '41');
  c = await card(page);
  assert.equal(c.status, null);
  assert.deepEqual(c.buttons.map(b => b.name), ['Swift', 'Discuss', 'Add note', 'Archive', 'Northline']);
  assert.deepEqual(late, []); assert.deepEqual(errors, []);
  await context.close();
});

test('scenario 1 on a phone, and a tall card scrolls inside itself with its buttons in view (requirement 51)', { skip }, async () => {
  const phone = await testPage(1, 390, 1000);
  await openCard(phone.page, '43');
  await filledIn(phone.page);
  if (SHOTS) await phone.page.screenshot({ path: path.join(SHOTS, '11-card43.phone.png') });
  const geo = await phone.page.evaluate(() => {
    const r = document.querySelector('#place').shadowRoot, d = r.querySelector('.bg-dialog').getBoundingClientRect();
    return { w: d.width, h: d.height, sheet: !!r.querySelector('.bg-sheet'), main: r.querySelector('.bg-main').getBoundingClientRect().width };
  });
  assert.ok(geo.sheet); assert.equal(geo.w, 390); assert.equal(geo.h, 1000); assert.ok(geo.main > 300);
  await phone.context.close();

  const { page, context, errors } = await testPage(1, 1280, 560);
  await openCard(page, '43');
  await filledIn(page);
  await page.locator(`${SEL} >> .bg-toggle`).click();
  const g = await page.evaluate(() => {
    const r = document.querySelector('#place').shadowRoot, body = r.querySelector('.bg-dbody'), act = r.querySelector('.bg-actions').getBoundingClientRect();
    return { scrolls: body.scrollHeight > body.clientHeight + 10, actBottom: act.bottom, vh: innerHeight, pageScroll: document.documentElement.scrollHeight <= innerHeight + 1 || true };
  });
  assert.ok(g.scrolls, 'the card scrolls inside itself');
  assert.ok(g.actBottom <= g.vh, `buttons in view: ${g.actBottom} > ${g.vh}`);
  await page.evaluate(() => { document.querySelector('#place').shadowRoot.querySelector('.bg-dbody').scrollTop = 99999; });
  assert.ok((await page.evaluate(() => document.querySelector('#place').shadowRoot.querySelector('.bg-actions').getBoundingClientRect().bottom)) <= 560);
  assert.deepEqual(errors, []);
  await context.close();
});

test('scenario 2: a button asks why, and the board refreshes', { skip }, async () => {
  const { page, context, late, errors } = await testPage(2);
  await openCard(page, '43');
  await filledIn(page);
  await press(page, 'Send back');
  let c = await card(page);
  assert.deepEqual(c.ask, { label: 'Why is it going back?', box: 'INPUT', value: '', focused: true, h: c.ask.h });
  assert.deepEqual(c.buttons.map(b => [b.name, b.main, b.off]), [['Cancel', false, false], ['Send back', true, true]]);
  await press(page, 'Cancel');
  c = await card(page);
  assert.equal(c.ask, null);
  assert.deepEqual(c.buttons.map(b => b.name), ['Send back', 'Discuss', 'Add note', 'Accept']);
  assert.deepEqual(await log(page), [['card', '43']]); // the page was told nothing
  await press(page, 'Send back');
  await page.keyboard.type('   ');
  assert.equal((await card(page)).buttons[1].off, true); // only spaces
  await page.keyboard.press('Escape'); // Escape brings the buttons back too
  assert.equal((await card(page)).ask, null);
  assert.notEqual(await card(page), null);
  await press(page, 'Send back');
  await page.keyboard.type('The closing time wraps onto two lines on a phone');
  c = await card(page);
  assert.equal(c.buttons[1].off, false);
  await shot(page, '11-card43.ask');
  await press(page, 'Send back'); // confirms
  await until(page, () => window.LOG.some(l => l[0] === 'refresh'));
  await until(page, () => !document.querySelector('#place').shadowRoot.querySelector('.bg-dialog'));
  await until(page, () => !document.querySelector('#place').shadowRoot.querySelector('.bg-refresh').disabled);
  assert.deepEqual(await log(page), [['card', '43'], ['action', 'send-back', '43', 'The closing time wraps onto two lines on a phone'], ['refresh']]);
  const b = await board(page);
  const col = n => b.cols.find(x => x[0] === n);
  assert.deepEqual(col('Ready').slice(0, 2), ['Ready', '4 / 4']);
  assert.ok(col('Ready')[2].includes('Fix · #43'));
  assert.deepEqual(col('Checking').slice(0, 2), ['Checking', '0']);
  assert.deepEqual(late, []); assert.deepEqual(errors, []);
  await context.close();

  // at 375 points, up to the question
  const p = await testPage(2, 375, 760);
  await openCard(p.page, '43');
  await filledIn(p.page);
  await press(p.page, 'Send back');
  c = await card(p.page);
  assert.ok(c.ask.h >= 44, String(c.ask.h));
  for (const x of c.buttons) assert.ok(x.h >= 44, `${x.name}: ${x.h}`);
  assert.ok((await board(p.page)).scrollW <= 375);
  const small = await p.page.evaluate(() => [...document.querySelector('#place').shadowRoot.querySelectorAll('.bg-dialog button, .bg-dialog a.bg-btn, .bg-box')]
    .filter(b => b.getBoundingClientRect().height > 0 && b.getBoundingClientRect().height < 44).map(b => b.textContent || b.className));
  assert.deepEqual(small, []);
  if (SHOTS) await p.page.screenshot({ path: path.join(SHOTS, '11-card43.ask.phone.png') });
  await p.page.keyboard.press('Escape');
  const lines = await p.page.evaluate(() => [...document.querySelector('#place').shadowRoot.querySelectorAll('.bg-dialog button, .bg-dialog a.bg-btn')]
    .filter(b => b.getBoundingClientRect().height < 44).map(b => b.textContent));
  assert.deepEqual(lines, []); // every button and the closed History line
  assert.deepEqual(p.errors, []);
  await p.context.close();
});

test('a long question, Enter to confirm, and "keep open" asks for the card file again (requirements 52, 53, 56)', { skip }, async () => {
  const { page, context, errors } = await testPage(1);
  await page.evaluate(() => { window.ANSWER = 'keep open'; });
  await openCard(page, '43');
  await filledIn(page);
  await press(page, 'Add note');
  let c = await card(page);
  assert.equal(c.ask.label, 'Note');
  assert.equal(c.buttons[1].off, false); // not required
  await page.keyboard.type('  ' + 'x'.repeat(2100) + '  ');
  await page.keyboard.press('Enter');
  await until(page, () => window.LOG.filter(l => l[0] === 'card').length === 2, null, 8000);
  const l = await log(page);
  assert.deepEqual(l.map(x => x[0]), ['card', 'action', 'refresh', 'card']);
  assert.equal(l[1][3], 'x'.repeat(1998)); // the box takes 2,000 characters; the text is trimmed
  assert.notEqual(await card(page), null, 'kept open');
  await filledIn(page);
  assert.equal((await card(page)).title, 'Opening hours on the home page');
  assert.deepEqual(errors, []);
  await context.close();
});

test('scenario 3: Refresh, and a detail that fails', { skip }, async () => {
  const { page, context, late, errors } = await testPage(3);
  let b = await board(page);
  assert.deepEqual(b.refresh, { text: 'Refresh', off: false, right: b.refresh.right });
  assert.ok(b.refresh.right <= 24, String(b.refresh.right)); // at the right of the header
  assert.equal(b.cols.find(x => x[0] === 'Ideas')[1], '2');
  await page.locator(`${SEL} >> .bg-refresh`).click();
  b = await board(page);
  assert.deepEqual([b.refresh.text, b.refresh.off], ['Refreshing…', true]);
  await shot(page, '11-refreshing');
  await until(page, () => !document.querySelector('#place').shadowRoot.querySelector('.bg-refresh').disabled);
  b = await board(page);
  assert.equal(b.cols.find(x => x[0] === 'Ideas')[1], '3');
  assert.deepEqual(await log(page), [['refresh']]);
  await openCard(page, '44');
  await until(page, () => !!document.querySelector('#place').shadowRoot.querySelector('.bg-try'));
  let c = await card(page);
  assert.equal(c.title, 'New checkout page with one-step payment');
  assert.equal(c.status, 'The detail could not be loaded Try again');
  assert.deepEqual(c.buttons.map(x => [x.name, x.off]), [['Discuss', false], ['Add note', false], ['Archive', false], ['Send to checking', false]]);
  await shot(page, '11-card44.failed');
  await page.locator(`${SEL} >> .bg-try`).click();
  await filledIn(page);
  c = await card(page);
  assert.deepEqual(c.text, ['One page for address, delivery and payment. Guest checkout stays.']);
  assert.equal(c.tryAgain, false);
  await page.keyboard.press('Escape');
  await openCard(page, '45');
  await until(page, () => !!document.querySelector('#place').shadowRoot.querySelector('.bg-cardproblems'));
  c = await card(page);
  assert.equal(c.problems.head, 'The detail could not be shown');
  assert.equal(c.problems.items.length, 8);
  assert.equal(c.problems.items[0], 'The card\'s title ("title") is missing.');
  assert.equal(c.problems.items[1], 'The id is "44", but the card that was opened is "45".');
  await shot(page, '11-card45.broken');
  await page.keyboard.press('Escape');
  assert.deepEqual((await board(page)).cols, b.cols); // the board behind it is unchanged
  assert.deepEqual(await log(page), [['refresh'], ['card', '44'], ['card', '44'], ['card', '45']]);
  assert.deepEqual(late, []); assert.deepEqual(errors, []);
  await context.close();
});

test('a refresh that fails keeps the board and says so until the next success (requirement 57)', { skip }, async () => {
  const { page, context, errors } = await testPage('fail-once');
  const before = await board(page);
  await page.locator(`${SEL} >> .bg-refresh`).click();
  await until(page, () => !!document.querySelector('#place').shadowRoot.querySelector('.bg-rfail'));
  let b = await board(page);
  assert.equal(b.fail, 'The board could not be refreshed');
  assert.deepEqual(b.cols, before.cols);
  assert.equal(b.refresh.off, false);
  await shot(page, '11-refresh.failed');
  await page.locator(`${SEL} >> .bg-refresh`).click();
  await until(page, () => !document.querySelector('#place').shadowRoot.querySelector('.bg-rfail') && !document.querySelector('#place').shadowRoot.querySelector('.bg-refresh').disabled);
  b = await board(page);
  assert.equal(b.fail, null);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a card file that never arrives: "could not be loaded" after 10 seconds (requirement 49)', { skip }, async () => {
  const { page, context, errors } = await testPage(1);
  await openCard(page, '46');
  const t0 = Date.now();
  assert.equal((await card(page)).status, 'Loading…');
  await until(page, () => !!document.querySelector('#place').shadowRoot.querySelector('.bg-try'), null, 12000);
  const ms = Date.now() - t0;
  assert.ok(ms >= 9500 && ms < 11500, String(ms));
  const c = await card(page);
  assert.equal(c.status, 'The detail could not be loaded Try again');
  assert.deepEqual(c.buttons.map(x => x.name), ['Discuss', 'Add note', 'Archive', 'Send to checking']);
  assert.deepEqual(errors, []);
  await context.close();
});

test('scenario 4: the demo page opens card 43 in full, card 41 as in 1.0, has no Refresh, sends nothing (requirement 58)', { skip }, async () => {
  const { page, context, late, errors } = await open(1280, '');
  await page.evaluate(text => {
    const dt = new DataTransfer(); dt.items.add(new File([text], '2-comprehensive.json', { type: 'application/json' }));
    document.getElementById('drop').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, sample('2-comprehensive.json'));
  await until(page, () => document.getElementById('out').getAttribute('data-state'));
  assert.equal((await board(page, '#out')).refresh, null);
  await openCard(page, '43', '#out');
  await filledIn(page, '#out');
  let c = await card(page, '#out');
  assert.deepEqual(c.sections.map(s => s.head.split(' ')[0]), ['Requirements', 'Notes', 'History']);
  assert.deepEqual(c.buttons.map(b => [b.name, b.tag]), [['Discuss', 'A']]);
  await shot(page, '11-demo.card43');
  await page.keyboard.press('Escape');
  await openCard(page, '41', '#out');
  c = await card(page, '#out');
  assert.equal(c.status, null);
  assert.deepEqual(c.sections, []);
  assert.deepEqual(c.buttons.map(b => b.name).sort(), ['Archive', 'Discuss', 'Northline', 'Swift']);
  assert.deepEqual(late, []); assert.deepEqual(errors, []);
  await context.close();
});
