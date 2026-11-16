'use strict';
// Reading the file (requirements 1–4) and the checks of the file-format guide.
const test = require('node:test');
const assert = require('node:assert/strict');
const { B, GOOD, read, sample, boardOf, toXML } = require('./helpers.js');

const base = () => ({ board: 1, title: 'T', columns: [{ name: 'To do' }, { name: 'Done' }], cards: [{ id: '1', title: 'A card', column: 'To do' }] });
const problems = file => { const r = B.read(typeof file === 'string' ? file : JSON.stringify(file)); assert.equal(r.ok, false, 'expected problems'); return r.errors; };
const look = b => B.wideHTML(b, 1280) + B.narrowHTML(b) + b.cards.map(c => B.cardHTML(b, c, true, false) + B.cardHTML(b, c, false, true)).join('');

test('every good sample reads, as JSON and as the same content in XML (requirement 1)', () => {
  for (const n of GOOD) {
    const json = sample(n + '.json');
    const a = boardOf(json), b = boardOf(toXML(JSON.parse(json)));
    assert.equal(look(b), look(a), n);
  }
  assert.equal(read('tests', 'fixtures', '1-smallest.xml'), toXML(JSON.parse(sample('1-smallest.json'))));
});

test('the broken sample draws nothing and lists its ten problems, exact wording and order (requirement 2, scenario 5)', () => {
  const want = read('expected', '5-broken.problems.txt').trimEnd().split('\n');
  assert.equal(want.length, 10);
  assert.deepEqual(problems(sample('5-broken.json')), want);
  assert.deepEqual(problems(toXML(JSON.parse(sample('5-broken.json')))), want);
});

test('the limits are refused with one message saying which (requirement 3)', () => {
  const f = base();
  f.columns = Array.from({ length: 13 }, (_, i) => ({ name: 'C' + i }));
  f.title = ''; // other problems are not listed once a limit is passed
  assert.deepEqual(problems(f), ['There are 13 columns; the limit is 12.']);
  const g = base();
  g.cards = Array.from({ length: 5001 }, (_, i) => ({ id: String(i), title: 'x', column: 'To do' }));
  assert.deepEqual(problems(g), ['There are 5,001 cards; the limit is 5,000.']);
  const big = JSON.stringify(Object.assign(base(), { pad: 'x'.repeat(5 * 1024 * 1024) }));
  assert.deepEqual(problems(big), ['The file is 5.0 MB; the limit is 5 MB.']);
  const ok = base();
  ok.cards = Array.from({ length: 5000 }, (_, i) => ({ id: String(i), title: 'x', column: 'To do' }));
  ok.columns = Array.from({ length: 12 }, (_, i) => ({ name: i ? 'C' + i : 'To do' }));
  assert.equal(B.read(JSON.stringify(ok)).ok, true);
});

