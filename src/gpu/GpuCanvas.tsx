import { useCallback, useEffect, useRef } from "react";
import { GpuRenderer, type DrawItem } from "./Renderer";
import type {
  Crop,
  CropAssignment,
  EditorTool,
  ElementType,
  GardenElement,
} from "../types";
import { PX_PER_M, fmtM } from "../storage";

interface ElementUpdate {
  id: string;
  x?: number;
  y?: number;
  widthM?: number;
  heightM?: number;
  /** when a bed is resized, its plants scale proportionally */
  crops?: CropAssignment[];
}

interface Props {
  elements: GardenElement[];
  catalog: Crop[];
  tool: EditorTool;
  frameType: ElementType;
  selectedIds: string[];
  selectedCropId: string | null;
  theme: "light" | "dark";
  onSelect: (ids: string[]) => void;
  onSelectCrop: (instanceId: string | null) => void;
  onApplyChanges: (updates: ElementUpdate[]) => void;
  onAddFrame: (type: ElementType, x: number, y: number, wM: number, hM: number) => string;
  onUpdateCrop: (
    eId: string,
    instanceId: string,
    patch: Partial<CropAssignment>
  ) => void;
  onBusyChange?: (busy: boolean) => void;
}

interface Cam {
  x: number;
  y: number;
  zoom: number;
}
interface R {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Pt {
  x: number;
  y: number;
}
/** One snap guide line. `at` is the aligned coordinate; `a`..`b` is the extent
 *  along the perpendicular axis (so the line spans both involved objects);
 *  `center` marks a centre-alignment (drawn solid + dot) vs an edge (dashed). */
interface SnapLine {
  at: number;
  center: boolean;
  a: number;
  b: number;
}
interface SnapGuides {
  v: SnapLine[];
  h: SnapLine[];
}

const MIN = 5; // world px == 5cm
const SNAP = 14;
const HANDLE_HIT = 20;
const EDGE_HIT = 12;

type Dir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type Gesture =
  | { k: "none" }
  | { k: "pan"; sx: number; sy: number; ox: number; oy: number }
  | { k: "marquee"; start: Pt; end: Pt }
  | { k: "drag"; id: string; sp: Pt; origin: R }
  | { k: "groupDrag"; ids: string[]; sp: Pt; origins: Map<string, R>; leadId: string }
  | { k: "groupResize"; ids: string[]; dir: Dir; union: R; origins: Map<string, R> }
  | { k: "frame"; start: Pt; end: Pt }
  | { k: "cropDrag"; eId: string; instanceId: string; sp: Pt; origin: R; bed: R }
  | { k: "cropResize"; eId: string; instanceId: string; dir: Dir; origin: R; bed: R };

function rectOf(el: GardenElement): R {
  return { x: el.x, y: el.y, w: el.widthM * PX_PER_M, h: el.heightM * PX_PER_M };
}

/** Convert a crop's metres-relative area into world px, defaulting to the full bed. */
/** Scale plant areas proportionally when their bed is resized. */
function scaleCropAreas(crops: CropAssignment[], sx: number, sy: number): CropAssignment[] {
  if (!crops.length || (sx === 1 && sy === 1)) return crops;
  return crops.map((c) => {
    if (!c.area) return c;
    return {
      ...c,
      area: { x: c.area.x * sx, y: c.area.y * sy, w: c.area.w * sx, h: c.area.h * sy },
    };
  });
}



function snapRect(moved: R, others: R[], anchor: R): { x: number; y: number; v: SnapLine[]; h: SnapLine[] } {
  const candX: Cand[] = [];
  const candY: Cand[] = [];
  for (const o of others) {
    candX.push(...xCands(moved, o));
    candY.push(...yCands(moved, o));
  }
  let nx = moved.x;
  let ny = moved.y;
  let v: SnapLine[] = [];
  let h: SnapLine[] = [];
  let bestX = SNAP;
  let bestY = SNAP;
  for (const c of candX) {
    const d = Math.abs(c.at - moved.x);
    if (d < bestX) {
      bestX = d; nx = c.at;
      v = [{ at: c.center ? c.at + moved.w / 2 : c.at, center: c.center, ...guideExtent({ x: moved.x, y: anchor.y, w: moved.w, h: anchor.h }, c.o, "y", c.center) }];
    }
  }
  for (const c of candY) {
    const d = Math.abs(c.at - moved.y);
    if (d < bestY) {
      bestY = d; ny = c.at;
      h = [{ at: c.center ? c.at + moved.h / 2 : c.at, center: c.center, ...guideExtent({ x: anchor.x, y: moved.y, w: anchor.w, h: moved.h }, c.o, "x", c.center) }];
    }
  }
  return { x: nx, y: ny, v, h };
}

function resizeRect(origin: R, dir: Dir, p: Pt): R {
  let x = origin.x;
  let y = origin.y;
  let w = origin.w;
  let h = origin.h;
  if (dir.includes("e")) w = p.x - x;
  if (dir.includes("w")) w = x + origin.w - p.x;
  if (dir.includes("s")) h = p.y - y;
  if (dir.includes("n")) h = y + origin.h - p.y;
  w = Math.max(MIN, Math.round(w));
  h = Math.max(MIN, Math.round(h));
  if (dir.includes("e")) x = origin.x;
  if (dir.includes("w")) x = origin.x + origin.w - w;
  if (dir.includes("s")) y = origin.y;
  if (dir.includes("n")) y = origin.y + origin.h - h;
  return { x, y, w, h };
}

/** Snap the resize so the dragged edge(s) align with other elements' edges and centres. */
function snapResize(rect: R, dir: Dir, anchor: R, others: R[]): { r: R; v: SnapLine[]; h: SnapLine[] } {
  let { x, y, w, h } = rect;
  const vGuides: SnapLine[] = [];
  const hGuides: SnapLine[] = [];
  const candX: Cand[] = [];
  const candY: Cand[] = [];
  for (const o of others) {
    candX.push({ at: o.x, center: false, o }, { at: o.x + o.w, center: false, o }, { at: o.x + o.w / 2, center: true, o });
    candY.push({ at: o.y, center: false, o }, { at: o.y + o.h, center: false, o }, { at: o.y + o.h / 2, center: true, o });
  }
  const fixedRight = anchor.x + anchor.w;
  const fixedBottom = anchor.y + anchor.h;

  if (dir.includes("e")) {
    const target = x + w;
    let best = SNAP, s: Cand | null = null;
    for (const c of candX) { const d = Math.abs(c.at - target); if (d < best) { best = d; s = c; } }
    if (s !== null) {
      w = Math.max(MIN, s.at - x);
      vGuides.push({ at: x + w, center: s.center, ...guideExtent({ x, y, w, h }, s.o, "y", s.center) });
    }
  }
  if (dir.includes("w")) {
    const target = x;
    let best = SNAP, s: Cand | null = null;
    for (const c of candX) { const d = Math.abs(c.at - target); if (d < best) { best = d; s = c; } }
    if (s !== null) {
      x = Math.min(s.at, fixedRight - MIN); w = fixedRight - x;
      vGuides.push({ at: x, center: s.center, ...guideExtent({ x, y, w, h }, s.o, "y", s.center) });
    }
  }
  if (dir.includes("s")) {
    const target = y + h;
    let best = SNAP, s: Cand | null = null;
    for (const c of candY) { const d = Math.abs(c.at - target); if (d < best) { best = d; s = c; } }
    if (s !== null) {
      h = Math.max(MIN, s.at - y);
hGuides.push({ at: y + h, center: s.center, ...guideExtent({ x, y, w, h }, s.o, "x", s.center) });
    }
  }
  if (dir.includes("n")) {
    const target = y;
    let best = SNAP, s: Cand | null = null;
    for (const c of candY) { const d = Math.abs(c.at - target); if (d < best) { best = d; s = c; } }
    if (s !== null) {
      y = Math.min(s.at, fixedBottom - MIN); h = fixedBottom - y;
hGuides.push({ at: y, center: s.center, ...guideExtent({ x, y, w, h }, s.o, "x", s.center) });
    }
  }
  return { r: { x, y, w, h }, v: vGuides, h: hGuides };
}

const CROP_GRID = 5; // 5px == 5cm fine grid when nothing else snaps

/** Perpendicular extent (a..b) for a guide line joining rects `m` and `o`.
 *  For a centre snap the line spans only the overlap, so it appears at / through
 *  the objects' centres; for an edge snap it spans the full union of the two. */
function guideExtent(m: R, o: R, perpendicular: "x" | "y", useOverlap: boolean): { a: number; b: number } {
  const ma = perpendicular === "x" ? m.x : m.y;
  const ms = ma + (perpendicular === "x" ? m.w : m.h);
  const oa = perpendicular === "x" ? o.x : o.y;
  const os = oa + (perpendicular === "x" ? o.w : o.h);
  if (useOverlap) {
    const a = Math.max(ma, oa);
    const b = Math.min(ms, os);
    if (a < b) return { a, b };
  }
  return { a: Math.min(ma, oa), b: Math.max(ms, os) };
}

interface Cand {
  at: number;
  center: boolean;
  o: R;
}

/** Snap candidates for aligning the moving rect `m` against a target rect `o`,
 *  covering edge/edge, edge/centre and centre/centre (x axis). */
function xCands(m: R, o: R): Cand[] {
  return [
    { at: o.x, center: false, o }, // m.left  -> o.left
    { at: o.x + o.w, center: false, o }, // m.left  -> o.right
    { at: o.x + o.w - m.w, center: false, o }, // m.right -> o.right
    { at: o.x - m.w, center: false, o }, // m.right -> o.left
    { at: o.x + (o.w - m.w) / 2, center: true, o }, // m.cx -> o.cx
    { at: o.x + o.w / 2, center: true, o }, // m.left  -> o.cx
    { at: o.x + o.w / 2 - m.w, center: true, o }, // m.right -> o.cx
    { at: o.x - m.w / 2, center: false, o }, // m.cx -> o.left
    { at: o.x + o.w - m.w / 2, center: false, o }, // m.cx -> o.right
  ];
}
function yCands(m: R, o: R): Cand[] {
  return [
    { at: o.y, center: false, o },
    { at: o.y + o.h, center: false, o },
    { at: o.y + o.h - m.h, center: false, o },
    { at: o.y - m.h, center: false, o },
    { at: o.y + (o.h - m.h) / 2, center: true, o },
    { at: o.y + o.h / 2, center: true, o },
    { at: o.y + o.h / 2 - m.h, center: true, o },
    { at: o.y - m.h / 2, center: false, o },
    { at: o.y + o.h - m.h / 2, center: false, o },
  ];
}

/** Snap a plant rectangle being dragged.
 * Targets are ONLY the parent bed and the plant's own siblings plus a fine grid
 * (never unrelated elements). Supports edge and centre snapping:
 *  - plant edges  -> parent/sibling edges
 *  - plant edges  -> parent/sibling centre lines
 *  - plant centre -> parent/sibling centres
 */
function snapCropRect(moved: R, bed: R, others: R[], anchor: R): { x: number; y: number; v: SnapLine[]; h: SnapLine[] } {
  const candX: Cand[] = [];
  const candY: Cand[] = [];
  const push = (o: R) => {
    candX.push(...xCands(moved, o));
    candY.push(...yCands(moved, o));
  };
  push(bed);
  for (const o of others) push(o);
  let nx = moved.x, ny = moved.y;
  let vGrp: SnapLine[] = [], hGrp: SnapLine[] = [];
  let bestX = SNAP, bestY = SNAP;
  for (const c of candX) {
    const d = Math.abs(c.at - moved.x);
    if (d < bestX) {
      bestX = d; nx = c.at;
      vGrp = [{ at: c.center ? c.at + moved.w / 2 : c.at, center: c.center, ...guideExtent({ x: moved.x, y: anchor.y, w: moved.w, h: anchor.h }, c.o, "y", c.center) }];
    }
  }
  for (const c of candY) {
    const d = Math.abs(c.at - moved.y);
    if (d < bestY) {
      bestY = d; ny = c.at;
      hGrp = [{ at: c.center ? c.at + moved.h / 2 : c.at, center: c.center, ...guideExtent({ x: anchor.x, y: moved.y, w: anchor.w, h: moved.h }, c.o, "x", c.center) }];
    }
  }
  if (vGrp.length === 0) nx = Math.round(nx / CROP_GRID) * CROP_GRID;
  if (hGrp.length === 0) ny = Math.round(ny / CROP_GRID) * CROP_GRID;
  nx = Math.max(bed.x, Math.min(bed.x + bed.w - moved.w, nx));
  ny = Math.max(bed.y, Math.min(bed.y + bed.h - moved.h, ny));
  return { x: nx, y: ny, v: vGrp, h: hGrp };
}

/** Snap the dragged edge(s) of a plant resize to bed/sibling edges and centres. */
function snapCropResize(rect: R, dir: Dir, anchor: R, bed: R, others: R[]): { r: R; v: SnapLine[]; h: SnapLine[] } {
  let { x, y, w, h } = rect;
  const vGuides: SnapLine[] = [];
  const hGuides: SnapLine[] = [];
  const candX: Cand[] = [];
  const candY: Cand[] = [];
  for (const o of [bed, ...others]) {
    candX.push({ at: o.x, center: false, o }, { at: o.x + o.w, center: false, o }, { at: o.x + o.w / 2, center: true, o });
    candY.push({ at: o.y, center: false, o }, { at: o.y + o.h, center: false, o }, { at: o.y + o.h / 2, center: true, o });
  }
  const fixedRight = anchor.x + anchor.w;
  const fixedBottom = anchor.y + anchor.h;

  if (dir.includes("e")) {
    const target = x + w;
    let best = SNAP, s: Cand | null = null;
    for (const c of candX) { const d = Math.abs(c.at - target); if (d < best) { best = d; s = c; } }
    if (s !== null) { w = Math.max(MIN, s.at - x); vGuides.push({ at: x + w, center: s.center, ...guideExtent({ x, y, w, h }, s.o, "y", s.center) }); }
    else w = Math.max(MIN, Math.round(w / CROP_GRID) * CROP_GRID);
  }
  if (dir.includes("w")) {
    const target = x;
    let best = SNAP, s: Cand | null = null;
    for (const c of candX) { const d = Math.abs(c.at - target); if (d < best) { best = d; s = c; } }
    if (s !== null) { x = Math.min(s.at, fixedRight - MIN); w = fixedRight - x; vGuides.push({ at: x, center: s.center, ...guideExtent({ x, y, w, h }, s.o, "y", s.center) }); }
    else { x = Math.round(x / CROP_GRID) * CROP_GRID; w = fixedRight - x; }
  }
  if (dir.includes("s")) {
    const target = y + h;
    let best = SNAP, s: Cand | null = null;
    for (const c of candY) { const d = Math.abs(c.at - target); if (d < best) { best = d; s = c; } }
    if (s !== null) { h = Math.max(MIN, s.at - y); hGuides.push({ at: y + h, center: s.center, ...guideExtent({ x, y, w, h }, s.o, "x", s.center) }); }
    else h = Math.max(MIN, Math.round(h / CROP_GRID) * CROP_GRID);
  }
  if (dir.includes("n")) {
    const target = y;
    let best = SNAP, s: Cand | null = null;
    for (const c of candY) { const d = Math.abs(c.at - target); if (d < best) { best = d; s = c; } }
    if (s !== null) { y = Math.min(s.at, fixedBottom - MIN); h = fixedBottom - y; hGuides.push({ at: y, center: s.center, ...guideExtent({ x, y, w, h }, s.o, "x", s.center) }); }
    else { y = Math.round(y / CROP_GRID) * CROP_GRID; h = fixedBottom - y; }
  }
  w = Math.max(MIN, w);
  h = Math.max(MIN, h);
  if (x < bed.x) { w = Math.max(MIN, w - (bed.x - x)); x = bed.x; }
  if (y < bed.y) { h = Math.max(MIN, h - (bed.y - y)); y = bed.y; }
  if (x + w > bed.x + bed.w) w = Math.max(MIN, bed.x + bed.w - x);
  if (y + h > bed.y + bed.h) h = Math.max(MIN, bed.y + bed.h - y);
  return {
    r: { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) },
    v: vGuides,
    h: hGuides,
  };
}

