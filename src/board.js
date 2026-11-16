/*!
 * Board Generator 1.0.0 — one file in, one board out.
 * MIT licence. https://github.com/chalouhi/board-generator
 *
 * This single file is everything a web page needs: the reader (JSON and XML),
 * the checks, and the board drawn as a page, with cards that open. Include it
 * and call BoardGenerator.draw(place, fileText, options). In Node:
 * require('./src/board.js'). It makes no network request of any kind.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BoardGenerator = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = '1.0.0';
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
  function parseXML(src) {
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
    if (top0.children.length !== 1) { i = 0; fail('the file must hold exactly one top element, <board>'); }
    return top0.children[0];
  }

  // The XML form mapped to the object the JSON form gives: attributes take the
  // field names with hyphens for underscores, yes/no for true/false, commas
  // for lists, and a card's text is the text inside its element.
  function xmlToFile(el) {
    if (el.name !== 'board') throw new XmlError(`the top element must be <board>, not <${el.name}>`);
    const num = v => (/^\s*-?\d+\s*$/.test(v) ? Number(v) : v);
    const yn = v => (v === 'yes' ? true : v === 'no' ? false : v);
    const list = v => v.split(',').map(s => s.trim()).filter(Boolean);
    const take = (a, spec) => {
      const o = {};
      for (const [attr, field, conv] of spec) if (has(a, attr)) o[field] = conv ? conv(a[attr]) : a[attr];
      return o;
    };
    const BUTTON = [['name', 'name'], ['link', 'link'], ['action', 'action'], ['kinds', 'kinds', list], ['columns', 'columns', list],
      ['strip-only', 'strip_only', yn], ['main', 'main', yn], ['confirm', 'confirm']];
    const file = take(el.attrs, [['version', 'board', num], ['title', 'title'], ['today', 'today'], ['link-pattern', 'link_pattern'],
      ['summary', 'summary', v => (v === 'auto' || v === 'off' ? v : list(v))]]);
    file.columns = []; file.cards = [];
    for (const c of el.children) {
      if (c.name === 'column') file.columns.push(take(c.attrs, [['name', 'name'], ['limit', 'limit', num], ['show', 'show', num], ['total', 'total', num], ['more-link', 'more_link']]));
      else if (c.name === 'strip') file.strip = take(c.attrs, [['name', 'name'], ['show', 'show', num]]);
      else if (c.name === 'button') (file.buttons = file.buttons || []).push(take(c.attrs, BUTTON));
      else if (c.name === 'style') {
        file.style = take(c.attrs, [['card-lines', 'card_lines', num]]);
        for (const k of c.children) if (k.name === 'colour') (file.style.colours = file.style.colours || {})[k.attrs.name] = k.attrs.value;
      } else if (c.name === 'card') {
        const card = take(c.attrs, [['id', 'id'], ['title', 'title'], ['column', 'column'], ['kind', 'kind'], ['group', 'group'], ['due', 'due'],
          ['note', 'note'], ['in-strip', 'in_strip', yn], ['link', 'link']]);
        const text = (c.text || '').trim();
        if (text) card.text = text;
        const buttons = c.children.filter(k => k.name === 'button').map(k => take(k.attrs, BUTTON));
        if (buttons.length) card.buttons = buttons;
        file.cards.push(card);
      }
    }
    return file;
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
  function buttonsFor(board, card, listening) {
    const list = card.buttons.slice();
    for (const b of board.buttons) {
      if (Array.isArray(b.kinds) && !(card.kind && b.kinds.some(k => key(k) === key(card.kind)))) continue;
      if (Array.isArray(b.columns) && !b.columns.some(k => key(k) === key(card.column.name))) continue;
      if (b.strip_only === true && !card.inStrip) continue;
      list.push(b);
    }
    const drawn = list.filter(b => (listening && filled(b.action)) || filled(b.link));
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

  /** The wide form at a given width (fold: apply each list's "show"). */
  function wideHTML(board, width, fold) {
    if (fold === undefined) fold = true;
    const per = perRow(width, board.columns.length);
    const chips = board.summary.map(x => `<span class="bg-chip">${esc(x)}</span>`).join('');
    const cols = board.columns.map(col => {
      const f = folded(col.cards, col.count, col.show, fold);
      return `<section class="bg-col" aria-label="${esc(col.name)}">${heading('bg-h', col.name, countOf(col))}` +
        f.drawn.map(c => face(board, c, 'bg-card')).join('') + moreHTML(f.more, col.more_link) + '</section>';
    }).join('');
    return `<div class="bg-board bg-wide" data-per="${per}"><header class="bg-head"><span class="bg-dot" aria-hidden="true"></span>` +
      `<h1 class="bg-title">${esc(board.title)}</h1>${chips}</header>${stripHTML(board, 'bg-card bg-flat', fold)}` +
      `<div class="bg-cols" data-per="${per}">${cols}</div></div>`;
  }

  /** The narrow form: one list (requirement 15). */
  function narrowHTML(board) {
    const sum = board.summary.map(esc).join(' · ');
    const cols = board.columns.map(col => {
      const f = folded(col.cards, col.count, col.show, true);
      return `<section class="bg-ncol" aria-label="${esc(col.name)}">${heading('bg-nh', col.name, countOf(col))}` +
        f.drawn.map(c => face(board, c, 'bg-row')).join('') + moreHTML(f.more, col.more_link) + '</section>';
    }).join('');
    return `<div class="bg-board bg-narrow"><header class="bg-nhead"><div class="bg-nt"><span class="bg-dot" aria-hidden="true"></span>` +
      `<h1 class="bg-title">${esc(board.title)}</h1></div>${sum ? `<div class="bg-nsum">${sum}</div>` : ''}</header>` +
      `${stripHTML(board, 'bg-card bg-flat')}${cols}</div>`;
  }

  /** An opened card (requirement 17). */
  function cardHTML(board, card, listening, narrow) {
    const { main, rest } = buttonsFor(board, card, listening);
    const btn = (b, k, cls) => {
      const act = listening && filled(b.action);
      return act ? `<button type="button" class="bg-btn ${cls}" data-b="${k}">${esc(b.name)}</button>`
        : `<a class="bg-btn ${cls}" data-b="${k}" href="${esc(linkOf(b, card))}" target="_blank" rel="noopener noreferrer">${esc(b.name)}</a>`;
    };
    const all = buttonsFor(board, card, listening).all;
    const fields = [['Column', esc(card.column.name)]];
    if (card.group) fields.push(['Group', esc(card.group)]);
    if (card.due) fields.push(['Due', card.tone ? `<span class="bg-${card.tone}-plain">${esc(card.due)}</span>` : esc(card.due)]);
    if (card.note) fields.push(['Note', esc(card.note)]);
    const restHTML = rest.map(b => btn(b, all.indexOf(b), 'bg-plain')).join('');
    return `<div class="bg-overlay${narrow ? ' bg-sheet' : ''}"><div class="bg-dialog" role="dialog" aria-modal="true" aria-labelledby="bg-dt" data-i="${card.index}">` +
      `<div class="bg-dtop"><div class="bg-dhead"><div class="bg-l1">${esc(card.label)}</div><h1 class="bg-dtitle" id="bg-dt">${esc(card.title)}</h1></div>` +
      `<button type="button" class="bg-x" aria-label="Close"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l12 12M15 3L3 15"/></svg></button></div>` +
      (card.text ? `<p class="bg-text">${esc(card.text)}</p>` : '') +
      `<div class="bg-fields">${fields.map(([a, b]) => `<div class="bg-field"><span class="bg-fl">${a}</span><span class="bg-fv">${b}</span></div>`).join('')}</div>` +
      (all.length ? `<div class="bg-actions"><div class="bg-rest">${restHTML}</div>${main ? btn(main, all.indexOf(main), 'bg-main') : ''}</div>` : '') +
      '</div></div>';
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
.bg-dialog{background:#fff;color:var(--bg-ink);border-radius:24px;padding:20px 20px 16px 28px;display:flex;flex-direction:column;gap:16px;width:680px;max-width:100%;max-height:100%;overflow:auto}
.bg-sheet{padding:0;align-items:stretch}
.bg-sheet .bg-dialog{border-radius:0;width:100%;padding:12px 12px 16px 20px}
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
.bg-problems{padding:28px 32px;color:var(--bg-ink)}
.bg-problems h1{font-size:20px;font-weight:700;color:var(--bg-late);margin:0 0 12px}
.bg-problems ol{margin:0;padding-left:22px;display:flex;flex-direction:column;gap:6px;font-size:15px;line-height:1.4}
.bg-problems li{overflow-wrap:anywhere}`;

  /* ------------------------------------------------------------------ *
   * Drawing into a place on a page (requirements 17–21, 34–36)
   * ------------------------------------------------------------------ */
  const places = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  let sheet = null;

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
    s = { place, shadow, host, board: null, form: '', opened: null, opener: null, onAction: null };
    host.addEventListener('click', e => click(s, e));
    host.addEventListener('keydown', e => key_(s, e));
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
  function paint(s, force) {
    if (!s.board) return;
    const w = s.host.clientWidth || s.place.clientWidth || 1280;
    const form = formOf(w, s.board.columns.length);
    if (!force && form === s.form) return;
    s.form = form;
    const open = s.opened;
    s.host.innerHTML = form === 'narrow' ? narrowHTML(s.board) : wideHTML(s.board, w, true);
    setColours(s.host, s.board.colours);
    s.host.setAttribute('data-form', form === 'narrow' ? 'narrow' : 'wide');
    if (open) openCard(s, open, false);
  }

  function openCard(s, card, focus) {
    closeCard(s, false);
    s.opened = card;
    const wrap = document.createElement('div');
    wrap.innerHTML = cardHTML(s.board, card, !!s.onAction, s.form === 'narrow');
    const overlay = wrap.firstChild;
    s.host.appendChild(overlay);
    if (focus !== false) { const x = overlay.querySelector('.bg-x'); if (x) x.focus(); }
  }
  function closeCard(s, restore) {
    const o = s.host.querySelector('.bg-overlay');
    if (o) o.remove();
    const card = s.opened;
    s.opened = null;
    if (restore && card) {
      const el = s.host.querySelector(`[data-i="${card.index}"]`);
      if (el) el.focus();
    }
  }

  function click(s, e) {
    const t = e.target;
    const overlay = t.closest && t.closest('.bg-overlay');
    if (overlay) {
      if (t === overlay) { closeCard(s, true); return; }
      if (t.closest('.bg-x')) { closeCard(s, true); return; }
      const b = t.closest('[data-b]');
      if (!b) return;
      const card = s.opened, list = buttonsFor(s.board, card, !!s.onAction).all, def = list[+b.getAttribute('data-b')];
      if (!def) return;
      if (filled(def.confirm) && !window.confirm(def.confirm)) { e.preventDefault(); return; }
      if (s.onAction && filled(def.action)) {
        e.preventDefault();
        closeCard(s, true);
        try { s.onAction(def.action, card.id); } catch (err) { setTimeout(() => { throw err; }); }
        return;
      }
      // A link: the browser opens it (target _blank); the card closes.
      setTimeout(() => closeCard(s, true), 0);
      return;
    }
    const el = t.closest && t.closest('[data-i]');
    if (!el || (t.closest('a') && !t.closest('.bg-card,.bg-row'))) return;
    openCard(s, s.board.cards[+el.getAttribute('data-i')]);
  }

  function key_(s, e) {
    if (s.opened) {
      if (e.key === 'Escape') { e.preventDefault(); closeCard(s, true); return; }
      if (e.key === 'Tab') { // keep the focus inside the opened card
        const items = [...s.host.querySelectorAll('.bg-overlay button, .bg-overlay a[href]')];
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1], at = s.shadow.activeElement;
        if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest && e.target.closest('[data-i]');
    if (!el) return;
    e.preventDefault();
    openCard(s, s.board.cards[+el.getAttribute('data-i')]);
  }

  /**
   * Draws a board from a file's text into `place`, at that place's width.
   * Everything goes inside a shadow root on `place`; nothing else on the page
   * is touched. Calling it again on the same place redraws it.
   *   options.onAction(action, id): be told about buttons (requirement 35).
   *   options.today: YYYY-MM-DD, when the file gives no "today".
   * Returns {ok: true, board} or {ok: false, errors}.
   */
  function draw(place, text, options) {
    const o = options || {};
    const s = mount(place);
    s.onAction = typeof o.onAction === 'function' ? o.onAction : null;
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
    s.board = null; s.form = '';
    s.host.innerHTML = '';
    s.host.removeAttribute('data-form');
  }

  return {
    VERSION, MAX_BYTES, MAX_CARDS, MAX_COLUMNS, NARROW_BELOW, COLUMN_MIN, PAD, GAP, COLOURS, FONT, MONTHS,
    read, validate, build, parseXML, xmlToFile, contrast, perRow, countOf, folded, buttonsFor, linkOf, thousands,
    wideHTML, narrowHTML, cardHTML, problemsHTML, CSS, vars, draw, clear, esc,
  };
});
