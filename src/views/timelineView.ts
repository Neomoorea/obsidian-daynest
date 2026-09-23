import { moment, setIcon } from "obsidian";
import type { Moment } from "moment";
import { CalendarEventItem, CalendarItem, CalendarSettings } from "../types";
import {
	dateKey,
	formatTimeOfDay,
	getWeekDates,
	isSameDay,
	isToday,
	minutesToTime,
	snapMinutes,
	timeToMinutes,
} from "../dateUtils";
import { displayTitle, firstWikilinkTarget } from "../parser";
import { resolveColor } from "../colorRules";
import { layoutOverlaps } from "./overlapLayout";
import { CalendarHost, CalendarSubView, moveItemDateTime, renderItemChip } from "./shared";

const SNAP_MINUTES = 15;
const MIN_BLOCK_HEIGHT_PX = 18;
const TASK_BLOCK_HEIGHT_PX = 20;

function hourHeightFor(scale: CalendarSettings["calendarScale"]): number {
	return scale === "small" ? 36 : scale === "large" ? 72 : 52;
}

/**
 * Renders one or more day columns sharing a single hour axis. Week and Day
 * view are the same engine — they only differ in how many dates are shown —
 * so all interaction logic (create/move/resize) lives here exactly once.
 *
 * render() does a full, from-scratch build (mode/date navigation). refresh()
 * is the lighter path for a data-only change: it updates the all-day row and
 * each column's blocks in place and never touches the header, hour-grid, or
 * — crucially — the scroll container itself, so scroll position is never
 * disturbed and there's no full-view flicker after a save/drag/toggle.
 */
export class TimelineBaseView implements CalendarSubView {
	private intervalId: number | null = null;

	// Retained across renders so refresh() can update in place.
	private lastDates: Moment[] | null = null;
	private lastRootEl: HTMLElement | null = null;
	private lastAllDayRowEl: HTMLElement | null = null;
	private lastColumnsEl: HTMLElement | null = null;

	constructor(private host: CalendarHost, private getDates: (anchor: Moment) => Moment[]) {}

	async render(container: HTMLElement, anchor: Moment): Promise<void> {
		this.destroy();
		const settings = this.host.getSettings();
		container.empty();

		const dates = this.getDates(anchor);
		this.lastDates = dates;
		const hourHeight = hourHeightFor(settings.calendarScale);
		const itemsByDate = await this.host.store.getItemsForRange(dates[0], dates[dates.length - 1]);

		const root = container.createDiv({ cls: "dc-timeline" });
		this.lastRootEl = root;

		// ---------------------------------------------------------------- header
		const header = root.createDiv({ cls: "dc-timeline-header" });
		header.createDiv({ cls: "dc-timeline-gutter-spacer" });
		const headerCols = header.createDiv({ cls: "dc-timeline-header-cols" });
		dates.forEach((date) => {
			const col = headerCols.createDiv({ cls: "dc-timeline-header-col" });
			if (isToday(date)) col.addClass("dc-is-today");
			if (settings.weekendShading && (date.day() === 0 || date.day() === 6)) col.addClass("dc-weekend");
			const line = col.createDiv({ cls: "dc-timeline-header-line" });
			line.createSpan({ cls: "dc-timeline-header-dow", text: date.format("ddd") });
			line.createSpan({ cls: "dc-timeline-header-num", text: String(date.date()) });
			col.addEventListener("click", () => void this.host.openDailyNote(date));
		});

		// --------------------------------------------------------------- all-day
		this.lastAllDayRowEl = this.syncAllDayRow(root, dates, itemsByDate, settings, null);

		// ------------------------------------------------------------- timeline
		const scroll = root.createDiv({ cls: "dc-timeline-scroll" });
		const grid = scroll.createDiv({ cls: "dc-timeline-grid" });
		grid.style.height = `${24 * hourHeight}px`;

		const gutter = grid.createDiv({ cls: "dc-timeline-gutter" });
		for (let h = 0; h < 24; h++) {
			const label = gutter.createDiv({ cls: "dc-timeline-hour-label" });
			label.style.top = `${h * hourHeight}px`;
			label.setText(formatTimeOfDay({ hour: h, minute: 0 }, settings.timeFormat));
		}

		const columns = grid.createDiv({ cls: "dc-timeline-columns" });
		this.lastColumnsEl = columns;
		dates.forEach((date) => {
			const col = this.buildColumnSkeleton(columns, date, dates, settings, hourHeight);
			this.populateColumnBlocks(col, columns, date, dates, itemsByDate.get(dateKey(date)) ?? [], settings, hourHeight);
		});

		if (settings.showCurrentTimeIndicator) {
			this.updateNowLine(columns, dates, hourHeight);
			this.intervalId = window.setInterval(() => this.updateNowLine(columns, dates, hourHeight), 60_000);
		}

		const showingToday = dates.some((d) => isToday(d));
		const now = moment();
		const scrollTargetMin =
			settings.autoScrollToCurrentTime && showingToday
				? now.hour() * 60 + now.minute()
				: timeToMinutes(settings.workingHoursStart);
		window.setTimeout(() => {
			scroll.scrollTop = Math.max(0, (scrollTargetMin / 60) * hourHeight - scroll.clientHeight / 3);
		}, 0);
	}

