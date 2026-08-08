import { useCallback, useEffect, useRef, useState } from "react";
import { GpuRenderer, type DrawItem } from "./Renderer";
import type {
  Crop,
  CropAssignment,
  EditorTool,
  GaasData,
  GaasPin,
  GardenElement,
  GardenObjectKey,
} from "../types";
import { PX_PER_M, fmtM } from "../storage";
import { plantPositions, cropIconChar } from "../cropIcons";
import {
  GARDEN_OBJECTS,
  objectChar,
  type GardenObjectDef,
} from "../gardenObjects";

interface ElementUpdate {
  id: string;
  x?: number;
  y?: number;
  widthM?: number;
  heightM?: number;
  /** when a bed is resized, its plants scale proportionally */
  crops?: CropAssignment[];
  /** new anchor pins when a gaas was moved or resized */
  gaas?: GaasData;
}

interface Props {
  elements: GardenElement[];
  catalog: Crop[];
  tool: EditorTool;
  frameType: "bed" | "path";
  selectedIds: string[];
  selectedCropId: string | null;
  theme: "light" | "dark";
  onSelect: (ids: string[]) => void;
  onSelectCrop: (instanceId: string | null) => void;
  onApplyChanges: (updates: ElementUpdate[]) => void;
  onAddFrame: (type: "bed" | "path", x: number, y: number, wM: number, hM: number) => string;
  /** adds a garden object as a sibling element, returns its id; "gaas" carries its pin anchors */
  onAddObject: (key: GardenObjectKey, x: number, y: number, gaas?: GaasData) => string;
  objectMenuOpen: boolean;
  onObjectMenuOpenChange: (open: boolean) => void;
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
  | { k: "ga"; start: Pt; end: Pt }
  | { k: "cropDrag"; eId: string; instanceId: string; sp: Pt; origin: R; bed: R }
  | { k: "cropResize"; eId: string; instanceId: string; dir: Dir; origin: R; bed: R };

function rectOf(el: GardenElement): R {
  return { x: el.x, y: el.y, w: el.widthM * PX_PER_M, h: el.heightM * PX_PER_M };
}

/** Shortest distance from a point to a line segment (world units). */
function distToSeg(x1: number, y1: number, x2: number, y2: number, px: number, py: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
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
  onAddObject,
  objectMenuOpen,
  onObjectMenuOpenChange,
  onUpdateCrop,
  onBusyChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gpuRef = useRef<HTMLCanvasElement | null>(null);
  const ovRef = useRef<HTMLCanvasElement | null>(null);

  const propsRef = useRef({ elements, tool, frameType, selectedIds, selectedCropId, theme, catalog });
  propsRef.current = { elements, tool, frameType, selectedIds, selectedCropId, theme, catalog };
  const handlersRef = useRef({ onSelect, onSelectCrop, onApplyChanges, onAddFrame, onAddObject, onObjectMenuOpenChange, onUpdateCrop, onBusyChange });
  handlersRef.current = { onSelect, onSelectCrop, onApplyChanges, onAddFrame, onAddObject, onObjectMenuOpenChange, onUpdateCrop, onBusyChange };

  const [objSearch, setObjSearch] = useState("");

  const camRef = useRef<Cam>({ x: 0, y: 0, zoom: 1 });
  const draftRef = useRef<Map<string, R>>(new Map());
  /** live gaas pins while a gaas is being dragged/resized (free anchors only). */
  const gaasDraftRef = useRef<Map<string, GaasData>>(new Map());
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

  // ---- gaas (mesh line) helpers ----
  // A gaas spans two pins; a pin either sticks to a pole (whose centre is
  // recomputed live, so the line follows it) or floats freely.
  const pinPointOf = (pin: GaasPin): Pt => {
    const p = propsRef.current;
    const pole = pin.poleId ? p.elements.find((e) => e.id === pin.poleId) : undefined;
    if (pole) {
      const r = draftRef.current.get(pole.id) ?? rectOf(pole);
      return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    }
    return { x: pin.x, y: pin.y };
  };
  const gaasEndsOf = (el: GardenElement): { a: Pt; b: Pt } => {
    const g = gaasDraftRef.current.get(el.id) ?? el.gaas;
    if (!g) return { a: { x: el.x, y: el.y }, b: { x: el.x + el.widthM * PX_PER_M, y: el.y } };
    return { a: pinPointOf(g.a), b: pinPointOf(g.b) };
  };
  const gaasLengthM = (el: GardenElement): number => {
    const { a, b } = gaasEndsOf(el);
    return Math.hypot(b.x - a.x, b.y - a.y) / PX_PER_M;
  };
  /** Translate a gaas: free anchors follow the drag delta, pole-pinned ones stay. */
  const moveGaas = (el: GardenElement, dx: number, dy: number): GaasData => {
    const g = gaasDraftRef.current.get(el.id) ?? el.gaas!;
    const map = (p: GaasPin): GaasPin =>
      p.poleId ? { ...p } : { x: Math.round(p.x + dx), y: Math.round(p.y + dy) };
    return { a: map(g.a), b: map(g.b) };
  };
  /** Resize a gaas: scale the free anchors relative to the selection bounding box. */
  const scaleGaas = (el: GardenElement, union: R, r: R, sx: number, sy: number): GaasData => {
    const g = gaasDraftRef.current.get(el.id) ?? el.gaas!;
    const map = (p: GaasPin): GaasPin => {
      if (p.poleId) return { ...p };
      const pt = pinPointOf(p);
      return { x: Math.round(r.x + (pt.x - union.x) * sx), y: Math.round(r.y + (pt.y - union.y) * sy) };
    };
    return { a: map(g.a), b: map(g.b) };
  };
  /** Live rect of an element: for a gaas this is the bounding box of its two
   *  endpoints (so selection/marquee/labels stay correct when poles move). */
  const rOf = (el: GardenElement): R => {
    if (el.object === "gaas" && el.gaas) {
      const { a, b } = gaasEndsOf(el);
      const t = (el.widthM || 0.1) * PX_PER_M;
      return {
        x: Math.round(Math.min(a.x, b.x) - t),
        y: Math.round(Math.min(a.y, b.y) - t),
        w: Math.ceil(Math.abs(b.x - a.x) + t * 2),
        h: Math.ceil(Math.abs(b.y - a.y) + t * 2),
      };
    }
    return draftRef.current.get(el.id) ?? rectOf(el);
  };

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
      const r = rOf(el);
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
      const r = rOf(el);
      if (wp.x >= r.x && wp.x <= r.x + r.w && wp.y >= r.y && wp.y <= r.y + r.h) return el;
    }
    return null;
  };

  // Objects are drawn on top of beds/paths, so they win the hit-test first.
  // Round objects (poles) are hit-tested against their circle, not the square.
  const hitObjectElement = (wp: Pt): GardenElement | null => {
    const els = propsRef.current.elements;
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i];
      if (el.type !== "object") continue;
      const r = rOf(el);
      if (el.shape === "circle") {
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        const rad = Math.max(r.w, r.h) / 2 + 4;
        const dx = wp.x - cx;
        const dy = wp.y - cy;
        if (dx * dx + dy * dy <= rad * rad) return el;
      } else if (el.object === "gaas" && el.gaas) {
        const { a, b } = gaasEndsOf(el);
        const hit = Math.hypot(b.x - a.x, b.y - a.y) > 2;
        if (hit) {
          const d = distToSeg(a.x, a.y, b.x, b.y, wp.x, wp.y);
          if (d <= (el.widthM || 0.1) * PX_PER_M / 2 + 8) return el;
        }
      } else if (wp.x >= r.x && wp.x <= r.x + r.w && wp.y >= r.y && wp.y <= r.y + r.h) {
        return el;
      }
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
    const r = rOf(bed);
    return { x: r.x, y: r.y, w: bed.widthM * PX_PER_M, h: bed.heightM * PX_PER_M };
  };

  // ---- gestures ----
  // Pressing an object in the picker menu imports it (as a sibling element) and
  // immediately starts dragging it: a plain click drops it where it appears.
