import { ColorRule } from "./types";

/**
 * Resolves the display colour for a set of tags against the user's ordered
 * colour rules. A rule matches only if ALL of its tags are present on the
 * item. Among matching rules, the one requiring the MOST tags wins (a
 * combination rule beats a single-tag rule); ties break by the rule's
 * position in the user's list (earlier = higher priority).
 */
export function resolveColor(tags: string[], rules: ColorRule[], defaultColor: string): string {
	const tagSet = new Set(tags.map((t) => t.toLowerCase()));
	let best: ColorRule | null = null;

	for (const rule of rules) {
		if (rule.tags.length === 0) continue;
		const allMatch = rule.tags.every((t) => tagSet.has(t.toLowerCase()));
		if (!allMatch) continue;
		if (!best || rule.tags.length > best.tags.length) {
			best = rule;
		}
	}

	return best ? best.color : defaultColor;
}

export function generateRuleId(): string {
	return `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Basic #RGB / #RRGGBB validation for the settings UI. */
export function isValidHexColor(value: string): boolean {
	return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}
