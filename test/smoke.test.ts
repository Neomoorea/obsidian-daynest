import { displayTitle, findSection, firstWikilinkTarget, parseLine, parseManagedSectionBody } from "../src/parser";
import {
	buildSectionBodyLines,
	contentToLines,
	formatEventLine,
	formatTaskLine,
	linesToContent,
	replaceSectionBody,
	sortEvents,
	sortMixedSection,
	sortTasks,
} from "../src/writer";
import { resolveColor } from "../src/colorRules";
import { layoutOverlaps } from "../src/views/overlapLayout";
import {
	dateKey,
	formatTimeOfDay,
	fromDateKey,
	getMonthGridWeeks,
	getWeekDates,
	minutesToTime,
	parseTimeString,
	timeToMinutes,
} from "../src/dateUtils";
import { ColorRule, TimeOfDay } from "../src/types";

let pass = 0;
let fail = 0;

function eq(actual: unknown, expected: unknown, label: string): void {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	if (a === e) {
		pass++;
	} else {
		fail++;
		console.error(`FAIL: ${label}\n  expected: ${e}\n  actual:   ${a}`);
	}
}

function ok(cond: boolean, label: string): void {
	if (cond) pass++;
	else {
		fail++;
		console.error(`FAIL: ${label}`);
	}
}

const WH_START: TimeOfDay = { hour: 8, minute: 0 };
const WH_END: TimeOfDay = { hour: 18, minute: 0 };

// ---------------------------------------------------------------- parser

{
	const r = parseLine("- 09:00 - 10:00 Team meeting #work", WH_START, WH_END);
	ok(r?.kind === "event", "parses timed event");
	if (r?.kind === "event") {
		eq(r.start, { hour: 9, minute: 0 }, "event start");
		eq(r.end, { hour: 10, minute: 0 }, "event end");
		eq(r.title, "Team meeting #work", "event title keeps inline tag");
		eq(r.tags, ["work"], "event tag extracted");
		eq(r.allDay, false, "9-10 is not all-day under 8-18 working hours");
	}
}

{
	const r = parseLine("- 08:00 - 18:00 Conference #work", WH_START, WH_END);
	ok(r?.kind === "event" && r.allDay === true, "event spanning exactly working hours is all-day");
}

{
	const r = parseLine("- [ ] Buy milk", WH_START, WH_END);
	ok(r?.kind === "task" && r.allDay === true && r.completed === false && r.title === "Buy milk", "plain all-day task");
}

{
	const r = parseLine("- [x] Buy milk", WH_START, WH_END);
	ok(r?.kind === "task" && r.completed === true, "checked task is completed");
}

{
	const r = parseLine("- [ ] 15:30 Buy groceries #personal", WH_START, WH_END);
	ok(r?.kind === "task", "timed task parses");
	if (r?.kind === "task") {
		eq(r.time, { hour: 15, minute: 30 }, "task time");
		eq(r.tags, ["personal"], "task tag");
		eq(r.allDay, false, "timed task is not all-day");
	}
}

eq(parseLine("- 09:00 Meeting", WH_START, WH_END), null, "single time is NOT an event (spec strictness example)");
eq(parseLine("- This meeting starts at 09:00", WH_START, WH_END), null, "prose mentioning a time is not an event");

{
	const r = parseLine("- 13:10 - 15:10 [[Project meeting]]", WH_START, WH_END);
	ok(r?.kind === "event" && r.title === "[[Project meeting]]" && r.tags.length === 0, "wikilink-only title preserved verbatim");
}

eq(firstWikilinkTarget("[[Project meeting]]"), "Project meeting", "wikilink target, no alias");
eq(firstWikilinkTarget("[[Note|Alias]]"), "Note", "wikilink target with alias");
eq(firstWikilinkTarget("no link here"), null, "no wikilink present");

eq(displayTitle("[[Project meeting]]"), "Project meeting", "displayTitle strips brackets, no alias");
eq(displayTitle("[[Note|Alias]]"), "Alias", "displayTitle shows the alias, not the raw target, when present");
eq(displayTitle("Prep for [[Project meeting]] #work"), "Prep for Project meeting #work", "displayTitle works on embedded links too");
eq(displayTitle("No link here"), "No link here", "displayTitle is a no-op without a wikilink");

// ---------------------------------------------------------------- sections

{
	const file = [
		"# 2026-09-15",
		"",
		"## Events",
		"- 09:00 - 10:00 Team meeting #work",
		"- 13:10 - 15:10 [[Project meeting]]",
		"",
		"## Tasks",
		"- [ ] Buy milk",
		"",
		"## Notes",
		"Some unrelated freeform text that must never be touched.",
	];
	const events = findSection(file, "## Events");
	ok(events !== null, "finds Events section");
	if (events) {
		eq(file.slice(events.bodyStart, events.bodyEnd), [
			"- 09:00 - 10:00 Team meeting #work",
			"- 13:10 - 15:10 [[Project meeting]]",
			"",
		], "Events body stops right before the next heading");
	}
	const notes = findSection(file, "## Notes");
	ok(notes !== null && notes.bodyEnd === file.length, "Notes section runs to EOF when nothing follows");

	const missing = findSection(file, "## Reminders");
	eq(missing, null, "missing heading returns null");
}

