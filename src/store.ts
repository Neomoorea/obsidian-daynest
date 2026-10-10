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
	/** Serialize read-modify-write mutations to prevent racing drags from overwriting each other. */
	private mutationTail: Promise<void> = Promise.resolve();
	private mutationActive = false;
	private deferredRefreshPaths = new Set<string>();
	private deferredFullRefresh = false;

	constructor(private app: App, private getSettings: () => CalendarSettings) {}

	private runMutation<T>(work: () => Promise<T>): Promise<T> {
		const result = this.mutationTail.then(async () => {
			this.mutationActive = true;
			try {
				return await work();
			} finally {
				// Vault create/modify events raised by this mutation (including each
				// half of a cross-day move) are deferred until all writes and any
				// rollback have finished. One final notification means views never
				// render the intermediate state where the source is gone but the
				// destination has not been written yet.
				this.mutationActive = false;
				if (this.deferredFullRefresh) {
					this.cache.clear();
				} else {
					for (const path of this.deferredRefreshPaths) this.cache.delete(path);
				}
				this.deferredRefreshPaths.clear();
				const fullRefresh = this.deferredFullRefresh;
				this.deferredFullRefresh = false;
				this.emitChange(fullRefresh);
			}
		});
		// A rejected write must not block later user actions.
		this.mutationTail = result.then(() => undefined, () => undefined);
		return result;
	}

	onChange(fn: Listener): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	private emitChange(fullRebuild: boolean): void {
		for (const l of this.listeners) l(fullRebuild);
	}

	/** Called by main.ts's vault event listeners when a file changes outside our own writes. */
	refresh(path?: string): void {
		if (this.mutationActive) {
			// Internal vault events are noisy during a move. Defer all of them
			// until the serialized mutation reaches its final, consistent state.
			if (path) this.deferredRefreshPaths.add(path);
			else this.deferredFullRefresh = true;
			return;
		}
		if (path) this.cache.delete(path);
		this.emitChange(false);
	}

	/** Called after settings change — working hours, headings, etc. all affect parsing. */
	invalidateAll(): void {
		if (this.mutationActive) {
			this.deferredFullRefresh = true;
			return;
		}
		this.cache.clear();
		this.emitChange(true);
	}

	// ---------------------------------------------------------------- reading

	private idFor(filePath: string, section: ManagedSection, rawLine: string, occurrence: number): string {
		// Positional IDs break as soon as an event is re-sorted. Dragging then
		// searches for the old index, can replace a different event, or can fail
		// to remove the source row during a cross-day move. Identify the row by
		// its exact Markdown line instead; occurrence disambiguates identical
		// lines without injecting plugin metadata into the user's note.
		return JSON.stringify([filePath, section, rawLine, occurrence]);
	}

	private findItemIndex<T extends CalendarItem>(items: T[], original: T): number {
		let index = items.findIndex((item) => item.id === original.id && item.kind === original.kind);
		if (index >= 0) return index;

		// The row may have been re-serialized (e.g. times were zero-padded) since
		// this view rendered it. Exact raw text remains the safest fallback.
		index = items.findIndex((item) => item.kind === original.kind && item.rawLine === original.rawLine);
		if (index >= 0) return index;

		// Last resort for a stale render after a harmless normalization. Never
		// append on a miss: doing so turns an identity mismatch into a duplicate.
		return items.findIndex((item) => {
			if (item.kind !== original.kind || item.title !== original.title || item.allDay !== original.allDay) return false;
			if (item.kind === "event" && original.kind === "event") {
				return item.start.hour === original.start.hour && item.start.minute === original.start.minute &&
					item.end.hour === original.end.hour && item.end.minute === original.end.minute;
			}
			if (item.kind === "task" && original.kind === "task") {
				return item.completed === original.completed &&
					(item.time?.hour ?? null) === (original.time?.hour ?? null) &&
					(item.time?.minute ?? null) === (original.time?.minute ?? null);
			}
			return false;
		});
	}

	private missingItemError(item: CalendarItem): Error {
		return new Error(`Daynest could not safely find “${item.title}” in ${item.filePath}. No change was made, to avoid duplicating or deleting the wrong item. Refresh the calendar and try again.`);
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
			const occurrences = new Map<string, number>();
			parsed.items.forEach((item) => {
				const occurrence = occurrences.get(item.rawLine) ?? 0;
				occurrences.set(item.rawLine, occurrence + 1);
				const id = this.idFor(file.path, label, item.rawLine, occurrence);
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
	}

	private async loadEditableLists(
		date: Moment
	): Promise<{ file: TFile; events: CalendarEventItem[]; tasks: CalendarTaskItem[] }> {
		const file = await ensureDailyNote(this.app, date);
		const { events, tasks } = await this.loadListsForFile(file);
		return { file, events, tasks };
	}

	createEvent(
		date: Moment,
		data: { title: string; start: TimeOfDay; end: TimeOfDay; allDay: boolean; tags?: string[] }
	): Promise<void> {
		return this.runMutation(() => this.createEventUnlocked(date, data));
	}

	private async createEventUnlocked(
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

	createTask(
		date: Moment,
		data: { title: string; time: TimeOfDay | null; allDay: boolean; tags?: string[]; completed?: boolean }
	): Promise<void> {
		return this.runMutation(() => this.createTaskUnlocked(date, data));
	}

	private async createTaskUnlocked(
		date: Moment,
		data: { title: string; time: TimeOfDay | null; allDay: boolean; tags?: string[]; completed?: boolean }
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
			completed: data.completed ?? false,
		});
		await this.writeFile(file, events, tasks, settings);
	}

	updateEvent(
		original: CalendarEventItem,
		changes: Partial<{ title: string; start: TimeOfDay; end: TimeOfDay; allDay: boolean; tags: string[]; date: Moment }>
	): Promise<void> {
		return this.runMutation(() => this.updateEventUnlocked(original, changes));
	}

	private async updateEventUnlocked(
		original: CalendarEventItem,
		changes: Partial<{ title: string; start: TimeOfDay; end: TimeOfDay; allDay: boolean; tags: string[]; date: Moment }>
	): Promise<void> {
		const settings = this.getSettings();
		const newDateKey = changes.date ? dateKey(changes.date) : original.date;
		const merged: CalendarEventItem = { ...original, ...changes, date: newDateKey };

		if (newDateKey === original.date) {
			const file = await this.getFile(original.filePath);
			const { events, tasks } = await this.loadListsForFile(file);
			const idx = this.findItemIndex(events, original);
			if (idx === -1) throw this.missingItemError(original);
			events[idx] = merged;
			await this.writeFile(file, events, tasks, settings);
		} else {
			const oldFile = await this.getFile(original.filePath);
			const oldLists = await this.loadListsForFile(oldFile);
			const oldIndex = this.findItemIndex(oldLists.events, original);
			if (oldIndex === -1) throw this.missingItemError(original);
			const originalIndex = oldIndex;
			oldLists.events.splice(oldIndex, 1);
			await this.writeFile(oldFile, oldLists.events, oldLists.tasks, settings);

			try {
				const newFile = await ensureDailyNote(this.app, changes.date as Moment);
				const newLists = await this.loadListsForFile(newFile);
				newLists.events.push({ ...merged, filePath: newFile.path });
				await this.writeFile(newFile, newLists.events, newLists.tasks, settings);
			} catch (moveError) {
				try {
					const rollbackLists = await this.loadListsForFile(oldFile);
					rollbackLists.events.splice(Math.min(originalIndex, rollbackLists.events.length), 0, original);
					await this.writeFile(oldFile, rollbackLists.events, rollbackLists.tasks, settings);
				} catch (rollbackError) {
					console.error("Daynest: failed to roll back an event move; check both Daily Notes", rollbackError);
				}
				throw moveError;
			}
		}
	}

	updateTask(
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
		return this.runMutation(() => this.updateTaskUnlocked(original, changes));
	}

	private async updateTaskUnlocked(
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
			const idx = this.findItemIndex(tasks, original);
			if (idx === -1) throw this.missingItemError(original);
			tasks[idx] = merged;
			await this.writeFile(file, events, tasks, settings);
		} else {
			const oldFile = await this.getFile(original.filePath);
			const oldLists = await this.loadListsForFile(oldFile);
			const oldIndex = this.findItemIndex(oldLists.tasks, original);
			if (oldIndex === -1) throw this.missingItemError(original);
			const originalIndex = oldIndex;
			oldLists.tasks.splice(oldIndex, 1);
			await this.writeFile(oldFile, oldLists.events, oldLists.tasks, settings);

			try {
				const newFile = await ensureDailyNote(this.app, changes.date as Moment);
				const newLists = await this.loadListsForFile(newFile);
				newLists.tasks.push({ ...merged, filePath: newFile.path });
				await this.writeFile(newFile, newLists.events, newLists.tasks, settings);
			} catch (moveError) {
				try {
					const rollbackLists = await this.loadListsForFile(oldFile);
					rollbackLists.tasks.splice(Math.min(originalIndex, rollbackLists.tasks.length), 0, original);
					await this.writeFile(oldFile, rollbackLists.events, rollbackLists.tasks, settings);
				} catch (rollbackError) {
					console.error("Daynest: failed to roll back a task move; check both Daily Notes", rollbackError);
				}
				throw moveError;
			}
		}
	}

	async toggleTaskCompleted(item: CalendarTaskItem): Promise<void> {
		await this.updateTask(item, { completed: !item.completed });
	}

	deleteItem(item: CalendarItem): Promise<void> {
		return this.runMutation(() => this.deleteItemUnlocked(item));
	}

	private async deleteItemUnlocked(item: CalendarItem): Promise<void> {
		const settings = this.getSettings();
		const file = await this.getFile(item.filePath);
		const { events, tasks } = await this.loadListsForFile(file);
		if (item.kind === "event") {
			const index = this.findItemIndex(events, item);
			if (index === -1) throw this.missingItemError(item);
			events.splice(index, 1);
			await this.writeFile(file, events, tasks, settings);
		} else {
			const index = this.findItemIndex(tasks, item);
			if (index === -1) throw this.missingItemError(item);
			tasks.splice(index, 1);
			await this.writeFile(file, events, tasks, settings);
		}
	}
}

export function dateFromKeyOrMoment(d: string | Moment): Moment {
	return typeof d === "string" ? fromDateKey(d) : d;
}
