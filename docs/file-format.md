# The board file

Version 1.

This page is for anyone who wants a board drawn: a person, a board, a script or an agent. Produce one file as described here, hand it to the Board Generator, and get the board back. It is also the contract the generator is tested against.

A second, optional file shows one opened card in full: see [the card file](#the-card-file) at the end of this page (release 1.1).

## 1 · What a board shows

A board is a set of cards sorted into columns.

| Word | Meaning |
|---|---|
| **Column** | One stage of the work, for example Draft or Building. Columns are drawn left to right in file order. |
| **Card** | One piece of work. It sits in one column. |
| **Kind** | What sort of card it is, for example Spec, Fix or Decision. Free text. |
| **Group** | What the card belongs to, for example a project. Free text. |
| **Top strip** | A band across the top for cards that wait for a person. A card in the strip is not drawn in its column. |
| **Limit** | The most cards a column should hold. The count turns red when it is passed. |
| **Summary line** | The short line of counts under the title. |
| **Button** | Something a person can do with a card. Buttons show only after a card is opened, and only on the web page. |

## 2 · The file

One JSON file, UTF-8. The same content written as XML is also accepted (section 7).

### Top level

| Field | Required | Meaning |
|---|---|---|
| `board` | yes | The format version. Always `1`. |
| `title` | yes | The name of the board. |
| `columns` | yes | The columns, in order. At least one, at most 12. |
| `cards` | yes | The cards. May be empty. At most 5,000. |
| `strip` | no | The top strip (below). Left out: no strip. |
| `summary` | no | `"auto"` (default), `"off"`, or a list of up to 6 short texts to show instead. |
| `today` | no | A date, `YYYY-MM-DD`, used to judge due dates. Left out: the day the board is drawn. |
| `link_pattern` | no | One web address used for every card, with `{id}` where the card's id goes. Must start with `https://` or `http://` and contain `{id}`. |
| `buttons` | no | The buttons (section 5). |
| `style` | no | Colours and lines per card (section 4). |

### A column

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | The column name. Must be different for every column. |
| `limit` | no | A whole number, 1 or more. The count then reads "3 / 4", and turns red when the column holds more than its limit. |
| `show` | no | How many cards are drawn before the rest fold into "N more". Left out: all of them. |
| `total` | no | How many cards the column really holds, when the file carries only some of them. The count and "N more" use it. Never less than the cards the file has for the column. Left out: the cards in the file. |
| `more_link` | no | A web address that "N more" opens, for example the full list on the board. Left out: "N more" is plain text. |

### The top strip

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | The strip's name, for example "Needs you". |
| `show` | no | How many cards are drawn before "N more". Left out: all of them. |

### A card

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | The card's number or short code, 1 to 12 characters. Must be different for every card. |
| `title` | yes | The card's title. Up to 200 characters; a card's face shows two lines of it at most. |
| `column` | yes | The name of the column it sits in, capitals ignored. |
| `kind` | no | The kind of card. |
| `group` | no | What it belongs to. |
| `due` | no | A date, `YYYY-MM-DD`. Shown as "due 22 Nov". Amber when 7 days away or fewer, red when past, judged against `today`. |
| `note` | no | A short text for the card's last line, up to 60 characters, for example "Holding up work". |
| `in_strip` | no | `true`: the card is drawn in the top strip instead of its column. Needs a `strip` in the file. |
| `text` | no | A longer description, shown when the card is opened. Up to 2,000 characters. |
| `link` | no | A web address for this card. Overrides `link_pattern`. Must start with `https://` or `http://`. |
| `buttons` | no | Buttons for this card only (section 5), for example one per answer to a question. |

## 3 · What a card's face shows

Three lines:

1. The kind and the id: `SPEC · #45`
2. The title
3. The group, the due date and the note, joined by " · "

A line with nothing to show is left out. With `card_lines` set to 2 (section 4), line 1 moves to the front of line 3.

## 4 · Style (optional)

A file with no `style` section uses three lines per card and the built-in colours.

```json
"style": {
  "card_lines": 3,
  "colours": { "accent": "#4B5320", "column": "#F6F7EF", "strip": "#F4F6E8", "label": "#4B5320", "button": "#4B5320" }
}
```

| Colour | What it paints | Built-in |
|---|---|---|
| `accent` | The dot beside the title; the rule under the title in a PDF | `#FF5B04` |
| `column` | The tint behind each column | `#F0F6F7` |
| `strip` | The tint behind the top strip | `#FFF3EC` |
| `label` | The kind-and-id line, and "N more" | `#075056` |
| `button` | The main button | `#075056` |
| `ink` | Titles | `#16232A` |
| `muted` | The last line of a card, counts | `#5F7078` |
| `line` | Thin rules | `#D3E0E3` |
| `soon` | A due date 7 days away or fewer | `#9A5B00` |
| `late` | A due date that has passed; a count over its limit | `#C62828` |

- Colours are six-digit hex. Any that are left out keep their built-in value.
- The page behind the board is always white, and cards are always white.
- A text colour that cannot be read on its background (contrast below 4.5 to 1) is a mistake in the file.
- Sizes, spacing, fonts and layout cannot be changed by a file.

## 5 · Buttons

The generator has no buttons of its own. Every button comes from the file.

```json
"buttons": [
  { "name": "Approve", "kinds": ["Spec"], "columns": ["Draft"], "main": true,
    "link": "https://example.com/cards/{id}/approve", "action": "approve" },
  { "name": "Archive", "confirm": "Archive this card?", "action": "archive" },
  { "name": "Answer", "strip_only": true, "link": "https://example.com/cards/{id}" }
]
```

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | The word on the button. Up to 24 characters. |
| `link` | one of the two | A web address the button opens, with `{id}` where the card's id goes. |
| `action` | one of the two | A short word handed to the page that hosts the board, with the card's id. |
| `kinds` | no | The button shows only on cards of these kinds. Left out: every kind. |
| `columns` | no | The button shows only on cards in these columns. Left out: every column. |
| `strip_only` | no | `true`: the button shows only on cards in the top strip. |
| `main` | no | `true`: drawn as the filled button. When several fit a card, the first in the file is the filled one. |
| `confirm` | no | A question asked before the button does anything. |
| `ask` | no | A line of text to ask for before the button acts, for example "Why is it going back?" (release 1.1; see [A button that asks for text](#a-button-that-asks-for-text)). Needs an `action`; not together with `confirm`. |

- A card can also carry its own `buttons` list, with `name`, `link`, `action`, `main` and `confirm`. They are drawn before the file's buttons.
- **What a press does.** When the board is drawn inside another page that listens for actions, a button with an `action` hands that word and the card's id to that page. Otherwise the button opens its `link`. A button that has only an `action`, on a page that does not listen, is not drawn; neither is a button with `ask`.
- Buttons never appear on a card's face, in a PDF or in a picture.

## 6 · What the generator does with the file

- **Wide screens (768 points and up).** Columns side by side, each on its tint, cards as white rounded boxes. Columns narrower than 210 points wrap to a second row. The top strip runs across the top.
- **Narrow screens.** One list: the strip first, then each column as a heading with its cards as rows under it.
- **PDF.** A4 portrait, one table: a light grey heading row per column, one row per card (kind and id, title, group, due date and note). The strip comes first.
- **Picture.** The wide-screen look at a given width, every card in the file drawn; `show` is ignored. Cards counted by `total` but not in the file stay as "N more".
- **Opening a card.** A click or tap on a card opens it: kind, id, title, text, column, group, due date, and its buttons. In a PDF or picture the title is a link to the card's address.
- **Summary line on "auto".** "1 overdue · 3 due within 7 days · 2 in Needs you": cards past their due date, cards due within 7 days, and cards in the strip, counted from the cards in the file. A count of zero is left out.
- **Size.** A file larger than 5 MB is refused with one message.
- **Empty column.** Drawn with its name and a count of 0.
- **A wrong file draws nothing.** The generator lists every problem at once, in plain words, each saying where it is. Example: `Card 4 (id "A7"): the column "Review" is not defined. Defined: To do, Doing, Done.`

### Problems the generator reports

Missing or wrong `board` version · missing `title` · no `columns`, or more than 12 · a column with no `name`, or a name used twice · a `limit`, `show` or `total` that is not a whole number of 1 or more · a `total` smaller than the cards the file has for that column · a `more_link` that is not a web address · more than 5,000 cards · a card with no `id`, no `title` or no `column` · an `id` longer than 12 characters, or used twice · a `column` that is not defined · a `due` or `today` that is not a date · `in_strip` on a card when the file has no `strip` · a `link` or `link_pattern` that is not a web address, or a pattern with no `{id}` · a button with no `name`, or with neither `link` nor `action` · a button with `ask` and no `action`, or with both `ask` and `confirm`, or a question (`label`) missing or longer than 60 characters · a button naming a kind no card has, or a column that is not defined · `card_lines` other than 2 or 3 · a colour that is not six-digit hex, or a colour name that is not in the table · a text colour that cannot be read on its background · a text longer than its limit.

## 7 · The same file as XML

Same names, as attributes; underscores become hyphens; true and false become `yes` and `no`.

```xml
<board version="1" title="House move" link-pattern="https://example.com/cards/{id}">
  <column name="To do"/>
  <column name="Doing" limit="2"/>
  <column name="Done"/>
  <strip name="Needs you"/>
  <card id="1" title="Book the van" column="Doing" kind="Task" group="Move day" due="2026-03-14"/>
  <card id="2" title="Choose the school" column="To do" kind="Decision" in-strip="yes"/>
  <button name="Done" columns="Doing" main="yes" action="done"/>
</board>
```

Lists such as `kinds` and `columns` on a button are written with commas. A button's `ask` is an element inside it: `<button name="Send back" action="send-back"><ask label="Why is it going back?" required="yes"/></button>`. A card's `text` is the text inside its `<card>` element. A card's own buttons are `<button>` elements inside it. Colours go in one `<style card-lines="3">` element holding `<colour name="accent" value="#4B5320"/>` elements.

## 8 · Smallest valid file

```json
{
  "board": 1,
  "title": "House move",
  "columns": [ { "name": "To do" }, { "name": "Doing" }, { "name": "Done" } ],
  "cards": [
    { "id": "1", "title": "Book the van", "column": "Doing" },
    { "id": "2", "title": "Pack the kitchen", "column": "To do" },
    { "id": "3", "title": "Tell the bank", "column": "Done" }
  ]
}
```

## 9 · Producing the file from a board

| The board has | The file gets |
|---|---|
| Its name | `title` |
| Its stages, in order | `columns` |
| A cap on work in progress | the column's `limit` |
| Cards | `cards`: number → `id`, title → `title`, stage → `column`, type → `kind`, project → `group` |
| Cards waiting for a person | `in_strip`, with the question as `note` |
| The address of a card | `link_pattern`, once for the whole file |
| What a person can do with a card | `buttons` |

A board should offer the file at one fixed web address, so a board drawn from that address is always current.

## 10 · The five sample files

Kept with the generator and used as its tests. Each has the pictures it must produce. All cards in them are made up.

| File | What it proves |
|---|---|
| `1-smallest.json` | The least a file can contain. |
| `2-comprehensive.json` | A strip, kinds, groups, due dates in all three states, a limit that is passed, a column that counts 48 cards and carries 3, "45 more" with its link, links, file buttons and a card's own buttons. |
| `3-many-columns.json` | Eight columns that wrap to two rows, long titles, an empty column. |
| `4-custom-colours.json` | A second colour set (green) and two lines per card. |
| `5-broken.json` | Ten mistakes; nothing is drawn and all ten are listed. |

## The card file

Release 1.1. The board file carries every card in reduced form, enough to draw the board. The card file carries **one card in full**, and is asked for only when that card is opened. A page that gives no card file works as before: the opened card shows what the board file holds for it.

| Pull | When | Carries |
|---|---|---|
| **Board file** | The page opens, the Refresh button is pressed, or a button has just been pressed | Every card: kind, id, title, column, group, due date, note |
| **Card file** | A card is opened | That one card: its text, facts, sections and buttons |

How a page hands these files to the generator is in the [user guide](guide.md#3--the-script-for-other-pages).

### The fields

One JSON file, UTF-8, at most 1 MB. The same content as XML is also accepted ([below](#the-same-card-as-xml)).

| Field | Required | Meaning |
|---|---|---|
| `card` | yes | The format version. Always `1`. |
| `id` | yes | The card's id. Must be the id of the card that was opened. |
| `title` | yes | The card's title. Up to 200 characters. |
| `kind`, `column`, `group`, `due`, `note`, `link` | no | As in the board file. When given, they replace what the board file said for this card. |
| `text` | no | The description, up to 5,000 characters. Blank lines make paragraphs. |
| `facts` | no | Up to 12 short labelled values shown in one row after the column, group and due date, for example "Held by: Sam". Each has a `label` (up to 24 characters), a `value` (up to 60) and an optional `link`. |
| `sections` | no | Up to 20 sections, drawn in file order under the facts. |
| `buttons` | no | The card's buttons, in order, written as in the board file. When the card file gives `buttons`, they are the card's whole list: the board file's buttons are not added. |

### Sections

Every section has a `title`, a `type` and, for all types but text, a list of `items` (up to 200). `collapsed: true` draws the section closed, as one line with its title, its count and a chevron; a click, a tap or Enter opens it, and again closes it.

| Type | What it shows | An item has |
|---|---|---|
| `text` | Paragraphs. Takes `text` instead of `items`, up to 5,000 characters. | |
| `list` | Plain lines. `numbered: true` numbers them. | `text` |
| `checklist` | Lines with a tick or an empty circle. The heading shows "2 of 3 done". | `text`, `done` (true or false) |
| `timeline` | Dated lines, in file order: the date and the name in small grey ("9 Mar · Sam"), the text under them. For notes and history. | `when` (`YYYY-MM-DD`, or `YYYY-MM-DD HH:MM`, shown as "9 Mar, 14:05"), `who` (optional), `text` |

- Every heading shows its title and its count of items. A section with no items shows "None".
- An item's `text` is up to 5,000 characters. An item can carry a `link`.
- Text is always shown as text. Links are accepted only when they start with `https://` or `http://`.

### A button that asks for text

A button, in the board file or the card file, can carry `ask`:

```json
{ "name": "Send back", "action": "send-back", "ask": { "label": "Why is it going back?", "required": true } }
```

| Field | Meaning |
|---|---|
| `label` | The question shown above the box. Up to 60 characters. |
| `required` | `true`: the button cannot be confirmed while the box is empty or holds only spaces. Default `false`. |
| `long` | `true`: a box of four lines. Default: one line. |

- Pressing the button swaps the row of buttons for the question, a box holding the cursor, "Cancel" and the button itself, drawn filled. Confirming (the button, or Enter in a one-line box) hands the page the action, the card's id and the text, trimmed, at most 2,000 characters. "Cancel" or Escape brings the buttons back and hands the page nothing.
- A button with `ask` needs an `action`. On a page that does not listen for actions it is not drawn. A button cannot have both `ask` and `confirm`.

### What the opened card shows

At once, what the board file holds, with "Loading…" under the title. When the card file arrives, the card is filled in without closing or jumping to the top: kind and id; title; the text in paragraphs; one row of facts (column, group, due date, then the card file's facts); the sections; the buttons.

- If the card file does not arrive within 10 seconds, or the page reports a failure, the card shows "The detail could not be loaded" and a "Try again" button. What the board file holds stays on show, and its buttons stay usable.
- A wrong card file changes nothing on the board. The card shows "The detail could not be shown" and every problem at once.
- On a place narrower than 768 points the opened card fills the place. On a wide place a card taller than the window scrolls inside itself, with its buttons always in view.

### Problems the generator reports

Missing or wrong `card` version · missing `id` or `title` · an `id` that is not the opened card's · more than 12 facts or 20 sections · a fact with no `label` or `value` · a section with no `title`, an unknown `type`, or more than 200 items · an item with no `text` · a checklist item whose `done` is not true or false · a timeline item with no `when`, or a `when` that is not a date · a `due` that is not a date · a `link` that is not a web address · a button with `ask` and no `action`, or with both `ask` and `confirm` · a text longer than its limit · a file larger than 1 MB (reported alone). Example: `Section 2, item 1: "done" is "yes"; it must be true or false.`

### The same card as XML

The rules of the board file: the same names as attributes, `version` for `card`, `yes` and `no` for true and false. The card's `text` is the text inside `<card>`; a text section's text, and each item's text, is the text inside its element.

```xml
<card version="1" id="43" title="Opening hours on the home page" kind="Fix" due="2026-03-14">
  The home page still shows winter hours.
  <fact label="Held by" value="Sam"/>
  <section title="Requirements" type="checklist">
    <item done="yes">The home page shows today's opening and closing time.</item>
    <item done="no">The hours change at midnight without anyone editing the page.</item>
  </section>
  <section title="History" type="timeline" collapsed="yes">
    <item when="2026-03-02" who="Sam">Created</item>
  </section>
  <button name="Accept" action="accept" main="yes"/>
  <button name="Send back" action="send-back"><ask label="Why is it going back?" required="yes"/></button>
</card>
```

### Smallest valid card file

```json
{ "card": 1, "id": "43", "title": "Opening hours on the home page" }
```

### Producing the files from a board

The board's service decides which buttons a card may show and puts exactly those in the card file. The board file can then stay button-free: buttons are needed only on an opened card.

### The two sample card files

| File | What it proves |
|---|---|
| `cards/2-comprehensive.card-43.json` | Card 43 of `2-comprehensive.json` in full: text, two facts, a checklist, notes, a closed history, and four buttons, two of which ask for text. Its opened card, wide and narrow, is kept in `expected/cards/`. The demo page shows it. |
| `cards/broken.card.json` | Opened as card 43: eight mistakes, listed in `expected/cards/broken.card.problems.txt`. |
