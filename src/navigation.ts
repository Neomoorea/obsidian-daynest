import { App, TFile, normalizePath } from "obsidian";
import { OpenMode } from "./types";

export async function openFileInMode(app: App, file: TFile, mode: OpenMode): Promise<void> {
	const leaf =
		mode === "current"
			? app.workspace.getLeaf(false)
			: mode === "new"
			? app.workspace.getLeaf("tab")
			: app.workspace.getLeaf("split", "vertical");
	await leaf.openFile(file);
	app.workspace.setActiveLeaf(leaf, { focus: true });
}

function sanitizeFilename(name: string): string {
	return name.replace(/[\\/:*?"<>|#^[\]]/g, "").trim();
}

/** Finds a note by title anywhere in the vault (first match by basename). */
export function findNoteByTitle(app: App, title: string): TFile | null {
	const target = title.trim().toLowerCase();
	const match = app.vault.getMarkdownFiles().find((f) => f.basename.toLowerCase() === target);
	return match ?? null;
}

/** Finds a note by title, creating an empty one at the vault root if none exists yet. */
export async function findOrCreateNoteByTitle(app: App, title: string): Promise<TFile> {
	const existing = findNoteByTitle(app, title);
	if (existing) return existing;

	const filename = sanitizeFilename(title) || "Untitled";
	let path = normalizePath(`${filename}.md`);
	let suffix = 2;
	while (app.vault.getAbstractFileByPath(path)) {
		path = normalizePath(`${filename} ${suffix}.md`);
		suffix++;
	}
	return app.vault.create(path, "");
}
