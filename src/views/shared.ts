import { Menu, Notice, type App } from "obsidian";
import type { Moment } from "moment";
import { CalendarEventItem, CalendarItem, CalendarSettings, CalendarTaskItem, TimeOfDay, ViewMode } from "../types";
import type { CalendarStore } from "../store";
import { dateKey, fromDateKey, isWeekendDate, minutesToTime } from "../dateUtils";
import { resolveColor } from "../colorRules";
import { displayTitle, firstWikilinkTarget, stripTags } from "../parser";

/**
 * Everything a sub-view (Year/Month/Week/Day) needs from the host CalendarView.
 * Keeping this as an interface — rather than passing the concrete CalendarView —
 * keeps each sub-view file decoupled from ItemView/Obsidian workspace details.
 */
export interface CalendarHost {
	app: App;
	store: CalendarStore;
	getSettings(): CalendarSettings;

	openDailyNote(date: Moment): Promise<void>;
	openLinkedNote(target: string): Promise<void>;

	openEventCreate(date: Moment, prefill?: Partial<{ start: TimeOfDay; end: TimeOfDay; allDay: boolean }>): void;
	openEventEdit(item: CalendarEventItem): void;
	openTaskCreate(date: Moment, prefill?: Partial<{ time: TimeOfDay | null; allDay: boolean }>): void;
	openTaskEdit(item: CalendarTaskItem): void;

	toggleTask(item: CalendarTaskItem, checked?: boolean): Promise<void>;

	/** Jump to a different anchor date and/or view mode (e.g. clicking a day in Year view). */
	goTo(anchor: Moment, mode: ViewMode): void;

	// ---- copy/paste (in-memory, per calendar-view session — not the OS clipboard) ----
	copyItemToClipboard(item: CalendarItem): void;
	/** Synchronous peek, used when building a context menu to decide whether to show "Paste" at all. */
	peekClipboard(): CalendarItem | null;
	/**
	 * Pastes whatever is on the clipboard onto `date`. When `atTime` is given
	 * (a right-click on a specific time slot), the pasted item starts there,
	 * keeping its original duration. When omitted (a right-click on a day
	 * header/number instead), the original time-of-day is kept and only the
	 * date changes.
	 */
	pasteClipboardAt(date: Moment, atTime?: TimeOfDay): Promise<void>;
}

/** Report failed async gestures/actions without leaving an unhandled promise rejection. */
export function handleCalendarAction(action: string, operation: Promise<unknown>): void {
	void operation.catch((error: unknown) => {
		const detail = error instanceof Error ? error.message : String(error);
		console.error(`Daynest: failed to ${action}: ${detail}`, error);
		// Keep a useful clue in the notification as well as the full stack in
		// the console, so repeated write/identity failures can be diagnosed.
		const compactDetail = detail.length > 140 ? `${detail.slice(0, 137)}…` : detail;
		new Notice(`Couldn't ${action}: ${compactDetail}`, 8000);
	});
}

/**
 * Obsidian ships two built-in themes: Obsidian (dark) and Moonstone (light).
 * Keep Daynest's original compact checkbox for those built-ins, while letting
 * community themes style native Obsidian checkbox inputs themselves.
 */
export function usesDefaultObsidianTheme(app: App): boolean {
	const runtimeApp = app as unknown as {
		customCss?: { theme?: unknown };
		vault?: { config?: { theme?: unknown } };
	};
	const active = typeof runtimeApp.customCss?.theme === "string"
		? runtimeApp.customCss.theme
		: runtimeApp.vault?.config?.theme;
	if (typeof active !== "string" || active.trim() === "") return true;
	const themeName = active.trim().toLowerCase();
	return themeName === "obsidian" || themeName === "moonstone" || themeName === "default";
}

/**
 * Render a task marker with Daynest's legacy checkbox in Obsidian's built-in
 * themes, and a native checkbox when a community theme is active. In either
 * case, expose the original marker through data-task; native controls also use
 * Obsidian's task-list-item-checkbox class so community-theme rules can target it.
 */