test('every check in the guide has its message, each saying where', () => {
  const cases = [
    [f => { f.board = 2; }, 'The format version ("board") is missing or is not 1.'],
    [f => { f.columns = []; f.cards = []; }, 'There are no columns ("columns").'],
    [f => { f.columns[1] = {}; }, 'Column 2: the name is missing.'],
    [f => { f.columns[1] = { name: 'TO DO' }; }, 'Column 2: the name "TO DO" is used twice.'],
    [f => { f.columns[0].show = 1.5; }, 'Column 1 ("To do"): "show" is 1.5; it must be a whole number, 1 or more.'],
    [f => { f.columns[0].total = 'many'; }, 'Column 1 ("To do"): "total" is "many"; it must be a whole number, 1 or more.'],
    [f => { f.columns[0].total = 1; f.cards.push({ id: '2', title: 'B', column: 'to do' }); }, 'Column 1 ("To do"): the total is 1, but the file holds 2 cards in it.'],
    [f => { f.columns[0].more_link = 'javascript:alert(1)'; }, 'Column 1 ("To do"): the link for "more" is not a web address.'],
    [f => { delete f.cards; }, 'The list of cards ("cards") is missing.'],
    [f => { f.cards[0] = { title: 'x', column: 'To do' }; }, 'Card 1: the id is missing.'],
    [f => { f.cards[0].id = 'ABCDEFGHIJKLM'; }, 'Card 1 (id "ABCDEFGHIJKLM"): the id is 13 characters; the limit is 12.'],
    [f => { delete f.cards[0].title; }, 'Card 1 (id "1"): the title is missing.'],
    [f => { f.cards[0].title = 'x'.repeat(201); }, 'Card 1 (id "1"): the title is 201 characters; the limit is 200.'],
    [f => { delete f.cards[0].column; }, 'Card 1 (id "1"): the column is missing.'],
    [f => { f.today = '2026-02-30'; }, '"today" is "2026-02-30"; a date is written YYYY-MM-DD.'],
    [f => { f.cards[0].note = 'n'.repeat(61); }, 'Card 1 (id "1"): the note is 61 characters; the limit is 60.'],
    [f => { f.cards[0].text = 't'.repeat(2001); }, 'Card 1 (id "1"): the text is 2,001 characters; the limit is 2,000.'],
    [f => { f.cards[0].link = 'ftp://x'; }, 'Card 1 (id "1"): the link is not a web address; it must start with https:// or http://.'],
    [f => { f.link_pattern = 'https://example.com/cards'; }, 'The link pattern ("link_pattern") must be a web address with {id} in it.'],
    [f => { f.buttons = [{ link: 'https://example.com/{id}' }]; }, 'Button 1: the name is missing.'],
    [f => { f.buttons = [{ name: 'A name far longer than allowed', action: 'x' }]; }, 'Button 1 ("A name far longer than allowed"): the name is 30 characters; the limit is 24.'],
    [f => { f.buttons = [{ name: 'Go', action: 'go', kinds: ['Spec'] }]; }, 'Button 1 ("Go"): no card has the kind "Spec".'],
    [f => { f.buttons = [{ name: 'Go', action: 'go', columns: ['Review'] }]; }, 'Button 1 ("Go"): the column "Review" is not defined. Defined: To do, Done.'],
    [f => { f.cards[0].buttons = [{ name: 'Yes' }]; }, 'Card 1 (id "1"), button 1: it has neither a link nor an action.'],
    [f => { f.style = { card_lines: 4 }; }, 'Style: lines per card is 4; it must be 2 or 3.'],
    [f => { f.style = { colours: { shadow: '#000000' } }; }, 'Style: "shadow" is not a colour the board has. It has: accent, column, strip, label, button, ink, muted, line, soon, late.'],
    [f => { f.style = { colours: { button: '#FFDD00' } }; }, 'Style: white text cannot be read on "button" (#FFDD00): contrast 1.3 to 1; at least 4.5 is needed.'],
    [f => { f.style = { colours: { late: '#FF8A80' } }; }, 'Style: "late" (#FF8A80) cannot be read on the column tint (#F0F6F7): contrast 2.1 to 1; at least 4.5 is needed.'],
    [f => { f.summary = ['a', 'b', 'c', 'd', 'e', 'f', 'g']; }, 'The summary line ("summary") must be "auto", "off" or a list of up to 6 short texts (40 characters each).'],
    [f => { f.strip = {}; }, 'The top strip has no name.'],
  ];
  for (const [change, msg] of cases) {
    const f = base(); change(f);
    assert.deepEqual(problems(f), [msg], msg);
  }
});

