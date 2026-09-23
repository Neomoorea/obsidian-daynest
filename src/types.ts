// Core data model shared by every part of the plugin.
// Keep this file free of Obsidian imports so it stays trivially testable.

export interface TimeOfDay {
	hour: number; // 0-23
	minute: number; // 0-59
}

export type ItemKind = "event" | "task";
export type ManagedSection = "events" | "tasks";
export type OpenMode = "current" | "new" | "new-right";
export type Spacing = "compact" | "spacious";
export type ViewMode = "year" | "month" | "week" | "day";
export type DefaultViewSetting = ViewMode | "last";

export interface ColorRule {
	id: string;
	/** Lower-case tag names, without the leading '#'. */
	tags: string[];
	/** Hex color, e.g. "#3B82F6". */
	color: string;
}

export interface CalendarSettings {
	// General
	defaultView: DefaultViewSetting;
	/** Updated automatically whenever defaultView is "last"; ignored otherwise. */
	lastUsedView: ViewMode;
	firstDayOfWeek: number; // 0 = Sunday ... 6 = Saturday
	defaultEventDurationMinutes: number;
	minEventDurationMinutes: number;
	workingHoursStart: TimeOfDay;
	workingHoursEnd: TimeOfDay;
	timeFormat: "12h" | "24h";
	showWeekends: boolean;
	showWeekNumbers: boolean;
	showCurrentTimeIndicator: boolean;
	autoScrollToCurrentTime: boolean;

	// Daily notes
	eventsHeading: string;
	tasksHeading: string;
	separateTaskSection: boolean;

	// Managed-section formatting
	eventSpacing: Spacing;
	taskSpacing: Spacing;

	// Colours
	colorRules: ColorRule[];
	defaultEventColor: string;

	// Opening behaviour
	dailyNoteOpenMode: OpenMode;
	linkedNoteOpenMode: OpenMode;

	// Appearance
	eventDensity: "compact" | "comfortable" | "spacious";
	calendarScale: "small" | "medium" | "large";
	weekendShading: boolean;
	cornerRadius: "none" | "small" | "medium" | "large";
}

interface BaseCalendarItem {
	/** Stable only for the lifetime of a single parse; recomputed every read. */
	id: string;
	kind: ItemKind;
	/** YYYY-MM-DD, derived from the Daily Note's filename. */
	date: string;
	/** Vault path of the Daily Note this item was parsed from. */
	filePath: string;
	section: ManagedSection;
	/** Display text: whatever followed the time/checkbox syntax, tags and wikilinks intact. */
	title: string;
	/** Lower-case, without '#'. */
	tags: string[];
	rawLine: string;
}

export interface CalendarEventItem extends BaseCalendarItem {
	kind: "event";
	allDay: boolean;
	start: TimeOfDay;
	end: TimeOfDay;
}

export interface CalendarTaskItem extends BaseCalendarItem {
	kind: "task";
	allDay: boolean;
	time: TimeOfDay | null;
	completed: boolean;
}

export type CalendarItem = CalendarEventItem | CalendarTaskItem;

export const DEFAULT_COLOR_RULES: ColorRule[] = [
	{ id: "rule-work", tags: ["work"], color: "#3B82F6" },
	{ id: "rule-personal", tags: ["personal"], color: "#22C55E" },
	{ id: "rule-health", tags: ["health"], color: "#EF4444" },
];

export const DEFAULT_SETTINGS: CalendarSettings = {
	defaultView: "month",
	lastUsedView: "month",
	firstDayOfWeek: 1, // Monday, matches Apple Calendar's common default outside the US
	defaultEventDurationMinutes: 60,
	minEventDurationMinutes: 15,
	workingHoursStart: { hour: 8, minute: 0 },
	workingHoursEnd: { hour: 18, minute: 0 },
	timeFormat: "24h",
	showWeekends: true,
	showWeekNumbers: false,
	showCurrentTimeIndicator: true,
	autoScrollToCurrentTime: true,

	eventsHeading: "## Events",
	tasksHeading: "## Tasks",
	separateTaskSection: true,

	eventSpacing: "compact",
	taskSpacing: "compact",

	colorRules: DEFAULT_COLOR_RULES,
	defaultEventColor: "#8E8E93",

	dailyNoteOpenMode: "new",
	linkedNoteOpenMode: "new",

	eventDensity: "comfortable",
	calendarScale: "medium",
	weekendShading: true,
	cornerRadius: "medium",
};
