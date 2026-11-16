'use strict';
// The board on a wide and a narrow place, and an opened card's buttons
// (requirements 5–21; scenarios 2–4 without a browser).
const test = require('node:test');
const assert = require('node:assert/strict');
const { B, sample, boardOf } = require('./helpers.js');

const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const two = () => boardOf(sample('2-comprehensive.json'));

test('the summary, the strip and the columns of the comprehensive file (requirements 5–7, 9, 10; scenario 2)', () => {
  const b = two();
  assert.deepEqual(b.summary, ['1 overdue', '3 due within 7 days', '2 in Needs you']);
  assert.deepEqual(b.strip.cards.map(c => c.id), ['41', '38']);
  assert.deepEqual(b.columns.map(c => [c.name, B.countOf(c).text, B.countOf(c).over]),
    [['Ideas', '2', false], ['Ready', '3 / 4', false], ['Doing', '3 / 2', true], ['Checking', '1', false], ['Done', '48', false]]);
  for (const c of b.columns) assert.ok(!c.cards.some(x => x.inStrip), 'a strip card is not in its column');
  const wide = B.wideHTML(b, 1280);
  assert.match(wide, /<span class="bg-count bg-over">3 \/ 2<\/span>/);
  assert.match(wide, /<a class="bg-more" href="https:\/\/example.com\/done" target="_blank" rel="noopener noreferrer">45 more<\/a>/);
  const ids = [...wide.matchAll(/data-i="(\d+)"/g)].map(m => b.cards[+m[1]].id);
  assert.deepEqual(ids, ['41', '38', '52', '53', '47', '48', '49', '44', '45', '46', '43', '40', '39', '37']);
  const due = id => b.cards.find(c => c.id === id);
  assert.deepEqual(['49', '47', '53'].map(id => [due(id).due, due(id).tone]), [['6 Mar', 'late'], ['14 Mar', 'soon'], ['20 Apr', null]]);
  assert.equal(due('44').address, 'https://example.com/cards/44');
});

test('the smallest file: three columns of one card, no strip, no summary (scenario 1)', () => {
  const b = boardOf(sample('1-smallest.json'));
  const wide = B.wideHTML(b, 1280);
  assert.deepEqual(b.columns.map(c => [c.name, c.cards.map(x => x.title), B.countOf(c).text]),
    [['To do', ['Pack the kitchen'], '1'], ['Doing', ['Book the van'], '1'], ['Done', ['Tell the bank'], '1']]);
  assert.doesNotMatch(wide, /bg-strip|bg-chip/);
  assert.deepEqual([...wide.matchAll(/<div class="bg-l1">([^<]+)</g)].map(m => m[1]), ['#2', '#1', '#3']);
});

test('columns narrower than 210 points wrap into rows of even length (requirement 8, scenario 3)', () => {
  assert.equal(B.perRow(1280, 8), 4);
  assert.equal(B.perRow(1280, 5), 5);
  assert.equal(B.perRow(768, 5), 3);
  assert.equal(B.perRow(1000, 12), 4);
  for (let w = 768; w <= 2400; w++) for (let n = 1; n <= 12; n++) {
    const per = B.perRow(w, n), rows = Math.ceil(n / per);
    assert.ok((w - 2 * B.PAD - (per - 1) * B.GAP) / per >= B.COLUMN_MIN || per === 1, `${w}/${n}`);
    assert.ok(per * rows - n < rows, `even rows ${w}/${n}`); // rows differ by at most one column
  }
  const b = boardOf(sample('3-many-columns.json'));
  const wide = B.wideHTML(b, 1280);
  assert.match(wide, /data-per="4"/);
  assert.deepEqual([...wide.matchAll(/<section class="bg-col" aria-label="([^"]+)"/g)].map(m => m[1]),
    ['Proposed', 'Outline', 'Drafting', 'Editing', 'Photography', 'Proofs', 'Printing', 'Published']);
  assert.match(wide, /aria-label="Printing"><h2 class="bg-h"><span class="bg-name">Printing<\/span><span class="bg-count">0<\/span><\/h2><\/section>/);
  assert.deepEqual(b.summary, ['12 chapters', '3 with the editor', 'Printer booked for June']);
});