// ------------------------------------------------------------------ writer

{
	const line = formatEventLine({ allDay: false, start: { hour: 9, minute: 0 }, end: { hour: 10, minute: 0 }, title: "Team meeting #work" }, WH_START, WH_END);
	eq(line, "- 09:00 - 10:00 Team meeting #work", "formatEventLine round-trips exactly");
}
{
	const line = formatEventLine({ allDay: true, start: { hour: 0, minute: 0 }, end: { hour: 0, minute: 0 }, title: "Conference #work" }, WH_START, WH_END);
	eq(line, "- 08:00 - 18:00 Conference #work", "all-day event is written using working-hours boundary, not its stored (unused) time");
}
{
	const line = formatTaskLine({ allDay: false, time: { hour: 15, minute: 30 }, completed: false, title: "Buy groceries #personal" });
	eq(line, "- [ ] 15:30 Buy groceries #personal", "formatTaskLine with time round-trips exactly");
}
{
	const line = formatTaskLine({ allDay: true, time: null, completed: true, title: "Buy milk" });
	eq(line, "- [x] Buy milk", "completed all-day task formats correctly");
}

{
	// full parse -> format round trip for every canonical example line
	const examples = [
		"- 09:00 - 10:00 Team meeting #work",
		"- 08:00 - 18:00 Conference #work",
		"- [ ] Buy milk",
		"- [x] Buy milk",
		"- [ ] 15:30 Buy groceries #personal",
	];
	for (const line of examples) {
		const parsed = parseLine(line, WH_START, WH_END);
		if (!parsed) {
			fail++;
			console.error(`FAIL: round-trip parse for "${line}" returned null`);
			continue;
		}
		const formatted = parsed.kind === "event" ? formatEventLine(parsed, WH_START, WH_END) : formatTaskLine(parsed);
		eq(formatted, line, `round-trip idempotency: "${line}"`);
	}
}

{
	const unsorted = [
		{ id: "b", start: { hour: 14, minute: 0 }, end: { hour: 15, minute: 0 } },
		{ id: "a", start: { hour: 9, minute: 0 }, end: { hour: 10, minute: 0 } },
		{ id: "c", start: { hour: 9, minute: 0 }, end: { hour: 9, minute: 30 } }, // same start as "a", earlier end
	];
	const sorted = sortEvents(unsorted).map((e) => e.id);
	eq(sorted, ["c", "a", "b"], "sortEvents: start asc, then end asc");
}

{
	const unsorted = [
		{ id: "timed-1", allDay: false, time: { hour: 15, minute: 0 } },
		{ id: "allday-1", allDay: true, time: null },
		{ id: "timed-2", allDay: false, time: { hour: 9, minute: 0 } },
		{ id: "allday-2", allDay: true, time: null },
	];
	const sorted = sortTasks(unsorted).map((t) => t.id);
	eq(sorted, ["allday-1", "allday-2", "timed-2", "timed-1"], "sortTasks: all-day first (stable), then chronological");
}

{
	const compact = buildSectionBodyLines(["- a", "- b"], [], "compact");
	eq(compact, ["", "- a", "- b"], "compact spacing still gets one leading blank line after the heading, but none between items");
	const spacious = buildSectionBodyLines(["- a", "- b"], [], "spacious");
	eq(spacious, ["", "- a", "", "- b"], "spacious spacing inserts a blank line after the heading AND between items");
	const withForeign = buildSectionBodyLines(["- a"], ["Some other note."], "compact");
	eq(withForeign, ["", "- a", "", "Some other note."], "foreign lines are preserved after a separating blank line, heading gap still present");
	const empty = buildSectionBodyLines([], [], "compact");
	eq(empty, [], "a genuinely empty section has no lines at all, not just a lone blank line");
}

{
	const file = ["# Day", "", "## Events", "- 09:00 - 10:00 Old", "## Tasks", "- [ ] Old task"];
	const updated = replaceSectionBody(file, "## Events", ["- 11:00 - 12:00 New"]);
	eq(updated, ["# Day", "", "## Events", "- 11:00 - 12:00 New", "## Tasks", "- [ ] Old task"], "replaceSectionBody only touches the targeted section's body");
}
{
	const file = ["# Day", "", "## Events", "- 09:00 - 10:00 Old"];
	const updated = replaceSectionBody(file, "## Tasks", ["- [ ] New task"]);
	eq(updated, ["# Day", "", "## Events", "- 09:00 - 10:00 Old", "", "## Tasks", "- [ ] New task"], "replaceSectionBody appends a missing section at EOF");
}

{
	const roundtrip = linesToContent(contentToLines("a\r\nb\nc\rd"));
	eq(roundtrip, "a\nb\nc\nd", "contentToLines/linesToContent normalises CRLF/CR to LF");
}

