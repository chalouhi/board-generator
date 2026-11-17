/*!
 * Board Generator 1.1.0 — one file in, one board out.
 * MIT licence. https://github.com/chalouhi/board-generator
 *
 * This single file is everything a web page needs: the reader (JSON and XML)
 * for the board file and the card file, the checks, and the board drawn as a
 * page, with cards that open. Include it and call
 * BoardGenerator.draw(place, fileText, options). In Node:
 * require('./src/board.js'). It makes no network request of any kind: a page
 * that wants cards in full or a Refresh button hands the files over itself.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BoardGenerator = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = '1.1.0';
  // Limits of a file (file-format guide, sections 2 and 6).
  const MAX_BYTES = 5 * 1024 * 1024, MAX_CARDS = 5000, MAX_COLUMNS = 12;
  const MAX_TITLE = 200, MAX_NOTE = 60, MAX_TEXT = 2000, MAX_ID = 12, MAX_BUTTON = 24, MAX_SUMMARY = 6, MAX_SUMMARY_TEXT = 40;
  // Layout measures. They are fixed: a file cannot change them.
  const NARROW_BELOW = 768, COLUMN_MIN = 210, PAD = 24, GAP = 12;
  const FONT = 'Calibri, Carlito, "Segoe UI", Arial, sans-serif';
  const COLOURS = {
    accent: '#FF5B04', column: '#F0F6F7', strip: '#FFF3EC', label: '#075056', button: '#075056',
    ink: '#16232A', muted: '#5F7078', line: '#D3E0E3', soon: '#9A5B00', late: '#C62828',
  };
  // Which background each text colour is read on (worst pair reported once).
  const READ_ON = [['ink', ['white', 'column', 'strip']], ['muted', ['white', 'column', 'strip']], ['label', ['white']],
    ['soon', ['white']], ['late', ['white', 'column']]];
  const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  const HEX = /^#[0-9A-Fa-f]{6}$/;
  const WEB = /^https?:\/\/\S+$/;
  const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
  // The card file (card-file guide): its limits, and how long the tool waits.
  const CARD_MAX_BYTES = 1024 * 1024, MAX_FACTS = 12, MAX_SECTIONS = 20, MAX_ITEMS = 200, MAX_CARD_TEXT = 5000;
  const MAX_LABEL = 24, MAX_VALUE = 60, MAX_ASK = 60, MAX_ANSWER = 2000, CARD_WAIT = 10000;
  const SECTION_TYPES = ['text', 'list', 'checklist', 'timeline'];
  const WHEN = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
  const KEEP_OPEN = 'keep open';

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isText = v => typeof v === 'string';
  const filled = v => typeof v === 'string' && v.trim() !== '';
  const whole = v => typeof v === 'number' && Number.isInteger(v) && v >= 1;
  const show = v => JSON.stringify(v);
  const key = s => String(s).toLowerCase();
  const thousands = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const plural = (n, one, many) => `${thousands(n)} ${n === 1 ? one : many}`;

  function utf8Length(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
    let n = 0;
    for (const ch of s) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
    return n;
  }
  function dateOf(s) { // a real calendar date written YYYY-MM-DD, as a day number
    const m = typeof s === 'string' && DATE.exec(s);
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3], t = Date.UTC(y, mo - 1, d), back = new Date(t);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
    return { day: Math.round(t / 86400000), y, m: mo, d };
  }
  // A timeline date: YYYY-MM-DD, or with a time (shown as written, no zone).
  function whenOf(s) {
    const m = typeof s === 'string' && WHEN.exec(s);
    if (!m) return null;
    const d = dateOf(m[1]);
    if (!d || (m[2] != null && (+m[2] > 23 || +m[3] > 59))) return null;
    return `${d.d} ${MONTHS[d.m - 1]}` + (m[2] != null ? `, ${m[2]}:${m[3]}` : '');
  }
  function todayOf(s) {
    const given = dateOf(s);
    if (given) return given;
    const now = new Date();
    return dateOf(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
  }
  function lum(h) {
    const v = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function contrast(a, b) {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  /* ------------------------------------------------------------------ *
   * XML (file-format guide, section 7): a small strict reader, no DOCTYPE,
   * no entities beyond the five standard ones.
   * ------------------------------------------------------------------ */
  function XmlError(msg) { this.message = msg; }
  function parseXML(src, top) {
    let i = 0;
    const n = src.length, top0 = { name: '#root', attrs: {}, children: [] }, stack = [top0];
    const fail = msg => { throw new XmlError(`${msg} (line ${src.slice(0, i).split('\n').length})`); };
    const NAME = /[A-Za-z_][\w.:-]*/y, ATTR = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/y, WS = /\s*/y;
    const decode = v => v.replace(/&(#x[0-9A-Fa-f]+|#[0-9]+|[A-Za-z]+);|&/g, (m, e) => {
      if (!e) fail('a lone "&" must be written &amp;');
      if (e[0] === '#') {
        const cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        if (!(cp > 0 && cp <= 0x10FFFF)) fail(`the character reference &${e}; is not valid`);
        return String.fromCodePoint(cp);
      }
      const named = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e];
      if (named == null) fail(`the entity &${e}; is not allowed`);
      return named;
    });
    while (i < n) {
      const lt = src.indexOf('<', i);
      const chunk = src.slice(i, lt < 0 ? n : lt);
      if (chunk && stack.length > 1) { const t = stack[stack.length - 1]; t.text = (t.text || '') + decode(chunk); }
      if (lt < 0) break;
      i = lt;
      if (src.startsWith('<?', i)) { const e = src.indexOf('?>', i); if (e < 0) fail('"<?" is not closed'); i = e + 2; continue; }
      if (src.startsWith('<!--', i)) { const e = src.indexOf('-->', i); if (e < 0) fail('a comment is not closed'); i = e + 3; continue; }
      if (src.startsWith('<![CDATA[', i)) {
        const e = src.indexOf(']]>', i); if (e < 0) fail('a CDATA section is not closed');
        if (stack.length > 1) { const t = stack[stack.length - 1]; t.text = (t.text || '') + src.slice(i + 9, e); }
        i = e + 3; continue;
      }
      if (src.startsWith('<!', i)) fail('a DOCTYPE or declaration is not allowed');
      if (src[i + 1] === '/') {
        i += 2; NAME.lastIndex = i; const m = NAME.exec(src); if (!m) fail('a closing tag has no name');
        i += m[0].length; WS.lastIndex = i; WS.exec(src); i = WS.lastIndex;
        if (src[i] !== '>') fail(`</${m[0]}> is not closed with ">"`);
        i++;
        const t = stack.pop();
        if (stack.length === 0 || t.name !== m[0]) fail(`</${m[0]}> does not match <${t.name}>`);
        continue;
      }
      i++; NAME.lastIndex = i; const m = NAME.exec(src); if (!m) fail('"<" must start a tag; write &lt; for the character');
      i += m[0].length;
      const el = { name: m[0], attrs: {}, children: [] };
      for (;;) {
        WS.lastIndex = i; WS.exec(src); const spaced = WS.lastIndex > i; i = WS.lastIndex;
        if (i >= n) fail(`<${el.name}> is not closed`);
        if (src.startsWith('/>', i)) { i += 2; stack[stack.length - 1].children.push(el); break; }
        if (src[i] === '>') { i++; stack[stack.length - 1].children.push(el); stack.push(el); break; }
        if (!spaced) fail(`<${el.name}>: attributes must be separated by spaces`);
        ATTR.lastIndex = i; const a = ATTR.exec(src);
        if (!a) fail(`<${el.name}>: an attribute is not written name="value"`);
        if (has(el.attrs, a[1])) fail(`<${el.name}>: the attribute ${a[1]} is given twice`);
        el.attrs[a[1]] = decode(a[2] != null ? a[2] : a[3]);
        i += a[0].length;
      }
    }
    if (stack.length !== 1) { i = n; fail(`<${stack[stack.length - 1].name}> is not closed`); }
    if (top0.children.length !== 1) { i = 0; fail(`the file must hold exactly one top element, <${top || 'board'}>`); }
    return top0.children[0];
  }

  // The XML form mapped to the object the JSON form gives: attributes take the
  // field names with hyphens for underscores, yes/no for true/false, commas
  // for lists, and a card's text is the text inside its element.
  const xnum = v => (/^\s*-?\d+\s*$/.test(v) ? Number(v) : v);
  const xyn = v => (v === 'yes' ? true : v === 'no' ? false : v);
  const xlist = v => v.split(',').map(s => s.trim()).filter(Boolean);
  const take = (a, spec) => {
    const o = {};
    for (const [attr, field, conv] of spec) if (has(a, attr)) o[field] = conv ? conv(a[attr]) : a[attr];
    return o;
  };
  const XBUTTON = [['name', 'name'], ['link', 'link'], ['action', 'action'], ['kinds', 'kinds', xlist], ['columns', 'columns', xlist],
    ['strip-only', 'strip_only', xyn], ['main', 'main', xyn], ['confirm', 'confirm']];
  // A <button>, with an optional <ask label="…" required="yes" long="no"/> inside.
  function xmlButton(k) {
    const b = take(k.attrs, XBUTTON);
    const ask = k.children.find(x => x.name === 'ask');
    if (ask) b.ask = take(ask.attrs, [['label', 'label'], ['required', 'required', xyn], ['long', 'long', xyn]]);
    return b;
  }
  // Text written inside an element: trimmed, and each line's indent removed.
  const xtext = el => (el.text || '').split('\n').map(l => l.trim()).join('\n').trim();

  function xmlToFile(el) {
    if (el.name !== 'board') throw new XmlError(`the top element must be <board>, not <${el.name}>`);
    const num = xnum, yn = xyn, list = xlist, BUTTON = XBUTTON;
    const file = take(el.attrs, [['version', 'board', num], ['title', 'title'], ['today', 'today'], ['link-pattern', 'link_pattern'],
      ['summary', 'summary', v => (v === 'auto' || v === 'off' ? v : list(v))]]);
    file.columns = []; file.cards = [];
    for (const c of el.children) {
      if (c.name === 'column') file.columns.push(take(c.attrs, [['name', 'name'], ['limit', 'limit', num], ['show', 'show', num], ['total', 'total', num], ['more-link', 'more_link']]));
      else if (c.name === 'strip') file.strip = take(c.attrs, [['name', 'name'], ['show', 'show', num]]);
      else if (c.name === 'button') (file.buttons = file.buttons || []).push(xmlButton(c));
      else if (c.name === 'style') {
        file.style = take(c.attrs, [['card-lines', 'card_lines', num]]);
        for (const k of c.children) if (k.name === 'colour') (file.style.colours = file.style.colours || {})[k.attrs.name] = k.attrs.value;
      } else if (c.name === 'card') {
        const card = take(c.attrs, [['id', 'id'], ['title', 'title'], ['column', 'column'], ['kind', 'kind'], ['group', 'group'], ['due', 'due'],
          ['note', 'note'], ['in-strip', 'in_strip', yn], ['link', 'link']]);
        const text = (c.text || '').trim();
        if (text) card.text = text;
        const buttons = c.children.filter(k => k.name === 'button').map(xmlButton);
        if (buttons.length) card.buttons = buttons;
        file.cards.push(card);
      }
    }
    return file;
  }

  // The card file as XML (card-file guide): <card version="1" id="…" title="…">
  // with the description as the text inside it, then <fact/>, <section> with
  // <item>s, and <button>s.
  function xmlToCard(el) {
    if (el.name !== 'card') throw new XmlError(`the top element must be <card>, not <${el.name}>`);
    const card = take(el.attrs, [['version', 'card', xnum], ['id', 'id'], ['title', 'title'], ['kind', 'kind'], ['column', 'column'],
      ['group', 'group'], ['due', 'due'], ['note', 'note'], ['link', 'link']]);
    const text = xtext(el);
    if (text) card.text = text;
    for (const c of el.children) {
      if (c.name === 'fact') (card.facts = card.facts || []).push(take(c.attrs, [['label', 'label'], ['value', 'value'], ['link', 'link']]));
      else if (c.name === 'button') (card.buttons = card.buttons || []).push(xmlButton(c));
      else if (c.name === 'section') {
        const s = take(c.attrs, [['title', 'title'], ['type', 'type'], ['numbered', 'numbered', xyn], ['collapsed', 'collapsed', xyn]]);
        if (s.type === 'text') { const t = xtext(c); if (t) s.text = t; } else {
          s.items = c.children.filter(k => k.name === 'item').map(k => {
            const it = take(k.attrs, [['when', 'when'], ['who', 'who'], ['done', 'done', xyn], ['link', 'link']]);
            const t = xtext(k);
            if (t) it.text = t;
            return it;
          });
        }
        (card.sections = card.sections || []).push(s);
      }
    }
    return card;
  }

  /* ------------------------------------------------------------------ *
   * The checks. Every problem is listed, in file order, in plain words.
   * ------------------------------------------------------------------ */
  function limits(file) { // the safety limits are reported alone (requirement 3)
    if (Array.isArray(file.columns) && file.columns.length > MAX_COLUMNS) return [`There are ${file.columns.length} columns; the limit is ${MAX_COLUMNS}.`];
    if (Array.isArray(file.cards) && file.cards.length > MAX_CARDS) return [`There are ${thousands(file.cards.length)} cards; the limit is ${thousands(MAX_CARDS)}.`];
    return [];
  }

  function buttonProblems(b, w, own) {
    const p = [];
    if (!isObj(b)) return [`${w}: it is not a button; write it as {"name": "…", "link": "…"}.`];
    if (!filled(b.name)) p.push(`${w}: the name is missing.`);
    else if (b.name.length > MAX_BUTTON) p.push(`${w}: the name is ${b.name.length} characters; the limit is ${MAX_BUTTON}.`);
    const link = has(b, 'link') && b.link !== '' ? b.link : null, action = has(b, 'action') && b.action !== '' ? b.action : null;
    if (link == null && action == null) p.push(`${w}: it has neither a link nor an action.`);
    if (link != null && !(isText(link) && WEB.test(link))) p.push(`${w}: the link is not a web address; it must start with https:// or http://.`);
    if (action != null && !isText(action)) p.push(`${w}: the action must be text.`);
    if (has(b, 'confirm') && !isText(b.confirm)) p.push(`${w}: the question to confirm must be text.`);
    if (has(b, 'ask')) { // a button that asks for a line of text (release 1.1)
      const a = b.ask;
      if (!isObj(a)) p.push(`${w}: the text to ask for ("ask") must be written as {"label": "…"}.`);
      else {
        if (!filled(a.label)) p.push(`${w}: the question to ask ("label") is missing.`);
        else if (a.label.length > MAX_ASK) p.push(`${w}: the question to ask is ${a.label.length} characters; the limit is ${MAX_ASK}.`);
        for (const k of ['required', 'long']) if (has(a, k) && typeof a[k] !== 'boolean') p.push(`${w}: "${k}" in "ask" must be true or false.`);
      }
      if (action == null) p.push(`${w}: it asks for text but has no action.`);
      if (has(b, 'confirm')) p.push(`${w}: it has both a question to confirm and a text to ask for; only one is allowed.`);
    }
    for (const k of own ? ['main'] : ['main', 'strip_only']) if (has(b, k) && typeof b[k] !== 'boolean') p.push(`${w}: "${k}" must be true or false.`);
    if (!own) for (const k of ['kinds', 'columns']) if (has(b, k) && !(Array.isArray(b[k]) && b[k].every(isText))) p.push(`${w}: "${k}" must be a list of names.`);
    return p;
  }

  function validate(file) {
    const p = [];
    if (file.board !== 1) p.push('The format version ("board") is missing or is not 1.');
    if (!filled(file.title)) p.push(has(file, 'title') && !isText(file.title) ? 'The board name ("title") must be text.' : 'The board name ("title") is missing.');

    const cols = Array.isArray(file.columns) ? file.columns : [];
    if (!cols.length) p.push('There are no columns ("columns").');
    const names = [];
    cols.forEach((c, i) => {
      const at = `Column ${i + 1}`;
      if (!isObj(c)) { p.push(`${at}: it is not a column; write it as {"name": "…"}.`); return; }
      const n = c.name;
      if (!filled(n)) { p.push(`${at}: the name is missing.`); return; }
      if (names.some(x => key(x) === key(n))) p.push(`${at}: the name "${n}" is used twice.`);
      else names.push(n);
      for (const k of ['limit', 'show', 'total']) {
        if (has(c, k) && !whole(c[k]) && !(k === 'total' && c[k] === 0)) p.push(`${at} ("${n}"): "${k}" is ${show(c[k])}; it must be a whole number, 1 or more.`);
      }
      if (has(c, 'more_link') && !(isText(c.more_link) && WEB.test(c.more_link))) p.push(`${at} ("${n}"): the link for "more" is not a web address.`);
    });
    const known = names.map(key);

    const strip = has(file, 'strip') ? file.strip : undefined;
    if (strip !== undefined) {
      if (!isObj(strip)) p.push('The top strip must be written as {"name": "…"}.');
      else {
        if (!filled(strip.name)) p.push('The top strip has no name.');
        if (has(strip, 'show') && !whole(strip.show)) p.push(`The top strip: "show" is ${show(strip.show)}; it must be a whole number, 1 or more.`);
      }
    }
    if (has(file, 'summary')) {
      const s = file.summary;
      const ok = s === 'auto' || s === 'off' || (Array.isArray(s) && s.length <= MAX_SUMMARY && s.every(x => filled(x) && x.length <= MAX_SUMMARY_TEXT));
      if (!ok) p.push(`The summary line ("summary") must be "auto", "off" or a list of up to ${MAX_SUMMARY} short texts (${MAX_SUMMARY_TEXT} characters each).`);
    }
    if (has(file, 'today') && !dateOf(file.today)) p.push(`"today" is ${show(file.today)}; a date is written YYYY-MM-DD.`);
    if (has(file, 'link_pattern')) {
      const lp = file.link_pattern;
      if (!(isText(lp) && WEB.test(lp) && lp.includes('{id}'))) p.push('The link pattern ("link_pattern") must be a web address with {id} in it.');
    }

    const cards = Array.isArray(file.cards) ? file.cards : null;
    if (!cards) p.push('The list of cards ("cards") is missing.');
    const ids = new Set(), kinds = new Set(), per = {};
    (cards || []).forEach((c, i) => {
      if (!isObj(c)) { p.push(`Card ${i + 1}: it is not a card; write it as {"id": "…", "title": "…", "column": "…"}.`); return; }
      const idOk = (isText(c.id) && c.id !== '') || (typeof c.id === 'number' && Number.isFinite(c.id));
      const id = idOk ? String(c.id) : null;
      const w = `Card ${i + 1}` + (id ? ` (id "${id}")` : '');
      if (!id) p.push(has(c, 'id') && c.id !== '' ? `${w}: the id must be text or a number.` : `${w}: the id is missing.`);
      else {
        if (id.length > MAX_ID) p.push(`${w}: the id is ${id.length} characters; the limit is ${MAX_ID}.`);
        if (ids.has(id)) p.push(`${w}: the id "${id}" is used twice.`);
        ids.add(id);
      }
      if (!filled(c.title)) p.push(`${w}: the title is missing.`);
      else if (c.title.length > MAX_TITLE) p.push(`${w}: the title is ${c.title.length} characters; the limit is ${MAX_TITLE}.`);
      if (!filled(c.column)) p.push(`${w}: the column is missing.`);
      else if (!known.includes(key(c.column))) p.push(`${w}: the column "${c.column}" is not defined. Defined: ${names.join(', ')}.`);
      else per[key(c.column)] = (per[key(c.column)] || 0) + 1;
      for (const k of ['kind', 'group', 'note', 'text']) if (has(c, k) && !isText(c[k])) p.push(`${w}: "${k}" must be text.`);
      if (has(c, 'due') && !dateOf(c.due)) p.push(`${w}: the due date is ${show(c.due)}; a date is written YYYY-MM-DD.`);
      if (has(c, 'in_strip') && typeof c.in_strip !== 'boolean') p.push(`${w}: "in_strip" must be true or false.`);
      if (c.in_strip === true && strip === undefined) p.push(`${w}: it is marked for the top strip, but the file has no top strip.`);
      if (isText(c.note) && c.note.length > MAX_NOTE) p.push(`${w}: the note is ${c.note.length} characters; the limit is ${MAX_NOTE}.`);
      if (isText(c.text) && c.text.length > MAX_TEXT) p.push(`${w}: the text is ${thousands(c.text.length)} characters; the limit is ${thousands(MAX_TEXT)}.`);
      if (has(c, 'link') && !(isText(c.link) && WEB.test(c.link))) p.push(`${w}: the link is not a web address; it must start with https:// or http://.`);
      if (filled(c.kind)) kinds.add(key(c.kind));
      if (has(c, 'buttons')) {
        if (!Array.isArray(c.buttons)) p.push(`${w}: "buttons" must be a list.`);
        else c.buttons.forEach((b, j) => p.push(...buttonProblems(b, `${w}, button ${j + 1}`, true)));
      }
    });
    cols.forEach((c, i) => {
      if (isObj(c) && filled(c.name) && whole(c.total) && c.total < (per[key(c.name)] || 0)) {
        p.push(`Column ${i + 1} ("${c.name}"): the total is ${c.total}, but the file holds ${per[key(c.name)]} cards in it.`);
      }
    });

    if (has(file, 'buttons') && !Array.isArray(file.buttons)) p.push('The buttons ("buttons") must be a list.');
    (Array.isArray(file.buttons) ? file.buttons : []).forEach((b, j) => {
      const w = `Button ${j + 1}` + (isObj(b) && filled(b.name) ? ` ("${b.name}")` : '');
      p.push(...buttonProblems(b, w, false));
      if (!isObj(b)) return;
      if (Array.isArray(b.kinds)) for (const k of b.kinds) if (isText(k) && !kinds.has(key(k))) p.push(`${w}: no card has the kind "${k}".`);
      if (Array.isArray(b.columns)) for (const k of b.columns) if (isText(k) && !known.includes(key(k))) p.push(`${w}: the column "${k}" is not defined. Defined: ${names.join(', ')}.`);
    });

    const st = has(file, 'style') ? file.style : {};
    if (!isObj(st)) p.push('The style ("style") must be written as {"card_lines": 3, "colours": {…}}.');
    else {
      if (has(st, 'card_lines') && st.card_lines !== 2 && st.card_lines !== 3) p.push(`Style: lines per card is ${show(st.card_lines)}; it must be 2 or 3.`);
      const col = Object.assign({}, COLOURS);
      if (has(st, 'colours') && !isObj(st.colours)) p.push('Style: the colours must be written as {"accent": "#FF5B04", …}.');
      for (const [k, v] of Object.entries(isObj(st.colours) ? st.colours : {})) {
        if (!has(COLOURS, k)) { p.push(`Style: "${k}" is not a colour the board has. It has: ${Object.keys(COLOURS).join(', ')}.`); continue; }
        if (!isText(v) || !HEX.test(v)) { p.push(`Style: the colour "${k}" is ${show(v)}; a colour is written as six-digit hex, like #075056.`); continue; }
        col[k] = v;
      }
      const bg = b => (b === 'white' ? '#FFFFFF' : col[b]);
      for (const [t, on] of READ_ON) {
        const worst = on.reduce((a, b) => (contrast(col[t], bg(b)) < contrast(col[t], bg(a)) ? b : a));
        const r = contrast(col[t], bg(worst));
        if (r < 4.5) p.push(`Style: "${t}" (${col[t]}) cannot be read on ${worst === 'white' ? 'white' : `the ${worst} tint (${col[worst]})`}: contrast ${r.toFixed(1)} to 1; at least 4.5 is needed.`);
      }
      const r = contrast('#FFFFFF', col.button);
      if (r < 4.5) p.push(`Style: white text cannot be read on "button" (${col.button}): contrast ${r.toFixed(1)} to 1; at least 4.5 is needed.`);
    }
    return p;
  }

  /* ------------------------------------------------------------------ *
   * The card file (release 1.1): one card in full. Every problem is
   * listed, in plain words, in a fixed order.
   * ------------------------------------------------------------------ */
  function linkProblem(o, w) {
    return has(o, 'link') && !(isText(o.link) && WEB.test(o.link)) ? [`${w}: the link is not a web address; it must start with https:// or http://.`] : [];
  }
  function longer(v, max, what) {
    return isText(v) && v.length > max ? `${what} is ${thousands(v.length)} characters; the limit is ${thousands(max)}.` : null;
  }

  function validateCard(f, opened) {
    const p = [];
    const push = m => { if (m) p.push(m); };
    if (f.card !== 1) p.push('The format version ("card") is missing or is not 1.');
    if (!filled(f.title)) p.push(has(f, 'title') && !isText(f.title) ? 'The card\'s title ("title") must be text.' : 'The card\'s title ("title") is missing.');
    else push(longer(f.title, MAX_TITLE, 'The card\'s title'));
    const idOk = (isText(f.id) && f.id !== '') || (typeof f.id === 'number' && Number.isFinite(f.id));
    if (!idOk) p.push(has(f, 'id') && f.id !== '' ? 'The card\'s id ("id") must be text or a number.' : 'The card\'s id ("id") is missing.');
    else if (opened != null && String(f.id) !== String(opened)) p.push(`The id is "${String(f.id)}", but the card that was opened is "${String(opened)}".`);
    for (const k of ['kind', 'column', 'group', 'note', 'text']) if (has(f, k) && !isText(f[k])) p.push(`"${k}" must be text.`);
    push(longer(f.note, MAX_NOTE, 'The note'));
    if (has(f, 'due') && !dateOf(f.due)) p.push(`The due date is ${show(f.due)}; a date is written YYYY-MM-DD.`);
    if (has(f, 'link') && !(isText(f.link) && WEB.test(f.link))) p.push('The link is not a web address; it must start with https:// or http://.');
    push(longer(f.text, MAX_CARD_TEXT, 'The text'));

    if (has(f, 'facts')) {
      if (!Array.isArray(f.facts)) p.push('The facts ("facts") must be a list.');
      else if (f.facts.length > MAX_FACTS) p.push(`There are ${f.facts.length} facts; the limit is ${MAX_FACTS}.`);
      else f.facts.forEach((x, i) => {
        const w = `Fact ${i + 1}` + (isObj(x) && filled(x.label) ? ` ("${x.label}")` : '');
        if (!isObj(x)) { p.push(`${w}: it is not a fact; write it as {"label": "…", "value": "…"}.`); return; }
        if (!filled(x.label)) p.push(`${w}: the label is missing.`);
        else push(longer(x.label, MAX_LABEL, `${w}: the label`));
        const v = x.value;
        if (!(filled(v) || (typeof v === 'number' && Number.isFinite(v)))) p.push(has(x, 'value') && !isText(v) ? `${w}: the value must be text or a number.` : `${w}: the value is missing.`);
        else push(longer(v, MAX_VALUE, `${w}: the value`));
        p.push(...linkProblem(x, w));
      });
    }

    if (has(f, 'sections')) {
      if (!Array.isArray(f.sections)) p.push('The sections ("sections") must be a list.');
      else if (f.sections.length > MAX_SECTIONS) p.push(`There are ${f.sections.length} sections; the limit is ${MAX_SECTIONS}.`);
      else f.sections.forEach((s, i) => {
        const w = `Section ${i + 1}` + (isObj(s) && filled(s.title) ? ` ("${s.title}")` : '');
        if (!isObj(s)) { p.push(`${w}: it is not a section; write it as {"title": "…", "type": "…"}.`); return; }
        if (!filled(s.title)) p.push(`${w}: the title is missing.`);
        if (!has(s, 'type')) p.push(`${w}: the type is missing. Known: ${SECTION_TYPES.join(', ')}.`);
        else if (!SECTION_TYPES.includes(s.type)) p.push(`${w}: the type ${isText(s.type) ? `"${s.type}"` : show(s.type)} is not known. Known: ${SECTION_TYPES.join(', ')}.`);
        for (const k of ['collapsed', 'numbered']) if (has(s, k) && typeof s[k] !== 'boolean') p.push(`${w}: "${k}" must be true or false.`);
        if (s.type === 'text') {
          if (has(s, 'text') && !isText(s.text)) p.push(`${w}: the text must be text.`);
          push(longer(s.text, MAX_CARD_TEXT, `${w}: the text`));
          return;
        }
        if (!SECTION_TYPES.includes(s.type) || !has(s, 'items')) return;
        if (!Array.isArray(s.items)) { p.push(`${w}: "items" must be a list.`); return; }
        if (s.items.length > MAX_ITEMS) { p.push(`${w}: there are ${s.items.length} items; the limit is ${MAX_ITEMS}.`); return; }
        s.items.forEach((it, j) => {
          const iw = `${w}, item ${j + 1}`;
          if (!isObj(it)) { p.push(`${iw}: it is not an item; write it as {"text": "…"}.`); return; }
          if (s.type === 'timeline') {
            if (!has(it, 'when')) p.push(`${iw}: the date ("when") is missing.`);
            else if (!whenOf(it.when)) p.push(`${iw}: the date ("when") is ${show(it.when)}; a date is written YYYY-MM-DD, or YYYY-MM-DD HH:MM with a time.`);
            if (has(it, 'who') && !isText(it.who)) p.push(`${iw}: "who" must be text.`);
          }
          if (!filled(it.text)) p.push(has(it, 'text') && !isText(it.text) ? `${iw}: the text must be text.` : `${iw}: the text is missing.`);
          else push(longer(it.text, MAX_CARD_TEXT, `${iw}: the text`));
          if (s.type === 'checklist' && typeof it.done !== 'boolean') p.push(has(it, 'done') ? `${iw}: "done" is ${show(it.done)}; it must be true or false.` : `${iw}: "done" is missing; it must be true or false.`);
          p.push(...linkProblem(it, iw));
        });
      });
    }

    if (has(f, 'buttons')) {
      if (!Array.isArray(f.buttons)) p.push('The buttons ("buttons") must be a list.');
      else f.buttons.forEach((b, j) => p.push(...buttonProblems(b, `Button ${j + 1}` + (isObj(b) && filled(b.name) ? ` ("${b.name}")` : ''), true)));
    }
    return p;
  }

  // The checked card file turned into what is drawn.
  function buildCard(f, today) {
    const due = filled(f.due) ? dateOf(f.due) : null;
    const days = due && today ? due.day - today.day : null;
    const opt = k => (filled(f[k]) ? f[k] : null);
    return {
      id: String(f.id), title: f.title, kind: opt('kind'), column: opt('column'), group: opt('group'), note: opt('note'), link: opt('link'),
      due: due ? `${due.d} ${MONTHS[due.m - 1]}` : null, tone: due && days != null ? (days < 0 ? 'late' : days <= 7 ? 'soon' : null) : null,
      text: opt('text'),
      facts: (f.facts || []).map(x => ({ label: x.label, value: String(x.value), link: filled(x.link) ? x.link : null })),
      sections: (f.sections || []).map(s => ({
        title: s.title, type: s.type, numbered: s.numbered === true, collapsed: s.collapsed === true,
        text: s.type === 'text' && filled(s.text) ? s.text : null,
        items: s.type === 'text' ? [] : (s.items || []).map(it => ({
          text: it.text, done: it.done === true, when: s.type === 'timeline' ? whenOf(it.when) : null,
          who: filled(it.who) ? it.who : null, link: filled(it.link) ? it.link : null,
        })),
      })),
      buttons: Array.isArray(f.buttons) ? f.buttons : null,
    };
  }

  /**
   * Reads a card file (JSON or XML text) for the card `opened` (its id).
   * Returns {ok: true, card} or {ok: false, errors}. Never throws.
   * opts.today (YYYY-MM-DD, or a board's today) decides the due date's colour.
   */
  function readCard(text, opened, opts) {
    if (typeof text !== 'string') text = text == null ? '' : String(text);
    const bytes = utf8Length(text);
    if (bytes > CARD_MAX_BYTES) return { ok: false, errors: [`The card file is ${(bytes / 1024 / 1024).toFixed(1)} MB; the limit is 1 MB.`] };
    const src = text.replace(/^﻿/, '');
    if (!src.trim()) return { ok: false, errors: ['The card file is empty.'] };
    let f;
    if (src.trim()[0] === '<') {
      try { f = xmlToCard(parseXML(src, 'card')); } catch (e) {
        if (e instanceof XmlError) return { ok: false, errors: [`The card file is not a card written as XML: ${e.message}.`] };
        throw e;
      }
    } else {
      try { f = JSON.parse(src); } catch (e) { return { ok: false, errors: [`The card file is not valid JSON: ${e.message.replace(/\.$/, '')}.`] }; }
      if (!isObj(f)) return { ok: false, errors: ['The card file must hold one card: {"card": 1, "id": "…", "title": "…"}.'] };
    }
    const errors = validateCard(f, opened);
    if (errors.length) return { ok: false, errors };
    const t = opts && opts.today;
    return { ok: true, card: buildCard(f, t && typeof t === 'object' ? t : todayOf(t)) };
  }

  /* ------------------------------------------------------------------ *
   * The board: the checked file turned into what is drawn.
   * ------------------------------------------------------------------ */
  function build(file, opts) {
    const today = todayOf(file.today || (opts && opts.today));
    const st = file.style || {};
    const colours = Object.assign({}, COLOURS, st.colours || {});
    const columns = file.columns.map(c => ({
      name: c.name, limit: c.limit, show: c.show, more_link: c.more_link, total: c.total, cards: [], count: 0,
    }));
    const byKey = new Map(columns.map(c => [key(c.name), c]));
    const strip = file.strip ? { name: file.strip.name, show: file.strip.show, cards: [] } : null;
    const cards = file.cards.map((c, index) => {
      const id = String(c.id);
      const column = byKey.get(key(c.column));
      const due = c.due ? dateOf(c.due) : null;
      const days = due ? due.day - today.day : null;
      const address = c.link || (file.link_pattern ? file.link_pattern.split('{id}').join(encodeURIComponent(id)) : null);
      const card = {
        index, id, title: c.title, kind: filled(c.kind) ? c.kind : null, group: filled(c.group) ? c.group : null,
        note: filled(c.note) ? c.note : null, text: filled(c.text) ? c.text : null, column, inStrip: c.in_strip === true && !!strip,
        due: due ? `${due.d} ${MONTHS[due.m - 1]}` : null, tone: due ? (days < 0 ? 'late' : days <= 7 ? 'soon' : null) : null,
        address, buttons: Array.isArray(c.buttons) ? c.buttons : [],
      };
      card.label = card.kind ? `${card.kind} · #${id}` : `#${id}`;
      (card.inStrip ? strip.cards : column.cards).push(card);
      return card;
    });
    for (const c of columns) c.count = c.total != null ? c.total : c.cards.length;
    const board = {
      title: file.title, today, colours, lines: st.card_lines === 2 ? 2 : 3, columns, strip, cards,
      buttons: Array.isArray(file.buttons) ? file.buttons : [],
    };
    board.summary = summaryOf(file, board);
    return board;
  }

  function summaryOf(file, board) {
    const s = has(file, 'summary') ? file.summary : 'auto';
    if (s === 'off') return [];
    if (Array.isArray(s)) return s.slice();
    const late = board.cards.filter(c => c.tone === 'late').length, soon = board.cards.filter(c => c.tone === 'soon').length;
    const out = [];
    if (late) out.push(`${thousands(late)} overdue`);
    if (soon) out.push(`${thousands(soon)} due within 7 days`);
    if (board.strip && board.strip.cards.length) out.push(`${thousands(board.strip.cards.length)} in ${board.strip.name}`);
    return out;
  }

  // The count beside a column's name: "3", or "3 / 4" with a limit.
  function countOf(col) {
    return { text: thousands(col.count) + (col.limit != null ? ` / ${col.limit}` : ''), over: col.limit != null && col.count > col.limit };
  }
  // How many of a list's cards are drawn, and the "n more" after them.
  function folded(list, total, showN, fold) {
    const drawn = fold && showN != null ? list.slice(0, showN) : list;
    return { drawn, more: Math.max(0, total - drawn.length) };
  }
  // The columns per row on a wide place (requirement 8): rows of even length.
  function perRow(width, n) {
    const fit = Math.max(1, Math.floor((width - 2 * PAD + GAP) / (COLUMN_MIN + GAP)));
    const rows = Math.ceil(n / fit);
    return Math.ceil(n / rows);
  }

  // The buttons of an opened card (requirement 18): its own, then the file's
  // that fit its kind, column and strip. On a page that does not listen, a
  // button with no link is not drawn (requirement 21).
  // With a card file that gives buttons, those are the whole list
  // (requirement 48). A button that asks for text is drawn only on a page
  // that listens (requirement 54).
  function buttonsFor(board, card, listening, detail) {
    let list;
    if (detail && detail.buttons) list = detail.buttons.slice();
    else {
      list = card.buttons.slice();
      for (const b of board.buttons) {
        if (Array.isArray(b.kinds) && !(card.kind && b.kinds.some(k => key(k) === key(card.kind)))) continue;
        if (Array.isArray(b.columns) && !b.columns.some(k => key(k) === key(card.column.name))) continue;
        if (b.strip_only === true && !card.inStrip) continue;
        list.push(b);
      }
    }
    const drawn = list.filter(b => (has(b, 'ask') ? listening && filled(b.action) : (listening && filled(b.action)) || filled(b.link)));
    const main = drawn.find(b => b.main === true) || null;
    return { main, rest: drawn.filter(b => b !== main), all: drawn };
  }
  const linkOf = (b, card) => (filled(b.link) ? b.link.split('{id}').join(encodeURIComponent(card.id)) : null);

  /* ------------------------------------------------------------------ *
   * Reading a file
   * ------------------------------------------------------------------ */
  /**
   * Reads a board file (JSON or XML text). Returns {ok: true, board} or
   * {ok: false, errors}: every problem, in plain words. Never throws.
   * opts.today (YYYY-MM-DD) is the day the board is drawn when the file
   * gives none.
   */
  function read(text, opts) {
    if (typeof text !== 'string') text = text == null ? '' : String(text);
    const bytes = utf8Length(text);
    if (bytes > MAX_BYTES) return { ok: false, errors: [`The file is ${(bytes / 1024 / 1024).toFixed(1)} MB; the limit is 5 MB.`] };
    const src = text.replace(/^﻿/, '');
    if (!src.trim()) return { ok: false, errors: ['The file is empty.'] };
    let file;
    if (src.trim()[0] === '<') {
      try { file = xmlToFile(parseXML(src)); } catch (e) {
        if (e instanceof XmlError) return { ok: false, errors: [`The file is not a board written as XML: ${e.message}.`] };
        throw e;
      }
    } else {
      try { file = JSON.parse(src); } catch (e) { return { ok: false, errors: [`The file is not valid JSON: ${e.message.replace(/\.$/, '')}.`] }; }
      if (!isObj(file)) return { ok: false, errors: ['The file must hold one board: {"board": 1, "title": "…", "columns": […], "cards": […]}.'] };
    }
    const over = limits(file);
    if (over.length) return { ok: false, errors: over };
    const errors = validate(file);
    if (errors.length) return { ok: false, errors };
    return { ok: true, board: build(file, opts) };
  }

  /* ------------------------------------------------------------------ *
   * The board as a page: wide (768 points and up) and narrow
   * ------------------------------------------------------------------ */
  function vars(c) {
    return Object.keys(COLOURS).map(k => `--bg-${k}:${c[k]}`).join(';');
  }
  // Colours are set through the style object, not a style attribute, so a
  // page whose policy forbids inline styles still shows them.
  function setColours(el, c) {
    for (const k of Object.keys(COLOURS)) el.style.setProperty(`--bg-${k}`, c[k]);
  }
  function lastLine(board, card, lead) {
    const bits = [];
    if (lead) bits.push(esc(lead));
    if (card.group) bits.push(esc(card.group));
    if (card.due) bits.push(card.tone ? `<span class="bg-${card.tone}">due ${esc(card.due)}</span>` : `due ${esc(card.due)}`);
    if (card.note) bits.push(`<span class="bg-note">${esc(card.note)}</span>`);
    return bits.join(' · ');
  }
  function face(board, card, cls) {
    const three = board.lines === 3;
    const last = lastLine(board, card, three ? null : card.label);
    return `<article class="${cls}" tabindex="0" role="button" aria-haspopup="dialog" data-i="${card.index}" aria-label="${esc(card.label + ': ' + card.title)}">` +
      (three ? `<div class="bg-l1">${esc(card.label)}</div>` : '') +
      `<div class="bg-t">${esc(card.title)}</div>` +
      (last ? `<div class="bg-l3">${last}</div>` : '') + '</article>';
  }
  function moreHTML(n, link) {
    if (n <= 0) return '';
    const t = `${thousands(n)} more`;
    return link ? `<a class="bg-more" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${t}</a>` : `<span class="bg-more">${t}</span>`;
  }
  function heading(cls, name, count) {
    return `<h2 class="${cls}"><span class="bg-name">${esc(name)}</span><span class="bg-count${count.over ? ' bg-over' : ''}">${esc(count.text)}</span></h2>`;
  }
  function stripHTML(board, cardCls, fold) {
    const s = board.strip;
    if (!s || !s.cards.length) return '';
    const f = folded(s.cards, s.cards.length, s.show, fold !== false);
    return `<section class="bg-strip" aria-label="${esc(s.name)}">${heading('bg-h', s.name, { text: thousands(s.cards.length) })}` +
      `<div class="bg-strip-cards">${f.drawn.map(c => face(board, c, cardCls)).join('')}</div>${moreHTML(f.more, null)}</section>`;
  }

  // The Refresh button at the right of the header (requirements 55, 57), on a
  // page that can supply a new board file: extra.refresh = {busy, failed}.
  function refreshHTML(extra) {
    const r = extra && extra.refresh;
    if (!r) return '';
    return `<div class="bg-rwrap">${r.failed ? '<span class="bg-rfail" role="status">The board could not be refreshed</span>' : ''}` +
      `<button type="button" class="bg-btn bg-refresh"${r.busy ? ' disabled' : ''}>${r.busy ? 'Refreshing…' : 'Refresh'}</button></div>`;
  }

  /** The wide form at a given width (fold: apply each list's "show"). */
  function wideHTML(board, width, fold, extra) {
    if (fold === undefined) fold = true;
    const per = perRow(width, board.columns.length);
    const chips = board.summary.map(x => `<span class="bg-chip">${esc(x)}</span>`).join('');
    const cols = board.columns.map(col => {
      const f = folded(col.cards, col.count, col.show, fold);
      return `<section class="bg-col" aria-label="${esc(col.name)}">${heading('bg-h', col.name, countOf(col))}` +
        f.drawn.map(c => face(board, c, 'bg-card')).join('') + moreHTML(f.more, col.more_link) + '</section>';
    }).join('');
    return `<div class="bg-board bg-wide" data-per="${per}"><header class="bg-head"><span class="bg-dot" aria-hidden="true"></span>` +
      `<h1 class="bg-title">${esc(board.title)}</h1>${chips}${refreshHTML(extra)}</header>${stripHTML(board, 'bg-card bg-flat', fold)}` +
      `<div class="bg-cols" data-per="${per}">${cols}</div></div>`;
  }

  /** The narrow form: one list (requirement 15). */
  function narrowHTML(board, extra) {
    const sum = board.summary.map(esc).join(' · ');
    const cols = board.columns.map(col => {
      const f = folded(col.cards, col.count, col.show, true);
      return `<section class="bg-ncol" aria-label="${esc(col.name)}">${heading('bg-nh', col.name, countOf(col))}` +
        f.drawn.map(c => face(board, c, 'bg-row')).join('') + moreHTML(f.more, col.more_link) + '</section>';
    }).join('');
    return `<div class="bg-board bg-narrow"><header class="bg-nhead"><div class="bg-nt"><span class="bg-dot" aria-hidden="true"></span>` +
      `<h1 class="bg-title">${esc(board.title)}</h1>${refreshHTML(extra)}</div>${sum ? `<div class="bg-nsum">${sum}</div>` : ''}</header>` +
      `${stripHTML(board, 'bg-card bg-flat')}${cols}</div>`;
  }

  const TICK = '<svg class="bg-tick" role="img" aria-label="Done" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#2E7D32" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5l3.2 3.2L14 5.5"/></svg>';
  const RING = '<svg class="bg-tick" role="img" aria-label="Not done" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="9" r="5.5"/></svg>';
  const CHEVRON = '<svg class="bg-chev" aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7l4 4 4-4"/></svg>';
  const webLink = (href, inner) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
  const paragraphs = (t, cls) => t.split(/\n[ \t]*\n/).map(x => x.trim()).filter(Boolean).map(x => `<p class="${cls}">${esc(x)}</p>`).join('');

  // One section of a card file (requirements 46, 47).
  function sectionHTML(sec, i, opened) {
    const n = sec.items.length;
    const count = sec.type === 'text' ? '' : sec.type === 'checklist' ? `${thousands(sec.items.filter(x => x.done).length)} of ${thousands(n)} done` : thousands(n);
    const head = `<span class="bg-sh"><span class="bg-sn">${esc(sec.title)}</span>${count ? `<span class="bg-sc">${count}</span>` : ''}</span>`;
    const item = it => (it.link ? webLink(it.link, esc(it.text)) : esc(it.text));
    let body;
    if (sec.type === 'text') body = sec.text ? paragraphs(sec.text, 'bg-stext') : '<p class="bg-none">None</p>';
    else if (!n) body = '<p class="bg-none">None</p>';
    else if (sec.type === 'list') body = `<${sec.numbered ? 'ol class="bg-items bg-num"' : 'ul class="bg-items"'}>${sec.items.map(it => `<li>${item(it)}</li>`).join('')}</${sec.numbered ? 'ol' : 'ul'}>`;
    else if (sec.type === 'checklist') body = `<ul class="bg-items bg-checks">${sec.items.map(it => `<li>${it.done ? TICK : RING}<span>${item(it)}</span></li>`).join('')}</ul>`;
    else body = `<ul class="bg-items bg-tl">${sec.items.map(it => `<li><span class="bg-when">${esc(it.when)}${it.who ? ` · ${esc(it.who)}` : ''}</span><span class="bg-tt">${item(it)}</span></li>`).join('')}</ul>`;
    if (!sec.collapsed) return `<section class="bg-sec"><h2>${head}</h2>${body}</section>`;
    const open = !!(opened && opened.has(i));
    return `<section class="bg-sec bg-fold"><h2><button type="button" class="bg-toggle" data-sec="${i}" aria-expanded="${open}">${head}${CHEVRON}</button></h2>${open ? body : ''}</section>`;
  }

  /**
   * An opened card (requirements 17, 44–49, 52). `st`, when the page can
   * supply card files, is the state of the card's detail: {status: 'none' |
   * 'loading' | 'filled' | 'failed' | 'broken', detail, errors, asking (the
   * index of the button asking for text), open (a Set of opened sections),
   * busy}.
   */
  function cardHTML(board, card, listening, narrow, st) {
    const status = (st && st.status) || 'none';
    const full = status !== 'none'; // the release 1.1 layout
    const d = status === 'filled' ? st.detail : null;
    const kind = d && d.kind ? d.kind : card.kind;
    const label = kind ? `${kind} · #${card.id}` : `#${card.id}`;
    const title = d ? d.title : card.title;
    const { main, rest, all } = buttonsFor(board, card, listening, d);
    const busy = !!(st && st.busy);
    const btn = (b, k, cls) => {
      const act = listening && filled(b.action);
      return act ? `<button type="button" class="bg-btn ${cls}" data-b="${k}"${busy ? ' disabled' : ''}>${esc(b.name)}</button>`
        : `<a class="bg-btn ${cls}" data-b="${k}" href="${esc(linkOf(b, card))}" target="_blank" rel="noopener noreferrer">${esc(b.name)}</a>`;
    };
    const due = d && d.due ? { due: d.due, tone: d.tone } : card;
    const fields = [['Column', esc(d && d.column ? d.column : card.column.name)]];
    const group = d && d.group ? d.group : card.group, note = d && d.note ? d.note : card.note;
    if (group) fields.push(['Group', esc(group)]);
    if (due.due) fields.push(['Due', due.tone ? `<span class="bg-${due.tone}${full ? '' : '-plain'}">${esc(due.due)}</span>` : esc(due.due)]);
    if (note) fields.push(['Note', esc(note)]);
    if (d) for (const f of d.facts) fields.push([esc(f.label), f.link ? webLink(f.link, esc(f.value)) : esc(f.value)]);
    const text = d && d.text ? d.text : card.text;

    let line = '';
    if (status === 'loading') line = '<p class="bg-status" role="status">Loading…</p>';
    else if (status === 'failed') line = '<div class="bg-status bg-failed" role="alert"><span>The detail could not be loaded</span><button type="button" class="bg-btn bg-plain bg-try">Try again</button></div>';
    else if (status === 'broken') {
      line = `<div class="bg-cardproblems" role="alert"><h2>The detail could not be shown</h2><ol>${st.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ol></div>`;
    }

    let actions = '';
    const asking = st && st.asking != null ? all[st.asking] : null;
    if (asking) {
      const a = asking.ask;
      const box = a.long === true ? `<textarea id="bg-ask" class="bg-box" rows="4" maxlength="${MAX_ANSWER}"></textarea>`
        : `<input id="bg-ask" class="bg-box" type="text" maxlength="${MAX_ANSWER}" autocomplete="off">`;
      actions = `<div class="bg-actions bg-asking${full ? ' bg-actions11' : ''}"><div class="bg-ask"><label class="bg-askl" for="bg-ask">${esc(a.label)}</label>${box}` +
        `<div class="bg-askrow"><button type="button" class="bg-btn bg-plain bg-cancel">Cancel</button>` +
        `<button type="button" class="bg-btn bg-main bg-ok" data-ok="${st.asking}"${a.required === true ? ' disabled' : ''}>${esc(asking.name)}</button></div></div></div>`;
    } else if (all.length) {
      actions = `<div class="bg-actions${full ? ' bg-actions11' : ''}"><div class="bg-rest">${rest.map(b => btn(b, all.indexOf(b), 'bg-plain')).join('')}</div>` +
        `${main ? btn(main, all.indexOf(main), 'bg-main') : ''}</div>`;
    }

    return `<div class="bg-overlay${narrow ? ' bg-sheet' : ''}"><div class="bg-dialog${full ? ' bg-full' : ''}" role="dialog" aria-modal="true" aria-labelledby="bg-dt" data-i="${card.index}">` +
      `<div class="bg-dtop"><div class="bg-dhead"><div class="bg-l1">${esc(label)}</div><h1 class="bg-dtitle" id="bg-dt">${esc(title)}</h1></div>` +
      `<button type="button" class="bg-x" aria-label="Close"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l12 12M15 3L3 15"/></svg></button></div>` +
      `<div class="bg-dbody">${line}` +
      (text ? (full ? paragraphs(text, 'bg-text') : `<p class="bg-text">${esc(text)}</p>`) : '') +
      `<div class="bg-fields${full ? ' bg-fields11' : ''}">${fields.map(([a, b]) => `<div class="bg-field"><span class="bg-fl">${a}</span><span class="bg-fv">${b}</span></div>`).join('')}</div>` +
      (d ? d.sections.map((s, i) => sectionHTML(s, i, st.open)).join('') : '') +
      `</div>${actions}</div></div>`;
  }

  function problemsHTML(errors) {
    return `<div class="bg-problems" role="alert"><h1>No board drawn. ${plural(errors.length, 'problem', 'problems')} in this file</h1>` +
      `<ol>${errors.map(e => `<li>${esc(e)}</li>`).join('')}</ol></div>`;
  }

  const CSS = `
:host{display:block}
.bg{font-family:${FONT};font-size:15px;line-height:1.3;color:var(--bg-ink);background:#fff;text-align:left;-webkit-text-size-adjust:100%}
.bg *{box-sizing:border-box}
.bg h1,.bg h2,.bg p{margin:0}
.bg-dot{width:12px;height:12px;border-radius:50%;background:var(--bg-accent);flex:none}
.bg-title{font-size:22px;font-weight:700;line-height:1.2;color:var(--bg-ink);overflow-wrap:anywhere}
.bg-chip{background:var(--bg-column);color:var(--bg-ink);border-radius:8px;padding:5px 12px;font-size:13px;line-height:17px}
.bg-h{margin:0 2px 4px!important;font-size:15px;font-weight:700;line-height:19px;color:var(--bg-ink);display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.bg-name{overflow-wrap:anywhere;min-width:0}
.bg-count{font-size:13px;font-weight:400;color:var(--bg-muted);white-space:nowrap}
.bg-count.bg-over{color:var(--bg-late);font-weight:700}
.bg-card{background:#fff;border-radius:12px;padding:12px 14px;box-shadow:0 1px 2px rgba(22,35,42,.10);display:flex;flex-direction:column;gap:6px;min-width:0;cursor:pointer}
.bg-card.bg-flat{box-shadow:none}
.bg-card:focus-visible,.bg-row:focus-visible{outline:2px solid var(--bg-label);outline-offset:2px}
.bg-l1{font-size:12px;font-weight:700;line-height:16px;color:var(--bg-label);letter-spacing:.03em;text-transform:uppercase;overflow-wrap:anywhere}
.bg-t{font-size:16px;font-weight:700;line-height:20px;color:var(--bg-ink);display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.bg-l3{font-size:13px;line-height:17px;color:var(--bg-muted);overflow-wrap:anywhere}
.bg-soon{color:var(--bg-soon);font-weight:700}.bg-late,.bg-count .bg-late{color:var(--bg-late);font-weight:700}
.bg-soon-plain{color:var(--bg-soon)}.bg-late-plain{color:var(--bg-late)}
.bg-note{color:var(--bg-ink);font-weight:700}
.bg-more{display:block;font-size:13px;font-weight:700;line-height:17px;color:var(--bg-label);padding:8px 4px 2px;text-decoration:none}
a.bg-more:hover{text-decoration:underline}
.bg-wide .bg-head{padding:20px ${PAD}px 12px;display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.bg-wide .bg-title{margin-right:8px}
.bg-wide .bg-strip{margin:4px ${PAD}px 16px;background:var(--bg-strip);border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:8px}
.bg-strip-cards{display:flex;flex-wrap:wrap;gap:8px}
.bg-wide .bg-strip-cards .bg-card{flex:1 1 320px}
.bg-cols{padding:0 ${PAD}px ${PAD}px;display:grid;gap:${GAP}px;align-items:start}
.bg-cols[data-per="1"]{grid-template-columns:minmax(0,1fr)}
${Array.from({ length: MAX_COLUMNS - 1 }, (_, i) => `.bg-cols[data-per="${i + 2}"]{grid-template-columns:repeat(${i + 2},minmax(0,1fr))}`).join('\n')}
.bg-col{background:var(--bg-column);border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:8px;min-width:0}
.bg-narrow{padding:20px 16px 28px}
.bg-nhead{display:flex;flex-direction:column;gap:4px;padding-bottom:14px}
.bg-nt{display:flex;gap:10px;align-items:center;min-width:0}
.bg-nsum{font-size:13px;line-height:17px;color:var(--bg-muted)}
.bg-narrow .bg-strip{background:var(--bg-strip);border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:8px}
.bg-narrow .bg-strip .bg-h{margin:0 2px 2px!important}
.bg-narrow .bg-strip-cards{flex-direction:column}
.bg-narrow .bg-card{gap:4px;min-height:44px}
.bg-ncol{display:flex;flex-direction:column}
.bg-nh{padding:22px 0 8px;font-size:13px;font-weight:700;line-height:17px;letter-spacing:.06em;text-transform:uppercase;color:var(--bg-ink);display:flex;gap:8px;align-items:baseline;border-bottom:2px solid var(--bg-ink)}
.bg-nh .bg-count{letter-spacing:.06em}
.bg-row{padding:12px 0;border-bottom:1px solid var(--bg-line);display:flex;flex-direction:column;gap:4px;min-height:44px;cursor:pointer;min-width:0}
.bg-narrow .bg-more{padding:14px 0;min-height:44px}
.bg-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(22,35,42,.45);display:flex;align-items:center;justify-content:center;padding:40px}
.bg-dialog{background:#fff;color:var(--bg-ink);border-radius:24px;padding:20px 20px 16px 28px;display:flex;flex-direction:column;gap:16px;width:680px;max-width:100%;max-height:100%;overflow:hidden}
.bg-dbody{display:flex;flex-direction:column;gap:16px;overflow:auto;min-height:0;flex:0 1 auto;margin-right:-12px;padding-right:12px}
.bg-dbody>*{flex:none}
.bg-actions{flex:none}
.bg-sheet{padding:0;align-items:stretch}
.bg-sheet .bg-dialog{border-radius:0;width:100%;padding:12px 12px 16px 20px}
.bg-sheet .bg-dialog{overflow:auto}
.bg-sheet .bg-dbody{flex:none;overflow:visible;margin-right:0;padding-right:0}
.bg-dtop{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.bg-dhead{display:flex;flex-direction:column;gap:6px;padding-top:8px;min-width:0}
.bg-dtitle{font-size:22px;font-weight:700;line-height:1.2;overflow-wrap:anywhere}
.bg-x{width:44px;height:44px;flex:none;border:0;background:transparent;color:var(--bg-ink);border-radius:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
.bg-x:hover{background:var(--bg-column)}
.bg-text{font-size:15px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.bg-fields{display:flex;flex-wrap:wrap;gap:14px 40px;padding:14px 0;border-top:1px solid var(--bg-line);border-bottom:1px solid var(--bg-line)}
.bg-field{display:flex;flex-direction:column;gap:2px;min-width:0}
.bg-fl{font-size:12px;color:var(--bg-muted)}
.bg-fv{font-size:15px;overflow-wrap:anywhere}
.bg-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
.bg-rest{display:flex;flex-wrap:wrap;gap:2px}
.bg-btn{min-height:44px;padding:0 18px;border-radius:22px;font:inherit;font-size:15px;font-weight:700;line-height:1.2;cursor:pointer;border:0;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;text-align:center}
.bg-main{background:var(--bg-button);color:#fff;margin-left:auto}
.bg-plain{background:transparent;color:var(--bg-label);padding:0 10px}
.bg-plain:hover{background:var(--bg-column)}
.bg-btn:focus-visible,.bg-x:focus-visible,.bg-more:focus-visible{outline:2px solid var(--bg-label);outline-offset:2px}
.bg-sheet .bg-actions{flex-direction:column;align-items:stretch;margin-top:auto;padding-right:8px}
.bg-sheet .bg-main{order:-1;width:100%;margin-left:0}
.bg-sheet .bg-rest{gap:8px}
.bg-sheet .bg-plain{background:var(--bg-column);color:var(--bg-ink);padding:0 18px}
.bg-full .bg-text{white-space:pre-line}
.bg-fields11{border-bottom:0;padding:14px 0 2px;gap:14px 36px}
.bg-fv a,.bg-items a{color:var(--bg-label)}
.bg-sec{border-top:1px solid var(--bg-line);padding-top:14px;display:flex;flex-direction:column;gap:10px}
.bg-sec.bg-fold{padding-top:12px}
.bg-sh{font-size:15px;font-weight:700;line-height:1.3;color:var(--bg-ink);display:flex;gap:8px;align-items:baseline;min-width:0}
.bg-sn{overflow-wrap:anywhere;min-width:0}
.bg-sc{font-weight:400;font-size:13px;color:var(--bg-muted);white-space:nowrap}
.bg-toggle{width:100%;min-height:44px;display:flex;justify-content:space-between;align-items:center;gap:8px;background:transparent;border:0;padding:0;font:inherit;color:var(--bg-muted);cursor:pointer;text-align:left;border-radius:8px}
.bg-toggle:focus-visible{outline:2px solid var(--bg-label);outline-offset:2px}
.bg-chev{flex:none}
.bg-toggle[aria-expanded="true"] .bg-chev{transform:rotate(180deg)}
.bg-items{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.bg-items li{font-size:15px;line-height:1.4;color:var(--bg-ink);overflow-wrap:anywhere;min-width:0}
ol.bg-num{list-style:decimal;padding-left:24px}
.bg-checks li{display:flex;gap:10px;align-items:flex-start}
.bg-tick{flex:none;margin-top:2px;color:var(--bg-muted)}
.bg-tl{gap:10px}
.bg-tl li{display:flex;flex-direction:column;gap:2px}
.bg-when{font-size:13px;line-height:17px;color:var(--bg-muted)}
.bg-stext{font-size:15px;line-height:1.5;white-space:pre-line;overflow-wrap:anywhere}
.bg-none{font-size:15px;color:var(--bg-muted)}
.bg-status{font-size:15px;line-height:1.4;color:var(--bg-muted)}
.bg-failed{display:flex;flex-wrap:wrap;align-items:center;gap:4px 12px;color:var(--bg-ink)}
.bg-cardproblems h2{font-size:15px;font-weight:700;color:var(--bg-late);margin:0 0 8px!important}
.bg-cardproblems ol{margin:0;padding-left:22px;display:flex;flex-direction:column;gap:4px;font-size:15px;line-height:1.4}
.bg-cardproblems li{overflow-wrap:anywhere}
.bg-actions11{padding-top:12px;border-top:1px solid var(--bg-line)}
.bg-sheet .bg-actions11{padding-top:14px}
.bg-asking{display:block}
.bg-ask{display:flex;flex-direction:column;gap:10px}
.bg-askl{font-size:15px;font-weight:700;color:var(--bg-ink)}
.bg-box{display:block;min-height:44px;width:100%;border:2px solid var(--bg-button);border-radius:12px;padding:0 14px;font:inherit;font-size:15px;color:var(--bg-ink);background:#fff;margin:0}
textarea.bg-box{padding:10px 14px;line-height:1.4;resize:vertical}
.bg-box:focus{outline:2px solid var(--bg-label);outline-offset:1px}
.bg-askrow{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px}
.bg-askrow .bg-plain{padding:0 18px}
.bg-askrow .bg-main{margin-left:0}
.bg-sheet .bg-askrow .bg-main{order:0;width:auto;margin-left:0}
.bg-btn:disabled{opacity:.45;cursor:default}
.bg-rwrap{margin-left:auto;display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:4px 12px}
.bg-refresh{background:var(--bg-column);color:var(--bg-ink)}
.bg-refresh:focus-visible{outline:2px solid var(--bg-label);outline-offset:2px}
.bg-rfail{font-size:13px;line-height:17px;font-weight:700;color:var(--bg-late)}
.bg-nt .bg-title{min-width:0}
.bg-problems{padding:28px 32px;color:var(--bg-ink)}
.bg-problems h1{font-size:20px;font-weight:700;color:var(--bg-late);margin:0 0 12px}
.bg-problems ol{margin:0;padding-left:22px;display:flex;flex-direction:column;gap:6px;font-size:15px;line-height:1.4}
.bg-problems li{overflow-wrap:anywhere}`;

  /* ------------------------------------------------------------------ *
   * Drawing into a place on a page (requirements 17–21, 34–36)
   * ------------------------------------------------------------------ */
  const places = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  let sheet = null;
  const thenable = v => v != null && typeof v.then === 'function';
  const later = err => setTimeout(() => { throw err; });

  function mount(place) {
    let s = places && places.get(place);
    if (s) return s;
    const shadow = place.shadowRoot || place.attachShadow({ mode: 'open' });
    // A constructed style sheet is not subject to a page's style policy;
    // older browsers get a <style> element.
    try {
      if (!sheet) { sheet = new CSSStyleSheet(); sheet.replaceSync(CSS); }
      shadow.adoptedStyleSheets = [sheet];
    } catch (e) {
      const st = document.createElement('style'); st.textContent = CSS; shadow.appendChild(st);
    }
    const host = document.createElement('div');
    host.className = 'bg';
    shadow.appendChild(host);
    s = {
      place, shadow, host, board: null, form: '', opened: null, st: null, token: 0, onAction: null, getCard: null, refresh: null,
      today: undefined, gen: 0, refreshing: false, refreshFailed: false, queued: null,
    };
    host.addEventListener('click', e => click(s, e));
    host.addEventListener('keydown', e => key_(s, e));
    host.addEventListener('input', e => typed(s, e));
    if (typeof ResizeObserver !== 'undefined') {
      s.ro = new ResizeObserver(() => paint(s));
      s.ro.observe(host);
    }
    if (places) places.set(place, s);
    return s;
  }

  function formOf(width, n) {
    return width < NARROW_BELOW ? 'narrow' : 'wide:' + perRow(width, n);
  }
  const extraOf = s => (s.refresh ? { refresh: { busy: s.refreshing, failed: s.refreshFailed } } : undefined);
  function paint(s, force) {
    if (!s.board) return;
    const w = s.host.clientWidth || s.place.clientWidth || 1280;
    const form = formOf(w, s.board.columns.length);
    if (!force && form === s.form) return;
    s.form = form;
    const open = s.opened;
    s.host.innerHTML = form === 'narrow' ? narrowHTML(s.board, extraOf(s)) : wideHTML(s.board, w, true, extraOf(s));
    setColours(s.host, s.board.colours);
    s.host.setAttribute('data-form', form === 'narrow' ? 'narrow' : 'wide');
    if (open) renderCard(s, false);
  }

  // Which control has the focus inside the opened card, to give it back
  // after the card is drawn again.
  function focusKey(s) {
    const a = s.shadow.activeElement;
    if (!a || !a.closest || !a.closest('.bg-dialog')) return null;
    for (const at of ['data-b', 'data-sec', 'data-ok']) if (a.hasAttribute(at)) return `[${at}="${a.getAttribute(at)}"]`;
    for (const c of ['bg-x', 'bg-try', 'bg-cancel', 'bg-box']) if (a.classList.contains(c)) return '.' + c;
    return '.bg-x';
  }

  // Draws the opened card, or draws it again in place: the card does not
  // close, its scroll position and the focus stay (requirement 44).
  function renderCard(s, focus) {
    const card = s.opened;
    if (!card) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = cardHTML(s.board, card, !!s.onAction, s.form === 'narrow', s.st);
    const fresh = wrap.firstChild;
    const overlay = s.host.querySelector('.bg-overlay');
    if (!overlay) {
      s.host.appendChild(fresh);
      if (focus !== false) { const x = fresh.querySelector('.bg-x'); if (x) x.focus(); }
    } else {
      const fk = focusKey(s), body = overlay.querySelector('.bg-dbody'), top = body ? body.scrollTop : 0;
      const dialog = overlay.querySelector('.bg-dialog'), next = fresh.querySelector('.bg-dialog');
      overlay.className = fresh.className;
      dialog.className = next.className;
      dialog.innerHTML = next.innerHTML;
      const nb = dialog.querySelector('.bg-dbody'); if (nb) nb.scrollTop = top;
      const f = fk && (dialog.querySelector(fk) || dialog.querySelector('.bg-x'));
      if (f && !f.disabled) f.focus(); else if (fk) { const x = dialog.querySelector('.bg-x'); if (x) x.focus(); }
    }
    const box = s.host.querySelector('.bg-box');
    if (box) { box.value = s.st.askText || ''; okState(s); }
  }

  function openCard(s, card, focus) {
    closeCard(s, false);
    s.opened = card;
    s.st = { status: 'none', detail: null, errors: null, asking: null, askText: '', open: new Set(), busy: false };
    renderCard(s, focus);
    if (s.getCard) loadCard(s);
  }

  // Asks the page for the opened card's file (requirements 44, 49).
  function loadCard(s) {
    const card = s.opened, token = ++s.token;
    let r;
    try { r = s.getCard(card.id); } catch (err) { later(err); r = Promise.reject(err); }
    if (r == null) { s.st.status = 'none'; renderCard(s, false); return; } // no card file for this card
    s.st.status = 'loading';
    renderCard(s, false);
    let timer = null;
    const done = (text, failed) => {
      if (token !== s.token || s.opened !== card) return;
      clearTimeout(timer);
      if (failed) s.st.status = 'failed';
      else if (text == null) s.st.status = 'none';
      else {
        const rc = readCard(text, card.id, { today: s.board.today });
        if (rc.ok) { s.st.status = 'filled'; s.st.detail = rc.card; s.st.errors = null; } else { s.st.status = 'broken'; s.st.detail = null; s.st.errors = rc.errors; }
      }
      const list = buttonsFor(s.board, card, !!s.onAction, s.st.status === 'filled' ? s.st.detail : null).all;
      if (s.st.asking != null && !(list[s.st.asking] && list[s.st.asking].ask)) s.st.asking = null;
      renderCard(s, false);
    };
    timer = setTimeout(() => done(null, true), CARD_WAIT);
    Promise.resolve(r).then(t => done(t, false), () => done(null, true));
  }

  function closeCard(s, restore) {
    const o = s.host.querySelector('.bg-overlay');
    if (o) o.remove();
    const card = s.opened;
    s.opened = null; s.st = null; s.token++;
    if (restore && card) {
      const el = s.host.querySelector(`[data-i="${card.index}"]`);
      if (el) el.focus();
    }
  }

  const detailOf = s => (s.st && s.st.status === 'filled' ? s.st.detail : null);
  const listOf = s => buttonsFor(s.board, s.opened, !!s.onAction, detailOf(s)).all;

  // The confirming button is off while a required box is empty (requirement 53).
  function okState(s) {
    const ok = s.host.querySelector('.bg-ok'), def = s.st && listOf(s)[s.st.asking];
    if (ok && def) ok.disabled = def.ask.required === true && !(s.st.askText || '').trim();
  }
  function typed(s, e) {
    if (!s.st || !e.target.classList || !e.target.classList.contains('bg-box')) return;
    s.st.askText = e.target.value;
    okState(s);
  }
  function cancelAsk(s) {
    const k = s.st.asking;
    s.st.asking = null; s.st.askText = '';
    renderCard(s, false);
    const b = s.host.querySelector(`.bg-dialog [data-b="${k}"]`);
    if (b) b.focus();
  }
  function confirmAsk(s) {
    const def = listOf(s)[s.st.asking];
    if (!def) return;
    const text = (s.st.askText || '').trim().slice(0, MAX_ANSWER);
    if (def.ask.required === true && !text) return;
    s.st.asking = null; s.st.askText = '';
    act(s, s.opened, def, text, true);
  }

  // Hands a button press to the page's listener; then, on a page that can
  // refresh, asks for a new board file once (requirement 56).
  function act(s, card, def, text, asked) {
    const call = () => (asked ? s.onAction(def.action, card.id, text) : s.onAction(def.action, card.id));
    if (!s.getCard && !s.refresh) { // as in release 1.0
      closeCard(s, true);
      try { call(); } catch (err) { later(err); }
      return;
    }
    const gen = s.gen;
    s.st.busy = true;
    renderCard(s, false);
    const after = answer => {
      if (gen !== s.gen) return;
      const keep = answer === KEEP_OPEN && s.opened === card;
      if (s.opened === card) {
        if (keep) { s.st.busy = false; renderCard(s, false); } else closeCard(s, true);
      }
      if (s.refresh) doRefresh(s, keep ? card.id : null);
      else if (keep) loadCard(s);
    };
    let r;
    try { r = call(); } catch (err) { later(err); r = undefined; }
    if (thenable(r)) r.then(after, err => { later(err); after(); });
    else after(r);
  }

  // Asks the page for a new board file and draws it in place (requirements
  // 55–57). keepId: the card to keep open and fill again.
  function setRefresh(s) {
    const w = s.host.querySelector('.bg-rwrap');
    if (!w) return;
    const had = s.shadow.activeElement && s.shadow.activeElement.classList.contains('bg-refresh');
    const t = document.createElement('div');
    t.innerHTML = refreshHTML(extraOf(s));
    w.replaceWith(t.firstChild);
    if (had) { const b = s.host.querySelector('.bg-refresh'); if (b && !b.disabled) b.focus(); }
  }
  function doRefresh(s, keepId) {
    if (!s.refresh) return;
    if (s.refreshing) { s.queued = { keepId: keepId != null ? keepId : (s.queued && s.queued.keepId) }; return; }
    const gen = s.gen;
    s.refreshing = true;
    setRefresh(s);
    const hadFocus = s.shadow.activeElement && s.shadow.activeElement.classList.contains('bg-refresh');
    const finish = ok => text => {
      if (gen !== s.gen) return;
      s.refreshing = false;
      const r = ok ? read(text, { today: s.today }) : null;
      if (r && r.ok) {
        s.refreshFailed = false;
        s.board = r.board;
        if (s.opened) {
          const now = keepId != null ? r.board.cards.find(c => c.id === String(keepId)) : null;
          if (now) s.opened = now; else closeCard(s, false);
        }
        paint(s, true);
        if (hadFocus) { const b = s.host.querySelector('.bg-refresh'); if (b) b.focus(); }
        if (s.opened && s.getCard) loadCard(s);
      } else {
        s.refreshFailed = true;
        setRefresh(s);
        if (keepId != null && s.opened && s.getCard) loadCard(s);
      }
      const q = s.queued;
      s.queued = null;
      if (q) doRefresh(s, q.keepId);
    };
    let p;
    try { p = s.refresh(); } catch (err) { later(err); p = Promise.reject(err); }
    Promise.resolve(p).then(finish(true), finish(false));
  }

  function click(s, e) {
    const t = e.target;
    const overlay = t.closest && t.closest('.bg-overlay');
    if (overlay) {
      if (t === overlay) { closeCard(s, true); return; }
      if (t.closest('.bg-x')) { closeCard(s, true); return; }
      const sec = t.closest('[data-sec]');
      if (sec) {
        const i = +sec.getAttribute('data-sec');
        if (s.st.open.has(i)) s.st.open.delete(i); else s.st.open.add(i);
        renderCard(s, false);
        return;
      }
      if (t.closest('.bg-try')) { loadCard(s); const x = s.host.querySelector('.bg-x'); if (x && !s.shadow.activeElement) x.focus(); return; }
      if (t.closest('.bg-cancel')) { cancelAsk(s); return; }
      if (t.closest('.bg-ok')) { confirmAsk(s); return; }
      const b = t.closest('[data-b]');
      if (!b) return;
      const card = s.opened, list = listOf(s), def = list[+b.getAttribute('data-b')];
      if (!def) return;
      if (s.st && s.st.busy) { e.preventDefault(); return; }
      if (filled(def.confirm) && !window.confirm(def.confirm)) { e.preventDefault(); return; }
      if (s.onAction && filled(def.action)) {
        e.preventDefault();
        if (has(def, 'ask')) { // the row of buttons becomes the question (requirement 52)
          s.st.asking = list.indexOf(def); s.st.askText = '';
          renderCard(s, false);
          const box = s.host.querySelector('.bg-box');
          if (box) box.focus();
          return;
        }
        act(s, card, def, undefined, false);
        return;
      }
      // A link: the browser opens it (target _blank); the card closes.
      setTimeout(() => closeCard(s, true), 0);
      return;
    }
    if (t.closest && t.closest('.bg-refresh')) { doRefresh(s, null); return; }
    const el = t.closest && t.closest('[data-i]');
    if (!el || (t.closest('a') && !t.closest('.bg-card,.bg-row'))) return;
    openCard(s, s.board.cards[+el.getAttribute('data-i')]);
  }

  function key_(s, e) {
    if (s.opened) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (s.st && s.st.asking != null) cancelAsk(s); else closeCard(s, true);
        return;
      }
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.classList.contains('bg-box')) {
        e.preventDefault();
        const ok = s.host.querySelector('.bg-ok');
        if (ok && !ok.disabled) confirmAsk(s);
        return;
      }
      if (e.key === 'Tab') { // keep the focus inside the opened card
        const items = [...s.host.querySelectorAll('.bg-overlay button:not([disabled]), .bg-overlay a[href], .bg-overlay input, .bg-overlay textarea')];
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1], at = s.shadow.activeElement;
        if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest && e.target.closest('button')) return; // the Refresh button clicks by itself
    const el = e.target.closest && e.target.closest('[data-i]');
    if (!el) return;
    e.preventDefault();
    openCard(s, s.board.cards[+el.getAttribute('data-i')]);
  }

  /**
   * Draws a board from a file's text into `place`, at that place's width.
   * Everything goes inside a shadow root on `place`; nothing else on the page
   * is touched. Calling it again on the same place redraws it.
   *   options.onAction(action, id[, text]): be told about buttons
   *     (requirement 35). A button that asked for text adds the text. On a
   *     page that gives getCard or refresh, it may return (or resolve to)
   *     "keep open" to keep the card open.
   *   options.getCard(id): the opened card's file, as text or a promise of
   *     text; null when there is none for that card (requirements 44, 49).
   *   options.refresh(): a new board file, as text or a promise of text;
   *     draws a Refresh button (requirements 55–57).
   *   options.today: YYYY-MM-DD, when the file gives no "today".
   * Returns {ok: true, board} or {ok: false, errors}.
   */
  function draw(place, text, options) {
    const o = options || {};
    const s = mount(place);
    s.onAction = typeof o.onAction === 'function' ? o.onAction : null;
    s.getCard = typeof o.getCard === 'function' ? o.getCard : null;
    s.refresh = typeof o.refresh === 'function' ? o.refresh : null;
    s.today = o.today;
    s.gen++; s.refreshing = false; s.refreshFailed = false; s.queued = null;
    closeCard(s, false);
    const r = read(text, { today: o.today });
    if (!r.ok) {
      s.board = null; s.form = '';
      setColours(s.host, COLOURS);
      s.host.setAttribute('data-form', 'problems');
      s.host.innerHTML = problemsHTML(r.errors);
      return r;
    }
    s.board = r.board;
    paint(s, true);
    return r;
  }

  /** Removes what draw() put in the place. */
  function clear(place) {
    const s = places && places.get(place);
    if (!s) return;
    closeCard(s, false);
    s.gen++; s.refreshing = false; s.queued = null;
    s.board = null; s.form = '';
    s.host.innerHTML = '';
    s.host.removeAttribute('data-form');
  }

  return {
    VERSION, MAX_BYTES, MAX_CARDS, MAX_COLUMNS, NARROW_BELOW, COLUMN_MIN, PAD, GAP, COLOURS, FONT, MONTHS,
    CARD_MAX_BYTES, CARD_WAIT, MAX_ANSWER, KEEP_OPEN,
    read, validate, build, parseXML, xmlToFile, xmlToCard, readCard, validateCard, contrast, perRow, countOf, folded, buttonsFor, linkOf, thousands,
    wideHTML, narrowHTML, cardHTML, problemsHTML, CSS, vars, draw, clear, esc,
  };
});
