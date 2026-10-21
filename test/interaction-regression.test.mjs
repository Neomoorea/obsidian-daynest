import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFile(path.join(root, name), "utf8");

test("item IDs are based on Markdown row identity, not unstable list positions", async () => {
  const store = await read("src/store.ts");
  assert.match(store, /JSON\.stringify\(\[filePath, section, rawLine, occurrence\]\)/);
  assert.match(store, /const occurrences = new Map<string, number>\(\)/);
  assert.match(store, /private findItemIndex<T extends CalendarItem>/);
  assert.match(store, /item\.id === original\.id/);
  assert.match(store, /item\.rawLine === original\.rawLine/);
  assert.doesNotMatch(store, /if\s*\(idx\s*===\s*-1\)\s*events\.push\(merged\)/,
    "a failed update lookup must never silently append a duplicate event");
  assert.doesNotMatch(store, /if\s*\(idx\s*===\s*-1\)\s*tasks\.push\(merged\)/,
    "a failed task lookup must never silently append a duplicate task");
  assert.match(store, /if \(oldIndex === -1\) throw this\.missingItemError\(original\)/,
    "cross-date moves stop before source deletion/write when the original cannot be identified");
});

test("dragging suppresses the click that would otherwise edit a stale event reference", async () => {
  const timeline = await read("src/views/timelineView.ts");
  assert.match(timeline, /onDragStarted: \(\) => void/);
  assert.match(timeline, /window\.addEventListener\("click", captureSuppressedClick, true\)/);
  assert.match(timeline, /clickEvent\.stopImmediatePropagation\(\)/);
  assert.match(timeline, /const operation = moveItemDateTime\(/);
  assert.match(timeline, /handleCalendarAction\("move that item", operation\)/);
  assert.match(timeline, /private activeInteractionCleanup: \(\(\) => void\) \| null = null/);
  assert.match(timeline, /destroy\(\): void \{[\s\S]*?this\.activeInteractionCleanup\?\.\(\)/);
  assert.equal((timeline.match(/this\.registerInteractionCleanup\(cleanup\)/g) ?? []).length, 4,
    "range-select, create-drag, move-drag and resize-drag all register cleanup");
});

test("delete actions never silently choose another row and report stale-item failures", async () => {
  const store = await read("src/store.ts");
  const modal = await read("src/eventEditorModal.ts");
  assert.match(store, /const index = this\.findItemIndex\(events, item\)/);
  assert.match(store, /const index = this\.findItemIndex\(tasks, item\)/);
  assert.match(store, /if \(index === -1\) throw this\.missingItemError\(item\)/);
  assert.match(modal, /Couldn't delete that \$\{this\.kind\}/);
});

test("title and Tags editor values remain synchronized as a complete set", async () => {
  const editor = await read("src/eventEditorModal.ts");
  assert.match(editor, /this\.tagsRaw = extractTagsFromTitle\(v\)\.join\(", "\)/);
  assert.match(editor, /this\.tagsComp\?\.setValue\(this\.tagsRaw\)/);
  assert.match(editor, /this\.title = withTags\(this\.title, parseTagList\(v\)\)/);
  assert.match(editor, /finalTitle = withTags\(finalTitle, tags\)/);
});

test("tag badges are transparent to pointer hit testing", async () => {
  const css = await read("styles.css");
  const rule = css.match(/(?:^|\n)\.dc-tag-badge\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(rule, /pointer-events:\s*none\s*;/);
  assert.match(rule, /cursor:\s*inherit\s*;/);
});

test("Escape is consumed and temporary handlers are removed", async () => {
  const editor = await read("src/eventEditorModal.ts");
  const timeline = await read("src/views/timelineView.ts");
  assert.match(editor, /window\.addEventListener\("keydown", this\.onWindowKeyDown, true\)/);
  assert.match(editor, /window\.removeEventListener\("keydown", this\.onWindowKeyDown, true\)/);
  for (const [label, source] of [["editor", editor], ["timeline range", timeline]]) {
    assert.ok(source.includes("e.preventDefault()") || source.includes("ev.preventDefault()"), `${label} consumes Escape`);
    assert.ok(source.includes("e.stopImmediatePropagation()") || source.includes("ev.stopImmediatePropagation()"), `${label} stops downstream keymaps`);
  }
  assert.match(timeline, /window\.addEventListener\("keydown", onKey, true\)/);
  assert.match(timeline, /window\.removeEventListener\("keydown", onKey, true\)/);
});


test("timeline drag preview preserves the pointer offset and uses a movement threshold", async () => {
  const timeline = await read("src/views/timelineView.ts");
  const start = timeline.indexOf("private startMoveDrag(");
  const end = timeline.indexOf("private startResizeDrag(", start);
  const drag = timeline.slice(start, end);
  assert.match(drag, /const itemRect = el\.getBoundingClientRect\(\)/,
    "drag records the original screen geometry instead of assuming a full-day column position");
  assert.match(drag, /const initialLeft = itemRect\.left - columnsRect\.left/);
  assert.match(drag, /const initialTop = itemRect\.top - columnsRect\.top/);
  assert.match(drag, /if \(!dragConfirmed && newStart === startMin && newCol === originColIndex\) return/,
    "pointer jitter does not start a drag unless the snapped time or day actually changes");
  assert.match(drag, /overlay = el\.cloneNode\(true\) as HTMLElement/,
    "drag moves a visual proxy rather than reparenting the live event node");
  assert.match(drag, /overlay\.style\.top = `\$\{initialTop \+ dy\}px`/,
    "preview follows the pointer smoothly instead of jumping on the 15-minute snap");
  assert.match(drag, /Math\.floor\(draggedCenter \/ colWidthPx\)/,
    "target day is derived from the dragged block's center in the timeline grid");
  assert.match(drag, /document\.addEventListener\("mousemove", onMove, true\)/);
  assert.doesNotMatch(drag, /columnsContainer\.appendChild\(el\)/,
    "the live event element stays in its original column until the store refreshes");
});

test("mutations are serialized and cross-date moves restore the source if destination writes fail", async () => {
  const store = await read("src/store.ts");
  assert.match(store, /private mutationTail: Promise<void> = Promise\.resolve\(\)/);
  assert.match(store, /const result = this\.mutationTail\.then\(async \(\) =>/);
  assert.match(store, /this\.mutationActive = true/);
  assert.match(store, /this\.emitChange\(fullRefresh\)/);
  assert.match(store, /if \(this\.mutationActive\) \{/,
    "vault notifications arriving during a mutation are deferred until it is consistent");
  assert.doesNotMatch(store.slice(store.indexOf('private async writeFile'), store.indexOf('private async loadEditableLists')), /emitChange/,
    "each individual file write does not trigger an intermediate render");
  for (const name of ["createEvent", "createTask", "updateEvent", "updateTask", "deleteItem"]) {
    assert.ok(store.includes(`${name}(`), `${name} public method exists`);
    const marker = store.indexOf(`${name}(`);
    const section = store.slice(marker, marker + 500);
    assert.ok(section.includes("return this.runMutation("), `${name} runs in the serialized mutation queue`);
  }
  assert.match(store, /failed to roll back an event move/);
  assert.match(store, /failed to roll back a task move/);
});

test("drag proxy stays in place until the destination item has been rendered", async () => {
  const timeline = await read("src/views/timelineView.ts");
  const drag = timeline.slice(timeline.indexOf("private startMoveDrag("), timeline.indexOf("private startResizeDrag("));
  const refresh = timeline.slice(timeline.indexOf("async refresh(): Promise<void>"), timeline.indexOf("destroy(): void"));
  assert.match(drag, /this\.pendingMoveVisualCleanup = removeVisuals/);
  assert.doesNotMatch(drag, /operation\.catch\(\(\) => this\.finishPendingMoveVisual\(\)\)/,
    "the proxy cannot be removed before the store's rollback/final refresh on failure");
  assert.ok(refresh.indexOf("this.populateColumnBlocks") < refresh.lastIndexOf("this.finishPendingMoveVisual()"),
    "the new event DOM is populated before the drag proxy is removed");
  assert.match(timeline, /if \(!preserveExistingUntilReady\) \{\s*container\.empty\(\);\s*this\.destroy\(\);\s*\}[\s\S]*?if \(preserveExistingUntilReady\) \{[\s\S]*?container\.empty\(\);\s*this\.destroy\(\);/,
    "structural refreshes keep the old view on screen until data has loaded, then detach it before cleanup restores hidden elements");
  assert.match(timeline, /this\.build\(this\.lastContainer, this\.lastAnchor, this\.lastScrollEl\?\.scrollTop \?\? null, true\)/,
    "only the in-place structural refresh uses deferred replacement");
});

test("month data refresh updates day item lists without emptying the calendar tab", async () => {
  const month = await read("src/views/monthView.ts");
  assert.match(month, /async refresh\(\): Promise<void>/);
  const refresh = month.slice(month.indexOf("async refresh(): Promise<void>"), month.indexOf("private renderDayCell("));
  assert.match(refresh, /this\.renderCellItems\(list, date/);
  assert.doesNotMatch(refresh, /container\.empty\(\)/,
    "ordinary month data refresh is incremental instead of blanking the view");
  assert.match(month, /private listsByDate = new Map<string, HTMLElement>\(\)/);
});

test("tag editor accepts comma, space, and hashtag separators and navigation uses text arrows", async () => {
  const tags = await read("src/tags.ts");
  const editor = await read("src/eventEditorModal.ts");
  const calendar = await read("src/views/calendarView.ts");
  assert.ok(tags.includes("raw.split(/[\\s,#]+/)"),
    "all three tag separators are normalized by the same parser");
  assert.match(editor, /Separate tags with commas, spaces, or #\./,
    "the Tags field explains the supported separators simply");
  assert.match(calendar, /text: "‹"/,
    "the previous calendar control uses the shorter single-angle chevron");
  assert.match(calendar, /text: "›"/,
    "the next calendar control uses the shorter single-angle chevron");
  assert.doesNotMatch(calendar, /setIcon\(prevBtn|setIcon\(nextBtn/,
    "navigation no longer depends on the tiny icon chevrons");
});

test("single-row titles have priority over tag names and retain a bare # when necessary", async () => {
  const timeline = await read("src/views/timelineView.ts");
  const shared = await read("src/views/shared.ts");
  const css = await read("styles.css");
  const task = timeline.slice(timeline.indexOf("private renderTaskContent("), timeline.indexOf("private renderFittedTagLine("));
  const fit = shared.slice(shared.indexOf("export function fitTitleAndTagBadges("), shared.indexOf("/**\n * Compact pills", shared.indexOf("export function fitTitleAndTagBadges(")));
  const taskHints = shared.slice(shared.indexOf("export function renderTaskTagHints("), shared.indexOf("/** Show a lightweight full-title popover"));
  assert.match(task, /renderTaskTagHints\(body, label, item, settings\)/,
    "timeline tasks use the shared title-first tag fitter");
  assert.match(fit, /const titleWidth = Math\.max\(label\.getBoundingClientRect\(\)\.width, label\.scrollWidth\)/,
    "the title is measured at its intrinsic width before any flex shrinking");
  assert.match(fit, /if \(titleWidth \+ fullFirstBadgeWidth <= usableWidth \+ 1\)/,
    "the title and complete first tag are kept when those two fit");
  assert.match(fit, /badge\.textContent = `\$\{fullTagText\.slice\(0, 2\)\}…`/,
    "a tag is shortened only when there is room for a useful prefix and ellipsis");
  assert.match(fit, /const setBareHash = \(\): void =>/,
    "the tag can collapse to a bare # rather than displaying #…");
  assert.match(fit, /label\.style\.flex = "1 1 0px"/,
    "when title plus # cannot fit, only the title shrinks and ellipsizes");
  assert.match(taskHints, /window\.requestAnimationFrame\(\(\) => fitTitleAndTagBadges\(container, label, badges\)\)/,
    "task badges are fitted after their real container width is available");
  assert.match(css, /\.dc-block-task \.dc-block-label\s*\{[^}]*text-overflow:\s*ellipsis/s,
    "long task titles ellipsize while the hash marker stays reserved");
});

test("slim event labels show an ellipsis and the current-time line is limited to the current period", async () => {
  const timeline = await read("src/views/timelineView.ts");
  const css = await read("styles.css");
  const event = timeline.slice(timeline.indexOf("private renderEventContent("), timeline.indexOf("private renderTaskContent("));
  const now = timeline.slice(timeline.indexOf("private updateNowLine("), timeline.indexOf("export class WeekView"));
  assert.match(css, /\.dc-block-label\.dc-inline-event-label\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;/s,
    "one-line event titles use a visible ellipsis instead of clipping the last visible word");
  assert.match(event, /const inlineTags = Array\.from\(inlineRow\.querySelectorAll<HTMLElement>\("\.dc-inline-event-tag"\)\)/,
    "inline event fit is evaluated based on tag visibility, not the hidden title text width");
  assert.match(event, /fitTitleAndTagBadges\(inlineRow, inlineLabel, inlineTags\)/,
    "slim events use the same title-first fitter as tasks");
  assert.match(now, /private updateNowLine\(columns: HTMLElement, gutter: HTMLElement, dates: Moment\[\], allDates: Moment\[\], hourHeight: number\)/,
    "current-time display checks the full displayed period, including hidden weekends");
  assert.match(now, /if \(!allDates\.some\(\(date\) => isSameDay\(date, now\)\)\) return;/,
    "no current-time line is drawn when the current date is outside the selected day/week");
  assert.ok(now.indexOf("if (!allDates.some((date) => isSameDay(date, now))) return;") < now.indexOf("Array.from(columns.children).forEach"),
    "period guard runs before any red line is created");
  assert.match(timeline, /updateNowLine\(columns, gutter, dates, allDates, hourHeight\)/,
    "both initial rendering and minute refreshes supply the current period");
  assert.match(css, /\.dc-block-task \.dc-tag-badge \{[^}]*align-self: center; vertical-align: middle;[^}]*font-size: var\(--dc-tag-font\);[^}]*\}/,
    "collapsed task tag badges are centered vertically");
});

test("package metadata and install assets are in sync", async () => {
  const manifest = JSON.parse(await read("manifest.json"));
  const distManifest = JSON.parse(await read("dist/manifest.json"));
  const pkg = JSON.parse(await read("package.json"));
  const lock = JSON.parse(await read("package-lock.json"));
  const bundle = await read("dist/main.js");
  assert.equal(manifest.version, "1.2.0");
  assert.equal(manifest.author, "Neomoorea");
  assert.equal(manifest.authorUrl, "https://github.com/neomoorea");
  assert.deepEqual(distManifest, manifest);
  assert.equal(pkg.version, "1.2.0");
  assert.equal(pkg.author, "Neomoorea");
  assert.equal(lock.version, "1.2.0");
  assert.equal(lock.packages[""].version, "1.2.0");
  assert.equal(await read("styles.css"), await read("dist/styles.css"));
  assert.match(bundle, /function renderTaskTagHints/,
    "the compiled plugin contains the full-tag-first task layout");
  assert.match(bundle, /textOverflow|text-overflow/, "the compiled bundle contains ellipsized task tag handling");
  assert.match(bundle, /bindEnterToSave\(inputEl/, "the compiled bundle contains Enter-to-save bindings for time controls");
  assert.match(bundle, /MutationObserver/, "the compiled bundle cleans popovers when their item node is detached");
  assert.match(bundle, /fullTitleHeight \+ rowGap \+ tagHeight <= availableHeightPx/,
    "the compiled plugin prefers separate event title and tag rows when they fit");
  assert.match(bundle, /allDates\.some\(\(date\) =>/,
    "the compiled plugin limits the current-time line to the current view period");
  assert.match(bundle, /fitTitleAndTagBadges/,
    "the compiled plugin uses the title-first layout for slim events and tasks");
});


test("density scales task titles and tag badges across the calendar", async () => {
  const css = await read("styles.css");
  const settings = await read("src/settings.ts");
  const timeline = await read("src/views/timelineView.ts");
  assert.match(css, /\.dc-block-task \.dc-block-label\s*\{[^}]*font-size:\s*var\(--dc-block-font\);/s,
    "timed task titles use the same density font variable as event titles");
  assert.match(css, /--dc-tag-font:\s*9px;/);
  assert.doesNotMatch(css, /--dc-pill-tag-font/,
    "pill badges use the same density-driven size variable as timed event/task badges");
  assert.match(css, /--dc-tag-font:\s*11px;/);
  assert.match(css, /\.dc-tag-badge\s*\{[^}]*font-size:\s*var\(--dc-tag-font\);/s,
    "standard tag badges adapt to density");
  assert.match(css, /\.dc-pill \.dc-tag-badge\s*\{\s*font-size:\s*var\(--dc-tag-font\);\s*\}/,
    "month/all-day tag badges share the same density size as timed badges");
  assert.match(settings, /this\.plugin\.settings\.eventDensity = v[\s\S]*?this\.plugin\.refreshCalendarAppearance\(\)/,
    "changing density immediately updates the root density class");
  const calendar = await read("src/views/calendarView.ts");
  assert.match(calendar, /refreshAppearanceSettings\(\): void \{\s*this\.applySettingsClasses\(\);\s*this\.refreshBody\(\);/,
    "appearance changes refresh measured title/tag layout, not just font-size variables");
  assert.match(timeline, /private renderTaskContent\(/);
});

test("Daynest naming, calendar labels, current-day styling, and month task outlines are consistent", async () => {
  const css = await read("styles.css");
  const main = await read("src/main.ts");
  const calendar = await read("src/views/calendarView.ts");
  const month = await read("src/views/monthView.ts");
  const year = await read("src/views/yearView.ts");
  const timeline = await read("src/views/timelineView.ts");
  assert.match(calendar, /getDisplayText\(\): string \{\s*return "Daynest";/);
  assert.match(calendar, /getIcon\(\): string \{\s*return "calendar";/);
  assert.match(main, /addRibbonIcon\("calendar", "Open Daynest"/);
  assert.match(css, /\.daily-calendar-header\s*\{[^}]*border-bottom:\s*none;/s,
    "the line below the toolbar is removed");
  assert.match(css, /\.daily-calendar-view-switcher\s*\{[^}]*background:\s*var\(--background-modifier-border\);/s,
    "the view switcher is restored to its previous background styling");
  assert.match(css, /\.dc-month-headercell\s*\{[^}]*text-transform:\s*none;[^}]*color:\s*var\(--text-normal\);/s);
  assert.match(css, /\.dc-timeline-header-dow\s*\{[^}]*text-transform:\s*none;[^}]*color:\s*var\(--text-normal\);/s);
  assert.match(year, /text: name \}/,
    "the Year view shows title-case short weekday names rather than single letters");
  assert.match(css, /\.dc-is-today \.dc-day-badge\s*\{[^}]*background:\s*var\(--interactive-accent\);[^}]*color:\s*var\(--text-on-accent\);/s);
  assert.match(css, /\.dc-timeline-header-col\.dc-is-today \.dc-timeline-header-num\s*\{[^}]*background:\s*var\(--interactive-accent\);[^}]*color:\s*var\(--text-on-accent\);/s);
  assert.match(css, /\.dc-year-cell\.dc-is-today \.dc-year-daynum\s*\{[^}]*background:\s*var\(--interactive-accent\);[^}]*color:\s*var\(--text-on-accent\);/s);
  assert.doesNotMatch(css, /\.dc-timeline-col\.dc-is-today \{ background: transparent; \}/);
  assert.match(css, /\.dc-pill-task\s*\{[^}]*background:\s*transparent;[^}]*border:\s*1\.5px solid var\(--dc-item-color\);/s,
    "month/all-day task chips use the outlined task style rather than a filled event chip");
  assert.match(css, /\.dc-style-callout \.dc-block:not\(\.dc-block-task\)::before\s*\{[^}]*left:\s*3px;[^}]*border-radius:\s*1px;/s,
    "the event rail moves right slightly and has softly rounded ends");
  assert.match(css, /\.dc-style-callout \.dc-pill:not\(\.dc-pill-task\)::before\s*\{[^}]*left:\s*3px;[^}]*border-radius:\s*1px;/s,
    "the same rail refinement applies to month/all-day event chips");
  assert.match(month, /renderItemChip\(this\.host, item, settings\)/);
  assert.match(timeline, /date\.format\("ddd"\)/);
});

test("callout event colours and the high-contrast option are event-only", async () => {
  const css = await read("styles.css");
  const types = await read("src/types.ts");
  const settings = await read("src/settings.ts");
  const calendar = await read("src/views/calendarView.ts");
  const main = await read("src/main.ts");
  const bundle = await read("dist/main.js");
  assert.match(css, /\.dc-style-callout \.dc-block:not\(\.dc-block-task\)::before\s*\{[^}]*left:\s*3px;[^}]*top:\s*4px;[^}]*bottom:\s*4px;[^}]*width:\s*2px;[^}]*border-radius:\s*1px;/s,
    "the event colour rail is slim, inset, subtly rounded, and does not style task blocks");
  assert.match(css, /\.dc-style-callout \.dc-block:not\(\.dc-block-task\) \.dc-block-label,[\s\S]*?color:\s*color-mix\(in srgb, var\(--dc-item-color\) 65%, var\(--text-normal\)\);/s,
    "event titles use a readable tint of the event colour in callout style");
  assert.match(css, /\.dc-style-callout \.dc-block:not\(\.dc-block-task\) \.dc-block-time\s*\{[^}]*color:\s*color-mix\(in srgb, var\(--dc-item-color\) 58%, var\(--text-normal\)\);/s,
    "event times use a slightly softer but readable tint of the event colour");
  assert.match(css, /\.dc-style-callout \.dc-pill:not\(\.dc-pill-task\)::before\s*\{[^}]*left:\s*3px;[^}]*top:\s*2px;[^}]*bottom:\s*2px;[^}]*width:\s*2px;[^}]*border-radius:\s*1px;/s,
    "month and all-day event chips share the subtly rounded callout rail");
  assert.match(css, /\.dc-style-callout \.dc-pill:not\(\.dc-pill-task\)\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--dc-item-color\) var\(--dc-callout-tint\), var\(--background-primary\)\);/s,
    "event chips use the configurable callout tint while task chips are excluded");
  assert.match(css, /\.dc-high-contrast-event-text\.dc-style-callout \.dc-block:not\(\.dc-block-task\) \.dc-block-label\s*\{[^}]*color:\s*var\(--text-normal\);/s,
    "high contrast restores normal theme text for event titles");
  assert.match(css, /\.dc-high-contrast-event-text\.dc-style-callout \.dc-block:not\(\.dc-block-task\) \.dc-block-time\s*\{[^}]*color:\s*var\(--text-muted\);/s,
    "high contrast restores muted theme text for event times");
  assert.match(types, /highContrastEventText:\s*boolean/);
  assert.match(types, /highContrastEventText:\s*false/);
  assert.match(types, /strongEventBackgroundTint:\s*boolean/);
  assert.match(types, /strongEventBackgroundTint:\s*false/);
  assert.match(settings, /Increase contrast for event text/);
  assert.match(settings, /Use stronger event background tint/);
  assert.match(settings, /this\.plugin\.settings\.strongEventBackgroundTint = value/);
  assert.match(settings, /this\.plugin\.refreshCalendarAppearance\(\)/,
    "the setting applies without requiring the calendar to be reopened");
  assert.match(calendar, /classList\.toggle\("dc-high-contrast-event-text", settings\.highContrastEventText\)/);
  assert.match(calendar, /classList\.toggle\("dc-strong-event-background-tint", settings\.strongEventBackgroundTint\)/);
  assert.match(main, /refreshCalendarAppearance\(\): void/);
  assert.match(bundle, /Increase contrast for event text/,
    "the distributed plugin bundle contains the new setting");
  assert.match(bundle, /dc-high-contrast-event-text/,
    "the distributed plugin bundle applies the contrast setting");
  assert.match(bundle, /Use stronger event background tint/,
    "the distributed plugin bundle contains the background tint setting");
  assert.match(css, /\.daily-calendar-root\s*\{[^}]*--dc-callout-tint:\s*8%;/s,
    "the default callout background is lighter than before");
  assert.match(css, /\.daily-calendar-root\.dc-strong-event-background-tint\s*\{[^}]*--dc-callout-tint:\s*15%;/s,
    "the new setting restores the original tint strength when enabled");
  assert.match(css, /\.dc-tag-badge\s*\{[^}]*pointer-events:\s*none/s,
    "tag badges keep their existing styling and hit-testing rules");
});

