import { Plugin, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import { CalendarSettings, DEFAULT_SETTINGS, ViewMode } from "./types";
import { CalendarStore } from "./store";
import { CalendarView, VIEW_TYPE_CALENDAR } from "./views/calendarView";
import { DaynestSettingTab } from "./settings";

function freshDefaultSettings(): CalendarSettings {
	return {
		...DEFAULT_SETTINGS,
		workingHoursStart: { ...DEFAULT_SETTINGS.workingHoursStart },
		workingHoursEnd: { ...DEFAULT_SETTINGS.workingHoursEnd },
		colorRules: DEFAULT_SETTINGS.colorRules.map((rule) => ({ ...rule, tags: [...rule.tags] })),
	};
}

export default class DaynestPlugin extends Plugin {
	settings: CalendarSettings = freshDefaultSettings();
	store!: CalendarStore;
	private settingsSaveQueue: Promise<void> = Promise.resolve();

	async onload(): Promise<void> {
		await this.loadSettings();
		this.store = new CalendarStore(this.app, () => this.settings);

		this.registerView(VIEW_TYPE_CALENDAR, (leaf) => new CalendarView(leaf, this));

		this.addRibbonIcon("calendar", "Open Daynest", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-calendar",
			name: "Open Daynest",
			callback: () => void this.activateView(),
		});
		this.addCommand({
			id: "go-to-today",
			name: "Go to today",
			checkCallback: (checking) => this.withActiveView(checking, (v) => v.jumpToToday()),
		});
		(["year", "month", "week", "day"] as ViewMode[]).forEach((mode) => {
			this.addCommand({
				id: `switch-to-${mode}-view`,
				name: `Switch to ${mode.charAt(0).toUpperCase()}${mode.slice(1)} view`,
				checkCallback: (checking) => this.withActiveView(checking, (v) => v.setMode(mode)),
			});
		});
		this.addCommand({
			id: "new-event",
			name: "New event",
			checkCallback: (checking) => this.withActiveView(checking, (v) => v.createEventForAnchor()),
		});
		this.addCommand({
			id: "new-task",
			name: "New task",
			checkCallback: (checking) => this.withActiveView(checking, (v) => v.createTaskForAnchor()),
		});

		this.addSettingTab(new DaynestSettingTab(this.app, this));

		// Live Markdown -> Calendar sync: any change to a Daily Note file (hand
		// edits, sync from another device, other plugins) invalidates that
		// file's cache entry and re-renders any open calendar view.
		this.registerEvent(this.app.vault.on("modify", (file) => this.handleVaultChange(file)));
		this.registerEvent(this.app.vault.on("create", (file) => this.handleVaultChange(file)));
		this.registerEvent(this.app.vault.on("delete", (file) => this.handleVaultChange(file)));
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				this.store.refresh(oldPath);
				this.handleVaultChange(file);
			})
		);
	}

	private handleVaultChange(file: TAbstractFile): void {
		if (!(file instanceof TFile) || file.extension !== "md") return;
		this.store.refresh(file.path);
	}

	private withActiveView(checking: boolean, fn: (view: CalendarView) => void): boolean {
		const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR)[0];
		const view = leaf?.view;
		if (!(view instanceof CalendarView)) return false;
		if (!checking) fn(view);
		return true;
	}

	async activateView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf: WorkspaceLeaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE_CALENDAR, active: true });
		this.app.workspace.revealLeaf(leaf);
	}

	async loadSettings(): Promise<void> {
		const rawData: unknown = await this.loadData();
		const outer = rawData && typeof rawData === "object" && !Array.isArray(rawData)
			? (rawData as Record<string, unknown>)
			: {};
		// Accept both the normal flat Obsidian data.json shape and the wrapped
		// { settings: { ... } } shape used by some older/development builds.
		const isWrapped = !!outer.settings && typeof outer.settings === "object" && !Array.isArray(outer.settings);
		const data = (isWrapped ? outer.settings : outer) as Partial<CalendarSettings>;
		this.settings = {
			...freshDefaultSettings(),
			...data,
			workingHoursStart: { ...DEFAULT_SETTINGS.workingHoursStart, ...(data.workingHoursStart ?? {}) },
			workingHoursEnd: { ...DEFAULT_SETTINGS.workingHoursEnd, ...(data.workingHoursEnd ?? {}) },
			colorRules: Array.isArray(data.colorRules)
				? data.colorRules.map((rule) => ({ ...rule, tags: Array.isArray(rule.tags) ? [...rule.tags] : [] }))
				: freshDefaultSettings().colorRules,
		};
		// Rewrite a wrapped legacy shape once into the flat format that Obsidian
		// and the current plugin use, so the migration itself persists.
		if (isWrapped) await this.saveSettings();
	}

	refreshCalendarAppearance(): void {
		const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR)[0]?.view;
		if (view instanceof CalendarView) view.refreshAppearanceSettings();
	}

	private snapshotSettings(): CalendarSettings {
		return JSON.parse(JSON.stringify(this.settings)) as CalendarSettings;
	}

	async saveSettings(): Promise<void> {
		// Snapshot each write and serialize it. Fast view changes must not race and
		// let an older settings snapshot overwrite the latest lastUsedView value.
		const snapshot = this.snapshotSettings();
		this.settingsSaveQueue = this.settingsSaveQueue
			.catch(() => undefined)
			.then(() => this.saveData(snapshot));
		await this.settingsSaveQueue;
	}

	onunload(): void {
		// Flush a final snapshot as a safety net when Obsidian disables the plugin.
		// This is queued after in-flight writes, so the final/latest values win.
		const snapshot = this.snapshotSettings();
		this.settingsSaveQueue = this.settingsSaveQueue
			.catch(() => undefined)
			.then(() => this.saveData(snapshot));
		void this.settingsSaveQueue.catch((error) => {
			console.error("Daynest: failed to persist settings while unloading", error);
		});
	}

	getCurrentCalendarMode(): ViewMode | null {
		const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR)[0]?.view;
		return view instanceof CalendarView ? view.getCurrentMode() : null;
	}
}
