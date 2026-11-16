/*!
 * Board Generator — a small font for one picture. MIT licence.
 * Makes a TrueType font holding only the letters a picture uses, so the SVG
 * carries its own font (requirement 22). The glyphs are copied from the
 * source font (with the parts accented letters are built from) and numbered
 * afresh; the tables a browser needs are rebuilt around them. Hinting is
 * left out (browsers draw these sizes well without it).
 * A cut-down Carlito is renamed "Board Sans": its licence (SIL Open Font
 * Licence 1.1) reserves the name for the unmodified font. Its copyright and
 * licence lines are kept in the name table. Other fonts keep their names.
 * Used for the picture and the PDF.
 * Works on TrueType (glyf) fonts only. No dependencies.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BoardFontSubset = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FAMILY = 'Board Sans';
  const KEEP = ['OS/2'];
  const RESERVED = ['Carlito']; // reserved font names (SIL Open Font Licence)

  // A plain byte array over the same memory. (A Node Buffer's slice() does not
  // copy; Uint8Array's does, and the glyphs are changed after copying.)
  function u8(x) { return x instanceof Uint8Array ? new Uint8Array(x.buffer, x.byteOffset, x.byteLength) : new Uint8Array(x); }
  function view(b) { return new DataView(b.buffer, b.byteOffset, b.byteLength); }
  function tablesOf(bytes) {
    const v = view(bytes), n = v.getUint16(4), out = {};
    for (let i = 0; i < n; i++) {
      const p = 12 + 16 * i;
      const tag = String.fromCharCode(bytes[p], bytes[p + 1], bytes[p + 2], bytes[p + 3]);
      const off = v.getUint32(p + 8), len = v.getUint32(p + 12);
      out[tag] = bytes.subarray(off, off + len);
    }
    return out;
  }
  function sum(b) {
    let s = 0;
    for (let i = 0; i < b.length; i += 4) s = (s + (((b[i] << 24) | ((b[i + 1] || 0) << 16) | ((b[i + 2] || 0) << 8) | (b[i + 3] || 0)) >>> 0)) >>> 0;
    return s;
  }
  function writer() {
    const a = [];
    return {
      u16(x) { a.push((x >> 8) & 255, x & 255); return this; },
      u32(x) { a.push((x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255); return this; },
      bytes(b) { for (let i = 0; i < b.length; i++) a.push(b[i]); return this; },
      get length() { return a.length; },
      done() { return new Uint8Array(a); },
    };
  }

  // The source font's cmap, read once: code point -> glyph id.
  function readCmap(t) {
    const v = view(t), n = v.getUint16(2), map = new Map();
    let best = null;
    for (let i = 0; i < n; i++) {
      const pid = v.getUint16(4 + 8 * i), eid = v.getUint16(6 + 8 * i), off = v.getUint32(8 + 8 * i), fmt = v.getUint16(off);
      if (pid === 3 && eid === 10 && fmt === 12) best = { off, fmt };
      else if (!best && ((pid === 3 && eid === 1) || pid === 0) && fmt === 4) best = { off, fmt };
    }
    if (!best) return map;
    const o = best.off;
    if (best.fmt === 12) {
      const groups = v.getUint32(o + 12);
      for (let g = 0; g < groups; g++) {
        const s = v.getUint32(o + 16 + 12 * g), e = v.getUint32(o + 20 + 12 * g), id = v.getUint32(o + 24 + 12 * g);
        for (let c = s; c <= e && c - s < 65536; c++) map.set(c, id + c - s);
      }
    } else {
      const seg = v.getUint16(o + 6) / 2, ends = o + 14, starts = ends + 2 * seg + 2, deltas = starts + 2 * seg, ranges = deltas + 2 * seg;
      for (let k = 0; k < seg; k++) {
        const e = v.getUint16(ends + 2 * k), s = v.getUint16(starts + 2 * k), d = v.getInt16(deltas + 2 * k), r = v.getUint16(ranges + 2 * k);
        for (let c = s; c <= e && c !== 0xffff; c++) {
          let g;
          if (r === 0) g = (c + d) & 0xffff;
          else { const at = ranges + 2 * k + r + 2 * (c - s); g = v.getUint16(at); if (g) g = (g + d) & 0xffff; }
          if (g) map.set(c, g);
        }
      }
    }
    return map;
  }

  const cache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function parse(source) {
    let f = cache && cache.get(source);
    if (f) return f;
    const bytes = u8(source);
    const t = tablesOf(bytes), head = view(t.head), long = head.getInt16(50) === 1;
    const numGlyphs = view(t.maxp).getUint16(4), lv = view(t.loca);
    const loca = [];
    for (let i = 0; i <= numGlyphs; i++) loca.push(long ? lv.getUint32(4 * i) : 2 * lv.getUint16(2 * i));
    f = { t, loca, numGlyphs, cmap: readCmap(t.cmap), hm: view(t.hhea).getUint16(34) };
    if (cache) cache.set(source, f);
    return f;
  }
  const glyph = (f, g) => f.t.glyf.subarray(f.loca[g], f.loca[g + 1]);
  // Components of a composite glyph: [offset of the glyph index, glyph id].
  function components(data) {
    if (data.length < 10 || view(data).getInt16(0) >= 0) return [];
    const v = view(data), out = [];
    let p = 10, flags;
    do {
      flags = v.getUint16(p);
      out.push([p + 2, v.getUint16(p + 2)]);
      p += 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0);
    } while (flags & 0x20);
    return out;
  }

  // A glyph without its hinting instructions.
  function unhinted(d) {
    if (d.length < 10) return d;
    const v = view(d), n = v.getInt16(0);
    if (n >= 0) {
      const at = 10 + 2 * n, len = v.getUint16(at);
      const out = new Uint8Array(d.length - len);
      out.set(d.subarray(0, at), 0); out.set(d.subarray(at + 2 + len), at + 2);
      view(out).setUint16(at, 0);
      return out;
    }
    const comps = components(d);
    let p = comps[comps.length - 1][0] - 2;
    const flags = v.getUint16(p);
    if (!(flags & 0x100)) return d;
    const end = p + 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0);
    const out = d.slice(0, end);
    view(out).setUint16(p, flags & ~0x100);
    return out;
  }

  // cmap with one (3,1) format 4 subtable: one segment per character.
  function cmap(map) {
    const segs = map.concat([[0xffff, 0]]), n = segs.length;
    let p = 1, e = 0; while (p * 2 <= n) { p *= 2; e++; }
    const sub = writer().u16(4).u16(16 + 8 * n).u16(0).u16(2 * n).u16(2 * p).u16(e).u16(2 * n - 2 * p);
    segs.forEach(([c]) => sub.u16(c)); sub.u16(0);
    segs.forEach(([c]) => sub.u16(c));
    segs.forEach(([c, g]) => sub.u16(c === 0xffff ? 1 : (g - c) & 0xffff));
    segs.forEach(() => sub.u16(0));
    return writer().u16(0).u16(1).u16(3).u16(1).u32(12).bytes(sub.done()).done();
  }
  // name table (format 0), Windows Unicode English.
  function name(records) {
    const ids = Object.keys(records).map(Number).sort((a, b) => a - b);
    const strs = ids.map(id => { const w = writer(); for (const ch of String(records[id])) w.u16(ch.charCodeAt(0)); return w.done(); });
    const w = writer().u16(0).u16(ids.length).u16(6 + 12 * ids.length);
    let off = 0;
    ids.forEach((id, i) => { w.u16(3).u16(1).u16(0x409).u16(id).u16(strs[i].length).u16(off); off += strs[i].length; });
    strs.forEach(s => w.bytes(s));
    return w.done();
  }
  function nameString(t, id) { // a Windows English string from the source font's name table
    const v = view(t), n = v.getUint16(2), store = v.getUint16(4);
    for (let i = 0; i < n; i++) {
      const p = 6 + 12 * i;
      if (v.getUint16(p) === 3 && v.getUint16(p + 6) === id) {
        const len = v.getUint16(p + 8), off = store + v.getUint16(p + 10);
        let s = ''; for (let k = 0; k < len; k += 2) s += String.fromCharCode(v.getUint16(off + k));
        return s;
      }
    }
    return null;
  }

  function assemble(tables) {
    const tags = Object.keys(tables).sort(), n = tags.length;
    let p = 1, e = 0; while (p * 2 <= n) { p *= 2; e++; }
    const dir = writer().u32(0x00010000).u16(n).u16(16 * p).u16(e).u16(16 * n - 16 * p);
    let off = 12 + 16 * n;
    const at = {};
    for (const t of tags) {
      const b = tables[t];
      dir.bytes([...t].map(c => c.charCodeAt(0))).u32(sum(b)).u32(off).u32(b.length);
      at[t] = off;
      off += b.length + ((4 - (b.length % 4)) % 4);
    }
    const out = new Uint8Array(off);
    out.set(dir.done(), 0);
    for (const t of tags) out.set(tables[t], at[t]);
    const v = view(out);
    v.setUint32(at.head + 8, 0);
    v.setUint32(at.head + 8, (0xB1B0AFBA - sum(out)) >>> 0);
    return out;
  }

  /**
   * bytes: a TrueType font file. text: every character the picture draws.
   * Returns the cut-down font's bytes (Uint8Array).
   */
  function subset(bytes, text, bold) {
    const f = parse(bytes), t = f.t;
    const map = [], want = [0];
    for (const ch of new Set(Array.from(String(text)))) {
      const cp = ch.codePointAt(0);
      if (cp > 0xfffe || cp < 32) continue;
      const g = f.cmap.get(cp);
      if (g == null || g >= f.numGlyphs) continue;
      map.push([cp, g]);
      want.push(g);
    }
    // Closure over composite glyphs, then the new numbering in source order.
    const seen = new Set(), stack = want.slice();
    while (stack.length) {
      const g = stack.pop();
      if (seen.has(g)) continue;
      seen.add(g);
      for (const [, c] of components(glyph(f, g))) if (c < f.numGlyphs) stack.push(c);
    }
    const order = [...seen].sort((a, b) => a - b), id = new Map(order.map((g, i) => [g, i]));
    const glyf = writer(), loca = writer(), hmtx = writer(), hv = view(t.hmtx);
    for (const g of order) {
      loca.u32(glyf.length);
      const d = unhinted(glyph(f, g).slice());
      for (const [p, c] of components(d)) view(d).setUint16(p, id.get(c));
      glyf.bytes(d);
      while (glyf.length % 4) glyf.bytes([0]);
      const m = Math.min(g, f.hm - 1);
      hmtx.u16(hv.getUint16(4 * m)).u16(g < f.hm ? hv.getUint16(4 * g + 2) : hv.getUint16(4 * f.hm + 2 * (g - f.hm)));
    }
    loca.u32(glyf.length);
    const head = t.head.slice(); view(head).setInt16(50, 1);
    const hhea = t.hhea.slice(); view(hhea).setUint16(34, order.length);
    const maxp = t.maxp.slice(); view(maxp).setUint16(4, order.length);
    const post = t.post.slice(0, 32); post.set([0, 3, 0, 0], 0);
    const style = bold ? 'Bold' : 'Regular';
    // The source font's own name is kept unless its licence reserves it.
    const own = nameString(t.name, 1) || FAMILY;
    const family = RESERVED.includes(own) ? FAMILY : own, ps = family.replace(/[^A-Za-z0-9]/g, '');
    // A name of its own for each cut-down font: browsers keep fonts by their
    // unique and PostScript names, and two different subsets sharing one
    // would draw each other's glyphs.
    let h = 2166136261;
    for (const [c] of map.sort((a, b) => a[0] - b[0])) { h ^= c; h = Math.imul(h, 16777619) >>> 0; }
    const tag = h.toString(36).toUpperCase();
    const out = {
      head, hhea, maxp, post, glyf: glyf.done(), loca: loca.done(), hmtx: hmtx.done(),
      cmap: cmap(map.map(([c, g]) => [c, id.get(g)]).sort((a, b) => a[0] - b[0])),
      name: name({
        0: nameString(t.name, 0) || '', 1: family, 2: style, 3: `${family} ${style} ${tag}`, 4: `${family} ${style}`,
        5: nameString(t.name, 5) || 'Version 1.0', 6: `${ps}${tag}-${style}`,
        13: nameString(t.name, 13) || 'SIL Open Font License 1.1', 14: nameString(t.name, 14) || 'https://openfontlicense.org',
      }),
    };
    for (const k of KEEP) if (t[k]) out[k] = t[k].slice();
    return assemble(out);
  }

  return { subset, FAMILY };
});