export function renderTaskCheckbox(
	parent: HTMLElement,
	app: App,
	item: CalendarTaskItem,
	onToggle: (checked: boolean) => void
): HTMLElement {
	const marker = item.checkboxStatus ?? (item.completed ? "x" : " ");
	const visuallyChecked = marker !== " ";
	const useLegacyCheckbox = usesDefaultObsidianTheme(app);
	const statusContainers = [parent, parent.closest<HTMLElement>(".dc-pill-task, .dc-block-task")].filter(
		(container): container is HTMLElement => container !== null
	);
	for (const container of new Set(statusContainers)) {
		container.classList.add("task-list-item");
		container.setAttribute("data-task", marker);
		container.classList.toggle("is-checked", marker !== " ");
	}

	if (useLegacyCheckbox) {
		const check = parent.createDiv({ cls: "dc-pill-check" + (visuallyChecked ? " is-checked" : "") });
		check.setAttribute("role", "checkbox");
		check.setAttribute("aria-checked", String(visuallyChecked));
		check.addEventListener("mousedown", (event) => event.stopPropagation());
		check.addEventListener("click", (event) => {
			event.stopPropagation();
			onToggle(!visuallyChecked);
		});
		return check;
	}

	// Community themes often scope status glyphs to the same selector shape
	// used by Obsidian's Markdown renderer. `display: contents` lets the input
	// remain a normal flex item in the calendar while preserving that structure.
	const themeScope = parent.createDiv({ cls: "markdown-preview-view dc-task-theme-scope" });
	const taskRow = themeScope.createEl("li", {
		cls: "task-list-item dc-theme-task-list-item" + (visuallyChecked ? " is-checked" : ""),
		attr: { "data-task": marker },
	});
	const check = taskRow.createEl("input", {
		cls: "dc-task-checkbox task-list-item-checkbox",
		attr: { type: "checkbox", "data-task": marker },
	});
	// Obsidian treats custom non-blank statuses as checked for purposes of
	// theme CSS selectors; the data-task attribute supplies the actual status.
	check.checked = visuallyChecked;
	check.addEventListener("mousedown", (event) => event.stopPropagation());
	check.addEventListener("click", (event) => event.stopPropagation());
	check.addEventListener("change", (event) => {
		event.stopPropagation();
		onToggle(check.checked);
	});
	return check;
}

export interface CalendarSubView {
	render(container: HTMLElement, anchor: Moment): void | Promise<void>;
	/**
	 * Optional lighter path for a data-only change (an item was created,
	 * moved, edited, or toggled) when the view's mode/anchor haven't changed.
	 * Should update in place — new/changed items appear or move, nothing
	 * else is torn down — so scroll position and any transient UI state
	 * survive. Views that don't implement this just get a full render().
	 */
	refresh?(): void | Promise<void>;
	/** Called when the view is torn down (mode switch, view close) — clear intervals/listeners here. */
	destroy?(): void;
}

/** Moves an item to a new date, keeping its time-of-day unchanged. Used by drag-and-drop in Month view. */
export async function moveItemToDate(store: CalendarStore, item: CalendarItem, newDate: Moment): Promise<void> {
	if (item.kind === "event") await store.updateEvent(item, { date: newDate });
	else await store.updateTask(item, { date: newDate });
}

/** Moves an item to a new date AND time, preserving an event's duration. Used by Week/Day timeline drag. */
export async function moveItemDateTime(
	store: CalendarStore,
	item: CalendarItem,
	newDate: Moment,
	newStartMin: number,
	durationMin: number
): Promise<void> {
	if (item.kind === "event") {
		await store.updateEvent(item, {
			date: newDate,
			start: minutesToTime(newStartMin),
			end: minutesToTime(newStartMin + durationMin),
		});
	} else {
		await store.updateTask(item, { date: newDate, time: minutesToTime(newStartMin) });
	}
}