const startObjectDrag = (def: GardenObjectDef, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const c = camRef.current;
    const sp = screenToLocal(e);
    const wp = screenToWorld(sp, c);

    const pw = def.widthM * PX_PER_M;
    const ph = def.heightM * PX_PER_M;
    const origin: R = {
      x: Math.round(wp.x - pw / 2),
      y: Math.round(wp.y - ph / 2),
      w: pw,
      h: ph,
    };
    const newId = handlersRef.current.onAddObject(def.key, origin.x, origin.y);
    if (!newId) return;
    handlersRef.current.onSelect([newId]);
    handlersRef.current.onSelectCrop(null);
    gRef.current = { k: "drag", id: newId, sp: { x: sp.x, y: sp.y }, origin };
    hostRef.current?.setPointerCapture(e.pointerId);
    doBusy(true);
    handlersRef.current.onObjectMenuOpenChange(false);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const sp = screenToLocal(e);
    const c = camRef.current;
    const p = propsRef.current;
    // clicking the canvas closes the object picker menu
    handlersRef.current.onObjectMenuOpenChange(false);
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
    if (p.tool === "gaas") {
      const start = screenToWorld(sp, c);
      gRef.current = { k: "ga", start, end: start };
      e.currentTarget.setPointerCapture(e.pointerId);
      doBusy(true);
      return;
    }
    // "select/edit" tool: select, move and resize.
    // Resize handles win first (they sit on the bbox of the selection and would
    // otherwise be eaten by the object/line hit-test); then garden objects take
    // priority over beds and plants.
    if (p.tool === "select") {
      const dirH = hitHandle(sp, c);
      if (dirH && p.selectedIds.length > 0) {
        const origins = new Map<string, R>();
        for (const id of p.selectedIds) {
          const el = p.elements.find((e) => e.id === id)!;
          origins.set(id, rOf(el));
        }
        gRef.current = {
          k: "groupResize",
          ids: p.selectedIds,
          dir: dirH,
          union: unionOfSelected()!,
          origins,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        doBusy(true);
        return;
      }
      const objHit = hitObjectElement(screenToWorld(sp, c));
      if (objHit) {
        if (p.selectedIds.includes(objHit.id)) {
          const origins = new Map<string, R>();
          origins.set(objHit.id, rOf(objHit));
          gRef.current = { k: "groupDrag", ids: [objHit.id], sp, origins, leadId: objHit.id };
        } else {
          handlersRef.current.onSelect([objHit.id]);
          handlersRef.current.onSelectCrop(null);
          const origin = rOf(objHit);
          gRef.current = { k: "drag", id: objHit.id, sp, origin };
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        doBusy(true);
        return;
      }
    }
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
    const hit = hitItem(screenToWorld(sp, c));
    if (hit) {
      if (p.selectedIds.includes(hit.id)) {
        const origins = new Map<string, R>();
        for (const id of p.selectedIds) {
          const el = p.elements.find((e) => e.id === id)!;
          origins.set(id, rOf(el));
        }
        gRef.current = { k: "groupDrag", ids: p.selectedIds, sp, origins, leadId: hit.id };
      } else {
        handlersRef.current.onSelect([hit.id]);
        handlersRef.current.onSelectCrop(null);
        const origin = rOf(hit);
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
        if (hitObjectElement(screenToWorld(sp, c))) {
          cur = "move";
        } else {
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
        }
      } else if (p.tool === "frame" || p.tool === "gaas") {
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
        .map((el) => rOf(el));
      const res = snapRect(moved, others, g.origin);
      const el = propsRef.current.elements.find((e) => e.id === g.id);
      if (el && el.object === "gaas" && el.gaas) {
        // translate the free anchors; pole-pinned ones stay pinned
        const draft = moveGaas(el, wcur.x - wstart.x, wcur.y - wstart.y);
        gaasDraftRef.current.set(g.id, draft);
      } else {
        draftRef.current.set(g.id, { x: res.x, y: res.y, w: moved.w, h: moved.h });
      }
      guidesRef.current = { v: res.v, h: res.h };
      return;
    }
    if (g.k === "frame") {
      gRef.current = { ...g, end: screenToWorld(sp, c) };
      return;
    }
    if (g.k === "ga") {
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
        .map((el) => rOf(el));
      const res = snapRect(movedLead, others, lead);
      const fx = res.x - lead.x;
      const fy = res.y - lead.y;
      for (const [id, o] of g.origins) {
        const el = propsRef.current.elements.find((e) => e.id === id);
        if (el && el.object === "gaas" && el.gaas) {
          gaasDraftRef.current.set(id, moveGaas(el, fx, fy));
        } else {
          draftRef.current.set(id, { x: o.x + fx, y: o.y + fy, w: o.w, h: o.h });
        }
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
        .map((el) => rOf(el));
      const sn = snapResize(nr, g.dir, g.union, others);
      const fx = sn.r.w / g.union.w;
      const fy = sn.r.h / g.union.h;
      for (const [id, o] of g.origins) {
        // round objects scale uniformly so they stay circles
        let sx = fx;
        let sy = fy;
        const el = propsRef.current.elements.find((el) => el.id === id);
        if (el?.shape === "circle") {
          const f = (fx + fy) / 2;
          sx = f;
          sy = f;
        }
        if (el && el.object === "gaas" && el.gaas) {
          gaasDraftRef.current.set(id, scaleGaas(el, g.union, sn.r, sx, sy));
          continue;
        }
        const nx = sn.r.x + (o.x - g.union.x) * sx;
        const ny = sn.r.y + (o.y - g.union.y) * sy;
        draftRef.current.set(id, {
          x: Math.round(nx),
          y: Math.round(ny),
          w: Math.max(MIN, Math.round(o.w * sx)),
          h: Math.max(MIN, Math.round(o.h * sy)),
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
      const el = propsRef.current.elements.find((e) => e.id === g.id);
      const gd = gaasDraftRef.current.get(g.id);
      if (el && gd && el.object === "gaas") {
        handlersRef.current.onApplyChanges([{ id: g.id, gaas: gd }]);
      } else {
        const r = draftRef.current.get(g.id);
        if (r) handlersRef.current.onApplyChanges([{ id: g.id, x: Math.round(r.x), y: Math.round(r.y) }]);
      }
      draftRef.current.delete(g.id);
      gaasDraftRef.current.delete(g.id);
      guidesRef.current = { v: [], h: [] };
    } else if (g.k === "groupDrag") {
      const updates: ElementUpdate[] = [];
      for (const id of g.ids) {
        const gd = gaasDraftRef.current.get(id);
        if (gd) updates.push({ id, gaas: gd });
        else {
          const r = draftRef.current.get(id);
          if (r) updates.push({ id, x: Math.round(r.x), y: Math.round(r.y) });
        }
        draftRef.current.delete(id);
        gaasDraftRef.current.delete(id);
      }
      if (updates.length > 0) handlersRef.current.onApplyChanges(updates);
      guidesRef.current = { v: [], h: [] };
    } else if (g.k === "groupResize") {
      const updates: ElementUpdate[] = [];
      for (const id of g.ids) {
        const gd = gaasDraftRef.current.get(id);
        if (gd) {
          updates.push({ id, gaas: gd });
        } else {
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
        }
        draftRef.current.delete(id);
        gaasDraftRef.current.delete(id);
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
            const r = rOf(el);
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
    } else if (g.k === "ga") {
      const snap = (pt: Pt): GaasPin => {
        const o = hitObjectElement(pt);
        if (o && o.type === "object" && o.object === "pole") {
          const r = rOf(o);
          return {
            poleId: o.id,
            x: Math.round(r.x + r.w / 2),
            y: Math.round(r.y + r.h / 2),
          };
        }
        return { x: Math.round(pt.x), y: Math.round(pt.y) };
      };
      const pa = snap(g.start);
      const pb = snap(g.end);
      const len = Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y);
      if (len > MIN) {
        const id = handlersRef.current.onAddObject("gaas", g.start.x, g.start.y, { a: pa, b: pb });
        if (id) {
          handlersRef.current.onSelect([id]);
          handlersRef.current.onSelectCrop(null);
        }
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
        if (el.type === "object") continue; // objects are drawn in their own pass
        const r = rOf(el);
        items.push({ rect: r, color: el.color, selected: false });
      }
      renderer.render(items, c, bg(p.theme));

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // plant rectangles drawn inside each bed (colour-coded per catalog crop)
      const dark = p.theme === "dark";
      const chipBg = dark ? "rgba(28,32,39,0.9)" : "rgba(255,255,255,0.9)";
      const chipBorder = dark ? "rgba(255,255,255,0.12)" : "rgba(16,24,40,0.08)";
      const chipName = dark ? "#e7eaee" : "#171b21";
      const chipMeta = dark ? "#8a93a1" : "#70788a";
      const cropById = new Map(p.catalog.map((cr) => [cr.id, cr]));
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
          const crop = cropById.get(a.cropId);
          const col = crop?.color ?? "#9aa0a6";
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

          // flat plant icons arranged in the chosen layout, spacing from the
          // crop's row/plant spacing
          const rowSpacingM = a.rowSpacing ?? crop?.rowSpacing ?? 0.3;
          const plantSpacingM = a.plantSpacing ?? crop?.plantSpacing ?? 0.2;
          const icon = cropIconChar(crop?.icon);
          const { spots, size } = plantPositions(
            { x: r.x, y: r.y, w: r.w, h: r.h },
            a.rows,
            a.cols,
            rowSpacingM,
            plantSpacingM,
            a.padding ?? 0.1,
            PX_PER_M
          );
          if (spots.length > 0 && bw >= 16 && bh >= 16) {
            ctx.globalAlpha = p.selectedCropId && !isSel ? 0.45 : 1;
            ctx.fillStyle = col;
            ctx.font = `900 ${size * c.zoom}px "Font Awesome 7 Free", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            for (const s of spots) {
              const sp = worldToScreen({ x: s.x, y: s.y }, c);
              ctx.fillText(icon, sp.x, sp.y + 1);
            }
            ctx.globalAlpha = 1;
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
          }

          // name chip for the selected/hovered plant
          if ((isSel || isHov) && bw >= 56 && bh >= 26) {
            const nfs = Math.max(9, Math.min(11, 10.5 * c.zoom));
            const nm = crop?.name ?? "";
            ctx.font = `600 ${nfs}px Inter, system-ui, sans-serif`;
            const nw = ctx.measureText(nm).width;
            const npx = 9;
            const nwW = nw + npx * 2;
            const nhh = nfs + 7;
            ctx.fillStyle = chipBg;
            ctx.strokeStyle = chipBorder;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(p0.x + 3, p0.y + 3, Math.min(nwW, bw - 6), nhh, 6);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = chipName;
            ctx.textBaseline = "middle";
            ctx.fillText(nm, p0.x + 3 + npx, p0.y + 3 + nhh / 2 + 1);
            ctx.textBaseline = "top";
          }
        }
      }

      // garden objects: always drawn on top of beds/paths and their plants
      for (const el of p.elements) {
        if (el.type !== "object") continue;
        const isSel = p.selectedIds.includes(el.id);

        // "gaas": a mesh line stretching between its two anchors
        if (el.object === "gaas" && el.gaas) {
          const { a, b } = gaasEndsOf(el);
          const sA = worldToScreen(a, c);
          const sB = worldToScreen(b, c);
          const dx = sB.x - sA.x;
          const dy = sB.y - sA.y;
          const len = Math.hypot(dx, dy);
          if (len < 3) continue;
          const t2 = Math.max(1.5, ((el.widthM || 0.1) * PX_PER_M * c.zoom) / 2);
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          // translucent band
          ctx.globalAlpha = isSel ? 0.65 : 0.42;
          ctx.strokeStyle = el.color;
          ctx.lineWidth = t2 * 2;
          ctx.beginPath();
          ctx.moveTo(sA.x, sA.y);
          ctx.lineTo(sB.x, sB.y);
          ctx.stroke();
          // mesh strands crossing the line
          const cell = Math.max(7, Math.round(PX_PER_M * 0.12 * c.zoom));
          ctx.globalAlpha = isSel ? 0.7 : 0.4;
          ctx.strokeStyle = isSel ? accent(p.theme) : "rgba(0,0,0,0.35)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let d = cell; d < len; d += cell) {
            const cx = sA.x + (dx / len) * d;
            const cy = sA.y + (dy / len) * d;
            ctx.moveTo(cx - (-dy / len) * t2, cy - (dx / len) * t2);
            ctx.lineTo(cx + (-dy / len) * t2, cy + (dx / len) * t2);
          }
          ctx.stroke();
          // free (non-pole) anchors get a little marker
          ctx.globalAlpha = 1;
          const dotF = Math.max(2, t2 * 0.85);
          ctx.fillStyle = el.color;
          for (const s of [sA, sB]) {
            ctx.beginPath();
            ctx.arc(s.x, s.y, dotF, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.lineCap = "butt";
          ctx.lineJoin = "miter";
          continue;
        }

        const r = rOf(el);
        const p0 = worldToScreen({ x: r.x, y: r.y }, c);
        const p1 = worldToScreen({ x: r.x + r.w, y: r.y + r.h }, c);
        const rw = p1.x - p0.x;
        const rh = p1.y - p0.y;

        // round objects (poles/tuns): filled circle, ring, and solid centre
        if (el.shape === "circle") {
          const cx = (p0.x + p1.x) / 2;
          const cy = (p0.y + p1.y) / 2;
          const rad = rw / 2;
          if (rad < 3) continue;
          ctx.globalAlpha = isSel ? 0.35 : 0.22;
          ctx.fillStyle = el.color;
          ctx.beginPath();
          ctx.arc(cx, cy, rad, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = isSel ? accent(p.theme) : "rgba(0,0,0,0.28)";
          ctx.lineWidth = isSel ? 2 : 1;
          ctx.beginPath();
          ctx.arc(cx, cy, rad, 0, Math.PI * 2);
          ctx.stroke();
          // a solid centre dot reads as a pole; tuns keep a small glyph
          if (el.object === "pole") {
            const dot = Math.max(2.5, rad * 0.3);
            ctx.fillStyle = isSel ? accent(p.theme) : el.color;
            ctx.beginPath();
            ctx.arc(cx, cy, dot, 0, Math.PI * 2);
            ctx.fill();
          } else {
            const size = Math.max(rad * 0.6, 6);
            ctx.fillStyle = el.color;
            ctx.font = `900 ${size}px "Font Awesome 7 Free", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(objectChar(el.object), cx, cy + 1);
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
          }
          continue;
        }

        if (rw < 6 || rh < 6) continue;
        ctx.globalAlpha = isSel ? 0.3 : 0.18;
        ctx.fillStyle = el.color;
        ctx.beginPath();
        ctx.roundRect(p0.x, p0.y, rw, rh, 7);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = isSel ? accent(p.theme) : "rgba(0,0,0,0.25)";
        ctx.lineWidth = isSel ? 2 : 1;
        ctx.beginPath();
        ctx.roundRect(p0.x + 0.5, p0.y + 0.5, rw - 1, rh - 1, 7);
        ctx.stroke();

        const size = Math.min(rw, rh) * 0.55;
        if (size >= 6) {
          ctx.fillStyle = el.color;
          ctx.font = `900 ${size}px "Font Awesome 7 Free", sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(objectChar(el.object), (p0.x + p1.x) / 2, (p0.y + p1.y) / 2 + 1);
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
        }
      }

      // live preview while drawing a gaas line
      if (gRef.current.k === "ga") {
        const st = worldToScreen(gRef.current.start, c);
        const en = worldToScreen(gRef.current.end, c);
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = "#3d9e6a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(st.x, st.y);
        ctx.lineTo(en.x, en.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#3d9e6a";
        ctx.beginPath();
        ctx.arc(st.x, st.y, 4, 0, Math.PI * 2);
        ctx.arc(en.x, en.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // labels
      for (const el of p.elements) {
        const r = rOf(el);
        const p0 = worldToScreen({ x: r.x, y: r.y }, c);
        const p1 = worldToScreen({ x: r.x + r.w, y: r.y + r.h }, c);
        const bw = p1.x - p0.x;
        const bh = p1.y - p0.y;
        if (bw < 46 || bh < 22) continue;
        const fs = Math.max(9, Math.min(13, 12 * c.zoom));
        const sizeTxt =
          el.shape === "circle"
            ? `⌀ ${fmtM(el.widthM)}`
            : el.object === "gaas" && el.gaas
              ? `${fmtM(gaasLengthM(el))} m`
              : `${fmtM(el.widthM)} × ${fmtM(el.heightM)}`;
        ctx.textBaseline = "top";
        ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
        const nameW = ctx.measureText(el.label).width;
        const smallFs = Math.max(8, Math.min(10, 9 * c.zoom));
        ctx.font = `600 ${smallFs}px Inter, system-ui, sans-serif`;
        const sizeW = ctx.measureText(sizeTxt).width;
        const padX = 9;
        const padY = 5;
        const hasSizeLine = bh >= 44;
        const chipW = Math.max(nameW, sizeW) + padX * 2;
        const chipH = hasSizeLine ? fs + smallFs + padY * 2 + 1 : fs + padY * 2;
        ctx.fillStyle = chipBg;
        ctx.strokeStyle = chipBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(p0.x + 3, p0.y + 3, Math.min(chipW, bw - 6), chipH, 7);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = chipName;
        ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
        ctx.fillText(el.label, p0.x + 3 + padX, p0.y + 3 + padY + (fs - 10) / 2);
        if (hasSizeLine) {
          ctx.fillStyle = chipMeta;
          ctx.font = `600 ${smallFs}px Inter, system-ui, sans-serif`;
          ctx.fillText(sizeTxt, p0.x + 3 + padX, p0.y + 3 + padY + fs + (smallFs - 8) / 2 + 1);
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
          const txt =
            p.selectedIds.length === 1
              ? (() => {
                  const el = p.elements.find((e) => e.id === p.selectedIds[0]);
                  return el && el.object === "gaas" && el.gaas
                    ? `${fmtM(gaasLengthM(el))} m`
                    : `${fmtM(r.w / PX_PER_M)} × ${fmtM(r.h / PX_PER_M)}`;
                })()
              : `${fmtM(r.w / PX_PER_M)} × ${fmtM(r.h / PX_PER_M)}`;
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
      {objectMenuOpen && (
        <ObjectMenu
          search={objSearch}
          onSearchChange={setObjSearch}
          onClose={() => handlersRef.current.onObjectMenuOpenChange(false)}
          onItemPointerDown={startObjectDrag}
        />
      )}
    </div>
  );
}

function ObjectMenu({
  search,
  onSearchChange,
  onClose,
  onItemPointerDown,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  onClose: () => void;
  onItemPointerDown: (def: GardenObjectDef, e: React.PointerEvent) => void;
}) {
  const s = search.trim().toLowerCase();
  const filtered = GARDEN_OBJECTS.filter(
    (o) =>
      !s ||
      o.name.toLowerCase().includes(s) ||
      o.keywords.toLowerCase().includes(s)
  );
  return (
    <div
      className="obj-menu"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="obj-menu-head">
        <span className="obj-menu-title">Voorwerpen</span>
        <button
          type="button"
          className="obj-menu-close"
          onClick={onClose}
          aria-label="Sluiten"
        >
          ✕
        </button>
      </div>
      <input
        className="obj-menu-search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Zoek voorwerp…"
      />
      <div className="obj-menu-grid">
        {filtered.map((def) => (
          <button
            key={def.key}
            type="button"
            className="obj-menu-item"
            onPointerDown={(e) => onItemPointerDown(def, e)}
          >
            <i className={def.icon} />
            <span>{def.name}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="obj-menu-empty">Geen resultaten.</div>
        )}
      </div>
    </div>
  );
}
