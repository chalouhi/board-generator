'use strict';
// Release 1.1: the card file (requirements 41–43, 45–48, 52–54, 60) and the
// buttons that ask for text, read and drawn without a browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const { B, read, sample, boardOf, toCardXML, cardSample } = require('./helpers.js');
const { cardOutputs, CARD_FILES } = require('../tools/freeze-expected.js');

const board = () => boardOf(sample('2-comprehensive.json'));
const good = () => JSON.parse(cardSample('2-comprehensive.card-43.json'));
const errorsOf = (f, id = '43') => { const r = B.readCard(typeof f === 'string' ? f : JSON.stringify(f), id); assert.equal(r.ok, false); return r.errors; };
const filled = (detail, b = board(), id = '43', listening = true, narrow = false, more) =>
  B.cardHTML(b, b.cards.find(c => c.id === id), listening, narrow, Object.assign({ status: 'filled', detail, errors: null, asking: null, open: new Set(), busy: false }, more));
const detailOf = (f, b = board()) => { const r = B.readCard(JSON.stringify(f), '43', { today: b.today }); assert.ok(r.ok, r.errors && r.errors.join('\n')); return r.card; };
const plain = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('every good card file gives its expected opened card, wide and narrow (requirement 60)', () => {
  for (const [name] of CARD_FILES) {
    const o = cardOutputs(name);
    assert.equal(o.wide, read('expected', 'cards', name + '.wide.html'), name + ' wide');
    assert.equal(o.narrow, read('expected', 'cards', name + '.narrow.html'), name + ' narrow');
  }
});

test('the broken card file, opened as card 43, gives exactly the eight messages (requirement 42, scenario 3)', () => {
  const want = read('expected', 'cards', 'broken.card.problems.txt').trimEnd().split('\n');
  assert.equal(want.length, 8);
  assert.deepEqual(errorsOf(cardSample('broken.card.json')), want);
  // drawn: "The detail could not be shown" and the list, the card's board content still there
  const b = board(), card = b.cards.find(c => c.id === '43');
  const html = B.cardHTML(b, card, true, false, { status: 'broken', errors: want, open: new Set() });
  assert.match(html, /<h2>The detail could not be shown<\/h2><ol>(<li>[^<]*<\/li>){8}<\/ol>/);
  assert.ok(html.includes('Opening hours on the home page'));
});

test('the same card as JSON and as XML gives the same opened card (requirement 41)', () => {
  const f = good();
  const xml = toCardXML(f);
  const a = B.readCard(JSON.stringify(f), '43', { today: '2026-03-10' }), x = B.readCard(xml, '43', { today: '2026-03-10' });
  assert.ok(x.ok, x.errors && x.errors.join('\n'));
  assert.deepEqual(x.card, a.card);
  assert.equal(filled(x.card), filled(a.card));
  // paragraphs and every section type survive the trip
  f.text = 'First paragraph.\n\nSecond paragraph.';
  f.sections.push({ title: 'Plan', type: 'list', numbered: true, items: [{ text: 'One' }, { text: 'Two', link: 'https://example.com/two' }] },
    { title: 'Summary', type: 'text', text: 'Some words.' }, { title: 'Empty', type: 'list', items: [] });
  f.facts.push({ label: 'Ticket', value: 'T-9', link: 'https://example.com/t9' });
  f.buttons[3].ask.long = true;
  assert.deepEqual(B.readCard(toCardXML(f), '43').card, B.readCard(JSON.stringify(f), '43').card);
  // a wrong XML card file is refused in plain words
  assert.match(errorsOf('<card version="1" id="43" title="x"><fact label="a"></card>')[0], /^The card file is not a card written as XML: <\/card> does not match <fact>/);
  assert.match(errorsOf('<board version="1"/>')[0], /the top element must be <card>, not <board>/);
});

test('the filled card: kind and id, title, text, facts after column, group and due, sections in order, buttons (requirement 45, scenario 1)', () => {
  const html = filled(detailOf(good()));
  const t = plain(html);
  assert.ok(t.startsWith('Fix · #43 Opening hours on the home page'), t);
  const order = ['The home page still shows winter hours.', 'Column Checking', 'Group Website', 'Due 14 Mar', 'Held by Sam', 'Version v14',
    'Requirements 2 of 3 done', 'Notes 2', '9 Mar · Sam', 'History 6', 'Send back', 'Discuss', 'Add note', 'Accept'];
  let at = -1;
  for (const s of order) { const i = t.indexOf(s, at + 1); assert.ok(i > at, `${s} after position ${at}: ${t}`); at = i; }
  assert.match(html, /<span class="bg-fl">Due<\/span><span class="bg-fv"><span class="bg-soon">14 Mar<\/span>/); // amber and bold
  assert.equal((html.match(/aria-label="Done"/g) || []).length, 2);
  assert.equal((html.match(/aria-label="Not done"/g) || []).length, 1);
  // History starts closed: one line with a chevron, no items
  assert.match(html, /<button type="button" class="bg-toggle" data-sec="2" aria-expanded="false"><span class="bg-sh"><span class="bg-sn">History<\/span><span class="bg-sc">6<\/span><\/span><svg class="bg-chev"/);
  assert.ok(!t.includes('Created'));
  const open = filled(detailOf(good()), undefined, '43', true, false, { open: new Set([2]) });
  assert.match(open, /aria-expanded="true"/);
  assert.ok(plain(open).endsWith('2 Mar · Sam Created Send back Discuss Add note Accept'), plain(open));
  // the buttons are the card file's, in file order, Accept filled; no Archive from the board file
  const b = board(), card = b.cards.find(c => c.id === '43');
  assert.deepEqual(B.buttonsFor(b, card, true, detailOf(good())).all.map(x => x.name), ['Accept', 'Send back', 'Discuss', 'Add note']);
  assert.deepEqual(B.buttonsFor(b, card, true, null).all.map(x => x.name), ['Accept', 'Send back', 'Discuss', 'Add note', 'Archive']);
  assert.match(html, /class="bg-btn bg-main" data-b="0">Accept</);
});

