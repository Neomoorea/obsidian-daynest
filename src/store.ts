import { App, TFile } from "obsidian";
import type { Moment } from "moment";
import {
	CalendarEventItem,
	CalendarItem,
	CalendarSettings,
	CalendarTaskItem,
	ManagedSection,
	TimeOfDay,
} from "./types";
import { dateKey, fromDateKey } from "./dateUtils";
import { findSection, parseManagedSectionBody } from "./parser";
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
} from "./writer";
import { ensureDailyNote, findDailyNote, getDateFromFile } from "./dailyNotes";

/** `fullRebuild` is true for a settings change (working hours, scale, first
 * day of week, etc. can all affect structure, not just data) and false for
 * an ordinary data change, letting a view choose to update in place. */
type Listener = (fullRebuild: boolean) => void;

interface FileCacheEntry {
	mtime: number;
	events: CalendarEventItem[];
	tasks: CalendarTaskItem[];
}

/**
 * Owns every read and write against Daily Notes. Views never touch the
 * vault directly — they go through here, so parsing/sorting/writing rules
 * stay in exactly one place.
 */
export class CalendarStore {
	private cache = new Map<string, FileCacheEntry>();
	private listeners = new Set<Listener>();

	constructor(private app: App, private getSettings: () => CalendarSettings) {}

	onChange(fn: Listener): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	private emitChange(fullRebuild: boolean): void {
		for (const l of this.listeners) l(fullRebuild);
	}

	/** Called by main.ts's vault event listeners when a file changes outside our own writes. */
	refresh(path?: string): void {
		if (path) this.cache.delete(path);
		this.emitChange(false);
	}

	/** Called after settings change — working hours, headings, etc. all affect parsing. */
	invalidateAll(): void {
		this.cache.clear();
		this.emitChange(true);
	}

	// ---------------------------------------------------------------- reading

	private idFor(filePath: string, section: ManagedSection, index: number): string {
		return `${filePath}::${section}::${index}`;
	}

	private parseFile(
		file: TFile,
		content: string,
		settings: CalendarSettings
	): { events: CalendarEventItem[]; tasks: CalendarTaskItem[] } {
		const date = getDateFromFile(this.app, file);
		if (!date) return { events: [], tasks: [] };
		const key = dateKey(date);
		const lines = contentToLines(content);

		const events: CalendarEventItem[] = [];
		const tasks: CalendarTaskItem[] = [];

		// Recognition is grammar-based, not heading-based: a checkbox line found
		// under the Events heading is still a task (and vice versa). Anything
		// misfiled like this is relocated to its correct heading next time this
		// file is written, so nothing is ever silently dropped.
		const scanSection = (headingText: string, label: ManagedSection) => {
			const range = findSection(lines, headingText);
			if (!range) return;
			const body = lines.slice(range.bodyStart, range.bodyEnd);
			const parsed = parseManagedSectionBody(body, settings.workingHoursStart, settings.workingHoursEnd);
			parsed.items.forEach((item, i) => {
				const id = this.idFor(file.path, label, i);
				if (item.kind === "event") {
					events.push({ ...item, id, date: key, filePath: file.path, section: label });
				} else {
					tasks.push({ ...item, id, date: key, filePath: file.path, section: label });
				}
			});
		};

		if (settings.separateTaskSection) {
			scanSection(settings.eventsHeading, "events");
			if (settings.tasksHeading.trim() !== settings.eventsHeading.trim()) {
				scanSection(settings.tasksHeading, "tasks");
			}
		} else {
			scanSection(settings.eventsHeading, "events");
		}

		return { events, tasks };
	}

	private async getParsedFile(file: TFile): Promise<{ events: CalendarEventItem[]; tasks: CalendarTaskItem[] }> {
		const cached = this.cache.get(file.path);
		if (cached && cached.mtime === file.stat.mtime) {
			return { events: cached.events, tasks: cached.tasks };
		}
		const content = await this.app.vault.read(file);
		const parsed = this.parseFile(file, content, this.getSettings());
		this.cache.set(file.path, { mtime: file.stat.mtime, events: parsed.events, tasks: parsed.tasks });
		return parsed;
	}

	async getItemsForDate(date: Moment): Promise<CalendarItem[]> {
		const file = findDailyNote(this.app, date);
		if (!file) return [];
		const { events, tasks } = await this.getParsedFile(file);
		return [...events, ...tasks];
	}