	/** Data-only change: update the all-day row and every column's blocks in
	 * place. The scroll container, header, and hour-grid are never touched. */
	async refresh(): Promise<void> {
		if (!this.lastDates || !this.lastColumnsEl || !this.lastRootEl) return;
		const settings = this.host.getSettings();
		const dates = this.lastDates;
		const hourHeight = hourHeightFor(settings.calendarScale);
		const itemsByDate = await this.host.store.getItemsForRange(dates[0], dates[dates.length - 1]);

		this.lastAllDayRowEl = this.syncAllDayRow(this.lastRootEl, dates, itemsByDate, settings, this.lastAllDayRowEl);

		const columns = this.lastColumnsEl;
		dates.forEach((date, i) => {
			const col = columns.children.item(i) as HTMLElement | null;
			if (!col) return;
			col.querySelectorAll(".dc-block").forEach((el) => el.remove());
			this.populateColumnBlocks(col, columns, date, dates, itemsByDate.get(dateKey(date)) ?? [], settings, hourHeight);
		});
	}

	destroy(): void {
		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	// ------------------------------------------------------------------ all-day

	/** Creates, repopulates, or removes the all-day row as needed, and returns its current element (or null). */
	private syncAllDayRow(
		root: HTMLElement,
		dates: Moment[],
		itemsByDate: Map<string, CalendarItem[]>,
		settings: CalendarSettings,
		existing: HTMLElement | null
	): HTMLElement | null {
		const hasAnyAllDay = dates.some((date) => (itemsByDate.get(dateKey(date)) ?? []).some((it) => it.allDay));

		if (!hasAnyAllDay) {
			existing?.remove();
			return null;
		}

		let allDayRow = existing;
		if (!allDayRow) {
			allDayRow = createDiv({ cls: "dc-timeline-allday" });
			allDayRow.createDiv({ cls: "dc-timeline-gutter-spacer", text: "All-day" });
			allDayRow.createDiv({ cls: "dc-timeline-allday-cols" });
			const header = root.querySelector(".dc-timeline-header");
			if (header?.nextSibling) root.insertBefore(allDayRow, header.nextSibling);
			else root.appendChild(allDayRow);
		}

		const allDayCols = allDayRow.querySelector(".dc-timeline-allday-cols") as HTMLElement;
		allDayCols.empty();
		dates.forEach((date) => {
			const col = allDayCols.createDiv({ cls: "dc-timeline-allday-col" });
			if (settings.weekendShading && (date.day() === 0 || date.day() === 6)) col.addClass("dc-weekend");
			const items = (itemsByDate.get(dateKey(date)) ?? []).filter((it) => it.allDay);
			items.forEach((item) => col.appendChild(renderItemChip(this.host, item, settings)));
		});

		return allDayRow;
	}

	// ------------------------------------------------------------------ columns

	private buildColumnSkeleton(
		container: HTMLElement,
		date: Moment,
		allDates: Moment[],
		settings: CalendarSettings,
		hourHeight: number
	): HTMLElement {
		const col = container.createDiv({ cls: "dc-timeline-col" });
		if (isToday(date)) col.addClass("dc-is-today");
		if (settings.weekendShading && (date.day() === 0 || date.day() === 6)) col.addClass("dc-weekend");
		col.style.width = `${100 / allDates.length}%`;

		const workStart = settings.workingHoursStart.hour;
		const workEnd = settings.workingHoursEnd.hour;
		for (let h = 0; h < 24; h++) {
			const isOffHours = h < workStart || h >= workEnd;
			const line = col.createDiv({ cls: "dc-timeline-hourline" + (isOffHours ? " dc-timeline-hourline-off" : "") });
			line.style.top = `${h * hourHeight}px`;
		}

		col.addEventListener("mousedown", (e) => {
			if (e.button !== 0 || e.target !== col) return;
			this.startCreateDrag(e, col, date, settings, hourHeight);
		});

		return col;
	}

	private populateColumnBlocks(
		col: HTMLElement,
		columnsContainer: HTMLElement,
		date: Moment,
		allDates: Moment[],
		items: CalendarItem[],
		settings: CalendarSettings,
		hourHeight: number
	): void {
		const timed = items.filter((it) => !it.allDay);
		const layoutInput = timed.map((it) => {
			const startMin = it.kind === "event" ? timeToMinutes(it.start) : timeToMinutes(it.time ?? { hour: 0, minute: 0 });
			// Tasks get a nominal 30-minute footprint purely so they don't visually
			// collide with nearby events in the column layout — they still render
			// at a fixed, minimal height (see renderBlock).
			const endMin = it.kind === "event" ? timeToMinutes(it.end) : startMin + 30;
			return { id: it.id, startMin, endMin: Math.min(1440, Math.max(endMin, startMin + 1)) };
		});
		const laidOut = layoutOverlaps(layoutInput);

		laidOut.forEach((box) => {
			const item = timed.find((it) => it.id === box.id);
			if (item) this.renderBlock(col, columnsContainer, item, box, settings, hourHeight, allDates);
		});
	}

	private renderBlock(
		col: HTMLElement,
		columnsContainer: HTMLElement,
		item: CalendarItem,
		box: { startMin: number; endMin: number; col: number; totalCols: number },
		settings: CalendarSettings,
		hourHeight: number,
		allDates: Moment[]
	): void {
		const isTask = item.kind === "task";
		const el = col.createDiv({ cls: "dc-block" + (isTask ? " dc-block-task" : "") });
		const top = (box.startMin / 60) * hourHeight;
		const height = isTask
			? TASK_BLOCK_HEIGHT_PX
			: Math.max(((box.endMin - box.startMin) / 60) * hourHeight, MIN_BLOCK_HEIGHT_PX);
		el.style.top = `${top}px`;
		el.style.height = `${height}px`;
		el.style.left = `calc(${(100 / box.totalCols) * box.col}% + 1px)`;
		el.style.width = `calc(${100 / box.totalCols}% - 2px)`;
		el.style.setProperty("--dc-item-color", resolveColor(item.tags, settings.colorRules, settings.defaultEventColor));

		const body = el.createDiv({ cls: "dc-block-body" });
		if (isTask) {
			const check = body.createDiv({ cls: "dc-pill-check" + (item.completed ? " is-checked" : "") });
			check.addEventListener("mousedown", (e) => e.stopPropagation());
			check.addEventListener("click", (e) => {
				e.stopPropagation();
				void this.host.toggleTask(item);
			});
		}
		const label = body.createSpan({ cls: "dc-block-label" });
		label.setText(displayTitle(item.title));
		if (firstWikilinkTarget(item.title)) label.addClass("dc-linked");
		if (isTask && item.completed) label.addClass("dc-completed");
		if (!isTask && height >= 34) {
			body.createDiv({
				cls: "dc-block-time",
				text: `${formatTimeOfDay(item.start, settings.timeFormat)} – ${formatTimeOfDay(item.end, settings.timeFormat)}`,
			});
		}

		body.addEventListener("click", (e) => {
			e.stopPropagation();
			const linkTarget = firstWikilinkTarget(item.title);
			if ((e.metaKey || e.ctrlKey) && linkTarget) {
				void this.host.openLinkedNote(linkTarget);
				return;
			}
			if (item.kind === "event") this.host.openEventEdit(item);
			else this.host.openTaskEdit(item);
		});
		body.addEventListener("mousedown", (e) => {
			if (e.button !== 0) return;
			e.stopPropagation();
			this.startMoveDrag(e, item, el, columnsContainer, allDates, settings, hourHeight);
		});

		if (item.kind === "event") {
			const topHandle = el.createDiv({ cls: "dc-resize-handle dc-resize-top" });
			topHandle.addEventListener("mousedown", (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.startResizeDrag(e, item, el, "top", settings, hourHeight);
			});
			const bottomHandle = el.createDiv({ cls: "dc-resize-handle dc-resize-bottom" });
			bottomHandle.addEventListener("mousedown", (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.startResizeDrag(e, item, el, "bottom", settings, hourHeight);
			});
		}
	}

	// ------------------------------------------------------------- interactions

	private createTooltip(): HTMLElement {
		return document.body.createDiv({ cls: "dc-drag-tooltip" });
	}

	private positionTooltip(tooltip: HTMLElement, ev: MouseEvent, text: string): void {
		tooltip.setText(text);
		tooltip.style.left = `${ev.clientX + 14}px`;
		tooltip.style.top = `${ev.clientY + 14}px`;
	}

	private startCreateDrag(e: MouseEvent, col: HTMLElement, date: Moment, settings: CalendarSettings, hourHeight: number): void {
		const rect = col.getBoundingClientRect();
		const anchorMin = snapMinutes(((e.clientY - rect.top) / hourHeight) * 60, SNAP_MINUTES);

		let pendingStart = Math.max(0, Math.min(1440, anchorMin));
		let pendingEnd = Math.min(1440, pendingStart + settings.minEventDurationMinutes);
		let moved = false;

		const preview = col.createDiv({ cls: "dc-block dc-create-preview" });
		const paint = () => {
			preview.style.top = `${(pendingStart / 60) * hourHeight}px`;
			preview.style.height = `${Math.max(((pendingEnd - pendingStart) / 60) * hourHeight, MIN_BLOCK_HEIGHT_PX)}px`;
			preview.style.left = "1px";
			preview.style.width = "calc(100% - 2px)";
		};
		paint();

		const tooltip = this.createTooltip();
		const describe = () =>
			`${formatTimeOfDay(minutesToTime(pendingStart), settings.timeFormat)} – ${formatTimeOfDay(
				minutesToTime(pendingEnd),
				settings.timeFormat
			)}`;
		this.positionTooltip(tooltip, e, describe());

		const onMove = (ev: MouseEvent) => {
			const min = snapMinutes(((ev.clientY - rect.top) / hourHeight) * 60, SNAP_MINUTES);
			const newStart = Math.max(0, Math.min(anchorMin, min));
			const newEnd = Math.min(1440, Math.max(anchorMin, Math.max(min, newStart + settings.minEventDurationMinutes)));
			if (newStart !== pendingStart || newEnd !== pendingEnd) moved = true;
			pendingStart = newStart;
			pendingEnd = newEnd;
			paint();
			this.positionTooltip(tooltip, ev, describe());
		};

		const onUp = () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
			preview.remove();
			tooltip.remove();
			if (!moved) pendingEnd = Math.min(1440, pendingStart + settings.defaultEventDurationMinutes);
			this.host.openEventCreate(date, {
				start: minutesToTime(pendingStart),
				end: minutesToTime(pendingEnd),
				allDay: false,
			});
		};

		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
	}

