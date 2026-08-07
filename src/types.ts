export type ElementType = "bed" | "path";

/** Active editor tool.
 *  - "select": select, move & resize elements; click empty canvas to deselect.
 *  - "move": pan the canvas; drag anywhere to move around without touching the selection.
 *  - "frame": drag out a rectangle on the canvas to create a new bed/path.
 *  Holding Space temporarily acts as the "move" tool from any tool. */
export type EditorTool = "select" | "move" | "frame";

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

export interface Garden {
  id: string;
  name: string;
  createdAt: number;
  elements: GardenElement[];
}

export interface AppData {
  gardens: Garden[];
  cropCatalog: Crop[];
}