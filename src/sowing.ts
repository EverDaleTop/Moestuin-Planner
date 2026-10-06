import type { Crop } from "./types";
import { parseSowWindow } from "./storage";

export const MONTHS_SHORT = [
  "jan", "feb", "mrt", "apr", "mei", "jun",
  "jul", "aug", "sep", "okt", "nov", "dec",
];

export const MONTHS_LONG = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];

/** Structured sowing window for a crop, falling back to the free-text window. */
export function sowWindowOf(crop: Crop): { start: number; end: number } | null {
  if (crop.sowStart && crop.sowEnd) {
    return { start: crop.sowStart, end: crop.sowEnd };
  }
  if (crop.sowStart && !crop.sowEnd) {
    return { start: crop.sowStart, end: crop.sowStart };
  }
  return parseSowWindow(crop.sowWindow);
}

/** All months (1–12) covered by a window, following a year wrap. */
export function windowMonths(start: number, end: number): number[] {
  const out: number[] = [];
  let m = start;
  for (let i = 0; i < 12; i++) {
    out.push(m);
    if (m === end) break;
    m = m % 12 + 1;
  }
  return out;
}

/** Whether month `m` (1–12) falls inside the window (wrap-aware). */
export function monthInWindow(m: number, start: number, end: number): boolean {
  if (start <= end) return m >= start && m <= end;
  return m >= start || m <= end;
}

/** Short text stored alongside structured months ("feb–apr" or "apr"). */
export function sowWindowText(start?: number, end?: number): string | undefined {
  if (!start) return undefined;
  const e = end ?? start;
  if (start === e) return MONTHS_SHORT[start - 1];
  return `${MONTHS_SHORT[start - 1]}–${MONTHS_SHORT[e - 1]}`;
}

/** Typical number of days between sowing and harvest, per crop. */
const DEFAULT_DAYS_TO_HARVEST = 70;

/**
 * Harvest window for a crop. An explicit window (from the seed packet or the
 * catalogue) always wins; otherwise we plan from the last sowing month plus
 * the growing time, so the calendar still shows roughly when to expect a
 * harvest.
 */
export function harvestWindowOf(crop: Crop): { start: number; end: number } | null {
  const w = sowWindowOf(crop);
  if (!w) return null;
  if (crop.harvestStart && crop.harvestEnd) {
    return { start: crop.harvestStart, end: crop.harvestEnd };
  }
  const monthsToAdd = Math.max(
    1,
    Math.round((crop.daysToHarvest ?? DEFAULT_DAYS_TO_HARVEST) / 30)
  );
  return {
    start: ((w.end + monthsToAdd - 1) % 12) + 1,
    end: ((w.end + monthsToAdd + 1 - 1) % 12) + 1,
  };
}

/** Zijn zaaien en oogsten in dezelfde maanden? Dan is het één doorlopend seizoen. */
export function sameWindow(
  a: { start: number; end: number } | null,
  b: { start: number; end: number } | null
): boolean {
  if (!a || !b) return false;
  return a.start === b.start && a.end === b.end;
}

/** Korte venstertekst, bv. "jun" of "mrt–jun". */
export function windowText(w: { start: number; end: number }): string {
  return w.start === w.end
    ? MONTHS_SHORT[w.start - 1]
    : `${MONTHS_SHORT[w.start - 1]}–${MONTHS_SHORT[w.end - 1]}`;
}

/** Compacte regel voor de tabel: één venster, of zaaien en oogsten. */
export function windowLine(crop: Crop): string | null {
  const sow = sowWindowOf(crop);
  if (!sow) return null;
  const harv = harvestWindowOf(crop);
  if (!harv) return windowText(sow);
  if (sameWindow(sow, harv)) return windowText(sow);
  return `zaai ${windowText(sow)} · oogst ${windowText(harv)}`;
}

/** Tekst voor een chip: bij gelijke vensters expliciet "zaai én oogst". */
export function seasonLabel(crop: Crop): string | null {
  const sow = sowWindowOf(crop);
  if (!sow) return null;
  const harv = harvestWindowOf(crop);
  if (!harv) return `zaai ${windowText(sow)}`;
  if (sameWindow(sow, harv)) return `zaai én oogst ${windowText(sow)}`;
  return `zaai ${windowText(sow)} · oogst ${windowText(harv)}`;
}

/** Next calendar date on which the window starts (wrap-aware). */
export function nextWindowStart(
  today: Date,
  start: number,
  end: number
): { date: Date; inWindow: boolean } {
  const y = today.getFullYear();
  for (let y0 = y - 1; y0 <= y + 1; y0++) {
    const s = new Date(y0, start - 1, 1);
    if (today >= s && today <= endOfWindow(y0, start, end)) {
      return { date: s, inWindow: true };
    }
    if (s > today) return { date: s, inWindow: false };
  }
  return { date: new Date(y + 1, start - 1, 1), inWindow: false };
}

function endOfWindow(year: number, start: number, end: number): Date {
  // last day of the end month (in the next year when wrapping)
  const y = end < start ? year + 1 : year;
  return new Date(y, end, 0);
}

export function daysUntil(a: Date, b: Date): number {
  const ms = 24 * 3600 * 1000;
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((db - da) / ms);
}

/** Crops whose window covers the given month. */
export function sowableInMonth(catalog: Crop[], month: number): Crop[] {
  return catalog.filter((c) => {
    const w = sowWindowOf(c);
    return w !== null && monthInWindow(month, w.start, w.end);
  });
}

/** Crops whose harvest window covers the given month. */
export function harvestableInMonth(catalog: Crop[], month: number): Crop[] {
  return catalog.filter((c) => {
    const w = harvestWindowOf(c);
    return w !== null && monthInWindow(month, w.start, w.end);
  });
}

export interface SowReminder {
  crop: Crop;
  /** first day of the upcoming window */
  date: Date;
  daysUntil: number;
  /** key used to avoid notifying twice for the same window */
  key: string;
}

/** Windows starting within `daysBefore` days (not ones already open). */
export function upcomingSowStarts(
  catalog: Crop[],
  today: Date,
  daysBefore: number
): SowReminder[] {
  const out: SowReminder[] = [];
  for (const crop of catalog) {
    const w = sowWindowOf(crop);
    if (!w) continue;
    const { date, inWindow } = nextWindowStart(today, w.start, w.end);
    // already open and started in the past: visible in "Nu zaaien", no push
    if (inWindow && date <= today) continue;
    const d = daysUntil(today, date);
    if (d >= 0 && d <= daysBefore) {
      out.push({
        crop,
        date,
        daysUntil: d,
        key: `${crop.id}:${date.getFullYear()}-${date.getMonth() + 1}`,
      });
    }
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil);
}
