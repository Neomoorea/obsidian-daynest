import type { App } from "obsidian";
import type { Moment } from "moment";
import { CalendarEventItem, CalendarItem, CalendarSettings, CalendarTaskItem, TimeOfDay, ViewMode } from "../types";
import type { CalendarStore } from "../store";
import { minutesToTime } from "../dateUtils";
import { resolveColor } from "../colorRules";
import { displayTitle, firstWikilinkTarget } from "../parser";

/**
 * Everything a sub-view (Year/Month/Week/Day) needs from the host CalendarView.
 * Keeping this as an interface — rather than passing the concrete CalendarView —
 * keeps each sub-view file decoupled from ItemView/Obsidian workspace details.
 */
export interface CalendarHost {
	app: App;
	store: CalendarStore;
	getSettings(): CalendarSettings;

	openDailyNote(date: Moment): Promise<void>;
	openLinkedNote(target: string): Promise<void>;

	openEventCreate(date: Moment, prefill?: Partial<{ start: TimeOfDay; end: TimeOfDay; allDay: boolean }>): void;
	openEventEdit(item: CalendarEventItem): void;
	openTaskCreate(date: Moment, prefill?: Partial<{ time: TimeOfDay | null; allDay: boolean }>): void;
	openTaskEdit(item: CalendarTaskItem): void;

	toggleTask(item: CalendarTaskItem): Promise<void>;

	/** Jump to a different anchor date and/or view mode (e.g. clicking a day in Year view). */
	goTo(anchor: Moment, mode: ViewMode): void;
}

export interface CalendarSubView {
	render(container: HTMLElement, anchor: Moment): void | Promise<void>;
	/**
	 * Optional lighter path for a data-only change (an item was created,
	 * moved, edited, or toggled) when the view's mode/anchor haven't changed.
	 * Should update in place — new/changed items appear or move, nothing
	 * else is torn down — so scroll position and any transient UI state
	 * survive. Views that don't implement this just get a full render().
	 */
	refresh?(): void | Promise<void>;
	/** Called when the view is torn down (mode switch, view close) — clear intervals/listeners here. */
	destroy?(): void;
}

/** Moves an item to a new date, keeping its time-of-day unchanged. Used by drag-and-drop in Month view. */
export async function moveItemToDate(store: CalendarStore, item: CalendarItem, newDate: Moment): Promise<void> {
	if (item.kind === "event") await store.updateEvent(item, { date: newDate });
	else await store.updateTask(item, { date: newDate });
}

/** Moves an item to a new date AND time, preserving an event's duration. Used by Week/Day timeline drag. */
export async function moveItemDateTime(
	store: CalendarStore,
	item: CalendarItem,
	newDate: Moment,
	newStartMin: number,
	durationMin: number
): Promise<void> {
	if (item.kind === "event") {
		await store.updateEvent(item, {
			date: newDate,
			start: minutesToTime(newStartMin),
			end: minutesToTime(newStartMin + durationMin),
		});
	} else {
		await store.updateTask(item, { date: newDate, time: minutesToTime(newStartMin) });
	}
}

/**
 * Renders a compact coloured chip for an event/task: dot-or-checkbox + label,
 * click-to-edit, Cmd/Ctrl-click-to-open-linked-note, and (by default) native
 * drag-and-drop as a move source. Shared by Month view's day cells and the
 * Week/Day timeline's all-day row so both look and behave identically.
 */
export function renderItemChip(
	host: CalendarHost,
	item: CalendarItem,
	settings: CalendarSettings,
	opts?: { draggable?: boolean }
): HTMLElement {
	const color = resolveColor(item.tags, settings.colorRules, settings.defaultEventColor);
	const chip = createDiv({ cls: "dc-pill" + (item.kind === "task" ? " dc-pill-task" : "") });
	chip.style.setProperty("--dc-item-color", color);

	if (opts?.draggable !== false) {
		chip.draggable = true;
		chip.addEventListener("dragstart", (e) => {
			e.dataTransfer?.setData("text/dc-item-id", item.id);
			if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
		});
	}

	if (item.kind === "task") {
		const check = chip.createDiv({ cls: "dc-pill-check" + (item.completed ? " is-checked" : "") });
		check.addEventListener("mousedown", (e) => e.stopPropagation());
		check.addEventListener("click", (e) => {
			e.stopPropagation();
			void host.toggleTask(item);
		});
	} else {
		chip.createDiv({ cls: "dc-pill-dot" });
	}

	const label = chip.createSpan({ cls: "dc-pill-label" });
	label.setText(displayTitle(item.title));
	if (firstWikilinkTarget(item.title)) label.addClass("dc-linked");
	if (item.kind === "task" && item.completed) label.addClass("dc-completed");

	chip.addEventListener("click", (e) => {
		e.stopPropagation();
		const linkTarget = firstWikilinkTarget(item.title);
		if ((e.metaKey || e.ctrlKey) && linkTarget) {
			void host.openLinkedNote(linkTarget);
			return;
		}
		if (item.kind === "event") host.openEventEdit(item);
		else host.openTaskEdit(item);
	});

	return chip;
}