test('sections: lists numbered or not, dates with a time, "None", text paragraphs (requirements 46, 47)', () => {
  const f = good();
  f.sections = [
    { title: 'Steps', type: 'list', numbered: true, items: [{ text: 'One' }, { text: 'Two' }] },
    { title: 'Bits', type: 'list', items: [{ text: 'A' }] },
    { title: 'Log', type: 'timeline', items: [{ when: '2026-03-09T14:05', text: 'At five past two' }, { when: '2026-03-09 09:30:12Z', text: 'Morning' }, { when: '2026-12-01', text: 'No name' }] },
    { title: 'Nothing yet', type: 'checklist', items: [] },
    { title: 'About', type: 'text', text: 'One.\n\nTwo.' },
  ];
  const html = filled(detailOf(f));
  assert.match(html, /<ol class="bg-items bg-num"><li>One<\/li><li>Two<\/li><\/ol>/);
  assert.match(html, /<ul class="bg-items"><li>A<\/li><\/ul>/);
  assert.match(html, /<span class="bg-when">9 Mar, 14:05<\/span>/);
  assert.match(html, /<span class="bg-when">9 Mar, 09:30<\/span>/);
  assert.match(html, /<span class="bg-when">1 Dec<\/span>/);
  assert.match(html, /Nothing yet<\/span><span class="bg-sc">0 of 0 done<\/span><\/span><\/h2><p class="bg-none">None<\/p>/);
  assert.match(html, /<p class="bg-stext">One\.<\/p><p class="bg-stext">Two\.<\/p>/);
  assert.match(html, /Steps<\/span><span class="bg-sc">2<\/span>/);
});