test("event resize handles remain discoverable and resize gestures save the new duration", async () => {
  const timeline = await read("src/views/timelineView.ts");
  const css = await read("styles.css");
  const bundle = await read("dist/main.js");
  assert.match(timeline, /dc-resize-handle dc-resize-top/);
  assert.match(timeline, /dc-resize-handle dc-resize-bottom/);
  assert.match(timeline, /startResizeDrag\(e, item, el, "top"/);
  assert.match(timeline, /startResizeDrag\(e, item, el, "bottom"/);
  assert.match(timeline, /document\.addEventListener\("mousemove", onMove, true\)/);
  assert.match(timeline, /document\.addEventListener\("mouseup", onUp, true\)/);
  assert.match(timeline, /this\.host\.store\.updateEvent\(item, \{ start: minutesToTime\(pendingStart\), end: minutesToTime\(pendingEnd\) \}\)/);
  assert.match(css, /\.dc-resize-handle\s*\{[^}]*z-index:\s*5;/s);
  assert.doesNotMatch(css, /\.dc-block:hover \.dc-resize-handle::after/,
    "resize handles remain functional without adding visible horizontal hover lines");
  assert.doesNotMatch(css, /\.dc-resize-handle::after\s*\{/,
    "resize handles have no cosmetic grip pseudo-elements");
  assert.match(bundle, /function eventBlockHeight/);
  assert.match(bundle, /this\.host\.store\.updateEvent\(item, \{ start: \(0, dateUtils_1\.minutesToTime\)\(pendingStart\), end: \(0, dateUtils_1\.minutesToTime\)\(pendingEnd\) \}\)/);
});

test("day labels, locale-aware date title, and selected date persistence are restored", async () => {
  const timeline = await read("src/views/timelineView.ts");
  const calendar = await read("src/views/calendarView.ts");
  const bundle = await read("dist/main.js");
  assert.match(timeline, /dates\.length === 1 \? date\.format\("dddd"\) : date\.format\("ddd"\)/);
  assert.match(calendar, /lastCalendarAnchorForSession: Moment \| null = null/);
  assert.match(calendar, /private anchor: Moment = lastCalendarAnchorForSession\?\.clone\(\) \?\? today\(\)/);
  assert.match(calendar, /if \(this\.mode === "day"\) return this\.anchor\.format\("LL"\)/);
  assert.match(calendar, /lastCalendarAnchorForSession = this\.anchor\.clone\(\)/);
  assert.match(bundle, /lastCalendarAnchorForSession = null/);
  assert.match(bundle, /return this\.anchor\.format\("LL"\)/);
  assert.match(bundle, /date\.format\("dddd"\) : date\.format\("ddd"\)/);
});

test("today badges are rounded and visible; weekend shading differs for day versus week view", async () => {
  const css = await read("styles.css");
  const timeline = await read("src/views/timelineView.ts");
  assert.match(css, /\.dc-is-today \.dc-day-badge\s*\{[^}]*background:\s*var\(--interactive-accent\)/s);
  assert.match(css, /\.dc-timeline-header-col\.dc-is-today \.dc-timeline-header-num\s*\{[^}]*background:\s*var\(--interactive-accent\)/s);
  assert.match(timeline, /dates\.length > 1 && settings\.weekendShading && isWeekendDate\(date\)/);
  assert.match(timeline, /allDates\.length > 1 && settings\.weekendShading && isWeekendDate\(date\)/);
  assert.doesNotMatch(css, /\.dc-timeline-col\.dc-is-today\s*\{\s*background:\s*transparent/s);
});

test("event and task tag badges share the same density-driven dimensions", async () => {
  const css = await read("styles.css");
  assert.match(css, /--dc-tag-font:\s*10px/);
  assert.match(css, /\.daily-calendar-root \.dc-tag-badge\s*\{[^}]*font-size:\s*var\(--dc-tag-font\) !important;[^}]*line-height:\s*1\.3 !important;[^}]*padding:\s*1px 5px !important;/s,
    "all event/task badges share font size, line height, and padding across view types");
  assert.match(css, /\.dc-pill \.dc-tag-badge\s*\{\s*font-size:\s*var\(--dc-tag-font\);\s*\}/);
  assert.doesNotMatch(css, /--dc-pill-tag-font/);
});

test("last used view persistence tracks every mode and captures the open view when enabled", async () => {
  const types = await read("src/types.ts");
  const calendar = await read("src/views/calendarView.ts");
  const settings = await read("src/settings.ts");
  const main = await read("src/main.ts");
  const bundle = await read("dist/main.js");
  const settingsMethod = calendar.slice(calendar.indexOf("private setModeInternal("), calendar.indexOf("// ---------------------------------------------------------- public API"));
  assert.match(types, /defaultView:\s*"last"/);
  assert.match(settingsMethod, /this\.plugin\.settings\.lastUsedView !== mode/);
  assert.match(settingsMethod, /this\.plugin\.settings\.lastUsedView = mode/);
  assert.doesNotMatch(settingsMethod, /defaultView === "last"/,
    "view history should stay current so choosing Last used view later doesn't start from a stale mode");
  assert.match(settings, /if \(value === "last"\)[\s\S]*?getCurrentCalendarMode\(\)[\s\S]*?lastUsedView = currentMode/,
    "enabling Last used view captures the mode that is currently open");
  assert.match(main, /settingsSaveQueue: Promise<void> = Promise\.resolve\(\)/);
  assert.match(main, /JSON\.parse\(JSON\.stringify\(this\.settings\)\)/);
  assert.match(bundle, /getCurrentCalendarMode\(\)/);
  assert.match(bundle, /settingsSaveQueue = Promise\.resolve\(\)/);
});

test("settings survive plugin unload/reload and migrate wrapped legacy data", async () => {
  const main = await read("src/main.ts");
  const bundle = await read("dist/main.js");
  assert.match(main, /onunload\(\): void \{[\s\S]*?this\.snapshotSettings\(\)[\s\S]*?this\.saveData\(snapshot\)/,
    "disabling Daynest queues a final snapshot after earlier settings writes");
  assert.match(main, /const isWrapped = !!outer\.settings[\s\S]*?const data = \(isWrapped \? outer\.settings : outer\)/,
    "existing settings are loaded from either flat data.json or a wrapped legacy payload");
  assert.match(main, /if \(isWrapped\) await this\.saveSettings\(\)/,
    "legacy settings are migrated and saved in the current flat format");
  assert.match(main, /colorRules: Array\.isArray\(data\.colorRules\)[\s\S]*?data\.colorRules\.map/,
    "custom tag-colour rules are copied from persisted data rather than replaced with defaults");
  assert.match(bundle, /failed to persist settings while unloading/);
  assert.match(bundle, /const isWrapped = !!outer\.settings/);
  assert.match(bundle, /if \(isWrapped\)\s*await this\.saveSettings\(\)/);
});

test("navigation controls and settings categories use the rounded segmented-button style", async () => {
  const css = await read("styles.css");
  const settings = await read("src/settings.ts");
  const calendar = await read("src/views/calendarView.ts");
  const bundle = await read("dist/main.js");
  assert.match(css, /\.daily-calendar-btn\s*\{[^}]*border-radius:\s*999px;/s);
  assert.match(css, /\.daily-calendar-icon-btn\s*\{[^}]*border-radius:\s*50%/s);
  assert.match(css, /\.daily-calendar-view-switcher\s*\{[^}]*border-radius:\s*999px/s);
  assert.match(css, /\.daily-calendar-settings-tabs\s*\{[^}]*border-radius:\s*999px/s);
  assert.match(settings, /id: "general", label: "General"/);
  assert.match(settings, /id: "daily-notes", label: "Daily Notes"/);
  assert.match(settings, /id: "colours", label: "Colours"/);
  assert.match(settings, /id: "appearance", label: "Appearance"/);
  assert.match(settings, /categories\.find\(\(category\) => category\.id === this\.activeCategory\)\?\.render\(\)/);
  assert.match(calendar, /text: "Today"/);
  assert.match(calendar, /text: "‹"/);
  assert.match(calendar, /text: "›"/);
  assert.match(bundle, /daily-calendar-settings-tabs/);
});

test("task checkboxes use the active theme's checkbox shape in both task layouts", async () => {
  const shared = await read("src/views/shared.ts");
  const timeline = await read("src/views/timelineView.ts");
  const css = await read("styles.css");
  const bundle = await read("dist/main.js");
  assert.match(shared, /function usesDefaultObsidianTheme\(app: App\)/);
  assert.match(shared, /const useLegacyCheckbox = usesDefaultObsidianTheme\(app\)/);
  assert.match(shared, /parent\.createDiv\(\{ cls: "dc-pill-check"/,
    "built-in Obsidian themes retain the original custom checkbox implementation");
  assert.match(shared, /cls: "dc-task-checkbox task-list-item-checkbox"/,
    "community themes receive a native checkbox with Obsidian's standard checkbox class");
  assert.match(shared, /setAttribute\("data-task", marker\)/);
  assert.match(timeline, /renderTaskCheckbox\(body, this\.host\.app, item/);
  assert.match(css, /input\.dc-task-checkbox\s*\{[^}]*accent-color:\s*var\(--dc-item-color\)/s);
  assert.doesNotMatch(css, /input\.dc-task-checkbox\s*\{[^}]*border-radius:/s,
    "the plugin must not override theme-specific square or circular checkbox radii");
  assert.match(bundle, /task-list-item-checkbox/);
});



test("task hover labels are removed and custom checkbox markers are preserved", async () => {
  const shared = await read("src/views/shared.ts");
  const timeline = await read("src/views/timelineView.ts");
  const settings = await read("src/settings.ts");
  const parser = await read("src/parser.ts");
  const writer = await read("src/writer.ts");
  const store = await read("src/store.ts");
  const bundle = await read("dist/main.js");
  assert.doesNotMatch(shared + timeline + bundle, /Mark task complete:/);
  assert.doesNotMatch(settings, /Daynest settings categories/);
  assert.match(parser, /const TASK_RE = \/\^/);
  assert.match(parser, /checkboxStatus: box/);
  assert.match(writer, /item\.checkboxStatus \?\? \(item\.completed \? "x" : " "\)/);
  assert.match(store, /changes\.checkboxStatus \?\?/);
});

test("task popovers appear only when a title or tags are actually clipped", async () => {
  const shared = await read("src/views/shared.ts");
  const timeline = await read("src/views/timelineView.ts");
  const bundle = await read("dist/main.js");
  assert.match(shared, /const titleIsClipped = label\.scrollWidth > label\.clientWidth \+ 1 \|\| label\.scrollHeight > label\.clientHeight \+ 1/);
  assert.match(shared, /if \(!titleIsClipped && !tagsAreHidden\?\.\(\)\) return/);
  assert.match(timeline, /const tagsAreHidden = visibleTags\.length !== item\.tags\.length/);
  assert.match(timeline, /return titleIsClipped \|\| tagsAreHidden/);
  assert.match(timeline, /!hovered \|\| !el\.isConnected \|\| !shouldShow\(\)/);
  assert.match(bundle, /!shouldShow\(\)/);
});
