# Daynest

A Year / Month / Week / Day calendar for Obsidian, with **no database and no
proprietary format** — every event and task is read from and written to
ordinary Markdown inside your existing Daily Notes.

Delete the plugin at any point and your Daily Notes remain perfectly readable,
ordinary Markdown files. Nothing is hidden in plugin storage.

---

## Installing it

### Option A — quick install (prebuilt)

1. In your vault, create the folder `.obsidian/plugins/daynest/`.
2. Copy `main.js`, `manifest.json`, and `styles.css` (from the `dist/` folder
   of this package) into that folder.
3. In Obsidian, go to **Settings → Community plugins**, click **Reload
   plugins** (or restart Obsidian), then enable **Daynest**.

### Option B — build from source

```bash
npm install
npm run build
```

This produces `main.js` next to `manifest.json` and `styles.css` at the
project root — copy those three files into
`.obsidian/plugins/daynest/` as above.

`npm run dev` runs an incremental watch build if you want to modify the
plugin.

### Requirements

- Obsidian 1.4.0 or later, desktop or mobile.
- Obsidian's core **Daily Notes** plugin enabled (or the community **Periodic
  Notes** plugin, which is detected automatically as a fallback). Daily
  Calendar reads its folder/filename-format/template settings from whichever
  of these you use — see [Daily Notes integration](#daily-notes-integration).

---

## The Markdown syntax

Daynest recognises exactly four line shapes. Everything else in a
Daily Note — including other bullets, headings, and paragraphs — is left
completely untouched.

| What | Syntax | Example |
|---|---|---|
| Timed event | `- HH:MM - HH:MM Title` | `- 09:00 - 10:00 Team meeting #work` |
| All-day event | *(same shape, spanning your configured working hours)* | `- 08:00 - 18:00 Conference #work` |
| All-day task | `- [ ] Title` | `- [ ] Buy milk` |
| Timed task | `- [ ] HH:MM Title` | `- [ ] 15:30 Buy groceries #personal` |

A completed task uses `- [x]` instead of `- [ ]`.

- **Tags** are just ordinary inline `#tags` anywhere in the title — they
  double as the input to colour rules (see below).
- **Wikilinks** work normally: `- 13:10 - 15:10 [[Project meeting]]` is an
  event whose title *is* a link. Cmd/Ctrl-click it in any calendar view to
  open that note.
- The parser is deliberately strict, matching the spec this was built from:
  `- 09:00 Meeting` (one time, no range) and `- This meeting starts at
  09:00` are both ordinary Markdown, not events.
- An event is treated as **all-day** when its times exactly match your
  configured *working hours* — there's no hidden metadata marking this, so
  changing your working hours later can change how an old all-day event is
  interpreted. This trade-off is what keeps the file format free of anything
  beyond the four syntaxes above.

By default, events and tasks live under `## Events` and `## Tasks` headings
(both configurable, and a "single section" mode is available in Settings if
you'd rather not split them). A section runs from its heading to whatever
heading comes next, so it's safe to have other headings and content
elsewhere in the same note.

---

## Using it

- **Ribbon icon** or **command palette → "Open calendar"** opens the
  calendar in a new tab.
- **Year/Month/Week/Day** switcher, **Today** button, and **◀ ▶** arrows in
  the header behave as you'd expect (the switcher's order is Day → Week →
  Month → Year, and the ◀ Today ▶ group sits together on the right). Set
  **Default view** to "Last used view" in
  Settings if you'd rather it reopen wherever you left it than always the
  same view.
- **Click a date** (Month/Year) or a **day header** (Week/Day) to open that
  day's Daily Note, creating it from your template if it doesn't exist yet.
- **Click an event or task** to edit it; **Cmd/Ctrl-click** a linked one to
  open its note instead (linked items display their clean title, not the
  `[[brackets]]`). A **✓** on a task toggles it complete directly.
- **The editor** has a **Task** toggle that converts what you're creating
  between a timed event and a checkbox task (it moves it into your
  configured task section on save). Typing a title that starts with
  `- [ ]` or `[x]` does the same thing automatically. Pressing **Return**
  in the title field saves, the same as clicking Save.
- **Month view:** hover a day for a small **+** button (quick-add, all-day
  by default); drag an item onto another day to move it; "+N more" opens
  that day in Day view rather than a popover.
- **Week/Day view:** click-and-release on an empty slot creates a
  default-length event there and opens the editor; **drag** on an empty
  slot draws a custom time range; **drag an existing event's body** to move
  it, both across time and across days — a tooltip follows your cursor
  showing exactly where it'll land; **drag its top/bottom edge** to resize
  it. Tasks show as slim, minimal-height chips per the spec's intent — only
  events get resize handles, since a task is a point in time, not a span.
  The all-day row only appears when there's actually an all-day item to
  show that week/day.
- All of the above is also available as **Obsidian commands** (open the
  command palette and search "calendar"), so you can assign your own
  hotkeys via **Settings → Hotkeys** — "Go to today", "New event", "New
  task", and "Switch to Year/Month/Week/Day view" are all there.

## Colour rules

Colours come from **tags**, configured in **Settings → Daynest →
Colours**. A rule matches when an item has *all* of its listed tags; when
several rules match, the one requiring the *most* tags wins (so a
`work + meeting` rule beats a plain `work` rule), and ties go to whichever
rule is higher in your list. Reorder rules with the ↑/↓ buttons.

## Daily Notes integration

Folder, filename format, and template come straight from Obsidian's core
**Daily Notes** plugin (falling back to **Periodic Notes** if that's what
you use instead). Creating an event or task on a date with no note yet
creates that note first, from your template, with `{{date}}`, `{{date:
FORMAT}}`, `{{time}}`, and `{{title}}` substituted — then opens it according
to your "Open Daily Note in" setting.

---

## Known simplifications

This plugin was built from a very thorough specification, and almost all of
it made it in — but a few things were deliberately simplified, and it's
worth being upfront about exactly what and why, rather than quietly cutting
corners:

- **Touch/mobile drag isn't implemented.** Every interaction is wired
  through mouse events, so create/move/resize-by-dragging need a mouse or
  trackpad. Tapping to open the editor, toggle a task, or navigate all work
  fine on mobile — precise dragging doesn't yet. Rebuilding the drag layer
  on Pointer Events instead of Mouse Events would fix this and is the
  natural next step.
- **Month view's "+N more"** jumps to Day view for that date instead of
  opening a popover list. It shows everything with full interactivity, just
  not in place.
- **Week/Day view's all-day row** is only shown when at least one visible
  day actually has an all-day item — when it's hidden there's no quick-add
  button there either. Use Month view's per-day **+**, or the All-day
  toggle inside the editor, to add one.
- **Colour rule reordering** uses ↑/↓ buttons rather than freeform drag —
  it's less fluid but exactly as capable.
- **"Link to a note"** creates a plain empty note (no template picker). The
  "Note title" field defaults to matching the event/task title (so leaving
  it alone just links to a note named after the event) and stays in sync as
  you type the title, until you edit it directly — at that point the title
  becomes an alias for whatever you typed there (handy for keeping a short
  title while giving the note itself a more specific name, e.g. appending a
  date). A live preview under the field always shows exactly what will be
  written, e.g. `→ [[Meeting with Tom]]` or `→ [[Meeting with Tom
  20260918|Meeting with Tom]]`.
- **A single unified Events+Tasks section** (if you turn off "separate task
  section") sorts all-day items first, then everything else chronologically
  together — the source spec defined ordering for Events and Tasks
  separately but not what happens when they share one list, so this is my
  own reasonable extension of the same rule.
- **A stray line** — say, a checkbox task physically sitting under your
  Events heading — is still recognised as what it looks like (grammar
  decides, not location), and gets tidied into the right section next time
  the plugin saves that file, rather than silently dropped.
- Recurring events, reminders/notifications, multi-day spanning events, and
  syncing with external calendars are all **out of scope**, matching the
  source spec's own stated non-goals.

## A note on testing

I don't have a way to run a live Obsidian instance in this environment, so
this hasn't been through an actual vault. What I *could* do, I did: the
whole plugin type-checks cleanly against Obsidian's real, current API
typings (so method names, parameters, and return types are all verified
against the genuine API surface, not guessed), it bundles cleanly with
esbuild, and the parsing/writing/sorting/colour-resolution/date logic has a
small test suite (`npm test`) exercising it against the specification's own
worked examples, including exact round-trip idempotency. If something
doesn't work as expected once it's in a real vault, that's useful to know.

---

## Project layout

```
src/
  types.ts              data model & settings shape
  dateUtils.ts           time/date helpers (built on Obsidian's bundled moment)
  parser.ts              strict line/section parser
  writer.ts               formatting, sorting, section splicing
  colorRules.ts          tag → colour resolution
  dailyNotes.ts          core Daily Notes / Periodic Notes integration
  navigation.ts          open-in-tab helpers, linked-note lookup/creation
  store.ts                the only thing that touches the vault; caches + live sync
  settings.ts             settings tab UI
  eventEditorModal.ts    event & task editor modals
  main.ts                 plugin entry: commands, ribbon, vault event wiring
  views/
    shared.ts             the CalendarHost interface every view renders against
    calendarView.ts       header, view-switching, hosts the sub-views below
    yearView.ts
    monthView.ts
    timelineView.ts       shared Week/Day engine (drag create/move/resize)
    overlapLayout.ts       side-by-side layout for overlapping blocks
test/
  smoke.test.ts          run with `npm test`
```

MIT-equivalent — do whatever you like with it.