test('text is only ever text; links only when they are web addresses (requirement 43)', () => {
  const f = good();
  f.title = '<img src=x onerror=alert(1)>'; f.text = '<script>alert(1)</script>';
  f.facts = [{ label: '<b>', value: '"quoted" & <i>', link: 'https://example.com/?a="b"' }];
  f.sections[0].items[0].text = '<a href="javascript:alert(1)">x</a>';
  const html = filled(detailOf(f));
  assert.doesNotMatch(html, /<script|<img|<b>|<i>|href="javascript/);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('href="https://example.com/?a=&quot;b&quot;" target="_blank" rel="noopener noreferrer"'));
  for (const bad of ['javascript:alert(1)', 'ftp://example.com', 'example.com', 'data:text/html,x']) {
    const g = good(); g.facts[0].link = bad; g.sections[1].items[0].link = bad; g.link = bad;
    assert.deepEqual(errorsOf(g), ['The link is not a web address; it must start with https:// or http://.',
      'Fact 1 ("Held by"): the link is not a web address; it must start with https:// or http://.',
      'Section 2 ("Notes"), item 1: the link is not a web address; it must start with https:// or http://.']);
  }
});

test('the limits of a card file, each in plain words; over 1 MB is one message (requirements 42, 43)', () => {
  const f = good();
  f.facts = Array.from({ length: 13 }, (_, i) => ({ label: 'L' + i, value: 'v' }));
  f.sections = Array.from({ length: 21 }, (_, i) => ({ title: 'S' + i, type: 'list', items: [] }));
  f.text = 'x'.repeat(5001);
  f.note = 'n'.repeat(61);
  assert.deepEqual(errorsOf(f), ['The note is 61 characters; the limit is 60.', 'The text is 5,001 characters; the limit is 5,000.',
    'There are 13 facts; the limit is 12.', 'There are 21 sections; the limit is 20.']);
  const g = good();
  g.sections[0].items = Array.from({ length: 201 }, () => ({ text: 'a', done: false }));
  g.facts[0].label = 'l'.repeat(25); g.facts[1].value = 'v'.repeat(61);
  g.sections[1].items[0].when = '2026-02-30';
  g.sections[2].type = 'text'; g.sections[2].text = 't'.repeat(5001);
  assert.deepEqual(errorsOf(g), [
    'Fact 1 ("lllllllllllllllllllllllll"): the label is 25 characters; the limit is 24.',
    'Fact 2 ("Version"): the value is 61 characters; the limit is 60.',
    'Section 1 ("Requirements"): there are 201 items; the limit is 200.',
    'Section 2 ("Notes"), item 1: the date ("when") is "2026-02-30"; a date is written YYYY-MM-DD, or YYYY-MM-DD HH:MM with a time.',
    'Section 3 ("History"): the text is 5,001 characters; the limit is 5,000.']);
  const big = JSON.stringify(Object.assign(good(), { text: 'é'.repeat(600000) }));
  assert.deepEqual(errorsOf(big), ['The card file is 1.1 MB; the limit is 1 MB.']);
  assert.deepEqual(errorsOf(''), ['The card file is empty.']);
  assert.deepEqual(errorsOf('[1]'), ['The card file must hold one card: {"card": 1, "id": "…", "title": "…"}.']);
  assert.match(errorsOf('{"card": 1,')[0], /^The card file is not valid JSON: /);
  assert.deepEqual(errorsOf({ card: 2, title: 'T' }), ['The format version ("card") is missing or is not 1.', 'The card\'s id ("id") is missing.']);
  // the smallest valid card file, and a number for an id
  assert.ok(B.readCard('{ "card": 1, "id": "43", "title": "Opening hours on the home page" }', '43').ok);
  assert.ok(B.readCard('{ "card": 1, "id": 43, "title": "T" }', '43').ok);
});

test('a button that asks for text: checked in both files, drawn only where the page listens (requirements 52–54)', () => {
  const b = board(), card = b.cards.find(c => c.id === '43'), d = detailOf(good());
  // not listening: Discuss only (scenario 4)
  assert.deepEqual(B.buttonsFor(b, card, false, d).all.map(x => x.name), ['Discuss']);
  // the question replaces the row of buttons; the button itself drawn filled, off while required and empty
  const asking = filled(d, b, '43', true, false, { asking: 1 });
  assert.match(asking, /<label class="bg-askl" for="bg-ask">Why is it going back\?<\/label><input id="bg-ask" class="bg-box" type="text" maxlength="2000"/);
  assert.match(asking, /<button type="button" class="bg-btn bg-plain bg-cancel">Cancel<\/button><button type="button" class="bg-btn bg-main bg-ok" data-ok="1" disabled>Send back<\/button>/);
  assert.doesNotMatch(asking, /data-b=/);
  const note = filled(d, b, '43', true, false, { asking: 3 });
  assert.match(note, /bg-ok" data-ok="3">Add note</); // not required: on from the start
  const g = good(); g.buttons[3].ask.long = true;
  assert.match(filled(detailOf(g), b, '43', true, false, { asking: 3 }), /<textarea id="bg-ask" class="bg-box" rows="4" maxlength="2000"><\/textarea>/);
  // the board file: ask is checked there too, and read from XML
  const f = JSON.parse(sample('2-comprehensive.json'));
  f.buttons.push({ name: 'Why', ask: { label: 'q'.repeat(61), required: 'yes' } }, { name: 'Both', action: 'x', confirm: 'Sure?', ask: { label: 'Why?' } }, { name: 'Odd', action: 'y', ask: 'Why?' });
  assert.deepEqual(B.read(JSON.stringify(f)).errors, [
    'Button 8 ("Why"): it has neither a link nor an action.',
    'Button 8 ("Why"): the question to ask is 61 characters; the limit is 60.',
    'Button 8 ("Why"): "required" in "ask" must be true or false.',
    'Button 8 ("Why"): it asks for text but has no action.',
    'Button 9 ("Both"): it has both a question to confirm and a text to ask for; only one is allowed.',
    'Button 10 ("Odd"): the text to ask for ("ask") must be written as {"label": "…"}.']);
  const x = B.read('<board version="1" title="T"><column name="A"/><card id="1" title="C" column="A"><button name="Note" action="note"><ask label="Note" long="yes"/></button></card></board>');
  assert.ok(x.ok, x.errors && x.errors.join('\n'));
  assert.deepEqual(x.board.cards[0].buttons[0], { name: 'Note', action: 'note', ask: { label: 'Note', long: true } });
});

test('the Refresh button is drawn only when asked for, and the 1.0 forms are unchanged without it (requirement 55)', () => {
  const b = board();
  assert.doesNotMatch(B.wideHTML(b, 1000) + B.narrowHTML(b), /Refresh/);
  assert.match(B.wideHTML(b, 1000, true, { refresh: { busy: false, failed: false } }), /<div class="bg-rwrap"><button type="button" class="bg-btn bg-refresh">Refresh<\/button><\/div><\/header>/);
  assert.match(B.narrowHTML(b, { refresh: { busy: true, failed: true } }), /<span class="bg-rfail" role="status">The board could not be refreshed<\/span><button type="button" class="bg-btn bg-refresh" disabled>Refreshing…<\/button>/);
  assert.equal(B.VERSION, '1.1.0');
});
