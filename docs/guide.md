# Using Board Generator

For someone using the tool for the first time. The [front page](../README.md) says what it does; [the board file](file-format.md) says how to write the file it reads.

## 1 · The demo page

Open <https://chalouhi.github.io/board-generator/>, or `index.html` from a copy of this repository. Nothing to sign in to.

- **Give a file** by dropping it anywhere on the page, by choosing it, or by pasting its text (the board is drawn a moment after the text changes, or with **Draw**). JSON or XML. The board appears without the page reloading.
- **Try a sample**: five buttons load the five files in `samples/`.
- **Open a card** with a click, a tap, or Enter when it has the focus (Tab moves from card to card). It opens over the board with its kind and id, title, text, column, group, due date and note, and its buttons. Escape, the close button or a click outside closes it.
- **A card in full**: with the sample `2-comprehensive.json`, card 43 opens in full, from the card file `samples/cards/2-comprehensive.card-43.json` kept with the page: its facts, a checklist, notes and a closed history. Every other card opens with what the board file holds.
- **Buttons** come only from the file and show only on an opened card. On this page a button opens its link (with the card's id in it) in a new tab; a button with no link is not shown, since this page does not listen for actions. A button with a question asks it first; "Cancel" does nothing.
- **Download picture** and **Download PDF** give the files of section 4 for the board on screen. They are switched off while no board is on screen.
- **A wrong file** draws nothing. The page lists every problem at once, under "No board drawn. n problems in this file", and switches the downloads off.
- **Width**: at 768 points and wider the board has columns side by side; narrower, it is one list. Changing the window's width redraws it, without asking for the file again.
- **Privacy**: the file never leaves the browser. The page's security policy forbids it to send anything anywhere once loaded, and it loads nothing from other sites.

## 2 · The command

```bash
node bin/board.js <file> [--svg <picture.svg>] [--pdf <document.pdf>] [--width <points>] [--today <YYYY-MM-DD>]
```

Node 18 or later. No install step, no network. Linked as `board` when the package is installed.

| Option | Meaning |
|---|---|
| `<file>` | A board file, JSON or XML. |
| `--svg <path>` | Write the picture there. |
| `--pdf <path>` | Write the PDF there. |
| `--width <n>` | Width of the picture in points, a whole number from 320. Default 1280. |
| `--today <date>` | The day due dates are judged by, when the file gives no `today`. Default: the day the command runs. |

At least one of `--svg` and `--pdf` is needed. Both files are made first and written only when both succeeded.

| Exit code | Meaning |
|---|---|
| `0` | Done. The files written are named on standard error. |
| `1` | The file has problems. Nothing is written; the problems are printed on standard output, one per line, and a heading with their count on standard error. |
| `2` | Used wrongly (no file, no output named, a bad option, a file that cannot be read or written). Nothing is written. |

**Fonts.** The PDF uses Calibri when the machine has it (`calibri.ttf` and `calibrib.ttf` in the usual font folders), and otherwise Carlito, which has the same letter widths and ships in `fonts/`. The picture always uses Carlito. Either way only the letters used are embedded. Set `BOARD_SHIPPED_FONTS=1` to use Carlito for the PDF too.

## 3 · The script for other pages

Include the one file `src/board.js` (it needs nothing else) and call:

```js
const result = BoardGenerator.draw(place, fileText, {
  onAction: (action, id, text) => { /* a button with an action was pressed on card `id` */ },
  getCard: id => cardFileText,   // optional (1.1): the opened card in full; text, or a promise of text
  refresh: () => boardFileText,  // optional (1.1): a new board file; text, or a promise of text
  today: '2026-03-10', // optional: the day due dates are judged by, when the file gives none
});
// result: { ok: true, board } or { ok: false, errors: ['…', …] }
```

- `place` is any element. The board is drawn inside a shadow root on it, at the element's width, and redrawn when that width changes: wide at 768 points and up, one list below. Nothing outside `place` is touched, and the script adds nothing to the page around it. It works under a strict security policy (no inline styles or scripts needed).
- `fileText` is the file's content as text. With a wrong file, `place` shows the list of problems and `errors` holds them.
- **Being told about buttons.** With `onAction`, every button of a card is drawn. Pressing one with an `action` calls `onAction(action, id)` and opens no link; a button with only a `link` still opens it. Without `onAction`, buttons with a link open it and the others are not drawn.
- **New content.** Call `draw` again with the same `place` and new text: the board is redrawn in place, without reloading.

Release 1.1 adds three things a page can give the tool, all optional. A page that gives none of them behaves exactly as in 1.0.

- **A way to get a card file: `getCard(id)`.** Called each time a card is opened, with its id. Return the [card file](file-format.md#the-card-file)'s text, or a promise of it; return `null` (or resolve to `null`) when that card has none, and it opens as in 1.0. The card opens at once with what the board file holds and the line "Loading…", and is filled in when the file arrives, without closing. If nothing arrives within 10 seconds, or the call throws or its promise is rejected, the card shows "The detail could not be loaded" and a "Try again" button that calls `getCard` once more; its buttons from the board file stay usable. A wrong card file shows "The detail could not be shown" and its problems; the board does not change.
- **A way to refresh: `refresh()`.** Return a new board file's text, or a promise of it. The board's header gets a "Refresh" button at the right; pressing it calls `refresh` once, the button reads "Refreshing…" and is switched off while waiting, and the board is then redrawn in place. When it fails (an error, a rejected promise or a wrong board file) the board on screen stays and "The board could not be refreshed" shows beside the button until the next success. Without `refresh` there is no button.
- **The listener for buttons, `onAction`** (already in 1.0) now also receives, as a third argument, the text typed for a button that [asks for text](file-format.md#a-button-that-asks-for-text). On a page that gives `getCard` or `refresh`, the card stays open until the listener has finished (it may return a promise); then the tool calls `refresh` once and redraws, and the card closes, unless the listener returns (or resolves to) `"keep open"`: then the card stays open and its card file is asked for again.

`BoardGenerator.readCard(cardFileText, id)` checks a card file without drawing it and returns `{ ok: true, card }` or `{ ok: false, errors }`.
- `BoardGenerator.clear(place)` empties the place. `BoardGenerator.read(fileText)` checks a file without drawing it and returns the same result.

The picture and the PDF can also be made in a page: include `vendor/fontkit.umd.min.js`, `src/fontsubset.js` and `src/picture.js` for `BoardPicture.svg(board, {fontkit, regular, bold, width})`, and `vendor/pdf-lib.min.js` and `src/pdf.js` for `BoardPDF.build(board, {PDFLib, fontkit, regular, bold})`. Both return a promise; `regular` and `bold` are the bytes of the two font files. `demo/app.js` shows both.

## 4 · What you get

- **The page board.** Above the board: a dot in the accent colour, the title, and the summary as small tinted labels. The top strip, when it has cards, across the full width. Then the columns, each on its tint with its count. Each card is a white box with up to three lines. On a narrow place: the same in one list, the summary as one line, each column as a heading with its cards as rows.
- **The picture (SVG).** One file that shows correctly by itself in a browser: white background, its own colours, and its own font inside it (a cut-down Carlito named "Board Sans", holding only the letters used). It is the wide board at 1,280 points unless another width is asked for. Every card in the file is drawn (`show` is ignored); cards counted by a column's `total` but not in the file stay as "n more". A card's title links to its address, and "n more" to the column's `more_link`.
- **The PDF.** A4 portrait, white. The title, the summary and a rule in the accent colour, then one table with the columns Card, Title, Group, and Due and note. Each column of the board is a light grey heading row with its name and count ("Doing · 3 / 2"; "Done · 48 · 3 listed" when the file carries fewer cards than the count); the strip comes first. One row per card, every card in the file. Text can be selected, titles link to the cards' addresses, no row is cut across two pages, and each page ends with the date and "Page n of m".

## 5 · How it behaves

- **Counts.** A column counts its `total` when given, otherwise the cards the file has for it. Cards in the strip are not drawn or counted in their column. With a `limit` the count reads "3 / 4", red and bold when it is passed.
- **Folding.** With `show`, a column (or the strip) draws that many cards, then "n more"; "n more" opens `more_link` when the column has one.
- **Due dates** read "due 14 Mar": amber and bold from 0 to 7 days after `today`, red and bold before it, plain otherwise. `today` is the file's, else the day given to the tool, else the day it runs.
- **The summary** on "auto" counts, from the cards in the file, "n overdue", "n due within 7 days" and "n in <strip>", leaving out zeros. A file can give its own list instead, or "off".
- **Card faces.** The kind and id in capitals ("FEATURE · #44"), the title in bold cut at two lines with "…", then the group, the due date and the note joined by " · ". A line with nothing in it is left out. With `card_lines` 2 the first line moves, not in capitals, to the front of the last.
- **Columns wrap** when they would be narrower than 210 points, into rows of even length: eight columns at 1,280 points make two rows of four. The board is never wider than its place, from 320 points up.
- **A phone.** At 375 points nothing scrolls sideways, and every card row and button is at least 44 points tall.
- **Safety.** Text from a file is always shown as text; nothing in it can run as a script or change the page around the board. Only links that start with `https://` or `http://` are accepted.
- **Refused files.** A file over 5 MB, with more than 5,000 cards or more than 12 columns is refused with one message saying which limit was passed. Any other mistake is listed with all the others, each saying where it is. A text colour that cannot be read on its background (contrast below 4.5 to 1) is a mistake.

## 6 · Checking a copy of the tool

```bash
node --test tests/*.test.js
```

The tests read every sample and compare the picture at 1,280 points, the narrow form and the PDF's text with the files in `expected/`, and the broken sample's messages with `expected/5-broken.problems.txt`. For the card files they compare the opened card, wide and narrow, with `expected/cards/`, and the broken card file's messages with `expected/cards/broken.card.problems.txt`. They need no network; to prove it, run them in a container with none:

```bash
docker run --rm --network none -v "$PWD":/repo:ro -w /repo node:22 node --test tests/
```

The browser tests (`tests/browser/page.test.js`: the demo page, the script in another page, a phone width, 500 cards; `tests/browser/card.test.js`: cards in full, buttons that ask for text, Refresh) need Playwright and run in its official container, also with no network: `tests/browser/run-offline.sh <folder holding node_modules/playwright>`.

After an approved change to the look, `node tools/freeze-expected.js` rewrites the expected outputs; after changing a sample or a font, `node tools/build-demo-data.js` rewrites the demo page's data. The tests say when either is out of date.
