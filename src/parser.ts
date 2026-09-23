// A deliberately strict parser: only the four documented syntaxes are ever
// recognised as calendar items. Everything else is left untouched and is
// reported back as a "foreign" line so the writer can preserve it.

import { CalendarEventItem, CalendarTaskItem, TimeOfDay } from "./types";
import { timeToMinutes } from "./dateUtils";

export type ParsedItem =
	| Omit<CalendarEventItem, "id" | "date" | "filePath" | "section">
	| Omit<CalendarTaskItem, "id" | "date" | "filePath" | "section">;

// "- [ ] 15:30 Buy groceries #personal"  or  "- [x] Buy milk"
const TASK_RE = /^\s*-\s*\[([ xX])\]\s*(?:(\d{1,2}):(\d{2})\s+)?(.*)$/;
// "- 09:00 - 10:00 Team meeting #work"
const EVENT_RE = /^\s*-\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s+(.+)$/;
const TAG_RE = /#([^\s#\[\]()]+)/g;

function extractTags(title: string): string[] {
	const tags: string[] = [];
	let m: RegExpExecArray | null;
	TAG_RE.lastIndex = 0;
	while ((m = TAG_RE.exec(title))) {
		tags.push(m[1].toLowerCase());
	}
	return tags;
}

function validTime(h: number, m: number): boolean {
	return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/**
 * Parse a single Markdown line. Returns null if the line does not match one
 * of the four documented calendar syntaxes exactly — such lines are ordinary
 * Markdown and must be preserved verbatim by the caller.
 */
export function parseLine(
	line: string,
	workingHoursStart: TimeOfDay,
	workingHoursEnd: TimeOfDay
): ParsedItem | null {
	const taskMatch = TASK_RE.exec(line);
	if (taskMatch) {
		const [, box, hStr, mStr, rest] = taskMatch;
		const completed = box.toLowerCase() === "x";

		let time: TimeOfDay | null = null;
		let titleSource = rest;
		if (hStr !== undefined && mStr !== undefined) {
			const h = parseInt(hStr, 10);
			const m = parseInt(mStr, 10);
			if (validTime(h, m)) {
				time = { hour: h, minute: m };
			} else {
				// Not a real clock time (e.g. "99:99") — the digits were part of
				// the title, not a time prefix. Re-derive the title from the
				// original line so nothing is lost.
				const fallback = /^\s*-\s*\[[ xX]\]\s*(.*)$/.exec(line);
				titleSource = fallback ? fallback[1] : rest;
			}
		}

		const title = titleSource.trim();
		if (title.length === 0) return null; // an empty checkbox isn't a usable task

		return {
			kind: "task",
			allDay: time === null,
			time,
			completed,
			title,
			tags: extractTags(title),
			rawLine: line,
		};
	}

	const eventMatch = EVENT_RE.exec(line);
	if (eventMatch) {
		const [, sh, sm, eh, em, rest] = eventMatch;
		const startH = parseInt(sh, 10);
		const startM = parseInt(sm, 10);
		const endH = parseInt(eh, 10);
		const endM = parseInt(em, 10);
		if (!validTime(startH, startM) || !validTime(endH, endM)) return null;

		const title = rest.trim();
		if (title.length === 0) return null;

		const start: TimeOfDay = { hour: startH, minute: startM };
		const end: TimeOfDay = { hour: endH, minute: endM };
		const allDay =
			timeToMinutes(start) === timeToMinutes(workingHoursStart) &&
			timeToMinutes(end) === timeToMinutes(workingHoursEnd);

		return {
			kind: "event",
			allDay,
			start,
			end,
			title,
			tags: extractTags(title),
			rawLine: line,
		};
	}

	return null;
}

export interface SectionBody {
	items: ParsedItem[];
	/** Non-blank lines inside the section that aren't recognised calendar syntax. */
	foreignLines: string[];
}

export function parseManagedSectionBody(
	bodyLines: string[],
	workingHoursStart: TimeOfDay,
	workingHoursEnd: TimeOfDay
): SectionBody {
	const items: ParsedItem[] = [];
	const foreignLines: string[] = [];
	for (const line of bodyLines) {
		if (line.trim().length === 0) continue; // blank lines are formatting only
		const parsed = parseLine(line, workingHoursStart, workingHoursEnd);
		if (parsed) items.push(parsed);
		else foreignLines.push(line);
	}
	return { items, foreignLines };
}

export interface SectionRange {
	/** Index of the heading line itself. */
	headingIndex: number;
	/** First line index belonging to the section body. */
	bodyStart: number;
	/** Exclusive end index of the section body (next heading, or EOF). */
	bodyEnd: number;
}

function normalizeHeading(s: string): string {
	return s.trim().replace(/\s+/g, " ");
}

/** A section runs from its heading line until the next ATX heading (any level) or EOF. */
export function findSection(fileLines: string[], headingText: string): SectionRange | null {
	const target = normalizeHeading(headingText);
	for (let i = 0; i < fileLines.length; i++) {
		if (normalizeHeading(fileLines[i]) === target) {
			let end = fileLines.length;
			for (let j = i + 1; j < fileLines.length; j++) {
				if (/^ {0,3}#+\s/.test(fileLines[j])) {
					end = j;
					break;
				}
			}
			return { headingIndex: i, bodyStart: i + 1, bodyEnd: end };
		}
	}
	return null;
}

/** Extracts the first wikilink target ("Note" from "[[Note|Alias]]") in a title, if any. */
export function firstWikilinkTarget(title: string): string | null {
	const m = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/.exec(title);
	return m ? m[1].trim() : null;
}

/**
 * Renders a title for display: every "[[Note]]" or "[[Note|Alias]]" becomes
 * plain text (the alias, or the note name) with the bracket syntax hidden.
 * The stored/edited title is untouched — this is purely a display transform.
 */
export function displayTitle(title: string): string {
	return title.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) =>
		(alias ?? target).trim()
	);
}
