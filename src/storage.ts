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
  { id: "potato", name: "Aardappel", color: "#b08968", rowSpacing: 0.6, plantSpacing: 0.35, sowWindow: "mrt–mei", sowStart: 3, sowEnd: 5, harvestStart: 7, harvestEnd: 10, icon: "aardappel" },
  { id: "aardbei", name: "Aardbeien", color: "#d94f5c", rowSpacing: 0.4, plantSpacing: 0.3, sowWindow: "mrt–apr", sowStart: 3, sowEnd: 4, harvestStart: 6, harvestEnd: 9, icon: "aardbei" },
  { id: "asperge", name: "Asperge", color: "#6f9c58", rowSpacing: 1.0, plantSpacing: 0.35, sowWindow: "mrt–apr", sowStart: 3, sowEnd: 4, harvestStart: 4, harvestEnd: 6, icon: "asperge" },
  { id: "augurk", name: "Augurk", color: "#4f8a3d", rowSpacing: 1.0, plantSpacing: 0.4, sowWindow: "apr–jun", sowStart: 4, sowEnd: 6, harvestStart: 7, harvestEnd: 9, icon: "augurk" },
  { id: "basilicum", name: "Basilicum", color: "#2f7d4f", rowSpacing: 0.25, plantSpacing: 0.2, sowWindow: "mrt–jun", sowStart: 3, sowEnd: 6, harvestStart: 6, harvestEnd: 10, icon: "basilicum" },
  { id: "bieslook", name: "Bieslook", color: "#3f8f5a", rowSpacing: 0.25, plantSpacing: 0.2, sowWindow: "mrt–mei", sowStart: 3, sowEnd: 5, harvestStart: 5, harvestEnd: 10, icon: "bieslook" },
  { id: "bloemen", name: "Bloemen", color: "#c56fb0", rowSpacing: 0.3, plantSpacing: 0.25, sowWindow: "apr–jun", sowStart: 4, sowEnd: 6, harvestStart: 7, harvestEnd: 10, icon: "bloemen" },
  { id: "boerenkool", name: "Boerenkool", color: "#2e6b3e", rowSpacing: 0.5, plantSpacing: 0.5, sowWindow: "apr–jun", sowStart: 4, sowEnd: 6, harvestStart: 10, harvestEnd: 2, icon: "boerenkool" },
  { id: "braam", name: "Braam", color: "#6b3f6e", rowSpacing: 1.5, plantSpacing: 0.75, sowWindow: "mrt–apr", sowStart: 3, sowEnd: 4, harvestStart: 7, harvestEnd: 9, icon: "braam" },
  { id: "chinesekool", name: "Chinese kool", color: "#7ba05a", rowSpacing: 0.4, plantSpacing: 0.35, sowWindow: "jun–aug", sowStart: 6, sowEnd: 8, harvestStart: 8, harvestEnd: 10, icon: "chinesekool" },
  { id: "courgette", name: "Courgette", color: "#5c9a4a", rowSpacing: 1.0, plantSpacing: 1.0, sowWindow: "apr–mei", sowStart: 4, sowEnd: 5, harvestStart: 7, harvestEnd: 10, icon: "courgette" },
  { id: "cucameloen", name: "Cucameloen", color: "#8fae4f", rowSpacing: 1.0, plantSpacing: 0.5, sowWindow: "apr–mei", sowStart: 4, sowEnd: 5, harvestStart: 8, harvestEnd: 10, icon: "cucameloen" },
  { id: "dille", name: "Dille", color: "#7aa85a", rowSpacing: 0.25, plantSpacing: 0.2, sowWindow: "apr–jul", sowStart: 4, sowEnd: 7, harvestStart: 6, harvestEnd: 10, icon: "dille" },
  { id: "framboos", name: "Framboos", color: "#c0455f", rowSpacing: 1.5, plantSpacing: 0.5, sowWindow: "mrt–apr", sowStart: 3, sowEnd: 4, harvestStart: 6, harvestEnd: 9, icon: "framboos" },
  { id: "knoflook", name: "Knoflook", color: "#cfc3a5", rowSpacing: 0.25, plantSpacing: 0.1, sowWindow: "okt–nov", sowStart: 10, sowEnd: 11, harvestStart: 6, harvestEnd: 8, icon: "knoflook" },
  { id: "komkommer", name: "Komkommer", color: "#4e9b52", rowSpacing: 1.0, plantSpacing: 0.4, sowWindow: "apr–jun", sowStart: 4, sowEnd: 6, harvestStart: 7, harvestEnd: 10, icon: "komkommer" },
  { id: "meloen", name: "Meloen", color: "#d8c15a", rowSpacing: 1.0, plantSpacing: 0.8, sowWindow: "apr–mei", sowStart: 4, sowEnd: 5, harvestStart: 8, harvestEnd: 9, icon: "meloen" },
  { id: "oregano", name: "Oregano", color: "#4a8a5a", rowSpacing: 0.3, plantSpacing: 0.25, sowWindow: "mrt–mei", sowStart: 3, sowEnd: 5, harvestStart: 6, harvestEnd: 10, icon: "oregano" },
  { id: "pepper", name: "Paprika", color: "#e1a92b", rowSpacing: 0.5, plantSpacing: 0.4, sowWindow: "feb–mrt", sowStart: 2, sowEnd: 3, harvestStart: 7, harvestEnd: 10, icon: "paprika" },
  { id: "peterselie", name: "Peterselie", color: "#3f8f4f", rowSpacing: 0.25, plantSpacing: 0.2, sowWindow: "mrt–jun", sowStart: 3, sowEnd: 6, harvestStart: 6, harvestEnd: 11, icon: "peterselie" },
  { id: "pompoen", name: "Pompoen", color: "#dd7a2f", rowSpacing: 1.5, plantSpacing: 1.0, sowWindow: "apr–mei", sowStart: 4, sowEnd: 5, harvestStart: 9, harvestEnd: 10, icon: "pompoen" },
  { id: "prei", name: "Prei", color: "#6b9b53", rowSpacing: 0.3, plantSpacing: 0.12, sowWindow: "feb–apr", sowStart: 2, sowEnd: 4, harvestStart: 9, harvestEnd: 3, icon: "prei" },
  { id: "raapstelen", name: "Raapstelen", color: "#5f9e4a", rowSpacing: 0.2, plantSpacing: 0.05, sowWindow: "mrt–aug", sowStart: 3, sowEnd: 8, harvestStart: 5, harvestEnd: 10, icon: "raapstelen" },
  { id: "rabarber", name: "Rabarber", color: "#b5524f", rowSpacing: 1.0, plantSpacing: 1.0, sowWindow: "mrt–apr", sowStart: 3, sowEnd: 4, harvestStart: 4, harvestEnd: 6, icon: "rabarber" },
  { id: "rodekool", name: "Rode kool", color: "#8e4a6b", rowSpacing: 0.5, plantSpacing: 0.5, sowWindow: "mrt–mei", sowStart: 3, sowEnd: 5, harvestStart: 9, harvestEnd: 12, icon: "rodekool" },
  { id: "salie", name: "Salie", color: "#6f8f6a", rowSpacing: 0.35, plantSpacing: 0.3, sowWindow: "mrt–mei", sowStart: 3, sowEnd: 5, harvestStart: 6, harvestEnd: 10, icon: "salie" },
  { id: "lettuce", name: "Sla", color: "#4caf50", rowSpacing: 0.27, plantSpacing: 0.33, sowWindow: "mrt–aug", sowStart: 3, sowEnd: 8, harvestStart: 5, harvestEnd: 10, icon: "kropsla" },
  { id: "spinach", name: "Spinazie", color: "#2ecc71", rowSpacing: 0.25, plantSpacing: 0.1, sowWindow: "mrt–mei", sowStart: 3, sowEnd: 5, harvestStart: 5, harvestEnd: 8, icon: "spinazie" },
  { id: "spitskool", name: "Spitskool", color: "#86a94f", rowSpacing: 0.45, plantSpacing: 0.4, sowWindow: "feb–jun", sowStart: 2, sowEnd: 6, harvestStart: 6, harvestEnd: 11, icon: "spitskool" },
  { id: "tijm", name: "Tijm", color: "#6f8f5a", rowSpacing: 0.3, plantSpacing: 0.25, sowWindow: "mrt–mei", sowStart: 3, sowEnd: 5, harvestStart: 6, harvestEnd: 10, icon: "tijm" },
  { id: "tomato", name: "Tomaat", color: "#e74c3c", rowSpacing: 0.6, plantSpacing: 0.5, sowWindow: "feb–apr", sowStart: 2, sowEnd: 4, harvestStart: 7, harvestEnd: 10, icon: "tomaat" },
  { id: "tuinboon", name: "Tuinboon", color: "#6fae7a", rowSpacing: 0.45, plantSpacing: 0.15, sowWindow: "feb–apr", sowStart: 2, sowEnd: 4, harvestStart: 6, harvestEnd: 8, icon: "tuinboon" },
  { id: "onion", name: "Ui", color: "#d4a373", rowSpacing: 0.27, plantSpacing: 0.13, sowWindow: "mrt", sowStart: 3, sowEnd: 3, harvestStart: 8, harvestEnd: 9, icon: "ui" },
  { id: "carrot", name: "Wortel", color: "#e67e22", rowSpacing: 0.25, plantSpacing: 0.05, sowWindow: "mrt–jun", sowStart: 3, sowEnd: 6, harvestStart: 6, harvestEnd: 10, icon: "wortel" },
];

