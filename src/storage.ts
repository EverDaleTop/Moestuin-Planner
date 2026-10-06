import type { Crop, GardenElement } from "./types";

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

let counter = 0;
export function id(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export const DEFAULT_CROP_CATALOG: Crop[] = [
  { id: "carrot", name: "Wortel", color: "#e67e22", rowSpacing: 0.15, plantSpacing: 0.05, sowWindow: "mrt–jun", sowStart: 3, sowEnd: 6, harvestStart: 6, harvestEnd: 10, notes: "Dun uit tot 5 cm in de rij.", icon: "carrot" },
  { id: "tomato", name: "Tomaat", color: "#e74c3c", rowSpacing: 0.6, plantSpacing: 0.5, sowWindow: "feb–apr", sowStart: 2, sowEnd: 4, harvestStart: 7, harvestEnd: 10, notes: "Tuinpoten na vorst.", icon: "tomato" },
  { id: "lettuce", name: "Sla", color: "#27ae60", rowSpacing: 0.3, plantSpacing: 0.25, sowWindow: "mrt–aug", sowStart: 3, sowEnd: 8, harvestStart: 5, harvestEnd: 10, icon: "salad" },
  { id: "potato", name: "Aardappel", color: "#b08968", rowSpacing: 0.75, plantSpacing: 0.3, sowWindow: "apr", sowStart: 4, sowEnd: 4, harvestStart: 7, harvestEnd: 8, icon: "potato" },
  { id: "beet", name: "Biet", color: "#8e44ad", rowSpacing: 0.3, plantSpacing: 0.1, sowWindow: "apr–jul", sowStart: 4, sowEnd: 7, harvestStart: 7, harvestEnd: 10, icon: "beet" },
  { id: "bean", name: "Boon", color: "#7dcea0", rowSpacing: 0.5, plantSpacing: 0.1, sowWindow: "mei–jun", sowStart: 5, sowEnd: 6, harvestStart: 7, harvestEnd: 9, icon: "beans" },
  { id: "pepper", name: "Paprika", color: "#f1c40f", rowSpacing: 0.5, plantSpacing: 0.4, sowWindow: "feb–mrt", sowStart: 2, sowEnd: 3, harvestStart: 7, harvestEnd: 10, icon: "bell-pepper" },
  { id: "onion", name: "Ui", color: "#d4a373", rowSpacing: 0.3, plantSpacing: 0.1, sowWindow: "mrt", sowStart: 3, sowEnd: 3, harvestStart: 8, harvestEnd: 9, icon: "onion" },
  { id: "spinach", name: "Spinazie", color: "#2ecc71", rowSpacing: 0.25, plantSpacing: 0.1, sowWindow: "mrt–apr", sowStart: 3, sowEnd: 4, harvestStart: 5, harvestEnd: 7, icon: "leafy" },
  { id: "broccoli", name: "Broccoli", color: "#1e8449", rowSpacing: 0.6, plantSpacing: 0.5, sowWindow: "apr–jun", sowStart: 4, sowEnd: 6, harvestStart: 8, harvestEnd: 11, icon: "broccoli" },
];

export const PX_PER_M = 100;

/** Convert a garden element to React Flow node dimensions in px. */
export function elementSize(el: Pick<GardenElement, "widthM" | "heightM">): {
  width: number;
  height: number;
} {
  return {
    width: Math.max(10, el.widthM * PX_PER_M),
    height: Math.max(10, el.heightM * PX_PER_M),
  };
}

export function fmtM(v: number, decimals = 1): string {
  return `${(Math.round(v * 10) / 10).toFixed(decimals).replace(/\.0$/, "")} m`;
}

/** Round a metre value to 5 cm, the grid the editor draws crops on. */
export function roundM(v: number): number {
  return Math.round(v * 20) / 20;
}

const MONTH_ABBR: Record<string, number> = {
  jan: 1, feb: 2, mrt: 3, maa: 3, apr: 4, mei: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12,
};

/**
 * Parse a free-text sowing window ("mrt–jun", "apr", "februari - mei") into
 * months 1–12. Returns null when nothing recognisable is found. Used to
 * backfill the structured sowStart/sowEnd for older catalog entries.
 */
export function parseSowWindow(text?: string): { start: number; end: number } | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  const found: number[] = [];
  // full month names first (februari…), then abbreviations
  const full = [
    "januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december",
  ];
  const re = new RegExp(
    full.map((m) => `(${m})`).join("|") + "|\\b([a-z]{3,4})\\b",
    "g"
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower)) !== null) {
    const fullIdx = full.findIndex((name) => name === m![0]);
    if (fullIdx >= 0) {
      found.push(fullIdx + 1);
      continue;
    }
    const abbr = MONTH_ABBR[m[0].slice(0, 3)] ?? MONTH_ABBR[m[0].slice(0, 4)];
    if (abbr) found.push(abbr);
  }
  if (found.length === 0) return null;
  return { start: found[0], end: found[found.length - 1] };
}

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
  gap = 0.05
): boolean {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}

/**
 * Find a free spot inside a bed for another planting, so crops stack as
 * separate pieces instead of always filling the whole bed. Scans left-to-right,
 * top-to-bottom in 5 cm steps and returns the first slot that is still free.
 * Falls back to a full-width band at the bottom when the bed is full.
 */
export function findFreeCropArea(
  bedW: number,
  bedH: number,
  taken: { x: number; y: number; w: number; h: number }[],
  prefW = Math.min(bedW, 0.8),
  prefH = Math.min(bedH, 0.5)
): { x: number; y: number; w: number; h: number } {
  const w = Math.max(0.1, roundM(Math.min(prefW, bedW)));
  const h = Math.max(0.1, roundM(Math.min(prefH, bedH)));
  const step = 0.25;
  for (let y = 0; y <= bedH - h + 1e-6; y = roundM(y + step)) {
    for (let x = 0; x <= bedW - w + 1e-6; x = roundM(x + step)) {
      const cand = { x, y, w, h };
      if (!taken.some((t) => overlaps(cand, t))) return cand;
    }
  }
  // bed vol: onderaan een nieuwe rij, ook als die overlapt
  const y = Math.max(0, roundM(bedH - h));
  return { x: 0, y, w: bedW, h };
}