	private startMoveDrag(
		e: MouseEvent,
		item: CalendarItem,
		el: HTMLElement,
		columnsContainer: HTMLElement,
		allDates: Moment[],
		settings: CalendarSettings,
		hourHeight: number
	): void {
		const startMin = item.kind === "event" ? timeToMinutes(item.start) : timeToMinutes(item.time ?? { hour: 0, minute: 0 });
		const durationMin = item.kind === "event" ? timeToMinutes(item.end) - timeToMinutes(item.start) : 0;
		const originColIndex = Math.max(
			0,
			allDates.findIndex((d) => dateKey(d) === item.date)
		);
		const startClientX = e.clientX;
		const startClientY = e.clientY;
		const colWidthPx = columnsContainer.getBoundingClientRect().width / allDates.length;

		let pendingStart = startMin;
		let pendingCol = originColIndex;
		let dragConfirmed = false;
		let tooltip: HTMLElement | null = null;

		// Nothing is touched — no reparenting, no class, no tooltip — until the
		// mouse actually moves. A plain click therefore leaves the element
		// completely untouched, so its own click handler (open editor /
		// Cmd-click to open the linked note) fires exactly as if this listener
		// didn't exist.
		const beginDragVisuals = () => {
			dragConfirmed = true;
			// Reparent into the full-width columns container so the block can
			// visually slide across day columns during the drag — as a child of
			// a single day column, percentage left/width would be relative to
			// that column's own width instead of the whole grid.
			columnsContainer.appendChild(el);
			el.style.left = `calc(${(100 / allDates.length) * originColIndex}% + 1px)`;
			el.style.width = `calc(${100 / allDates.length}% - 2px)`;
			el.addClass("dc-dragging");
			tooltip = this.createTooltip();
		};

		const onMove = (ev: MouseEvent) => {
			const dy = ev.clientY - startClientY;
			const dx = ev.clientX - startClientX;
			const deltaMin = snapMinutes((dy / hourHeight) * 60, SNAP_MINUTES);
			const newStart = Math.max(0, Math.min(1440 - Math.max(durationMin, SNAP_MINUTES), startMin + deltaMin));
			const colDelta = colWidthPx > 0 ? Math.round(dx / colWidthPx) : 0;
			const newCol = Math.max(0, Math.min(allDates.length - 1, originColIndex + colDelta));
			if (newStart === pendingStart && newCol === pendingCol) return;

			if (!dragConfirmed) beginDragVisuals();
			pendingStart = newStart;
			pendingCol = newCol;
			el.style.top = `${(pendingStart / 60) * hourHeight}px`;
			el.style.left = `calc(${(100 / allDates.length) * pendingCol}% + 1px)`;
			if (tooltip) {
				this.positionTooltip(
					tooltip,
					ev,
					`${allDates[pendingCol].format("ddd D")} · ${formatTimeOfDay(minutesToTime(pendingStart), settings.timeFormat)}`
				);
			}
		};

		const onUp = () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
			if (dragConfirmed) {
				el.removeClass("dc-dragging");
				tooltip?.remove();
				// refresh() rebuilds every column's blocks from the freshly
				// written data, so there's no need to reparent this element back
				// to its original column here — it's about to be replaced anyway.
				void moveItemDateTime(this.host.store, item, allDates[pendingCol], pendingStart, durationMin);
			}
		};

		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
	}

	private startResizeDrag(
		e: MouseEvent,
		item: CalendarEventItem,
		el: HTMLElement,
		edge: "top" | "bottom",
		settings: CalendarSettings,
		hourHeight: number
	): void {
		const startMin = timeToMinutes(item.start);
		const endMin = timeToMinutes(item.end);
		const minDuration = Math.max(SNAP_MINUTES, settings.minEventDurationMinutes);
		const startClientY = e.clientY;

		let pendingStart = startMin;
		let pendingEnd = endMin;
		el.addClass("dc-dragging");
		const tooltip = this.createTooltip();

		const onMove = (ev: MouseEvent) => {
			const deltaMin = snapMinutes(((ev.clientY - startClientY) / hourHeight) * 60, SNAP_MINUTES);
			if (edge === "top") {
				pendingStart = Math.max(0, Math.min(endMin - minDuration, startMin + deltaMin));
				el.style.top = `${(pendingStart / 60) * hourHeight}px`;
			} else {
				pendingEnd = Math.max(startMin + minDuration, Math.min(1440, endMin + deltaMin));
			}
			el.style.height = `${Math.max(((pendingEnd - pendingStart) / 60) * hourHeight, MIN_BLOCK_HEIGHT_PX)}px`;
			this.positionTooltip(
				tooltip,
				ev,
				`${formatTimeOfDay(minutesToTime(pendingStart), settings.timeFormat)} – ${formatTimeOfDay(minutesToTime(pendingEnd), settings.timeFormat)}`
			);
		};

		const onUp = () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
			el.removeClass("dc-dragging");
			tooltip.remove();
			if (pendingStart !== startMin || pendingEnd !== endMin) {
				void this.host.store.updateEvent(item, { start: minutesToTime(pendingStart), end: minutesToTime(pendingEnd) });
			}
		};

		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
	}

	/** Draws the current-time line across every visible column — full strength on
	 * today's column (with its marker dot), faint on the rest, matching how
	 * Apple Calendar carries the line across the whole week. */
	private updateNowLine(columns: HTMLElement, dates: Moment[], hourHeight: number): void {
		columns.querySelectorAll(".dc-now-line").forEach((el) => el.remove());
		const now = moment();
		const nowMin = now.hour() * 60 + now.minute();
		const todayIndex = dates.findIndex((d) => isSameDay(d, now));

		Array.from(columns.children).forEach((child, i) => {
			const col = child as HTMLElement;
			const line = col.createDiv({ cls: "dc-now-line" + (i === todayIndex ? " dc-now-line-today" : "") });
			line.style.top = `${(nowMin / 60) * hourHeight}px`;
		});
	}
}

export class WeekView extends TimelineBaseView {
	constructor(host: CalendarHost) {
		super(host, (anchor) => getWeekDates(anchor, host.getSettings().firstDayOfWeek));
	}
}

export class DayView extends TimelineBaseView {
	constructor(host: CalendarHost) {
		super(host, (anchor) => [anchor.clone()]);
	}
}