test('a file that is not JSON, not XML, or not a board says so plainly', () => {
  assert.match(problems('{"board": 1,')[0], /^The file is not valid JSON: /);
  assert.match(problems('<board version="1"><column name="a"></board>')[0], /^The file is not a board written as XML: .*line 1/);
  assert.deepEqual(problems('<plan/>'), ['The file is not a board written as XML: the top element must be <board>, not <plan>.']);
  assert.match(problems('<!DOCTYPE x><board/>')[0], /DOCTYPE or declaration is not allowed/);
  assert.deepEqual(problems('[1, 2]'), ['The file must hold one board: {"board": 1, "title": "…", "columns": […], "cards": […]}.']);
  assert.deepEqual(problems('   '), ['The file is empty.']);
  // wrong types never throw
  for (const junk of ['{"board":1,"title":5,"columns":"x","cards":{}}', '{"board":1,"title":"t","columns":[null,3],"cards":[null,"x",{"id":{},"title":[],"column":7}]}',
    '{"board":1,"title":"t","columns":[{"name":"a"}],"cards":[],"buttons":[null,{"name":"b","kinds":"x","main":"yes"}],"style":{"colours":[]}}']) {
    const r = B.read(junk); assert.equal(r.ok, false); assert.ok(r.errors.length > 0);
  }
});

test('text from the file is shown as text, and only web links are followed (requirement 4)', () => {
  const f = base();
  f.title = '<img src=x onerror=alert(1)>';
  f.cards[0] = { id: '"><b>', title: '<script>alert(1)</script>', column: 'To do', note: '&amp; <i>', text: '</p><script>x()</script>', kind: '<u>' };
  f.link_pattern = 'https://example.com/c/{id}';
  const b = boardOf(JSON.stringify(f));
  const html = look(b);
  assert.doesNotMatch(html, /<script|<img|<b>|<i>|<u>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal(b.cards[0].address, 'https://example.com/c/%22%3E%3Cb%3E');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//example.com/x', 'HTTPS://example.com']) {
    const g = base(); g.cards[0].link = bad;
    assert.equal(B.read(JSON.stringify(g)).ok, false, bad);
  }
});

test('the XML form: attributes, yes and no, commas, text inside a card, buttons inside a card', () => {
  const xml = `<board version="1" title="House move" link-pattern="https://example.com/cards/{id}" today="2026-03-10">
  <column name="To do"/><column name="Doing" limit="2"/><column name="Done"/>
  <strip name="Needs you"/>
  <card id="1" title="Book the van" column="Doing" kind="Task" group="Move day" due="2026-03-14"/>
  <card id="2" title="Choose the school" column="To do" kind="Decision" in-strip="yes">Two to see &amp; compare.<button name="Pick A" action="a" main="yes"/></card>
  <button name="Done" columns="Doing, To do" main="yes" action="done"/>
  <style card-lines="2"><colour name="accent" value="#4B5320"/></style>
</board>`;
  const b = boardOf(xml);
  assert.equal(b.lines, 2);
  assert.equal(b.colours.accent, '#4B5320');
  assert.deepEqual(b.strip.cards.map(c => c.id), ['2']);
  assert.equal(b.cards[1].text, 'Two to see & compare.');
  assert.deepEqual(B.buttonsFor(b, b.cards[1], true).all.map(x => x.name), ['Pick A', 'Done']);
  assert.equal(b.cards[0].tone, 'soon');
  assert.deepEqual(problems(xml.replace('in-strip="yes"', 'in-strip="maybe"')), ['Card 2 (id "2"): "in_strip" must be true or false.']);
});

test('ids may be numbers; columns are matched with capitals ignored; "today" decides late and soon (requirement 12)', () => {
  const f = base();
  f.today = '2026-03-10';
  f.cards = [
    { id: 7, title: 'Past', column: 'to DO', due: '2026-03-09' },
    { id: 'b', title: 'Today', column: 'Done', due: '2026-03-10' },
    { id: 'c', title: 'In 7 days', column: 'Done', due: '2026-03-17' },
    { id: 'd', title: 'In 8 days', column: 'Done', due: '2026-03-18' },
  ];
  const b = boardOf(JSON.stringify(f));
  assert.deepEqual(b.cards.map(c => [c.id, c.due, c.tone]), [['7', '9 Mar', 'late'], ['b', '10 Mar', 'soon'], ['c', '17 Mar', 'soon'], ['d', '18 Mar', null]]);
  assert.deepEqual(b.summary, ['1 overdue', '2 due within 7 days']);
  assert.equal(b.columns[0].cards[0].id, '7');
});
