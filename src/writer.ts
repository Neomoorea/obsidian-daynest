import { CalendarEventItem, CalendarItem, CalendarTaskItem, Spacing, TimeOfDay } from "./types";
import { formatTimeOfDay, timeToMinutes } from "./dateUtils";
import { findSection } from "./parser";

// Markdown always uses zero-padded 24h time, independent of the user's
// display "time format" setting — that setting only affects the calendar UI.
function fileTime(t: TimeOfDay): string {
	return formatTimeOfDay(t, "24h");
}

export function formatEventLine(
	item: Pick<CalendarEventItem, "allDay" | "start" | "end" | "title">,
	workingHoursStart: TimeOfDay,
	workingHoursEnd: TimeOfDay
): string {
	const start = item.allDay ? workingHoursStart : item.start;
	const end = item.allDay ? workingHoursEnd : item.end;
	return `- ${fileTime(start)} - ${fileTime(end)} ${item.title}`.trimEnd();
}

export function formatTaskLine(
	item: Pick<CalendarTaskItem, "allDay" | "time" | "completed" | "title">
): string {
	const box = item.completed ? "x" : " ";
	if (item.allDay || !item.time) {
		return `- [${box}] ${item.title}`.trimEnd();
	}
	return `- [${box}] ${fileTime(item.time)} ${item.title}`.trimEnd();
}

export function formatItemLine(
	item: CalendarItem,
	workingHoursStart: TimeOfDay,
	workingHoursEnd: TimeOfDay
): string {
	return item.kind === "event"
		? formatEventLine(item, workingHoursStart, workingHoursEnd)
		: formatTaskLine(item);
}

/** Earliest start first; equal starts break by earliest end; true ties keep original order. */
export function sortEvents<T extends { start: TimeOfDay; end: TimeOfDay }>(events: T[]): T[] {
	return [...events].sort((a, b) => {
		const byStart = timeToMinutes(a.start) - timeToMinutes(b.start);
		if (byStart !== 0) return byStart;
		return timeToMinutes(a.end) - timeToMinutes(b.end);
	});
}

/** All-day tasks first (stable), then timed tasks by start time (stable ties). */
export function sortTasks<T extends { allDay: boolean; time: TimeOfDay | null }>(tasks: T[]): T[] {
	const allDay = tasks.filter((t) => t.allDay);
	const timed = tasks
		.filter((t) => !t.allDay)
		.sort((a, b) => timeToMinutes(a.time ?? { hour: 0, minute: 0 }) - timeToMinutes(b.time ?? { hour: 0, minute: 0 }));
	return [...allDay, ...timed];
}

/**
 * Ordering for a unified Events+Tasks section (separateTaskSection = false).
 * The spec only defines ordering for events and tasks independently; this
 * extends the same "all-day first, then chronological" idea across both.
 */
export function sortMixedSection(items: CalendarItem[]): CalendarItem[] {
	const timeOf = (it: CalendarItem): number =>
		it.kind === "event" ? timeToMinutes(it.start) : timeToMinutes(it.time ?? { hour: 0, minute: 0 });
	const allDay = items.filter((it) => it.allDay);
	const timed = items.filter((it) => !it.allDay).sort((a, b) => timeOf(a) - timeOf(b));
	return [...allDay, ...timed];
}

/** Interleaves a blank line between items when spacing is "spacious", and
 * always leaves one blank line between the section's heading and its first
 * line, regardless of that setting. */
export function buildSectionBodyLines(
	formattedItemLines: string[],
	foreignLines: string[],
	spacing: Spacing
): string[] {
	const lines: string[] = [];
	formattedItemLines.forEach((line, idx) => {
		if (idx > 0 && spacing === "spacious") lines.push("");
		lines.push(line);
	});
	if (foreignLines.length > 0) {
		if (formattedItemLines.length > 0) lines.push("");
		lines.push(...foreignLines);
	}
	if (lines.length > 0) lines.unshift("");
	return lines;
}

/**
 * Replaces (or appends) a managed section's body in-place, leaving every
 * other line in the file byte-for-byte untouched.
 */
export function replaceSectionBody(
	fileLines: string[],
	headingText: string,
	newBodyLines: string[]
): string[] {
	const range = findSection(fileLines, headingText);
	if (range) {
		const before = fileLines.slice(0, range.bodyStart);
		const after = fileLines.slice(range.bodyEnd);
		return [...before, ...newBodyLines, ...after];
	}

	// Section doesn't exist yet: append it at end of file.
	const result = [...fileLines];
	while (result.length > 0 && result[result.length - 1].trim() === "") result.pop();
	if (result.length > 0) result.push("");
	result.push(headingText);
	result.push(...newBodyLines);
	return result;
}

export function linesToContent(lines: string[]): string {
	return lines.join("\n");
}

export function contentToLines(content: string): string[] {
	return content.split(/\r\n|\r|\n/);
}
