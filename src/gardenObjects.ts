import type {
  GardenObjectKey,
  GardenObjectShape,
} from "./types";

/** A special garden object (bench, fence, …). These are sibling elements of
 *  beds and paths and are always drawn on top of them. */
export interface GardenObjectDef {
  key: GardenObjectKey;
  name: string;
  /** FontAwesome icon classes for the UI (menu grid, inspector). */
  icon: string;
  /** FontAwesome solid glyph used when drawing on the canvas. */
  char: string;
  /** default footprint in metres */
  widthM: number;
  heightM: number;
  /** round objects (poles) use a radius instead of a wide footprint */
  shape?: GardenObjectShape;
  radiusM?: number;
  /** default element color */
  color: string;
  /** search keywords (Dutch) */
  keywords: string;
}

export const GARDEN_OBJECTS: GardenObjectDef[] = [
  {
    key: "bench",
    name: "Bank",
    icon: "fa-solid fa-chair",
    char: "\uf6c0",
    widthM: 1.6,
    heightM: 0.7,
    color: "#8a5a2b",
    keywords: "bank zit zithoek picknick tuinmeubel",
  },
  {
    key: "pole",
    name: "Paal",
    icon: "fa-solid fa-tower-observation",
    char: "\ue586",
    shape: "circle",
    radiusM: 0.35,
    widthM: 0.7,
    heightM: 0.7,
    color: "#7a8fa8",
    keywords: "paal paaltje steun richtpaal hek",
  },
  {
    key: "storage",
    name: "Opslag",
    icon: "fa-solid fa-box",
    char: "\uf466",
    widthM: 1,
    heightM: 0.9,
    color: "#6b7280",
    keywords: "opslag kast opberg tuinhuis gereedschap",
  },
  {
    key: "compost-heap",
    name: "Composthoop",
    icon: "fa-solid fa-mound",
    char: "\ue52d",
    widthM: 1.2,
    heightM: 1,
    color: "#8a6a45",
    keywords: "compost hoop stort composthoop kek",
  },
  {
    key: "compost-bin",
    name: "Compostton",
    icon: "fa-solid fa-recycle",
    char: "\uf1b8",
    shape: "circle",
    radiusM: 0.45,
    widthM: 0.9,
    heightM: 0.9,
    color: "#4b6043",
    keywords: "compost ton ton vat bin compostbak",
  },
  {
    key: "water-barrel",
    name: "Waterton",
    icon: "fa-solid fa-drum",
    char: "\uf569",
    shape: "circle",
    radiusM: 0.4,
    widthM: 0.8,
    heightM: 0.8,
    color: "#3d6ea6",
    keywords: "water ton regen vat gieter",
  },
];

export function objectDef(key?: string): GardenObjectDef | undefined {
  return GARDEN_OBJECTS.find((o) => o.key === key);
}

export function objectIconClass(key?: string): string {
  return objectDef(key)?.icon ?? GARDEN_OBJECTS[0].icon;
}

export function objectChar(key?: string): string {
  return objectDef(key)?.char ?? GARDEN_OBJECTS[0].char;
}

/** Object keys laid out square (no radius / footprint constraint). */
export function isRoundObjectDef(def?: GardenObjectDef): boolean {
  return def?.shape === "circle";
}