/**
 * Vul een lege gewassenlijst aan met de standaardgewassen, zonder iets te
 * verwijderen. Gewassen die de gebruiker bewust verwijderd heeft (tombstone)
 * herrijzen niet. Bestaande tuinen met een lege lijst krijgen zo automatisch
 * weer een gevulde lijst.
 */
export function seedCatalog(own: Crop[], pool: Crop[], tomb?: Record<string, number>): Crop[] {
  if (own.length > 0) return own;
  const dead = tomb ?? {};
  return pool.filter((c) => dead[c.id] === undefined);
}

export const PX_PER_M = 100;

/**
 * Ontdubbelt de gewassenlijst op naam + ras (nieuwste wint). Oude databases
 * kunnen dezelfde soort twee keer bevatten (bijv. twee keer "Aardappel" door
 * een eerdere id-wijziging); die dubbels willen we nooit meer tonen.
 */
export function dedupeCatalog(crops: Crop[]): Crop[] {
  const keyOf = (c: Crop) =>
    `${c.name.trim().toLowerCase()}|${(c.variety ?? "").trim().toLowerCase()}`;
  const newest = new Map<string, Crop>();
  for (const c of crops) {
    const key = keyOf(c);
    const prev = newest.get(key);
    if (!prev || (c.updatedAt ?? 0) >= (prev.updatedAt ?? 0)) newest.set(key, c);
  }
  const seen = new Set<string>();
  const out: Crop[] = [];
  for (const c of crops) {
    const key = keyOf(c);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(newest.get(key)!);
  }
  return out;
}

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