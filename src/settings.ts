import { App, PluginSettingTab, Setting } from "obsidian";
import type DaynestPlugin from "./main";
import { ColorRule, DefaultViewSetting } from "./types";
import { formatTimeOfDay, parseTimeString } from "./dateUtils";
import { generateRuleId, isValidHexColor } from "./colorRules";

const VIEW_OPTIONS: Record<string, string> = {
	year: "Year",
	month: "Month",
	week: "Week",
	day: "Day",
	last: "Last used view",
};

const WEEKDAY_OPTIONS: Record<string, string> = {
	"0": "Sunday",
	"1": "Monday",
	"2": "Tuesday",
	"3": "Wednesday",
	"4": "Thursday",
	"5": "Friday",
	"6": "Saturday",
};

const OPEN_MODE_OPTIONS: Record<string, string> = {
	current: "Current tab",
	new: "New tab",
	"new-right": "New tab to the right",
};

export class DaynestSettingTab extends PluginSettingTab {
	plugin: DaynestPlugin;

	constructor(app: App, plugin: DaynestPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.renderGeneral(containerEl);
		this.renderDailyNotes(containerEl);
		this.renderColors(containerEl);
		this.renderAppearance(containerEl);
	}

	private async save(invalidateCache = true): Promise<void> {
		await this.plugin.saveSettings();
		if (invalidateCache) this.plugin.store.invalidateAll();
	}

	// ------------------------------------------------------------------ General

