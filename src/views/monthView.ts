import { setIcon } from "obsidian";
import type { Moment } from "moment";
import { CalendarItem, CalendarSettings } from "../types";
import { dateKey, getMonthGridWeeks, isToday, orderedWeekdayShortNames, weekNumber } from "../dateUtils";
import {
	CalendarHost,
	CalendarSubView,
	duplicateItem,
	moveItemToDate,
	renderItemChip,
	shouldHideWeekends,
	showEmptyContextMenu,
	showItemContextMenu,
	handleCalendarAction,
} from "./shared";

const MAX_VISIBLE_ITEMS = 4;

export class MonthView implements CalendarSubView {
	private itemsById = new Map<string, CalendarItem>();
	private listsByDate = new Map<string, HTMLElement>();
	private lastContainer: HTMLElement | null = null;
	private lastAnchor: Moment | null = null;
	private lastHideWeekend: boolean | null = null;

	constructor(private host: CalendarHost) {}

	async render(container: HTMLElement, anchor: Moment): Promise<void> {
		const settings = this.host.getSettings();
		this.lastContainer = container;
		this.lastAnchor = anchor.clone();

		const weeks = getMonthGridWeeks(anchor, settings.firstDayOfWeek);
		const itemsByDate = await this.host.store.getItemsForRange(weeks[0][0], weeks[weeks.length - 1][6]);
		// Build a complete replacement off-DOM and swap it in only after the data
		// and markup are ready. In particular, revealing/hiding weekend columns
		// during a move must not blank the entire Daynest tab while notes load.
		this.listsByDate.clear();
		this.itemsById.clear();
		const root = document.createElement("div");
		root.addClass("dc-month");
		itemsByDate.forEach((items) => items.forEach((it) => this.itemsById.set(it.id, it)));

		const ownMonthDates = weeks.flat().filter((d) => d.month() === anchor.month());
		const hideWeekend = shouldHideWeekends(settings.showWeekendsMonth, ownMonthDates, itemsByDate);
		this.lastHideWeekend = hideWeekend;
		const dayNames = orderedWeekdayShortNames(settings.firstDayOfWeek);

		const headerRow = root.createDiv({ cls: "dc-month-row dc-month-headerrow" });
		if (settings.showWeekNumbers) headerRow.createDiv({ cls: "dc-month-weeknum-cell" });
		dayNames.forEach((name, i) => {
			const dow = (settings.firstDayOfWeek + i) % 7;
			if (hideWeekend && (dow === 0 || dow === 6)) return;
			headerRow.createDiv({ cls: "dc-month-headercell", text: name });
		});

		const grid = root.createDiv({ cls: "dc-month-grid" });
		grid.style.setProperty("--dc-month-rows", String(weeks.length));
		weeks.forEach((week) => {
			const row = grid.createDiv({ cls: "dc-month-row" });
			if (settings.showWeekNumbers) {
				row.createDiv({ cls: "dc-month-weeknum-cell", text: String(weekNumber(week[0])) });
			}
			week.forEach((date) => {
				const dow = date.day();
				if (hideWeekend && (dow === 0 || dow === 6)) return;
				this.renderDayCell(row, date, anchor, itemsByDate.get(dateKey(date)) ?? [], settings);
			});
		});
		container.replaceChildren(root);
	}

	/**
	 * Data-only refresh: replace the contents of individual day item lists,
	 * never the month root or CalendarView body. A move can write multiple
	 * Daily Notes, and rebuilding the whole view for each notification made
	 * the entire tab visibly flash.
	 */
	async refresh(): Promise<void> {
		if (!this.lastContainer || !this.lastAnchor) return;
		const container = this.lastContainer;
		const anchor = this.lastAnchor.clone();
		const settings = this.host.getSettings();
		const weeks = getMonthGridWeeks(anchor, settings.firstDayOfWeek);
		const itemsByDate = await this.host.store.getItemsForRange(weeks[0][0], weeks[weeks.length - 1][6]);

		const ownMonthDates = weeks.flat().filter((date) => date.month() === anchor.month());
		const hideWeekend = shouldHideWeekends(settings.showWeekendsMonth, ownMonthDates, itemsByDate);
		if (hideWeekend !== this.lastHideWeekend) {
			// The set of rendered columns itself changed (e.g. the first item was
			// moved onto a weekend); rebuild only the month subview, not its tab.
			await this.render(container, anchor);
			return;
		}

		this.itemsById.clear();
		itemsByDate.forEach((items) => items.forEach((item) => this.itemsById.set(item.id, item)));
		weeks.flat().forEach((date) => {
			const list = this.listsByDate.get(dateKey(date));
			if (!list) return; // hidden weekend column
			this.renderCellItems(list, date, itemsByDate.get(dateKey(date)) ?? [], settings);
		});
	}

