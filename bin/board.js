#!/usr/bin/env node
/*
 * Board Generator — the command (requirements 31–33). MIT licence.
 *
 *   board <file> [--svg <picture.svg>] [--pdf <document.pdf>] [--width <points>] [--today <YYYY-MM-DD>]
 *
 * Reads a board file (JSON or XML) and writes the picture, the PDF, or both.
 * A wrong file: nothing is written, the problems are printed, exit code 1.
 * Needs no network.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const B = require('../src/board.js');

const ROOT = path.join(__dirname, '..');
const USAGE = `Usage: board <file> [--svg <picture.svg>] [--pdf <document.pdf>] [--width <points>] [--today <YYYY-MM-DD>]

  <file>          a board file, JSON or XML (see docs/file-format.md)
  --svg <path>    write the picture (SVG) there
  --pdf <path>    write the PDF (A4) there
  --width <n>     width of the picture in points, 320 or more (default 1280)
  --today <date>  the day to judge due dates by, when the file gives no
                  "today" (default: the day the command runs)

At least one of --svg and --pdf is needed. Exit code 0 on success, 1 when the
file has problems (nothing is written), 2 when the command is used wrongly.`;

function args(argv) {
  const o = { width: 1280 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.help = true;
    else if (['--svg', '--pdf', '--width', '--today'].includes(a)) {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      o[a.slice(2)] = argv[++i];
    } else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else if (o.file) throw new Error('only one file can be given');
    else o.file = a;
  }
  if (o.help) return o;
  if (!o.file) throw new Error('no file given');
  if (!o.svg && !o.pdf) throw new Error('say where to write: --svg <path>, --pdf <path>, or both');
  if (o.svg && o.pdf && path.resolve(o.svg) === path.resolve(o.pdf)) throw new Error('--svg and --pdf must name two different files');
  if (!/^\d+$/.test(String(o.width)) || Number(o.width) < 320) throw new Error('--width must be a whole number, 320 or more');
  o.width = Number(o.width);
  if (o.today != null && !B.read(JSON.stringify({ board: 1, title: 't', columns: [{ name: 'c' }], cards: [], today: o.today })).ok) throw new Error('--today must be a date written YYYY-MM-DD');
  return o;
}

// Calibri when the machine has it, else Carlito (same widths), shipped in fonts/.
function fonts() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const dirs = [
    'C:\\Windows\\Fonts', path.join(home, 'AppData', 'Local', 'Microsoft', 'Windows', 'Fonts'), '/Library/Fonts', path.join(home, 'Library/Fonts'),
    '/usr/share/fonts', '/usr/local/share/fonts', path.join(home, '.fonts'), path.join(home, '.local/share/fonts'),
    '/Applications/Microsoft Word.app/Contents/Resources/DFonts',
  ];
  const find = names => {
    for (const d of dirs) {
      const stack = [d]; let seen = 0;
      while (stack.length && seen < 4000) {
        const cur = stack.pop(); seen++;
        let list; try { list = fs.readdirSync(cur, { withFileTypes: true }); } catch (e) { continue; }
        for (const e of list) {
          if (e.isDirectory()) stack.push(path.join(cur, e.name));
          else if (names.includes(e.name.toLowerCase())) return path.join(cur, e.name);
        }
      }
    }
    return null;
  };
  if (!process.env.BOARD_SHIPPED_FONTS) {
    const r = find(['calibri.ttf']), b = find(['calibrib.ttf']);
    if (r && b) return { regular: fs.readFileSync(r), bold: fs.readFileSync(b), name: 'Calibri' };
  }
  return {
    regular: fs.readFileSync(path.join(ROOT, 'fonts', 'Carlito-Regular.ttf')),
    bold: fs.readFileSync(path.join(ROOT, 'fonts', 'Carlito-Bold.ttf')),
    name: 'Carlito',
  };
}

async function main(argv) {
  let o;
  try { o = args(argv); } catch (e) { process.stderr.write(`board: ${e.message}\n\n${USAGE}\n`); return 2; }
  if (o.help) { process.stdout.write(USAGE + '\n'); return 0; }
  let text;
  try {
    const st = fs.statSync(o.file);
    if (st.size > B.MAX_BYTES) text = null; else text = fs.readFileSync(o.file, 'utf8');
    if (text === null) {
      process.stderr.write('No board drawn. 1 problem in this file:\n');
      process.stdout.write(`The file is ${(st.size / 1024 / 1024).toFixed(1)} MB; the limit is 5 MB.\n`);
      return 1;
    }
  } catch (e) { process.stderr.write(`board: cannot read ${o.file}: ${e.code || e.message}\n`); return 2; }
  const r = B.read(text, { today: o.today });
  if (!r.ok) {
    process.stderr.write(`No board drawn. ${r.errors.length} ${r.errors.length === 1 ? 'problem' : 'problems'} in this file:\n`);
    process.stdout.write(r.errors.join('\n') + '\n');
    return 1;
  }
  // Everything is made first; files are written only when all of it succeeded.
  const fontkit = require('../vendor/fontkit.umd.min.js');
  const f = fonts();
  const out = [];
  if (o.svg) {
    // The picture always carries Carlito (it is cut down and embedded).
    const shipped = { regular: fs.readFileSync(path.join(ROOT, 'fonts', 'Carlito-Regular.ttf')), bold: fs.readFileSync(path.join(ROOT, 'fonts', 'Carlito-Bold.ttf')) };
    const svg = await require('../src/picture.js').svg(r.board, { fontkit, regular: shipped.regular, bold: shipped.bold, width: o.width });
    out.push([o.svg, Buffer.from(svg, 'utf8')]);
  }
  if (o.pdf) {
    const PDFLib = require('../vendor/pdf-lib.min.js');
    const bytes = await require('../src/pdf.js').build(r.board, { PDFLib, fontkit, regular: f.regular, bold: f.bold });
    out.push([o.pdf, Buffer.from(bytes)]);
  }
  const written = [];
  try {
    for (const [p, data] of out) {
      const tmp = p + '.tmp-' + process.pid;
      fs.writeFileSync(tmp, data);
      written.push(tmp);
    }
    out.forEach(([p], i) => fs.renameSync(written[i], p));
  } catch (e) {
    for (const t of written) { try { fs.unlinkSync(t); } catch (x) { /* already gone */ } }
    process.stderr.write(`board: cannot write: ${e.code || e.message}\n`);
    return 2;
  }
  for (const [p] of out) process.stderr.write(`wrote ${p}\n`);
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, e => { process.stderr.write(`board: ${e.stack || e}\n`); process.exitCode = 3; });
}
module.exports = { main, fonts };
