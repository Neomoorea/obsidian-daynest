/*
GENERATED DAYNEST PLUGIN BUNDLE
Source files are in the src/ directory.
*/

"use strict";
const __nativeRequire = require;
const __modules = {
"src/colorRules.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveColor = resolveColor;
exports.generateRuleId = generateRuleId;
exports.isValidHexColor = isValidHexColor;
/**
 * Resolves the display colour for a set of tags against the user's ordered
 * colour rules. A rule matches only if ALL of its tags are present on the
 * item. Among matching rules, the one requiring the MOST tags wins (a
 * combination rule beats a single-tag rule); ties break by the rule's
 * position in the user's list (earlier = higher priority).
 */
function resolveColor(tags, rules, defaultColor) {
    const tagSet = new Set(tags.map((t) => t.toLowerCase()));
    let best = null;
    for (const rule of rules) {
        if (rule.tags.length === 0)
            continue;
        const allMatch = rule.tags.every((t) => tagSet.has(t.toLowerCase()));
        if (!allMatch)
            continue;
        if (!best || rule.tags.length > best.tags.length) {
            best = rule;
        }
    }
    return best ? best.color : defaultColor;
}
function generateRuleId() {
    return `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
/** Basic #RGB / #RRGGBB validation for the settings UI. */
function isValidHexColor(value) {
    return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

},
"src/dailyNotes.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDailyNoteConfig = getDailyNoteConfig;
exports.isDailyNotesAvailable = isDailyNotesAvailable;
exports.getPathForDate = getPathForDate;
exports.getDateFromFile = getDateFromFile;
exports.findDailyNote = findDailyNote;
exports.ensureDailyNote = ensureDailyNote;
const obsidian_1 = require("obsidian");
const FALLBACK_CONFIG = { folder: "", format: "YYYY-MM-DD", template: "" };
function readCoreDailyNotesConfig(app) {
    var _a, _b, _c, _d, _e, _f;
    try {
        // Unofficial but long-stable internal API — the same one used by most
        // community plugins (including obsidian-daily-notes-interface) to read
        // core Daily Notes settings.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const internalPlugins = app.internalPlugins;
        const plugin = (_a = internalPlugins === null || internalPlugins === void 0 ? void 0 : internalPlugins.getPluginById) === null || _a === void 0 ? void 0 : _a.call(internalPlugins, "daily-notes");
        if (!(plugin === null || plugin === void 0 ? void 0 : plugin.enabled))
            return null;
        const options = (_c = (_b = plugin.instance) === null || _b === void 0 ? void 0 : _b.options) !== null && _c !== void 0 ? _c : {};
        return {
            folder: ((_d = options.folder) !== null && _d !== void 0 ? _d : "").trim().replace(/\/+$/, ""),
            format: ((_e = options.format) !== null && _e !== void 0 ? _e : "").trim() || "YYYY-MM-DD",
            template: ((_f = options.template) !== null && _f !== void 0 ? _f : "").trim(),
        };
    }
    catch (e) {
        return null;
    }
}
/** Fallback for vaults that use the community "Periodic Notes" plugin instead of core Daily Notes. */
function readPeriodicNotesConfig(app) {
    var _a, _b, _c, _d, _e, _f;
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const plugin = (_b = (_a = app.plugins) === null || _a === void 0 ? void 0 : _a.getPlugin) === null || _b === void 0 ? void 0 : _b.call(_a, "periodic-notes");
        const daily = (_c = plugin === null || plugin === void 0 ? void 0 : plugin.settings) === null || _c === void 0 ? void 0 : _c.daily;
        if (!(daily === null || daily === void 0 ? void 0 : daily.enabled))
            return null;
        return {
            folder: ((_d = daily.folder) !== null && _d !== void 0 ? _d : "").trim().replace(/\/+$/, ""),
            format: ((_e = daily.format) !== null && _e !== void 0 ? _e : "").trim() || "YYYY-MM-DD",
            template: ((_f = daily.template) !== null && _f !== void 0 ? _f : "").trim(),
        };
    }
    catch (e) {
        return null;
    }
}
function getDailyNoteConfig(app) {
    var _a, _b;
    return (_b = (_a = readCoreDailyNotesConfig(app)) !== null && _a !== void 0 ? _a : readPeriodicNotesConfig(app)) !== null && _b !== void 0 ? _b : FALLBACK_CONFIG;
}
function isDailyNotesAvailable(app) {
    return readCoreDailyNotesConfig(app) !== null || readPeriodicNotesConfig(app) !== null;
}
function getPathForDate(app, date, config) {
    const cfg = config !== null && config !== void 0 ? config : getDailyNoteConfig(app);
    const filename = date.format(cfg.format) + ".md";
    const path = cfg.folder ? `${cfg.folder}/${filename}` : filename;
    return (0, obsidian_1.normalizePath)(path);
}
function getDateFromFile(app, file, config) {
    const cfg = config !== null && config !== void 0 ? config : getDailyNoteConfig(app);
    const m = (0, obsidian_1.moment)(file.basename, cfg.format, true);
    return m.isValid() ? m.startOf("day") : null;
}
function findDailyNote(app, date, config) {
    const file = app.vault.getAbstractFileByPath(getPathForDate(app, date, config));
    return file instanceof obsidian_1.TFile ? file : null;
}
async function ensureFolderExists(app, folderPath) {
    if (!folderPath || folderPath === "/")
        return;
    const existing = app.vault.getAbstractFileByPath(folderPath);
    if (existing instanceof obsidian_1.TFolder)
        return;
    try {
        await app.vault.createFolder(folderPath);
    }
    catch (e) {
        /* likely already exists due to a race between two near-simultaneous creations */
    }
}
function applyTemplateVariables(templateContent, date) {
    let result = templateContent;
    result = result.replace(/\{\{\s*date\s*:\s*([^}]+)\}\}/gi, (_m, fmt) => date.format(String(fmt).trim()));
    result = result.replace(/\{\{\s*time\s*:\s*([^}]+)\}\}/gi, (_m, fmt) => (0, obsidian_1.moment)().format(String(fmt).trim()));
    result = result.replace(/\{\{\s*date\s*\}\}/gi, date.format("YYYY-MM-DD"));
    result = result.replace(/\{\{\s*time\s*\}\}/gi, (0, obsidian_1.moment)().format("HH:mm"));
    result = result.replace(/\{\{\s*title\s*\}\}/gi, date.format("YYYY-MM-DD"));
    return result;
}
async function readTemplateContent(app, templatePath) {
    if (!templatePath)
        return "";
    const path = templatePath.toLowerCase().endsWith(".md") ? templatePath : `${templatePath}.md`;
    const file = app.vault.getAbstractFileByPath((0, obsidian_1.normalizePath)(path));
    return file instanceof obsidian_1.TFile ? await app.vault.read(file) : "";
}
/**
 * Finds the Daily Note for `date`, creating it from the configured template
 * if it doesn't exist yet. This is what lets the calendar guarantee a place
 * to write an event/task even for a date with no note yet (spec §26).
 */
async function ensureDailyNote(app, date) {
    const config = getDailyNoteConfig(app);
    const path = getPathForDate(app, date, config);
    const existing = app.vault.getAbstractFileByPath(path);
    if (existing instanceof obsidian_1.TFile)
        return existing;
    const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    await ensureFolderExists(app, folder);
    const templateRaw = await readTemplateContent(app, config.template);
    const content = templateRaw ? applyTemplateVariables(templateRaw, date) : "";
    try {
        return await app.vault.create(path, content);
    }
    catch (e) {
        // Another write may have created it a moment ago — recover instead of failing.
        const retried = app.vault.getAbstractFileByPath(path);
        if (retried instanceof obsidian_1.TFile)
            return retried;
        throw e;
    }
}

},
"src/dateUtils.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEEKDAY_NAMES_SHORT = exports.WEEKDAY_NAMES = exports.MONTH_NAMES_SHORT = exports.MONTH_NAMES = void 0;
exports.today = today;
exports.dateKey = dateKey;
exports.fromDateKey = fromDateKey;
exports.isSameDay = isSameDay;
exports.isToday = isToday;
exports.isWeekendDate = isWeekendDate;
exports.pad2 = pad2;
exports.timeToMinutes = timeToMinutes;
exports.minutesToTime = minutesToTime;
exports.compareTimeOfDay = compareTimeOfDay;
exports.clampTimeOfDay = clampTimeOfDay;
exports.snapMinutes = snapMinutes;
exports.formatTimeOfDay = formatTimeOfDay;
exports.parseTimeString = parseTimeString;
exports.startOfWeek = startOfWeek;
exports.getWeekDates = getWeekDates;
exports.getMonthGridWeeks = getMonthGridWeeks;
exports.weekNumber = weekNumber;
exports.orderedWeekdayShortNames = orderedWeekdayShortNames;
const obsidian_1 = require("obsidian");
function today() {
    return (0, obsidian_1.moment)().startOf("day");
}
function dateKey(m) {
    return m.format("YYYY-MM-DD");
}
function fromDateKey(key) {
    return (0, obsidian_1.moment)(key, "YYYY-MM-DD", true).startOf("day");
}
function isSameDay(a, b) {
    return a.isSame(b, "day");
}
function isToday(m) {
    return isSameDay(m, today());
}
function isWeekendDate(m) {
    const dow = m.day();
    return dow === 0 || dow === 6;
}
function pad2(n) {
    return n < 10 ? "0" + n : String(n);
}
function timeToMinutes(t) {
    return t.hour * 60 + t.minute;
}
function minutesToTime(mins) {
    const m = ((Math.round(mins) % 1440) + 1440) % 1440;
    return { hour: Math.floor(m / 60), minute: m % 60 };
}
function compareTimeOfDay(a, b) {
    return timeToMinutes(a) - timeToMinutes(b);
}
function clampTimeOfDay(t) {
    const hour = Math.min(23, Math.max(0, Math.floor(t.hour)));
    const minute = Math.min(59, Math.max(0, Math.floor(t.minute)));
    return { hour, minute };
}
/** Round a minute-of-day value to the nearest snap increment (e.g. 5 or 15 minutes). */
function snapMinutes(mins, snap) {
    return Math.round(mins / snap) * snap;
}
function formatTimeOfDay(t, format) {
    if (format === "24h")
        return `${pad2(t.hour)}:${pad2(t.minute)}`;
    if (t.hour === 0 && t.minute === 0)
        return "Midnight";
    if (t.hour === 12 && t.minute === 0)
        return "Midday";
    const period = t.hour < 12 ? "AM" : "PM";
    let h = t.hour % 12;
    if (h === 0)
        h = 12;
    return t.minute === 0 ? `${h} ${period}` : `${h}:${pad2(t.minute)} ${period}`;
}
function parseTimeString(s) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
    if (!match)
        return null;
    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59)
        return null;
    return { hour, minute };
}
function startOfWeek(m, firstDayOfWeek) {
    const day = m.day(); // 0 (Sun) - 6 (Sat)
    const diff = (day - firstDayOfWeek + 7) % 7;
    return m.clone().subtract(diff, "days").startOf("day");
}
function getWeekDates(anchor, firstDayOfWeek) {
    const start = startOfWeek(anchor, firstDayOfWeek);
    return Array.from({ length: 7 }, (_, i) => start.clone().add(i, "days"));
}
/** Returns the calendar grid for a month as an array of 7-day weeks (4-6 rows). */
function getMonthGridWeeks(anchor, firstDayOfWeek) {
    const monthStart = anchor.clone().startOf("month");
    const monthEnd = anchor.clone().endOf("month");
    const gridStart = startOfWeek(monthStart, firstDayOfWeek);
    const gridEnd = startOfWeek(monthEnd, firstDayOfWeek).add(6, "days");
    const weeks = [];
    const cursor = gridStart.clone();
    while (cursor.isSameOrBefore(gridEnd, "day")) {
        const week = [];
        for (let i = 0; i < 7; i++) {
            week.push(cursor.clone());
            cursor.add(1, "day");
        }
        weeks.push(week);
    }
    return weeks;
}
function weekNumber(m) {
    return m.isoWeek();
}
exports.MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];
exports.MONTH_NAMES_SHORT = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
exports.WEEKDAY_NAMES = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
exports.WEEKDAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function orderedWeekdayShortNames(firstDayOfWeek) {
    return Array.from({ length: 7 }, (_, i) => exports.WEEKDAY_NAMES_SHORT[(firstDayOfWeek + i) % 7]);
}

},
"src/eventEditorModal.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ItemEditorModal = void 0;
const obsidian_1 = require("obsidian");
const dateUtils_1 = require("./dateUtils");
const navigation_1 = require("./navigation");
const tags_1 = require("./tags");
/** A title that is *entirely* a wikilink: "[[Project meeting]]" or "[[Note|Alias]]". */
function decomposeTitle(title) {
    var _a;
    const m = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/.exec(title.trim());
    if (m)
        return { display: ((_a = m[2]) !== null && _a !== void 0 ? _a : m[1]).trim(), target: m[1].trim() };
    return { display: title, target: null };
}
/** Only uses the "[[Target|Display]]" alias form when the two actually differ — keeps the Markdown minimal otherwise. */
function recomposeTitle(display, target) {
    const disp = display.trim();
    const t = target.trim();
    return disp && disp !== t ? `[[${t}|${disp}]]` : `[[${t}]]`;
}
/** Detects a leading task checkbox typed into the title field, e.g. "- [ ] Buy milk" or "[x] Done thing". */
function detectTaskPrefix(title) {
    const m = /^\s*-?\s*\[\s*([xX]?)\s*\]\s*(.*)$/.exec(title);
    if (!m)
        return null;
    return { isTask: true, completed: m[1].toLowerCase() === "x", rest: m[2] };
}
/** Single modal for creating and editing both events and tasks, with a Task toggle to convert between them. */
class ItemEditorModal extends obsidian_1.Modal {
    constructor(app, settings, initial, callbacks) {
        var _a, _b;
        super(app);
        this.settings = settings;
        this.callbacks = callbacks;
        this.saving = false;
        this.onWindowKeyDown = (e) => {
            if (e.key !== "Escape")
                return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            this.close();
        };
        const parts = decomposeTitle((0, tags_1.stripTags)(initial.title));
        this.kind = initial.kind;
        this.title = (0, tags_1.withTags)(parts.display, initial.tags);
        this.linkEnabled = parts.target !== null;
        this.linkTarget = (_a = parts.target) !== null && _a !== void 0 ? _a : "";
        // Only treat it as a deliberate, established alias (and stop auto-syncing)
        // when the target and display genuinely differ already.
        this.linkTargetTouched = parts.target !== null && parts.target !== parts.display;
        this.allDay = initial.allDay;
        this.start = initial.start;
        this.end = initial.end;
        this.time = (_b = initial.time) !== null && _b !== void 0 ? _b : initial.start;
        this.completed = initial.completed;
        this.tagsRaw = initial.tags.join(", ");
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("daily-calendar-editor");
        window.addEventListener("keydown", this.onWindowKeyDown, true);
        this.refreshTitleCaption();
        // Title — Enter saves, matching a single-line "quick add" feel.
        new obsidian_1.Setting(contentEl).setName("Title").addText((text) => {
            this.titleComp = text;
            text.setValue(this.title).setPlaceholder("Untitled").onChange((v) => {
                var _a, _b;
                this.title = v;
                this.tagsRaw = (0, tags_1.extractTagsFromTitle)(v).join(", ");
                (_a = this.tagsComp) === null || _a === void 0 ? void 0 : _a.setValue(this.tagsRaw);
                if (!this.linkTargetTouched) {
                    this.linkTarget = (0, tags_1.stripTags)(v);
                    (_b = this.linkTargetComp) === null || _b === void 0 ? void 0 : _b.setValue(this.linkTarget);
                }
                this.updateLinkPreview();
            });
            this.bindEnterToSave(text.inputEl);
            window.setTimeout(() => {
                text.inputEl.focus();
                text.inputEl.select();
            }, 20);
        });
        // Hours — Start/End for an event, a single Time for a task.
        this.eventTimeRow = new obsidian_1.Setting(contentEl)
            .setName("Start – End")
            .addText((text) => {
            text.inputEl.type = "time";
            text.inputEl.value = (0, dateUtils_1.formatTimeOfDay)(this.start, "24h");
            text.onChange((v) => {
                const t = (0, dateUtils_1.parseTimeString)(v);
                if (t)
                    this.start = t;
            });
            this.bindEnterToSave(text.inputEl, () => {
                const t = (0, dateUtils_1.parseTimeString)(text.inputEl.value);
                if (t)
                    this.start = t;
            });
        })
            .addText((text) => {
            text.inputEl.type = "time";
            text.inputEl.value = (0, dateUtils_1.formatTimeOfDay)(this.end, "24h");
            text.onChange((v) => {
                const t = (0, dateUtils_1.parseTimeString)(v);
                if (t)
                    this.end = t;
            });
            this.bindEnterToSave(text.inputEl, () => {
                const t = (0, dateUtils_1.parseTimeString)(text.inputEl.value);
                if (t)
                    this.end = t;
            });
        });
        this.taskTimeRow = new obsidian_1.Setting(contentEl).setName("Time").addText((text) => {
            text.inputEl.type = "time";
            text.inputEl.value = (0, dateUtils_1.formatTimeOfDay)(this.time, "24h");
            text.onChange((v) => {
                const t = (0, dateUtils_1.parseTimeString)(v);
                if (t)
                    this.time = t;
            });
            this.bindEnterToSave(text.inputEl, () => {
                const t = (0, dateUtils_1.parseTimeString)(text.inputEl.value);
                if (t)
                    this.time = t;
            });
        });
        // Task toggle, then All-day below the hours fields — both per explicit request.
        new obsidian_1.Setting(contentEl)
            .setName("Task")
            .setDesc("Save this as a task (checkbox) instead of a timed event.")
            .addToggle((t) => {
            this.taskToggleComp = t;
            t.setValue(this.kind === "task").onChange((v) => {
                this.convertKind(v ? "task" : "event");
                this.updateVisibility();
            });
        });
        new obsidian_1.Setting(contentEl).setName("All-day").addToggle((t) => {
            this.allDayToggleComp = t;
            t.setValue(this.allDay).onChange((v) => {
                this.allDay = v;
                this.updateVisibility();
            });
        });
        this.completedRow = new obsidian_1.Setting(contentEl).setName("Completed").addToggle((t) => {
            this.completedToggleComp = t;
            t.setValue(this.completed).onChange((v) => (this.completed = v));
        });
        new obsidian_1.Setting(contentEl)
            .setName("Tags")
            .setDesc("Separate tags with commas, spaces, or #.")
            .addText((text) => {
            this.tagsComp = text;
            text.setValue(this.tagsRaw).setPlaceholder("work, meeting").onChange((v) => {
                var _a, _b;
                this.tagsRaw = v;
                this.title = (0, tags_1.withTags)(this.title, (0, tags_1.parseTagList)(v));
                (_a = this.titleComp) === null || _a === void 0 ? void 0 : _a.setValue(this.title);
                if (!this.linkTargetTouched) {
                    this.linkTarget = (0, tags_1.stripTags)(this.title);
                    (_b = this.linkTargetComp) === null || _b === void 0 ? void 0 : _b.setValue(this.linkTarget);
                }
                this.updateLinkPreview();
            });
            this.bindEnterToSave(text.inputEl);
        });
        new obsidian_1.Setting(contentEl)
            .setName("Link to a note")
            .setDesc("Creates the note if it doesn't exist yet. Cmd/Ctrl-click the item later to open it.")
            .addToggle((t) => t.setValue(this.linkEnabled).onChange((v) => {
            this.linkEnabled = v;
            this.updateVisibility();
        }));
        this.linkTargetRow = new obsidian_1.Setting(contentEl)
            .setName("Note title")
            .setDesc("Defaults to the title above, so leaving it as-is just links to a note with that name. Change it to " +
            "give the note a different, more specific name (e.g. append a date) while keeping the title above short " +
            "— the title above then becomes an alias for it.")
            .addText((text) => {
            this.linkTargetComp = text;
            text.setValue(this.linkTarget).onChange((v) => {
                this.linkTarget = v;
                this.linkTargetTouched = true;
                this.updateLinkPreview();
            });
        });
        this.linkPreviewEl = this.linkTargetRow.settingEl.createDiv({ cls: "dc-link-preview" });
        const actions = new obsidian_1.Setting(contentEl);
        if (this.callbacks.onDelete) {
            actions.addButton((btn) => btn
                .setButtonText("Delete")
                .setWarning()
                .onClick(async () => {
                var _a, _b;
                try {
                    await ((_b = (_a = this.callbacks).onDelete) === null || _b === void 0 ? void 0 : _b.call(_a));
                    this.close();
                }
                catch (e) {
                    console.error(`Daynest: failed to delete ${this.kind}`, e);
                    new obsidian_1.Notice(`Couldn't delete that ${this.kind} — see the developer console for details.`);
                }
            }));
        }
        actions.addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()));
        actions.addButton((btn) => btn
            .setButtonText("Save")
            .setCta()
            .onClick(() => void this.handleSave()));
        this.updateVisibility();
    }
    /** Enter saves from every single-line editor control, including native time inputs. */
    bindEnterToSave(inputEl, syncValue) {
        inputEl.addEventListener("keydown", (e) => {
            if (e.key !== "Enter" || e.shiftKey)
                return;
            syncValue === null || syncValue === void 0 ? void 0 : syncValue();
            e.preventDefault();
            e.stopPropagation();
            void this.handleSave();
        });
    }
    onClose() {
        window.removeEventListener("keydown", this.onWindowKeyDown, true);
        this.contentEl.empty();
    }
    refreshTitleCaption() {
        const editing = !!this.callbacks.onDelete;
        const noun = this.kind === "task" ? "task" : "event";
        this.titleEl.setText(editing ? `Edit ${noun}` : `New ${noun}`);
    }
    convertKind(next) {
        var _a;
        if (next === this.kind)
            return;
        if (next === "task") {
            this.time = this.start;
        }
        else {
            this.start = this.time;
            this.end = (0, dateUtils_1.minutesToTime)((0, dateUtils_1.timeToMinutes)(this.time) + this.settings.defaultEventDurationMinutes);
        }
        this.kind = next;
        (_a = this.taskToggleComp) === null || _a === void 0 ? void 0 : _a.setValue(this.kind === "task");
        this.refreshTitleCaption();
    }
    updateVisibility() {
        var _a, _b, _c;
        const showEventTime = this.kind === "event" && !this.allDay;
        const showTaskTime = this.kind === "task" && !this.allDay;
        this.eventTimeRow.settingEl.style.display = showEventTime ? "" : "none";
        this.taskTimeRow.settingEl.style.display = showTaskTime ? "" : "none";
        this.completedRow.settingEl.style.display = this.kind === "task" ? "" : "none";
        this.linkTargetRow.settingEl.style.display = this.linkEnabled ? "" : "none";
        (_a = this.allDayToggleComp) === null || _a === void 0 ? void 0 : _a.setValue(this.allDay);
        (_b = this.completedToggleComp) === null || _b === void 0 ? void 0 : _b.setValue(this.completed);
        if (this.linkEnabled) {
            if (!this.linkTargetTouched) {
                this.linkTarget = (0, tags_1.stripTags)(this.title);
                (_c = this.linkTargetComp) === null || _c === void 0 ? void 0 : _c.setValue(this.linkTarget);
            }
            this.updateLinkPreview();
        }
    }
    /** Shows exactly what will be written, e.g. "→ [[Meeting]]" or "→ [[Meeting 20260918|Meeting]]" when they differ. */
    updateLinkPreview() {
        if (!this.linkPreviewEl)
            return;
        const display = (0, tags_1.stripTags)(this.title).trim();
        const target = (this.linkTarget.trim() || display).trim();
        if (!target) {
            this.linkPreviewEl.setText("");
            return;
        }
        this.linkPreviewEl.setText(`→ ${recomposeTitle(display, target)}`);
    }
    async handleSave() {
        if (this.saving)
            return;
        // "- [ ] Title" typed straight into the title field is an alternate way to create a task.
        const detected = detectTaskPrefix(this.title);
        if (detected) {
            this.convertKind("task");
            this.title = detected.rest;
            this.completed = detected.completed;
            this.updateVisibility();
        }
        if (!(0, tags_1.stripTags)(this.title).trim()) {
            new obsidian_1.Notice(`Give the ${this.kind} a title first.`);
            return;
        }
        if (this.kind === "event" && !this.allDay && (0, dateUtils_1.timeToMinutes)(this.end) <= (0, dateUtils_1.timeToMinutes)(this.start)) {
            new obsidian_1.Notice("End time must be after the start time.");
            return;
        }
        this.saving = true;
        try {
            const tags = (0, tags_1.parseTagList)(this.tagsRaw);
            const displayTitle = (0, tags_1.stripTags)(this.title).trim();
            let finalTitle = displayTitle;
            if (this.linkEnabled) {
                // Empty, or exactly matching the title, just means "link to a note
                // named after this event" — no alias needed.
                const target = this.linkTarget.trim() || displayTitle;
                await (0, navigation_1.findOrCreateNoteByTitle)(this.app, target);
                finalTitle = recomposeTitle(displayTitle, target);
            }
            finalTitle = (0, tags_1.withTags)(finalTitle, tags);
            if (this.kind === "event") {
                await this.callbacks.onSaveEvent({
                    title: finalTitle,
                    allDay: this.allDay,
                    start: (0, dateUtils_1.clampTimeOfDay)(this.start),
                    end: (0, dateUtils_1.clampTimeOfDay)(this.end),
                    tags,
                });
            }
            else {
                await this.callbacks.onSaveTask({
                    title: finalTitle,
                    allDay: this.allDay,
                    time: this.allDay ? null : (0, dateUtils_1.clampTimeOfDay)(this.time),
                    completed: this.completed,
                    tags,
                });
            }
            this.close();
        }
        catch (e) {
            console.error(`Daynest: failed to save ${this.kind}`, e);
            new obsidian_1.Notice(`Couldn't save that ${this.kind} — see the developer console for details.`);
        }
        finally {
            this.saving = false;
        }
    }
}
exports.ItemEditorModal = ItemEditorModal;

},
"src/main.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");
const types_1 = require("./types");
const store_1 = require("./store");
const calendarView_1 = require("./views/calendarView");
const settings_1 = require("./settings");
function freshDefaultSettings() {
    return {
        ...types_1.DEFAULT_SETTINGS,
        workingHoursStart: { ...types_1.DEFAULT_SETTINGS.workingHoursStart },
        workingHoursEnd: { ...types_1.DEFAULT_SETTINGS.workingHoursEnd },
        colorRules: types_1.DEFAULT_SETTINGS.colorRules.map((rule) => ({ ...rule, tags: [...rule.tags] }))
    };
}
class DaynestPlugin extends obsidian_1.Plugin {
    constructor() {
        super(...arguments);
        this.settings = freshDefaultSettings();
        this.settingsSaveQueue = Promise.resolve();
    }
    async onload() {
        await this.loadSettings();
        this.store = new store_1.CalendarStore(this.app, () => this.settings);
        this.registerView(calendarView_1.VIEW_TYPE_CALENDAR, (leaf) => new calendarView_1.CalendarView(leaf, this));
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
        ["year", "month", "week", "day"].forEach((mode) => {
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
        this.addSettingTab(new settings_1.DaynestSettingTab(this.app, this));
        // Live Markdown -> Calendar sync: any change to a Daily Note file (hand
        // edits, sync from another device, other plugins) invalidates that
        // file's cache entry and re-renders any open calendar view.
        this.registerEvent(this.app.vault.on("modify", (file) => this.handleVaultChange(file)));
        this.registerEvent(this.app.vault.on("create", (file) => this.handleVaultChange(file)));
        this.registerEvent(this.app.vault.on("delete", (file) => this.handleVaultChange(file)));
        this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
            this.store.refresh(oldPath);
            this.handleVaultChange(file);
        }));
    }
    handleVaultChange(file) {
        if (!(file instanceof obsidian_1.TFile) || file.extension !== "md")
            return;
        this.store.refresh(file.path);
    }
    withActiveView(checking, fn) {
        const leaf = this.app.workspace.getLeavesOfType(calendarView_1.VIEW_TYPE_CALENDAR)[0];
        const view = leaf === null || leaf === void 0 ? void 0 : leaf.view;
        if (!(view instanceof calendarView_1.CalendarView))
            return false;
        if (!checking)
            fn(view);
        return true;
    }
    async activateView() {
        const existing = this.app.workspace.getLeavesOfType(calendarView_1.VIEW_TYPE_CALENDAR);
        if (existing.length > 0) {
            this.app.workspace.revealLeaf(existing[0]);
            return;
        }
        const leaf = this.app.workspace.getLeaf("tab");
        await leaf.setViewState({ type: calendarView_1.VIEW_TYPE_CALENDAR, active: true });
        this.app.workspace.revealLeaf(leaf);
    }
    async loadSettings() {
        const rawData = await this.loadData();
        const outer = rawData && typeof rawData === "object" && !Array.isArray(rawData)
            ? rawData
            : {};
        // Accept both the normal flat Obsidian data.json shape and the wrapped
        // { settings: { ... } } shape used by some older/development builds.
        const isWrapped = !!outer.settings && typeof outer.settings === "object" && !Array.isArray(outer.settings);
        const data = isWrapped ? outer.settings : outer;
        this.settings = {
            ...freshDefaultSettings(),
            ...data,
            workingHoursStart: { ...types_1.DEFAULT_SETTINGS.workingHoursStart, ...(data.workingHoursStart || {}) },
            workingHoursEnd: { ...types_1.DEFAULT_SETTINGS.workingHoursEnd, ...(data.workingHoursEnd || {}) },
            colorRules: Array.isArray(data.colorRules)
                ? data.colorRules.map((rule) => ({ ...rule, tags: Array.isArray(rule.tags) ? [...rule.tags] : [] }))
                : freshDefaultSettings().colorRules
        };
        // Rewrite a wrapped legacy shape once into the flat format that Obsidian
        // and the current plugin use, so the migration itself persists.
        if (isWrapped)
            await this.saveSettings();
    }
    refreshCalendarAppearance() {
        var _a;
        const view = (_a = this.app.workspace.getLeavesOfType(calendarView_1.VIEW_TYPE_CALENDAR)[0]) === null || _a === void 0 ? void 0 : _a.view;
        if (view instanceof calendarView_1.CalendarView)
            view.refreshAppearanceSettings();
    }
    snapshotSettings() {
        return JSON.parse(JSON.stringify(this.settings));
    }
    async saveSettings() {
        // Snapshot each write and serialize it. Fast view changes must not race and
        // let an older settings snapshot overwrite the latest lastUsedView value.
        const snapshot = this.snapshotSettings();
        this.settingsSaveQueue = this.settingsSaveQueue
            .catch(() => undefined)
            .then(() => this.saveData(snapshot));
        await this.settingsSaveQueue;
    }
    onunload() {
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
    getCurrentCalendarMode() {
        var _a;
        const view = (_a = this.app.workspace.getLeavesOfType(calendarView_1.VIEW_TYPE_CALENDAR)[0]) === null || _a === void 0 ? void 0 : _a.view;
        return view instanceof calendarView_1.CalendarView ? view.getCurrentMode() : null;
    }
}
exports.default = DaynestPlugin;

},
"src/navigation.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openFileInMode = openFileInMode;
exports.findNoteByTitle = findNoteByTitle;
exports.findOrCreateNoteByTitle = findOrCreateNoteByTitle;
const obsidian_1 = require("obsidian");
async function openFileInMode(app, file, mode) {
    const leaf = mode === "current"
        ? app.workspace.getLeaf(false)
        : mode === "new"
            ? app.workspace.getLeaf("tab")
            : app.workspace.getLeaf("split", "vertical");
    await leaf.openFile(file);
    app.workspace.setActiveLeaf(leaf, { focus: true });
}
function sanitizeFilename(name) {
    return name.replace(/[\\/:*?"<>|#^[\]]/g, "").trim();
}
/** Finds a note by title anywhere in the vault (first match by basename). */
function findNoteByTitle(app, title) {
    const target = title.trim().toLowerCase();
    const match = app.vault.getMarkdownFiles().find((f) => f.basename.toLowerCase() === target);
    return match !== null && match !== void 0 ? match : null;
}
/** Finds a note by title, creating an empty one at the vault root if none exists yet. */
async function findOrCreateNoteByTitle(app, title) {
    const existing = findNoteByTitle(app, title);
    if (existing)
        return existing;
    const filename = sanitizeFilename(title) || "Untitled";
    let path = (0, obsidian_1.normalizePath)(`${filename}.md`);
    let suffix = 2;
    while (app.vault.getAbstractFileByPath(path)) {
        path = (0, obsidian_1.normalizePath)(`${filename} ${suffix}.md`);
        suffix++;
    }
    return app.vault.create(path, "");
}

},
"src/parser.js": function(module, exports, require) {
"use strict";
// A deliberately strict parser: only the four documented syntaxes are ever
// recognised as calendar items. Everything else is left untouched and is
// reported back as a "foreign" line so the writer can preserve it.
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripTags = void 0;
exports.parseLine = parseLine;
exports.parseManagedSectionBody = parseManagedSectionBody;
exports.findSection = findSection;
exports.firstWikilinkTarget = firstWikilinkTarget;
exports.displayTitle = displayTitle;
const dateUtils_1 = require("./dateUtils");
const tags_1 = require("./tags");
var tags_2 = require("./tags");
Object.defineProperty(exports, "stripTags", { enumerable: true, get: function () { return tags_2.stripTags; } });
// "- [ ] 15:30 Buy groceries #personal"  or  "- [x] Buy milk"
const TASK_RE = /^\s*-\s*\[([ xX])\]\s*(?:(\d{1,2}):(\d{2})\s+)?(.*)$/;
// "- 09:00 - 10:00 Team meeting #work"
const EVENT_RE = /^\s*-\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s+(.+)$/;
function validTime(h, m) {
    return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}
/**
 * Parse a single Markdown line. Returns null if the line does not match one
 * of the four documented calendar syntaxes exactly — such lines are ordinary
 * Markdown and must be preserved verbatim by the caller.
 */
function parseLine(line, workingHoursStart, workingHoursEnd) {
    const taskMatch = TASK_RE.exec(line);
    if (taskMatch) {
        const [, box, hStr, mStr, rest] = taskMatch;
        const completed = box.toLowerCase() === "x";
        let time = null;
        let titleSource = rest;
        if (hStr !== undefined && mStr !== undefined) {
            const h = parseInt(hStr, 10);
            const m = parseInt(mStr, 10);
            if (validTime(h, m)) {
                time = { hour: h, minute: m };
            }
            else {
                // Not a real clock time (e.g. "99:99") — the digits were part of
                // the title, not a time prefix. Re-derive the title from the
                // original line so nothing is lost.
                const fallback = /^\s*-\s*\[[ xX]\]\s*(.*)$/.exec(line);
                titleSource = fallback ? fallback[1] : rest;
            }
        }
        const title = titleSource.trim();
        if (title.length === 0)
            return null; // an empty checkbox isn't a usable task
        return {
            kind: "task",
            allDay: time === null,
            time,
            completed,
            title,
            tags: (0, tags_1.extractTagsFromTitle)(title),
            rawLine: line,
        };
    }
    const eventMatch = EVENT_RE.exec(line);
    if (eventMatch) {
        const [, sh, sm, eh, em, rest] = eventMatch;
        const startH = parseInt(sh, 10);
        const startM = parseInt(sm, 10);
        const endH = parseInt(eh, 10);
        const endM = parseInt(em, 10);
        if (!validTime(startH, startM) || !validTime(endH, endM))
            return null;
        const title = rest.trim();
        if (title.length === 0)
            return null;
        const start = { hour: startH, minute: startM };
        const end = { hour: endH, minute: endM };
        const allDay = (0, dateUtils_1.timeToMinutes)(start) === (0, dateUtils_1.timeToMinutes)(workingHoursStart) &&
            (0, dateUtils_1.timeToMinutes)(end) === (0, dateUtils_1.timeToMinutes)(workingHoursEnd);
        return {
            kind: "event",
            allDay,
            start,
            end,
            title,
            tags: (0, tags_1.extractTagsFromTitle)(title),
            rawLine: line,
        };
    }
    return null;
}
function parseManagedSectionBody(bodyLines, workingHoursStart, workingHoursEnd) {
    const items = [];
    const foreignLines = [];
    for (const line of bodyLines) {
        if (line.trim().length === 0)
            continue; // blank lines are formatting only
        const parsed = parseLine(line, workingHoursStart, workingHoursEnd);
        if (parsed)
            items.push(parsed);
        else
            foreignLines.push(line);
    }
    return { items, foreignLines };
}
function normalizeHeading(s) {
    return s.trim().replace(/\s+/g, " ");
}
/** A section runs from its heading line until the next ATX heading (any level) or EOF. */
function findSection(fileLines, headingText) {
    const target = normalizeHeading(headingText);
    for (let i = 0; i < fileLines.length; i++) {
        if (normalizeHeading(fileLines[i]) === target) {
            let end = fileLines.length;
            for (let j = i + 1; j < fileLines.length; j++) {
                if (/^ {0,3}#+\s/.test(fileLines[j])) {
                    end = j;
                    break;
                }
            }
            return { headingIndex: i, bodyStart: i + 1, bodyEnd: end };
        }
    }
    return null;
}
/** Extracts the first wikilink target ("Note" from "[[Note|Alias]]") in a title, if any. */
function firstWikilinkTarget(title) {
    const m = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/.exec(title);
    return m ? m[1].trim() : null;
}
/**
 * Renders a title for display: every "[[Note]]" or "[[Note|Alias]]" becomes
 * plain text (the alias, or the note name) with the bracket syntax hidden.
 * The stored/edited title is untouched — this is purely a display transform.
 */
function displayTitle(title) {
    return title.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, alias) => (alias !== null && alias !== void 0 ? alias : target).trim());
}

},
"src/settings.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DaynestSettingTab = void 0;
const obsidian_1 = require("obsidian");
const dateUtils_1 = require("./dateUtils");
const colorRules_1 = require("./colorRules");
const VIEW_OPTIONS = {
    year: "Year",
    month: "Month",
    week: "Week",
    day: "Day",
    last: "Last used view",
};
const WEEKDAY_OPTIONS = {
    "0": "Sunday",
    "1": "Monday",
    "2": "Tuesday",
    "3": "Wednesday",
    "4": "Thursday",
    "5": "Friday",
    "6": "Saturday",
};
const OPEN_MODE_OPTIONS = {
    current: "Current tab",
    new: "New tab",
    "new-right": "New tab to the right",
};
class DaynestSettingTab extends obsidian_1.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        this.renderGeneral(containerEl);
        this.renderDailyNotes(containerEl);
        this.renderColors(containerEl);
        this.renderAppearance(containerEl);
    }
    async save(invalidateCache = true) {
        await this.plugin.saveSettings();
        if (invalidateCache)
            this.plugin.store.invalidateAll();
    }
    /** A native colour picker plus a synced hex textbox, since typing a known hex is often faster than the picker. */
    addColorAndHex(setting, initial, onChange) {
        let hexComp;
        let pickerComp;
        setting.addColorPicker((picker) => {
            pickerComp = picker;
            picker.setValue((0, colorRules_1.isValidHexColor)(initial) ? initial : "#8E8E93").onChange(async (v) => {
                hexComp === null || hexComp === void 0 ? void 0 : hexComp.setValue(v);
                onChange(v);
            });
        });
        setting.addText((text) => {
            hexComp = text;
            text.inputEl.style.width = "88px";
            text.inputEl.maxLength = 7;
            text.setPlaceholder("#RRGGBB").setValue(initial).onChange((v) => {
                const trimmed = v.trim();
                if ((0, colorRules_1.isValidHexColor)(trimmed)) {
                    pickerComp === null || pickerComp === void 0 ? void 0 : pickerComp.setValue(trimmed);
                    onChange(trimmed);
                }
            });
        });
    }
    // ------------------------------------------------------------------ General
    renderGeneral(containerEl) {
        new obsidian_1.Setting(containerEl).setName("General").setHeading();
        new obsidian_1.Setting(containerEl)
            .setName("Default view")
            .setDesc("Which view Daynest opens to. \"Last used view\" reopens whichever of Year/Month/Week/Day you had open most recently.")
            .addDropdown((dd) => {
            Object.entries(VIEW_OPTIONS).forEach(([value, label]) => dd.addOption(value, label));
            dd.setValue(this.plugin.settings.defaultView).onChange(async (value) => {
                this.plugin.settings.defaultView = value;
                if (value === "last") {
                    // Capture the open view immediately when the preference changes,
                    // not only after the user switches views again.
                    const currentMode = this.plugin.getCurrentCalendarMode();
                    if (currentMode)
                        this.plugin.settings.lastUsedView = currentMode;
                }
                await this.save(false);
            });
        });
        new obsidian_1.Setting(containerEl)
            .setName("First day of week")
            .addDropdown((dd) => {
            Object.entries(WEEKDAY_OPTIONS).forEach(([value, label]) => dd.addOption(value, label));
            dd.setValue(String(this.plugin.settings.firstDayOfWeek)).onChange(async (value) => {
                this.plugin.settings.firstDayOfWeek = parseInt(value, 10);
                await this.save(false);
            });
        });
        new obsidian_1.Setting(containerEl)
            .setName("Time format")
            .addDropdown((dd) => {
            dd.addOption("24h", "24-hour");
            dd.addOption("12h", "12-hour (AM/PM)");
            dd.setValue(this.plugin.settings.timeFormat).onChange(async (value) => {
                this.plugin.settings.timeFormat = value;
                await this.save(false);
            });
        });
        new obsidian_1.Setting(containerEl)
            .setName("Show weekends in Month view")
            .setDesc("Ignored for any week that actually has something on a Saturday or Sunday.")
            .addToggle((t) => t.setValue(this.plugin.settings.showWeekendsMonth).onChange(async (v) => {
            this.plugin.settings.showWeekendsMonth = v;
            await this.save(false);
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Show weekends in Week view")
            .setDesc("Ignored for a week that actually has something on a Saturday or Sunday.")
            .addToggle((t) => t.setValue(this.plugin.settings.showWeekendsWeek).onChange(async (v) => {
            this.plugin.settings.showWeekendsWeek = v;
            await this.save(false);
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Show weekends in Year view")
            .setDesc("Ignored for a month that actually has something on a Saturday or Sunday.")
            .addToggle((t) => t.setValue(this.plugin.settings.showWeekendsYear).onChange(async (v) => {
            this.plugin.settings.showWeekendsYear = v;
            await this.save(false);
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Show week numbers")
            .addToggle((t) => t.setValue(this.plugin.settings.showWeekNumbers).onChange(async (v) => {
            this.plugin.settings.showWeekNumbers = v;
            await this.save(false);
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Show current time indicator")
            .setDesc("A red line across Week/Day view marking the current time.")
            .addToggle((t) => t.setValue(this.plugin.settings.showCurrentTimeIndicator).onChange(async (v) => {
            this.plugin.settings.showCurrentTimeIndicator = v;
            await this.save(false);
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Auto-scroll to current time")
            .setDesc("Jump Week/Day view to the current time when opened.")
            .addToggle((t) => t.setValue(this.plugin.settings.autoScrollToCurrentTime).onChange(async (v) => {
            this.plugin.settings.autoScrollToCurrentTime = v;
            await this.save(false);
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Default event duration")
            .setDesc("Minutes given to a new event created without dragging (e.g. via double-click).")
            .addText((text) => text
            .setValue(String(this.plugin.settings.defaultEventDurationMinutes))
            .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n > 0) {
                this.plugin.settings.defaultEventDurationMinutes = n;
                await this.save(false);
            }
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Minimum event duration")
            .setDesc("Shortest duration a drag-created or resized event can have, in minutes.")
            .addText((text) => text.setValue(String(this.plugin.settings.minEventDurationMinutes)).onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n > 0) {
                this.plugin.settings.minEventDurationMinutes = n;
                await this.save(false);
            }
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Working hours")
            .setDesc("Defines the all-day boundary (an event spanning exactly these hours is treated as all-day) and where Week/Day view is emphasised.")
            .addText((text) => {
            text.inputEl.type = "time";
            text.inputEl.value = (0, dateUtils_1.formatTimeOfDay)(this.plugin.settings.workingHoursStart, "24h");
            text.onChange(async (value) => {
                const t = (0, dateUtils_1.parseTimeString)(value);
                if (t) {
                    this.plugin.settings.workingHoursStart = t;
                    await this.save();
                }
            });
        })
            .addText((text) => {
            text.inputEl.type = "time";
            text.inputEl.value = (0, dateUtils_1.formatTimeOfDay)(this.plugin.settings.workingHoursEnd, "24h");
            text.onChange(async (value) => {
                const t = (0, dateUtils_1.parseTimeString)(value);
                if (t) {
                    this.plugin.settings.workingHoursEnd = t;
                    await this.save();
                }
            });
        });
    }
    // -------------------------------------------------------------- Daily Notes
    renderDailyNotes(containerEl) {
        new obsidian_1.Setting(containerEl).setName("Daily Notes & sections").setHeading();
        const info = containerEl.createEl("p", { cls: "setting-item-description" });
        info.style.marginBottom = "1em";
        info.setText("Daynest reads its folder, filename format, and template from Obsidian's core Daily Notes plugin " +
            "(or Periodic Notes if that's what you use instead). When you create an event or task on a date with no " +
            "note yet, that note is created automatically from your template.");
        new obsidian_1.Setting(containerEl)
            .setName("Events heading")
            .setDesc("The exact heading text, including #, under which events are read and written.")
            .addText((text) => text.setValue(this.plugin.settings.eventsHeading).onChange(async (value) => {
            if (value.trim()) {
                this.plugin.settings.eventsHeading = value;
                await this.save();
            }
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Separate task section")
            .setDesc("Keep tasks in their own heading instead of mixing them in with events.")
            .addToggle((t) => t.setValue(this.plugin.settings.separateTaskSection).onChange(async (v) => {
            this.plugin.settings.separateTaskSection = v;
            await this.save();
            this.display();
        }));
        if (this.plugin.settings.separateTaskSection) {
            new obsidian_1.Setting(containerEl)
                .setName("Tasks heading")
                .setDesc("The exact heading text, including #, under which tasks are read and written.")
                .addText((text) => text.setValue(this.plugin.settings.tasksHeading).onChange(async (value) => {
                if (value.trim() && value.trim() !== this.plugin.settings.eventsHeading.trim()) {
                    this.plugin.settings.tasksHeading = value;
                    await this.save();
                }
            }));
        }
        new obsidian_1.Setting(containerEl)
            .setName("Event spacing")
            .setDesc("Blank line between each event in the Markdown, or not.")
            .addDropdown((dd) => dd
            .addOption("compact", "Compact")
            .addOption("spacious", "Spacious")
            .setValue(this.plugin.settings.eventSpacing)
            .onChange(async (v) => {
            this.plugin.settings.eventSpacing = v;
            await this.save();
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Task spacing")
            .addDropdown((dd) => dd
            .addOption("compact", "Compact")
            .addOption("spacious", "Spacious")
            .setValue(this.plugin.settings.taskSpacing)
            .onChange(async (v) => {
            this.plugin.settings.taskSpacing = v;
            await this.save();
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Open Daily Note in")
            .addDropdown((dd) => {
            Object.entries(OPEN_MODE_OPTIONS).forEach(([value, label]) => dd.addOption(value, label));
            dd.setValue(this.plugin.settings.dailyNoteOpenMode).onChange(async (v) => {
                this.plugin.settings.dailyNoteOpenMode = v;
                await this.save(false);
            });
        });
        new obsidian_1.Setting(containerEl)
            .setName("Open linked notes in")
            .setDesc("Used when Cmd/Ctrl-clicking an event or task that contains a wikilink.")
            .addDropdown((dd) => {
            Object.entries(OPEN_MODE_OPTIONS).forEach(([value, label]) => dd.addOption(value, label));
            dd.setValue(this.plugin.settings.linkedNoteOpenMode).onChange(async (v) => {
                this.plugin.settings.linkedNoteOpenMode = v;
                await this.save(false);
            });
        });
    }
    // ------------------------------------------------------------------- Colors
    renderColors(containerEl) {
        new obsidian_1.Setting(containerEl).setName("Colours").setHeading();
        this.addColorAndHex(new obsidian_1.Setting(containerEl).setName("Default event colour").setDesc("Used when nothing else matches an event's tags."), this.plugin.settings.defaultEventColor, async (v) => {
            this.plugin.settings.defaultEventColor = v;
            await this.save(false);
        });
        this.addColorAndHex(new obsidian_1.Setting(containerEl).setName("Default task colour").setDesc("Used when nothing else matches a task's tags."), this.plugin.settings.defaultTaskColor, async (v) => {
            this.plugin.settings.defaultTaskColor = v;
            await this.save(false);
        });
        new obsidian_1.Setting(containerEl)
            .setName("Colour tags using rules")
            .setDesc("Colours the #tag badges shown on events/tasks using the same rules below, overriding any colour your " +
            "theme or a CSS snippet/plugin would otherwise give that tag. Off by default so tags keep looking " +
            "like ordinary Obsidian tags.")
            .addToggle((t) => t.setValue(this.plugin.settings.colorTagsUsingRules).onChange(async (v) => {
            this.plugin.settings.colorTagsUsingRules = v;
            await this.save(false);
        }));
        const desc = containerEl.createEl("p", { cls: "setting-item-description" });
        desc.style.marginBottom = "0.5em";
        desc.setText("A rule matches when an item has ALL of its listed tags. When more than one rule matches, the rule " +
            "requiring the most tags wins — so a combination like \"work, meeting\" beats a plain \"work\" rule. " +
            "Ties go to whichever rule is higher in this list; reorder with the arrows.");
        const listEl = containerEl.createDiv({ cls: "daily-calendar-color-rules" });
        this.renderColorRuleRows(listEl);
        new obsidian_1.Setting(containerEl).addButton((btn) => btn
            .setButtonText("+ Add colour rule")
            .setCta()
            .onClick(async () => {
            this.plugin.settings.colorRules.push({ id: (0, colorRules_1.generateRuleId)(), tags: [], color: "#8E8E93" });
            await this.save(false);
            this.renderColorRuleRows(listEl);
        }));
    }
    renderColorRuleRows(listEl) {
        listEl.empty();
        const rules = this.plugin.settings.colorRules;
        rules.forEach((rule, index) => {
            const row = new obsidian_1.Setting(listEl).addText((text) => {
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
            });
            this.addColorAndHex(row, rule.color, async (v) => {
                rule.color = v;
                await this.save(false);
            });
            row
                .addExtraButton((btn) => btn
                .setIcon("arrow-up")
                .setTooltip("Move up")
                .setDisabled(index === 0)
                .onClick(async () => {
                if (index === 0)
                    return;
                [rules[index - 1], rules[index]] = [rules[index], rules[index - 1]];
                await this.save(false);
                this.renderColorRuleRows(listEl);
            }))
                .addExtraButton((btn) => btn
                .setIcon("arrow-down")
                .setTooltip("Move down")
                .setDisabled(index === rules.length - 1)
                .onClick(async () => {
                if (index === rules.length - 1)
                    return;
                [rules[index + 1], rules[index]] = [rules[index], rules[index + 1]];
                await this.save(false);
                this.renderColorRuleRows(listEl);
            }))
                .addExtraButton((btn) => btn
                .setIcon("trash")
                .setTooltip("Delete rule")
                .onClick(async () => {
                this.plugin.settings.colorRules = rules.filter((r) => r.id !== rule.id);
                await this.save(false);
                this.renderColorRuleRows(listEl);
            }));
            row.infoEl.remove(); // rows are compact — the placeholder text doubles as the label
        });
    }
    // --------------------------------------------------------------- Appearance
    renderAppearance(containerEl) {
        new obsidian_1.Setting(containerEl).setName("Appearance").setHeading();
        new obsidian_1.Setting(containerEl)
            .setName("Event style")
            .setDesc('"Callout" — a pastel fill with a solid colour bar on the left. "Solid" — the classic fully-coloured ' +
            "block with white text. Tasks keep their own outline look either way.")
            .addDropdown((dd) => dd
            .addOption("callout", "Callout")
            .addOption("solid", "Solid")
            .setValue(this.plugin.settings.eventStyle)
            .onChange(async (v) => {
            this.plugin.settings.eventStyle = v;
            await this.save(false);
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Increase contrast for event text")
            .setDesc("In Callout style, use normal theme text for event names and muted text for times instead of the event colour, for better readability.")
            .addToggle((toggle) => toggle.setValue(this.plugin.settings.highContrastEventText).onChange(async (value) => {
            this.plugin.settings.highContrastEventText = value;
            await this.save(false);
            this.plugin.refreshCalendarAppearance();
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Use stronger event background tint")
            .setDesc("Enabled keeps the current, stronger colour tint. Disabled uses a lighter, subtler background in Callout style.")
            .addToggle((toggle) => toggle.setValue(this.plugin.settings.strongEventBackgroundTint).onChange(async (value) => {
            this.plugin.settings.strongEventBackgroundTint = value;
            await this.save(false);
            this.plugin.refreshCalendarAppearance();
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Event density")
            .setDesc("Padding and font size inside event blocks.")
            .addDropdown((dd) => dd
            .addOption("compact", "Compact")
            .addOption("comfortable", "Comfortable")
            .addOption("spacious", "Spacious")
            .setValue(this.plugin.settings.eventDensity)
            .onChange(async (v) => {
            this.plugin.settings.eventDensity = v;
            await this.save(false);
            this.plugin.refreshCalendarAppearance();
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Calendar scale")
            .setDesc("Height of an hour row in Week/Day view.")
            .addDropdown((dd) => dd
            .addOption("small", "Small")
            .addOption("medium", "Medium")
            .addOption("large", "Large")
            .setValue(this.plugin.settings.calendarScale)
            .onChange(async (v) => {
            this.plugin.settings.calendarScale = v;
            await this.save(false);
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Weekend shading")
            .setDesc("Subtle background tint on Saturday/Sunday columns and cells.")
            .addToggle((t) => t.setValue(this.plugin.settings.weekendShading).onChange(async (v) => {
            this.plugin.settings.weekendShading = v;
            await this.save(false);
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Corner radius")
            .setDesc("Roundness of event cards and other calendar surfaces.")
            .addDropdown((dd) => dd
            .addOption("none", "None")
            .addOption("small", "Small")
            .addOption("medium", "Medium")
            .addOption("large", "Large")
            .setValue(this.plugin.settings.cornerRadius)
            .onChange(async (v) => {
            this.plugin.settings.cornerRadius = v;
            await this.save(false);
        }));
    }
}
exports.DaynestSettingTab = DaynestSettingTab;

},
"src/store.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarStore = void 0;
exports.dateFromKeyOrMoment = dateFromKeyOrMoment;
const obsidian_1 = require("obsidian");
const dateUtils_1 = require("./dateUtils");
const parser_1 = require("./parser");
const writer_1 = require("./writer");
const dailyNotes_1 = require("./dailyNotes");
/**
 * Owns every read and write against Daily Notes. Views never touch the
 * vault directly — they go through here, so parsing/sorting/writing rules
 * stay in exactly one place.
 */
class CalendarStore {
    constructor(app, getSettings) {
        this.app = app;
        this.getSettings = getSettings;
        this.cache = new Map();
        this.listeners = new Set();
        /** Serialize read-modify-write mutations to prevent racing drags from overwriting each other. */
        this.mutationTail = Promise.resolve();
        this.mutationActive = false;
        this.deferredRefreshPaths = new Set();
        this.deferredFullRefresh = false;
    }
    runMutation(work) {
        const result = this.mutationTail.then(async () => {
            this.mutationActive = true;
            try {
                return await work();
            }
            finally {
                // Vault create/modify events raised by this mutation (including each
                // half of a cross-day move) are deferred until all writes and any
                // rollback have finished. One final notification means views never
                // render the intermediate state where the source is gone but the
                // destination has not been written yet.
                this.mutationActive = false;
                if (this.deferredFullRefresh) {
                    this.cache.clear();
                }
                else {
                    for (const path of this.deferredRefreshPaths)
                        this.cache.delete(path);
                }
                this.deferredRefreshPaths.clear();
                const fullRefresh = this.deferredFullRefresh;
                this.deferredFullRefresh = false;
                this.emitChange(fullRefresh);
            }
        });
        // A rejected write must not block later user actions.
        this.mutationTail = result.then(() => undefined, () => undefined);
        return result;
    }
    onChange(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }
    emitChange(fullRebuild) {
        for (const l of this.listeners)
            l(fullRebuild);
    }
    /** Called by main.ts's vault event listeners when a file changes outside our own writes. */
    refresh(path) {
        if (this.mutationActive) {
            // Internal vault events are noisy during a move. Defer all of them
            // until the serialized mutation reaches its final, consistent state.
            if (path)
                this.deferredRefreshPaths.add(path);
            else
                this.deferredFullRefresh = true;
            return;
        }
        if (path)
            this.cache.delete(path);
        this.emitChange(false);
    }
    /** Called after settings change — working hours, headings, etc. all affect parsing. */
    invalidateAll() {
        if (this.mutationActive) {
            this.deferredFullRefresh = true;
            return;
        }
        this.cache.clear();
        this.emitChange(true);
    }
    // ---------------------------------------------------------------- reading
    idFor(filePath, section, rawLine, occurrence) {
        // Positional IDs break as soon as an event is re-sorted. Dragging then
        // searches for the old index, can replace a different event, or can fail
        // to remove the source row during a cross-day move. Identify the row by
        // its exact Markdown line instead; occurrence disambiguates identical
        // lines without injecting plugin metadata into the user's note.
        return JSON.stringify([filePath, section, rawLine, occurrence]);
    }
    findItemIndex(items, original) {
        let index = items.findIndex((item) => item.id === original.id && item.kind === original.kind);
        if (index >= 0)
            return index;
        // The row may have been re-serialized (e.g. times were zero-padded) since
        // this view rendered it. Exact raw text remains the safest fallback.
        index = items.findIndex((item) => item.kind === original.kind && item.rawLine === original.rawLine);
        if (index >= 0)
            return index;
        // Last resort for a stale render after a harmless normalization. Never
        // append on a miss: doing so turns an identity mismatch into a duplicate.
        return items.findIndex((item) => {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            if (item.kind !== original.kind || item.title !== original.title || item.allDay !== original.allDay)
                return false;
            if (item.kind === "event" && original.kind === "event") {
                return item.start.hour === original.start.hour && item.start.minute === original.start.minute &&
                    item.end.hour === original.end.hour && item.end.minute === original.end.minute;
            }
            if (item.kind === "task" && original.kind === "task") {
                return item.completed === original.completed &&
                    ((_b = (_a = item.time) === null || _a === void 0 ? void 0 : _a.hour) !== null && _b !== void 0 ? _b : null) === ((_d = (_c = original.time) === null || _c === void 0 ? void 0 : _c.hour) !== null && _d !== void 0 ? _d : null) &&
                    ((_f = (_e = item.time) === null || _e === void 0 ? void 0 : _e.minute) !== null && _f !== void 0 ? _f : null) === ((_h = (_g = original.time) === null || _g === void 0 ? void 0 : _g.minute) !== null && _h !== void 0 ? _h : null);
            }
            return false;
        });
    }
    missingItemError(item) {
        return new Error(`Daynest could not safely find “${item.title}” in ${item.filePath}. No change was made, to avoid duplicating or deleting the wrong item. Refresh the calendar and try again.`);
    }
    parseFile(file, content, settings) {
        const date = (0, dailyNotes_1.getDateFromFile)(this.app, file);
        if (!date)
            return { events: [], tasks: [] };
        const key = (0, dateUtils_1.dateKey)(date);
        const lines = (0, writer_1.contentToLines)(content);
        const events = [];
        const tasks = [];
        // Recognition is grammar-based, not heading-based: a checkbox line found
        // under the Events heading is still a task (and vice versa). Anything
        // misfiled like this is relocated to its correct heading next time this
        // file is written, so nothing is ever silently dropped.
        const scanSection = (headingText, label) => {
            const range = (0, parser_1.findSection)(lines, headingText);
            if (!range)
                return;
            const body = lines.slice(range.bodyStart, range.bodyEnd);
            const parsed = (0, parser_1.parseManagedSectionBody)(body, settings.workingHoursStart, settings.workingHoursEnd);
            const occurrences = new Map();
            parsed.items.forEach((item) => {
                var _a;
                const occurrence = (_a = occurrences.get(item.rawLine)) !== null && _a !== void 0 ? _a : 0;
                occurrences.set(item.rawLine, occurrence + 1);
                const id = this.idFor(file.path, label, item.rawLine, occurrence);
                if (item.kind === "event") {
                    events.push({ ...item, id, date: key, filePath: file.path, section: label });
                }
                else {
                    tasks.push({ ...item, id, date: key, filePath: file.path, section: label });
                }
            });
        };
        if (settings.separateTaskSection) {
            scanSection(settings.eventsHeading, "events");
            if (settings.tasksHeading.trim() !== settings.eventsHeading.trim()) {
                scanSection(settings.tasksHeading, "tasks");
            }
        }
        else {
            scanSection(settings.eventsHeading, "events");
        }
        return { events, tasks };
    }
    async getParsedFile(file) {
        const cached = this.cache.get(file.path);
        if (cached && cached.mtime === file.stat.mtime) {
            return { events: cached.events, tasks: cached.tasks };
        }
        const content = await this.app.vault.read(file);
        const parsed = this.parseFile(file, content, this.getSettings());
        this.cache.set(file.path, { mtime: file.stat.mtime, events: parsed.events, tasks: parsed.tasks });
        return parsed;
    }
    async getItemsForDate(date) {
        const file = (0, dailyNotes_1.findDailyNote)(this.app, date);
        if (!file)
            return [];
        const { events, tasks } = await this.getParsedFile(file);
        return [...events, ...tasks];
    }
    async getItemsForRange(start, end) {
        const dates = [];
        const cursor = start.clone().startOf("day");
        const last = end.clone().startOf("day");
        while (cursor.isSameOrBefore(last, "day")) {
            dates.push(cursor.clone());
            cursor.add(1, "day");
        }
        const lists = await Promise.all(dates.map((d) => this.getItemsForDate(d)));
        const result = new Map();
        dates.forEach((d, i) => result.set((0, dateUtils_1.dateKey)(d), lists[i]));
        return result;
    }
    // ---------------------------------------------------------------- writing
    async getFile(path) {
        const f = this.app.vault.getAbstractFileByPath(path);
        if (f instanceof obsidian_1.TFile)
            return f;
        throw new Error(`Daynest: the note at "${path}" no longer exists.`);
    }
    async loadListsForFile(file) {
        const { events, tasks } = await this.getParsedFile(file);
        return { events: [...events], tasks: [...tasks] };
    }
    async writeFile(file, events, tasks, settings) {
        const content = await this.app.vault.read(file);
        let lines = (0, writer_1.contentToLines)(content);
        if (settings.separateTaskSection) {
            const eventLines = (0, writer_1.sortEvents)(events).map((e) => (0, writer_1.formatEventLine)(e, settings.workingHoursStart, settings.workingHoursEnd));
            const eventsRange = (0, parser_1.findSection)(lines, settings.eventsHeading);
            const eventForeign = eventsRange
                ? (0, parser_1.parseManagedSectionBody)(lines.slice(eventsRange.bodyStart, eventsRange.bodyEnd), settings.workingHoursStart, settings.workingHoursEnd).foreignLines
                : [];
            lines = (0, writer_1.replaceSectionBody)(lines, settings.eventsHeading, (0, writer_1.buildSectionBodyLines)(eventLines, eventForeign, settings.eventSpacing));
            const taskLines = (0, writer_1.sortTasks)(tasks).map((t) => (0, writer_1.formatTaskLine)(t));
            const tasksRange = (0, parser_1.findSection)(lines, settings.tasksHeading);
            const taskForeign = tasksRange
                ? (0, parser_1.parseManagedSectionBody)(lines.slice(tasksRange.bodyStart, tasksRange.bodyEnd), settings.workingHoursStart, settings.workingHoursEnd).foreignLines
                : [];
            lines = (0, writer_1.replaceSectionBody)(lines, settings.tasksHeading, (0, writer_1.buildSectionBodyLines)(taskLines, taskForeign, settings.taskSpacing));
        }
        else {
            const merged = (0, writer_1.sortMixedSection)([...events, ...tasks]);
            const mergedLines = merged.map((it) => it.kind === "event"
                ? (0, writer_1.formatEventLine)(it, settings.workingHoursStart, settings.workingHoursEnd)
                : (0, writer_1.formatTaskLine)(it));
            const range = (0, parser_1.findSection)(lines, settings.eventsHeading);
            const foreign = range
                ? (0, parser_1.parseManagedSectionBody)(lines.slice(range.bodyStart, range.bodyEnd), settings.workingHoursStart, settings.workingHoursEnd).foreignLines
                : [];
            lines = (0, writer_1.replaceSectionBody)(lines, settings.eventsHeading, (0, writer_1.buildSectionBodyLines)(mergedLines, foreign, settings.eventSpacing));
        }
        await this.app.vault.modify(file, (0, writer_1.linesToContent)(lines));
        this.cache.delete(file.path);
    }
    async loadEditableLists(date) {
        const file = await (0, dailyNotes_1.ensureDailyNote)(this.app, date);
        const { events, tasks } = await this.loadListsForFile(file);
        return { file, events, tasks };
    }
    createEvent(date, data) {
        return this.runMutation(() => this.createEventUnlocked(date, data));
    }
    async createEventUnlocked(date, data) {
        var _a;
        const settings = this.getSettings();
        const { file, events, tasks } = await this.loadEditableLists(date);
        events.push({
            id: "new",
            kind: "event",
            date: (0, dateUtils_1.dateKey)(date),
            filePath: file.path,
            section: "events",
            title: data.title,
            tags: (_a = data.tags) !== null && _a !== void 0 ? _a : [],
            rawLine: "",
            allDay: data.allDay,
            start: data.start,
            end: data.end,
        });
        await this.writeFile(file, events, tasks, settings);
    }
    createTask(date, data) {
        return this.runMutation(() => this.createTaskUnlocked(date, data));
    }
    async createTaskUnlocked(date, data) {
        var _a, _b;
        const settings = this.getSettings();
        const { file, events, tasks } = await this.loadEditableLists(date);
        tasks.push({
            id: "new",
            kind: "task",
            date: (0, dateUtils_1.dateKey)(date),
            filePath: file.path,
            section: settings.separateTaskSection ? "tasks" : "events",
            title: data.title,
            tags: (_a = data.tags) !== null && _a !== void 0 ? _a : [],
            rawLine: "",
            allDay: data.allDay,
            time: data.time,
            completed: (_b = data.completed) !== null && _b !== void 0 ? _b : false,
        });
        await this.writeFile(file, events, tasks, settings);
    }
    updateEvent(original, changes) {
        return this.runMutation(() => this.updateEventUnlocked(original, changes));
    }
    async updateEventUnlocked(original, changes) {
        const settings = this.getSettings();
        const newDateKey = changes.date ? (0, dateUtils_1.dateKey)(changes.date) : original.date;
        const merged = { ...original, ...changes, date: newDateKey };
        if (newDateKey === original.date) {
            const file = await this.getFile(original.filePath);
            const { events, tasks } = await this.loadListsForFile(file);
            const idx = this.findItemIndex(events, original);
            if (idx === -1)
                throw this.missingItemError(original);
            events[idx] = merged;
            await this.writeFile(file, events, tasks, settings);
        }
        else {
            const oldFile = await this.getFile(original.filePath);
            const oldLists = await this.loadListsForFile(oldFile);
            const oldIndex = this.findItemIndex(oldLists.events, original);
            if (oldIndex === -1)
                throw this.missingItemError(original);
            const originalIndex = oldIndex;
            oldLists.events.splice(oldIndex, 1);
            await this.writeFile(oldFile, oldLists.events, oldLists.tasks, settings);
            try {
                const newFile = await (0, dailyNotes_1.ensureDailyNote)(this.app, changes.date);
                const newLists = await this.loadListsForFile(newFile);
                newLists.events.push({ ...merged, filePath: newFile.path });
                await this.writeFile(newFile, newLists.events, newLists.tasks, settings);
            }
            catch (moveError) {
                try {
                    const rollbackLists = await this.loadListsForFile(oldFile);
                    rollbackLists.events.splice(Math.min(originalIndex, rollbackLists.events.length), 0, original);
                    await this.writeFile(oldFile, rollbackLists.events, rollbackLists.tasks, settings);
                }
                catch (rollbackError) {
                    console.error("Daynest: failed to roll back an event move; check both Daily Notes", rollbackError);
                }
                throw moveError;
            }
        }
    }
    updateTask(original, changes) {
        return this.runMutation(() => this.updateTaskUnlocked(original, changes));
    }
    async updateTaskUnlocked(original, changes) {
        const settings = this.getSettings();
        const newDateKey = changes.date ? (0, dateUtils_1.dateKey)(changes.date) : original.date;
        const merged = { ...original, ...changes, date: newDateKey };
        if (newDateKey === original.date) {
            const file = await this.getFile(original.filePath);
            const { events, tasks } = await this.loadListsForFile(file);
            const idx = this.findItemIndex(tasks, original);
            if (idx === -1)
                throw this.missingItemError(original);
            tasks[idx] = merged;
            await this.writeFile(file, events, tasks, settings);
        }
        else {
            const oldFile = await this.getFile(original.filePath);
            const oldLists = await this.loadListsForFile(oldFile);
            const oldIndex = this.findItemIndex(oldLists.tasks, original);
            if (oldIndex === -1)
                throw this.missingItemError(original);
            const originalIndex = oldIndex;
            oldLists.tasks.splice(oldIndex, 1);
            await this.writeFile(oldFile, oldLists.events, oldLists.tasks, settings);
            try {
                const newFile = await (0, dailyNotes_1.ensureDailyNote)(this.app, changes.date);
                const newLists = await this.loadListsForFile(newFile);
                newLists.tasks.push({ ...merged, filePath: newFile.path });
                await this.writeFile(newFile, newLists.events, newLists.tasks, settings);
            }
            catch (moveError) {
                try {
                    const rollbackLists = await this.loadListsForFile(oldFile);
                    rollbackLists.tasks.splice(Math.min(originalIndex, rollbackLists.tasks.length), 0, original);
                    await this.writeFile(oldFile, rollbackLists.events, rollbackLists.tasks, settings);
                }
                catch (rollbackError) {
                    console.error("Daynest: failed to roll back a task move; check both Daily Notes", rollbackError);
                }
                throw moveError;
            }
        }
    }
    async toggleTaskCompleted(item) {
        await this.updateTask(item, { completed: !item.completed });
    }
    deleteItem(item) {
        return this.runMutation(() => this.deleteItemUnlocked(item));
    }
    async deleteItemUnlocked(item) {
        const settings = this.getSettings();
        const file = await this.getFile(item.filePath);
        const { events, tasks } = await this.loadListsForFile(file);
        if (item.kind === "event") {
            const index = this.findItemIndex(events, item);
            if (index === -1)
                throw this.missingItemError(item);
            events.splice(index, 1);
            await this.writeFile(file, events, tasks, settings);
        }
        else {
            const index = this.findItemIndex(tasks, item);
            if (index === -1)
                throw this.missingItemError(item);
            tasks.splice(index, 1);
            await this.writeFile(file, events, tasks, settings);
        }
    }
}
exports.CalendarStore = CalendarStore;
function dateFromKeyOrMoment(d) {
    return typeof d === "string" ? (0, dateUtils_1.fromDateKey)(d) : d;
}

},
"src/tags.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTagsFromTitle = extractTagsFromTitle;
exports.stripTags = stripTags;
exports.parseTagList = parseTagList;
exports.withTags = withTags;
/** Shared hashtag helpers for Markdown parsing and event editing. */
const TAG_PATTERN = /#([^\s#\[\]()]+)/g;
/** Extract tags in first-seen order, normalized to lower case and without '#'. */
function extractTagsFromTitle(title) {
    const tags = [];
    const seen = new Set();
    const pattern = new RegExp(TAG_PATTERN.source, "g");
    let match;
    while ((match = pattern.exec(title))) {
        const tag = match[1].toLowerCase();
        if (!seen.has(tag)) {
            seen.add(tag);
            tags.push(tag);
        }
    }
    return tags;
}
/** Removes every '#tag' token from a title. */
function stripTags(title) {
    return title.replace(new RegExp(TAG_PATTERN.source, "g"), "").replace(/\s{2,}/g, " ").trim();
}
/** Parse a Tags field separated by commas, whitespace, or hashtag markers. */
function parseTagList(raw) {
    const tags = [];
    const seen = new Set();
    for (const entry of raw.split(/[\s,#]+/)) {
        const tag = entry.trim().toLowerCase();
        if (tag && !seen.has(tag)) {
            seen.add(tag);
            tags.push(tag);
        }
    }
    return tags;
}
/** Replaces all hashtags in a title with exactly the supplied tag set. */
function withTags(title, tags) {
    const base = stripTags(title);
    const normalized = parseTagList(tags.join(", "));
    return [base, ...normalized.map((tag) => `#${tag}`)].filter(Boolean).join(" ").trim();
}

},
"src/types.js": function(module, exports, require) {
"use strict";
// Core data model shared by every part of the plugin.
// Keep this file free of Obsidian imports so it stays trivially testable.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = exports.DEFAULT_COLOR_RULES = void 0;
exports.DEFAULT_COLOR_RULES = [
    { id: "rule-work", tags: ["work"], color: "#3B82F6" },
    { id: "rule-personal", tags: ["personal"], color: "#22C55E" },
    { id: "rule-health", tags: ["health"], color: "#EF4444" },
];
exports.DEFAULT_SETTINGS = {
    defaultView: "last",
    lastUsedView: "month",
    firstDayOfWeek: 1, // Monday, matches Apple Calendar's common default outside the US
    defaultEventDurationMinutes: 60,
    minEventDurationMinutes: 15,
    workingHoursStart: { hour: 8, minute: 0 },
    workingHoursEnd: { hour: 18, minute: 0 },
    timeFormat: "24h",
    showWeekendsMonth: true,
    showWeekendsWeek: true,
    showWeekendsYear: true,
    showWeekNumbers: false,
    showCurrentTimeIndicator: true,
    autoScrollToCurrentTime: true,
    eventsHeading: "## Events",
    tasksHeading: "## Tasks",
    separateTaskSection: true,
    eventSpacing: "compact",
    taskSpacing: "compact",
    colorRules: exports.DEFAULT_COLOR_RULES,
    defaultEventColor: "#8E8E93",
    defaultTaskColor: "#8E8E93",
    colorTagsUsingRules: false,
    dailyNoteOpenMode: "new",
    linkedNoteOpenMode: "new",
    eventDensity: "comfortable",
    calendarScale: "medium",
    weekendShading: true,
    cornerRadius: "medium",
    eventStyle: "callout",
    highContrastEventText: false,
    strongEventBackgroundTint: false,
};

},
"src/views/calendarView.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CalendarView = exports.VIEW_TYPE_CALENDAR = void 0;
const obsidian_1 = require("obsidian");
const dateUtils_1 = require("../dateUtils");
const dailyNotes_1 = require("../dailyNotes");
const navigation_1 = require("../navigation");
const eventEditorModal_1 = require("../eventEditorModal");
const yearView_1 = require("./yearView");
const monthView_1 = require("./monthView");
const timelineView_1 = require("./timelineView");
exports.VIEW_TYPE_CALENDAR = "daynest-view";
// Preserve the selected anchor while a view is closed/reopened in the same
// Obsidian session. This module-level value intentionally resets on app restart.
let lastCalendarAnchorForSession = null;
class CalendarView extends obsidian_1.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.anchor = lastCalendarAnchorForSession?.clone() ?? (0, dateUtils_1.today)();
        this.isRendering = false;
        // "full" always wins over a queued "refresh" — a real navigation must never
        // be silently downgraded into an in-place update.
        this.pendingKind = "none";
        // ------------------------------------------------------------ copy / paste
        // Held in memory only: nothing is written anywhere until you actually paste.
        this.clipboard = null;
        const { defaultView, lastUsedView } = plugin.settings;
        this.mode = defaultView === "last" ? lastUsedView ?? "month" : defaultView;
        lastCalendarAnchorForSession = this.anchor.clone();
    }
    get store() {
        return this.plugin.store;
    }
    getViewType() {
        return exports.VIEW_TYPE_CALENDAR;
    }
    getCurrentMode() {
        return this.mode;
    }
    getDisplayText() {
        return "Daynest";
    }
    getIcon() {
        return "calendar";
    }
    getSettings() {
        return this.plugin.settings;
    }
    async onOpen() {
        const container = this.contentEl;
        container.empty();
        container.addClass("daily-calendar-root");
        this.headerEl = container.createDiv({ cls: "daily-calendar-header" });
        this.bodyEl = container.createDiv({ cls: "daily-calendar-body" });
        this.subViews = {
            year: new yearView_1.YearView(this),
            month: new monthView_1.MonthView(this),
            week: new timelineView_1.WeekView(this),
            day: new timelineView_1.DayView(this),
        };
        this.unsubscribe = this.store.onChange((fullRebuild) => {
            if (fullRebuild)
                this.renderBody();
            else
                this.refreshBody();
        });
        this.renderAll();
    }
    async onClose() {
        this.unsubscribe?.();
        Object.values(this.subViews).forEach((v) => v.destroy?.());
    }
    // -------------------------------------------------------------- rendering
    renderAll() {
        this.applySettingsClasses();
        this.renderHeader();
        this.renderBody();
    }
    /** Re-apply appearance settings and refresh content whose fitted labels depend on those styles. */
    refreshAppearanceSettings() {
        this.applySettingsClasses();
        this.refreshBody();
    }
    applySettingsClasses() {
        const settings = this.getSettings();
        const root = this.contentEl;
        root.classList.remove("dc-density-compact", "dc-density-comfortable", "dc-density-spacious");
        root.classList.add(`dc-density-${settings.eventDensity}`);
        root.classList.remove("dc-radius-none", "dc-radius-small", "dc-radius-medium", "dc-radius-large");
        root.classList.add(`dc-radius-${settings.cornerRadius}`);
        root.classList.remove("dc-style-callout", "dc-style-solid");
        root.classList.add(`dc-style-${settings.eventStyle}`);
        root.classList.toggle("dc-high-contrast-event-text", settings.highContrastEventText);
        root.classList.toggle("dc-strong-event-background-tint", settings.strongEventBackgroundTint);
    }
    /** Navigation (mode switch, date change): always a full, from-scratch render. */
    renderBody() {
        this.pendingKind = "full";
        void this.pump();
    }
    /** A data-only change (item created/moved/edited/toggled): prefer the
     * sub-view's lighter in-place update, so scroll position and any
     * transient UI state survive and nothing flickers. */
    refreshBody() {
        if (this.pendingKind === "none")
            this.pendingKind = "refresh";
        void this.pump();
    }
    async pump() {
        if (this.isRendering)
            return; // the active loop below will pick up whatever is now pending
        this.isRendering = true;
        while (this.pendingKind !== "none") {
            const kind = this.pendingKind;
            this.pendingKind = "none";
            const subView = this.subViews[this.mode];
            if (kind === "refresh" && subView.refresh) {
                await subView.refresh();
            }
            else {
                this.bodyEl.empty();
                await subView.render(this.bodyEl, this.anchor);
            }
        }
        this.isRendering = false;
    }
    renderHeader() {
        this.headerEl.empty();
        this.headerEl.createDiv({ cls: "daily-calendar-title", text: this.formatHeaderTitle() });
        const center = this.headerEl.createDiv({ cls: "daily-calendar-view-switcher" });
        ["day", "week", "month", "year"].forEach((m) => {
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
        const prevBtn = right.createEl("button", { cls: "daily-calendar-icon-btn", text: "<", attr: { "aria-label": "Previous" } });
        prevBtn.addEventListener("click", () => this.step(-1));
        const todayBtn = right.createEl("button", { cls: "daily-calendar-btn", text: "Today" });
        todayBtn.addEventListener("click", () => this.goToday());
        const nextBtn = right.createEl("button", { cls: "daily-calendar-icon-btn", text: ">", attr: { "aria-label": "Next" } });
        nextBtn.addEventListener("click", () => this.step(1));
    }
    formatHeaderTitle() {
        if (this.mode === "day")
            return this.anchor.format("LL");
        if (this.mode === "year")
            return this.anchor.format("YYYY");
        if (this.mode === "month")
            return this.anchor.format("MMMM YYYY");
        if (this.mode === "week") {
            const dates = (0, dateUtils_1.getWeekDates)(this.anchor, this.getSettings().firstDayOfWeek);
            const start = dates[0];
            const end = dates[6];
            if (start.month() === end.month())
                return `${start.format("MMMM D")} – ${end.format("D, YYYY")}`;
            if (start.year() === end.year())
                return `${start.format("MMM D")} – ${end.format("MMM D, YYYY")}`;
            return `${start.format("MMM D, YYYY")} – ${end.format("MMM D, YYYY")}`;
        }
        return this.anchor.format("dddd, MMMM D, YYYY");
    }
    step(direction) {
        const unit = this.mode === "year" ? "year" : this.mode === "month" ? "month" : this.mode === "week" ? "week" : "day";
        this.anchor = this.anchor.clone().add(direction, unit);
        lastCalendarAnchorForSession = this.anchor.clone();
        this.renderAll();
    }
    goToday() {
        this.anchor = (0, dateUtils_1.today)();
        lastCalendarAnchorForSession = this.anchor.clone();
        this.renderAll();
    }
    // --------------------------------------------------------- CalendarHost
    async openDailyNote(date) {
        try {
            const file = await (0, dailyNotes_1.ensureDailyNote)(this.app, date);
            await (0, navigation_1.openFileInMode)(this.app, file, this.getSettings().dailyNoteOpenMode);
        }
        catch (e) {
            console.error("Daynest: failed to open Daily Note", e);
            new obsidian_1.Notice("Couldn't open that Daily Note — see the developer console for details.");
        }
    }
    async openLinkedNote(target) {
        try {
            const file = await (0, navigation_1.findOrCreateNoteByTitle)(this.app, target);
            await (0, navigation_1.openFileInMode)(this.app, file, this.getSettings().linkedNoteOpenMode);
        }
        catch (e) {
            console.error("Daynest: failed to open linked note", e);
            new obsidian_1.Notice("Couldn't open that note — see the developer console for details.");
        }
    }
    openEventCreate(date, prefill) {
        const settings = this.getSettings();
        const start = prefill?.start ?? settings.workingHoursStart;
        const end = prefill?.end ?? (0, dateUtils_1.minutesToTime)((0, dateUtils_1.timeToMinutes)(start) + settings.defaultEventDurationMinutes);
        new eventEditorModal_1.ItemEditorModal(this.app, settings, { kind: "event", title: "", allDay: prefill?.allDay ?? false, start, end, time: start, completed: false, tags: [] }, {
            onSaveEvent: async (data) => {
                await this.store.createEvent(date, data);
            },
            onSaveTask: async (data) => {
                await this.store.createTask(date, data);
            },
        }).open();
    }
    openEventEdit(item) {
        new eventEditorModal_1.ItemEditorModal(this.app, this.getSettings(), {
            kind: "event",
            title: item.title,
            allDay: item.allDay,
            start: item.start,
            end: item.end,
            time: item.start,
            completed: false,
            tags: item.tags,
        }, {
            onSaveEvent: async (data) => {
                await this.store.updateEvent(item, data);
            },
            onSaveTask: async (data) => {
                // The Task toggle converted this event into a task: move it into the task section.
                await this.store.deleteItem(item);
                await this.store.createTask((0, dateUtils_1.fromDateKey)(item.date), data);
            },
            onDelete: async () => {
                await this.store.deleteItem(item);
            },
        }).open();
    }
    openTaskCreate(date, prefill) {
        const settings = this.getSettings();
        const time = prefill?.time ?? settings.workingHoursStart;
        new eventEditorModal_1.ItemEditorModal(this.app, settings, {
            kind: "task",
            title: "",
            allDay: prefill?.allDay ?? true,
            start: time,
            end: (0, dateUtils_1.minutesToTime)((0, dateUtils_1.timeToMinutes)(time) + settings.defaultEventDurationMinutes),
            time: prefill?.time ?? null,
            completed: false,
            tags: [],
        }, {
            onSaveEvent: async (data) => {
                await this.store.createEvent(date, data);
            },
            onSaveTask: async (data) => {
                await this.store.createTask(date, data);
            },
        }).open();
    }
    openTaskEdit(item) {
        const settings = this.getSettings();
        const time = item.time ?? settings.workingHoursStart;
        new eventEditorModal_1.ItemEditorModal(this.app, settings, {
            kind: "task",
            title: item.title,
            allDay: item.allDay,
            start: time,
            end: (0, dateUtils_1.minutesToTime)((0, dateUtils_1.timeToMinutes)(time) + settings.defaultEventDurationMinutes),
            time: item.time,
            completed: item.completed,
            tags: item.tags,
        }, {
            onSaveEvent: async (data) => {
                // The Task toggle was switched off: move it into the event section.
                await this.store.deleteItem(item);
                await this.store.createEvent((0, dateUtils_1.fromDateKey)(item.date), data);
            },
            onSaveTask: async (data) => {
                await this.store.updateTask(item, data);
            },
            onDelete: async () => {
                await this.store.deleteItem(item);
            },
        }).open();
    }
    async toggleTask(item) {
        try {
            await this.store.toggleTaskCompleted(item);
        }
        catch (e) {
            console.error("Daynest: failed to toggle task", e);
            new obsidian_1.Notice("Couldn't update that task — see the developer console for details.");
        }
    }
    copyItemToClipboard(item) {
        this.clipboard = item;
    }
    peekClipboard() {
        return this.clipboard;
    }
    async pasteClipboardAt(date, atTime) {
        const src = this.clipboard;
        if (!src)
            return;
        try {
            if (src.kind === "event") {
                // With a target time, keep the duration and shift the start there;
                // without one (day header / month cell), keep the original times.
                const duration = (0, dateUtils_1.timeToMinutes)(src.end) - (0, dateUtils_1.timeToMinutes)(src.start);
                const start = atTime && !src.allDay ? atTime : src.start;
                const end = atTime && !src.allDay ? (0, dateUtils_1.minutesToTime)((0, dateUtils_1.timeToMinutes)(atTime) + duration) : src.end;
                await this.store.createEvent(date, { title: src.title, allDay: src.allDay, start, end, tags: src.tags });
            }
            else {
                const time = atTime && !src.allDay ? atTime : src.time;
                await this.store.createTask(date, {
                    title: src.title,
                    allDay: src.allDay,
                    time,
                    tags: src.tags,
                    completed: src.completed,
                });
            }
        }
        catch (e) {
            console.error("Daynest: failed to paste", e);
            new obsidian_1.Notice("Couldn't paste that — see the developer console for details.");
        }
    }
    goTo(anchor, mode) {
        this.anchor = anchor.clone();
        lastCalendarAnchorForSession = this.anchor.clone();
        this.setModeInternal(mode);
        this.renderAll();
    }
    /** Always remember the current mode so selecting "Last used view" later starts from the real last view. */
    setModeInternal(mode) {
        this.mode = mode;
        if (this.plugin.settings.lastUsedView !== mode) {
            this.plugin.settings.lastUsedView = mode;
            // Persist in the background; navigation should repaint immediately.
            void this.plugin.saveSettings();
        }
    }
    // ---------------------------------------------------------- public API
    // Used by main.ts commands (go to today, switch view, create event/task).
    setMode(mode) {
        this.setModeInternal(mode);
        this.renderAll();
    }
    jumpToToday() {
        this.goToday();
    }
    createEventForAnchor() {
        this.openEventCreate(this.anchor);
    }
    createTaskForAnchor() {
        this.openTaskCreate(this.anchor);
    }
}
exports.CalendarView = CalendarView;

},
"src/views/monthView.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonthView = void 0;
const obsidian_1 = require("obsidian");
const dateUtils_1 = require("../dateUtils");
const shared_1 = require("./shared");
const MAX_VISIBLE_ITEMS = 4;
class MonthView {
    constructor(host) {
        this.host = host;
        this.itemsById = new Map();
        this.listsByDate = new Map();
        this.lastContainer = null;
        this.lastAnchor = null;
        this.lastHideWeekend = null;
    }
    async render(container, anchor) {
        const settings = this.host.getSettings();
        this.lastContainer = container;
        this.lastAnchor = anchor.clone();
        const weeks = (0, dateUtils_1.getMonthGridWeeks)(anchor, settings.firstDayOfWeek);
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
        const hideWeekend = (0, shared_1.shouldHideWeekends)(settings.showWeekendsMonth, ownMonthDates, itemsByDate);
        this.lastHideWeekend = hideWeekend;
        const dayNames = (0, dateUtils_1.orderedWeekdayShortNames)(settings.firstDayOfWeek);
        const headerRow = root.createDiv({ cls: "dc-month-row dc-month-headerrow" });
        if (settings.showWeekNumbers)
            headerRow.createDiv({ cls: "dc-month-weeknum-cell" });
        dayNames.forEach((name, i) => {
            const dow = (settings.firstDayOfWeek + i) % 7;
            if (hideWeekend && (dow === 0 || dow === 6))
                return;
            headerRow.createDiv({ cls: "dc-month-headercell", text: name });
        });
        const grid = root.createDiv({ cls: "dc-month-grid" });
        grid.style.setProperty("--dc-month-rows", String(weeks.length));
        weeks.forEach((week) => {
            const row = grid.createDiv({ cls: "dc-month-row" });
            if (settings.showWeekNumbers) {
                row.createDiv({ cls: "dc-month-weeknum-cell", text: String((0, dateUtils_1.weekNumber)(week[0])) });
            }
            week.forEach((date) => {
                var _a;
                const dow = date.day();
                if (hideWeekend && (dow === 0 || dow === 6))
                    return;
                this.renderDayCell(row, date, anchor, (_a = itemsByDate.get((0, dateUtils_1.dateKey)(date))) !== null && _a !== void 0 ? _a : [], settings);
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
    async refresh() {
        if (!this.lastContainer || !this.lastAnchor)
            return;
        const container = this.lastContainer;
        const anchor = this.lastAnchor.clone();
        const settings = this.host.getSettings();
        const weeks = (0, dateUtils_1.getMonthGridWeeks)(anchor, settings.firstDayOfWeek);
        const itemsByDate = await this.host.store.getItemsForRange(weeks[0][0], weeks[weeks.length - 1][6]);
        const ownMonthDates = weeks.flat().filter((date) => date.month() === anchor.month());
        const hideWeekend = (0, shared_1.shouldHideWeekends)(settings.showWeekendsMonth, ownMonthDates, itemsByDate);
        if (hideWeekend !== this.lastHideWeekend) {
            // The set of rendered columns itself changed (e.g. the first item was
            // moved onto a weekend); rebuild only the month subview, not its tab.
            await this.render(container, anchor);
            return;
        }
        this.itemsById.clear();
        itemsByDate.forEach((items) => items.forEach((item) => this.itemsById.set(item.id, item)));
        weeks.flat().forEach((date) => {
            var _a;
            const list = this.listsByDate.get((0, dateUtils_1.dateKey)(date));
            if (!list)
                return; // hidden weekend column
            this.renderCellItems(list, date, (_a = itemsByDate.get((0, dateUtils_1.dateKey)(date))) !== null && _a !== void 0 ? _a : [], settings);
        });
    }
    renderDayCell(row, date, monthAnchor, items, settings) {
        const inMonth = date.month() === monthAnchor.month();
        const cell = row.createDiv({ cls: "dc-month-cell" });
        if (!inMonth)
            cell.addClass("dc-outside-month");
        if ((0, dateUtils_1.isToday)(date))
            cell.addClass("dc-is-today");
        if (settings.weekendShading && (date.day() === 0 || date.day() === 6))
            cell.addClass("dc-weekend");
        cell.addEventListener("dragover", (e) => {
            e.preventDefault();
            cell.addClass("dc-drop-target");
        });
        cell.addEventListener("dragleave", () => cell.removeClass("dc-drop-target"));
        cell.addEventListener("drop", (e) => {
            var _a;
            e.preventDefault();
            cell.removeClass("dc-drop-target");
            const id = (_a = e.dataTransfer) === null || _a === void 0 ? void 0 : _a.getData("text/dc-item-id");
            const item = id ? this.itemsById.get(id) : undefined;
            if (item && item.date !== (0, dateUtils_1.dateKey)(date))
                (0, shared_1.handleCalendarAction)("move that item", (0, shared_1.moveItemToDate)(this.host.store, item, date));
        });
        const headerEl = cell.createDiv({ cls: "dc-month-cell-header" });
        const badge = headerEl.createDiv({ cls: "dc-day-badge", text: String(date.date()) });
        badge.addEventListener("click", (e) => {
            e.stopPropagation();
            void this.host.openDailyNote(date);
        });
        const addBtn = headerEl.createDiv({ cls: "dc-add-btn", attr: { "aria-label": "Add event" } });
        (0, obsidian_1.setIcon)(addBtn, "plus");
        addBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.host.openEventCreate(date, { allDay: true });
        });
        const list = cell.createDiv({ cls: "dc-month-cell-items" });
        this.listsByDate.set((0, dateUtils_1.dateKey)(date), list);
        this.renderCellItems(list, date, items, settings);
        cell.addEventListener("click", () => void this.host.openDailyNote(date));
        // Right-click on the day number or empty space: there's no time axis in
        // this view, so this is always a whole-day action.
        cell.addEventListener("contextmenu", (e) => (0, shared_1.showEmptyContextMenu)(e, {
            onNewEvent: () => this.host.openEventCreate(date, { allDay: true }),
            onPaste: this.host.peekClipboard() ? () => void this.host.pasteClipboardAt(date) : undefined,
        }));
    }
    renderCellItems(list, date, items, settings) {
        list.empty();
        const sorted = [...items].sort((a, b) => {
            var _a, _b;
            if (a.allDay !== b.allDay)
                return a.allDay ? -1 : 1;
            const ta = a.kind === "event" ? a.start : (_a = a.time) !== null && _a !== void 0 ? _a : { hour: 0, minute: 0 };
            const tb = b.kind === "event" ? b.start : (_b = b.time) !== null && _b !== void 0 ? _b : { hour: 0, minute: 0 };
            return ta.hour * 60 + ta.minute - (tb.hour * 60 + tb.minute);
        });
        sorted.slice(0, MAX_VISIBLE_ITEMS).forEach((item) => {
            const chip = (0, shared_1.renderItemChip)(this.host, item, settings);
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
    showItemMenu(e, item, date) {
        (0, shared_1.showItemContextMenu)(e, {
            onNewEvent: () => this.host.openEventCreate(date, { allDay: true }),
            onEdit: () => (item.kind === "event" ? this.host.openEventEdit(item) : this.host.openTaskEdit(item)),
            onDuplicate: () => (0, shared_1.duplicateItem)(this.host, item),
            onCopy: () => this.host.copyItemToClipboard(item),
            onPaste: this.host.peekClipboard() ? () => void this.host.pasteClipboardAt(date) : undefined,
            onDelete: () => (0, shared_1.handleCalendarAction)("delete that item", this.host.store.deleteItem(item)),
        });
    }
}
exports.MonthView = MonthView;

},
"src/views/overlapLayout.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.layoutOverlaps = layoutOverlaps;
/**
 * Assigns side-by-side columns to overlapping time blocks (classic calendar
 * "collision cluster" algorithm). Non-overlapping blocks share column 0 with
 * totalCols 1. Within a cluster of mutually-overlapping blocks, each block
 * gets the first free column, and totalCols is the number of columns the
 * whole cluster ended up needing.
 */
function layoutOverlaps(items) {
    const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    const result = [];
    let cluster = [];
    let clusterEnd = -Infinity;
    const flush = () => {
        if (cluster.length === 0)
            return;
        const colEndTimes = [];
        cluster.forEach((it) => {
            let col = colEndTimes.findIndex((end) => end <= it.startMin);
            if (col === -1) {
                col = colEndTimes.length;
                colEndTimes.push(it.endMin);
            }
            else {
                colEndTimes[col] = it.endMin;
            }
            result.push({ ...it, col, totalCols: 0 }); // totalCols filled in below
        });
        const totalCols = colEndTimes.length;
        for (let i = result.length - cluster.length; i < result.length; i++) {
            result[i].totalCols = totalCols;
        }
        cluster = [];
    };
    for (const it of sorted) {
        if (cluster.length > 0 && it.startMin >= clusterEnd) {
            flush();
            clusterEnd = -Infinity;
        }
        cluster.push(it);
        clusterEnd = Math.max(clusterEnd, it.endMin);
    }
    flush();
    return result;
}

},
"src/views/shared.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCalendarAction = handleCalendarAction;
exports.moveItemToDate = moveItemToDate;
exports.moveItemDateTime = moveItemDateTime;
exports.duplicateItem = duplicateItem;
exports.renderItemChip = renderItemChip;
exports.defaultColorFor = defaultColorFor;
exports.fitTitleAndTagBadges = fitTitleAndTagBadges;
exports.renderTaskTagHints = renderTaskTagHints;
exports.showItemContextMenu = showItemContextMenu;
exports.showEmptyContextMenu = showEmptyContextMenu;
exports.shouldHideWeekends = shouldHideWeekends;
const obsidian_1 = require("obsidian");
const dateUtils_1 = require("../dateUtils");
const colorRules_1 = require("../colorRules");
const parser_1 = require("../parser");
/** Report failed async gestures/actions without leaving an unhandled promise rejection. */
function handleCalendarAction(action, operation) {
    void operation.catch((error) => {
        const detail = error instanceof Error ? error.message : String(error);
        console.error(`Daynest: failed to ${action}: ${detail}`, error);
        // Keep a useful clue in the notification as well as the full stack in
        // the console, so repeated write/identity failures can be diagnosed.
        const compactDetail = detail.length > 140 ? `${detail.slice(0, 137)}…` : detail;
        new obsidian_1.Notice(`Couldn't ${action}: ${compactDetail}`, 8000);
    });
}
/** Moves an item to a new date, keeping its time-of-day unchanged. Used by drag-and-drop in Month view. */
async function moveItemToDate(store, item, newDate) {
    if (item.kind === "event")
        await store.updateEvent(item, { date: newDate });
    else
        await store.updateTask(item, { date: newDate });
}
/** Moves an item to a new date AND time, preserving an event's duration. Used by Week/Day timeline drag. */
async function moveItemDateTime(store, item, newDate, newStartMin, durationMin) {
    if (item.kind === "event") {
        await store.updateEvent(item, {
            date: newDate,
            start: (0, dateUtils_1.minutesToTime)(newStartMin),
            end: (0, dateUtils_1.minutesToTime)(newStartMin + durationMin),
        });
    }
    else {
        await store.updateTask(item, { date: newDate, time: (0, dateUtils_1.minutesToTime)(newStartMin) });
    }
}
/** Creates an exact copy of an item on the same date — the two then sit side by side. */
function duplicateItem(host, item) {
    const date = (0, dateUtils_1.fromDateKey)(item.date);
    if (item.kind === "event") {
        void host.store.createEvent(date, {
            title: item.title,
            allDay: item.allDay,
            start: item.start,
            end: item.end,
            tags: item.tags,
        });
    }
    else {
        void host.store.createTask(date, {
            title: item.title,
            allDay: item.allDay,
            time: item.time,
            tags: item.tags,
            completed: item.completed,
        });
    }
}
/**
 * Renders a compact coloured chip for an event/task: dot-or-checkbox + label
 * + tag badges, click-to-edit, Cmd/Ctrl-click-to-open-linked-note, and (by
 * default) native drag-and-drop as a move source. Shared by Month view's day
 * cells and the Week/Day timeline's all-day row so both look and behave
 * identically.
 */
function renderItemChip(host, item, settings, opts) {
    const color = (0, colorRules_1.resolveColor)(item.tags, settings.colorRules, defaultColorFor(item, settings));
    const chip = createDiv({ cls: "dc-pill" + (item.kind === "task" ? " dc-pill-task" : "") });
    chip.style.setProperty("--dc-item-color", color);
    if ((opts === null || opts === void 0 ? void 0 : opts.draggable) !== false) {
        chip.draggable = true;
        chip.addEventListener("dragstart", (e) => {
            var _a;
            (_a = e.dataTransfer) === null || _a === void 0 ? void 0 : _a.setData("text/dc-item-id", item.id);
            if (e.dataTransfer)
                e.dataTransfer.effectAllowed = "move";
        });
    }
    if (item.kind === "task") {
        const check = chip.createDiv({ cls: "dc-pill-check" + (item.completed ? " is-checked" : "") });
        check.addEventListener("mousedown", (e) => e.stopPropagation());
        check.addEventListener("click", (e) => {
            e.stopPropagation();
            void host.toggleTask(item);
        });
    }
    const label = chip.createSpan({ cls: "dc-pill-label" });
    const fullTitle = (0, parser_1.stripTags)((0, parser_1.displayTitle)(item.title));
    label.setText(fullTitle);
    if ((0, parser_1.firstWikilinkTarget)(item.title))
        label.addClass("dc-linked");
    if (item.kind === "task" && item.completed)
        label.addClass("dc-completed");
    renderPillTagHint(chip, label, item, settings);
    // Task tags display in full when their complete set fits after the title;
    // otherwise they collapse to one # marker. The hover popover has all names.
    attachItemTitlePopover(chip, label, item.kind === "task" ? (0, parser_1.displayTitle)(item.title) : fullTitle, item.kind === "task" && item.tags.length > 0);
    chip.addEventListener("click", (e) => {
        e.stopPropagation();
        const linkTarget = (0, parser_1.firstWikilinkTarget)(item.title);
        if ((e.metaKey || e.ctrlKey) && linkTarget) {
            void host.openLinkedNote(linkTarget);
            return;
        }
        if (item.kind === "event")
            host.openEventEdit(item);
        else
            host.openTaskEdit(item);
    });
    return chip;
}
function defaultColorFor(item, settings) {
    return item.kind === "task" ? settings.defaultTaskColor : settings.defaultEventColor;
}
/** Apply the same optional rule-based color to a rendered tag badge. */
function styleTagBadge(badge, item, settings) {
    if (!settings.colorTagsUsingRules)
        return;
    const color = (0, colorRules_1.resolveColor)(item.tags, settings.colorRules, defaultColorFor(item, settings));
    badge.style.setProperty("background-color", `color-mix(in srgb, ${color} 20%, var(--background-primary))`, "important");
    badge.style.setProperty("border-color", color, "important");
    badge.style.setProperty("color", color, "important");
}
/**
 * Gives the title first claim on a single row shared with hashtag badges.
 * When the complete row does not fit, only the first badge remains: it is
 * shortened to a useful prefix when possible, otherwise it becomes a bare #.
 * Returns true only when the full title and every badge are visible.
 */
function fitTitleAndTagBadges(container, label, badges) {
    if (!container.isConnected || !label.isConnected || badges.length === 0 || badges.some((badge) => !badge.isConnected))
        return false;
    const containerStyle = getComputedStyle(container);
    const contentWidth = container.clientWidth
        - parseFloat(containerStyle.paddingLeft || "0")
        - parseFloat(containerStyle.paddingRight || "0");
    if (contentWidth <= 0)
        return false;
    const gap = parseFloat(containerStyle.columnGap || containerStyle.gap || "0") || 0;
    const allChildren = Array.from(container.children);
    const fixedChildren = allChildren.filter((child) => child !== label && !badges.includes(child));
    const margins = (element) => {
        const style = getComputedStyle(element);
        return parseFloat(style.marginLeft || "0") + parseFloat(style.marginRight || "0");
    };
    const outerWidth = (element) => element.getBoundingClientRect().width + margins(element);
    // Temporarily measure max-content widths, rather than the widths assigned by
    // flexbox after the title and badges have already started competing.
    label.style.flex = "0 0 auto";
    label.style.width = "max-content";
    label.style.minWidth = "0";
    label.style.maxWidth = "none";
    for (const badge of badges) {
        badge.style.flex = "0 0 auto";
        badge.style.width = "max-content";
        badge.style.minWidth = "max-content";
        badge.style.maxWidth = "none";
        badge.style.boxSizing = "border-box";
        badge.style.overflow = "visible";
        badge.style.textOverflow = "clip";
        badge.style.whiteSpace = "nowrap";
    }
    const titleWidth = Math.max(label.getBoundingClientRect().width, label.scrollWidth);
    const fixedWidth = fixedChildren.reduce((sum, child) => sum + outerWidth(child), 0);
    const fullBadgeWidths = badges.map(outerWidth);
    const labelMargins = margins(label);
    const rowGaps = gap * Math.max(0, allChildren.length - 1);
    const fullWidth = fixedWidth + labelMargins + titleWidth + fullBadgeWidths.reduce((sum, width) => sum + width, 0) + rowGaps;
    if (fullWidth <= contentWidth + 1) {
        label.style.width = `${titleWidth}px`;
        label.style.flex = "0 0 auto";
        for (const badge of badges) {
            badge.style.width = "max-content";
            badge.style.flex = "0 0 auto";
        }
        return true;
    }
    // Full tags do not fit as a set. Keep the first real tag badge so theme
    // styling remains intact, and let its text ellipsize before sacrificing title.
    for (const badge of badges.slice(1))
        badge.remove();
    const badge = badges[0];
    const badgeMargins = margins(badge);
    const usableWidth = contentWidth - fixedWidth - labelMargins - badgeMargins - gap * (fixedChildren.length + 1);
    const fullTagText = badge.textContent || "#";
    badge.style.width = "max-content";
    badge.style.minWidth = "max-content";
    badge.textContent = "#";
    const hashBoxWidth = badge.getBoundingClientRect().width;
    badge.textContent = fullTagText;
    const fullFirstBadgeWidth = badge.getBoundingClientRect().width;
    const setBareHash = () => {
        badge.textContent = "#";
        badge.style.flex = `0 0 ${hashBoxWidth}px`;
        badge.style.width = `${hashBoxWidth}px`;
        badge.style.minWidth = `${hashBoxWidth}px`;
        badge.style.maxWidth = `${hashBoxWidth}px`;
        badge.style.overflow = "hidden";
        badge.style.textOverflow = "clip";
        badge.style.whiteSpace = "nowrap";
    };
    if (titleWidth + fullFirstBadgeWidth <= usableWidth + 1) {
        // The first complete tag still fits even though later tags had to go.
        label.style.width = `${titleWidth}px`;
        label.style.flex = "0 0 auto";
        badge.style.width = "max-content";
        badge.style.minWidth = "max-content";
        badge.style.maxWidth = "none";
        badge.style.flex = "0 0 auto";
        return false;
    }
    if (titleWidth + hashBoxWidth <= usableWidth + 1) {
        // Preserve the complete title and grant the badge only the leftover width.
        label.style.width = `${titleWidth}px`;
        label.style.flex = "0 0 auto";
        const availableBadgeWidth = Math.max(0, usableWidth - titleWidth);
        badge.textContent = `${fullTagText.slice(0, 2)}…`;
        const prefixWidth = badge.getBoundingClientRect().width;
        if (availableBadgeWidth + 1 >= prefixWidth) {
            badge.textContent = fullTagText;
            badge.style.flex = "0 1 auto";
            badge.style.width = "auto";
            badge.style.minWidth = `${hashBoxWidth}px`;
            badge.style.maxWidth = `${availableBadgeWidth}px`;
            badge.style.overflow = "hidden";
            badge.style.textOverflow = "ellipsis";
        }
        else {
            setBareHash();
        }
        return false;
    }
    // Even a title plus a tag prefix cannot fit. Reserve a real # badge and let
    // the title alone shrink, displaying its own ellipsis instead of losing #.
    setBareHash();
    label.style.width = "0px";
    label.style.flex = "1 1 0px";
    label.style.minWidth = "0";
    label.style.maxWidth = "none";
    return false;
}
/**
 * Compact pills share one row between title and tags. Tasks try all complete
 * badges when possible; otherwise the first tag is shortened or reduced to #
 * while the title keeps priority. Event pills show the first tag the same way.
 */
function renderPillTagHint(chip, label, item, settings) {
    if (item.tags.length === 0)
        return;
    if (item.kind === "task") {
        renderTaskTagHints(chip, label, item, settings);
        return;
    }
    const tag = item.tags[0];
    const badge = chip.createEl("a", {
        cls: "tag dc-tag-badge dc-pill-tag-hint",
        text: `#${tag}`,
        attr: { href: `#${tag}` },
    });
    styleTagBadge(badge, item, settings);
    badge.style.display = "inline-block";
    badge.style.minWidth = "0";
    badge.style.flex = "0 0 auto";
    badge.style.overflow = "hidden";
    badge.style.textOverflow = "ellipsis";
    window.requestAnimationFrame(() => fitTitleAndTagBadges(chip, label, [badge]));
}
/**
 * Task tags sit beside the title. Keep the full set if it fits, otherwise use
 * the first tag only and shorten its text before shrinking the title; reserve a
 * bare # when title plus any tag prefix cannot both fit.
 */
function renderTaskTagHints(container, label, item, settings) {
    if (item.tags.length === 0)
        return;
    const badges = item.tags.map((tag) => {
        const badge = container.createEl("a", {
            cls: "tag dc-tag-badge dc-task-full-tag",
            text: `#${tag}`,
            attr: { href: `#${tag}` },
        });
        styleTagBadge(badge, item, settings);
        badge.style.display = "inline-block";
        return badge;
    });
    // The chips are assembled detached; measure them once the real cell width is known.
    window.requestAnimationFrame(() => fitTitleAndTagBadges(container, label, badges));
}
/** Show a lightweight full-title popover only when the visible label is clipped. */
function attachItemTitlePopover(el, label, text, showWhenTagsHidden = false) {
    let timer = null;
    let popover = null;
    let observer = null;
    let hovered = false;
    const hide = () => {
        if (timer !== null)
            window.clearTimeout(timer);
        timer = null;
        observer === null || observer === void 0 ? void 0 : observer.disconnect();
        observer = null;
        popover === null || popover === void 0 ? void 0 : popover.remove();
        popover = null;
    };
    el.addEventListener("mouseenter", () => {
        hovered = true;
        hide();
        timer = window.setTimeout(() => {
            timer = null;
            // A data refresh may detach a chip while the hover delay is pending.
            // A detached node reports a (0, 0) rectangle and would leave a stuck
            // popover in Obsidian's top-left corner if we didn't reject it here.
            if (!hovered || !el.isConnected)
                return;
            if (!showWhenTagsHidden && label.scrollWidth <= label.clientWidth + 1 && label.scrollHeight <= label.clientHeight + 1)
                return;
            popover = document.body.createDiv({ cls: "dc-hover-popover", text });
            const rect = el.getBoundingClientRect();
            const left = Math.max(4, Math.min(rect.left, window.innerWidth - 272));
            popover.style.left = `${left}px`;
            const popoverHeight = popover.getBoundingClientRect().height;
            const below = rect.bottom + 6;
            popover.style.top = `${below + popoverHeight <= window.innerHeight - 4 ? below : Math.max(4, rect.top - popoverHeight - 6)}px`;
            // When render replaces a hovered chip, mouseleave won't fire on the
            // detached element. Observe detachment and remove the floating popover.
            observer = new MutationObserver(() => {
                if (!el.isConnected)
                    hide();
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }, 350);
    });
    el.addEventListener("mouseleave", () => {
        hovered = false;
        hide();
    });
    el.addEventListener("click", hide, true);
    el.addEventListener("dragstart", hide, true);
}
/** Right-click menu on an existing event/task: New event / Edit / Duplicate / Copy / Paste / Delete. */
function showItemContextMenu(e, actions) {
    e.preventDefault();
    e.stopPropagation();
    const menu = new obsidian_1.Menu();
    menu.addItem((mi) => mi.setTitle("New event").setIcon("calendar-plus").onClick(() => actions.onNewEvent()));
    menu.addItem((mi) => mi.setTitle("Edit").setIcon("pencil").onClick(() => actions.onEdit()));
    menu.addItem((mi) => mi.setTitle("Duplicate").setIcon("copy-plus").onClick(() => actions.onDuplicate()));
    menu.addItem((mi) => mi.setTitle("Copy").setIcon("copy").onClick(() => actions.onCopy()));
    if (actions.onPaste) {
        const paste = actions.onPaste;
        menu.addItem((mi) => mi.setTitle("Paste").setIcon("clipboard-paste").onClick(() => paste()));
    }
    menu.addItem((mi) => mi.setTitle("Delete").setIcon("trash-2").onClick(() => actions.onDelete()));
    menu.showAtMouseEvent(e);
}
/** Right-click menu on empty space (no item under the cursor): New event / Paste. */
function showEmptyContextMenu(e, actions) {
    e.preventDefault();
    const menu = new obsidian_1.Menu();
    menu.addItem((mi) => mi.setTitle("New event").setIcon("calendar-plus").onClick(() => actions.onNewEvent()));
    if (actions.onPaste) {
        const paste = actions.onPaste;
        menu.addItem((mi) => mi.setTitle("Paste").setIcon("clipboard-paste").onClick(() => paste()));
    }
    menu.showAtMouseEvent(e);
}
/**
 * The "show weekends" settings are ignored for any range that actually has
 * something on a Saturday or Sunday — hiding weekends there would silently
 * hide real items, and showing just one of the two days (or only some
 * weeks of a month) would look lopsided. The range passed in is the whole
 * visible span: one week for Week view, the whole grid for Month/a mini-month.
 */
function shouldHideWeekends(showWeekendsSetting, dates, itemsByDate) {
    if (showWeekendsSetting)
        return false;
    const hasWeekendItems = dates.some((d) => { var _a, _b; return (0, dateUtils_1.isWeekendDate)(d) && ((_b = (_a = itemsByDate.get((0, dateUtils_1.dateKey)(d))) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) > 0; });
    return !hasWeekendItems;
}

},
"src/views/timelineView.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DayView = exports.WeekView = exports.TimelineBaseView = void 0;
const obsidian_1 = require("obsidian");
const dateUtils_1 = require("../dateUtils");
const parser_1 = require("../parser");
const colorRules_1 = require("../colorRules");
const overlapLayout_1 = require("./overlapLayout");
const shared_1 = require("./shared");
const SNAP_MINUTES = 15;
const MIN_BLOCK_HEIGHT_PX = 18;
const TASK_BLOCK_HEIGHT_PX = 22;
/** Keep a small visual gap before the next event when the event is tall enough to spare it. */
const ADJACENT_EVENT_GAP_PX = 2;
function eventBlockHeight(startMin, endMin, hourHeight) {
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
function hourHeightFor(scale) {
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
class TimelineBaseView {
    finishPendingMoveVisual() {
        const cleanup = this.pendingMoveVisualCleanup;
        this.pendingMoveVisualCleanup = null;
        cleanup?.();
    }
    registerInteractionCleanup(cleanup) {
        this.activeInteractionCleanup?.();
        this.activeInteractionCleanup = cleanup;
    }
    releaseInteractionCleanup(cleanup) {
        if (this.activeInteractionCleanup === cleanup)
            this.activeInteractionCleanup = null;
    }
    constructor(host, getDates) {
        this.host = host;
        this.getDates = getDates;
        this.intervalId = null;
        /** One active gesture owns all temporary listeners and preview UI. */
        this.activeInteractionCleanup = null;
        /** The drag proxy stays visible until the data refresh has rendered the moved item. */
        this.pendingMoveVisualCleanup = null;
        // Retained across renders so refresh() can update in place.
        this.lastContainer = null;
        this.lastAnchor = null;
        /** Every date of the period (e.g. all 7 of a week), whether or not it's currently shown. */
        this.lastAllDates = null;
        /** The dates actually shown as columns (weekends may be filtered out of Week view). */
        this.lastDates = null;
        this.lastRootEl = null;
        this.lastAllDayRowEl = null;
        this.lastColumnsEl = null;
        this.lastScrollEl = null;
    }
    async render(container, anchor) {
        await this.build(container, anchor, null);
    }
    async build(container, anchor, restoreScrollTop, preserveExistingUntilReady = false) {
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
            if ((0, dateUtils_1.isToday)(date))
                col.addClass("dc-is-today");
            // Day view stays neutral; weekend shading belongs to multi-day Week view.
            if (dates.length > 1 && settings.weekendShading && (0, dateUtils_1.isWeekendDate)(date))
                col.addClass("dc-weekend");
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
            label.setText((0, dateUtils_1.formatTimeOfDay)({ hour: h, minute: 0 }, settings.timeFormat));
        }
        const columns = grid.createDiv({ cls: "dc-timeline-columns" });
        this.lastColumnsEl = columns;
        dates.forEach((date) => {
            const col = this.buildColumnSkeleton(columns, date, dates, settings, hourHeight);
            this.populateColumnBlocks(col, columns, date, dates, itemsByDate.get((0, dateUtils_1.dateKey)(date)) ?? [], settings, hourHeight);
        });
        if (settings.showCurrentTimeIndicator) {
            this.updateNowLine(columns, gutter, dates, allDates, hourHeight);
            this.intervalId = window.setInterval(() => this.updateNowLine(columns, gutter, dates, allDates, hourHeight), 60000);
        }
        const showingToday = dates.some((d) => (0, dateUtils_1.isToday)(d));
        const now = (0, obsidian_1.moment)();
        const scrollTargetMin = settings.autoScrollToCurrentTime && showingToday
            ? now.hour() * 60 + now.minute()
            : (0, dateUtils_1.timeToMinutes)(settings.workingHoursStart);
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
    visibleDates(allDates, itemsByDate, settings) {
        if (allDates.length < 2)
            return allDates;
        return (0, shared_1.shouldHideWeekends)(settings.showWeekendsWeek, allDates, itemsByDate)
            ? allDates.filter((d) => !(0, dateUtils_1.isWeekendDate)(d))
            : allDates;
    }
    /** Data-only change: update the all-day row and every column's blocks in
     * place. The scroll container, header, and hour-grid are never touched —
     * unless the change alters which columns should exist at all (a first
     * item landing on a hidden weekend), in which case the columns are
     * rebuilt with the scroll position carried across. */
    async refresh() {
        if (!this.lastAllDates ||
            !this.lastDates ||
            !this.lastColumnsEl ||
            !this.lastRootEl ||
            !this.lastContainer ||
            !this.lastAnchor) {
            return;
        }
        const settings = this.host.getSettings();
        const allDates = this.lastAllDates;
        const hourHeight = hourHeightFor(settings.calendarScale);
        const itemsByDate = await this.host.store.getItemsForRange(allDates[0], allDates[allDates.length - 1]);
        const nextDates = this.visibleDates(allDates, itemsByDate, settings);
        const previous = this.lastDates;
        const sameColumns = nextDates.length === previous.length && nextDates.every((d, i) => (0, dateUtils_1.isSameDay)(d, previous[i]));
        if (!sameColumns) {
            await this.build(this.lastContainer, this.lastAnchor, this.lastScrollEl?.scrollTop ?? null, true);
            this.finishPendingMoveVisual();
            return;
        }
        this.lastAllDayRowEl = this.syncAllDayRow(this.lastRootEl, previous, itemsByDate, settings, this.lastAllDayRowEl);
        const columns = this.lastColumnsEl;
        previous.forEach((date, i) => {
            const col = columns.children.item(i);
            if (!col)
                return;
            col.querySelectorAll(".dc-block").forEach((el) => el.remove());
            this.populateColumnBlocks(col, columns, date, previous, itemsByDate.get((0, dateUtils_1.dateKey)(date)) ?? [], settings, hourHeight);
        });
        // The fresh item DOM is now in place under the proxy. Remove the proxy
        // only after rendering finishes, avoiding the old-position flash on mouseup.
        this.finishPendingMoveVisual();
    }
    destroy() {
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
    syncAllDayRow(root, dates, itemsByDate, settings, existing) {
        const hasAnyAllDay = dates.some((date) => (itemsByDate.get((0, dateUtils_1.dateKey)(date)) ?? []).some((it) => it.allDay));
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
            if (header?.nextSibling)
                root.insertBefore(allDayRow, header.nextSibling);
            else
                root.appendChild(allDayRow);
        }
        const allDayCols = allDayRow.querySelector(".dc-timeline-allday-cols");
        allDayCols.empty();
        dates.forEach((date) => {
            const col = allDayCols.createDiv({ cls: "dc-timeline-allday-col" });
            if (dates.length > 1 && settings.weekendShading && (0, dateUtils_1.isWeekendDate)(date))
                col.addClass("dc-weekend");
            const items = (itemsByDate.get((0, dateUtils_1.dateKey)(date)) ?? []).filter((it) => it.allDay);
            items.forEach((item) => {
                const chip = (0, shared_1.renderItemChip)(this.host, item, settings);
                chip.addEventListener("contextmenu", (e) => this.showAllDayItemMenu(e, item, date));
                col.appendChild(chip);
            });
            col.addEventListener("contextmenu", (e) => this.showDayMenu(e, date));
        });
        return allDayRow;
    }
    // ------------------------------------------------------------------ columns
    buildColumnSkeleton(container, date, allDates, settings, hourHeight) {
        const col = container.createDiv({ cls: "dc-timeline-col" });
        if ((0, dateUtils_1.isToday)(date))
            col.addClass("dc-is-today");
        // Do not shade the single all-day column in Day view. In Week view, keep
        // weekend shading even when the current day itself falls on a weekend.
        if (allDates.length > 1 && settings.weekendShading && (0, dateUtils_1.isWeekendDate)(date))
            col.addClass("dc-weekend");
        col.style.width = `${100 / allDates.length}%`;
        const workStart = settings.workingHoursStart.hour;
        const workEnd = settings.workingHoursEnd.hour;
        for (let h = 0; h < 24; h++) {
            const isOffHours = h < workStart || h >= workEnd;
            const line = col.createDiv({ cls: "dc-timeline-hourline" + (isOffHours ? " dc-timeline-hourline-off" : "") });
            line.style.top = `${h * hourHeight}px`;
        }
        col.addEventListener("mousedown", (e) => {
            if (e.button !== 0 || e.target !== col)
                return;
            this.startCreateDrag(e, col, date, settings, hourHeight);
        });
        // Right-click on empty timeline space (blocks stop their own contextmenu
        // from bubbling up here): New event at that spot / Paste at that time.
        col.addEventListener("contextmenu", (e) => {
            const minutes = this.minutesAtY(col, e.clientY, hourHeight, 1440 - SNAP_MINUTES);
            (0, shared_1.showEmptyContextMenu)(e, {
                onNewEvent: () => this.startClickDefineRange(col, date, minutes, settings, hourHeight),
                onPaste: this.host.peekClipboard()
                    ? () => void this.host.pasteClipboardAt(date, (0, dateUtils_1.minutesToTime)(minutes))
                    : undefined,
            });
        });
        return col;
    }
    populateColumnBlocks(col, columnsContainer, date, allDates, items, settings, hourHeight) {
        const timed = items.filter((it) => !it.allDay);
        const layoutInput = timed.map((it) => {
            const startMin = it.kind === "event" ? (0, dateUtils_1.timeToMinutes)(it.start) : (0, dateUtils_1.timeToMinutes)(it.time ?? { hour: 0, minute: 0 });
            // Tasks get a nominal 30-minute footprint purely so they don't visually
            // collide with nearby events in the column layout — they still render
            // at a fixed, minimal height (see renderBlock).
            const endMin = it.kind === "event" ? (0, dateUtils_1.timeToMinutes)(it.end) : startMin + 30;
            return { id: it.id, startMin, endMin: Math.min(1440, Math.max(endMin, startMin + 1)) };
        });
        const laidOut = (0, overlapLayout_1.layoutOverlaps)(layoutInput);
        laidOut.forEach((box) => {
            const item = timed.find((it) => it.id === box.id);
            if (item)
                this.renderBlock(col, columnsContainer, date, item, box, settings, hourHeight, allDates);
        });
    }
    renderBlock(col, columnsContainer, date, item, box, settings, hourHeight, allDates) {
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
        el.style.setProperty("--dc-item-color", (0, colorRules_1.resolveColor)(item.tags, settings.colorRules, (0, shared_1.defaultColorFor)(item, settings)));
        const body = el.createDiv({ cls: "dc-block-body" });
        let suppressNextClick = false;
        let clearClickSuppression = null;
        let captureSuppressedClick = null;
        if (isTask) {
            const check = body.createDiv({ cls: "dc-pill-check" + (item.completed ? " is-checked" : "") });
            check.addEventListener("mousedown", (e) => e.stopPropagation());
            check.addEventListener("click", (e) => {
                e.stopPropagation();
                void this.host.toggleTask(item);
            });
            this.renderTaskContent(body, item, settings);
        }
        else {
            this.renderEventContent(el, body, item, settings);
        }
        body.addEventListener("click", (e) => {
            if (suppressNextClick) {
                suppressNextClick = false;
                if (clearClickSuppression !== null)
                    window.clearTimeout(clearClickSuppression);
                clearClickSuppression = null;
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            e.stopPropagation();
            const linkTarget = (0, parser_1.firstWikilinkTarget)(item.title);
            if ((e.metaKey || e.ctrlKey) && linkTarget) {
                void this.host.openLinkedNote(linkTarget);
                return;
            }
            if (item.kind === "event")
                this.host.openEventEdit(item);
            else
                this.host.openTaskEdit(item);
        });
        body.addEventListener("mousedown", (e) => {
            if (e.button !== 0)
                return;
            e.stopPropagation();
            this.startMoveDrag(e, item, el, columnsContainer, allDates, settings, hourHeight, () => {
                suppressNextClick = true;
                if (clearClickSuppression !== null)
                    window.clearTimeout(clearClickSuppression);
                if (captureSuppressedClick)
                    window.removeEventListener("click", captureSuppressedClick, true);
                captureSuppressedClick = (clickEvent) => {
                    clickEvent.preventDefault();
                    clickEvent.stopPropagation();
                    clickEvent.stopImmediatePropagation();
                    suppressNextClick = false;
                    if (clearClickSuppression !== null)
                        window.clearTimeout(clearClickSuppression);
                    clearClickSuppression = null;
                    window.removeEventListener("click", captureSuppressedClick, true);
                    captureSuppressedClick = null;
                };
                window.addEventListener("click", captureSuppressedClick, true);
                clearClickSuppression = window.setTimeout(() => {
                    if (captureSuppressedClick)
                        window.removeEventListener("click", captureSuppressedClick, true);
                    captureSuppressedClick = null;
                    suppressNextClick = false;
                    clearClickSuppression = null;
                }, 500);
            });
        });
        // The whole block (handles included) shares one right-click menu.
        el.addEventListener("contextmenu", (e) => {
            const minutes = this.minutesAtY(col, e.clientY, hourHeight, 1440 - SNAP_MINUTES);
            (0, shared_1.showItemContextMenu)(e, {
                onNewEvent: () => this.startClickDefineRange(col, date, minutes, settings, hourHeight),
                onEdit: () => (item.kind === "event" ? this.host.openEventEdit(item) : this.host.openTaskEdit(item)),
                onDuplicate: () => (0, shared_1.duplicateItem)(this.host, item),
                onCopy: () => this.host.copyItemToClipboard(item),
                onPaste: this.host.peekClipboard()
                    ? () => void this.host.pasteClipboardAt(date, (0, dateUtils_1.minutesToTime)(minutes))
                    : undefined,
                onDelete: () => (0, shared_1.handleCalendarAction)("delete that item", this.host.store.deleteItem(item)),
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
    renderEventContent(blockEl, body, item, settings) {
        const displayText = (0, parser_1.stripTags)((0, parser_1.displayTitle)(item.title));
        const fullDisplayTitle = (0, parser_1.displayTitle)(item.title);
        const bodyStyle = getComputedStyle(body);
        const availableHeightPx = body.clientHeight - parseFloat(bodyStyle.paddingTop || "0") - parseFloat(bodyStyle.paddingBottom || "0");
        const rowGap = parseFloat(bodyStyle.rowGap || bodyStyle.gap || "0") || 0;
        const outerHeight = (element) => {
            const style = getComputedStyle(element);
            return element.getBoundingClientRect().height + parseFloat(style.marginTop || "0") + parseFloat(style.marginBottom || "0");
        };
        const createTitle = (className = "dc-block-label dc-clamp") => {
            const label = body.createSpan({ cls: className });
            label.setText(displayText);
            if ((0, parser_1.firstWikilinkTarget)(item.title))
                label.addClass("dc-linked");
            label.style.flexShrink = "0";
            return label;
        };
        const lineHeightOf = (label) => parseFloat(getComputedStyle(label).lineHeight) || 14;
        const naturalLineCount = (label) => Math.max(1, Math.round(label.scrollHeight / lineHeightOf(label)));
        const clampTitle = (label, maxLines) => {
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
            }
            else {
                label.remove();
                tagLine.remove();
                // Very slim blocks may not have the vertical room for a second row.
                // In that case use one row with title-first tag truncation rather than
                // dropping the tag entirely.
                const inlineRow = body.createDiv({ cls: "dc-block-inline-row" });
                const inlineLabel = inlineRow.createSpan({ cls: "dc-block-label dc-inline-event-label" });
                inlineLabel.setText(displayText);
                if ((0, parser_1.firstWikilinkTarget)(item.title))
                    inlineLabel.addClass("dc-linked");
                const overrideColor = settings.colorTagsUsingRules
                    ? (0, colorRules_1.resolveColor)(item.tags, settings.colorRules, (0, shared_1.defaultColorFor)(item, settings))
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
                const inlineTags = Array.from(inlineRow.querySelectorAll(".dc-inline-event-tag"));
                const allInlineTextFits = (0, shared_1.fitTitleAndTagBadges)(inlineRow, inlineLabel, inlineTags);
                if (inlineRow.clientWidth > 0 && inlineTags.some((tag) => tag.getBoundingClientRect().width > 0)) {
                    // A compacted tag/title still counts as visible, but the popover must
                    // remain available whenever any tag text was omitted.
                    tagsVisible = allInlineTextFits;
                    usedHeightPx = outerHeight(inlineRow);
                }
                else {
                    inlineRow.remove();
                    const wrappedTitle = createTitle();
                    const lineHeightPx = lineHeightOf(wrappedTitle);
                    const maxLines = Math.max(1, Math.floor(availableHeightPx / lineHeightPx));
                    titleTruncated = clampTitle(wrappedTitle, maxLines);
                    usedHeightPx = outerHeight(wrappedTitle);
                }
            }
        }
        else {
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
                text: `${(0, dateUtils_1.formatTimeOfDay)(item.start, settings.timeFormat)} – ${(0, dateUtils_1.formatTimeOfDay)(item.end, settings.timeFormat)}`,
            });
            timeEl.style.flexShrink = "0";
            if (usedHeightPx + rowGap + outerHeight(timeEl) <= availableHeightPx + 0.5) {
                usedHeightPx += rowGap + outerHeight(timeEl);
            }
            else {
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
    renderTaskContent(body, item, settings) {
        const label = body.createSpan({ cls: "dc-block-label" });
        const displayText = (0, parser_1.stripTags)((0, parser_1.displayTitle)(item.title));
        label.setText(displayText);
        if ((0, parser_1.firstWikilinkTarget)(item.title))
            label.addClass("dc-linked");
        if (item.kind === "task" && item.completed)
            label.addClass("dc-completed");
        label.style.flex = item.tags.length > 0 ? "0 1 auto" : "1 1 auto";
        label.style.maxWidth = "none";
        if (item.tags.length > 0)
            (0, shared_1.renderTaskTagHints)(body, label, item, settings);
        // Full tag names are preferred if they all fit immediately after the title;
        // otherwise the shared helper substitutes one # marker. Hover remains one
        // block-level popover containing the complete title and all tag names.
        const fullDisplayTitle = (0, parser_1.displayTitle)(item.title);
        if (item.tags.length > 0) {
            this.attachHoverPopover(body, fullDisplayTitle);
        }
        else if (label.scrollWidth > label.clientWidth + 1) {
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
    renderFittedTagLine(container, item, settings) {
        const maxWidth = container.clientWidth;
        if (maxWidth <= 0)
            return false;
        const overrideColor = settings.colorTagsUsingRules
            ? (0, colorRules_1.resolveColor)(item.tags, settings.colorRules, (0, shared_1.defaultColorFor)(item, settings))
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
                const previousBadges = Array.from(container.children).filter((child) => child !== badge);
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
                }
                else {
                    badge.remove();
                }
                break;
            }
        }
        return container.childElementCount > 0;
    }
    /** A small popover with the full, untruncated text — shown after a short hover delay, matching the drag tooltip's visual language. */
    attachHoverPopover(el, text) {
        let popover = null;
        let timer = null;
        let observer = null;
        let hovered = false;
        const clearTimer = () => {
            if (timer !== null)
                window.clearTimeout(timer);
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
                if (!hovered || !el.isConnected)
                    return;
                popover = document.body.createDiv({ cls: "dc-hover-popover", text });
                const rect = el.getBoundingClientRect();
                popover.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - 272))}px`;
                const height = popover.getBoundingClientRect().height;
                const below = rect.bottom + 6;
                popover.style.top = `${below + height <= window.innerHeight - 4 ? below : Math.max(4, rect.top - height - 6)}px`;
                // If rendering replaces the hovered block, mouseleave won't fire on
                // the detached element; remove its floating popover on disconnection.
                observer = new MutationObserver(() => {
                    if (!el.isConnected)
                        hide();
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
    showDayMenu(e, date) {
        (0, shared_1.showEmptyContextMenu)(e, {
            onNewEvent: () => this.host.openEventCreate(date, { allDay: true }),
            onPaste: this.host.peekClipboard() ? () => void this.host.pasteClipboardAt(date) : undefined,
        });
    }
    showAllDayItemMenu(e, item, date) {
        (0, shared_1.showItemContextMenu)(e, {
            onNewEvent: () => this.host.openEventCreate(date, { allDay: true }),
            onEdit: () => (item.kind === "event" ? this.host.openEventEdit(item) : this.host.openTaskEdit(item)),
            onDuplicate: () => (0, shared_1.duplicateItem)(this.host, item),
            onCopy: () => this.host.copyItemToClipboard(item),
            onPaste: this.host.peekClipboard() ? () => void this.host.pasteClipboardAt(date) : undefined,
            onDelete: () => (0, shared_1.handleCalendarAction)("delete that item", this.host.store.deleteItem(item)),
        });
    }
    // ------------------------------------------------------------- interactions
    /** Snapped minute-of-day under a screen Y position within a day column. */
    minutesAtY(col, clientY, hourHeight, max = 1440) {
        const rect = col.getBoundingClientRect();
        const raw = (0, dateUtils_1.snapMinutes)(((clientY - rect.top) / hourHeight) * 60, SNAP_MINUTES);
        return Math.max(0, Math.min(max, raw));
    }
    createTooltip() {
        return document.body.createDiv({ cls: "dc-drag-tooltip" });
    }
    positionTooltip(tooltip, ev, text) {
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
    startClickDefineRange(col, date, anchorMin, settings, hourHeight) {
        let currentMin = anchorMin;
        const preview = col.createDiv({ cls: "dc-block dc-create-preview" });
        const tooltip = this.createTooltip();
        const orderedRange = () => {
            let start = Math.min(anchorMin, currentMin);
            let end = Math.max(anchorMin, currentMin);
            if (end === start)
                end = Math.min(1440, start + settings.defaultEventDurationMinutes);
            else if (end - start < settings.minEventDurationMinutes)
                end = Math.min(1440, start + settings.minEventDurationMinutes);
            if (end <= start)
                start = Math.max(0, end - settings.minEventDurationMinutes);
            return { start, end };
        };
        const describe = (r) => `${(0, dateUtils_1.formatTimeOfDay)((0, dateUtils_1.minutesToTime)(r.start), settings.timeFormat)} – ${(0, dateUtils_1.formatTimeOfDay)((0, dateUtils_1.minutesToTime)(r.end), settings.timeFormat)}`;
        const paint = (ev) => {
            const r = orderedRange();
            preview.style.top = `${(r.start / 60) * hourHeight}px`;
            preview.style.height = `${Math.max(((r.end - r.start) / 60) * hourHeight, MIN_BLOCK_HEIGHT_PX)}px`;
            preview.style.left = "1px";
            preview.style.width = "calc(100% - 2px)";
            if (ev)
                this.positionTooltip(tooltip, ev, describe(r));
            else
                tooltip.setText(describe(r));
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
        const onMove = (ev) => {
            tooltip.style.display = "";
            currentMin = this.minutesAtY(col, ev.clientY, hourHeight);
            paint(ev);
        };
        const onDown = (ev) => {
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
            const swallowClick = (c) => {
                c.preventDefault();
                c.stopPropagation();
                document.removeEventListener("click", swallowClick, true);
            };
            document.addEventListener("click", swallowClick, true);
            window.setTimeout(() => document.removeEventListener("click", swallowClick, true), 400);
            this.host.openEventCreate(date, { start: (0, dateUtils_1.minutesToTime)(r.start), end: (0, dateUtils_1.minutesToTime)(r.end), allDay: false });
        };
        const onKey = (ev) => {
            if (ev.key !== "Escape")
                return;
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
    startCreateDrag(e, col, date, settings, hourHeight) {
        const rect = col.getBoundingClientRect();
        const anchorMin = (0, dateUtils_1.snapMinutes)(((e.clientY - rect.top) / hourHeight) * 60, SNAP_MINUTES);
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
        const describe = () => `${(0, dateUtils_1.formatTimeOfDay)((0, dateUtils_1.minutesToTime)(pendingStart), settings.timeFormat)} – ${(0, dateUtils_1.formatTimeOfDay)((0, dateUtils_1.minutesToTime)(pendingEnd), settings.timeFormat)}`;
        this.positionTooltip(tooltip, e, describe());
        const onMove = (ev) => {
            const min = (0, dateUtils_1.snapMinutes)(((ev.clientY - rect.top) / hourHeight) * 60, SNAP_MINUTES);
            const newStart = Math.max(0, Math.min(anchorMin, min));
            const newEnd = Math.min(1440, Math.max(anchorMin, Math.max(min, newStart + settings.minEventDurationMinutes)));
            if (newStart !== pendingStart || newEnd !== pendingEnd)
                moved = true;
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
            if (!moved)
                pendingEnd = Math.min(1440, pendingStart + settings.defaultEventDurationMinutes);
            this.host.openEventCreate(date, {
                start: (0, dateUtils_1.minutesToTime)(pendingStart),
                end: (0, dateUtils_1.minutesToTime)(pendingEnd),
                allDay: false,
            });
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        this.registerInteractionCleanup(cleanup);
    }
    startMoveDrag(e, item, el, columnsContainer, allDates, settings, hourHeight, onDragStarted) {
        const startMin = item.kind === "event" ? (0, dateUtils_1.timeToMinutes)(item.start) : (0, dateUtils_1.timeToMinutes)(item.time ?? { hour: 0, minute: 0 });
        const durationMin = item.kind === "event" ? (0, dateUtils_1.timeToMinutes)(item.end) - (0, dateUtils_1.timeToMinutes)(item.start) : 0;
        const originColIndex = Math.max(0, allDates.findIndex((d) => (0, dateUtils_1.dateKey)(d) === item.date));
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
        let overlay = null;
        let tooltip = null;
        // Use a pointer-following clone rather than reparenting the live block.
        // Reparenting changed the containing block and overlap-column geometry,
        // making an item visibly jump away from the pointer at drag start.
        const beginDragVisuals = () => {
            dragConfirmed = true;
            onDragStarted();
            overlay = el.cloneNode(true);
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
        const onMove = (ev) => {
            const dx = ev.clientX - startClientX;
            const dy = ev.clientY - startClientY;
            const deltaMin = (0, dateUtils_1.snapMinutes)((dy / hourHeight) * 60, SNAP_MINUTES);
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
            if (!dragConfirmed && newStart === startMin && newCol === originColIndex)
                return;
            if (!dragConfirmed)
                beginDragVisuals();
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
                this.positionTooltip(tooltip, ev, `${allDates[pendingCol].format("ddd D")} · ${(0, dateUtils_1.formatTimeOfDay)((0, dateUtils_1.minutesToTime)(pendingStart), settings.timeFormat)}`);
            }
        };
        const removeVisuals = () => {
            el.style.visibility = previousVisibility;
            overlay?.remove();
            tooltip?.remove();
            if (this.pendingMoveVisualCleanup === removeVisuals)
                this.pendingMoveVisualCleanup = null;
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
            const operation = (0, shared_1.moveItemDateTime)(this.host.store, item, allDates[pendingCol], pendingStart, durationMin);
            // The store emits its final refresh from runMutation's finally block,
            // including on failure after rollback. Keep the proxy until that render
            // completes; cleaning up directly in catch briefly reveals the stale
            // source node before the rollback refresh replaces it.
            (0, shared_1.handleCalendarAction)("move that item", operation);
        };
        document.addEventListener("mousemove", onMove, true);
        document.addEventListener("mouseup", onUp, true);
        this.registerInteractionCleanup(cleanup);
    }
    startResizeDrag(e, item, el, edge, settings, hourHeight) {
        const startMin = (0, dateUtils_1.timeToMinutes)(item.start);
        const endMin = (0, dateUtils_1.timeToMinutes)(item.end);
        const minDuration = Math.max(SNAP_MINUTES, settings.minEventDurationMinutes);
        const startClientY = e.clientY;
        let pendingStart = startMin;
        let pendingEnd = endMin;
        el.addClass("dc-dragging");
        const tooltip = this.createTooltip();
        const onMove = (ev) => {
            const deltaMin = (0, dateUtils_1.snapMinutes)(((ev.clientY - startClientY) / hourHeight) * 60, SNAP_MINUTES);
            if (edge === "top") {
                pendingStart = Math.max(0, Math.min(endMin - minDuration, startMin + deltaMin));
                el.style.top = `${(pendingStart / 60) * hourHeight}px`;
            }
            else {
                pendingEnd = Math.max(startMin + minDuration, Math.min(1440, endMin + deltaMin));
            }
            el.style.height = `${eventBlockHeight(pendingStart, pendingEnd, hourHeight)}px`;
            this.positionTooltip(tooltip, ev, `${(0, dateUtils_1.formatTimeOfDay)((0, dateUtils_1.minutesToTime)(pendingStart), settings.timeFormat)} – ${(0, dateUtils_1.formatTimeOfDay)((0, dateUtils_1.minutesToTime)(pendingEnd), settings.timeFormat)}`);
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
                (0, shared_1.handleCalendarAction)("resize that event", this.host.store.updateEvent(item, { start: (0, dateUtils_1.minutesToTime)(pendingStart), end: (0, dateUtils_1.minutesToTime)(pendingEnd) }));
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
    updateNowLine(columns, gutter, dates, allDates, hourHeight) {
        columns.querySelectorAll(".dc-now-line").forEach((el) => el.remove());
        gutter.querySelectorAll(".dc-now-label").forEach((el) => el.remove());
        gutter.querySelectorAll(".dc-hour-hidden").forEach((el) => el.removeClass("dc-hour-hidden"));
        const now = (0, obsidian_1.moment)();
        const nowMin = now.hour() * 60 + now.minute();
        const nowTop = (nowMin / 60) * hourHeight;
        // The current-time line is meaningful only when the displayed period
        // contains today. `dates` can omit hidden weekend columns, so use the
        // full period to decide whether this is the current day/week.
        if (!allDates.some((date) => (0, dateUtils_1.isSameDay)(date, now)))
            return;
        const todayIndex = dates.findIndex((d) => (0, dateUtils_1.isSameDay)(d, now));
        Array.from(columns.children).forEach((child, i) => {
            const col = child;
            const line = col.createDiv({ cls: "dc-now-line" + (i === todayIndex ? " dc-now-line-today" : "") });
            line.style.top = `${nowTop}px`;
        });
        if (todayIndex === -1)
            return;
        const timeFormat = this.host.getSettings().timeFormat;
        // Always a real clock time here ("9:41"), never the "Midday"/"Midnight" wording.
        const text = timeFormat === "24h"
            ? now.format("HH:mm")
            : now.format("h:mm");
        const label = gutter.createDiv({ cls: "dc-now-label", text });
        label.style.top = `${nowTop}px`;
        gutter.querySelectorAll(".dc-timeline-hour-label").forEach((hourLabel) => {
            if (Math.abs(parseFloat(hourLabel.style.top) - nowTop) < NOW_LABEL_CLEARANCE_PX) {
                hourLabel.addClass("dc-hour-hidden");
            }
        });
    }
}
exports.TimelineBaseView = TimelineBaseView;
class WeekView extends TimelineBaseView {
    constructor(host) {
        super(host, (anchor) => (0, dateUtils_1.getWeekDates)(anchor, host.getSettings().firstDayOfWeek));
    }
}
exports.WeekView = WeekView;
class DayView extends TimelineBaseView {
    constructor(host) {
        super(host, (anchor) => [anchor.clone()]);
    }
}
exports.DayView = DayView;

},
"src/views/yearView.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.YearView = void 0;
const dateUtils_1 = require("../dateUtils");
const colorRules_1 = require("../colorRules");
const shared_1 = require("./shared");
class YearView {
    constructor(host) {
        this.host = host;
    }
    async render(container, anchor) {
        const settings = this.host.getSettings();
        container.empty();
        const root = container.createDiv({ cls: "dc-year" });
        const yearStart = anchor.clone().startOf("year");
        const yearEnd = anchor.clone().endOf("year");
        const gridStart = (0, dateUtils_1.getMonthGridWeeks)(yearStart, settings.firstDayOfWeek)[0][0];
        const lastMonthWeeks = (0, dateUtils_1.getMonthGridWeeks)(yearEnd, settings.firstDayOfWeek);
        const gridEnd = lastMonthWeeks[lastMonthWeeks.length - 1][6];
        const itemsByDate = await this.host.store.getItemsForRange(gridStart, gridEnd);
        const grid = root.createDiv({ cls: "dc-year-grid" });
        for (let m = 0; m < 12; m++) {
            const monthAnchor = anchor.clone().month(m).startOf("month");
            this.renderMiniMonth(grid, monthAnchor, itemsByDate, settings);
        }
    }
    renderMiniMonth(container, monthAnchor, itemsByDate, settings) {
        const box = container.createDiv({ cls: "dc-year-month" });
        const heading = box.createDiv({ cls: "dc-year-month-title", text: monthAnchor.format("MMMM") });
        heading.addEventListener("click", () => this.host.goTo(monthAnchor, "month"));
        const weeks = (0, dateUtils_1.getMonthGridWeeks)(monthAnchor, settings.firstDayOfWeek);
        const dayNames = (0, dateUtils_1.orderedWeekdayShortNames)(settings.firstDayOfWeek);
        // Only this month's own days count toward the "weekend has an item" override —
        // the greyed-out overflow days from neighbouring months aren't shown here.
        const monthDates = weeks.flat().filter((d) => d.month() === monthAnchor.month());
        const hideWeekend = (0, shared_1.shouldHideWeekends)(settings.showWeekendsYear, monthDates, itemsByDate);
        const headerRow = box.createDiv({ cls: "dc-year-headerrow" });
        dayNames.forEach((name, i) => {
            const dow = (settings.firstDayOfWeek + i) % 7;
            if (hideWeekend && (dow === 0 || dow === 6))
                return;
            headerRow.createSpan({ cls: "dc-year-headercell", text: name });
        });
        weeks.forEach((week) => {
            const row = box.createDiv({ cls: "dc-year-row" });
            week.forEach((date) => {
                var _a;
                const dow = date.day();
                if (hideWeekend && (dow === 0 || dow === 6))
                    return;
                const inMonth = date.month() === monthAnchor.month();
                const cell = row.createDiv({ cls: "dc-year-cell" });
                if (!inMonth)
                    cell.addClass("dc-outside-month");
                if ((0, dateUtils_1.isToday)(date))
                    cell.addClass("dc-is-today");
                cell.createDiv({ cls: "dc-year-daynum", text: String(date.date()) });
                const items = (_a = itemsByDate.get((0, dateUtils_1.dateKey)(date))) !== null && _a !== void 0 ? _a : [];
                if (items.length > 0 && inMonth) {
                    const dots = cell.createDiv({ cls: "dc-year-dots" });
                    const colors = Array.from(new Set(items.map((it) => (0, colorRules_1.resolveColor)(it.tags, settings.colorRules, (0, shared_1.defaultColorFor)(it, settings)))));
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
exports.YearView = YearView;

},
"src/writer.js": function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatEventLine = formatEventLine;
exports.formatTaskLine = formatTaskLine;
exports.formatItemLine = formatItemLine;
exports.sortEvents = sortEvents;
exports.sortTasks = sortTasks;
exports.sortMixedSection = sortMixedSection;
exports.buildSectionBodyLines = buildSectionBodyLines;
exports.replaceSectionBody = replaceSectionBody;
exports.linesToContent = linesToContent;
exports.contentToLines = contentToLines;
const dateUtils_1 = require("./dateUtils");
const parser_1 = require("./parser");
// Markdown always uses zero-padded 24h time, independent of the user's
// display "time format" setting — that setting only affects the calendar UI.
function fileTime(t) {
    return (0, dateUtils_1.formatTimeOfDay)(t, "24h");
}
function formatEventLine(item, workingHoursStart, workingHoursEnd) {
    const start = item.allDay ? workingHoursStart : item.start;
    const end = item.allDay ? workingHoursEnd : item.end;
    return `- ${fileTime(start)} - ${fileTime(end)} ${item.title}`.trimEnd();
}
function formatTaskLine(item) {
    const box = item.completed ? "x" : " ";
    if (item.allDay || !item.time) {
        return `- [${box}] ${item.title}`.trimEnd();
    }
    return `- [${box}] ${fileTime(item.time)} ${item.title}`.trimEnd();
}
function formatItemLine(item, workingHoursStart, workingHoursEnd) {
    return item.kind === "event"
        ? formatEventLine(item, workingHoursStart, workingHoursEnd)
        : formatTaskLine(item);
}
/** Earliest start first; equal starts break by earliest end; true ties keep original order. */
function sortEvents(events) {
    return [...events].sort((a, b) => {
        const byStart = (0, dateUtils_1.timeToMinutes)(a.start) - (0, dateUtils_1.timeToMinutes)(b.start);
        if (byStart !== 0)
            return byStart;
        return (0, dateUtils_1.timeToMinutes)(a.end) - (0, dateUtils_1.timeToMinutes)(b.end);
    });
}
/** All-day tasks first (stable), then timed tasks by start time (stable ties). */
function sortTasks(tasks) {
    const allDay = tasks.filter((t) => t.allDay);
    const timed = tasks
        .filter((t) => !t.allDay)
        .sort((a, b) => { var _a, _b; return (0, dateUtils_1.timeToMinutes)((_a = a.time) !== null && _a !== void 0 ? _a : { hour: 0, minute: 0 }) - (0, dateUtils_1.timeToMinutes)((_b = b.time) !== null && _b !== void 0 ? _b : { hour: 0, minute: 0 }); });
    return [...allDay, ...timed];
}
/**
 * Ordering for a unified Events+Tasks section (separateTaskSection = false).
 * The spec only defines ordering for events and tasks independently; this
 * extends the same "all-day first, then chronological" idea across both.
 */
function sortMixedSection(items) {
    const timeOf = (it) => { var _a; return it.kind === "event" ? (0, dateUtils_1.timeToMinutes)(it.start) : (0, dateUtils_1.timeToMinutes)((_a = it.time) !== null && _a !== void 0 ? _a : { hour: 0, minute: 0 }); };
    const allDay = items.filter((it) => it.allDay);
    const timed = items.filter((it) => !it.allDay).sort((a, b) => timeOf(a) - timeOf(b));
    return [...allDay, ...timed];
}
/** Interleaves a blank line between items when spacing is "spacious", and
 * always leaves one blank line between the section's heading and its first
 * line, regardless of that setting. */
function buildSectionBodyLines(formattedItemLines, foreignLines, spacing) {
    const lines = [];
    formattedItemLines.forEach((line, idx) => {
        if (idx > 0 && spacing === "spacious")
            lines.push("");
        lines.push(line);
    });
    if (foreignLines.length > 0) {
        if (formattedItemLines.length > 0)
            lines.push("");
        lines.push(...foreignLines);
    }
    if (lines.length > 0)
        lines.unshift("");
    return lines;
}
/**
 * Replaces (or appends) a managed section's body in-place, leaving every
 * other line in the file byte-for-byte untouched.
 */
function replaceSectionBody(fileLines, headingText, newBodyLines) {
    const range = (0, parser_1.findSection)(fileLines, headingText);
    if (range) {
        const before = fileLines.slice(0, range.bodyStart);
        const after = fileLines.slice(range.bodyEnd);
        return [...before, ...newBodyLines, ...after];
    }
    // Section doesn't exist yet: append it at end of file.
    const result = [...fileLines];
    while (result.length > 0 && result[result.length - 1].trim() === "")
        result.pop();
    if (result.length > 0)
        result.push("");
    result.push(headingText);
    result.push(...newBodyLines);
    return result;
}
function linesToContent(lines) {
    return lines.join("\n");
}
function contentToLines(content) {
    return content.split(/\r\n|\r|\n/);
}

}
};
const __cache = Object.create(null);
function __resolve(from, request) {
  if (!request.startsWith('.')) return request;
  const base = pathPosix.normalize(pathPosix.join(pathPosix.dirname(from), request));
  return base.endsWith('.js') ? base : base + '.js';
}
const pathPosix = {
  dirname: (p) => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); },
  join: (...parts) => parts.filter(Boolean).join('/'),
  normalize: (p) => { const out = []; for (const part of p.split('/')) { if (!part || part === '.') continue; if (part === '..') out.pop(); else out.push(part); } return out.join('/'); }
};
function __load(id) {
  if (!Object.prototype.hasOwnProperty.call(__modules, id)) return __nativeRequire(id);
  if (__cache[id]) return __cache[id].exports;
  const module = { exports: {} }; __cache[id] = module;
  const localRequire = (request) => __load(__resolve(id, request));
  __modules[id](module, module.exports, localRequire);
  return module.exports;
}
module.exports = __load('src/main.js');
