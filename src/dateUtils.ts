import { moment } from "obsidian";
import type { Moment } from "moment";
import { TimeOfDay } from "./types";

export function today(): Moment {
	return moment().startOf("day");
}

export function dateKey(m: Moment): string {
	return m.format("YYYY-MM-DD");
}

export function fromDateKey(key: string): Moment {
	return moment(key, "YYYY-MM-DD", true).startOf("day");
}

export function isSameDay(a: Moment, b: Moment): boolean {
	return a.isSame(b, "day");
}

export function isToday(m: Moment): boolean {
	return isSameDay(m, today());
}

export function pad2(n: number): string {
	return n < 10 ? "0" + n : String(n);
}

export function timeToMinutes(t: TimeOfDay): number {
	return t.hour * 60 + t.minute;
}

export function minutesToTime(mins: number): TimeOfDay {
	const m = ((Math.round(mins) % 1440) + 1440) % 1440;
	return { hour: Math.floor(m / 60), minute: m % 60 };
}

export function compareTimeOfDay(a: TimeOfDay, b: TimeOfDay): number {
	return timeToMinutes(a) - timeToMinutes(b);
}

export function clampTimeOfDay(t: TimeOfDay): TimeOfDay {
	const hour = Math.min(23, Math.max(0, Math.floor(t.hour)));
	const minute = Math.min(59, Math.max(0, Math.floor(t.minute)));
	return { hour, minute };
}

/** Round a minute-of-day value to the nearest snap increment (e.g. 5 or 15 minutes). */
export function snapMinutes(mins: number, snap: number): number {
	return Math.round(mins / snap) * snap;
}

export function formatTimeOfDay(t: TimeOfDay, format: "12h" | "24h"): string {
	if (format === "24h") return `${pad2(t.hour)}:${pad2(t.minute)}`;
	if (t.hour === 0 && t.minute === 0) return "Midnight";
	if (t.hour === 12 && t.minute === 0) return "Midday";
	const period = t.hour < 12 ? "AM" : "PM";
	let h = t.hour % 12;
	if (h === 0) h = 12;
	return t.minute === 0 ? `${h} ${period}` : `${h}:${pad2(t.minute)} ${period}`;
}

export function parseTimeString(s: string): TimeOfDay | null {
	const match = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
	if (!match) return null;
	const hour = parseInt(match[1], 10);
	const minute = parseInt(match[2], 10);
	if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
	return { hour, minute };
}

export function startOfWeek(m: Moment, firstDayOfWeek: number): Moment {
	const day = m.day(); // 0 (Sun) - 6 (Sat)
	const diff = (day - firstDayOfWeek + 7) % 7;
	return m.clone().subtract(diff, "days").startOf("day");
}

export function getWeekDates(anchor: Moment, firstDayOfWeek: number): Moment[] {
	const start = startOfWeek(anchor, firstDayOfWeek);
	return Array.from({ length: 7 }, (_, i) => start.clone().add(i, "days"));
}

/** Returns the calendar grid for a month as an array of 7-day weeks (4-6 rows). */
export function getMonthGridWeeks(anchor: Moment, firstDayOfWeek: number): Moment[][] {
	const monthStart = anchor.clone().startOf("month");
	const monthEnd = anchor.clone().endOf("month");
	const gridStart = startOfWeek(monthStart, firstDayOfWeek);
	const gridEnd = startOfWeek(monthEnd, firstDayOfWeek).add(6, "days");

	const weeks: Moment[][] = [];
	const cursor = gridStart.clone();
	while (cursor.isSameOrBefore(gridEnd, "day")) {
		const week: Moment[] = [];
		for (let i = 0; i < 7; i++) {
			week.push(cursor.clone());
			cursor.add(1, "day");
		}
		weeks.push(week);
	}
	return weeks;
}

export function weekNumber(m: Moment): number {
	return m.isoWeek();
}

export const MONTH_NAMES = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
];

export const MONTH_NAMES_SHORT = [
	"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const WEEKDAY_NAMES = [
	"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

export const WEEKDAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function orderedWeekdayShortNames(firstDayOfWeek: number): string[] {
	return Array.from({ length: 7 }, (_, i) => WEEKDAY_NAMES_SHORT[(firstDayOfWeek + i) % 7]);
}
