/** Shared hashtag helpers for Markdown parsing and event editing. */
const TAG_PATTERN = /#([^\s#\[\]()]+)/g;

/** Extract tags in first-seen order, normalized to lower case and without '#'. */
export function extractTagsFromTitle(title: string): string[] {
	const tags: string[] = [];
	const seen = new Set<string>();
	const pattern = new RegExp(TAG_PATTERN.source, "g");
	let match: RegExpExecArray | null;
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
export function stripTags(title: string): string {
	return title.replace(new RegExp(TAG_PATTERN.source, "g"), "").replace(/\s{2,}/g, " ").trim();
}

/** Parse a Tags field separated by commas, whitespace, or hashtag markers. */
export function parseTagList(raw: string): string[] {
	const tags: string[] = [];
	const seen = new Set<string>();
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
export function withTags(title: string, tags: string[]): string {
	const base = stripTags(title);
	const normalized = parseTagList(tags.join(", "));
	return [base, ...normalized.map((tag) => `#${tag}`)].filter(Boolean).join(" ").trim();
}
