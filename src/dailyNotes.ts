import { App, TFile, TFolder, normalizePath, moment } from "obsidian";
import type { Moment } from "moment";

export interface DailyNoteConfig {
	folder: string;
	format: string;
	template: string;
}

const FALLBACK_CONFIG: DailyNoteConfig = { folder: "", format: "YYYY-MM-DD", template: "" };

function readCoreDailyNotesConfig(app: App): DailyNoteConfig | null {
	try {
		// Unofficial but long-stable internal API — the same one used by most
		// community plugins (including obsidian-daily-notes-interface) to read
		// core Daily Notes settings.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const internalPlugins = (app as any).internalPlugins;
		const plugin = internalPlugins?.getPluginById?.("daily-notes");
		if (!plugin?.enabled) return null;
		const options = plugin.instance?.options ?? {};
		return {
			folder: (options.folder ?? "").trim().replace(/\/+$/, ""),
			format: (options.format ?? "").trim() || "YYYY-MM-DD",
			template: (options.template ?? "").trim(),
		};
	} catch (e) {
		return null;
	}
}

/** Fallback for vaults that use the community "Periodic Notes" plugin instead of core Daily Notes. */
function readPeriodicNotesConfig(app: App): DailyNoteConfig | null {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const plugin = (app as any).plugins?.getPlugin?.("periodic-notes");
		const daily = plugin?.settings?.daily;
		if (!daily?.enabled) return null;
		return {
			folder: (daily.folder ?? "").trim().replace(/\/+$/, ""),
			format: (daily.format ?? "").trim() || "YYYY-MM-DD",
			template: (daily.template ?? "").trim(),
		};
	} catch (e) {
		return null;
	}
}

export function getDailyNoteConfig(app: App): DailyNoteConfig {
	return readCoreDailyNotesConfig(app) ?? readPeriodicNotesConfig(app) ?? FALLBACK_CONFIG;
}

export function isDailyNotesAvailable(app: App): boolean {
	return readCoreDailyNotesConfig(app) !== null || readPeriodicNotesConfig(app) !== null;
}

export function getPathForDate(app: App, date: Moment, config?: DailyNoteConfig): string {
	const cfg = config ?? getDailyNoteConfig(app);
	const filename = date.format(cfg.format) + ".md";
	const path = cfg.folder ? `${cfg.folder}/${filename}` : filename;
	return normalizePath(path);
}

export function getDateFromFile(app: App, file: TFile, config?: DailyNoteConfig): Moment | null {
	const cfg = config ?? getDailyNoteConfig(app);
	const m = moment(file.basename, cfg.format, true);
	return m.isValid() ? m.startOf("day") : null;
}

export function findDailyNote(app: App, date: Moment, config?: DailyNoteConfig): TFile | null {
	const file = app.vault.getAbstractFileByPath(getPathForDate(app, date, config));
	return file instanceof TFile ? file : null;
}

async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
	if (!folderPath || folderPath === "/") return;
	const existing = app.vault.getAbstractFileByPath(folderPath);
	if (existing instanceof TFolder) return;
	try {
		await app.vault.createFolder(folderPath);
	} catch (e) {
		/* likely already exists due to a race between two near-simultaneous creations */
	}
}

function applyTemplateVariables(templateContent: string, date: Moment): string {
	let result = templateContent;
	result = result.replace(/\{\{\s*date\s*:\s*([^}]+)\}\}/gi, (_m, fmt) => date.format(String(fmt).trim()));
	result = result.replace(/\{\{\s*time\s*:\s*([^}]+)\}\}/gi, (_m, fmt) => moment().format(String(fmt).trim()));
	result = result.replace(/\{\{\s*date\s*\}\}/gi, date.format("YYYY-MM-DD"));
	result = result.replace(/\{\{\s*time\s*\}\}/gi, moment().format("HH:mm"));
	result = result.replace(/\{\{\s*title\s*\}\}/gi, date.format("YYYY-MM-DD"));
	return result;
}

async function readTemplateContent(app: App, templatePath: string): Promise<string> {
	if (!templatePath) return "";
	const path = templatePath.toLowerCase().endsWith(".md") ? templatePath : `${templatePath}.md`;
	const file = app.vault.getAbstractFileByPath(normalizePath(path));
	return file instanceof TFile ? await app.vault.read(file) : "";
}

/**
 * Finds the Daily Note for `date`, creating it from the configured template
 * if it doesn't exist yet. This is what lets the calendar guarantee a place
 * to write an event/task even for a date with no note yet (spec §26).
 */
export async function ensureDailyNote(app: App, date: Moment): Promise<TFile> {
	const config = getDailyNoteConfig(app);
	const path = getPathForDate(app, date, config);
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing instanceof TFile) return existing;

	const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
	await ensureFolderExists(app, folder);

	const templateRaw = await readTemplateContent(app, config.template);
	const content = templateRaw ? applyTemplateVariables(templateRaw, date) : "";

	try {
		return await app.vault.create(path, content);
	} catch (e) {
		// Another write may have created it a moment ago — recover instead of failing.
		const retried = app.vault.getAbstractFileByPath(path);
		if (retried instanceof TFile) return retried;
		throw e;
	}
}
