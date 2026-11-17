// The test page of release 1.1 (scenarios 1-3): draws the comprehensive
// sample into a place 1,000 points wide, listens for buttons, supplies card
// files and new board files, and writes down everything it is asked.
// The tests call start(mode, cardTexts) once the page has loaded.
(function () {
  'use strict';
  const place = document.getElementById('place');
  const sample = name => window.BOARD_SAMPLES.find(s => s.file === name).text;
  const wait = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));
  // The page's own font, from the data loaded with the page (as the demo does).
  const bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
  try {
    document.fonts.add(new FontFace('Carlito', bytes(window.BOARD_FONTS.regular), { weight: '400' }));
    document.fonts.add(new FontFace('Carlito', bytes(window.BOARD_FONTS.bold), { weight: '700' }));
  } catch (e) { /* the board falls back to the next font */ }
  window.LOG = [];
  window.ANSWER = undefined; // what the listener answers, e.g. "keep open"
  window.start = (mode, texts) => {
    const base = JSON.parse(sample('2-comprehensive.json'));
    let tries44 = 0, refreshes = 0;
    const options = {
      onAction: (action, id, text) => {
        window.LOG.push(text === undefined ? ['action', action, id] : ['action', action, id, text]);
        return window.ANSWER;
      },
      getCard: id => {
        window.LOG.push(['card', id]);
        if (id === '43') return wait(500, texts.card43);
        if (id === '44' && mode === 3) {
          tries44++;
          return tries44 === 1 ? Promise.reject(new Error('not now')) : wait(100, JSON.stringify({ card: 1, id: '44', title: 'New checkout page with one-step payment', text: 'One page for address, delivery and payment. Guest checkout stays.' }));
        }
        if (id === '45' && mode === 3) return texts.broken;
        if (id === '46') return new Promise(() => {}); // never arrives
        return null; // no card file: the card opens as in 1.0
      },
      refresh: () => {
        window.LOG.push(['refresh']);
        refreshes++;
        if (mode === 'fail-once' && refreshes === 1) return wait(200).then(() => { throw new Error('down'); });
        const f = JSON.parse(JSON.stringify(base));
        if (mode === 2) f.cards.find(c => c.id === '43').column = 'Ready';
        if (mode === 3) f.cards.push({ id: '54', title: 'Gift cards in the shop', column: 'Ideas', kind: 'Feature', group: 'Website' });
        return wait(300, JSON.stringify(f));
      },
    };
    window.RESULT = BoardGenerator.draw(place, sample('2-comprehensive.json'), options);
  };
})();
