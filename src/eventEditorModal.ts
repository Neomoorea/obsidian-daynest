import { App, Modal, Notice, Setting, TextComponent, ToggleComponent } from "obsidian";
import { CalendarSettings, TimeOfDay } from "./types";
import { clampTimeOfDay, formatTimeOfDay, minutesToTime, parseTimeString, timeToMinutes } from "./dateUtils";
import { findOrCreateNoteByTitle } from "./navigation";

export interface EventSaveData {
	title: string;
	allDay: boolean;
	start: TimeOfDay;
	end: TimeOfDay;
	tags: string[];
}

export interface TaskSaveData {
	title: string;
	allDay: boolean;
	time: TimeOfDay | null;
	completed: boolean;
	tags: string[];
}

export interface ItemEditorInitial {
	kind: "event" | "task";
	title: string;
	allDay: boolean;
	start: TimeOfDay;
	end: TimeOfDay;
	time: TimeOfDay | null;
	completed: boolean;
	tags: string[];
}

export interface ItemEditorCallbacks {
	onSaveEvent: (data: EventSaveData) => Promise<void>;
	onSaveTask: (data: TaskSaveData) => Promise<void>;
	onDelete?: () => Promise<void>;
}

interface LinkParts {
	/** The displayed/event title — the alias half of "[[Target|Display]]", or the whole thing if there's no alias. */
	display: string;
	/** The linked note's name, or null if the title isn't a wikilink at all. */
	target: string | null;
}

/** A title that is *entirely* a wikilink: "[[Project meeting]]" or "[[Note|Alias]]". */
function decomposeTitle(title: string): LinkParts {
	const m = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/.exec(title.trim());
	if (m) return { display: (m[2] ?? m[1]).trim(), target: m[1].trim() };
	return { display: title, target: null };
}

/** Only uses the "[[Target|Display]]" alias form when the two actually differ — keeps the Markdown minimal otherwise. */
function recomposeTitle(display: string, target: string): string {
	const disp = display.trim();
	const t = target.trim();
	return disp && disp !== t ? `[[${t}|${disp}]]` : `[[${t}]]`;
}

/** Appends any tag not already present in the title. Never removes — tags live in the title text itself. */
function appendMissingTags(title: string, tags: string[]): string {
	const lower = title.toLowerCase();
	const toAppend = tags.filter((t) => t.length > 0 && !lower.includes(`#${t.toLowerCase()}`));
	if (toAppend.length === 0) return title.trim();
	return `${title.trim()} ${toAppend.map((t) => `#${t}`).join(" ")}`.trim();
}

