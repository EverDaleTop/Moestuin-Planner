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
  { id: "carrot", name: "Wortel", color: "#e67e22", rowSpacing: 0.15, plantSpacing: 0.05, sowWindow: "mrt–jun", notes: "Dun uit tot 5 cm in de rij.", icon: "carrot" },
  { id: "tomato", name: "Tomaat", color: "#e74c3c", rowSpacing: 0.6, plantSpacing: 0.5, sowWindow: "feb–apr", notes: "Tuinpoten na vorst.", icon: "apple-whole" },
  { id: "lettuce", name: "Sla", color: "#27ae60", rowSpacing: 0.3, plantSpacing: 0.25, sowWindow: "mrt–aug", icon: "leaf" },
  { id: "potato", name: "Aardappel", color: "#b08968", rowSpacing: 0.75, plantSpacing: 0.3, sowWindow: "apr", icon: "sprout" },
  { id: "beet", name: "Biet", color: "#8e44ad", rowSpacing: 0.3, plantSpacing: 0.1, sowWindow: "apr–jul", icon: "clover" },
  { id: "bean", name: "Boon", color: "#7dcea0", rowSpacing: 0.5, plantSpacing: 0.1, sowWindow: "mei–jun", icon: "hand-fist" },
  { id: "pepper", name: "Paprika", color: "#f1c40f", rowSpacing: 0.5, plantSpacing: 0.4, sowWindow: "feb–mrt", icon: "pepper-hot" },
  { id: "onion", name: "Ui", color: "#d4a373", rowSpacing: 0.3, plantSpacing: 0.1, sowWindow: "mrt", icon: "spa" },
  { id: "spinach", name: "Spinazie", color: "#2ecc71", rowSpacing: 0.25, plantSpacing: 0.1, sowWindow: "mrt–apr", icon: "snowflake" },
  { id: "broccoli", name: "Broccoli", color: "#1e8449", rowSpacing: 0.6, plantSpacing: 0.5, sowWindow: "apr–jun", icon: "tree" },
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