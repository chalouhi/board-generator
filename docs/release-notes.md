# Release notes

## 1.1 · 2026-11

The opened card in full, a button that asks for text, and a Refresh button. Closes backlog items #1, #2 and #3.

- **#1 · An opened card shows its full detail from a card file.** A page can hand the tool a second file for the one card that was opened: a description, facts, and sections (text, lists, checklists, dated lines such as notes and history), and the card's own buttons. The card opens at once and is filled in when the file arrives. See [the card file](file-format.md#the-card-file).
- **#2 · A button can ask for a line of text.** `ask` on a button, in either file, shows a question and a box before the button acts; the page receives the text with the action. See [A button that asks for text](file-format.md#a-button-that-asks-for-text).
- **#3 · Refresh.** A page that can supply a new board file gets a Refresh button in the board's header, and the board is refreshed after every button press. See the [user guide](guide.md#3--the-script-for-other-pages).
- The demo page opens card 43 of the sample `2-comprehensive.json` in full. It still sends nothing anywhere, and has no Refresh button.
- Nothing changed in the picture, the PDF or the command. Every test of 1.0 passes, with its expected outputs unchanged.

## 1.0 · 2026-11

The first release: one board file in, a web page, a picture (SVG) and a PDF (A4) out; a command; a script for other pages; the demo page.