// -------------------------------------------------------------- colour rules

{
	const rules: ColorRule[] = [
		{ id: "1", tags: ["work", "meeting"], color: "purple" },
		{ id: "2", tags: ["work"], color: "blue" },
		{ id: "3", tags: ["meeting"], color: "red" },
	];
	eq(resolveColor(["work", "meeting"], rules, "grey"), "purple", "combination rule beats single-tag rules");
	eq(resolveColor(["work"], rules, "grey"), "blue", "single work tag matches work rule");
	eq(resolveColor(["meeting"], rules, "grey"), "red", "single meeting tag matches meeting rule");
	eq(resolveColor([], rules, "grey"), "grey", "no tags falls back to default colour");
	eq(resolveColor(["personal"], rules, "grey"), "grey", "unmatched tag falls back to default colour");
}
{
	// tie-break: two equally-specific rules, order in the list decides
	const rules: ColorRule[] = [
		{ id: "1", tags: ["a"], color: "first" },
		{ id: "2", tags: ["a"], color: "second" },
	];
	eq(resolveColor(["a"], rules, "grey"), "first", "tie between equally-specific rules goes to the earlier one");
}

// ------------------------------------------------------------- overlap layout

{
	const result = layoutOverlaps([
		{ id: "x", startMin: 9 * 60, endMin: 10 * 60 },
		{ id: "y", startMin: 9 * 60 + 30, endMin: 10 * 60 + 30 },
	]);
	const x = result.find((r) => r.id === "x")!;
	const y = result.find((r) => r.id === "y")!;
	eq(x.totalCols, 2, "two overlapping events split into 2 columns");
	eq(y.totalCols, 2, "both members of the cluster report the same totalCols");
	ok(x.col !== y.col, "overlapping events get distinct columns");
}
{
	const result = layoutOverlaps([
		{ id: "a", startMin: 9 * 60, endMin: 10 * 60 },
		{ id: "b", startMin: 11 * 60, endMin: 12 * 60 },
	]);
	ok(result.every((r) => r.totalCols === 1), "non-overlapping events each get their own single column");
}
{
	const result = layoutOverlaps([
		{ id: "a", startMin: 9 * 60, endMin: 11 * 60 },
		{ id: "b", startMin: 9 * 60 + 15, endMin: 10 * 60 },
		{ id: "c", startMin: 9 * 60 + 30, endMin: 10 * 60 + 30 },
	]);
	ok(result.every((r) => r.totalCols === 3), "three mutually-overlapping events split into 3 columns");
	const cols = new Set(result.map((r) => r.col));
	eq(cols.size, 3, "each of the three gets a distinct column index");
}

// ----------------------------------------------------------------- dateUtils

eq(timeToMinutes(minutesToTime(725)), 725, "time <-> minutes round trip");
eq(parseTimeString("9:5"), null, "parseTimeString rejects single-digit minutes (not a valid HH:MM)");
eq(parseTimeString("09:05"), { hour: 9, minute: 5 }, "parseTimeString accepts zero-padded HH:MM");
eq(parseTimeString("24:00"), null, "parseTimeString rejects hour 24");

eq(formatTimeOfDay({ hour: 12, minute: 0 }, "12h"), "Midday", "12:00 PM displays as Midday in 12h format");
eq(formatTimeOfDay({ hour: 0, minute: 0 }, "12h"), "Midnight", "12:00 AM displays as Midnight in 12h format");
eq(formatTimeOfDay({ hour: 12, minute: 30 }, "12h"), "12:30 PM", "12:30 PM is unaffected (not exactly Midday)");
eq(formatTimeOfDay({ hour: 12, minute: 0 }, "24h"), "12:00", "24h format is never affected by the Midday/Midnight special-case");

{
	const weeks = getMonthGridWeeks(fromDateKey("2026-02-01"), 1); // Monday-first, Feb 2026
	ok(weeks.every((w) => w.length === 7), "every grid week has 7 days");
	eq(dateKey(weeks[0][0]).slice(5), "01-26", "Feb 2026 grid starts on preceding Monday (Jan 26)");
	const last = weeks[weeks.length - 1];
	ok(last[6].isSameOrAfter(fromDateKey("2026-02-28"), "day"), "grid covers through the last day of the month");
}
{
	const week = getWeekDates(fromDateKey("2026-09-15"), 1);
	eq(week.length, 7, "getWeekDates returns 7 dates");
	eq(dateKey(week[0]), "2026-09-14", "week starting Monday for a Tuesday anchor");
}
{
	const merged = sortMixedSection([
		{ id: "1", kind: "event", allDay: false, start: { hour: 9, minute: 0 }, end: { hour: 10, minute: 0 } } as any,
		{ id: "2", kind: "task", allDay: true, time: null } as any,
		{ id: "3", kind: "task", allDay: false, time: { hour: 8, minute: 0 } } as any,
	]).map((i: any) => i.id);
	eq(merged, ["2", "3", "1"], "unified section: all-day first, then chronological across events+tasks");
}

// --------------------------------------------------------------------- done

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
