import { moment, setIcon } from "obsidian";
import type { Moment } from "moment";
import { CalendarEventItem, CalendarItem, CalendarSettings } from "../types";
import {
	dateKey,
	formatTimeOfDay,
	getWeekDates,
	isSameDay,
	isToday,
	isWeekendDate,
	minutesToTime,
	snapMinutes,
	timeToMinutes,
} from "../dateUtils";
import { displayTitle, firstWikilinkTarget, stripTags } from "../parser";
import { resolveColor } from "../colorRules";
import { layoutOverlaps } from "./overlapLayout";
import {
	CalendarHost,
	CalendarSubView,
	defaultColorFor,
	duplicateItem,
	moveItemDateTime,
	renderItemChip,
	fitTitleAndTagBadges,
	renderTaskTagHints,
	shouldHideWeekends,
	showEmptyContextMenu,
	showItemContextMenu,
	handleCalendarAction,
} from "./shared";

const SNAP_MINUTES = 15;
const MIN_BLOCK_HEIGHT_PX = 18;
const TASK_BLOCK_HEIGHT_PX = 22;
/** Keep a small visual gap before the next event when the event is tall enough to spare it. */
const ADJACENT_EVENT_GAP_PX = 2;
function eventBlockHeight(startMin: number, endMin: number, hourHeight: number): number {
	const naturalHeight = ((endMin - startMin) / 60) * hourHeight;
	// Extremely short events need their minimum readable footprint; for longer
	// events, shaving a couple of pixels creates breathing room between entries.
	if (naturalHeight < MIN_BLOCK_HEIGHT_PX + ADJACENT_EVENT_GAP_PX) {
		return Math.max(naturalHeight, MIN_BLOCK_HEIGHT_PX);
	}
	return naturalHeight - ADJACENT_EVENT_GAP_PX;
}
/** Hour labels this close (in px) to the current-time label are hidden so the two never overlap. */
const NOW_LABEL_CLEARANCE_PX = 13;

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
	/** One active gesture owns all temporary listeners and preview UI. */
	private activeInteractionCleanup: (() => void) | null = null;
	/** The drag proxy stays visible until the data refresh has rendered the moved item. */
	private pendingMoveVisualCleanup: (() => void) | null = null;

	private finishPendingMoveVisual(): void {
		const cleanup = this.pendingMoveVisualCleanup;
		this.pendingMoveVisualCleanup = null;
		cleanup?.();
	}

	private registerInteractionCleanup(cleanup: () => void): void {
		this.activeInteractionCleanup?.();
		this.activeInteractionCleanup = cleanup;
	}

	private releaseInteractionCleanup(cleanup: () => void): void {
		if (this.activeInteractionCleanup === cleanup) this.activeInteractionCleanup = null;
	}

	// Retained across renders so refresh() can update in place.
	private lastContainer: HTMLElement | null = null;
	private lastAnchor: Moment | null = null;
	/** Every date of the period (e.g. all 7 of a week), whether or not it's currently shown. */
	private lastAllDates: Moment[] | null = null;
	/** The dates actually shown as columns (weekends may be filtered out of Week view). */
	private lastDates: Moment[] | null = null;
	private lastRootEl: HTMLElement | null = null;
	private lastAllDayRowEl: HTMLElement | null = null;
	private lastColumnsEl: HTMLElement | null = null;
	private lastScrollEl: HTMLElement | null = null;

	constructor(private host: CalendarHost, private getDates: (anchor: Moment) => Moment[]) {}

	async render(container: HTMLElement, anchor: Moment): Promise<void> {
		await this.build(container, anchor, null);
	}

	private async build(
		container: HTMLElement,
		anchor: Moment,
		restoreScrollTop: number | null,
		preserveExistingUntilReady = false
	): Promise<void> {
		const settings = this.host.getSettings();

		// For true navigation, detach and clean up the old view immediately (its
		// parent is usually already empty). For data-only structural changes, keep
		// the current grid and drag proxy visible until the fresh date range loads.
		if (!preserveExistingUntilReady) {
			container.empty();
			this.destroy();
		}

		const allDates = this.getDates(anchor);
		const hourHeight = hourHeightFor(settings.calendarScale);
		const itemsByDate = await this.host.store.getItemsForRange(allDates[0], allDates[allDates.length - 1]);
		const dates = this.visibleDates(allDates, itemsByDate, settings);

		// A refresh that changes the visible column set (for example, when a
		// move reveals/hides weekend columns) keeps the current grid and drag
		// proxy on screen while data loads. Replace it only once the next view
		// can be built, rather than blanking the whole timeline between states.
		// Normal navigation still clears immediately because CalendarView has
		// already selected a different date/view and detached the old body.
		if (preserveExistingUntilReady) {
			// Detach the stale source element before destroy() restores its inline
			// visibility, otherwise the old block can flash at its original slot.
			container.empty();
			this.destroy();
		}

		this.lastContainer = container;
		this.lastAnchor = anchor;
		this.lastAllDates = allDates;
		this.lastDates = dates;

		const root = container.createDiv({ cls: "dc-timeline" });
		this.lastRootEl = root;

		// ---------------------------------------------------------------- header
		const header = root.createDiv({ cls: "dc-timeline-header" });
		header.createDiv({ cls: "dc-timeline-gutter-spacer" });
		const headerCols = header.createDiv({ cls: "dc-timeline-header-cols" });
		dates.forEach((date) => {
			const col = headerCols.createDiv({ cls: "dc-timeline-header-col" });
			if (isToday(date)) col.addClass("dc-is-today");
			// Day view stays neutral; weekend shading belongs to multi-day Week view.
			if (dates.length > 1 && settings.weekendShading && isWeekendDate(date)) col.addClass("dc-weekend");
			const line = col.createDiv({ cls: "dc-timeline-header-line" });
			line.createSpan({ cls: "dc-timeline-header-dow", text: dates.length === 1 ? date.format("dddd") : date.format("ddd") });
			line.createSpan({ cls: "dc-timeline-header-num", text: String(date.date()) });
			col.addEventListener("click", () => void this.host.openDailyNote(date));
			// A whole-day target: a new event here is all-day, and a paste keeps its original time.
			col.addEventListener("contextmenu", (e) => this.showDayMenu(e, date));
		});

		// --------------------------------------------------------------- all-day
		this.lastAllDayRowEl = this.syncAllDayRow(root, dates, itemsByDate, settings, null);

		// ------------------------------------------------------------- timeline
		const scroll = root.createDiv({ cls: "dc-timeline-scroll" });
		this.lastScrollEl = scroll;
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
			this.updateNowLine(columns, gutter, dates, allDates, hourHeight);
			this.intervalId = window.setInterval(() => this.updateNowLine(columns, gutter, dates, allDates, hourHeight), 60_000);
		}

		const showingToday = dates.some((d) => isToday(d));
		const now = moment();
		const scrollTargetMin =
			settings.autoScrollToCurrentTime && showingToday
				? now.hour() * 60 + now.minute()
				: timeToMinutes(settings.workingHoursStart);
		window.setTimeout(() => {
			scroll.scrollTop =
				restoreScrollTop !== null
					? restoreScrollTop
					: Math.max(0, (scrollTargetMin / 60) * hourHeight - scroll.clientHeight / 3);
		}, 0);
	}

	/**
	 * Week view can hide Saturday/Sunday, but never when something is
	 * actually scheduled on one of them that week (see shouldHideWeekends).
	 * Day view is a single date, so there's nothing to hide.
	 */
	private visibleDates(
		allDates: Moment[],
		itemsByDate: Map<string, CalendarItem[]>,
		settings: CalendarSettings
	): Moment[] {
		if (allDates.length < 2) return allDates;
		return shouldHideWeekends(settings.showWeekendsWeek, allDates, itemsByDate)
			? allDates.filter((d) => !isWeekendDate(d))
			: allDates;
	}

	/** Data-only change: update the all-day row and every column's blocks in
	 * place. The scroll container, header, and hour-grid are never touched —
	 * unless the change alters which columns should exist at all (a first
	 * item landing on a hidden weekend), in which case the columns are
	 * rebuilt with the scroll position carried across. */
	async refresh(): Promise<void> {
		if (
			!this.lastAllDates ||
			!this.lastDates ||
			!this.lastColumnsEl ||
			!this.lastRootEl ||
			!this.lastContainer ||
			!this.lastAnchor
		) {
			return;
		}
		const settings = this.host.getSettings();
		const allDates = this.lastAllDates;
		const hourHeight = hourHeightFor(settings.calendarScale);
		const itemsByDate = await this.host.store.getItemsForRange(allDates[0], allDates[allDates.length - 1]);

		const nextDates = this.visibleDates(allDates, itemsByDate, settings);
		const previous = this.lastDates;
		const sameColumns = nextDates.length === previous.length && nextDates.every((d, i) => isSameDay(d, previous[i]));
		if (!sameColumns) {
			await this.build(this.lastContainer, this.lastAnchor, this.lastScrollEl?.scrollTop ?? null, true);
			this.finishPendingMoveVisual();
			return;
		}

		this.lastAllDayRowEl = this.syncAllDayRow(this.lastRootEl, previous, itemsByDate, settings, this.lastAllDayRowEl);

		const columns = this.lastColumnsEl;
		previous.forEach((date, i) => {
			const col = columns.children.item(i) as HTMLElement | null;
			if (!col) return;
			col.querySelectorAll(".dc-block").forEach((el) => el.remove());
			this.populateColumnBlocks(col, columns, date, previous, itemsByDate.get(dateKey(date)) ?? [], settings, hourHeight);
		});
		// The fresh item DOM is now in place under the proxy. Remove the proxy
		// only after rendering finishes, avoiding the old-position flash on mouseup.
		this.finishPendingMoveVisual();
	}

	destroy(): void {
		// Closing/rebuilding a view mid-gesture must not leave global listeners
		// attached or let a later mouseup create/move an event unexpectedly.
		this.activeInteractionCleanup?.();
		this.activeInteractionCleanup = null;
		this.finishPendingMoveVisual();
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
			if (dates.length > 1 && settings.weekendShading && isWeekendDate(date)) col.addClass("dc-weekend");
			const items = (itemsByDate.get(dateKey(date)) ?? []).filter((it) => it.allDay);
			items.forEach((item) => {
				const chip = renderItemChip(this.host, item, settings);
				chip.addEventListener("contextmenu", (e) => this.showAllDayItemMenu(e, item, date));
				col.appendChild(chip);
			});
			col.addEventListener("contextmenu", (e) => this.showDayMenu(e, date));
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
		// Do not shade the single all-day column in Day view. In Week view, keep
		// weekend shading even when the current day itself falls on a weekend.
		if (allDates.length > 1 && settings.weekendShading && isWeekendDate(date)) col.addClass("dc-weekend");
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

		// Right-click on empty timeline space (blocks stop their own contextmenu
		// from bubbling up here): New event at that spot / Paste at that time.
		col.addEventListener("contextmenu", (e) => {
			const minutes = this.minutesAtY(col, e.clientY, hourHeight, 1440 - SNAP_MINUTES);
			showEmptyContextMenu(e, {
				onNewEvent: () => this.startClickDefineRange(col, date, minutes, settings, hourHeight),
				onPaste: this.host.peekClipboard()
					? () => void this.host.pasteClipboardAt(date, minutesToTime(minutes))
					: undefined,
			});
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
			if (item) this.renderBlock(col, columnsContainer, date, item, box, settings, hourHeight, allDates);
		});
	}

	private renderBlock(
		col: HTMLElement,
		columnsContainer: HTMLElement,
		date: Moment,
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
			: eventBlockHeight(box.startMin, box.endMin, hourHeight);
		el.style.top = `${top}px`;
		el.style.height = `${height}px`;
		el.style.left = `calc(${(100 / box.totalCols) * box.col}% + 1px)`;
		el.style.width = `calc(${100 / box.totalCols}% - 2px)`;
		el.style.setProperty("--dc-item-color", resolveColor(item.tags, settings.colorRules, defaultColorFor(item, settings)));

		const body = el.createDiv({ cls: "dc-block-body" });
		let suppressNextClick = false;
		let clearClickSuppression: number | null = null;
		let captureSuppressedClick: ((event: MouseEvent) => void) | null = null;
		if (isTask) {
			const check = body.createDiv({ cls: "dc-pill-check" + (item.completed ? " is-checked" : "") });
			check.addEventListener("mousedown", (e) => e.stopPropagation());
			check.addEventListener("click", (e) => {
				e.stopPropagation();
				void this.host.toggleTask(item);
			});
			this.renderTaskContent(body, item, settings);
		} else {
			this.renderEventContent(el, body, item, settings);
		}

		body.addEventListener("click", (e) => {
			if (suppressNextClick) {
				suppressNextClick = false;
				if (clearClickSuppression !== null) window.clearTimeout(clearClickSuppression);
				clearClickSuppression = null;
				e.preventDefault();
				e.stopPropagation();
				return;
			}
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
			this.startMoveDrag(e, item, el, columnsContainer, allDates, settings, hourHeight, () => {
				suppressNextClick = true;
				if (clearClickSuppression !== null) window.clearTimeout(clearClickSuppression);
				if (captureSuppressedClick) window.removeEventListener("click", captureSuppressedClick, true);
				captureSuppressedClick = (clickEvent: MouseEvent) => {
					clickEvent.preventDefault();
					clickEvent.stopPropagation();
					clickEvent.stopImmediatePropagation();
					suppressNextClick = false;
					if (clearClickSuppression !== null) window.clearTimeout(clearClickSuppression);
					clearClickSuppression = null;
					window.removeEventListener("click", captureSuppressedClick!, true);
					captureSuppressedClick = null;
				};
				window.addEventListener("click", captureSuppressedClick, true);
				clearClickSuppression = window.setTimeout(() => {
					if (captureSuppressedClick) window.removeEventListener("click", captureSuppressedClick, true);
					captureSuppressedClick = null;
					suppressNextClick = false;
					clearClickSuppression = null;
				}, 500);
			});
		});

		// The whole block (handles included) shares one right-click menu.
		el.addEventListener("contextmenu", (e) => {
			const minutes = this.minutesAtY(col, e.clientY, hourHeight, 1440 - SNAP_MINUTES);
			showItemContextMenu(e, {
				onNewEvent: () => this.startClickDefineRange(col, date, minutes, settings, hourHeight),
				onEdit: () => (item.kind === "event" ? this.host.openEventEdit(item) : this.host.openTaskEdit(item)),
				onDuplicate: () => duplicateItem(this.host, item),
				onCopy: () => this.host.copyItemToClipboard(item),
				onPaste: this.host.peekClipboard()
					? () => void this.host.pasteClipboardAt(date, minutesToTime(minutes))
					: undefined,
				onDelete: () => handleCalendarAction("delete that item", this.host.store.deleteItem(item)),
			});
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

	/**
	 * Prefer a wrapped title with tags on their own single row whenever both
	 * fit vertically. For very slim blocks where a second row cannot fit, fall
	 * back to a complete inline title/tag row when it fits horizontally. Time is
	 * lower priority than the title and tags; one popover reveals omitted text.
	 */
	private renderEventContent(blockEl: HTMLElement, body: HTMLElement, item: CalendarEventItem, settings: CalendarSettings): void {
		const displayText = stripTags(displayTitle(item.title));
		const fullDisplayTitle = displayTitle(item.title);
		const bodyStyle = getComputedStyle(body);
		const availableHeightPx =
			body.clientHeight - parseFloat(bodyStyle.paddingTop || "0") - parseFloat(bodyStyle.paddingBottom || "0");
		const rowGap = parseFloat(bodyStyle.rowGap || bodyStyle.gap || "0") || 0;
		const outerHeight = (element: HTMLElement): number => {
			const style = getComputedStyle(element);
			return element.getBoundingClientRect().height + parseFloat(style.marginTop || "0") + parseFloat(style.marginBottom || "0");
		};
		const createTitle = (className = "dc-block-label dc-clamp"): HTMLElement => {
			const label = body.createSpan({ cls: className });
			label.setText(displayText);
			if (firstWikilinkTarget(item.title)) label.addClass("dc-linked");
			label.style.flexShrink = "0";
			return label;
		};
		const lineHeightOf = (label: HTMLElement): number => parseFloat(getComputedStyle(label).lineHeight) || 14;
		const naturalLineCount = (label: HTMLElement): number => Math.max(1, Math.round(label.scrollHeight / lineHeightOf(label)));
		const clampTitle = (label: HTMLElement, maxLines: number): boolean => {
			const naturalLines = naturalLineCount(label);
			const lines = Math.max(1, Math.min(naturalLines, maxLines));
			label.style.setProperty("-webkit-line-clamp", String(lines));
			return naturalLines > lines || label.scrollHeight > label.clientHeight + 1;
		};

		let usedHeightPx = 0;
		let titleTruncated = false;
		let tagsVisible = item.tags.length === 0;

		if (item.tags.length > 0) {
			// Prefer the readable two-row arrangement when the full title and one
			// compact tag row both fit vertically. This deliberately wins even if
			// title + tags could also have fitted on one horizontal row.
			const label = createTitle();
			const fullTitleHeight = outerHeight(label);
			const tagLine = body.createDiv({ cls: "dc-block-tagline" });
			tagLine.style.flexShrink = "0";
			const hasTagLine = this.renderFittedTagLine(tagLine, item, settings);
			const tagHeight = hasTagLine ? outerHeight(tagLine) : 0;
			if (hasTagLine && fullTitleHeight + rowGap + tagHeight <= availableHeightPx + 0.5) {
				tagsVisible = true;
				usedHeightPx = fullTitleHeight + rowGap + tagHeight;
			} else {
				label.remove();
				tagLine.remove();
				// Very slim blocks may not have the vertical room for a second row.
				// In that case use one row with title-first tag truncation rather than
				// dropping the tag entirely.
				const inlineRow = body.createDiv({ cls: "dc-block-inline-row" });
				const inlineLabel = inlineRow.createSpan({ cls: "dc-block-label dc-inline-event-label" });
				inlineLabel.setText(displayText);
				if (firstWikilinkTarget(item.title)) inlineLabel.addClass("dc-linked");
				const overrideColor = settings.colorTagsUsingRules
					? resolveColor(item.tags, settings.colorRules, defaultColorFor(item, settings))
					: null;
				for (const tag of item.tags) {
					const badge = inlineRow.createEl("a", { cls: "tag dc-tag-badge dc-inline-event-tag", text: `#${tag}`, attr: { href: `#${tag}` } });
					if (overrideColor) {
						badge.style.setProperty("background-color", `color-mix(in srgb, ${overrideColor} 20%, var(--background-primary))`, "important");
						badge.style.setProperty("border-color", overrideColor, "important");
						badge.style.setProperty("color", overrideColor, "important");
					}
				}
				// The title-first fitter measures intrinsic text before flex shrinkage,
				// so a long tag cannot consume the title's space.
				const inlineTags = Array.from(inlineRow.querySelectorAll<HTMLElement>(".dc-inline-event-tag"));
				const allInlineTextFits = fitTitleAndTagBadges(inlineRow, inlineLabel, inlineTags);
				if (inlineRow.clientWidth > 0 && inlineTags.some((tag) => tag.getBoundingClientRect().width > 0)) {
					// A compacted tag/title still counts as visible, but the popover must
					// remain available whenever any tag text was omitted.
					tagsVisible = allInlineTextFits;
					usedHeightPx = outerHeight(inlineRow);
				} else {
					inlineRow.remove();
					const wrappedTitle = createTitle();
					const lineHeightPx = lineHeightOf(wrappedTitle);
					const maxLines = Math.max(1, Math.floor(availableHeightPx / lineHeightPx));
					titleTruncated = clampTitle(wrappedTitle, maxLines);
					usedHeightPx = outerHeight(wrappedTitle);
				}
			}
		} else {
			const label = createTitle();
			const lineHeightPx = lineHeightOf(label);
			const maxLines = Math.max(1, Math.floor(availableHeightPx / lineHeightPx));
			titleTruncated = clampTitle(label, maxLines);
			usedHeightPx = outerHeight(label);
		}

		// Time is the last priority: show it below the title and tags only if
		// those preferred rows leave enough real vertical room for it.
		if (availableHeightPx - usedHeightPx >= 10) {
			const timeEl = body.createDiv({
				cls: "dc-block-time",
				text: `${formatTimeOfDay(item.start, settings.timeFormat)} – ${formatTimeOfDay(item.end, settings.timeFormat)}`,
			});
			timeEl.style.flexShrink = "0";
			if (usedHeightPx + rowGap + outerHeight(timeEl) <= availableHeightPx + 0.5) {
				usedHeightPx += rowGap + outerHeight(timeEl);
			} else {
				timeEl.remove();
			}
		}

		// One block-level popover reveals the original title and all tags when
		// clipping or a slim block forces part of the text out of the visible UI.
		if (titleTruncated || (item.tags.length > 0 && !tagsVisible)) {
			this.attachHoverPopover(blockEl, fullDisplayTitle);
		}
	}

	/**
	 * Tasks are a single horizontal row by design. All full tag badges are tried
	 * immediately after the title first; if the full set does not fit, show the
	 * first tag with an ellipsis before degrading to a compact marker. The
	 * popover retains every tag name.
	 */
	private renderTaskContent(body: HTMLElement, item: CalendarItem, settings: CalendarSettings): void {
		const label = body.createSpan({ cls: "dc-block-label" });
		const displayText = stripTags(displayTitle(item.title));
		label.setText(displayText);
		if (firstWikilinkTarget(item.title)) label.addClass("dc-linked");
		if (item.kind === "task" && item.completed) label.addClass("dc-completed");
		label.style.flex = item.tags.length > 0 ? "0 1 auto" : "1 1 auto";
		label.style.maxWidth = "none";

		if (item.tags.length > 0) renderTaskTagHints(body, label, item, settings);

		// Full tag names are preferred if they all fit immediately after the title;
		// otherwise the shared helper substitutes one # marker. Hover remains one
		// block-level popover containing the complete title and all tag names.
		const fullDisplayTitle = displayTitle(item.title);
		if (item.tags.length > 0) {
			this.attachHoverPopover(body, fullDisplayTitle);
		} else if (label.scrollWidth > label.clientWidth + 1) {
			this.attachHoverPopover(body, fullDisplayTitle);
		}
	}

	/**
	 * Fills a single-line tag row with as many real, fully-visible tag
	 * badges as fit — never a mid-tag cut, since that would mean rendering
	 * plain cropped text instead of a real ".tag" element and losing theme/
	 * snippet compatibility for it. Whatever doesn't fit is represented by a
	 * trailing "…" (or a bare "#" if not even one whole tag fits). Returns
	 * whether anything ended up visible at all.
	 */
	private renderFittedTagLine(container: HTMLElement, item: CalendarItem, settings: CalendarSettings): boolean {
		const maxWidth = container.clientWidth;
		if (maxWidth <= 0) return false;
		const overrideColor = settings.colorTagsUsingRules
			? resolveColor(item.tags, settings.colorRules, defaultColorFor(item, settings))
			: null;
		const gap = parseFloat(getComputedStyle(container).columnGap || getComputedStyle(container).gap || "0") || 0;

		for (const tag of item.tags) {
			const badge = container.createEl("a", { cls: "tag dc-tag-badge", text: `#${tag}`, attr: { href: `#${tag}` } });
			if (overrideColor) {
				badge.style.setProperty("background-color", `color-mix(in srgb, ${overrideColor} 20%, var(--background-primary))`, "important");
				badge.style.setProperty("border-color", overrideColor, "important");
				badge.style.setProperty("color", overrideColor, "important");
			}
			if (container.scrollWidth > maxWidth) {
				const previousBadges = Array.from(container.children).filter((child) => child !== badge) as HTMLElement[];
				const used = previousBadges.reduce((sum, child) => sum + child.getBoundingClientRect().width, 0) + gap * previousBadges.length;
				const remainder = maxWidth - used;
				if (remainder >= 8) {
					// Keep the earlier tags intact and ellipsize the next tag itself,
					// e.g. "#health #appointm…", all within this single row.
					badge.style.display = "inline-block";
					badge.style.flex = "0 1 auto";
					badge.style.minWidth = "0";
					badge.style.maxWidth = `${remainder}px`;
					badge.style.overflow = "hidden";
					badge.style.textOverflow = "ellipsis";
				} else {
					badge.remove();
				}
				break;
			}
		}
		return container.childElementCount > 0;
	}

	/** A small popover with the full, untruncated text — shown after a short hover delay, matching the drag tooltip's visual language. */
	private attachHoverPopover(el: HTMLElement, text: string): void {
		let popover: HTMLElement | null = null;
		let timer: number | null = null;
		let observer: MutationObserver | null = null;
		let hovered = false;
		const clearTimer = () => {
			if (timer !== null) window.clearTimeout(timer);
			timer = null;
		};
		const hide = () => {
			clearTimer();
			observer?.disconnect();
			observer = null;
			popover?.remove();
			popover = null;
		};
		el.addEventListener("mouseenter", () => {
			hovered = true;
			hide();
			timer = window.setTimeout(() => {
				timer = null;
				// Timeline refreshes can detach a block during this delay. Don't
				// create a popover for a stale element (whose rectangle is 0, 0).
				if (!hovered || !el.isConnected) return;
				popover = document.body.createDiv({ cls: "dc-hover-popover", text });
				const rect = el.getBoundingClientRect();
				popover.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - 272))}px`;
				const height = popover.getBoundingClientRect().height;
				const below = rect.bottom + 6;
				popover.style.top = `${below + height <= window.innerHeight - 4 ? below : Math.max(4, rect.top - height - 6)}px`;
				// If rendering replaces the hovered block, mouseleave won't fire on
				// the detached element; remove its floating popover on disconnection.
				observer = new MutationObserver(() => {
					if (!el.isConnected) hide();
				});
				observer.observe(document.body, { childList: true, subtree: true });
			}, 350);
		});
		el.addEventListener("mouseleave", () => {
			hovered = false;
			hide();
		});
		el.addEventListener("click", hide, true);
	}


	// ------------------------------------------------------------ context menus

	/** Right-click on a day header or an empty all-day area: whole-day actions only. */
	private showDayMenu(e: MouseEvent, date: Moment): void {
		showEmptyContextMenu(e, {
			onNewEvent: () => this.host.openEventCreate(date, { allDay: true }),
			onPaste: this.host.peekClipboard() ? () => void this.host.pasteClipboardAt(date) : undefined,
		});
	}

	private showAllDayItemMenu(e: MouseEvent, item: CalendarItem, date: Moment): void {
		showItemContextMenu(e, {
			onNewEvent: () => this.host.openEventCreate(date, { allDay: true }),
			onEdit: () => (item.kind === "event" ? this.host.openEventEdit(item) : this.host.openTaskEdit(item)),
			onDuplicate: () => duplicateItem(this.host, item),
			onCopy: () => this.host.copyItemToClipboard(item),
			onPaste: this.host.peekClipboard() ? () => void this.host.pasteClipboardAt(date) : undefined,
			onDelete: () => handleCalendarAction("delete that item", this.host.store.deleteItem(item)),
		});
	}

	// ------------------------------------------------------------- interactions

	/** Snapped minute-of-day under a screen Y position within a day column. */
	private minutesAtY(col: HTMLElement, clientY: number, hourHeight: number, max = 1440): number {
		const rect = col.getBoundingClientRect();
		const raw = snapMinutes(((clientY - rect.top) / hourHeight) * 60, SNAP_MINUTES);
		return Math.max(0, Math.min(max, raw));
	}

	private createTooltip(): HTMLElement {
		return document.body.createDiv({ cls: "dc-drag-tooltip" });
	}

	private positionTooltip(tooltip: HTMLElement, ev: MouseEvent, text: string): void {
		tooltip.setText(text);
		tooltip.style.left = `${ev.clientX + 14}px`;
		tooltip.style.top = `${ev.clientY + 14}px`;
	}

	/**
	 * Right-click → "New event": the right-click position is one end of the
	 * range, the mouse then just moves (no button held) with a live preview,
	 * and the next left click sets the other end — swapped if the mouse went
	 * upwards — and opens the editor. This exists because a normal press-and-
	 * drag on a slot already occupied by an event moves that event instead.
	 * Escape or a right-click cancels.
	 */
	private startClickDefineRange(
		col: HTMLElement,
		date: Moment,
		anchorMin: number,
		settings: CalendarSettings,
		hourHeight: number
	): void {
		let currentMin = anchorMin;
		const preview = col.createDiv({ cls: "dc-block dc-create-preview" });
		const tooltip = this.createTooltip();

		const orderedRange = (): { start: number; end: number } => {
			let start = Math.min(anchorMin, currentMin);
			let end = Math.max(anchorMin, currentMin);
			if (end === start) end = Math.min(1440, start + settings.defaultEventDurationMinutes);
			else if (end - start < settings.minEventDurationMinutes) end = Math.min(1440, start + settings.minEventDurationMinutes);
			if (end <= start) start = Math.max(0, end - settings.minEventDurationMinutes);
			return { start, end };
		};
		const describe = (r: { start: number; end: number }) =>
			`${formatTimeOfDay(minutesToTime(r.start), settings.timeFormat)} – ${formatTimeOfDay(
				minutesToTime(r.end),
				settings.timeFormat
			)}`;
		const paint = (ev: MouseEvent | null) => {
			const r = orderedRange();
			preview.style.top = `${(r.start / 60) * hourHeight}px`;
			preview.style.height = `${Math.max(((r.end - r.start) / 60) * hourHeight, MIN_BLOCK_HEIGHT_PX)}px`;
			preview.style.left = "1px";
			preview.style.width = "calc(100% - 2px)";
			if (ev) this.positionTooltip(tooltip, ev, describe(r));
			else tooltip.setText(describe(r));
		};
		paint(null);
		tooltip.style.display = "none"; // shown once the mouse moves and we know where it is

		const cleanup = () => {
			document.removeEventListener("mousemove", onMove, true);
			document.removeEventListener("mousedown", onDown, true);
			window.removeEventListener("keydown", onKey, true);
			preview.remove();
			tooltip.remove();
			this.releaseInteractionCleanup(cleanup);
		};
		const onMove = (ev: MouseEvent) => {
			tooltip.style.display = "";
			currentMin = this.minutesAtY(col, ev.clientY, hourHeight);
			paint(ev);
		};
		const onDown = (ev: MouseEvent) => {
			// Swallow this click entirely so it can't also start a drag or open an item.
			ev.preventDefault();
			ev.stopPropagation();
			if (ev.button !== 0) {
				cleanup();
				return;
			}
			currentMin = this.minutesAtY(col, ev.clientY, hourHeight);
			const r = orderedRange();
			cleanup();
			const swallowClick = (c: MouseEvent) => {
				c.preventDefault();
				c.stopPropagation();
				document.removeEventListener("click", swallowClick, true);
			};
			document.addEventListener("click", swallowClick, true);
			window.setTimeout(() => document.removeEventListener("click", swallowClick, true), 400);
			this.host.openEventCreate(date, { start: minutesToTime(r.start), end: minutesToTime(r.end), allDay: false });
		};
		const onKey = (ev: KeyboardEvent) => {
			if (ev.key !== "Escape") return;
			ev.preventDefault();
			ev.stopPropagation();
			ev.stopImmediatePropagation();
			cleanup();
		};

		document.addEventListener("mousemove", onMove, true);
		document.addEventListener("mousedown", onDown, true);
		window.addEventListener("keydown", onKey, true);
		this.registerInteractionCleanup(cleanup);
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

		const cleanup = () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
			preview.remove();
			tooltip.remove();
			this.releaseInteractionCleanup(cleanup);
		};
		const onUp = () => {
			cleanup();
			if (!moved) pendingEnd = Math.min(1440, pendingStart + settings.defaultEventDurationMinutes);
			this.host.openEventCreate(date, {
				start: minutesToTime(pendingStart),
				end: minutesToTime(pendingEnd),
				allDay: false,
			});
		};

		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
		this.registerInteractionCleanup(cleanup);
	}

	private startMoveDrag(
		e: MouseEvent,
		item: CalendarItem,
		el: HTMLElement,
		columnsContainer: HTMLElement,
		allDates: Moment[],
		settings: CalendarSettings,
		hourHeight: number,
		onDragStarted: () => void
	): void {
		const startMin = item.kind === "event" ? timeToMinutes(item.start) : timeToMinutes(item.time ?? { hour: 0, minute: 0 });
		const durationMin = item.kind === "event" ? timeToMinutes(item.end) - timeToMinutes(item.start) : 0;
		const originColIndex = Math.max(0, allDates.findIndex((d) => dateKey(d) === item.date));
		const startClientX = e.clientX;
		const startClientY = e.clientY;
		const columnsRect = columnsContainer.getBoundingClientRect();
		const itemRect = el.getBoundingClientRect();
		const initialLeft = itemRect.left - columnsRect.left;
		const initialTop = itemRect.top - columnsRect.top;
		const initialWidth = itemRect.width;
		const initialHeight = itemRect.height;
		const colWidthPx = columnsRect.width / Math.max(1, allDates.length);
		const previousVisibility = el.style.visibility;

		let pendingStart = startMin;
		let pendingCol = originColIndex;
		let dragConfirmed = false;
		let overlay: HTMLElement | null = null;
		let tooltip: HTMLElement | null = null;

		// Use a pointer-following clone rather than reparenting the live block.
		// Reparenting changed the containing block and overlap-column geometry,
		// making an item visibly jump away from the pointer at drag start.
		const beginDragVisuals = () => {
			dragConfirmed = true;
			onDragStarted();
			overlay = el.cloneNode(true) as HTMLElement;
			overlay.addClass("dc-dragging");
			overlay.style.position = "absolute";
			overlay.style.margin = "0";
			overlay.style.left = `${initialLeft}px`;
			overlay.style.top = `${initialTop}px`;
			overlay.style.width = `${initialWidth}px`;
			overlay.style.height = `${initialHeight}px`;
			overlay.style.pointerEvents = "none";
			columnsContainer.appendChild(overlay);
			el.style.visibility = "hidden";
			tooltip = this.createTooltip();
		};

		const onMove = (ev: MouseEvent) => {
			const dx = ev.clientX - startClientX;
			const dy = ev.clientY - startClientY;
			const deltaMin = snapMinutes((dy / hourHeight) * 60, SNAP_MINUTES);
			const maxStart = 1440 - Math.max(durationMin, SNAP_MINUTES);
			const newStart = Math.max(0, Math.min(maxStart, startMin + deltaMin));
			const draggedLeft = initialLeft + dx;
			const draggedCenter = draggedLeft + initialWidth / 2;
			const newCol = colWidthPx > 0
				? Math.max(0, Math.min(allDates.length - 1, Math.floor(draggedCenter / colWidthPx)))
				: originColIndex;

			// Don't even enter drag mode until the snapped schedule changes. This
			// avoids treating hand jitter as a drag, suppressing clicks, or moving an
			// item a full snap interval when the pointer barely moved.
			if (!dragConfirmed && newStart === startMin && newCol === originColIndex) return;
			if (!dragConfirmed) beginDragVisuals();

			pendingStart = newStart;
			pendingCol = newCol;
			if (overlay) {
				overlay.style.left = `${draggedLeft}px`;
				// Keep the visual aligned with the snapped time while preserving its
				// exact original screen position when the drag first activates.
				// The preview follows the pointer smoothly; only the saved start time
				// is snapped to the calendar's 15-minute grid on mouseup.
				overlay.style.top = `${initialTop + dy}px`;
			}
			if (tooltip) {
				this.positionTooltip(
					tooltip,
					ev,
					`${allDates[pendingCol].format("ddd D")} · ${formatTimeOfDay(minutesToTime(pendingStart), settings.timeFormat)}`
				);
			}
		};

		const removeVisuals = () => {
			el.style.visibility = previousVisibility;
			overlay?.remove();
			tooltip?.remove();
			if (this.pendingMoveVisualCleanup === removeVisuals) this.pendingMoveVisualCleanup = null;
		};
		const detachListeners = () => {
			document.removeEventListener("mousemove", onMove, true);
			document.removeEventListener("mouseup", onUp, true);
			this.releaseInteractionCleanup(cleanup);
		};
		const cleanup = () => {
			detachListeners();
			removeVisuals();
		};
		const onUp = () => {
			const shouldMove = dragConfirmed && (pendingStart !== startMin || pendingCol !== originColIndex);
			detachListeners();
			if (!shouldMove) {
				removeVisuals();
				return;
			}

			// Keep the proxy at the drop location and the original hidden while the
			// store writes and refreshes. refresh() removes the source, renders the
			// destination, and only then calls finishPendingMoveVisual().
			tooltip?.remove();
			tooltip = null;
			if (overlay) {
				overlay.style.opacity = "1";
				overlay.style.boxShadow = "none";
			}
			this.pendingMoveVisualCleanup = removeVisuals;
			const operation = moveItemDateTime(this.host.store, item, allDates[pendingCol], pendingStart, durationMin);
			// The store emits its final refresh from runMutation's finally block,
			// including on failure after rollback. Keep the proxy until that render
			// completes; cleaning up directly in catch briefly reveals the stale
			// source node before the rollback refresh replaces it.
			handleCalendarAction("move that item", operation);
		};

		document.addEventListener("mousemove", onMove, true);
		document.addEventListener("mouseup", onUp, true);
		this.registerInteractionCleanup(cleanup);
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
			el.style.height = `${eventBlockHeight(pendingStart, pendingEnd, hourHeight)}px`;
			this.positionTooltip(
				tooltip,
				ev,
				`${formatTimeOfDay(minutesToTime(pendingStart), settings.timeFormat)} – ${formatTimeOfDay(minutesToTime(pendingEnd), settings.timeFormat)}`
			);
		};

		const cleanup = () => {
			document.removeEventListener("mousemove", onMove, true);
			document.removeEventListener("mouseup", onUp, true);
			el.removeClass("dc-dragging");
			tooltip.remove();
			this.releaseInteractionCleanup(cleanup);
		};
		const onUp = () => {
			cleanup();
			if (pendingStart !== startMin || pendingEnd !== endMin) {
				handleCalendarAction("resize that event", this.host.store.updateEvent(item, { start: minutesToTime(pendingStart), end: minutesToTime(pendingEnd) }));
			}
		};

		// Capture-phase listeners keep Obsidian's own handlers from swallowing a
		// resize gesture after it starts on the narrow top/bottom hit target.
		document.addEventListener("mousemove", onMove, true);
		document.addEventListener("mouseup", onUp, true);
		this.registerInteractionCleanup(cleanup);
	}

	/**
	 * Draws the current-time line across every visible column — full strength on
	 * today's column (with its marker dot), faint on the rest — and, when
	 * today is visible, a red time label in the hour gutter at the same height.
	 * Any hour label that would collide with it is hidden while it's there.
	 */
	private updateNowLine(columns: HTMLElement, gutter: HTMLElement, dates: Moment[], allDates: Moment[], hourHeight: number): void {
		columns.querySelectorAll(".dc-now-line").forEach((el) => el.remove());
		gutter.querySelectorAll(".dc-now-label").forEach((el) => el.remove());
		gutter.querySelectorAll(".dc-hour-hidden").forEach((el) => el.removeClass("dc-hour-hidden"));

		const now = moment();
		const nowMin = now.hour() * 60 + now.minute();
		const nowTop = (nowMin / 60) * hourHeight;
		// The current-time line is meaningful only when the displayed period
		// contains today. `dates` can omit hidden weekend columns, so use the
		// full period to decide whether this is the current day/week.
		if (!allDates.some((date) => isSameDay(date, now))) return;
		const todayIndex = dates.findIndex((d) => isSameDay(d, now));

		Array.from(columns.children).forEach((child, i) => {
			const col = child as HTMLElement;
			const line = col.createDiv({ cls: "dc-now-line" + (i === todayIndex ? " dc-now-line-today" : "") });
			line.style.top = `${nowTop}px`;
		});

		if (todayIndex === -1) return;
		const timeFormat = this.host.getSettings().timeFormat;
		// Always a real clock time here ("9:41"), never the "Midday"/"Midnight" wording.
		const text =
			timeFormat === "24h"
				? now.format("HH:mm")
				: now.format("h:mm");
		const label = gutter.createDiv({ cls: "dc-now-label", text });
		label.style.top = `${nowTop}px`;

		gutter.querySelectorAll<HTMLElement>(".dc-timeline-hour-label").forEach((hourLabel) => {
			if (Math.abs(parseFloat(hourLabel.style.top) - nowTop) < NOW_LABEL_CLEARANCE_PX) {
				hourLabel.addClass("dc-hour-hidden");
			}
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
