import { ItemView, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type { Moment } from "moment";
import type DaynestPlugin from "../main";
import { CalendarEventItem, CalendarSettings, CalendarTaskItem, TimeOfDay, ViewMode } from "../types";
import { fromDateKey, getWeekDates, minutesToTime, timeToMinutes, today } from "../dateUtils";
import { ensureDailyNote } from "../dailyNotes";
import { findOrCreateNoteByTitle, openFileInMode } from "../navigation";
import { ItemEditorModal } from "../eventEditorModal";
import { CalendarHost, CalendarSubView } from "./shared";
import { YearView } from "./yearView";
import { MonthView } from "./monthView";
import { WeekView, DayView } from "./timelineView";

export const VIEW_TYPE_CALENDAR = "daynest-view";

export class CalendarView extends ItemView implements CalendarHost {
	private anchor: Moment = today();
	private mode: ViewMode;
	private headerEl!: HTMLElement;
	private bodyEl!: HTMLElement;
	private subViews!: Record<ViewMode, CalendarSubView>;
	private unsubscribe?: () => void;

	constructor(leaf: WorkspaceLeaf, private plugin: DaynestPlugin) {
		super(leaf);
		const { defaultView, lastUsedView } = plugin.settings;
		this.mode = defaultView === "last" ? lastUsedView ?? "month" : defaultView;
	}

	get store() {
		return this.plugin.store;
	}

	getViewType(): string {
		return VIEW_TYPE_CALENDAR;
	}

	getDisplayText(): string {
		return "Calendar";
	}

	getIcon(): string {
		return "calendar-days";
	}

	getSettings(): CalendarSettings {
		return this.plugin.settings;
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("daily-calendar-root");

		this.headerEl = container.createDiv({ cls: "daily-calendar-header" });
		this.bodyEl = container.createDiv({ cls: "daily-calendar-body" });

		this.subViews = {
			year: new YearView(this),
			month: new MonthView(this),
			week: new WeekView(this),
			day: new DayView(this),
		};

		this.unsubscribe = this.store.onChange((fullRebuild) => {
			if (fullRebuild) this.renderBody();
			else this.refreshBody();
		});
		this.renderAll();
	}

	async onClose(): Promise<void> {
		this.unsubscribe?.();
		(Object.values(this.subViews) as CalendarSubView[]).forEach((v) => v.destroy?.());
	}

	// -------------------------------------------------------------- rendering

	private renderAll(): void {
		this.applySettingsClasses();
		this.renderHeader();
		this.renderBody();
	}

	private applySettingsClasses(): void {
		const settings = this.getSettings();
		const root = this.contentEl;
		root.classList.remove("dc-density-compact", "dc-density-comfortable", "dc-density-spacious");
		root.classList.add(`dc-density-${settings.eventDensity}`);
		root.classList.remove("dc-radius-none", "dc-radius-small", "dc-radius-medium", "dc-radius-large");
		root.classList.add(`dc-radius-${settings.cornerRadius}`);
	}

	private isRendering = false;
	// "full" always wins over a queued "refresh" — a real navigation must never
	// be silently downgraded into an in-place update.
	private pendingKind: "none" | "refresh" | "full" = "none";

	/** Navigation (mode switch, date change): always a full, from-scratch render. */
	private renderBody(): void {
		this.pendingKind = "full";
		void this.pump();
	}

	/** A data-only change (item created/moved/edited/toggled): prefer the
	 * sub-view's lighter in-place update, so scroll position and any
	 * transient UI state survive and nothing flickers. */
	private refreshBody(): void {
		if (this.pendingKind === "none") this.pendingKind = "refresh";
		void this.pump();
	}

	private async pump(): Promise<void> {
		if (this.isRendering) return; // the active loop below will pick up whatever is now pending
		this.isRendering = true;
		while (this.pendingKind !== "none") {
			const kind = this.pendingKind;
			this.pendingKind = "none";
			const subView = this.subViews[this.mode];
			if (kind === "refresh" && subView.refresh) {
				await subView.refresh();
			} else {
				this.bodyEl.empty();
				await subView.render(this.bodyEl, this.anchor);
			}
		}
		this.isRendering = false;
	}

	private renderHeader(): void {
		this.headerEl.empty();

		this.headerEl.createDiv({ cls: "daily-calendar-title", text: this.formatHeaderTitle() });

		const center = this.headerEl.createDiv({ cls: "daily-calendar-view-switcher" });
		(["day", "week", "month", "year"] as ViewMode[]).forEach((m) => {
			const btn = center.createEl("button", {
				cls: "daily-calendar-switch-btn" + (this.mode === m ? " is-active" : ""),
				text: m.charAt(0).toUpperCase() + m.slice(1),
			});
			btn.addEventListener("click", () => {
				this.setModeInternal(m);
				this.renderAll();
			});
		});

		const right = this.headerEl.createDiv({ cls: "daily-calendar-nav-group" });
		const prevBtn = right.createEl("button", { cls: "daily-calendar-icon-btn", attr: { "aria-label": "Previous" } });
		setIcon(prevBtn, "chevron-left");
		prevBtn.addEventListener("click", () => this.step(-1));

		const todayBtn = right.createEl("button", { cls: "daily-calendar-btn", text: "Today" });
		todayBtn.addEventListener("click", () => this.goToday());

		const nextBtn = right.createEl("button", { cls: "daily-calendar-icon-btn", attr: { "aria-label": "Next" } });
		setIcon(nextBtn, "chevron-right");
		nextBtn.addEventListener("click", () => this.step(1));
	}

	private formatHeaderTitle(): string {
		if (this.mode === "year") return this.anchor.format("YYYY");
		if (this.mode === "month") return this.anchor.format("MMMM YYYY");
		if (this.mode === "week") {
			const dates = getWeekDates(this.anchor, this.getSettings().firstDayOfWeek);
			const start = dates[0];
			const end = dates[6];
			if (start.month() === end.month()) return `${start.format("MMMM D")} – ${end.format("D, YYYY")}`;
			if (start.year() === end.year()) return `${start.format("MMM D")} – ${end.format("MMM D, YYYY")}`;
			return `${start.format("MMM D, YYYY")} – ${end.format("MMM D, YYYY")}`;
		}
		return this.anchor.format("dddd, MMMM D, YYYY");
	}

	private step(direction: 1 | -1): void {
		const unit = this.mode === "year" ? "year" : this.mode === "month" ? "month" : this.mode === "week" ? "week" : "day";
		this.anchor = this.anchor.clone().add(direction, unit);
		this.renderAll();
	}

	private goToday(): void {
		this.anchor = today();
		this.renderAll();
	}

	// --------------------------------------------------------- CalendarHost

	async openDailyNote(date: Moment): Promise<void> {
		try {
			const file = await ensureDailyNote(this.app, date);
			await openFileInMode(this.app, file, this.getSettings().dailyNoteOpenMode);
		} catch (e) {
			console.error("Daynest: failed to open Daily Note", e);
			new Notice("Couldn't open that Daily Note — see the developer console for details.");
		}
	}

	async openLinkedNote(target: string): Promise<void> {
		try {
			const file = await findOrCreateNoteByTitle(this.app, target);
			await openFileInMode(this.app, file, this.getSettings().linkedNoteOpenMode);
		} catch (e) {
			console.error("Daynest: failed to open linked note", e);
			new Notice("Couldn't open that note — see the developer console for details.");
		}
	}

	openEventCreate(date: Moment, prefill?: Partial<{ start: TimeOfDay; end: TimeOfDay; allDay: boolean }>): void {
		const settings = this.getSettings();
		const start = prefill?.start ?? settings.workingHoursStart;
		const end = prefill?.end ?? minutesToTime(timeToMinutes(start) + settings.defaultEventDurationMinutes);
		new ItemEditorModal(
			this.app,
			settings,
			{ kind: "event", title: "", allDay: prefill?.allDay ?? false, start, end, time: start, completed: false, tags: [] },
			{
				onSaveEvent: async (data) => {
					await this.store.createEvent(date, data);
				},
				onSaveTask: async (data) => {
					await this.store.createTask(date, data);
				},
			}
		).open();
	}

	openEventEdit(item: CalendarEventItem): void {
		new ItemEditorModal(
			this.app,
			this.getSettings(),
			{
				kind: "event",
				title: item.title,
				allDay: item.allDay,
				start: item.start,
				end: item.end,
				time: item.start,
				completed: false,
				tags: item.tags,
			},
			{
				onSaveEvent: async (data) => {
					await this.store.updateEvent(item, data);
				},
				onSaveTask: async (data) => {
					// The Task toggle converted this event into a task: move it into the task section.
					await this.store.deleteItem(item);
					await this.store.createTask(fromDateKey(item.date), data);
				},
				onDelete: async () => {
					await this.store.deleteItem(item);
				},
			}
		).open();
	}

	openTaskCreate(date: Moment, prefill?: Partial<{ time: TimeOfDay | null; allDay: boolean }>): void {
		const settings = this.getSettings();
		const time = prefill?.time ?? settings.workingHoursStart;
		new ItemEditorModal(
			this.app,
			settings,
			{
				kind: "task",
				title: "",
				allDay: prefill?.allDay ?? true,
				start: time,
				end: minutesToTime(timeToMinutes(time) + settings.defaultEventDurationMinutes),
				time: prefill?.time ?? null,
				completed: false,
				tags: [],
			},
			{
				onSaveEvent: async (data) => {
					await this.store.createEvent(date, data);
				},
				onSaveTask: async (data) => {
					await this.store.createTask(date, data);
				},
			}
		).open();
	}

	openTaskEdit(item: CalendarTaskItem): void {
		const settings = this.getSettings();
		const time = item.time ?? settings.workingHoursStart;
		new ItemEditorModal(
			this.app,
			settings,
			{
				kind: "task",
				title: item.title,
				allDay: item.allDay,
				start: time,
				end: minutesToTime(timeToMinutes(time) + settings.defaultEventDurationMinutes),
				time: item.time,
				completed: item.completed,
				tags: item.tags,
			},
			{
				onSaveEvent: async (data) => {
					// The Task toggle was switched off: move it into the event section.
					await this.store.deleteItem(item);
					await this.store.createEvent(fromDateKey(item.date), data);
				},
				onSaveTask: async (data) => {
					await this.store.updateTask(item, data);
				},
				onDelete: async () => {
					await this.store.deleteItem(item);
				},
			}
		).open();
	}

	async toggleTask(item: CalendarTaskItem): Promise<void> {
		try {
			await this.store.toggleTaskCompleted(item);
		} catch (e) {
			console.error("Daynest: failed to toggle task", e);
			new Notice("Couldn't update that task — see the developer console for details.");
		}
	}

	goTo(anchor: Moment, mode: ViewMode): void {
		this.anchor = anchor.clone();
		this.setModeInternal(mode);
		this.renderAll();
	}

	/** Sets the active mode and, when "Default view" is set to "Last used view", remembers it for next time. */
	private setModeInternal(mode: ViewMode): void {
		this.mode = mode;
		if (this.plugin.settings.defaultView === "last" && this.plugin.settings.lastUsedView !== mode) {
			this.plugin.settings.lastUsedView = mode;
			void this.plugin.saveSettings();
		}
	}

	// ---------------------------------------------------------- public API
	// Used by main.ts commands (go to today, switch view, create event/task).

	public setMode(mode: ViewMode): void {
		this.setModeInternal(mode);
		this.renderAll();
	}

	public jumpToToday(): void {
		this.goToday();
	}

	public createEventForAnchor(): void {
		this.openEventCreate(this.anchor);
	}

	public createTaskForAnchor(): void {
		this.openTaskCreate(this.anchor);
	}
}