function parseTagsField(raw: string): string[] {
	return raw
		.split(",")
		.map((t) => t.trim().replace(/^#/, "").toLowerCase())
		.filter((t) => t.length > 0);
}

/** Detects a leading task checkbox typed into the title field, e.g. "- [ ] Buy milk" or "[x] Done thing". */
function detectTaskPrefix(title: string): { isTask: boolean; completed: boolean; rest: string } | null {
	const m = /^\s*-?\s*\[\s*([xX]?)\s*\]\s*(.*)$/.exec(title);
	if (!m) return null;
	return { isTask: true, completed: m[1].toLowerCase() === "x", rest: m[2] };
}

/** Single modal for creating and editing both events and tasks, with a Task toggle to convert between them. */
export class ItemEditorModal extends Modal {
	private kind: "event" | "task";
	private title: string;
	private allDay: boolean;
	private start: TimeOfDay;
	private end: TimeOfDay;
	private time: TimeOfDay;
	private completed: boolean;
	private tagsRaw: string;
	private linkEnabled: boolean;
	/** What's in the "Note title" field. Kept in sync with the title above until the user edits it directly. */
	private linkTarget: string;
	private linkTargetTouched: boolean;
	private saving = false;

	private eventTimeRow!: Setting;
	private taskTimeRow!: Setting;
	private completedRow!: Setting;
	private linkTargetRow!: Setting;
	private linkPreviewEl!: HTMLElement;
	private taskToggleComp!: ToggleComponent;
	private allDayToggleComp!: ToggleComponent;
	private completedToggleComp!: ToggleComponent;
	private linkTargetComp!: TextComponent;

	constructor(
		app: App,
		private settings: CalendarSettings,
		initial: ItemEditorInitial,
		private callbacks: ItemEditorCallbacks
	) {
		super(app);
		const parts = decomposeTitle(initial.title);
		this.kind = initial.kind;
		this.title = parts.display;
		this.linkEnabled = parts.target !== null;
		this.linkTarget = parts.target ?? "";
		// Only treat it as a deliberate, established alias (and stop auto-syncing)
		// when the target and display genuinely differ already.
		this.linkTargetTouched = parts.target !== null && parts.target !== parts.display;
		this.allDay = initial.allDay;
		this.start = initial.start;
		this.end = initial.end;
		this.time = initial.time ?? initial.start;
		this.completed = initial.completed;
		this.tagsRaw = initial.tags.join(", ");
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("daily-calendar-editor");
		this.refreshTitleCaption();

		// Title — Enter saves, matching a single-line "quick add" feel.
		new Setting(contentEl).setName("Title").addText((text) => {
			text.setValue(this.title).setPlaceholder("Untitled").onChange((v) => {
				this.title = v;
				if (!this.linkTargetTouched) {
					this.linkTarget = v;
					this.linkTargetComp?.setValue(v);
				}
				this.updateLinkPreview();
			});
			text.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter" && !e.shiftKey) {
					e.preventDefault();
					void this.handleSave();
				}
			});
			window.setTimeout(() => {
				text.inputEl.focus();
				text.inputEl.select();
			}, 20);
		});

		// Hours — Start/End for an event, a single Time for a task.
		this.eventTimeRow = new Setting(contentEl)
			.setName("Start – End")
			.addText((text) => {
				text.inputEl.type = "time";
				text.inputEl.value = formatTimeOfDay(this.start, "24h");
				text.onChange((v) => {
					const t = parseTimeString(v);
					if (t) this.start = t;
				});
			})
			.addText((text) => {
				text.inputEl.type = "time";
				text.inputEl.value = formatTimeOfDay(this.end, "24h");
				text.onChange((v) => {
					const t = parseTimeString(v);
					if (t) this.end = t;
				});
			});

		this.taskTimeRow = new Setting(contentEl).setName("Time").addText((text) => {
			text.inputEl.type = "time";
			text.inputEl.value = formatTimeOfDay(this.time, "24h");
			text.onChange((v) => {
				const t = parseTimeString(v);
				if (t) this.time = t;
			});
		});

		// Task toggle, then All-day below the hours fields — both per explicit request.
		new Setting(contentEl)
			.setName("Task")
			.setDesc("Save this as a task (checkbox) instead of a timed event.")
			.addToggle((t) => {
				this.taskToggleComp = t;
				t.setValue(this.kind === "task").onChange((v) => {
					this.convertKind(v ? "task" : "event");
					this.updateVisibility();
				});
			});

		new Setting(contentEl).setName("All-day").addToggle((t) => {
			this.allDayToggleComp = t;
			t.setValue(this.allDay).onChange((v) => {
				this.allDay = v;
				this.updateVisibility();
			});
		});

		this.completedRow = new Setting(contentEl).setName("Completed").addToggle((t) => {
			this.completedToggleComp = t;
			t.setValue(this.completed).onChange((v) => (this.completed = v));
		});

		new Setting(contentEl)
			.setName("Tags")
			.setDesc("Comma-separated. Adds any tag not already in the title above; existing tags are left untouched.")
			.addText((text) => text.setValue(this.tagsRaw).setPlaceholder("work, meeting").onChange((v) => (this.tagsRaw = v)));

		new Setting(contentEl)
			.setName("Link to a note")
			.setDesc("Creates the note if it doesn't exist yet. Cmd/Ctrl-click the item later to open it.")
			.addToggle((t) =>
				t.setValue(this.linkEnabled).onChange((v) => {
					this.linkEnabled = v;
					this.updateVisibility();
				})
			);

		this.linkTargetRow = new Setting(contentEl)
			.setName("Note title")
			.setDesc(
				"Defaults to the title above, so leaving it as-is just links to a note with that name. Change it to " +
					"give the note a different, more specific name (e.g. append a date) while keeping the title above short " +
					"— the title above then becomes an alias for it."
			)
			.addText((text) => {
				this.linkTargetComp = text;
				text.setValue(this.linkTarget).onChange((v) => {
					this.linkTarget = v;
					this.linkTargetTouched = true;
					this.updateLinkPreview();
				});
			});
		this.linkPreviewEl = this.linkTargetRow.settingEl.createDiv({ cls: "dc-link-preview" });

		const actions = new Setting(contentEl);
		if (this.callbacks.onDelete) {
			actions.addButton((btn) =>
				btn
					.setButtonText("Delete")
					.setWarning()
					.onClick(async () => {
						await this.callbacks.onDelete?.();
						this.close();
					})
			);
		}
		actions.addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()));
		actions.addButton((btn) =>
			btn
				.setButtonText("Save")
				.setCta()
				.onClick(() => void this.handleSave())
		);

		this.updateVisibility();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private refreshTitleCaption(): void {
		const editing = !!this.callbacks.onDelete;
		const noun = this.kind === "task" ? "task" : "event";
		this.titleEl.setText(editing ? `Edit ${noun}` : `New ${noun}`);
	}

	private convertKind(next: "event" | "task"): void {
		if (next === this.kind) return;
		if (next === "task") {
			this.time = this.start;
		} else {
			this.start = this.time;
			this.end = minutesToTime(timeToMinutes(this.time) + this.settings.defaultEventDurationMinutes);
		}
		this.kind = next;
		this.taskToggleComp?.setValue(this.kind === "task");
		this.refreshTitleCaption();
	}

	private updateVisibility(): void {
		const showEventTime = this.kind === "event" && !this.allDay;
		const showTaskTime = this.kind === "task" && !this.allDay;
		this.eventTimeRow.settingEl.style.display = showEventTime ? "" : "none";
		this.taskTimeRow.settingEl.style.display = showTaskTime ? "" : "none";
		this.completedRow.settingEl.style.display = this.kind === "task" ? "" : "none";
		this.linkTargetRow.settingEl.style.display = this.linkEnabled ? "" : "none";
		this.allDayToggleComp?.setValue(this.allDay);
		this.completedToggleComp?.setValue(this.completed);
		if (this.linkEnabled) {
			if (!this.linkTargetTouched) {
				this.linkTarget = this.title;
				this.linkTargetComp?.setValue(this.title);
			}
			this.updateLinkPreview();
		}
	}

	/** Shows exactly what will be written, e.g. "→ [[Meeting]]" or "→ [[Meeting 20260918|Meeting]]" when they differ. */
	private updateLinkPreview(): void {
		if (!this.linkPreviewEl) return;
		const display = this.title.trim();
		const target = (this.linkTarget.trim() || display).trim();
		if (!target) {
			this.linkPreviewEl.setText("");
			return;
		}
		this.linkPreviewEl.setText(`→ ${recomposeTitle(display, target)}`);
	}

	private async handleSave(): Promise<void> {
		if (this.saving) return;

		// "- [ ] Title" typed straight into the title field is an alternate way to create a task.
		const detected = detectTaskPrefix(this.title);
		if (detected) {
			this.convertKind("task");
			this.title = detected.rest;
			this.completed = detected.completed;
			this.updateVisibility();
		}

		if (!this.title.trim()) {
			new Notice(`Give the ${this.kind} a title first.`);
			return;
		}
		if (this.kind === "event" && !this.allDay && timeToMinutes(this.end) <= timeToMinutes(this.start)) {
			new Notice("End time must be after the start time.");
			return;
		}

		this.saving = true;
		try {
			const tags = parseTagsField(this.tagsRaw);
			const displayTitle = this.title.trim();
			let finalTitle = displayTitle;
			if (this.linkEnabled) {
				// Empty, or exactly matching the title, just means "link to a note
				// named after this event" — no alias needed.
				const target = this.linkTarget.trim() || displayTitle;
				await findOrCreateNoteByTitle(this.app, target);
				finalTitle = recomposeTitle(displayTitle, target);
			}
			finalTitle = appendMissingTags(finalTitle, tags);

			if (this.kind === "event") {
				await this.callbacks.onSaveEvent({
					title: finalTitle,
					allDay: this.allDay,
					start: clampTimeOfDay(this.start),
					end: clampTimeOfDay(this.end),
					tags,
				});
			} else {
				await this.callbacks.onSaveTask({
					title: finalTitle,
					allDay: this.allDay,
					time: this.allDay ? null : clampTimeOfDay(this.time),
					completed: this.completed,
					tags,
				});
			}
			this.close();
		} catch (e) {
			console.error(`Daynest: failed to save ${this.kind}`, e);
			new Notice(`Couldn't save that ${this.kind} — see the developer console for details.`);
		} finally {
			this.saving = false;
		}
	}
}
