/*!
 * Board Generator — the PDF (requirements 23 and 24). MIT licence.
 * A4 portrait, white, Calibri or the nearest font given. Under the title,
 * the summary and a rule in the accent colour: one table, a grey heading row
 * per column (the strip first), one row per card, every card in the file.
 * Text is real text, links work, no row is cut across two pages, and each
 * page carries the date and "Page n of m".
 *
 * Needs pdf-lib and @pdf-lib/fontkit (both in vendor/, no network).
 * Browser: include vendor/pdf-lib.min.js, vendor/fontkit.umd.min.js and
 * src/board.js and src/fontsubset.js first, then BoardPDF.build(board, {PDFLib, fontkit, regular, bold}).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./board.js'), require('./fontsubset.js'));
  else root.BoardPDF = factory(root.BoardGenerator, root.BoardFontSubset);
})(typeof self !== 'undefined' ? self : this, function (B, FS) {
  'use strict';

  const PAGE_W = 595.28, PAGE_H = 841.89;
  const ML = 39, MT = 36, MB = 36, CW = PAGE_W - 2 * ML, FOOT = 22;
  const BOTTOM = PAGE_H - MB - FOOT;            // nothing in the table goes below this
  const GREY = '#EEF1F2', SUB = '#4A565C', BLACK = '#000000';
  const PADX = 6, PADY = 4.5;
  const COLS = [{ t: 'Card', w: 72 }, { t: 'Title', w: CW - 72 - 63 - 112.5 }, { t: 'Group', w: 63 }, { t: 'Due and note', w: 112.5 }];
  const ASC = 0.952;

  function rgb(PDFLib, h) {
    const n = parseInt(String(h).slice(1), 16);
    return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  async function build(board, opts) {
    const PDFLib = opts.PDFLib, fontkit = opts.fontkit;
    const { PDFDocument, PDFString, PDFName } = PDFLib;
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    pdf.setTitle(board.title);
    pdf.setCreator('Board Generator ' + B.VERSION);
    pdf.setProducer('Board Generator ' + B.VERSION);
    const fixed = new Date(Date.UTC(board.today.y, board.today.m - 1, board.today.d));
    pdf.setCreationDate(fixed); pdf.setModificationDate(fixed);
    // The fonts are cut down here (src/fontsubset.js) to the letters the PDF
    // uses and embedded whole: pdf-lib's own cutting drops letters in some
    // readers.
    const all = new Set();
    const add = s => { for (const ch of String(s)) all.add(ch); };
    [board.title, board.summary.join(' · '), 'Card Title Group Due and note Page of · 0123456789 listed due /', B.MONTHS.join(' ')].forEach(add);
    if (board.strip) add(board.strip.name);
    board.columns.forEach(c => add(c.name));
    board.cards.forEach(c => [c.label, c.title, c.group, c.note, c.due].forEach(v => v && add(v)));
    const chars = [...all].join('') + '-\'"?';
    const fR = await pdf.embedFont(FS.subset(opts.regular, chars, false), { subset: false });
    const fB = await pdf.embedFont(FS.subset(opts.bold || opts.regular, chars, true), { subset: false });
    const glyphs = new Set(fR.getCharacterSet());
    const SUBST = { '→': '->', '—': '-', '–': '-', '“': '"', '”': '"', '‘': "'", '’': "'" };
    const clean = s => Array.from(String(s)).map(ch => (glyphs.has(ch.codePointAt(0)) ? ch : (SUBST[ch] != null ? SUBST[ch] : '?'))).join('');
    const col = h => rgb(PDFLib, h);
    const C = board.colours;

    const pages = [];
    let page = null, y = 0;
    const trace = opts.trace;
    const newPage = () => { page = pdf.addPage([PAGE_W, PAGE_H]); pages.push(page); y = MT; };
    const text = (s, x, base, size, font, colour) => {
      const t = clean(s);
      if (trace) trace.push({ page: pages.length, top: base - size * ASC, bottom: base + size * 0.27, text: t });
      page.drawText(t, { x, y: PAGE_H - base, size, font, color: col(colour || BLACK) });
    };
    const width = (s, size, font) => font.widthOfTextAtSize(clean(s), size);
    const link = (x1, top, x2, bottom, url) => {
      const a = pdf.context.obj({
        Type: 'Annot', Subtype: 'Link', Rect: [x1, PAGE_H - bottom, x2, PAGE_H - top], Border: [0, 0, 0],
        A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
      });
      page.node.addAnnot(pdf.context.register(a));
    };
    const rule = (top, colour, thick, x1, x2) => page.drawLine({ start: { x: x1 == null ? ML : x1, y: PAGE_H - top }, end: { x: x2 == null ? ML + CW : x2, y: PAGE_H - top }, thickness: thick, color: col(colour) });
    function wrap(s, size, font, max) {
      const words = clean(s).split(/\s+/).filter(Boolean), lines = []; let cur = '';
      for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (cur && font.widthOfTextAtSize(t, size) > max) { lines.push(cur); cur = w; } else cur = t;
      }
      if (cur) lines.push(cur);
      return (lines.length ? lines : ['']).flatMap(l => {
        if (font.widthOfTextAtSize(l, size) <= max) return [l];
        const out = []; let c = '';
        for (const ch of Array.from(l)) { if (c && font.widthOfTextAtSize(c + ch, size) > max) { out.push(c); c = ch; } else c += ch; }
        if (c) out.push(c);
        return out;
      });
    }

    // Title, summary and the accent rule.
    newPage();
    const summary = board.summary.join(' · ');
    const sw = summary ? width(summary, 9.75, fR) : 0;
    const oneLine = width(board.title, 16.5, fB) + 16 + sw <= CW;
    const tl = wrap(board.title, 16.5, fB, oneLine ? CW - sw - 16 : CW);
    tl.forEach((l, i) => text(l, ML, y + 16.5 * ASC + i * 19.5, 16.5, fB));
    let base = y + 16.5 * ASC + (tl.length - 1) * 19.5;
    if (summary) {
      if (oneLine) text(summary, ML + CW - sw, base, 9.75, fR, SUB);
      else wrap(summary, 9.75, fR, CW).forEach(l => { base += 13; text(l, ML, base, 9.75, fR, SUB); });
    }
    y = base + 0.27 * 16.5 + 6;
    rule(y, C.accent, 1.5);
    y += 0.75 + 10.5;

    // The table.
    const header = () => {
      let x = ML;
      for (const c of COLS) { text(c.t, x + PADX, y + 9 * ASC, 9, fR, SUB); x += c.w; }
      y += 9 * 1.22 + 3;
    };
    const headRow = (name, count) => {
      const label = clean(name), tail = ' · ' + count;
      const nl = wrap(label, 10.5, fB, CW - 2 * PADX - width(tail, 9.75, fR));
      const h = nl.length * 13 + 2 * PADY;
      return {
        h,
        draw() {
          page.drawRectangle({ x: ML, y: PAGE_H - (y + h), width: CW, height: h, color: col(GREY) });
          rule(y, C.line, 0.75); rule(y + h, C.line, 0.75);
          nl.forEach((l, i) => {
            const b = y + PADY + 10.5 * ASC + i * 13;
            text(l, ML + PADX, b, 10.5, fB);
            if (i === nl.length - 1) text(tail, ML + PADX + width(l, 10.5, fB), b, 9.75, fR, SUB);
          });
          y += h;
        },
      };
    };
    const cardRow = c => {
      const dueNote = [c.due ? `due ${c.due}` : null, c.note].filter(Boolean).join(' · ');
      const strong = !!(c.tone || c.note);
      const cells = [
        { lines: wrap(c.label, 9.75, fR, COLS[0].w - 2 * PADX), size: 9.75, font: fR, colour: SUB, lh: 12 },
        { lines: wrap(c.title, 11.25, fB, COLS[1].w - 2 * PADX), size: 11.25, font: fB, colour: BLACK, lh: 13.5, link: c.address },
        { lines: c.group ? wrap(c.group, 9.75, fR, COLS[2].w - 2 * PADX) : [], size: 9.75, font: fR, colour: SUB, lh: 12 },
        { lines: dueNote ? wrap(dueNote, 9.75, strong ? fB : fR, COLS[3].w - 2 * PADX) : [], size: 9.75, font: strong ? fB : fR, colour: BLACK, lh: 12 },
      ];
      const h = Math.max(...cells.map(k => k.lines.length * k.lh)) + 2 * PADY;
      return {
        h,
        draw() {
          let x = ML;
          cells.forEach((k, i) => {
            k.lines.forEach((l, j) => text(l, x + PADX, y + PADY + 11.25 * ASC + j * k.lh, k.size, k.font, k.colour));
            if (k.link && k.lines.length) {
              const lw = Math.max(...k.lines.map(l => width(l, k.size, k.font)));
              link(x + PADX, y + PADY, x + PADX + lw, y + PADY + k.lines.length * k.lh, k.link);
            }
            x += COLS[i].w;
          });
          rule(y + h, C.line, 0.75);
          y += h;
        },
      };
    };
    // Each group: its heading row, then its card rows. A heading never ends a
    // page alone, and no row is cut across two pages.
    const fits = h => y + h <= BOTTOM;
    const place = (row, keepWith) => {
      if (!fits(row.h + (keepWith || 0))) { newPage(); header(); }
      row.draw();
    };
    header();
    const group = (name, count, cards) => {
      const rows = cards.map(cardRow);
      place(headRow(name, count), rows.length ? rows[0].h : 0);
      rows.forEach(r => place(r));
    };
    const s = board.strip;
    if (s && s.cards.length) group(s.name, B.thousands(s.cards.length), s.cards);
    for (const c of board.columns) {
      let count = B.countOf(c).text;
      if (c.count > c.cards.length) count += ` · ${B.thousands(c.cards.length)} listed`;
      group(c.name, count, c.cards);
    }

    // The date and "Page n of m" on every page.
    const date = `${board.today.d} ${B.MONTHS[board.today.m - 1]} ${board.today.y}`;
    pages.forEach((p, i) => {
      page = p;
      const fb = PAGE_H - MB;
      text(date, ML, fb, 9, fR, SUB);
      const pn = `Page ${i + 1} of ${pages.length}`;
      text(pn, ML + CW - width(pn, 9, fR), fb, 9, fR, SUB);
    });
    void PDFName;
    return pdf.save({ useObjectStreams: false });
  }

  return { build, PAGE_W, PAGE_H, BOTTOM, MT };
});