	async getItemsForRange(start: Moment, end: Moment): Promise<Map<string, CalendarItem[]>> {
		const dates: Moment[] = [];
		const cursor = start.clone().startOf("day");
		const last = end.clone().startOf("day");
		while (cursor.isSameOrBefore(last, "day")) {
			dates.push(cursor.clone());
			cursor.add(1, "day");
		}
		const lists = await Promise.all(dates.map((d) => this.getItemsForDate(d)));
		const result = new Map<string, CalendarItem[]>();
		dates.forEach((d, i) => result.set(dateKey(d), lists[i]));
		return result;
	}

	// ---------------------------------------------------------------- writing

	private async getFile(path: string): Promise<TFile> {
		const f = this.app.vault.getAbstractFileByPath(path);
		if (f instanceof TFile) return f;
		throw new Error(`Daynest: the note at "${path}" no longer exists.`);
	}

	private async loadListsForFile(file: TFile): Promise<{ events: CalendarEventItem[]; tasks: CalendarTaskItem[] }> {
		const { events, tasks } = await this.getParsedFile(file);
		return { events: [...events], tasks: [...tasks] };
	}

	private async writeFile(
		file: TFile,
		events: CalendarEventItem[],
		tasks: CalendarTaskItem[],
		settings: CalendarSettings
	): Promise<void> {
		const content = await this.app.vault.read(file);
		let lines = contentToLines(content);

		if (settings.separateTaskSection) {
			const eventLines = sortEvents(events).map((e) =>
				formatEventLine(e, settings.workingHoursStart, settings.workingHoursEnd)
			);
			const eventsRange = findSection(lines, settings.eventsHeading);
			const eventForeign = eventsRange
				? parseManagedSectionBody(
						lines.slice(eventsRange.bodyStart, eventsRange.bodyEnd),
						settings.workingHoursStart,
						settings.workingHoursEnd
				  ).foreignLines
				: [];
			lines = replaceSectionBody(
				lines,
				settings.eventsHeading,
				buildSectionBodyLines(eventLines, eventForeign, settings.eventSpacing)
			);

			const taskLines = sortTasks(tasks).map((t) => formatTaskLine(t));
			const tasksRange = findSection(lines, settings.tasksHeading);
			const taskForeign = tasksRange
				? parseManagedSectionBody(
						lines.slice(tasksRange.bodyStart, tasksRange.bodyEnd),
						settings.workingHoursStart,
						settings.workingHoursEnd
				  ).foreignLines
				: [];
			lines = replaceSectionBody(
				lines,
				settings.tasksHeading,
				buildSectionBodyLines(taskLines, taskForeign, settings.taskSpacing)
			);
		} else {
			const merged = sortMixedSection([...events, ...tasks]);
			const mergedLines = merged.map((it) =>
				it.kind === "event"
					? formatEventLine(it, settings.workingHoursStart, settings.workingHoursEnd)
					: formatTaskLine(it)
			);
			const range = findSection(lines, settings.eventsHeading);
			const foreign = range
				? parseManagedSectionBody(
						lines.slice(range.bodyStart, range.bodyEnd),
						settings.workingHoursStart,
						settings.workingHoursEnd
				  ).foreignLines
				: [];
			lines = replaceSectionBody(
				lines,
				settings.eventsHeading,
				buildSectionBodyLines(mergedLines, foreign, settings.eventSpacing)
			);
		}

		await this.app.vault.modify(file, linesToContent(lines));
		this.cache.delete(file.path);
		this.emitChange(false);
	}

	private async loadEditableLists(
		date: Moment
	): Promise<{ file: TFile; events: CalendarEventItem[]; tasks: CalendarTaskItem[] }> {
		const file = await ensureDailyNote(this.app, date);
		const { events, tasks } = await this.loadListsForFile(file);
		return { file, events, tasks };
	}

	async createEvent(
		date: Moment,
		data: { title: string; start: TimeOfDay; end: TimeOfDay; allDay: boolean; tags?: string[] }
	): Promise<void> {
		const settings = this.getSettings();
		const { file, events, tasks } = await this.loadEditableLists(date);
		events.push({
			id: "new",
			kind: "event",
			date: dateKey(date),
			filePath: file.path,
			section: "events",
			title: data.title,
			tags: data.tags ?? [],
			rawLine: "",
			allDay: data.allDay,
			start: data.start,
			end: data.end,
		});
		await this.writeFile(file, events, tasks, settings);
	}

