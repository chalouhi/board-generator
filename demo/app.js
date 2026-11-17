// The demo page. Everything happens here, in the browser: the file is read,
// drawn and turned into downloads without any request leaving the page.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const out = $('out'), status = $('status'), dlSvg = $('dl-svg'), dlPdf = $('dl-pdf');
  let current = null; // the board on screen, or null

  // The page's font, from the data loaded with the page (no request).
  const bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const FONTS = { regular: bytes(window.BOARD_FONTS.regular), bold: bytes(window.BOARD_FONTS.bold) };
  try {
    document.fonts.add(new FontFace('Carlito', FONTS.regular.buffer.slice(0), { weight: '400' }));
    document.fonts.add(new FontFace('Carlito', FONTS.bold.buffer.slice(0), { weight: '700' }));
  } catch (e) { /* the board falls back to the next font */ }

  function show(text, from) {
    const t0 = performance.now();
    // A sample shown here may come with card files kept with the page: its
    // cards open in full. Every other card opens with what the file holds.
    const sample = (window.BOARD_SAMPLES || []).find(x => x.text.trim() === String(text).trim());
    const cards = sample ? (window.BOARD_CARDS || []).filter(c => c.board === sample.file) : [];
    const options = {};
    if (cards.length) options.getCard = id => { const c = cards.find(x => x.id === id); return c ? c.text : null; };
    const r = BoardGenerator.draw(out, text, options);
    current = r.ok ? r.board : null;
    dlSvg.disabled = dlPdf.disabled = !r.ok;
    status.textContent = r.ok ? `Drawn from ${from} in ${Math.round(performance.now() - t0)} ms.` : '';
    out.setAttribute('data-state', r.ok ? 'drawn' : 'problems');
  }

  // Drop anywhere on the page, or choose a file.
  const drop = $('drop');
  const readFile = f => f.text().then(t => show(t, f.name));
  document.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  document.addEventListener('dragleave', e => { if (!e.relatedTarget) drop.classList.remove('over'); });
  document.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('over');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) readFile(f);
  });
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
  $('file').addEventListener('change', e => { const f = e.target.files[0]; if (f) readFile(f); e.target.value = ''; });

  // Paste: draws shortly after the text changes, or with the button.
  const paste = $('paste');
  let timer = null;
  paste.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { if (paste.value.trim()) show(paste.value, 'the pasted text'); }, 250); });
  $('drawpaste').addEventListener('click', () => show(paste.value, 'the pasted text'));

  // The five samples, loaded with the page.
  const box = $('samples');
  (window.BOARD_SAMPLES || []).forEach(s => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn sample'; b.textContent = s.label; b.title = s.why;
    b.setAttribute('data-sample', s.file);
    b.addEventListener('click', () => { paste.value = s.text; show(s.text, s.file); });
    box.appendChild(b);
  });

  // Downloads: made here, handed to the browser as a file.
  const fileName = ext => (current.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'board') + '.' + ext;
  function save(data, type, name) {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function make(button, what, run) {
    if (!current) return;
    const board = current;
    button.disabled = true; status.textContent = `Making the ${what}…`;
    run(board)
      .then(() => { status.textContent = `The ${what} is ready.`; })
      .catch(e => { status.textContent = `The ${what} could not be made: ${e.message}`; })
      .then(() => { button.disabled = current !== board || !current; });
  }
  dlSvg.addEventListener('click', () => make(dlSvg, 'picture', board =>
    BoardPicture.svg(board, { fontkit: window.fontkit, regular: FONTS.regular, bold: FONTS.bold, width: 1280 })
      .then(svg => save(svg, 'image/svg+xml', fileName('svg')))));
  dlPdf.addEventListener('click', () => make(dlPdf, 'PDF', board =>
    BoardPDF.build(board, { PDFLib: window.PDFLib, fontkit: window.fontkit, regular: FONTS.regular, bold: FONTS.bold })
      .then(pdf => save(pdf, 'application/pdf', fileName('pdf')))));
})();