function dirCursor(dir: Dir): string {
  switch (dir) {
    case "n": case "s": return "ns-resize";
    case "e": case "w": return "ew-resize";
    case "ne": case "sw": return "nesw-resize";
    case "nw": case "se": return "nwse-resize";
    default: return "default";
  }
}

export function GpuCanvas({
  elements,
  catalog,
  tool,
  frameType,
  selectedIds,
  selectedCropId,
  theme,
  onSelect,
  onSelectCrop,
  onApplyChanges,
  onAddFrame,
  onUpdateCrop,
  onBusyChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gpuRef = useRef<HTMLCanvasElement | null>(null);
  const ovRef = useRef<HTMLCanvasElement | null>(null);

  const propsRef = useRef({ elements, tool, frameType, selectedIds, selectedCropId, theme, catalog });
  propsRef.current = { elements, tool, frameType, selectedIds, selectedCropId, theme, catalog };
  const handlersRef = useRef({ onSelect, onSelectCrop, onApplyChanges, onAddFrame, onUpdateCrop, onBusyChange });
  handlersRef.current = { onSelect, onSelectCrop, onApplyChanges, onAddFrame, onUpdateCrop, onBusyChange };

  const camRef = useRef<Cam>({ x: 0, y: 0, zoom: 1 });
  const draftRef = useRef<Map<string, R>>(new Map());
  /** live crop-area rects keyed by instanceId, in world px (only during a crop gesture). */
  const cropDraftRef = useRef<Map<string, R>>(new Map());
  const guidesRef = useRef<SnapGuides>({ v: [], h: [] });
  const cropGuidesRef = useRef<SnapGuides>({ v: [], h: [] });
  /** last pointer position (screen-local) for hover highlighting. */
  const mouseRef = useRef<Pt>({ x: 0, y: 0 });
  const spaceRef = useRef(false);
  const gRef = useRef<Gesture>({ k: "none" });
  const hostSize = useRef({ w: 0, h: 0 });
  const wasEmptyClickRef = useRef(false);

  const screenToLocal = (e: { clientX: number; clientY: number }): Pt => {
    const el = gpuRef.current ?? hostRef.current;
    const r = el!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const worldToScreen = (p: Pt, c: Cam): Pt => ({ x: p.x * c.zoom + c.x, y: p.y * c.zoom + c.y });
  const screenToWorld = (s: Pt, c: Cam): Pt => ({ x: (s.x - c.x) / c.zoom, y: (s.y - c.y) / c.zoom });

  const doBusy = (b: boolean) => handlersRef.current.onBusyChange?.(b);

  const fitView = useCallback(() => {
    const rect = hostRef.current?.getBoundingClientRect();
    const vw = rect?.width || 800;
    const vh = rect?.height || 600;
    const els = propsRef.current.elements;
    if (els.length === 0) {
      camRef.current = { x: 0, y: 0, zoom: 1 };
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of els) {
      const r = rectOf(e);
      minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
    }
    const margin = 70;
    const bw = maxX - minX + margin * 2;
    const bh = maxY - minY + margin * 2;
    let zoom = Math.min(vw / (bw || 1), vh / (bh || 1));
    zoom = Math.max(0.1, Math.min(zoom, 1.5));
    camRef.current = {
      x: (vw - bw * zoom) / 2 - minX * zoom + margin * zoom,
      y: (vh - bh * zoom) / 2 - minY * zoom + margin * zoom,
      zoom,
    };
  }, []);

  // ---- hit testing ----
  const unionOfSelected = (): R | null => {
    const p = propsRef.current;
    if (p.selectedIds.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of p.selectedIds) {
      const el = p.elements.find((e) => e.id === id);
      if (!el) return null;
      const r = draftRef.current.get(id) ?? rectOf(el);
      minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  };

  const hitHandle = (sp: Pt, c: Cam): Dir | null => {
    const p = propsRef.current;
    if (p.selectedIds.length === 0 || p.tool !== "select") return null;
    const union = unionOfSelected();
    if (!union) return null;
    const p0 = worldToScreen({ x: union.x, y: union.y }, c);
    const p1 = worldToScreen({ x: union.x + union.w, y: union.y + union.h }, c);
    const corners: [Dir, number, number][] = [
      ["nw", p0.x, p0.y], ["ne", p1.x, p0.y], ["sw", p0.x, p1.y], ["se", p1.x, p1.y],
    ];
    for (const [dir, hx, hy] of corners) {
      if (Math.abs(sp.x - hx) <= HANDLE_HIT && Math.abs(sp.y - hy) <= HANDLE_HIT) return dir;
    }
    // whole edge is a resize target (band a few px thick along each side)
    const inX = sp.x >= p0.x - EDGE_HIT && sp.x <= p1.x + EDGE_HIT;
    const inY = sp.y >= p0.y - EDGE_HIT && sp.y <= p1.y + EDGE_HIT;
    if (inX && sp.y >= p0.y - EDGE_HIT && sp.y <= p0.y + EDGE_HIT) return "n";
    if (inX && sp.y >= p1.y - EDGE_HIT && sp.y <= p1.y + EDGE_HIT) return "s";
    if (inY && sp.x >= p0.x - EDGE_HIT && sp.x <= p0.x + EDGE_HIT) return "w";
    if (inY && sp.x >= p1.x - EDGE_HIT && sp.x <= p1.x + EDGE_HIT) return "e";
    return null;
  };

  const hitItem = (wp: Pt): GardenElement | null => {
    const els = propsRef.current.elements;
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i];
      const r = draftRef.current.get(el.id) ?? rectOf(el);
      if (wp.x >= r.x && wp.x <= r.x + r.w && wp.y >= r.y && wp.y <= r.y + r.h) return el;
    }
    return null;
  };

  // Editing plants is only possible when exactly one bed is selected.
  const selectedBedEl = (): GardenElement | null => {
    const p = propsRef.current;
    if (p.tool !== "select" || p.selectedIds.length !== 1) return null;
    const el = p.elements.find((e) => e.id === p.selectedIds[0]);
    return el && el.type === "bed" ? el : null;
  };

  // Resolve a plant's world rect. Prefers the live crop-draft; otherwise builds
  // from the bed's *live* draft position so plants follow their parent while it
  // is being dragged or resized.
  const cropRectOf = (bed: GardenElement, a: CropAssignment): R => {
    const live = cropDraftRef.current.get(a.instanceId);
    if (live) return live;
    const base = draftRef.current.get(bed.id) ?? rectOf(bed);
    const ar = a.area ?? { x: 0, y: 0, w: bed.widthM, h: bed.heightM };
    return {
      x: base.x + ar.x * PX_PER_M,
      y: base.y + ar.y * PX_PER_M,
      w: ar.w * PX_PER_M,
      h: ar.h * PX_PER_M,
    };
  };

  // corner-handle hit on any crop of the selected bed
  const hitCropHandle = (
    sp: Pt,
    c: Cam,
    bed: GardenElement
  ): { a: CropAssignment; dir: Dir } | null => {
    const p = propsRef.current;
    for (const a of bed.crops) {
      const r = cropRectOf(bed, a);
      const p0 = worldToScreen({ x: r.x, y: r.y }, c);
      const p1 = worldToScreen({ x: r.x + r.w, y: r.y + r.h }, c);
      // corner handles work on any plant
      const corners: [Dir, number, number][] = [
        ["nw", p0.x, p0.y], ["ne", p1.x, p0.y], ["sw", p0.x, p1.y], ["se", p1.x, p1.y],
      ];
      for (const [dir, hx, hy] of corners) {
        if (Math.abs(sp.x - hx) <= HANDLE_HIT && Math.abs(sp.y - hy) <= HANDLE_HIT)
          return { a, dir };
      }
      // edge resize: only on the selected plant (or a lone plant) so grabbing a
      // border resizes it instead of dragging a neighbouring plant.
      const isSel = p.selectedCropId === a.instanceId;
      if (isSel || bed.crops.length === 1) {
        const inX = sp.x >= p0.x - EDGE_HIT && sp.x <= p1.x + EDGE_HIT;
        const inY = sp.y >= p0.y - EDGE_HIT && sp.y <= p1.y + EDGE_HIT;
        if (inX && sp.y >= p0.y - EDGE_HIT && sp.y <= p0.y + EDGE_HIT) return { a, dir: "n" };
        if (inX && sp.y >= p1.y - EDGE_HIT && sp.y <= p1.y + EDGE_HIT) return { a, dir: "s" };
        if (inY && sp.x >= p0.x - EDGE_HIT && sp.x <= p0.x + EDGE_HIT) return { a, dir: "w" };
        if (inY && sp.x >= p1.x - EDGE_HIT && sp.x <= p1.x + EDGE_HIT) return { a, dir: "e" };
      }
    }
    return null;
  };

  const hitCrop = (wp: Pt, bed: GardenElement): CropAssignment | null => {
    for (let i = bed.crops.length - 1; i >= 0; i--) {
      const a = bed.crops[i];
      const r = cropRectOf(bed, a);
      if (wp.x >= r.x && wp.x <= r.x + r.w && wp.y >= r.y && wp.y <= r.y + r.h) return a;
    }
    return null;
  };

  const bedRefOf = (bed: GardenElement): R => {
    const r = draftRef.current.get(bed.id) ?? rectOf(bed);
    return { x: r.x, y: r.y, w: bed.widthM * PX_PER_M, h: bed.heightM * PX_PER_M };
  };

  // ---- gestures ----
  const onPointerDown = (e: React.PointerEvent) => {
    const sp = screenToLocal(e);
    const c = camRef.current;
    const p = propsRef.current;
    // middle mouse always pans
    if (e.button === 1) {
      wasEmptyClickRef.current = false;
      gRef.current = { k: "pan", sx: sp.x, sy: sp.y, ox: c.x, oy: c.y };
      e.currentTarget.setPointerCapture(e.pointerId);
      doBusy(true);
      return;
    }
    if (e.button !== 0) return;
    // Space, the "move" tool, and the frame-drawing for "frame" tool.
    if (p.tool === "move" || spaceRef.current) {
      // move tool = pan the camera only; it never moves objects
      wasEmptyClickRef.current = false;
      gRef.current = { k: "pan", sx: sp.x, sy: sp.y, ox: c.x, oy: c.y };
      e.currentTarget.setPointerCapture(e.pointerId);
      doBusy(true);
      return;
    }
    if (p.tool === "frame") {
      const start = screenToWorld(sp, c);
      gRef.current = { k: "frame", start, end: start };
      e.currentTarget.setPointerCapture(e.pointerId);
      doBusy(true);
      return;
    }
    // "select/edit" tool: select, move and resize.
    // Plants inside a fully-selected bed take priority over the bed itself.
    const bedSel = selectedBedEl();
    if (bedSel && bedSel.crops.length > 0) {
      const cHandle = hitCropHandle(sp, c, bedSel);
      if (cHandle) {
        handlersRef.current.onSelectCrop(cHandle.a.instanceId);
        gRef.current = {
          k: "cropResize",
          eId: bedSel.id,
          instanceId: cHandle.a.instanceId,
          dir: cHandle.dir,
          origin: cropRectOf(bedSel, cHandle.a),
          bed: bedRefOf(bedSel),
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        doBusy(true);
        return;
      }
      const cHit = hitCrop(screenToWorld(sp, c), bedSel);
      if (cHit) {
        handlersRef.current.onSelectCrop(cHit.instanceId);
        gRef.current = {
          k: "cropDrag",
          eId: bedSel.id,
          instanceId: cHit.instanceId,
          sp,
          origin: cropRectOf(bedSel, cHit),
          bed: bedRefOf(bedSel),
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        doBusy(true);
        return;
      }
      // clicked on bed area but outside any plant -> drop plant selection
      handlersRef.current.onSelectCrop(null);
    }
    const dir = hitHandle(sp, c);
    if (dir && p.selectedIds.length > 0) {
      const origins = new Map<string, R>();
      for (const id of p.selectedIds) {
        const el = p.elements.find((e) => e.id === id)!;
        origins.set(id, draftRef.current.get(id) ?? rectOf(el));
      }
      gRef.current = {
        k: "groupResize",
        ids: p.selectedIds,
        dir,
        union: unionOfSelected()!,
        origins,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      doBusy(true);
      return;
    }
    const hit = hitItem(screenToWorld(sp, c));
    if (hit) {
      if (p.selectedIds.includes(hit.id)) {
        const origins = new Map<string, R>();
        for (const id of p.selectedIds) {
          const el = p.elements.find((e) => e.id === id)!;
          origins.set(id, draftRef.current.get(id) ?? rectOf(el));
        }
        gRef.current = { k: "groupDrag", ids: p.selectedIds, sp, origins, leadId: hit.id };
      } else {
        handlersRef.current.onSelect([hit.id]);
        handlersRef.current.onSelectCrop(null);
        const origin = draftRef.current.get(hit.id) ?? rectOf(hit);
        gRef.current = { k: "drag", id: hit.id, sp, origin };
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      doBusy(true);
      return;
    }
    // empty space: always a selection box (marquee) in edit mode. A plain click
    // (no drag) deselects; dragging selects everything it intersects.
    gRef.current = { k: "marquee", start: sp, end: sp };
    e.currentTarget.setPointerCapture(e.pointerId);
    doBusy(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gRef.current;
    if (g.k === "none") {
      const sp = screenToLocal(e);
      mouseRef.current = sp;
      const c = camRef.current;
      const p = propsRef.current;
      let cur = "default";
      if (p.tool === "move" || spaceRef.current) {
        cur = spaceRef.current ? "grabbing" : "grab";
      } else if (p.tool === "select") {
        const bedSel = selectedBedEl();
        if (bedSel && bedSel.crops.length > 0) {
          const ch = hitCropHandle(sp, c, bedSel);
          if (ch) cur = dirCursor(ch.dir);
          else if (hitCrop(screenToWorld(sp, c), bedSel)) cur = "move";
        }
        if (cur === "default") {
          const dir = hitHandle(sp, c);
          if (dir) cur = dirCursor(dir);
          else if (hitItem(screenToWorld(sp, c))) cur = "move";
        }
      } else if (p.tool === "frame") {
        cur = "crosshair";
      }
      if (hostRef.current) hostRef.current.style.cursor = cur;
      return;
    }
    const sp = screenToLocal(e);
    const c = camRef.current;
    if (g.k === "pan") {
      camRef.current = { ...c, x: g.ox + (sp.x - g.sx), y: g.oy + (sp.y - g.sy) };
      if (wasEmptyClickRef.current && (Math.abs(sp.x - g.sx) > 4 || Math.abs(sp.y - g.sy) > 4)) {
        wasEmptyClickRef.current = false;
      }
      return;
    }
    if (g.k === "drag") {
      const wcur = screenToWorld(sp, c);
      const wstart = screenToWorld(g.sp, c);
      const moved: R = {
        x: g.origin.x + (wcur.x - wstart.x),
        y: g.origin.y + (wcur.y - wstart.y),
        w: g.origin.w,
        h: g.origin.h,
      };
      const others = propsRef.current.elements
        .filter((el) => el.id !== g.id)
        .map((el) => draftRef.current.get(el.id) ?? rectOf(el));
      const res = snapRect(moved, others, g.origin);
      draftRef.current.set(g.id, { x: res.x, y: res.y, w: moved.w, h: moved.h });
      guidesRef.current = { v: res.v, h: res.h };
      return;
    }
    if (g.k === "frame") {
      gRef.current = { ...g, end: screenToWorld(sp, c) };
      return;
    }
    if (g.k === "marquee") {
      gRef.current = { ...g, end: sp };
      return;
    }
    if (g.k === "groupDrag") {
      const wcur = screenToWorld(sp, c);
      const wstart = screenToWorld(g.sp, c);
      const ddx = wcur.x - wstart.x;
      const ddy = wcur.y - wstart.y;
      const lead = g.origins.get(g.leadId)!;
      const movedLead: R = { x: lead.x + ddx, y: lead.y + ddy, w: lead.w, h: lead.h };
      const sel = new Set(g.ids);
      const others = propsRef.current.elements
        .filter((el) => !sel.has(el.id))
        .map((el) => draftRef.current.get(el.id) ?? rectOf(el));
      const res = snapRect(movedLead, others, lead);
      const fx = res.x - lead.x;
      const fy = res.y - lead.y;
      for (const [id, o] of g.origins) {
        draftRef.current.set(id, { x: o.x + fx, y: o.y + fy, w: o.w, h: o.h });
      }
      guidesRef.current = { v: res.v, h: res.h };
      return;
    }
    if (g.k === "groupResize") {
      const wcur = screenToWorld(sp, c);
      const nr = resizeRect(g.union, g.dir, wcur);
      const sel = new Set(g.ids);
      const others = propsRef.current.elements
        .filter((el) => !sel.has(el.id))
        .map((el) => draftRef.current.get(el.id) ?? rectOf(el));
      const sn = snapResize(nr, g.dir, g.union, others);
      const fx = sn.r.w / g.union.w;
      const fy = sn.r.h / g.union.h;
      for (const [id, o] of g.origins) {
        const nx = sn.r.x + (o.x - g.union.x) * fx;
        const ny = sn.r.y + (o.y - g.union.y) * fy;
        draftRef.current.set(id, {
          x: Math.round(nx),
          y: Math.round(ny),
          w: Math.max(MIN, Math.round(o.w * fx)),
          h: Math.max(MIN, Math.round(o.h * fy)),
        });
      }
      guidesRef.current = { v: sn.v, h: sn.h };
      return;
    }
    if (g.k === "cropDrag") {
      const wcur = screenToWorld(sp, c);
      const wstart = screenToWorld(g.sp, c);
      const bed = propsRef.current.elements.find((e) => e.id === g.eId);
      const moved: R = {
        x: g.origin.x + (wcur.x - wstart.x),
        y: g.origin.y + (wcur.y - wstart.y),
        w: g.origin.w,
        h: g.origin.h,
      };
      const others: R[] = bed
        ? bed.crops
            .filter((a) => a.instanceId !== g.instanceId)
            .map((a) => cropRectOf(bed, a))
        : [];
      const res = snapCropRect(moved, g.bed, others, g.origin);
      cropDraftRef.current.set(g.instanceId, {
        x: Math.round(res.x),
        y: Math.round(res.y),
        w: g.origin.w,
        h: g.origin.h,
      });
      cropGuidesRef.current = { v: res.v, h: res.h };
      return;
    }
    if (g.k === "cropResize") {
      const wcur = screenToWorld(sp, c);
      const bed = propsRef.current.elements.find((e) => e.id === g.eId);
      const others: R[] = bed
        ? bed.crops
            .filter((a) => a.instanceId !== g.instanceId)
            .map((a) => cropRectOf(bed, a))
        : [];
      const nr = resizeRect(g.origin, g.dir, wcur);
      const sn = snapCropResize(nr, g.dir, g.origin, g.bed, others);
      cropDraftRef.current.set(g.instanceId, sn.r);
      cropGuidesRef.current = { v: sn.v, h: sn.h };
      return;
    }
  };

  const onPointerUp = () => {
    const g = gRef.current;
    doBusy(false);
    if (g.k === "drag") {
      const r = draftRef.current.get(g.id);
      if (r) handlersRef.current.onApplyChanges([{ id: g.id, x: Math.round(r.x), y: Math.round(r.y) }]);
      draftRef.current.delete(g.id);
      guidesRef.current = { v: [], h: [] };
    } else if (g.k === "groupDrag") {
      const updates: ElementUpdate[] = [];
      for (const id of g.ids) {
        const r = draftRef.current.get(id);
        if (r) updates.push({ id, x: Math.round(r.x), y: Math.round(r.y) });
        draftRef.current.delete(id);
      }
      if (updates.length > 0) handlersRef.current.onApplyChanges(updates);
      guidesRef.current = { v: [], h: [] };
    } else if (g.k === "groupResize") {
      const updates: ElementUpdate[] = [];
      for (const id of g.ids) {
        const r = draftRef.current.get(id);
        if (r) {
          const u: ElementUpdate = {
            id,
            x: Math.round(r.x),
            y: Math.round(r.y),
            widthM: r.w / PX_PER_M,
            heightM: r.h / PX_PER_M,
          };
          const org = g.origins.get(id);
          const el = propsRef.current.elements.find((e) => e.id === id);
          if (
            el &&
            el.type === "bed" &&
            el.crops.length > 0 &&
            org &&
            org.w > 0 &&
            org.h > 0
          ) {
            u.crops = scaleCropAreas(el.crops, r.w / org.w, r.h / org.h);
          }
          updates.push(u);
        }
        draftRef.current.delete(id);
      }
      if (updates.length > 0) handlersRef.current.onApplyChanges(updates);
      guidesRef.current = { v: [], h: [] };
    } else if (g.k === "marquee") {
      const p = propsRef.current;
      const a = screenToWorld(g.start, camRef.current);
      const b = screenToWorld(g.end, camRef.current);
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x);
      const h = Math.abs(b.y - a.y);
      if (w > 2 && h > 2) {
        const found = p.elements
          .filter((el) => {
            const r = rectOf(el);
            return r.x + r.w >= x && r.x <= x + w && r.y + r.h >= y && r.y <= y + h;
          })
          .map((el) => el.id);
        handlersRef.current.onSelect(found);
      } else {
        handlersRef.current.onSelect([]);
        handlersRef.current.onSelectCrop(null);
      }
    } else if (g.k === "pan") {
      if (wasEmptyClickRef.current) {
        handlersRef.current.onSelect([]);
        handlersRef.current.onSelectCrop(null);
      }
      wasEmptyClickRef.current = false;
    } else if (g.k === "cropDrag" || g.k === "cropResize") {
      const r = cropDraftRef.current.get(g.instanceId);
      const bed = propsRef.current.elements.find((e) => e.id === g.eId);
      if (r && bed) {
        let ar = {
          x: (r.x - bed.x) / PX_PER_M,
          y: (r.y - bed.y) / PX_PER_M,
          w: r.w / PX_PER_M,
          h: r.h / PX_PER_M,
        };
        ar.x = Math.round(ar.x * 100) / 100;
        ar.y = Math.round(ar.y * 100) / 100;
        ar.w = Math.round(ar.w * 100) / 100;
        ar.h = Math.round(ar.h * 100) / 100;
        handlersRef.current.onUpdateCrop(g.eId, g.instanceId, { area: ar });
      }
      cropDraftRef.current.delete(g.instanceId);
      cropGuidesRef.current = { v: [], h: [] };
      guidesRef.current = { v: [], h: [] };
    } else if (g.k === "frame") {
      const p = propsRef.current;
      const end = g.end;
      const x = Math.min(g.start.x, end.x);
      const y = Math.min(g.start.y, end.y);
      const w = Math.abs(end.x - g.start.x);
      const h = Math.abs(end.y - g.start.y);
      if (w > MIN && h > MIN) {
        const wM = Math.max(0.05, Math.round((w / PX_PER_M) * 20) / 20);
        const hM = Math.max(0.05, Math.round((h / PX_PER_M) * 20) / 20);
        handlersRef.current.onAddFrame(p.frameType, Math.round(x), Math.round(y), wM, hM);
      }
    }
    gRef.current = { k: "none" };
    if (hostRef.current) hostRef.current.style.cursor = "default";
  };

// Init renderer, observer, fit view, render loop.
  useEffect(() => {
    const host_ = hostRef.current;
    const gpu = gpuRef.current;
    const ov = ovRef.current;
    if (!host_ || !gpu || !ov) return;

    const renderer = new GpuRenderer(gpu);
    const ctx = ov.getContext("2d")!;
    let raf = 0;
    let fitted = false;

    const bg = (th: "light" | "dark") => (th === "dark" ? "#13161b" : "#eef1f5");
    const accent = (th: "light" | "dark") => (th === "dark" ? "#6fd6a4" : "#1f7a4c");

    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      hostSize.current = { w: r.width, h: r.height };
      ov.width = Math.max(1, Math.round(r.width));
      ov.height = Math.max(1, Math.round(r.height));
      renderer.resize(r.width, r.height);
      if (!fitted) {
        fitted = true;
        fitView();
      }
    });
    ro.observe(host_);
    renderer.resize(gpu.clientWidth, gpu.clientHeight);

    const draw = () => {
      const p = propsRef.current;
      const c = camRef.current;
      const { w, h } = hostSize.current;
      if (w === 0 || h === 0) return;

      const items: DrawItem[] = [];
      for (const el of p.elements) {
        const r = draftRef.current.get(el.id) ?? rectOf(el);
        items.push({ rect: r, color: el.color, selected: false });
      }
      renderer.render(items, c, bg(p.theme));

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // plant rectangles drawn inside each bed (colour-coded per catalog crop)
      const colorMap = new Map<string, string>();
      const nameMap = new Map<string, string>();
      for (const cr of p.catalog) {
        colorMap.set(cr.id, cr.color);
        nameMap.set(cr.id, cr.name);
      }
      // which plant is under the pointer (only meaningful inside the selected bed)
      let hoverCropId: string | null = null;
      {
        const bedSel = selectedBedEl();
        if (bedSel && bedSel.crops.length > 0) {
          const hc = hitCrop(screenToWorld(mouseRef.current, c), bedSel);
          if (hc) hoverCropId = hc.instanceId;
        }
      }
      for (const el of p.elements) {
        if (el.type !== "bed" || el.crops.length === 0) continue;
        for (const a of el.crops) {
          const r = cropRectOf(el, a);
          const p0 = worldToScreen({ x: r.x, y: r.y }, c);
          const p1 = worldToScreen({ x: r.x + r.w, y: r.y + r.h }, c);
          const bw = p1.x - p0.x;
          const bh = p1.y - p0.y;
          if (bw < 2 || bh < 2) continue;
          const col = colorMap.get(a.cropId) ?? "#9aa0a6";
          const isSel = p.selectedCropId === a.instanceId;
          const isHov = hoverCropId === a.instanceId;
          let fillAlpha = 0.22;
          if (isSel) fillAlpha = 0.42;
          else if (p.selectedCropId) fillAlpha = 0.10; // dim inactive plants once one is selected
          else if (isHov) fillAlpha = 0.32;
          ctx.globalAlpha = fillAlpha;
          ctx.fillStyle = col;
          ctx.fillRect(p0.x, p0.y, bw, bh);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = isSel || isHov ? col : "rgba(0,0,0,0.18)";
          ctx.lineWidth = isSel ? 2 : 1;
          ctx.strokeRect(p0.x + 0.5, p0.y + 0.5, bw - 1, bh - 1);
          if (bw >= 42 && bh >= 16) {
            const nm = nameMap.get(a.cropId) ?? "";
            if (nm) {
              const fs = Math.max(9, Math.min(12, 11 * c.zoom));
              ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillStyle = "rgba(255,255,255,0.9)";
              ctx.fillText(nm, p0.x + bw / 2, p0.y + bh / 2);
              ctx.textAlign = "left";
              ctx.textBaseline = "top";
            }
          }
        }
      }

      // labels
      for (const el of p.elements) {
        const r = draftRef.current.get(el.id) ?? rectOf(el);
        const p0 = worldToScreen({ x: r.x, y: r.y }, c);
        const p1 = worldToScreen({ x: r.x + r.w, y: r.y + r.h }, c);
        const bw = p1.x - p0.x;
        const bh = p1.y - p0.y;
        if (bw < 46 || bh < 22) continue;
        const fs = Math.max(9, Math.min(13, 12 * c.zoom));
        const sizeTxt = `${fmtM(el.widthM)} × ${fmtM(el.heightM)}`;
        ctx.textBaseline = "top";
        ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
        const nameW = ctx.measureText(el.label).width;
        const smallFs = Math.max(8, Math.min(10, 9 * c.zoom));
        ctx.font = `600 ${smallFs}px Inter, system-ui, sans-serif`;
        const sizeW = ctx.measureText(sizeTxt).width;
        const chipW = Math.max(nameW, sizeW) + 14;
        const hasSizeLine = bh >= 44;
        const chipH = hasSizeLine ? fs + smallFs + 10 : fs + 8;
        ctx.fillStyle = "rgba(255,255,255,0.82)";
        ctx.fillRect(p0.x + 3, p0.y + 3, Math.min(chipW, bw - 6), chipH);
        ctx.fillStyle = "#2d2a24";
        ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
        ctx.fillText(el.label, p0.x + 10, p0.y + 5 + (fs - 10) / 2);
        if (hasSizeLine) {
          ctx.fillStyle = "#6b6258";
          ctx.font = `600 ${smallFs}px Inter, system-ui, sans-serif`;
          ctx.fillText(sizeTxt, p0.x + 10, p0.y + 5 + fs + (smallFs - 8) / 2 + 2);
        }
      }

      // selected size label (Figma-style, below the selection's bounding box)
      if (p.selectedIds.length > 0) {
        const r = unionOfSelected();
        if (r) {
          const p0 = worldToScreen({ x: r.x, y: r.y }, c);
          const p1 = worldToScreen({ x: r.x + r.w, y: r.y + r.h }, c);
          const txt = `${fmtM(r.w / PX_PER_M)} × ${fmtM(r.h / PX_PER_M)}`;
          const fs = Math.max(10, Math.min(13, 11 * c.zoom));
          ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
          ctx.textBaseline = "top";
          const tw = ctx.measureText(txt).width + 16;
          const th = fs + 7;
          const y = p1.y + 8;
          const x = Math.max(2, Math.min(w - tw - 2, (p0.x + p1.x) / 2 - tw / 2));
          ctx.fillStyle = accent(p.theme);
          ctx.beginPath();
          ctx.roundRect(x, y, tw, th, 4);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.95)";
          ctx.textBaseline = "middle";
          ctx.fillText(txt, x + 8, y + th / 2 + 1);
        }
      }

      // snap guides (elements) — dashed for an edge snap, solid for a centre snap;
      // centre lines span the objects' overlap, edge lines span both.
      const drawGuide = (line: SnapLine, axis: "v" | "h") => {
        ctx.lineWidth = line.center ? 1.6 : 1;
        ctx.strokeStyle = "#f24822";
        ctx.setLineDash(line.center ? [] : [4, 4]);
        if (axis === "v") {
          const sx = worldToScreen({ x: line.at, y: 0 }, c).x;
          const ay = worldToScreen({ x: 0, y: line.a }, c).y;
          const by = worldToScreen({ x: 0, y: line.b }, c).y;
          ctx.beginPath();
          ctx.moveTo(sx, ay);
          ctx.lineTo(sx, by);
          ctx.stroke();
        } else {
          const sy = worldToScreen({ x: 0, y: line.at }, c).y;
          const ax = worldToScreen({ x: line.a, y: 0 }, c).x;
          const bx = worldToScreen({ x: line.b, y: 0 }, c).x;
          ctx.beginPath();
          ctx.moveTo(ax, sy);
          ctx.lineTo(bx, sy);
          ctx.stroke();
        }
      };
      for (const gv of guidesRef.current.v) drawGuide(gv, "v");
      for (const gh of guidesRef.current.h) drawGuide(gh, "h");
      ctx.setLineDash([]);
      {
        const cgg = cropGuidesRef.current;
        for (const gv of cgg.v) drawGuide(gv, "v");
        for (const gh of cgg.h) drawGuide(gh, "h");
        ctx.setLineDash([]);
      }

      // marquee (selection box) preview, in screen space
      if (gRef.current.k === "marquee") {
        const g = gRef.current as { k: "marquee"; start: Pt; end: Pt };
        const x = Math.min(g.start.x, g.end.x);
        const y = Math.min(g.start.y, g.end.y);
        const mw = Math.abs(g.end.x - g.start.x);
        const mh = Math.abs(g.end.y - g.start.y);
        ctx.strokeStyle = "#0d99ff";
        ctx.lineWidth = 1.5;
        ctx.fillStyle = "rgba(13,153,255,0.10)";
        ctx.fillRect(x, y, mw, mh);
        ctx.strokeRect(x, y, mw, mh);
      }

      // frame preview (drawing a new bed/path)
      if (gRef.current.k === "frame") {
        const g = gRef.current as { k: "frame"; start: Pt; end: Pt };
        const end = g.end;
        const p0 = worldToScreen(g.start, c);
        const p1 = worldToScreen(end, c);
        const x = Math.min(p0.x, p1.x);
        const y = Math.min(p0.y, p1.y);
        const w = Math.abs(p1.x - p0.x);
        const h = Math.abs(p1.y - p0.y);
        const fcol = p.frameType === "bed" ? accent(p.theme) : "#6b6258";
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = fcol;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = fcol;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        // live size label while drawing
        if (w > MIN && h > MIN) {
          const wM = Math.max(0.05, Math.round((w / PX_PER_M) * 20) / 20);
          const hM = Math.max(0.05, Math.round((h / PX_PER_M) * 20) / 20);
          const txt = `${fmtM(wM)} × ${fmtM(hM)}`;
          const fs = Math.max(10, Math.min(13, 11 * c.zoom));
          ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
          const tw = ctx.measureText(txt).width + 16;
          const th = fs + 7;
          const lx = x;
          const ly = y + h + 8;
          ctx.fillStyle = fcol;
          ctx.beginPath();
          ctx.roundRect(lx, ly, tw, th, 4);
          ctx.fill();
          ctx.fillStyle = "hsla(0,0%,100%,0.95)";
          ctx.textBaseline = "middle";
          ctx.fillText(txt, lx + 8, ly + th / 2 + 1);
          ctx.textBaseline = "top";
        }
      }

      // selected outline + handles (drawn around the union bounding box)
      if (p.tool === "select" && p.selectedIds.length > 0) {
        const r = unionOfSelected();
        if (r) {
          const p0 = worldToScreen({ x: r.x, y: r.y }, c);
          const p1 = worldToScreen({ x: r.x + r.w, y: r.y + r.h }, c);
          const w = p1.x - p0.x;
          const hgt = p1.y - p0.y;
          const col = accent(p.theme);
          const cxm = p0.x + w / 2;
          const cmy = p0.y + hgt / 2;
          // resize edges (thin lines we can grab for single-side resize)
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = col;
          ctx.strokeRect(p0.x, p0.y, w, hgt);
          // corner handles, kept near constant screen size (gentle zoom scaling)
          const hs = Math.max(4, Math.min(9, 5.5 * Math.pow(c.zoom, 0.35)));
          const hx = [p0.x, p1.x, p0.x, p1.x];
          const hy = [p0.y, p0.y, p1.y, p1.y];
          ctx.fillStyle = "rgba(255,255,255,0.95)";
          ctx.lineWidth = 1.25;
          ctx.strokeStyle = col;
          for (let i = 0; i < 4; i++) {
            ctx.fillRect(hx[i] - hs / 2, hy[i] - hs / 2, hs, hs);
            ctx.strokeRect(hx[i] - hs / 2, hy[i] - hs / 2, hs, hs);
          }
          // thin grabs on the 4 edges for single-side resizing
          const eb = 2.5;
          ctx.fillStyle = col;
          ctx.fillRect(cxm - eb / 2, p0.y, eb, 2); // n
          ctx.fillRect(cxm - eb / 2, p1.y - 2, eb, 2); // s
          ctx.fillRect(p0.x, cmy - eb / 2, 2, eb); // w
          ctx.fillRect(p1.x - 2, cmy - eb / 2, 2, eb); // e
        }
      }

      // plant handles: only the selected plant is fully highlighted
      if (p.tool === "select") {
        const bedEl = selectedBedEl();
        if (bedEl && bedEl.crops.length > 0) {
          const col = accent(p.theme);
          for (const a of bedEl.crops) {
            const isSel = p.selectedCropId === a.instanceId;
            const r = cropRectOf(bedEl, a);
            const p0 = worldToScreen({ x: r.x, y: r.y }, c);
            const p1 = worldToScreen({ x: r.x + r.w, y: r.y + r.h }, c);
            if (isSel) {
              ctx.strokeStyle = col;
              ctx.lineWidth = 2;
              ctx.strokeRect(p0.x + 1, p0.y + 1, p1.x - p0.x - 2, p1.y - p0.y - 2);
              const hs = Math.max(4, Math.min(8, 5.5 * Math.pow(c.zoom, 0.35)));
              const hx = [p0.x, p1.x, p0.x, p1.x];
              const hy = [p0.y, p0.y, p1.y, p1.y];
              ctx.fillStyle = "rgba(255,255,255,0.95)";
              ctx.lineWidth = 1.25;
              ctx.strokeStyle = col;
              for (let i = 0; i < 4; i++) {
                ctx.fillRect(hx[i] - hs / 2, hy[i] - hs / 2, hs, hs);
                ctx.strokeRect(hx[i] - hs / 2, hy[i] - hs / 2, hs, hs);
              }
              // crop size chip (kept near constant screen size)
              const txt = `${fmtM(r.w / PX_PER_M)} × ${fmtM(r.h / PX_PER_M)}`;
              const fs = Math.max(9, Math.min(13, 11 * c.zoom));
              ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
              const tw = ctx.measureText(txt).width + 16;
              const th = fs + 7;
              const cy = p1.y + 8;
              const cx = Math.max(2, Math.min(w - tw - 2, (p0.x + p1.x) / 2 - tw / 2));
              ctx.fillStyle = col;
              ctx.beginPath();
              ctx.roundRect(cx, cy, tw, th, 4);
              ctx.fill();
              ctx.fillStyle = "rgba(255,255,255,0.95)";
              ctx.textBaseline = "middle";
              ctx.fillText(txt, cx + 8, cy + th / 2 + 1);
              ctx.textBaseline = "top";
            } else if (!p.selectedCropId && hoverCropId === a.instanceId) {
              ctx.setLineDash([3, 3]);
              ctx.strokeStyle = col;
              ctx.lineWidth = 1.5;
              ctx.strokeRect(p0.x + 1, p0.y + 1, p1.x - p0.x - 2, p1.y - p0.y - 2);
            }
          }
        }
      }
    };

    const wheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const sp = screenToLocal(e);
      const c = camRef.current;
      const wp = screenToWorld(sp, c);
      const factor = Math.exp(-e.deltaY * 0.0012);
      const zoom = Math.max(0.1, Math.min(3, c.zoom * factor));
      camRef.current = { zoom, x: sp.x - wp.x * zoom, y: sp.y - wp.y * zoom };
    };
    host_.addEventListener("wheel", wheelNative, { passive: false });

    const keyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        spaceRef.current = true;
      }
    };
    const keyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceRef.current = false;
    };
    const onBlur = () => (spaceRef.current = false);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", onBlur);

    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      host_.removeEventListener("wheel", wheelNative);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", onBlur);
      renderer.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitView]);

  return (
    <div
      ref={hostRef}
      className="gpu-host"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => { if (hostRef.current) hostRef.current.style.cursor = "default"; }}
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", touchAction: "none" }}
    >
      <canvas ref={gpuRef} style={{ position: "absolute", inset: 0 }} />
      <canvas ref={ovRef} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}