	async createTask(
		date: Moment,
		data: { title: string; time: TimeOfDay | null; allDay: boolean; tags?: string[] }
	): Promise<void> {
		const settings = this.getSettings();
		const { file, events, tasks } = await this.loadEditableLists(date);
		tasks.push({
			id: "new",
			kind: "task",
			date: dateKey(date),
			filePath: file.path,
			section: settings.separateTaskSection ? "tasks" : "events",
			title: data.title,
			tags: data.tags ?? [],
			rawLine: "",
			allDay: data.allDay,
			time: data.time,
			completed: false,
		});
		await this.writeFile(file, events, tasks, settings);
	}

	async updateEvent(
		original: CalendarEventItem,
		changes: Partial<{ title: string; start: TimeOfDay; end: TimeOfDay; allDay: boolean; tags: string[]; date: Moment }>
	): Promise<void> {
		const settings = this.getSettings();
		const newDateKey = changes.date ? dateKey(changes.date) : original.date;
		const merged: CalendarEventItem = { ...original, ...changes, date: newDateKey };

		if (newDateKey === original.date) {
			const file = await this.getFile(original.filePath);
			const { events, tasks } = await this.loadListsForFile(file);
			const idx = events.findIndex((e) => e.id === original.id);
			if (idx === -1) events.push(merged);
			else events[idx] = merged;
			await this.writeFile(file, events, tasks, settings);
		} else {
			const oldFile = await this.getFile(original.filePath);
			const oldLists = await this.loadListsForFile(oldFile);
			await this.writeFile(
				oldFile,
				oldLists.events.filter((e) => e.id !== original.id),
				oldLists.tasks,
				settings
			);

			const newFile = await ensureDailyNote(this.app, changes.date as Moment);
			const newLists = await this.loadListsForFile(newFile);
			newLists.events.push({ ...merged, filePath: newFile.path });
			await this.writeFile(newFile, newLists.events, newLists.tasks, settings);
		}
	}

	async updateTask(
		original: CalendarTaskItem,
		changes: Partial<{
			title: string;
			time: TimeOfDay | null;
			allDay: boolean;
			tags: string[];
			completed: boolean;
			date: Moment;
		}>
	): Promise<void> {
		const settings = this.getSettings();
		const newDateKey = changes.date ? dateKey(changes.date) : original.date;
		const merged: CalendarTaskItem = { ...original, ...changes, date: newDateKey };

		if (newDateKey === original.date) {
			const file = await this.getFile(original.filePath);
			const { events, tasks } = await this.loadListsForFile(file);
			const idx = tasks.findIndex((t) => t.id === original.id);
			if (idx === -1) tasks.push(merged);
			else tasks[idx] = merged;
			await this.writeFile(file, events, tasks, settings);
		} else {
			const oldFile = await this.getFile(original.filePath);
			const oldLists = await this.loadListsForFile(oldFile);
			await this.writeFile(
				oldFile,
				oldLists.events,
				oldLists.tasks.filter((t) => t.id !== original.id),
				settings
			);

			const newFile = await ensureDailyNote(this.app, changes.date as Moment);
			const newLists = await this.loadListsForFile(newFile);
			newLists.tasks.push({ ...merged, filePath: newFile.path });
			await this.writeFile(newFile, newLists.events, newLists.tasks, settings);
		}
	}

	async toggleTaskCompleted(item: CalendarTaskItem): Promise<void> {
		await this.updateTask(item, { completed: !item.completed });
	}

	async deleteItem(item: CalendarItem): Promise<void> {
		const settings = this.getSettings();
		const file = await this.getFile(item.filePath);
		const { events, tasks } = await this.loadListsForFile(file);
		if (item.kind === "event") {
			await this.writeFile(
				file,
				events.filter((e) => e.id !== item.id),
				tasks,
				settings
			);
		} else {
			await this.writeFile(
				file,
				events,
				tasks.filter((t) => t.id !== item.id),
				settings
			);
		}
	}
}

export function dateFromKeyOrMoment(d: string | Moment): Moment {
	return typeof d === "string" ? fromDateKey(d) : d;
}