/** Creates an exact copy of an item on the same date — the two then sit side by side. */
export function duplicateItem(host: CalendarHost, item: CalendarItem): void {
	const date = fromDateKey(item.date);
	if (item.kind === "event") {
		void host.store.createEvent(date, {
			title: item.title,
			allDay: item.allDay,
			start: item.start,
			end: item.end,
			tags: item.tags,
		});
	} else {
		void host.store.createTask(date, {
			title: item.title,
			allDay: item.allDay,
			time: item.time,
			tags: item.tags,
			completed: item.completed,
			checkboxStatus: item.checkboxStatus,
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
export function renderItemChip(
	host: CalendarHost,
	item: CalendarItem,
	settings: CalendarSettings,
	opts?: { draggable?: boolean }
): HTMLElement {
	const color = resolveColor(item.tags, settings.colorRules, defaultColorFor(item, settings));
	const chip = createDiv({ cls: "dc-pill" + (item.kind === "task" ? " dc-pill-task" : "") });
	chip.style.setProperty("--dc-item-color", color);

	if (opts?.draggable !== false) {
		chip.draggable = true;
		chip.addEventListener("dragstart", (e) => {
			e.dataTransfer?.setData("text/dc-item-id", item.id);
			if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
		});
	}

	if (item.kind === "task") {
		const check = renderTaskCheckbox(chip, host.app, item, (checked) => {
			void host.toggleTask(item, checked);
		});
		check.style.setProperty("--dc-item-color", color);
	}

	const label = chip.createSpan({ cls: "dc-pill-label" });
	const fullTitle = stripTags(displayTitle(item.title));
	label.setText(fullTitle);
	if (firstWikilinkTarget(item.title)) label.addClass("dc-linked");
	if (item.kind === "task" && item.completed) label.addClass("dc-completed");
	renderPillTagHint(chip, label, item, settings);
	// Task tags display in full when their complete set fits after the title;
	// otherwise they collapse to one # marker. The hover popover has all names.
	attachItemTitlePopover(
		chip,
		label,
		item.kind === "task" ? displayTitle(item.title) : fullTitle,
		item.kind === "task"
			? () => {
				const badges = Array.from(chip.querySelectorAll<HTMLElement>(".dc-task-full-tag"));
				return badges.length !== item.tags.length || badges.some((badge, index) =>
					badge.textContent !== `#${item.tags[index]}` || badge.scrollWidth > badge.clientWidth + 1
				);
			}
			: undefined
	);

	chip.addEventListener("click", (e) => {
		e.stopPropagation();
		const linkTarget = firstWikilinkTarget(item.title);
		if ((e.metaKey || e.ctrlKey) && linkTarget) {
			void host.openLinkedNote(linkTarget);
			return;
		}
		if (item.kind === "event") host.openEventEdit(item);
		else host.openTaskEdit(item);
	});

	return chip;
}

export function defaultColorFor(item: CalendarItem, settings: CalendarSettings): string {
	return item.kind === "task" ? settings.defaultTaskColor : settings.defaultEventColor;
}

/** Apply the same optional rule-based color to a rendered tag badge. */
function styleTagBadge(badge: HTMLElement, item: CalendarItem, settings: CalendarSettings): void {
	if (!settings.colorTagsUsingRules) return;
	const color = resolveColor(item.tags, settings.colorRules, defaultColorFor(item, settings));
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
export function fitTitleAndTagBadges(container: HTMLElement, label: HTMLElement, badges: HTMLElement[]): boolean {
	if (!container.isConnected || !label.isConnected || badges.length === 0 || badges.some((badge) => !badge.isConnected)) return false;
	const containerStyle = getComputedStyle(container);
	const contentWidth = container.clientWidth
		- parseFloat(containerStyle.paddingLeft || "0")
		- parseFloat(containerStyle.paddingRight || "0");
	if (contentWidth <= 0) return false;
	const gap = parseFloat(containerStyle.columnGap || containerStyle.gap || "0") || 0;
	const allChildren = Array.from(container.children) as HTMLElement[];
	const fixedChildren = allChildren.filter((child) => child !== label && !badges.includes(child));
	const margins = (element: HTMLElement): number => {
		const style = getComputedStyle(element);
		return parseFloat(style.marginLeft || "0") + parseFloat(style.marginRight || "0");
	};
	const outerWidth = (element: HTMLElement): number => element.getBoundingClientRect().width + margins(element);

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
	for (const badge of badges.slice(1)) badge.remove();
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

	const setBareHash = (): void => {
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
		} else {
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
function renderPillTagHint(chip: HTMLElement, label: HTMLElement, item: CalendarItem, settings: CalendarSettings): void {
	if (item.tags.length === 0) return;
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
export function renderTaskTagHints(container: HTMLElement, label: HTMLElement, item: CalendarItem, settings: CalendarSettings): void {
	if (item.tags.length === 0) return;
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
function attachItemTitlePopover(el: HTMLElement, label: HTMLElement, text: string, tagsAreHidden?: () => boolean): void {
	let timer: number | null = null;
	let popover: HTMLElement | null = null;
	let observer: MutationObserver | null = null;
	let hovered = false;
	const hide = () => {
		if (timer !== null) window.clearTimeout(timer);
		timer = null;
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
			// A data refresh may detach a chip while the hover delay is pending.
			// A detached node reports a (0, 0) rectangle and would leave a stuck
			// popover in Obsidian's top-left corner if we didn't reject it here.
			if (!hovered || !el.isConnected) return;
			const titleIsClipped = label.scrollWidth > label.clientWidth + 1 || label.scrollHeight > label.clientHeight + 1;
			if (!titleIsClipped && !tagsAreHidden?.()) return;
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
				if (!el.isConnected) hide();
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

// ------------------------------------------------------------- context menus

export interface ItemMenuActions {
	onNewEvent: () => void;
	onEdit: () => void;
	onDuplicate: () => void;
	onCopy: () => void;
	/** Omit entirely (rather than disable) when the clipboard is empty. */
	onPaste?: () => void;
	onDelete: () => void;
}

/** Right-click menu on an existing event/task: New event / Edit / Duplicate / Copy / Paste / Delete. */
export function showItemContextMenu(e: MouseEvent, actions: ItemMenuActions): void {
	e.preventDefault();
	e.stopPropagation();
	const menu = new Menu();
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

export interface EmptyMenuActions {
	onNewEvent: () => void;
	onPaste?: () => void;
}

/** Right-click menu on empty space (no item under the cursor): New event / Paste. */
export function showEmptyContextMenu(e: MouseEvent, actions: EmptyMenuActions): void {
	e.preventDefault();
	const menu = new Menu();
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
export function shouldHideWeekends(
	showWeekendsSetting: boolean,
	dates: Moment[],
	itemsByDate: Map<string, CalendarItem[]>
): boolean {
	if (showWeekendsSetting) return false;
	const hasWeekendItems = dates.some(
		(d) => isWeekendDate(d) && (itemsByDate.get(dateKey(d))?.length ?? 0) > 0
	);
	return !hasWeekendItems;
}
