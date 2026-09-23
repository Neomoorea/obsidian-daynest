import { Plugin, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import { CalendarSettings, DEFAULT_SETTINGS, ViewMode } from "./types";
import { CalendarStore } from "./store";
import { CalendarView, VIEW_TYPE_CALENDAR } from "./views/calendarView";
import { DaynestSettingTab } from "./settings";

export default class DaynestPlugin extends Plugin {
	settings: CalendarSettings = DEFAULT_SETTINGS;
	store!: CalendarStore;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.store = new CalendarStore(this.app, () => this.settings);

		this.registerView(VIEW_TYPE_CALENDAR, (leaf) => new CalendarView(leaf, this));

		this.addRibbonIcon("calendar-days", "Open Daynest", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-calendar",
			name: "Open calendar",
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
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		if (!Array.isArray(this.settings.colorRules)) {
			this.settings.colorRules = DEFAULT_SETTINGS.colorRules;
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
