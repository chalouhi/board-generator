'use strict';
const fs = require('fs');
const path = require('path');
const B = require('../src/board.js');

const ROOT = path.join(__dirname, '..');
// The day the expected outputs are drawn on, for files that give no "today".
const TODAY = '2026-03-10';
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const sample = name => read('samples', name);
const boardOf = (text, today = TODAY) => { const r = B.read(text, { today }); if (!r.ok) throw new Error(r.errors.join('\n')); return r.board; };
const FONTS = {
  fontkit: require('../vendor/fontkit.umd.min.js'),
  regular: fs.readFileSync(path.join(ROOT, 'fonts', 'Carlito-Regular.ttf')),
  bold: fs.readFileSync(path.join(ROOT, 'fonts', 'Carlito-Bold.ttf')),
};
const GOOD = ['1-smallest', '2-comprehensive', '3-many-columns', '4-custom-colours'];

// The same content written as XML (file-format guide, section 7).
function toXML(file) {
  const q = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const val = v => (v === true ? 'yes' : v === false ? 'no' : Array.isArray(v) ? v.join(',') : v);
  const attrs = (o, keys) => keys.filter(k => o[k] !== undefined).map(k => ` ${k.replace(/_/g, '-')}="${q(val(o[k]))}"`).join('');
  const BUTTON = ['name', 'link', 'action', 'kinds', 'columns', 'strip_only', 'main', 'confirm'];
  let s = `<?xml version="1.0" encoding="UTF-8"?>\n<board version="${file.board}"${attrs(file, ['title', 'today', 'link_pattern'])}${file.summary !== undefined ? ` summary="${q(val(file.summary))}"` : ''}>\n`;
  for (const c of file.columns) s += `  <column${attrs(c, ['name', 'limit', 'show', 'total', 'more_link'])}/>\n`;
  if (file.strip) s += `  <strip${attrs(file.strip, ['name', 'show'])}/>\n`;
  if (file.style) {
    s += `  <style${attrs(file.style, ['card_lines'])}>\n`;
    for (const [k, v] of Object.entries(file.style.colours || {})) s += `    <colour name="${q(k)}" value="${q(v)}"/>\n`;
    s += '  </style>\n';
  }
  for (const c of file.cards) {
    const open = `  <card${attrs(c, ['id', 'title', 'column', 'kind', 'group', 'due', 'note', 'in_strip', 'link'])}`;
    if (!c.text && !c.buttons) { s += open + '/>\n'; continue; }
    s += open + '>' + (c.text ? q(c.text) : '') + '\n';
    for (const b of c.buttons || []) s += `    <button${attrs(b, BUTTON)}/>\n`;
    s += '  </card>\n';
  }
  for (const b of file.buttons || []) s += `  <button${attrs(b, BUTTON)}/>\n`;
  return s + '</board>\n';
}

module.exports = { B, ROOT, TODAY, GOOD, read, sample, boardOf, FONTS, toXML };