	private renderGeneral(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("General").setHeading();

		new Setting(containerEl)
			.setName("Default view")
			.setDesc("Which view Daynest opens to. \"Last used view\" reopens whichever of Year/Month/Week/Day you had open most recently.")
			.addDropdown((dd) => {
				Object.entries(VIEW_OPTIONS).forEach(([value, label]) => dd.addOption(value, label));
				dd.setValue(this.plugin.settings.defaultView).onChange(async (value) => {
					this.plugin.settings.defaultView = value as DefaultViewSetting;
					await this.save(false);
				});
			});

		new Setting(containerEl)
			.setName("First day of week")
			.addDropdown((dd) => {
				Object.entries(WEEKDAY_OPTIONS).forEach(([value, label]) => dd.addOption(value, label));
				dd.setValue(String(this.plugin.settings.firstDayOfWeek)).onChange(async (value) => {
					this.plugin.settings.firstDayOfWeek = parseInt(value, 10);
					await this.save(false);
				});
			});

		new Setting(containerEl)
			.setName("Time format")
			.addDropdown((dd) => {
				dd.addOption("24h", "24-hour");
				dd.addOption("12h", "12-hour (AM/PM)");
				dd.setValue(this.plugin.settings.timeFormat).onChange(async (value) => {
					this.plugin.settings.timeFormat = value as "12h" | "24h";
					await this.save(false);
				});
			});

		new Setting(containerEl)
			.setName("Show weekends")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.showWeekends).onChange(async (v) => {
					this.plugin.settings.showWeekends = v;
					await this.save(false);
				})
			);

		new Setting(containerEl)
			.setName("Show week numbers")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.showWeekNumbers).onChange(async (v) => {
					this.plugin.settings.showWeekNumbers = v;
					await this.save(false);
				})
			);

		new Setting(containerEl)
			.setName("Show current time indicator")
			.setDesc("A red line across Week/Day view marking the current time.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.showCurrentTimeIndicator).onChange(async (v) => {
					this.plugin.settings.showCurrentTimeIndicator = v;
					await this.save(false);
				})
			);

		new Setting(containerEl)
			.setName("Auto-scroll to current time")
			.setDesc("Jump Week/Day view to the current time when opened.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.autoScrollToCurrentTime).onChange(async (v) => {
					this.plugin.settings.autoScrollToCurrentTime = v;
					await this.save(false);
				})
			);

		new Setting(containerEl)
			.setName("Default event duration")
			.setDesc("Minutes given to a new event created without dragging (e.g. via double-click).")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.defaultEventDurationMinutes))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n > 0) {
							this.plugin.settings.defaultEventDurationMinutes = n;
							await this.save(false);
						}
					})
			);

		new Setting(containerEl)
			.setName("Minimum event duration")
			.setDesc("Shortest duration a drag-created or resized event can have, in minutes.")
			.addText((text) =>
				text.setValue(String(this.plugin.settings.minEventDurationMinutes)).onChange(async (value) => {
					const n = parseInt(value, 10);
					if (!isNaN(n) && n > 0) {
						this.plugin.settings.minEventDurationMinutes = n;
						await this.save(false);
					}
				})
			);

		new Setting(containerEl)
			.setName("Working hours")
			.setDesc(
				"Defines the all-day boundary (an event spanning exactly these hours is treated as all-day) and where Week/Day view is emphasised."
			)
			.addText((text) => {
				text.inputEl.type = "time";
				text.inputEl.value = formatTimeOfDay(this.plugin.settings.workingHoursStart, "24h");
				text.onChange(async (value) => {
					const t = parseTimeString(value);
					if (t) {
						this.plugin.settings.workingHoursStart = t;
						await this.save();
					}
				});
			})
			.addText((text) => {
				text.inputEl.type = "time";
				text.inputEl.value = formatTimeOfDay(this.plugin.settings.workingHoursEnd, "24h");
				text.onChange(async (value) => {
					const t = parseTimeString(value);
					if (t) {
						this.plugin.settings.workingHoursEnd = t;
						await this.save();
					}
				});
			});
	}

	// -------------------------------------------------------------- Daily Notes

	private renderDailyNotes(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Daily Notes & sections").setHeading();

		const info = containerEl.createEl("p", { cls: "setting-item-description" });
		info.style.marginBottom = "1em";
		info.setText(
			"Daynest reads its folder, filename format, and template from Obsidian's core Daily Notes plugin " +
				"(or Periodic Notes if that's what you use instead). When you create an event or task on a date with no " +
				"note yet, that note is created automatically from your template."
		);

		new Setting(containerEl)
			.setName("Events heading")
			.setDesc("The exact heading text, including #, under which events are read and written.")
			.addText((text) =>
				text.setValue(this.plugin.settings.eventsHeading).onChange(async (value) => {
					if (value.trim()) {
						this.plugin.settings.eventsHeading = value;
						await this.save();
					}
				})
			);

		new Setting(containerEl)
			.setName("Separate task section")
			.setDesc("Keep tasks in their own heading instead of mixing them in with events.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.separateTaskSection).onChange(async (v) => {
					this.plugin.settings.separateTaskSection = v;
					await this.save();
					this.display();
				})
			);

		if (this.plugin.settings.separateTaskSection) {
			new Setting(containerEl)
				.setName("Tasks heading")
				.setDesc("The exact heading text, including #, under which tasks are read and written.")
				.addText((text) =>
					text.setValue(this.plugin.settings.tasksHeading).onChange(async (value) => {
						if (value.trim() && value.trim() !== this.plugin.settings.eventsHeading.trim()) {
							this.plugin.settings.tasksHeading = value;
							await this.save();
						}
					})
				);
		}

		new Setting(containerEl)
			.setName("Event spacing")
			.setDesc("Blank line between each event in the Markdown, or not.")
			.addDropdown((dd) =>
				dd
					.addOption("compact", "Compact")
					.addOption("spacious", "Spacious")
					.setValue(this.plugin.settings.eventSpacing)
					.onChange(async (v) => {
						this.plugin.settings.eventSpacing = v as "compact" | "spacious";
						await this.save();
					})
			);

		new Setting(containerEl)
			.setName("Task spacing")
			.addDropdown((dd) =>
				dd
					.addOption("compact", "Compact")
					.addOption("spacious", "Spacious")
					.setValue(this.plugin.settings.taskSpacing)
					.onChange(async (v) => {
						this.plugin.settings.taskSpacing = v as "compact" | "spacious";
						await this.save();
					})
			);

		new Setting(containerEl)
			.setName("Open Daily Note in")
			.addDropdown((dd) => {
				Object.entries(OPEN_MODE_OPTIONS).forEach(([value, label]) => dd.addOption(value, label));
				dd.setValue(this.plugin.settings.dailyNoteOpenMode).onChange(async (v) => {
					this.plugin.settings.dailyNoteOpenMode = v as typeof this.plugin.settings.dailyNoteOpenMode;
					await this.save(false);
				});
			});

		new Setting(containerEl)
			.setName("Open linked notes in")
			.setDesc("Used when Cmd/Ctrl-clicking an event or task that contains a wikilink.")
			.addDropdown((dd) => {
				Object.entries(OPEN_MODE_OPTIONS).forEach(([value, label]) => dd.addOption(value, label));
				dd.setValue(this.plugin.settings.linkedNoteOpenMode).onChange(async (v) => {
					this.plugin.settings.linkedNoteOpenMode = v as typeof this.plugin.settings.linkedNoteOpenMode;
					await this.save(false);
				});
			});
	}

	// ------------------------------------------------------------------- Colors

	private renderColors(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Colours").setHeading();

		new Setting(containerEl)
			.setName("Default colour")
			.setDesc("Used when nothing else matches an item's tags.")
			.addColorPicker((picker) =>
				picker.setValue(this.plugin.settings.defaultEventColor).onChange(async (v) => {
					this.plugin.settings.defaultEventColor = v;
					await this.save(false);
				})
			);

		const desc = containerEl.createEl("p", { cls: "setting-item-description" });
		desc.style.marginBottom = "0.5em";
		desc.setText(
			"A rule matches when an item has ALL of its listed tags. When more than one rule matches, the rule " +
				"requiring the most tags wins — so a combination like \"work, meeting\" beats a plain \"work\" rule. " +
				"Ties go to whichever rule is higher in this list; reorder with the arrows."
		);

		const listEl = containerEl.createDiv({ cls: "daily-calendar-color-rules" });
		this.renderColorRuleRows(listEl);

		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText("+ Add colour rule")
				.setCta()
				.onClick(async () => {
					this.plugin.settings.colorRules.push({ id: generateRuleId(), tags: [], color: "#8E8E93" });
					await this.save(false);
					this.renderColorRuleRows(listEl);
				})
		);
	}

	private renderColorRuleRows(listEl: HTMLElement): void {
		listEl.empty();
		const rules = this.plugin.settings.colorRules;

		rules.forEach((rule, index) => {
			const row = new Setting(listEl)
				.addText((text) => {
					text
						.setPlaceholder("work, meeting")
						.setValue(rule.tags.join(", "))
						.onChange(async (value) => {
							rule.tags = value
								.split(",")
								.map((t) => t.trim().replace(/^#/, "").toLowerCase())
								.filter((t) => t.length > 0);
							await this.save(false);
						});
				})
				.addColorPicker((picker) =>
					picker.setValue(isValidHexColor(rule.color) ? rule.color : "#8E8E93").onChange(async (v) => {
						rule.color = v;
						await this.save(false);
					})
				)
				.addExtraButton((btn) =>
					btn
						.setIcon("arrow-up")
						.setTooltip("Move up")
						.setDisabled(index === 0)
						.onClick(async () => {
							if (index === 0) return;
							[rules[index - 1], rules[index]] = [rules[index], rules[index - 1]];
							await this.save(false);
							this.renderColorRuleRows(listEl);
						})
				)
				.addExtraButton((btn) =>
					btn
						.setIcon("arrow-down")
						.setTooltip("Move down")
						.setDisabled(index === rules.length - 1)
						.onClick(async () => {
							if (index === rules.length - 1) return;
							[rules[index + 1], rules[index]] = [rules[index], rules[index + 1]];
							await this.save(false);
							this.renderColorRuleRows(listEl);
						})
				)
				.addExtraButton((btn) =>
					btn
						.setIcon("trash")
						.setTooltip("Delete rule")
						.onClick(async () => {
							this.plugin.settings.colorRules = rules.filter((r: ColorRule) => r.id !== rule.id);
							await this.save(false);
							this.renderColorRuleRows(listEl);
						})
				);
			row.infoEl.remove(); // rows are compact — the placeholder text doubles as the label
		});
	}

	// --------------------------------------------------------------- Appearance

	private renderAppearance(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Appearance").setHeading();

		new Setting(containerEl)
			.setName("Event density")
			.setDesc("Padding and font size inside event blocks.")
			.addDropdown((dd) =>
				dd
					.addOption("compact", "Compact")
					.addOption("comfortable", "Comfortable")
					.addOption("spacious", "Spacious")
					.setValue(this.plugin.settings.eventDensity)
					.onChange(async (v) => {
						this.plugin.settings.eventDensity = v as typeof this.plugin.settings.eventDensity;
						await this.save(false);
					})
			);

		new Setting(containerEl)
			.setName("Calendar scale")
			.setDesc("Height of an hour row in Week/Day view.")
			.addDropdown((dd) =>
				dd
					.addOption("small", "Small")
					.addOption("medium", "Medium")
					.addOption("large", "Large")
					.setValue(this.plugin.settings.calendarScale)
					.onChange(async (v) => {
						this.plugin.settings.calendarScale = v as typeof this.plugin.settings.calendarScale;
						await this.save(false);
					})
			);

		new Setting(containerEl)
			.setName("Weekend shading")
			.setDesc("Subtle background tint on Saturday/Sunday columns and cells.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.weekendShading).onChange(async (v) => {
					this.plugin.settings.weekendShading = v;
					await this.save(false);
				})
			);

		new Setting(containerEl)
			.setName("Corner radius")
			.setDesc("Roundness of event cards and other calendar surfaces.")
			.addDropdown((dd) =>
				dd
					.addOption("none", "None")
					.addOption("small", "Small")
					.addOption("medium", "Medium")
					.addOption("large", "Large")
					.setValue(this.plugin.settings.cornerRadius)
					.onChange(async (v) => {
						this.plugin.settings.cornerRadius = v as typeof this.plugin.settings.cornerRadius;
						await this.save(false);
					})
			);
	}
}
