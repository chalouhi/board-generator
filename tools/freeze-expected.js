#!/usr/bin/env node
// Writes the expected outputs in expected/ from the samples (requirement 39):
// for each good sample the wide picture at 1,280 points (.picture.svg), the
// narrow form at 390 points (.narrow.html) and the PDF's text (.pdf.txt).
// Files with no "today" are drawn on 2026-03-10. The broken sample's ten
// messages (5-broken.problems.txt) are written by hand and never by this.
// Release 1.1 adds, in expected/cards/, the opened card filled from each good
// card file, as on a page that listens for buttons: wide (.wide.html, the
// form at 1,000 points) and narrow (.narrow.html, at 390). The broken card
// file's eight messages are written by hand.
// Run only when a change to the look has been approved:
//   node tools/freeze-expected.js
// The tests check that what the tool makes still equals these files.
'use strict';
const fs = require('fs');
const path = require('path');
const { B, ROOT, GOOD, sample, boardOf, FONTS, cardSample } = require('../tests/helpers.js');
const P = require('../src/picture.js');
const PDF = require('../src/pdf.js');
const { readPDF } = require('../tests/pdf-read.js');

async function outputs(name) {
  const board = boardOf(sample(name + '.json'));
  const svg = await P.svg(board, Object.assign({ width: 1280 }, FONTS));
  const narrow = B.narrowHTML(board) + '\n';
  const bytes = await PDF.build(board, Object.assign({ PDFLib: require('../vendor/pdf-lib.min.js') }, FONTS));
  const text = (await readPDF(bytes)).pages.map((p, i) => `--- page ${i + 1}\n${p.text}`).join('\n') + '\n';
  return { svg, narrow, text };
}

// The good card files: [card file, its board sample, the card's id].
const CARD_FILES = [['2-comprehensive.card-43', '2-comprehensive', '43']];
function cardOutputs(name) {
  const [, boardName, id] = CARD_FILES.find(c => c[0] === name);
  const board = boardOf(sample(boardName + '.json'));
  const card = board.cards.find(c => c.id === id);
  const r = B.readCard(cardSample(name + '.json'), id, { today: board.today });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  const st = { status: 'filled', detail: r.card, errors: null, asking: null, open: new Set(), busy: false };
  return { wide: B.cardHTML(board, card, true, false, st) + '\n', narrow: B.cardHTML(board, card, true, true, st) + '\n' };
}

if (require.main === module) {
  (async () => {
    for (const name of GOOD) {
      const o = await outputs(name);
      fs.writeFileSync(path.join(ROOT, 'expected', name + '.picture.svg'), o.svg);
      fs.writeFileSync(path.join(ROOT, 'expected', name + '.narrow.html'), o.narrow);
      fs.writeFileSync(path.join(ROOT, 'expected', name + '.pdf.txt'), o.text);
      console.log('wrote expected/' + name + '.{picture.svg,narrow.html,pdf.txt}');
    }
    for (const [name] of CARD_FILES) {
      const o = cardOutputs(name);
      fs.writeFileSync(path.join(ROOT, 'expected', 'cards', name + '.wide.html'), o.wide);
      fs.writeFileSync(path.join(ROOT, 'expected', 'cards', name + '.narrow.html'), o.narrow);
      console.log('wrote expected/cards/' + name + '.{wide,narrow}.html');
    }
  })();
}
module.exports = { outputs, cardOutputs, CARD_FILES };
