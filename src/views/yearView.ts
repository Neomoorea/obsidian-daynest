import type { Moment } from "moment";
import { CalendarItem, CalendarSettings } from "../types";
import { dateKey, getMonthGridWeeks, isToday, orderedWeekdayShortNames } from "../dateUtils";
import { resolveColor } from "../colorRules";
import { CalendarHost, CalendarSubView } from "./shared";

export class YearView implements CalendarSubView {
	constructor(private host: CalendarHost) {}

	async render(container: HTMLElement, anchor: Moment): Promise<void> {
		const settings = this.host.getSettings();
		container.empty();
		const root = container.createDiv({ cls: "dc-year" });

		const yearStart = anchor.clone().startOf("year");
		const yearEnd = anchor.clone().endOf("year");
		const gridStart = getMonthGridWeeks(yearStart, settings.firstDayOfWeek)[0][0];
		const lastMonthWeeks = getMonthGridWeeks(yearEnd, settings.firstDayOfWeek);
		const gridEnd = lastMonthWeeks[lastMonthWeeks.length - 1][6];
		const itemsByDate = await this.host.store.getItemsForRange(gridStart, gridEnd);

		const grid = root.createDiv({ cls: "dc-year-grid" });
		for (let m = 0; m < 12; m++) {
			const monthAnchor = anchor.clone().month(m).startOf("month");
			this.renderMiniMonth(grid, monthAnchor, itemsByDate, settings);
		}
	}

	private renderMiniMonth(
		container: HTMLElement,
		monthAnchor: Moment,
		itemsByDate: Map<string, CalendarItem[]>,
		settings: CalendarSettings
	): void {
		const box = container.createDiv({ cls: "dc-year-month" });
		const heading = box.createDiv({ cls: "dc-year-month-title", text: monthAnchor.format("MMMM") });
		heading.addEventListener("click", () => this.host.goTo(monthAnchor, "month"));

		const weeks = getMonthGridWeeks(monthAnchor, settings.firstDayOfWeek);
		const dayNames = orderedWeekdayShortNames(settings.firstDayOfWeek);
		const hideWeekend = !settings.showWeekends;

		const headerRow = box.createDiv({ cls: "dc-year-headerrow" });
		dayNames.forEach((name, i) => {
			const dow = (settings.firstDayOfWeek + i) % 7;
			if (hideWeekend && (dow === 0 || dow === 6)) return;
			headerRow.createSpan({ cls: "dc-year-headercell", text: name[0] });
		});

		weeks.forEach((week) => {
			const row = box.createDiv({ cls: "dc-year-row" });
			week.forEach((date) => {
				const dow = date.day();
				if (hideWeekend && (dow === 0 || dow === 6)) return;
				const inMonth = date.month() === monthAnchor.month();
				const cell = row.createDiv({ cls: "dc-year-cell" });
				if (!inMonth) cell.addClass("dc-outside-month");
				if (isToday(date)) cell.addClass("dc-is-today");

				cell.createDiv({ cls: "dc-year-daynum", text: String(date.date()) });

				const items = itemsByDate.get(dateKey(date)) ?? [];
				if (items.length > 0 && inMonth) {
					const dots = cell.createDiv({ cls: "dc-year-dots" });
					const colors = Array.from(
						new Set(items.map((it) => resolveColor(it.tags, settings.colorRules, settings.defaultEventColor)))
					);
					colors.slice(0, 3).forEach((c) => {
						const dot = dots.createDiv({ cls: "dc-year-dot" });
						dot.style.setProperty("--dc-item-color", c);
					});
				}
				cell.addEventListener("click", () => this.host.goTo(date, "day"));
			});
		});
	}
}
