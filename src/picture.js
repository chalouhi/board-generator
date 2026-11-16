/*!
 * Board Generator — the picture (requirement 22). MIT licence.
 * One SVG that shows correctly by itself: white background, its own colours,
 * its own font (a cut-down copy holding only the letters it uses), working
 * links. The wide board, every card in the file drawn; "show" is ignored.
 *
 * Needs fontkit (vendor/) and the regular and bold font files.
 * Node: require('./src/picture.js').svg(board, {fontkit, regular, bold, width})
 * Browser: include vendor/fontkit.umd.min.js, src/board.js and
 * src/fontsubset.js first, then BoardPicture.svg(...). Returns a Promise.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./board.js'), require('./fontsubset.js'));
  else root.BoardPicture = factory(root.BoardGenerator, root.BoardFontSubset);
})(typeof self !== 'undefined' ? self : this, function (B, FS) {
  'use strict';

  const { PAD, GAP, esc } = B;
  // Carlito's line metrics (hhea), used to place a baseline in a line box.
  const ASC = 1950 / 2048, DESC = 550 / 2048;
  const n2 = v => Math.round(v * 100) / 100;
  const fonts = typeof WeakMap !== 'undefined' ? new WeakMap() : null;

  function fontOf(fontkit, bytes) {
    const k = bytes && bytes.buffer ? bytes : null;
    let f = k && fonts && fonts.get(k);
    if (!f) {
      const font = fontkit.create(typeof Buffer !== 'undefined' && !(bytes instanceof Buffer) ? Buffer.from(bytes) : bytes);
      f = { font, bytes, widths: new Map() };
      if (k && fonts) fonts.set(k, f);
    }
    return f;
  }
  function b64(u8) {
    if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  }

  async function svg(board, opts) {
    const W = Math.max(320, Math.round((opts && opts.width) || 1280));
    const R = fontOf(opts.fontkit, opts.regular), Bd = fontOf(opts.fontkit, opts.bold || opts.regular);
    const C = board.colours;
    const used = { r: new Set(), b: new Set() };
    const width = (s, size, bold, ls) => {
      const f = bold ? Bd : R;
      let w = 0, n = 0;
      for (const ch of s) {
        let a = f.widths.get(ch);
        if (a == null) { const g = f.font.glyphForCodePoint(ch.codePointAt(0)); a = g ? g.advanceWidth : f.font.unitsPerEm / 2; f.widths.set(ch, a); }
        w += a; n++;
      }
      return (w / f.font.unitsPerEm) * size + (ls || 0) * n;
    };
    const base = (top, lh, size) => n2(top + (lh - size * (ASC + DESC)) / 2 + size * ASC);

    // Text runs: {t, bold, fill}. Wrapped into lines no wider than max.
    function wrap(runs, size, max, ls) {
      const toks = [];
      for (const r of runs) for (const t of String(r.t).split(/(\s+)/)) if (t) toks.push({ t, bold: r.bold, fill: r.fill, space: /^\s+$/.test(t) });
      const lines = []; let line = [], w = 0, gap = null;
      const push = () => { if (line.length) lines.push(line); line = []; w = 0; gap = null; };
      for (const tk of toks) {
        if (tk.space) { if (line.length) gap = { t: ' ', bold: tk.bold, fill: tk.fill }; continue; }
        const ww = width(tk.t, size, tk.bold, ls), gw = gap ? width(' ', size, gap.bold, ls) : 0;
        if (line.length && w + gw + ww > max) push();
        if (!line.length && ww > max) { // a word longer than the line is cut by characters
          let cur = '';
          for (const ch of tk.t) {
            if (cur && width(cur + ch, size, tk.bold, ls) > max) { line.push({ t: cur, bold: tk.bold, fill: tk.fill }); push(); cur = ch; } else cur += ch;
          }
          line.push({ t: cur, bold: tk.bold, fill: tk.fill }); w = width(cur, size, tk.bold, ls);
          continue;
        }
        if (line.length && gap) { line.push(gap); w += gw; }
        line.push({ t: tk.t, bold: tk.bold, fill: tk.fill }); w += ww; gap = null;
      }
      push();
      return lines;
    }
    function clamp(lines, n, size, max) { // at most n lines; the last ends with "…"
      if (lines.length <= n) return lines;
      const out = lines.slice(0, n), last = out[n - 1].map(r => Object.assign({}, r));
      const lineW = () => last.reduce((a, r) => a + width(r.t, size, r.bold), 0);
      const tail = last[last.length - 1];
      tail.t = tail.t.replace(/\s+$/, '') + '…';
      while (lineW() > max && tail.t.length > 1) tail.t = tail.t.slice(0, -2).replace(/\s+$/, '') + '…';
      out[n - 1] = last;
      return out;
    }
    function tspans(line, defBold, defFill) {
      const merged = [];
      for (const r of line) {
        const p = merged[merged.length - 1];
        if (p && p.bold === r.bold && p.fill === r.fill) p.t += r.t; else merged.push(Object.assign({}, r));
      }
      return merged.map(r => {
        for (const ch of r.t) (r.bold ? used.b : used.r).add(ch);
        const a = (r.bold !== defBold ? ` font-weight="${r.bold ? 700 : 400}"` : '') + (r.fill !== defFill ? ` fill="${r.fill}"` : '');
        return a ? `<tspan${a}>${esc(r.t)}</tspan>` : esc(r.t);
      }).join('');
    }
    function text(x, y, line, size, bold, fill, extra) {
      return `<text x="${n2(x)}" y="${y}" font-size="${size}"${bold ? ' font-weight="700"' : ''} fill="${fill}"${extra || ''}>${tspans(line, bold, fill)}</text>`;
    }
    const one = (t, bold, fill) => [{ t, bold, fill }];

    // A card at inner text width tw: its height, and how to draw it.
    function card(c, tw) {
      const three = board.lines === 3;
      const l1 = three ? one(c.label.toUpperCase(), true, C.label) : null;
      const title = clamp(wrap(one(c.title, true, C.ink), 16, tw), 2, 16, tw);
      const runs = [], sep = () => { if (runs.length) runs.push({ t: ' · ', bold: false, fill: C.muted }); };
      if (!three) runs.push({ t: c.label, bold: false, fill: C.muted });
      if (c.group) { sep(); runs.push({ t: c.group, bold: false, fill: C.muted }); }
      if (c.due) { sep(); runs.push({ t: `due ${c.due}`, bold: !!c.tone, fill: c.tone ? C[c.tone] : C.muted }); }
      if (c.note) { sep(); runs.push({ t: c.note, bold: true, fill: C.ink }); }
      const l3 = runs.length ? wrap(runs, 13, tw) : [];
      const parts = [];
      if (l1) parts.push(['l1', 16]);
      parts.push(['t', 20 * title.length]);
      if (l3.length) parts.push(['l3', 17 * l3.length]);
      const h = 24 + parts.reduce((a, p) => a + p[1], 0) + 6 * (parts.length - 1);
      return {
        h,
        draw(x, y, w, hh, flat) {
          const o = [];
          if (!flat) o.push(`<rect x="${n2(x)}" y="${n2(y + 1)}" width="${n2(w)}" height="${n2(hh)}" rx="12" fill="#16232A" fill-opacity="0.08"/>`);
          o.push(`<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(hh)}" rx="12" fill="#FFFFFF"/>`);
          let top = y + 12;
          const tx = x + 14;
          if (l1) { o.push(text(tx, base(top, 16, 12), l1, 12, true, C.label, ' letter-spacing="0.36"')); top += 22; }
          const tl = title.map((ln, k) => text(tx, base(top + 20 * k, 20, 16), ln, 16, true, C.ink)).join('');
          o.push(c.address ? `<a href="${esc(c.address)}" target="_blank">${tl}</a>` : tl);
          top += 20 * title.length + 6;
          l3.forEach((ln, k) => o.push(text(tx, base(top + 17 * k, 17, 13), ln, 13, false, C.muted)));
          return o.join('');
        },
      };
    }
    // Labels in the label width: "n more".
    function more(n, link, x, y) {
      const t = text(x, base(y + 8, 17, 13), one(`${B.thousands(n)} more`, true, C.label), 13, true, C.label);
      return link ? `<a href="${esc(link)}" target="_blank">${t}</a>` : t;
    }
    function headingRow(name, count, x, y, w) {
      const nl = wrap(one(name, true, C.ink), 15, Math.max(20, w - 4 - width(count.text, 13, count.over) - 8));
      const o = nl.map((ln, k) => text(x + 2, base(y + 19 * k, 19, 15), ln, 15, true, C.ink)).join('');
      return {
        h: 19 * nl.length,
        svg: o + text(x + w - 2, base(y, 19, 15), one(count.text, count.over, count.over ? C.late : C.muted), 13, count.over, count.over ? C.late : C.muted, ' text-anchor="end"'),
      };
    }

    const out = [];
    let y = 20;
    // Header: the dot, the title, the summary labels (flex, wrapping).
    {
      const inner = W - 2 * PAD;
      const items = [{ w: 12, h: 12, kind: 'dot' }];
      const tlines = wrap(one(board.title, true, C.ink), 22, inner - 24);
      const tw = Math.max(...tlines.map(l => l.reduce((a, r) => a + width(r.t, 22, true), 0)));
      items.push({ w: tw + 8, h: 26.4 * tlines.length, kind: 'title', lines: tlines });
      for (const s of board.summary) items.push({ w: Math.min(inner, width(s, 13, false) + 24), h: 27, kind: 'chip', t: s });
      const rows = []; let row = [], rw = 0;
      for (const it of items) {
        if (row.length && rw + 12 + it.w > inner) { rows.push(row); row = []; rw = 0; }
        rw += (row.length ? 12 : 0) + it.w; row.push(it);
      }
      rows.push(row);
      rows.forEach((r, k) => {
        const h = Math.max(...r.map(i => i.h));
        let x = PAD;
        for (const it of r) {
          const top = y + (h - it.h) / 2;
          if (it.kind === 'dot') out.push(`<circle cx="${n2(x + 6)}" cy="${n2(y + h / 2)}" r="6" fill="${C.accent}"/>`);
          else if (it.kind === 'title') it.lines.forEach((ln, j) => out.push(text(x, base(top + 26.4 * j, 26.4, 22), ln, 22, true, C.ink)));
          else {
            out.push(`<rect x="${n2(x)}" y="${n2(top)}" width="${n2(it.w)}" height="27" rx="8" fill="${C.column}"/>`);
            out.push(text(x + 12, base(top + 5, 17, 13), one(it.t, false, C.ink), 13, false, C.ink));
          }
          x += it.w + 12;
        }
        y += h + (k < rows.length - 1 ? 12 : 0);
      });
      y += 12;
    }

    // The top strip, across the full width.
    const s = board.strip;
    if (s && s.cards.length) {
      y += 4;
      const x = PAD, w = W - 2 * PAD, iw = w - 24;
      const head = headingRow(s.name, { text: B.thousands(s.cards.length), over: false }, x + 12, y + 12, iw);
      const body = [];
      let cy = y + 12 + head.h + 4 + 8;
      const fit = Math.max(1, Math.floor((iw + 8) / (320 + 8)));
      for (let i = 0; i < s.cards.length; i += fit) {
        const line = s.cards.slice(i, i + fit), cw = (iw - 8 * (line.length - 1)) / line.length;
        const made = line.map(c => card(c, cw - 28));
        const h = Math.max(...made.map(m => m.h));
        made.forEach((m, k) => body.push(m.draw(x + 12 + k * (cw + 8), cy, cw, h, true)));
        cy += h + 8;
      }
      cy -= 8;
      const sh = cy + 12 - y;
      out.push(`<rect x="${x}" y="${n2(y)}" width="${w}" height="${n2(sh)}" rx="16" fill="${C.strip}"/>`, head.svg, ...body);
      y += sh + 16;
    }

    // The columns, wrapped into rows of even length.
    const per = B.perRow(W, board.columns.length);
    const cw = (W - 2 * PAD - GAP * (per - 1)) / per;
    for (let r = 0; r < board.columns.length; r += per) {
      const row = board.columns.slice(r, r + per);
      let rowH = 0;
      const drawn = row.map((col, k) => {
        const x = PAD + k * (cw + GAP), iw = cw - 24, o = [];
        const head = headingRow(col.name, B.countOf(col), x + 12, y + 12, iw);
        o.push(head.svg);
        let cy = y + 12 + head.h + 4;
        for (const c of col.cards) {
          const m = card(c, iw - 28);
          cy += 8;
          o.push(m.draw(x + 12, cy, iw, m.h, false));
          cy += m.h;
        }
        const extra = col.count - col.cards.length;
        if (extra > 0) { cy += 8; o.push(more(extra, col.more_link, x + 12 + 4, cy)); cy += 27; }
        const h = cy + 12 - y;
        rowH = Math.max(rowH, h);
        return { x, h, o };
      });
      for (const d of drawn) out.push(`<rect x="${n2(d.x)}" y="${n2(y)}" width="${n2(cw)}" height="${n2(d.h)}" rx="16" fill="${C.column}"/>`, ...d.o);
      y += rowH + GAP;
    }
    const H = Math.ceil(y - GAP + PAD);

    // The fonts, cut down to the letters used.
    const faces = [];
    if (used.r.size) faces.push([400, FS.subset(R.bytes, [...used.r].join(''), false)]);
    if (used.b.size) faces.push([700, FS.subset(Bd.bytes, [...used.b].join(''), true)]);
    const css = faces.map(([wt, bytes]) => `@font-face{font-family:"${FS.FAMILY}";font-weight:${wt};src:url(data:font/ttf;base64,${b64(bytes)}) format("truetype")}`).join('') +
      `text{font-family:"${FS.FAMILY}",${B.FONT}}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc('Board: ' + board.title)}">` +
      `<title>${esc(board.title)}</title><style>${css}</style><rect width="${W}" height="${H}" fill="#FFFFFF"/>${out.join('')}</svg>`;
  }

  return { svg };
});
