# The board file

Version 1.

This page is for anyone who wants a board drawn: a person, a board, a script or an agent. Produce one file as described here, hand it to the Board Generator, and get the board back. It is also the contract the generator is tested against.

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

- A card can also carry its own `buttons` list, with `name`, `link`, `action`, `main` and `confirm`. They are drawn before the file's buttons.
- **What a press does.** When the board is drawn inside another page that listens for actions, a button with an `action` hands that word and the card's id to that page. Otherwise the button opens its `link`. A button that has only an `action`, on a page that does not listen, is not drawn.
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

Missing or wrong `board` version · missing `title` · no `columns`, or more than 12 · a column with no `name`, or a name used twice · a `limit`, `show` or `total` that is not a whole number of 1 or more · a `total` smaller than the cards the file has for that column · a `more_link` that is not a web address · more than 5,000 cards · a card with no `id`, no `title` or no `column` · an `id` longer than 12 characters, or used twice · a `column` that is not defined · a `due` or `today` that is not a date · `in_strip` on a card when the file has no `strip` · a `link` or `link_pattern` that is not a web address, or a pattern with no `{id}` · a button with no `name`, or with neither `link` nor `action` · a button naming a kind no card has, or a column that is not defined · `card_lines` other than 2 or 3 · a colour that is not six-digit hex, or a colour name that is not in the table · a text colour that cannot be read on its background · a text longer than its limit.

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

Lists such as `kinds` and `columns` on a button are written with commas. A card's `text` is the text inside its `<card>` element. A card's own buttons are `<button>` elements inside it. Colours go in one `<style card-lines="3">` element holding `<colour name="accent" value="#4B5320"/>` elements.

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
