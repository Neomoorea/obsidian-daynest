import { setIcon } from "obsidian";
import type { Moment } from "moment";
import { CalendarItem, CalendarSettings } from "../types";
import { dateKey, getMonthGridWeeks, isToday, orderedWeekdayShortNames, weekNumber } from "../dateUtils";
import { CalendarHost, CalendarSubView, moveItemToDate, renderItemChip } from "./shared";

const MAX_VISIBLE_ITEMS = 4;

export class MonthView implements CalendarSubView {
	private itemsById = new Map<string, CalendarItem>();

	constructor(private host: CalendarHost) {}

	async render(container: HTMLElement, anchor: Moment): Promise<void> {
		const settings = this.host.getSettings();
		this.itemsById.clear();
		container.empty();
		const root = container.createDiv({ cls: "dc-month" });

		const weeks = getMonthGridWeeks(anchor, settings.firstDayOfWeek);
		const itemsByDate = await this.host.store.getItemsForRange(weeks[0][0], weeks[weeks.length - 1][6]);
		itemsByDate.forEach((items) => items.forEach((it) => this.itemsById.set(it.id, it)));

		const hideWeekend = !settings.showWeekends;
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
			if (item && item.date !== dateKey(date)) void moveItemToDate(this.host.store, item, date);
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
		const sorted = [...items].sort((a, b) => {
			if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
			const ta = a.kind === "event" ? a.start : a.time ?? { hour: 0, minute: 0 };
			const tb = b.kind === "event" ? b.start : b.time ?? { hour: 0, minute: 0 };
			return ta.hour * 60 + ta.minute - (tb.hour * 60 + tb.minute);
		});

		sorted.slice(0, MAX_VISIBLE_ITEMS).forEach((item) => list.appendChild(renderItemChip(this.host, item, settings)));

		if (sorted.length > MAX_VISIBLE_ITEMS) {
			const more = list.createDiv({ cls: "dc-more-link", text: `+${sorted.length - MAX_VISIBLE_ITEMS} more` });
			more.addEventListener("click", (e) => {
				e.stopPropagation();
				this.host.goTo(date, "day");
			});
		}

		cell.addEventListener("click", () => void this.host.openDailyNote(date));
	}
}