test('a card face: three lines, or two; kind and id in capitals by style; nothing empty; no button (requirements 11, 19)', () => {
  const b = two();
  const html = B.wideHTML(b, 1280);
  const card = id => { const i = b.cards.findIndex(c => c.id === id); return new RegExp(`<article[^>]*data-i="${i}"[^>]*>(.*?)</article>`).exec(html)[1]; };
  assert.equal(text(card('44')), 'Feature · #44 New checkout page with one-step payment Website · due 16 Mar');
  assert.match(card('49'), /<span class="bg-late">due 6 Mar<\/span>/);
  assert.match(card('41'), /<span class="bg-soon">due 12 Mar<\/span> · <span class="bg-note">Holding up work<\/span>/);
  assert.doesNotMatch(html, /<button|class="bg-btn/);
  assert.match(B.CSS, /\.bg-l1\{[^}]*text-transform:uppercase/);
  assert.match(B.CSS, /\.bg-t\{[^}]*-webkit-line-clamp:2/);
  const small = boardOf(sample('1-smallest.json'));
  assert.doesNotMatch(B.wideHTML(small, 1280), /bg-l3/);
  const g = boardOf(sample('4-custom-colours.json'));
  const gh = B.wideHTML(g, 1280);
  assert.doesNotMatch(gh, /bg-l1/);
  assert.ok(text(gh).includes('Sow · #3 · Greenhouse · due 5 Apr'));
  assert.equal(g.colours.column, '#F6F7EF'); assert.equal(g.colours.strip, '#F4F6E8'); assert.equal(g.colours.accent, '#4B5320');
});

test('every colour takes the file\'s value or the built-in one (requirement 13)', () => {
  const b = two();
  assert.deepEqual(b.colours, B.COLOURS);
  const g = boardOf(sample('4-custom-colours.json'));
  assert.equal(g.colours.soon, B.COLOURS.soon);
  assert.equal(g.colours.ink, '#262B0E');
});

test('the narrow form: one list, the strip first, a heading per column (requirement 15)', () => {
  const b = two();
  const n = B.narrowHTML(b);
  assert.match(n, /^<div class="bg-board bg-narrow"><header class="bg-nhead">.*<h1 class="bg-title">Shop relaunch<\/h1><\/div><div class="bg-nsum">1 overdue · 3 due within 7 days · 2 in Needs you<\/div><\/header><section class="bg-strip"/);
  assert.deepEqual([...n.matchAll(/<h2 class="bg-nh"><span class="bg-name">([^<]+)<\/span><span class="bg-count[^"]*">([^<]+)</g)].map(m => m[1] + ' ' + m[2]),
    ['Ideas 2', 'Ready 3 / 4', 'Doing 3 / 2', 'Checking 1', 'Done 48']);
  assert.equal((n.match(/class="bg-row"/g) || []).length, 12);
  assert.match(B.CSS, /\.bg-row\{[^}]*min-height:44px/);
  assert.match(B.CSS, /\.bg-btn\{[^}]*min-height:44px/);
});

test('an opened card: fields, then its buttons in order, the main one filled (requirements 17, 18, 21; scenario 4)', () => {
  const b = two();
  const c41 = b.cards.find(c => c.id === '41'), c44 = b.cards.find(c => c.id === '44');
  const names = (card, listening) => { const r = B.buttonsFor(b, card, listening); return [r.main && r.main.name, r.rest.map(x => x.name)]; };
  assert.deepEqual(names(c41, true), ['Northline', ['Swift', 'Discuss', 'Add note', 'Archive']]);
  assert.deepEqual(names(c41, false), ['Northline', ['Swift', 'Discuss', 'Archive']]);
  assert.deepEqual(names(c44, true), ['Send to checking', ['Discuss', 'Add note', 'Archive']]);
  const html = B.cardHTML(b, c41, false, false);
  assert.equal(text(html), 'Decision · #41 Which courier for next-day orders? Two quotes are in. Northline is cheaper; Swift collects on Saturdays. Column Ideas Group Launch day Due 12 Mar Note Holding up work Swift Discuss Archive Northline');
  assert.match(html, /href="https:\/\/example.com\/cards\/41\/discuss"/);
  assert.match(html, /<a class="bg-btn bg-main" data-b="0" href="https:\/\/example.com\/cards\/41\?answer=northline"/);
  const listening = B.cardHTML(b, c41, true, true);
  assert.match(listening, /bg-overlay bg-sheet/);
  assert.match(listening, /<button type="button" class="bg-btn bg-main" data-b="0">Northline<\/button>/);
  assert.match(listening, /<a class="bg-btn bg-plain" data-b="2" href="https:\/\/example.com\/cards\/41\/discuss"/); // no action: still a link
  // a card with nothing drawable has no action row
  const g = boardOf(sample('4-custom-colours.json'));
  assert.deepEqual(B.buttonsFor(g, g.cards.find(c => c.id === '3'), false).all.map(x => x.name), ['Open']);
  assert.deepEqual(B.buttonsFor(g, g.cards.find(c => c.id === '3'), true).all.map(x => x.name), ['Done', 'Open']);
});

test('buttons fit by kind, column and strip; a card\'s own come first (requirement 18)', () => {
  const f = { board: 1, title: 'T', strip: { name: 'S' }, columns: [{ name: 'A' }, { name: 'B' }],
    cards: [{ id: '1', title: 'x', column: 'a', kind: 'Spec', in_strip: true, buttons: [{ name: 'Own', action: 'own' }] }, { id: '2', title: 'y', column: 'B', kind: 'Fix' }],
    buttons: [{ name: 'Spec only', kinds: ['spec'], action: 's', main: true }, { name: 'In B', columns: ['b'], action: 'b' }, { name: 'Strip', strip_only: true, action: 'st', main: true }, { name: 'All', link: 'https://example.com/{id}' }] };
  const b = boardOf(JSON.stringify(f));
  assert.deepEqual(B.buttonsFor(b, b.cards[0], true).all.map(x => x.name), ['Own', 'Spec only', 'Strip', 'All']);
  assert.equal(B.buttonsFor(b, b.cards[0], true).main.name, 'Spec only');
  assert.deepEqual(B.buttonsFor(b, b.cards[1], true).all.map(x => x.name), ['In B', 'All']);
  assert.equal(B.linkOf(f.buttons[3], b.cards[1]), 'https://example.com/2');
});

test('"show" folds a list into "n more"; with no more_link it is plain text (requirement 10)', () => {
  const f = { board: 1, title: 'T', strip: { name: 'S', show: 1 }, columns: [{ name: 'A', show: 2 }],
    cards: [1, 2, 3, 4].map(i => ({ id: String(i), title: 't' + i, column: 'A' })).concat([5, 6].map(i => ({ id: String(i), title: 's', column: 'A', in_strip: true }))) };
  const b = boardOf(JSON.stringify(f));
  const w = B.wideHTML(b, 1280);
  assert.match(w, /<\/div><span class="bg-more">1 more<\/span><\/section><div class="bg-cols"/);
  assert.match(w, /<span class="bg-more">2 more<\/span><\/section><\/div><\/div>$/);
  assert.equal((B.wideHTML(b, 1280, false).match(/<article/g) || []).length, 6);
});
