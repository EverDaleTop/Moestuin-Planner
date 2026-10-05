export type ElementType = "bed" | "path" | "object";

/** Keys of the special garden objects (benches, fences, …). See src/gardenObjects.ts. */
export type GardenObjectKey =
  | "bench"
  | "pole"
  | "storage"
  | "gaas"
  | "compost-heap"
  | "compost-bin"
  | "water-barrel";

/** One endpoint of a gaas ("net") line. It spans between two anchors which are
 *  either pinned to a pole (by element id) or free-floating world points. */
export interface GaasPin {
  poleId?: string;
  x: number;
  y: number;
}

export interface GaasData {
  a: GaasPin;
  b: GaasPin;
}

/** Some objects (poles) are round and sized by their radius. */
export type GardenObjectShape = "rect" | "circle";

/** Active editor tool.
 *  - "select": select, move & resize elements; click empty canvas to deselect.
 *  - "move": pan the canvas; drag anywhere to move around without touching the selection.
 *  - "frame": drag out a rectangle on the canvas to create a new bed/path.
 *  - "gaas": draw a mesh line on the canvas between two points (or poles).
 *  Holding Space temporarily acts as the "move" tool from any tool. */
export type EditorTool = "select" | "move" | "frame" | "gaas";

export interface Crop {
  id: string;
  name: string;
  color: string;
  /** centres between rows in metres */
  rowSpacing: number;
  /** spacing between plants in a row in metres */
  plantSpacing: number;
  /** recommended sowing window, e.g. "apr–jun" */
  sowWindow?: string;
  notes?: string;
  /** flat icon key for this crop, see src/cropIcons.ts */
  icon?: string;
}

/** A crop instance planted in a bed. */
export interface CropAssignment {
  instanceId: string;
  cropId: string;
  /** number of parallel rows inside the bed */
  rows: number;
  /** optional override, defaults to the crop's rowSpacing */
  rowSpacing?: number;
  /** optional override, snapshotted from the crop at add time */
  plantSpacing?: number;
  /** optional column count override for the grid */
  cols?: number;
  /** inset from the area edges, in metres */
  padding?: number;
  /**
   * Sub-region the planting occupies, in metres relative to the bed's top-left
   * corner. When absent the planting fills the whole bed.
   */
  area?: { x: number; y: number; w: number; h: number };
}

export interface GardenElement {
  id: string;
  type: ElementType;
  label: string;
  /** object kind, only when `type === "object"` */
  object?: GardenObjectKey;
  /** "circle" renders a round footprint (poles); width/height stay equal (2×radius) */
  shape?: GardenObjectShape;
  /** only for `object === "gaas"`: the two anchors the line spans */
  gaas?: GaasData;
  /** position on the canvas (px) */
  x: number;
  y: number;
  /** dimensions in metres (metric system) */
  widthM: number;
  heightM: number;
  color: string;
  /** only meaningful for beds */
  crops: CropAssignment[];
}

export interface HarvestEntry {
  id: string;
  /** Gewasnaam als vrije tekst, zoals de gebruiker die zelf intikt. */
  cropName: string;
  /** Optionele koppeling met de catalogus; alleen nog aanwezig bij oudere regels. */
  cropId?: string;
  quantity: number;
  date: string;
  pricePerKg: number;
  isOrganic: boolean;
  /** productlink van dezelfde oogst in een supermarkt, voor de besparingvergelijking */
  productUrl?: string;
  /** prijs van die verpakking, zoals opgehaald van de productlink */
  storePrice?: number;
  /** gewicht van die verpakking in kg (supermarkten verkopen per verpakking) */
  storeWeightKg?: number;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  /** automatisch aangemaakt vanuit een afgevinkt boodschap-item */
  shoppingItemId?: string;
  /** gekozen categorie, zie src/expenseCategories.ts */
  category?: string;
}

/** Geld dat binnenkomt, bv. verkoop van oogst of plantjes. */
export interface Income {
  id: string;
  description: string;
  amount: number;
  date: string;
  /** gekozen categorie, zie src/expenseCategories.ts (INCOME_CATEGORIES) */
  category?: string;
}

export interface ShoppingItem {
  id: string;
  title: string;
  /** optionele productlink (webshop) */
  url?: string;
  /** aantal, bv. "2x" of "3 zakken" */
  quantity?: string;
  /** richtprijs per stuk / totaal */
  price?: number;
  /** automatisch opgehaalde productafbeelding (og:image) */
  imageUrl?: string;
  /** herkende webshop (temu, aliexpress, bol.com, …) */
  source?: string;
  /** gekozen categorie, zie src/expenseCategories.ts */
  category?: string;
  note?: string;
  done: boolean;
  createdAt: number;
}

export interface Garden {
  id: string;
  name: string;
  createdAt: number;
  elements: GardenElement[];
  harvests: HarvestEntry[];
  expenses: Expense[];
  incomes: Income[];
  shopping: ShoppingItem[];
  /** user id of the garden's owner; only the owner can share/delete */
  ownerId: string;
  /** user ids that may view & edit this garden */
  sharedWith: string[];
  /** secret invite token embedded in the share URL; joining requires it */
  inviteToken: string;
}

export interface User {
  id: string;
  username: string;
  createdAt: number;
}

export interface AppData {
  gardens: Garden[];
  cropCatalog: Crop[];
}