	private renderDayCell(
		row: HTMLElement,
		date: Moment,
		monthAnchor: Moment,
		items: CalendarItem[],
		settings: CalendarSettings
	): void {
		const inMonth = date.month() === monthAnchor.month();
		const cell = row.createDiv({ cls: "dc-month-cell" });
		if (!inMonth) cell.addClass("dc-outside-month");
		if (isToday(date)) cell.addClass("dc-is-today");
		if (settings.weekendShading && (date.day() === 0 || date.day() === 6)) cell.addClass("dc-weekend");

		cell.addEventListener("dragover", (e) => {
			e.preventDefault();
			cell.addClass("dc-drop-target");
		});
		cell.addEventListener("dragleave", () => cell.removeClass("dc-drop-target"));
		cell.addEventListener("drop", (e) => {
			e.preventDefault();
			cell.removeClass("dc-drop-target");
			const id = e.dataTransfer?.getData("text/dc-item-id");
			const item = id ? this.itemsById.get(id) : undefined;
			if (item && item.date !== dateKey(date)) handleCalendarAction("move that item", moveItemToDate(this.host.store, item, date));
		});

		const headerEl = cell.createDiv({ cls: "dc-month-cell-header" });
		const badge = headerEl.createDiv({ cls: "dc-day-badge", text: String(date.date()) });
		badge.addEventListener("click", (e) => {
			e.stopPropagation();
			void this.host.openDailyNote(date);
		});
		const addBtn = headerEl.createDiv({ cls: "dc-add-btn", attr: { "aria-label": "Add event" } });
		setIcon(addBtn, "plus");
		addBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.host.openEventCreate(date, { allDay: true });
		});

		const list = cell.createDiv({ cls: "dc-month-cell-items" });
		this.listsByDate.set(dateKey(date), list);
		this.renderCellItems(list, date, items, settings);

		cell.addEventListener("click", () => void this.host.openDailyNote(date));

		// Right-click on the day number or empty space: there's no time axis in
		// this view, so this is always a whole-day action.
		cell.addEventListener("contextmenu", (e) =>
			showEmptyContextMenu(e, {
				onNewEvent: () => this.host.openEventCreate(date, { allDay: true }),
				onPaste: this.host.peekClipboard() ? () => void this.host.pasteClipboardAt(date) : undefined,
			})
		);
	}

	private renderCellItems(list: HTMLElement, date: Moment, items: CalendarItem[], settings: CalendarSettings): void {
		list.empty();
		const sorted = [...items].sort((a, b) => {
			if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
			const ta = a.kind === "event" ? a.start : a.time ?? { hour: 0, minute: 0 };
			const tb = b.kind === "event" ? b.start : b.time ?? { hour: 0, minute: 0 };
			return ta.hour * 60 + ta.minute - (tb.hour * 60 + tb.minute);
		});

		sorted.slice(0, MAX_VISIBLE_ITEMS).forEach((item) => {
			const chip = renderItemChip(this.host, item, settings);
			chip.addEventListener("contextmenu", (e) => this.showItemMenu(e, item, date));
			list.appendChild(chip);
		});

		if (sorted.length > MAX_VISIBLE_ITEMS) {
			const more = list.createDiv({ cls: "dc-more-link", text: `+${sorted.length - MAX_VISIBLE_ITEMS} more` });
			more.addEventListener("click", (e) => {
				e.stopPropagation();
				this.host.goTo(date, "day");
			});
		}
	}

	private showItemMenu(e: MouseEvent, item: CalendarItem, date: Moment): void {
		showItemContextMenu(e, {
			onNewEvent: () => this.host.openEventCreate(date, { allDay: true }),
			onEdit: () => (item.kind === "event" ? this.host.openEventEdit(item) : this.host.openTaskEdit(item)),
			onDuplicate: () => duplicateItem(this.host, item),
			onCopy: () => this.host.copyItemToClipboard(item),
			onPaste: this.host.peekClipboard() ? () => void this.host.pasteClipboardAt(date) : undefined,
			onDelete: () => handleCalendarAction("delete that item", this.host.store.deleteItem(item)),
		});
	}
}
