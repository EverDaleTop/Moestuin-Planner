export interface CropIconDef {
  key: string;
  label: string;
  /** FontAwesome class, used in the UI (i elements). */
  cls: string;
  /** Glyph codepoint used for canvas drawing (FA free solid) at weight 900. */
  char: string;
}

/** Flat-colour icons available for crops. Codepoints verified against the
 *  bundled @fortawesome/fontawesome-free solid set. */
export const CROP_ICONS: CropIconDef[] = [
  { key: "leaf", label: "Blad", cls: "fa-solid fa-leaf", char: "\uf06c" },
  { key: "sprout", label: "Kiemplant", cls: "fa-solid fa-sprout", char: "\uf4d8" },
  { key: "carrot", label: "Wortel", cls: "fa-solid fa-carrot", char: "\uf787" },
  { key: "apple-whole", label: "Vrucht", cls: "fa-solid fa-apple-whole", char: "\uf5d1" },
  { key: "pepper-hot", label: "Peper", cls: "fa-solid fa-pepper-hot", char: "\uf816" },
  { key: "wheat-awn", label: "Graan", cls: "fa-solid fa-wheat-awn", char: "\ue2cd" },
  { key: "tree", label: "Boom", cls: "fa-solid fa-tree", char: "\uf1bb" },
  { key: "sun", label: "Zon", cls: "fa-solid fa-sun", char: "\uf185" },
  { key: "snowflake", label: "Vorst", cls: "fa-solid fa-snowflake", char: "\uf2dc" },
  { key: "spa", label: "Bloem", cls: "fa-solid fa-spa", char: "\uf5bb" },
  { key: "clover", label: "Klaver", cls: "fa-solid fa-clover", char: "\ue139" },
  { key: "hand-fist", label: "Hand", cls: "fa-solid fa-hand-fist", char: "\uf6de" },
  { key: "cannabis", label: "Kruid", cls: "fa-solid fa-cannabis", char: "\uf55f" },
];

export const DEFAULT_CROP_ICON = "leaf";

export const ICON_KEYS = CROP_ICONS.map((i) => i.key);
export const ICON_LABELS: Record<string, string> = Object.fromEntries(
  CROP_ICONS.map((i) => [i.key, i.label])
);

export function cropIconDef(key?: string): CropIconDef {
  return CROP_ICONS.find((i) => i.key === key) ?? CROP_ICONS[0];
}

export function cropIconChar(key?: string): string {
  return cropIconDef(key).char;
}

export function cropIconClass(key?: string): string {
  return cropIconDef(key).cls;
}

export interface PlantSpot {
  x: number;
  y: number;
}

/**
 * Compute the plant spot centres (in world px) inside a planting's area in a
 * grid (rows × columns), using the crop's spacing so gaps scale automatically
 * with the plant & row distances. `cols` overrides the column count; `padding`
 * insets the grid from the area edges (metres). Returns the spots and the icon
 * draw size.
 */
export function plantPositions(
  area: { x: number; y: number; w: number; h: number },
  rows: number,
  cols: number | undefined,
  rowSpacingM: number,
  plantSpacingM: number,
  paddingM: number,
  pxPerM: number
): { spots: PlantSpot[]; size: number } {
  const pad = (paddingM || 0) * pxPerM;
  const inner = {
    x: area.x + pad,
    y: area.y + pad,
    w: Math.max(0, area.w - pad * 2),
    h: Math.max(0, area.h - pad * 2),
  };
  const sx = Math.max(pxPerM * 0.03, (plantSpacingM || 0.1) * pxPerM);
  const sy = Math.max(pxPerM * 0.03, (rowSpacingM || 0.1) * pxPerM);
  const fitCount = (n: number, cell: number, size: number) =>
    Math.max(1, Math.min(Math.max(1, Math.round(n)), Math.max(1, Math.floor(size / cell))));

  const baseCols = Math.max(1, Math.floor(inner.w / sx));
  const baseRows = Math.max(1, Math.floor(inner.h / sy));
  const colCount = cols ? fitCount(cols, sx, inner.w) : baseCols;
  const rowCount = rows ? fitCount(rows, sy, inner.h) : baseRows;

  const gridW = (colCount - 1) * sx;
  const gridH = (rowCount - 1) * sy;
  const x0 = inner.x + (inner.w - gridW) / 2;
  const y0 = inner.y + (inner.h - gridH) / 2;

  const spots: PlantSpot[] = [];
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      spots.push({ x: x0 + c * sx, y: y0 + r * sy });
    }
  }
  const size = Math.max(3.5, Math.min(14, Math.min(sx, sy) * 0.42));
  return { spots, size };
}