import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { userColor, type LiveCursor, type PreviewPayload } from "../realtime";
import { plantPositions, cropEmoji, fitCropCounts } from "../cropIcons";
import { cropIconImage } from "../cropIconImages";

/**
 * Geladen icoon-afbeeldingen voor het canvas. Een <img> is niet meteen klaar
 * om tekenen, dus we laden ze op van tevoren en tekenen pas als ze er zijn;
 * tot dan valt het frame terug op de emoji (die is direct beschikbaar).
 */
const iconImageCache = new Map<string, HTMLImageElement>();

function loadIconImage(src: string): HTMLImageElement | null {
  const hit = iconImageCache.get(src);
  if (hit) return hit.complete && hit.naturalWidth > 0 ? hit : null;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    /* klaar: de volgende frame tekent de afbeelding */
  };
  img.src = src;
  iconImageCache.set(src, img);
  return null;
}

/** Tekent het icoon van een gewas: afbeelding als die geladen is, anders emoji. */
function drawCropIcon(
  ctx: CanvasRenderingContext2D,
  iconKey: string | undefined,
  cropName: string | undefined,
  cx: number,
  cy: number,
  size: number
): void {
  const src = cropIconImage(iconKey);
  const img = src ? loadIconImage(src) : null;
  if (img) {
    ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
    return;
  }
  ctx.fillText(cropEmoji(iconKey, cropName), cx, cy + 1);
}
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
  frameType: "bed" | "path" | "veld";
  selectedIds: string[];
  selectedCropId: string | null;
  theme: "light" | "dark";
  locked?: boolean;
  onSelect: (ids: string[]) => void;
  /** Ctrl/Cmd+klik: ids aan de selectie toevoegen ("add") of togglen ("toggle") */
  onToggleSelect: (ids: string[], mode?: "toggle" | "add") => void;
  onSelectCrop: (instanceId: string | null) => void;
  onApplyChanges: (updates: ElementUpdate[]) => void;
  /** transient drag positions, relayed to other editors (live collaboration) */
  onLiveMove?: (updates: { id: string; x?: number; y?: number; widthM?: number; heightM?: number; crops?: CropAssignment[] }[]) => void;
  /** transient "ghost" of something being created, relayed live */
  onLivePreview?: (preview: PreviewPayload) => void;
  /** ghost received from another editor, drawn as an overlay */
  livePreview?: PreviewPayload | null;
  /** eigen muis + selectie live delen */
  onLiveCursor?: (cursor: { x: number; y: number } | null, selection: string[]) => void;
  /** live muizen + selecties van de andere editors */
  liveCursors?: { current: Map<string, LiveCursor> };
  currentUserId?: string;
  onAddFrame: (type: "bed" | "path" | "veld", x: number, y: number, wM: number, hM: number) => string;
  /** adds a garden object as a sibling element, returns its id; "gaas" carries its pin anchors */
  onAddObject: (key: GardenObjectKey, x: number, y: number, gaas?: GaasData) => string;
  /** draws a new planting piece inside a bed; area is in world px, bed-relative */
  onAddCropAt: (bedId: string, wx: number, wy: number, w: number, h: number) => void;
  /** crop used for new pieces (catalog id) */
  activeCropId: string | null;
  objectMenuOpen: boolean;
  onObjectMenuOpenChange: (open: boolean) => void;
  /** magnetisch uitlijnen (snap guides); uit te zetten via de toolbar */
  snap: boolean;
  onUpdateCrop: (
    eId: string,
    instanceId: string,
    patch: Partial<CropAssignment>
  ) => void;
  onBusyChange?: (busy: boolean) => void;
  /** eenmalig zodra het eerste frame echt getekend is (maat > 0) */
  onFirstPaint?: () => void;
  /** centreer de camera op een wereldpunt (bv. na "toon in tuin" vanuit de kalender) */
  focusSignal?: { x: number; y: number; n: number } | null;
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
 *  `center` marks a centre alignment (drawn solid + dot) vs an edge alignment
 *  (drawn dashed). */
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
/** Snap-fangebied in schermpixels (zoom-onafhankelijk). */
const SNAP_SCREEN = 10;
const HANDLE_HIT = 20;
const EDGE_HIT = 12;

type Dir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
type Gesture =
  | { k: "none" }
  | { k: "pan"; sx: number; sy: number; lx: number; ly: number }
  | { k: "marquee"; start: Pt; end: Pt }
  | { k: "drag"; id: string; sp: Pt; origin: R }
  | { k: "groupDrag"; ids: string[]; sp: Pt; origins: Map<string, R>; leadId: string }
  | { k: "groupResize"; ids: string[]; dir: Dir; union: R; origins: Map<string, R> }
  | { k: "frame"; start: Pt; end: Pt }
  | { k: "cropFrame"; start: Pt; end: Pt }
  | { k: "ga"; start: Pt; end: Pt }
  | { k: "gaasEnd"; id: string; end: "a" | "b"; origin: GaasData }
  | { k: "cropDrag"; eId: string; instanceId: string; sp: Pt; origin: R; bed: R; wasSelected: boolean }
  | { k: "cropResize"; eId: string; instanceId: string; dir: Dir; origin: R; bed: R }
  | { k: "pinch"; ids: [number, number]; mid: Pt; startDist: number; cam: Cam };

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

/** Whether segment ab touches rect (x, y, w, h). Used so a marquee only grabs
 *  a gaas line when it actually crosses the line, not its padded bbox. */
function segIntersectsRect(ax: number, ay: number, bx: number, by: number, x: number, y: number, w: number, h: number): boolean {
  const inside = (px: number, py: number) => px >= x && px <= x + w && py >= y && py <= y + h;
  if (inside(ax, ay) || inside(bx, by)) return true;
  const orient = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    (qy - py) * (rx - qx) - (qx - px) * (ry - qy);
  const cross = (p1x: number, p1y: number, p2x: number, p2y: number, p3x: number, p3y: number, p4x: number, p4y: number) => {
    const d1 = orient(p3x, p3y, p4x, p4y, p1x, p1y);
    const d2 = orient(p3x, p3y, p4x, p4y, p2x, p2y);
    const d3 = orient(p1x, p1y, p2x, p2y, p3x, p3y);
    const d4 = orient(p1x, p1y, p2x, p2y, p4x, p4y);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  return (
    cross(ax, ay, bx, by, x, y, x + w, y) ||
    cross(ax, ay, bx, by, x + w, y, x + w, y + h) ||
    cross(ax, ay, bx, by, x + w, y + h, x, y + h) ||
    cross(ax, ay, bx, by, x, y + h, x, y)
  );
}

/** Eenheidsnormaal van een scherm-segment, omgedraaid zodat labels bij
 *  voorkeur BOVEN de lijn belanden (en er dus nooit onder verdwijnen). */
function segNormal(ax: number, ay: number, bx: number, by: number): Pt {
  const len = Math.max(1, Math.hypot(bx - ax, by - ay));
  let nx = -(by - ay) / len;
  let ny = (bx - ax) / len;
  if (ny > 0.25) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
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



/** An anchor on one axis: `kind` 0 = start edge, 1 = end edge, 2 = centre. */
interface Anchor {
  at: number;
  kind: 0 | 1 | 2;
}
/** A snap target: an anchor of `o`, the rect the guide line spans towards. */
interface AxisFix extends Anchor {
  o: R;
}

/** The three anchors of a rect along one axis: start edge, centre, end edge. */
function rectAnchors(r: R, axis: "x" | "y"): Anchor[] {
  const a = axis === "x" ? r.x : r.y;
  const s = axis === "x" ? r.w : r.h;
  return [
    { at: a, kind: 0 },
    { at: a + s / 2, kind: 2 },
    { at: a + s, kind: 1 },
  ];
}

/** Which pairing should win when several snap targets are in range; lower is
 *  better. Centre-on-centre, then matching edges, then butt-jointed edges,
 *  and only then an edge landing on somebody else's centre. */
function anchorRank(m: Anchor, f: Anchor): number {
  if (m.kind === 2 && f.kind === 2) return 0;
  if (m.kind !== 2 && f.kind !== 2) return m.kind === f.kind ? 1 : 2;
  return 3;
}

/** Snap a single axis. `moving` are the anchors that travel with the gesture,
 *  `fixed` the available targets, `th` the catch radius in world px. Returns the
 *  correction for the moving anchors plus a guide for every target that lines up
 *  once that correction is applied. `self` is the rect the moving anchors belong
 *  to and only feeds the guide extent. */
function snapAxis(
  moving: Anchor[],
  fixed: AxisFix[],
  th: number,
  self: R,
  axis: "x" | "y"
): { delta: number; guides: SnapLine[] } | null {
  if (moving.length === 0 || fixed.length === 0) return null;
  let delta = 0;
  let found = false;
  for (let rank = 0; rank <= 3 && !found; rank++) {
    let best = Infinity;
    for (const m of moving) {
      for (const f of fixed) {
        if (anchorRank(m, f) !== rank) continue;
        const d = f.at - m.at;
        if (Math.abs(d) >= th) continue;
        if (Math.abs(d) < best) {
          best = Math.abs(d);
          delta = d;
          found = true;
        }
      }
    }
  }
  if (!found) return null;
  // Every target that lines up after the correction gets its own guide.
  const guides: SnapLine[] = [];
  const seen = new Set<number>();
  for (const m of moving) {
    const at = m.at + delta;
    for (const f of fixed) {
      if (Math.abs(f.at - at) > 0.5) continue;
      const key = Math.round(f.at * 10);
      if (seen.has(key)) continue;
      seen.add(key);
      guides.push({
        at: f.at,
        center: m.kind === 2 && f.kind === 2,
        ...guideExtent(self, f.o, axis === "x" ? "y" : "x"),
      });
    }
  }
  return { delta, guides };
}

/** Collect every snap target on one axis: all three anchors of each rect. */
function axisFixes(others: R[], axis: "x" | "y"): AxisFix[] {
  const out: AxisFix[] = [];
  for (const o of others) {
    for (const a of rectAnchors(o, axis)) out.push({ ...a, o });
  }
  return out;
}

/** Snap a dragged element: its centre *and* its edges against every other
 *  element, per axis independently. */
function snapRect(moved: R, others: R[], th: number): { x: number; y: number; v: SnapLine[]; h: SnapLine[] } {
  const ax = snapAxis(rectAnchors(moved, "x"), axisFixes(others, "x"), th, moved, "x");
  const ay = snapAxis(rectAnchors(moved, "y"), axisFixes(others, "y"), th, moved, "y");
  return {
    x: ax ? moved.x + ax.delta : moved.x,
    y: ay ? moved.y + ay.delta : moved.y,
    v: ax ? ax.guides : [],
    h: ay ? ay.guides : [],
  };
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

/** A travelling anchor while resizing, described in terms of the size change.
 *  `at` is where the anchor sits now, `kind` its anchor kind, and `scale` how far
 *  it travels per unit of size change. The dragged edge follows the size change
 *  1:1 while the centre only moves half as far, so a single correction cannot
 *  serve both — each anchor needs its own conversion. */
interface Travelling {
  at: number;
  kind: 0 | 1 | 2;
  scale: number;
}

/** The anchors that travel when one side of a rect is dragged: the dragged edge
 *  itself and the centre. `moving` is the dragged edge, `fixed` the opposite one,
 *  `growing` says whether the drag is on the high side. */
function resizeTravellers(moving: number, _fixed: number, growing: boolean): Travelling[] {
  return [
    { at: moving, kind: growing ? 1 : 0, scale: 1 },
  ];
}

/** Snap a resize. Only the anchors that actually travel are candidates, and each
 *  is converted through its own `scale` so the size change lands it exactly on the
 *  target. `apply` folds the size change back into the rect. */
function snapResizeAxis(
  travellers: Travelling[],
  fixed: AxisFix[],
  th: number,
  self: R,
  axis: "x" | "y",
  apply: (r: R, ds: number) => R
): { r: R; guides: SnapLine[] } {
  const out: SnapLine[] = [];
  let bestDs = 0;
  let hitAny = false;
  for (let rank = 0; rank <= 3; rank++) {
    bestDs = 0;
    hitAny = false;
    for (const m of travellers) {
      for (const f of fixed) {
        if (anchorRank(m, f) !== rank) continue;
        // catch radius is measured on the visible gap, not the size change
        const gap = f.at - m.at;
        if (Math.abs(gap) >= th) continue;
        const ds = gap / m.scale;
        if (Math.abs(ds) < Math.abs(bestDs) || !hitAny) {
          bestDs = ds;
          hitAny = true;
        }
      }
    }
    if (hitAny) break;
  }
  if (!hitAny) return { r: self, guides: out };
  const finalAt = new Map<Travelling, number>();
  for (const m of travellers) finalAt.set(m, m.at + m.scale * bestDs);
  const seen = new Set<number>();
  for (const m of travellers) {
    const at = finalAt.get(m)!;
    for (const f of fixed) {
      if (Math.abs(f.at - at) > 0.5) continue;
      const key = Math.round(f.at * 10);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        at: f.at,
        center: m.kind === 2 && f.kind === 2,
        ...guideExtent(self, f.o, axis === "x" ? "y" : "x"),
      });
    }
  }
  return { r: apply(self, bestDs), guides: out };
}

/** Snap the dragged edge(s) of a resize to another element's centres or edges.
 *  The sides that were not grabbed never move. */
function snapResize(rect: R, dir: Dir, others: R[], th: number): { r: R; v: SnapLine[]; h: SnapLine[] } {
  let r = rect;
  let v: SnapLine[] = [];
  let h: SnapLine[] = [];
  if (dir.includes("e") || dir.includes("w")) {
    const east = dir.includes("e");
    // the dragged edge travels, the opposite one is glued to its side
    const moving = east ? r.x + r.w : r.x;
    const fixed = east ? r.x : r.x + r.w;
    const s = snapResizeAxis(
      resizeTravellers(moving, fixed, east),
      axisFixes(others, "x"),
      th,
      r,
      "x",
      (cur, ds) =>
        east
          ? { ...cur, w: Math.max(MIN, cur.w + ds) }
          : { ...cur, x: cur.x + ds, w: Math.max(MIN, cur.w - ds) }
    );
    r = s.r;
    v = s.guides;
  }
  if (dir.includes("s") || dir.includes("n")) {
    const south = dir.includes("s");
    const moving = south ? r.y + r.h : r.y;
    const fixed = south ? r.y : r.y + r.h;
    const s = snapResizeAxis(
      resizeTravellers(moving, fixed, south),
      axisFixes(others, "y"),
      th,
      r,
      "y",
      (cur, ds) =>
        south
          ? { ...cur, h: Math.max(MIN, cur.h + ds) }
          : { ...cur, y: cur.y + ds, h: Math.max(MIN, cur.h - ds) }
    );
    r = s.r;
    h = s.guides;
  }
  return { r, v, h };
}

const CROP_GRID = 5; // 5px == 5cm fine grid when nothing else snaps

/** Perpendicular extent (a..b) for a guide line joining rects `m` and `o`.
 *  The line always spans both objects fully, so it visibly runs through them. */
function guideExtent(m: R, o: R, perpendicular: "x" | "y"): { a: number; b: number } {
  const ma = perpendicular === "x" ? m.x : m.y;
  const ms = ma + (perpendicular === "x" ? m.w : m.h);
  const oa = perpendicular === "x" ? o.x : o.y;
  const os = oa + (perpendicular === "x" ? o.w : o.h);
  return { a: Math.min(ma, oa), b: Math.max(ms, os) };
}

/** Snap a plant rectangle being dragged.
 *  Targets are ONLY the parent bed and the plant's own siblings plus a fine grid
 *  (never unrelated elements). Centres *and* edges align. */
function snapCropRect(moved: R, bed: R, others: R[], th: number): { x: number; y: number; v: SnapLine[]; h: SnapLine[] } {
  const targets = [bed, ...others];
  const ax = snapAxis(rectAnchors(moved, "x"), axisFixes(targets, "x"), th, moved, "x");
  const ay = snapAxis(rectAnchors(moved, "y"), axisFixes(targets, "y"), th, moved, "y");
  const c = clampToBed(
    {
      x: ax ? moved.x + ax.delta : snapToGrid(moved.x, bed.x),
      y: ay ? moved.y + ay.delta : snapToGrid(moved.y, bed.y),
      w: moved.w,
      h: moved.h,
    },
    bed
  );
  return { x: c.x, y: c.y, v: ax ? ax.guides : [], h: ay ? ay.guides : [] };
}

/** Snap the dragged edge(s) of a plant resize to the bed's or a sibling plant's
 *  centres and edges, falling back to the fine 5 cm grid. */
function snapCropResize(rect: R, dir: Dir, bed: R, others: R[], th: number): { r: R; v: SnapLine[]; h: SnapLine[] } {
  const targets = [bed, ...others];
  const fixedX = axisFixes(targets, "x");
  const fixedY = axisFixes(targets, "y");
  let r = rect;
  let v: SnapLine[] = [];
  let h: SnapLine[] = [];

  if (dir.includes("e") || dir.includes("w")) {
    const east = dir.includes("e");
    const s = snapResizeAxis(
      resizeTravellers(east ? r.x + r.w : r.x, east ? r.x : r.x + r.w, east),
      fixedX,
      th,
      r,
      "x",
      (cur, ds) =>
        east
          ? { ...cur, w: Math.max(MIN, cur.w + ds) }
          : { ...cur, x: cur.x + ds, w: Math.max(MIN, cur.w - ds) }
    );
    r = s.r;
    v = s.guides;
    if (v.length === 0) {
      r = east
        ? { ...r, w: Math.max(MIN, Math.round(r.w / CROP_GRID) * CROP_GRID) }
        : (() => {
            const x = snapToGrid(r.x, bed.x);
            return { ...r, x, w: r.x + r.w - x };
          })();
    }
  }
  if (dir.includes("s") || dir.includes("n")) {
    const south = dir.includes("s");
    const s = snapResizeAxis(
      resizeTravellers(south ? r.y + r.h : r.y, south ? r.y : r.y + r.h, south),
      fixedY,
      th,
      r,
      "y",
      (cur, ds) =>
        south
          ? { ...cur, h: Math.max(MIN, cur.h + ds) }
          : { ...cur, y: cur.y + ds, h: Math.max(MIN, cur.h - ds) }
    );
    r = s.r;
    h = s.guides;
    if (h.length === 0) {
      r = south
        ? { ...r, h: Math.max(MIN, Math.round(r.h / CROP_GRID) * CROP_GRID) }
        : (() => {
            const y = snapToGrid(r.y, bed.y);
            return { ...r, y, h: r.y + r.h - y };
          })();
    }
  }

  const c = clampToBed(r, bed);
  return {
    r: { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.w), h: Math.round(c.h) },
    v,
    h,
  };
}

/** Keep a plant rectangle inside its bed. Containment is not an alignment
 *  concern, so this runs whether or not snapping is enabled. */
function clampToBed(r: R, bed: R): R {
  const w = Math.min(r.w, bed.w);
  const h = Math.min(r.h, bed.h);
  return {
    w,
    h,
    x: Math.max(bed.x, Math.min(r.x, bed.x + bed.w - w)),
    y: Math.max(bed.y, Math.min(r.y, bed.y + bed.h - h)),
  };
}

/** Snap to the 5 cm grid, measured from `origin` so the fine grid follows the
 *  bed instead of the world's zero point. */
function snapToGrid(v: number, origin: number): number {
  return origin + Math.round((v - origin) / CROP_GRID) * CROP_GRID;
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
  locked,
  onSelect,
  onToggleSelect,
  onSelectCrop,
  onApplyChanges,
  onLiveMove,
  onLivePreview,
  livePreview,
  onLiveCursor,
  liveCursors,
  currentUserId,
  onAddFrame,
  onAddObject,
  onAddCropAt,
  objectMenuOpen,
  onObjectMenuOpenChange,
  onUpdateCrop,
  onBusyChange,
  onFirstPaint,
  snap,
  activeCropId,
  focusSignal,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gpuRef = useRef<HTMLCanvasElement | null>(null);
  const ovRef = useRef<HTMLCanvasElement | null>(null);

  const propsRef = useRef({ elements, tool, frameType, selectedIds, selectedCropId, theme, catalog, livePreview, snap, activeCropId, locked, liveCursors, currentUserId });
  propsRef.current = { elements, tool, frameType, selectedIds, selectedCropId, theme, catalog, livePreview, snap, activeCropId, locked, liveCursors, currentUserId };
  /** focus-signaal dat nog toegepast moet worden zodra de canvas een maat heeft */
  const pendingFocusRef = useRef<{ x: number; y: number; n: number } | null>(null);

  const applyFocus = (fx: number, fy: number) => {
    const { w, h } = hostSize.current;
    if (w === 0 || h === 0) return false;
    const cam = camRef.current;
    const zoom = Math.max(cam.zoom, 1);
    camRef.current = { zoom, x: w / 2 - fx * zoom, y: h / 2 - fy * zoom };
    return true;
  };

  // "Toon in tuin": centreer op het gevraagde punt. Werkt ook als het
  // signaal binnenkomt terwijl de canvas nog geen maat heeft (tab net
  // geopend): dan blijft het hangen tot de eerste ResizeObserver-meting.
  useEffect(() => {
    if (!focusSignal) return;
    pendingFocusRef.current = focusSignal;
    if (applyFocus(focusSignal.x, focusSignal.y)) {
      pendingFocusRef.current = null;
    }
  }, [focusSignal]);
  const handlersRef = useRef({ onSelect, onToggleSelect, onSelectCrop, onApplyChanges, onLiveMove, onLivePreview, onLiveCursor, onAddFrame, onAddObject, onAddCropAt, onObjectMenuOpenChange, onUpdateCrop, onBusyChange, onFirstPaint });
  handlersRef.current = { onSelect, onToggleSelect, onSelectCrop, onApplyChanges, onLiveMove, onLivePreview, onLiveCursor, onAddFrame, onAddObject, onAddCropAt, onObjectMenuOpenChange, onUpdateCrop, onBusyChange, onFirstPaint };

  // Selectiewijziging meteen live delen, ook zonder muisbeweging
  // (bv. via de sidebar, het toetsenbord of de lasso).
  useEffect(() => {
    const fn = handlersRef.current.onLiveCursor;
    const last = lastWorldRef.current;
    if (!fn || !last) return;
    fn(last, propsRef.current.selectedIds);
  }, [selectedIds]);
  // Diagnose in de browserconsole: __mpCam()
  useEffect(() => {
    (window as unknown as { __mpCam?: () => unknown }).__mpCam = () => ({ ...camRef.current });
  }, []);

  const [objSearch, setObjSearch] = useState("");
  const [menuClosing, setMenuClosing] = useState(false);
  const menuCloseTimer = useRef<number | null>(null);
  const menuWasOpen = useRef(false);

  useEffect(() => {
    if (objectMenuOpen) {
      menuWasOpen.current = true;
      setMenuClosing(false);
      if (menuCloseTimer.current !== null) {
        window.clearTimeout(menuCloseTimer.current);
        menuCloseTimer.current = null;
      }
      return;
    }
    if (menuWasOpen.current) {
      menuWasOpen.current = false;
      setMenuClosing(true);
      menuCloseTimer.current = window.setTimeout(() => {
        setMenuClosing(false);
        menuCloseTimer.current = null;
      }, 220);
    }
    return () => {
      if (menuCloseTimer.current !== null) {
        window.clearTimeout(menuCloseTimer.current);
        menuCloseTimer.current = null;
      }
    };
  }, [objectMenuOpen]);

  const camRef = useRef<Cam>({ x: 0, y: 0, zoom: 1 });
  const draftRef = useRef<Map<string, R>>(new Map());
  /** live gaas pins while a gaas is being dragged/resized (free anchors only). */
  const gaasDraftRef = useRef<Map<string, GaasData>>(new Map());
  /** live crop-area rects keyed by instanceId, in world px (only during a crop gesture). */
  const cropDraftRef = useRef<Map<string, R>>(new Map());
  const guidesRef = useRef<SnapGuides>({ v: [], h: [] });
  const cropGuidesRef = useRef<SnapGuides>({ v: [], h: [] });
  /** eerste echte paint al gehad (reset bij mount) */
  const paintedRef = useRef(false);
  /** last pointer position (screen-local) for hover highlighting. */
  const mouseRef = useRef<Pt>({ x: 0, y: 0 });
  /** laatste muispositie in wereld-px, voor live cursor + selectie-updates */
  const lastWorldRef = useRef<{ x: number; y: number } | null>(null);

  /** Eigen muispositie (+ huidige selectie) aanbieden aan de live-koppeling. */
  const emitCursor = (e: React.PointerEvent) => {
    const fn = handlersRef.current.onLiveCursor;
    if (!fn) return;
    const wp = screenToWorld(screenToLocal(e), camRef.current);
    const rounded = { x: Math.round(wp.x), y: Math.round(wp.y) };
    lastWorldRef.current = rounded;
    fn(rounded, propsRef.current.selectedIds);
  };
  const spaceRef = useRef(false);
  const gRef = useRef<Gesture>({ k: "none" });
  const ptrsRef = useRef<Map<number, Pt>>(new Map());
  const hostSize = useRef({ w: 0, h: 0 });
  /** devicePixelRatio waarmee de buffers geschaald zijn (check per frame) */
  const dprRef = useRef(1);
  /** true zodra de laatste pointer geen muis was: grotere hit-targets voor vingers */
  const coarseRef = useRef(false);
  /** neerzetpositie per pointer: tik (geen sleep) vs drag onderscheiden */
  const downPosRef = useRef(new Map<number, Pt>());
  /** selectie-actie die pas bij tik-up loopt (touch): slepen opent nooit de inspector */
  const pendingSelectRef = useRef<null | (() => void)>(null);
  /** tik op een planting (bed al geselecteerd): bij loslaten zonder te slepen
   *  wordt dit gewas alsnog geselecteerd; bij slepen versleept het bed. */
  const tapCropRef = useRef<{ eId: string; instanceId: string } | null>(null);
  /** laatste tik-selectie: een snelle tweede tik (dubbelklik) op hetzelfde
   *  gewas houdt het geselecteerd i.p.v. meteen weer te deselecteren. */
  const lastTapSelectRef = useRef<{ instanceId: string; t: number } | null>(null);
  /** true zolang er een live preview naar andere editors is gestuurd die nog
   *  opgeruimd moet worden (anders blijft er een ghost staan) */
  const previewSentRef = useRef(false);
  const wasEmptyClickRef = useRef(false);
  /** veld-naamkaartjes van het laatste frame (scherm-px): een klik erop
   *  selecteert het hele veld, net als een klik op het kader zelf. */
  const veldChipsRef = useRef<{ id: string; x: number; y: number; w: number; h: number }[]>([]);

  const screenToLocal = (e: { clientX: number; clientY: number }): Pt => {
    const el = gpuRef.current ?? hostRef.current;
    const r = el!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const worldToScreen = (p: Pt, c: Cam): Pt => ({ x: p.x * c.zoom + c.x, y: p.y * c.zoom + c.y });
  const screenToWorld = (s: Pt, c: Cam): Pt => ({ x: (s.x - c.x) / c.zoom, y: (s.y - c.y) / c.zoom });

  const doBusy = (b: boolean) => handlersRef.current.onBusyChange?.(b);

  /** Relay the current draft positions so other editors see the drag live. */
  const emitLiveMoves = () => {
    const updates = [...draftRef.current.entries()].map(([id, r]) => ({
      id,
      x: Math.round(r.x),
      y: Math.round(r.y),
      widthM: Math.round(r.w) / PX_PER_M,
      heightM: Math.round(r.h) / PX_PER_M,
    }));
    if (updates.length > 0) handlersRef.current.onLiveMove?.(updates);
  };

  /** Relay a live crop (plant) drag so other editors see it move in real time. */
  const emitLiveCropMoves = (eId: string, instanceId: string) => {
    const bed = propsRef.current.elements.find((e) => e.id === eId);
    const r = cropDraftRef.current.get(instanceId);
    if (!bed || bed.type !== "bed" || !r) return;
    const crops = bed.crops.map((a) =>
      a.instanceId === instanceId
        ? {
            ...a,
            area: {
              x: Math.round(((r.x - bed.x) / PX_PER_M) * 100) / 100,
              y: Math.round(((r.y - bed.y) / PX_PER_M) * 100) / 100,
              w: Math.round((r.w / PX_PER_M) * 100) / 100,
              h: Math.round((r.h / PX_PER_M) * 100) / 100,
            },
          }
        : a
    );
    handlersRef.current.onLiveMove?.([{ id: eId, crops }]);
  };

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
  /** Translate a gaas: free anchors follow the drag delta, pole-pinned ones stay.
   *  Always based on the committed anchors — callers pass the total delta since
   *  the gesture started, so building on the live draft would stack it twice. */
  const moveGaas = (el: GardenElement, dx: number, dy: number): GaasData => {
    const g = el.gaas!;
    const map = (p: GaasPin): GaasPin =>
      p.poleId ? { ...p } : { x: Math.round(p.x + dx), y: Math.round(p.y + dy) };
    return { a: map(g.a), b: map(g.b) };
  };
  /** Resize a gaas: scale the free anchors relative to the selection bounding box.
   *  Same as above: scale factors are absolute (vs. the gesture's start box),
   *  so they must apply to the committed anchors, not the live draft. */
  const scaleGaas = (el: GardenElement, union: R, r: R, sx: number, sy: number): GaasData => {
    const g = el.gaas!;
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
    // A lone gaas line has no drawn handles (its anchors don't scale with a
    // bbox), so there is nothing to grab either.
    if (p.selectedIds.length === 1) {
      const only = p.elements.find((e) => e.id === p.selectedIds[0]);
      if (only && only.object === "gaas" && only.gaas) return null;
    }
    const union = unionOfSelected();
    if (!union) return null;
    // Vingers zijn dikker dan een cursor: ruimere targets op touch.
    const HH = coarseRef.current ? 30 : HANDLE_HIT;
    const EH = coarseRef.current ? 18 : EDGE_HIT;
    const p0 = worldToScreen({ x: union.x, y: union.y }, c);
    const p1 = worldToScreen({ x: union.x + union.w, y: union.y + union.h }, c);
    const corners: [Dir, number, number][] = [
      ["nw", p0.x, p0.y], ["ne", p1.x, p0.y], ["sw", p0.x, p1.y], ["se", p1.x, p1.y],
    ];
    for (const [dir, hx, hy] of corners) {
      if (Math.abs(sp.x - hx) <= HH && Math.abs(sp.y - hy) <= HH) return dir;
    }
    // whole edge is a resize target (band a few px thick along each side)
    const inX = sp.x >= p0.x - EH && sp.x <= p1.x + EH;
    const inY = sp.y >= p0.y - EH && sp.y <= p1.y + EH;
    if (inX && sp.y >= p0.y - EH && sp.y <= p0.y + EH) return "n";
    if (inX && sp.y >= p1.y - EH && sp.y <= p1.y + EH) return "s";
    if (inY && sp.x >= p0.x - EH && sp.x <= p0.x + EH) return "w";
    if (inY && sp.x >= p1.x - EH && sp.x <= p1.x + EH) return "e";
    return null;
  };

  const hitItem = (wp: Pt): GardenElement | null => {
    const els = propsRef.current.elements;
    // Velden liggen vaak onder bedden en paden: die winnen eerst, zodat je
    // altijd iets ín een veld kunt aanklikken. Pas als er niets anders raakt,
    // pakt het veld zelf de klik (om te verplaatsen of resizen).
    let veld: GardenElement | null = null;
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i];
      const r = rOf(el);
      if (wp.x >= r.x && wp.x <= r.x + r.w && wp.y >= r.y && wp.y <= r.y + r.h) {
        if (el.type === "veld") veld ??= el;
        else return el;
      }
    }
    return veld;
  };

  /** Veld-naamkaartje onder de pointer (scherm-px), zodat een klik op de naam
   *  hetzelfde doet als een klik op het kader: het hele veld selecteren. */
  const hitVeldChip = (sp: Pt): GardenElement | null => {
    const chips = veldChipsRef.current;
    for (let i = chips.length - 1; i >= 0; i--) {
      const ch = chips[i];
      if (sp.x >= ch.x && sp.x <= ch.x + ch.w && sp.y >= ch.y && sp.y <= ch.y + ch.h) {
        const el = propsRef.current.elements.find((e) => e.id === ch.id);
        if (el) return el;
      }
    }
    return null;
  };

  // Objects are drawn on top of beds/paths, so they win the hit-test first.
  // Round objects (poles) are hit-tested against their circle, not the square.
  const hitObjectElement = (wp: Pt): GardenElement | null => {    const els = propsRef.current.elements;
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

  /** The bed under a world point (topmost first), if any. */
  const bedAt = (wp: Pt): GardenElement | null => {
    const els = propsRef.current.elements;
    for (let i = els.length - 1; i >= 0; i--) {
      const el = els[i];
      if (el.type !== "bed") continue;
      const r = rOf(el);
      if (wp.x >= r.x && wp.x <= r.x + r.w && wp.y >= r.y && wp.y <= r.y + r.h) return el;
    }
    return null;
  };

  /** Endpoint of the singly-selected gaas line under the pointer (screen px),
   *  so a line can be made longer/shorter by dragging its ends. */
  const hitGaasEndpoint = (sp: Pt, c: Cam): { id: string; end: "a" | "b" } | null => {
    const p = propsRef.current;
    if (p.tool !== "select" || p.selectedIds.length !== 1) return null;
    const el = p.elements.find((e) => e.id === p.selectedIds[0]);
    if (!el || el.object !== "gaas" || !el.gaas) return null;
    const { a, b } = gaasEndsOf(el);
    const sA = worldToScreen(a, c);
    const sB = worldToScreen(b, c);
    const T = coarseRef.current ? 22 : 14;
    if (Math.hypot(sp.x - sA.x, sp.y - sA.y) <= T) return { id: el.id, end: "a" };
    if (Math.hypot(sp.x - sB.x, sp.y - sB.y) <= T) return { id: el.id, end: "b" };
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
    // The selected plant is tested first so its handles can never be stolen by an
    // overlapping neighbour; the rest are tested topmost-first.
    const rest = bed.crops.filter((a) => a.instanceId !== p.selectedCropId).reverse();
    const sel = p.selectedCropId ? bed.crops.find((a) => a.instanceId === p.selectedCropId) : undefined;
    const order = sel ? [sel, ...rest] : rest;
    for (const a of order) {
      const r = cropRectOf(bed, a);
      const p0 = worldToScreen({ x: r.x, y: r.y }, c);
      const p1 = worldToScreen({ x: r.x + r.w, y: r.y + r.h }, c);
      const HH = coarseRef.current ? 30 : HANDLE_HIT;
      const EH = coarseRef.current ? 18 : EDGE_HIT;
      // corner handles work on any plant
      const corners: [Dir, number, number][] = [
        ["nw", p0.x, p0.y], ["ne", p1.x, p0.y], ["sw", p0.x, p1.y], ["se", p1.x, p1.y],
      ];
      for (const [dir, hx, hy] of corners) {
        if (Math.abs(sp.x - hx) <= HH && Math.abs(sp.y - hy) <= HH)
          return { a, dir };
      }
      // edge resize: only on the selected plant (or a lone plant) so grabbing a
      // border resizes it instead of dragging a neighbouring plant.
      const isSel = p.selectedCropId === a.instanceId;
      if (isSel || bed.crops.length === 1) {
        const inX = sp.x >= p0.x - EH && sp.x <= p1.x + EH;
        const inY = sp.y >= p0.y - EH && sp.y <= p1.y + EH;
        if (inX && sp.y >= p0.y - EH && sp.y <= p0.y + EH) return { a, dir: "n" };
        if (inX && sp.y >= p1.y - EH && sp.y <= p1.y + EH) return { a, dir: "s" };
        if (inY && sp.x >= p0.x - EH && sp.x <= p0.x + EH) return { a, dir: "w" };
        if (inY && sp.x >= p1.x - EH && sp.x <= p1.x + EH) return { a, dir: "e" };
      }
    }
    return null;
  };

  const hitCrop = (wp: Pt, bed: GardenElement): CropAssignment | null => {
    // Kleine tolerantie (4px) zodat een klik net naast de rand van een
    // gewas het gewas zelf pakt in plaats van het bed eronder.
    const pad = 4;
    for (let i = bed.crops.length - 1; i >= 0; i--) {
      const a = bed.crops[i];
      const r = cropRectOf(bed, a);
      if (
        wp.x >= r.x - pad &&
        wp.x <= r.x + r.w + pad &&
        wp.y >= r.y - pad &&
        wp.y <= r.y + r.h + pad
      )
        return a;
    }
    return null;
  };

  const bedRefOf = (bed: GardenElement): R => {
    const r = rOf(bed);
    return { x: r.x, y: r.y, w: bed.widthM * PX_PER_M, h: bed.heightM * PX_PER_M };
  };

  // ---- gestures ----
  /**
   * Een veld is een kader: wie het veld versleept, sleept alles wat erin ligt
   * mee. Geeft het veld zelf plus de bedden/paden/vorwerpen ín het kader.
   */
  const veldMembers = (veld: GardenElement): string[] => {
    if (veld.type !== "veld") return [veld.id];
    const m = 2;
    const vx = veld.x;
    const vy = veld.y;
    const vw = veld.widthM * PX_PER_M;
    const vh = veld.heightM * PX_PER_M;
    const inside = propsRef.current.elements.filter((o) => {
      if (o.id === veld.id) return false;
      const r = rOf(o);
      return (
        r.x >= vx - m && r.y >= vy - m && r.x + r.w <= vx + vw + m && r.y + r.h <= vy + vh + m
      );
    });
    return [veld.id, ...inside.map((o) => o.id)];
  };
  // Pressing an object in the picker menu imports it (as a sibling element).
  // Muis: meteen slepen vanaf de pointer (klassiek drag & drop).
  // Touch/pen: pas slepen na >10px beweging (anders is scrollen in het menu
  // onmogelijk); een tik plaatst het voorwerp in het midden van de viewport.
  const spawnAt = (def: GardenObjectDef, wx: number, wy: number) => {
    const pw = def.widthM * PX_PER_M;
    const ph = def.heightM * PX_PER_M;
    const origin: R = {
      x: Math.round(wx - pw / 2),
      y: Math.round(wy - ph / 2),
      w: pw,
      h: ph,
    };
    const newId = handlersRef.current.onAddObject(def.key, origin.x, origin.y);
    if (!newId) return null;
    handlersRef.current.onSelect([newId]);
    handlersRef.current.onSelectCrop(null);
    return { newId, origin };
  };

  const startDragGesture = (id: string, origin: R, sp: Pt, pointerId: number) => {
    if (propsRef.current.locked) return;
gRef.current = { k: "drag", id, sp: { x: sp.x, y: sp.y }, origin };
    hostRef.current?.setPointerCapture(pointerId);
    doBusy(true);
    handlersRef.current.onObjectMenuOpenChange(false);
  };

const startObjectDrag = (def: GardenObjectDef, e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.pointerType !== "mouse") {
      const startX = e.clientX;
      const startY = e.clientY;
      const pid = e.pointerId;
      let moved = false;
      const cleanup = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pid || moved) return;
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) <= 10) return;
        moved = true;
        cleanup();
        const c = camRef.current;
        const sp = screenToLocal(ev);
        const wp = screenToWorld(sp, c);
        const s = spawnAt(def, wp.x, wp.y);
        if (!s) return;
        startDragGesture(s.newId, s.origin, sp, ev.pointerId);
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        cleanup();
        if (moved) return;
        // tik: in het midden van de viewport plaatsen
        const c = camRef.current;
        const { w, h } = hostSize.current;
        const cx = w > 0 ? (w / 2 - c.x) / c.zoom : 0;
        const cy = h > 0 ? (h / 2 - c.y) / c.zoom : 0;
        if (spawnAt(def, cx, cy)) {
          handlersRef.current.onObjectMenuOpenChange(false);
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      return;
    }
    e.preventDefault();
    const c = camRef.current;
    const sp = screenToLocal(e);
    const wp = screenToWorld(sp, c);
    const s = spawnAt(def, wp.x, wp.y);
    if (!s) return;
    startDragGesture(s.newId, s.origin, sp, e.pointerId);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    coarseRef.current = e.pointerType !== "mouse";
    const sp = screenToLocal(e);
    downPosRef.current.set(e.pointerId, sp);
    pendingSelectRef.current = null;
    const c = camRef.current;
    const p = propsRef.current;
    // clicking the canvas closes the object picker menu
    handlersRef.current.onObjectMenuOpenChange(false);

    // Eerste klik op een niet-geselecteerd element selecteert altijd eerst,
    // vóór alle handle- en drag-logica. Resize-handles van de huidige selectie
    // kunnen een klik op een ander element anders afvangen (zeker als een bed
    // bijna het hele veld vult). Slepen/handles kan bij een tweede druk.
    // (NB: geen arm() hier gebruiken — die is verderop gedeclareerd.)
    if (p.tool === "select" && (e.button === 0 || e.pointerType !== "mouse")) {
      const isTouch = e.pointerType !== "mouse";
      const wpt = screenToWorld(sp, c);
      const selectNow = (fn: () => void): boolean => {
        if (isTouch) {
          pendingSelectRef.current = fn;
          return true;
        }
        fn();
        e.currentTarget.setPointerCapture(e.pointerId);
        doBusy(false);
        return true;
      };
      const pickOther = (): boolean => {
        // Druk op de huidige selectie (resize-handle, geselecteerd element of
        // geselecteerd voorwerp) is nooit "iets anders": dan volgt slepen of
        // resizen in de normale flow hieronder. Zonder dit pikt zo'n druk het
        // bed erachter — verplaatsen/resizen van een voorwerp lukt dan nooit.
        if (hitHandle(sp, c)) return false;
        const obj = hitObjectElement(wpt);
        if (obj) {
          if (p.selectedIds.includes(obj.id)) return false;
          // Ctrl/Cmd+klik: toevoegen aan de selectie i.p.v. vervangen.
          const add = e.ctrlKey || e.metaKey;
          return selectNow(() => {
            if (add) handlersRef.current.onToggleSelect([obj.id], "add");
            else {
              handlersRef.current.onSelect([obj.id]);
              handlersRef.current.onSelectCrop(null);
            }
          });
        }
        const hit = hitItem(wpt);
        if (hit && p.selectedIds.includes(hit.id)) return false;
        const els = p.elements;
        for (let i = els.length - 1; i >= 0; i--) {
          const el = els[i];
          if (el.type === "veld" || p.selectedIds.includes(el.id)) continue;
          const r = rOf(el);
          if (wpt.x >= r.x && wpt.x <= r.x + r.w && wpt.y >= r.y && wpt.y <= r.y + r.h) {
            // Eerste klik pakt altijd het element (bed) zelf, ook op een
            // planting: pas de tweede klik (bed al geselecteerd) pakt het
            // gewas. Zo blijft het bed altijd bereikbaar.
            const members = veldMembers(el);
            const addEl = e.ctrlKey || e.metaKey;
            return selectNow(() => {
              if (addEl) handlersRef.current.onToggleSelect(members, "add");
              else {
                handlersRef.current.onSelect(members);
                handlersRef.current.onSelectCrop(null);
              }
            });
          }
        }
        return false;
      };
      if (pickOther()) return;
    }

    // multi-touch bookkeeping: record this pointer; a second finger becomes a
    // pinch (zoom + pan), overriding whatever single-finger gesture is active.
    ptrsRef.current.set(e.pointerId, sp);
    if (ptrsRef.current.size === 2) {
      // pinch is geen tik: uitgestelde selectie vervalt
      pendingSelectRef.current = null;
      const ids = [...ptrsRef.current.keys()] as [number, number];
      const p1 = ptrsRef.current.get(ids[0])!;
      const p2 = ptrsRef.current.get(ids[1])!;
      e.currentTarget.setPointerCapture(e.pointerId);
      gRef.current = {
        k: "pinch",
        ids,
        mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
        startDist: Math.max(1, Math.hypot(p2.x - p1.x, p2.y - p1.y)),
        cam: c,
      };
      // discard any in-progress single-finger draft so no ghost lingers
      draftRef.current.clear();
      gaasDraftRef.current.clear();
      cropDraftRef.current.clear();
      guidesRef.current = { v: [], h: [] };
      cropGuidesRef.current = { v: [], h: [] };
      wasEmptyClickRef.current = false;
      doBusy(true);
      return;
    }
    if (ptrsRef.current.size > 1) return; // ignore extra fingers beyond the pinch

    // middle mouse always pans
    if (e.button === 1) {
      wasEmptyClickRef.current = false;
      gRef.current = { k: "pan", sx: sp.x, sy: sp.y, lx: sp.x, ly: sp.y };
      e.currentTarget.setPointerCapture(e.pointerId);
      doBusy(true);
      return;
    }
    if (e.button !== 0) return;
    // Space, the "move" tool, and the frame-drawing for "frame" tool.
    if (p.tool === "move" || spaceRef.current) {
      // move tool = pan the camera only; it never moves objects
      wasEmptyClickRef.current = false;
      gRef.current = { k: "pan", sx: sp.x, sy: sp.y, lx: sp.x, ly: sp.y };
      e.currentTarget.setPointerCapture(e.pointerId);
      doBusy(true);
      return;
    }
    if (p.tool === "frame") {
      if (propsRef.current.locked) return;
      const start = screenToWorld(sp, c);
      gRef.current = { k: "frame", start, end: start };
      e.currentTarget.setPointerCapture(e.pointerId);
      doBusy(true);
      return;
    }
    if (p.tool === "crop") {
      if (propsRef.current.locked) return;
      // Een stuk gewas zetten: sleep een rechthoek (mag vanuit/in een bed
      // starten; bij loslaten wordt het bed onder start óf eind gebruikt).
      const start = screenToWorld(sp, c);
      const bed = bedAt(start);
      if (bed) {
        handlersRef.current.onSelect([bed.id]);
        handlersRef.current.onSelectCrop(null);
      }
      gRef.current = { k: "cropFrame", start, end: start };
      e.currentTarget.setPointerCapture(e.pointerId);
      doBusy(true);
      return;
    }
    if (p.tool === "gaas") {
      if (propsRef.current.locked) return;
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
    //
    // A plant inside a fully-selected bed is the exception: plantings are often
    // flush with the bed border, so their own corners and edges sit exactly on
    // the bed's bbox handles. The plant handles are therefore tested first and
    // suppress the bed handles, otherwise a planting could only ever be resized
    // by dragging the bed around it.
    //
    // Touch: eerst selecteren, dan pas slepen. Sleep je meteen op een NIET-
    // geselecteerd element, dan wordt het alleen geselecteerd en niet verplaatst
    // (voorkomt ook dat de inspector opent tijdens het slepen). Op muis
    // verandert er niets. Geeft true als het gebaar nu mag starten.
    const arm = (selectFn: () => void, alreadySelected: boolean) => {
      if (!coarseRef.current) {
        selectFn();
        return true;
      }
      if (alreadySelected) return true;
      pendingSelectRef.current = selectFn;
      return false;
    };
    const bedSel = selectedBedEl();
    const bedPlantable = bedSel !== null && bedSel.crops.length > 0;
    const cropHandleHit = bedPlantable ? hitCropHandle(sp, c, bedSel!) : null;
    const dirH = hitHandle(sp, c);
    if (p.tool === "select") {
      if (cropHandleHit && !dirH) {
        handlersRef.current.onSelectCrop(cropHandleHit.a.instanceId);
        if (propsRef.current.locked) return;
        gRef.current = {
          k: "cropResize",
          eId: bedSel!.id,
          instanceId: cropHandleHit.a.instanceId,
          dir: cropHandleHit.dir,
          origin: cropRectOf(bedSel!, cropHandleHit.a),
          bed: bedRefOf(bedSel!),
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        doBusy(true);
        return;
      }
      if (dirH && p.selectedIds.length > 0) {
        const origins = new Map<string, R>();
        for (const id of p.selectedIds) {
          const el = p.elements.find((e) => e.id === id)!;
          origins.set(id, rOf(el));
        }
        if (propsRef.current.locked) return;
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
      // Gaas endpoints win over the whole line: drag one end to make the
      // line longer or shorter.
      const endHit = hitGaasEndpoint(sp, c);
      if (endHit) {
        const gel = p.elements.find((e) => e.id === endHit.id)!;
        if (
          !arm(() => {
            handlersRef.current.onSelect([endHit.id]);
            handlersRef.current.onSelectCrop(null);
          }, p.selectedIds.includes(endHit.id))
        ) {
          return;
        }
        if (propsRef.current.locked) return;
        gRef.current = { k: "gaasEnd", id: endHit.id, end: endHit.end, origin: gel.gaas! };
        e.currentTarget.setPointerCapture(e.pointerId);
        doBusy(true);
        return;
      }
      const objHit = hitObjectElement(screenToWorld(sp, c));
      if (objHit) {
        if (p.selectedIds.includes(objHit.id)) {
          if (propsRef.current.locked) return;
          const origins = new Map<string, R>();
          origins.set(objHit.id, rOf(objHit));
          gRef.current = { k: "groupDrag", ids: [objHit.id], sp, origins, leadId: objHit.id };
        } else {
          // Ctrl/Cmd+klik: toevoegen aan de selectie (en meteen slepen).
          const addObj = e.ctrlKey || e.metaKey;
          if (
            !arm(() => {
              if (addObj) handlersRef.current.onToggleSelect([objHit.id], "add");
              else {
                handlersRef.current.onSelect([objHit.id]);
                handlersRef.current.onSelectCrop(null);
              }
            }, false)
          ) {
            return;
          }
          const origin = rOf(objHit);
          if (propsRef.current.locked) return;
gRef.current = { k: "drag", id: objHit.id, sp, origin };
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        doBusy(true);
        return;
      }
    }
    // Dragging a plant body beats grabbing the bed it sits in.
    if (bedPlantable) {
      const cHit = hitCrop(screenToWorld(sp, c), bedSel!);
      if (cHit) {
        // Al geselecteerd gewas: drukken start een gewas-drag, een tik zonder
        // te slepen deselecteert pas bij pointer-up. Nog-niet-geselecteerd
        // gewas: drukken start een BED-drag (het element blijft leidend) en
        // pas een tik zonder te slepen kiest het gewas bij pointer-up. Zo kun
        // je een bed altijd verslepen, ook als je op een planting drukt.
        // (Touch selecteert via de uitgestelde tik, zoals eerst.)
        const sameCrop = p.selectedCropId === cHit.instanceId;
        if (e.pointerType !== "mouse") {
          if (
            !arm(
              () => handlersRef.current.onSelectCrop(sameCrop ? null : cHit.instanceId),
              false
            )
          ) {
            return;
          }
          if (propsRef.current.locked) return;
          return;
        }
        if (propsRef.current.locked) return;
        if (sameCrop) {
          // Al geselecteerd: vasthouden en een gewas-drag starten. Deselecteren
          // gebeurt pas bij tik-up (met dubbelklik-tolerantie), zodat dubbel-
          // klikken het gewas gewoon geselecteerd houdt.
          gRef.current = {
            k: "cropDrag",
            eId: bedSel!.id,
            instanceId: cHit.instanceId,
            sp,
            origin: cropRectOf(bedSel!, cHit),
            bed: bedRefOf(bedSel!),
            wasSelected: true,
          };
        } else {
          handlersRef.current.onSelect([bedSel!.id]);
          handlersRef.current.onSelectCrop(cHit.instanceId);
          gRef.current = { k: "drag", id: bedSel!.id, sp, origin: bedRefOf(bedSel!) };
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        doBusy(true);
        return;
      }
      // clicked on bed area but outside any plant -> drop plant selection
      handlersRef.current.onSelectCrop(null);
    }
    // Een klik op een veld-naamkaartje selecteert het hele veld, net als een
    // klik op het kader zelf (het kaartje ligt erbuiten en raakt anders niets).
    const hit = hitVeldChip(sp) ?? hitItem(screenToWorld(sp, c));
    if (hit) {
      // Gewas direct selecteren: ook als het bed (of veld) al geselecteerd is,
      // pakt een klik op een planting het gewas zelf in één keer. Drukken op
      // een al geselecteerd gewas start een drag; tikken deselecteert bij up.
      if (hit.type === "bed" && hit.crops.length > 0) {
        const cHit = hitCrop(screenToWorld(sp, c), hit);
        if (cHit) {
          const sameCrop = p.selectedCropId === cHit.instanceId;
          // Ctrl/Cmd+klik: bed aan de selectie toevoegen i.p.v. vervangen.
          const addBed = e.ctrlKey || e.metaKey;
          if (
            !arm(() => {
              if (addBed) handlersRef.current.onToggleSelect([hit.id], "add");
              else handlersRef.current.onSelect([hit.id]);
              handlersRef.current.onSelectCrop(sameCrop ? null : cHit.instanceId);
            }, false)
          ) {
            return;
          }
          if (propsRef.current.locked) return;
          gRef.current = {
            k: "cropDrag",
            eId: hit.id,
            instanceId: cHit.instanceId,
            sp,
            origin: cropRectOf(hit, cHit),
            bed: bedRefOf(hit),
            wasSelected: sameCrop,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
          doBusy(true);
          return;
        }
      }
      const members = veldMembers(hit);
      const isMulti = members.length > 1;
      // Een bed dat alleen via een geselecteerd veld in de selectie zit
      // (niet zelfstandig) telt als niet-geselecteerd: klikken moet dan dat
      // ene bed pakken in plaats van niets te doen.
      const inSelectedVeld = p.selectedIds.some((id) => {
        const el = p.elements.find((e) => e.id === id);
        return !!el && el.type === "veld" && el.id !== hit.id && veldMembers(el).includes(hit.id);
      });
      const hitSelected = p.selectedIds.includes(hit.id) && !inSelectedVeld;
      if (!hitSelected) {
        // Eerste klik selecteert altijd (nooit direct slepen): zo kan een klik
        // op een element ín een geselecteerd veld nooit verloren gaan aan een
        // drag-gebaar. Slepen kan bij een tweede druk op de selectie.
        // Ctrl/Cmd+klik voegt toe aan de selectie i.p.v. te vervangen.
        const addMembers = e.ctrlKey || e.metaKey;
        if (
          !arm(() => {
            if (addMembers) handlersRef.current.onToggleSelect(members, "add");
            else {
              handlersRef.current.onSelect(members);
              handlersRef.current.onSelectCrop(null);
            }
          }, false)
        ) {
          return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        doBusy(false);
        return;
      }
      if (propsRef.current.locked) return;
      if (p.selectedIds.length > 1 || isMulti) {
        // al geselecteerd veld (met inhoud) of multi-selectie: alles meenemen
        const ids = p.selectedIds.length > 1 ? p.selectedIds : members;
        const origins = new Map<string, R>();
        for (const id of ids) {
          const el = p.elements.find((e) => e.id === id);
          if (el) origins.set(id, rOf(el));
        }
        gRef.current = { k: "groupDrag", ids, sp, origins, leadId: hit.id };
      } else {
        const origin = rOf(hit);
        gRef.current = { k: "drag", id: hit.id, sp, origin };
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      doBusy(true);
      return;
    }
    // empty space: on touch, dragging pans the view (a plain tap deselects);
    // on mouse it stays a selection box (marquee). A plain click deselects.
    if (e.pointerType === "touch") {
      wasEmptyClickRef.current = true;
      gRef.current = { k: "pan", sx: sp.x, sy: sp.y, lx: sp.x, ly: sp.y };
    } else {
      gRef.current = { k: "marquee", start: sp, end: sp };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    doBusy(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    coarseRef.current = e.pointerType !== "mouse";
    if (ptrsRef.current.has(e.pointerId)) {
      ptrsRef.current.set(e.pointerId, screenToLocal(e));
    }
    // Eigen muis live delen (de App throttlet het versturen).
    emitCursor(e);
    const g = gRef.current;
    if (g.k === "pinch") {
      const spL = screenToLocal(e);
      mouseRef.current = spL;
      const p1 = ptrsRef.current.get(g.ids[0]);
      const p2 = ptrsRef.current.get(g.ids[1]);
      if (p1 && p2) {
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const dist = Math.max(1, Math.hypot(p2.x - p1.x, p2.y - p1.y));
        const zoom = Math.max(0.1, Math.min(6, g.cam.zoom * (dist / g.startDist)));
        const wp = screenToWorld(g.mid, g.cam);
        camRef.current = { zoom, x: mid.x - wp.x * zoom, y: mid.y - wp.y * zoom };
      }
      return;
    }
    if (g.k === "none") {
      const sp = screenToLocal(e);
      mouseRef.current = sp;
      const c = camRef.current;
      const p = propsRef.current;
      let cur = "default";
      if (p.tool === "move" || spaceRef.current) {
        cur = spaceRef.current ? "grabbing" : "grab";
      } else if (p.tool === "select") {
        if (p.locked) {
          cur = "default";
        } else if (hitGaasEndpoint(sp, c)) {
          cur = "move";
        } else if (hitObjectElement(screenToWorld(sp, c))) {
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
            else if (hitVeldChip(sp) ?? hitItem(screenToWorld(sp, c))) cur = "pointer";
          }
        }
      } else if (p.tool === "frame" || p.tool === "gaas" || p.tool === "crop") {
        cur = "crosshair";
      }
      if (hostRef.current) hostRef.current.style.cursor = cur;
      return;
    }
    const sp = screenToLocal(e);
    const c = camRef.current;
    if (g.k === "pan") {
      const dx = sp.x - g.lx;
      const dy = sp.y - g.ly;
      g.lx = sp.x;
      g.ly = sp.y;
      camRef.current = { x: c.x + dx, y: c.y + dy, zoom: c.zoom };
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
      const el = propsRef.current.elements.find((e) => e.id === g.id);
      const isGaas = !!el && el.object === "gaas" && el.gaas;
      let res: { x: number; y: number; v: SnapLine[]; h: SnapLine[] };
      if (isGaas) {
        // gaas wordt vrij bewogen (geen midden-snap); geen spooklijnen tonen
        res = { x: moved.x, y: moved.y, v: [], h: [] };
      } else {
        res = propsRef.current.snap
          ? snapRect(moved, others, SNAP_SCREEN / c.zoom)
          : { x: moved.x, y: moved.y, v: [], h: [] };
      }
      if (el && el.object === "gaas" && el.gaas) {
        // translate the free anchors; pole-pinned ones stay pinned
        const draft = moveGaas(el, wcur.x - wstart.x, wcur.y - wstart.y);
        gaasDraftRef.current.set(g.id, draft);
      } else {
        draftRef.current.set(g.id, { x: res.x, y: res.y, w: moved.w, h: moved.h });
      }
      guidesRef.current = { v: res.v, h: res.h };
      emitLiveMoves();
      return;
    }
    if (g.k === "frame") {
      const b = screenToWorld(sp, c);
      gRef.current = { k: "frame", start: g.start, end: b };
      const rect = {
        x: Math.round(Math.min(g.start.x, b.x)),
        y: Math.round(Math.min(g.start.y, b.y)),
        w: Math.round(Math.abs(b.x - g.start.x)),
        h: Math.round(Math.abs(b.y - g.start.y)),
      };
      previewSentRef.current = true;
      handlersRef.current.onLivePreview?.({ kind: "frame", rect });
      return;
    }
    if (g.k === "ga") {
      gRef.current = { ...g, end: screenToWorld(sp, c) };
      const a = g.start;
      const b = gRef.current.end;
      previewSentRef.current = true;
      handlersRef.current.onLivePreview?.({ kind: "gaas", a: { x: Math.round(a.x), y: Math.round(a.y) }, b: { x: Math.round(b.x), y: Math.round(b.y) } });
      return;
    }
    if (g.k === "cropFrame") {
      // Tijdens het slepen de grootte live bijwerken, zodat je het stuk
      // gewas direct op maat tekent (preview in de draw-loop volgt vanzelf).
      gRef.current = { k: "cropFrame", start: g.start, end: screenToWorld(sp, c) };
      return;
    }
    if (g.k === "gaasEnd") {
      const wp = screenToWorld(sp, c);
      const el = propsRef.current.elements.find((e) => e.id === g.id);
      if (el && el.object === "gaas") {
        // free point follows the pointer; near a pole centre it snaps on
        let pin: GaasPin = { x: Math.round(wp.x), y: Math.round(wp.y) };
        let best = coarseRef.current ? 22 : 14;
        let pole: GardenElement | null = null;
        for (const o of propsRef.current.elements) {
          if (o.type !== "object" || o.object !== "pole") continue;
          const r = draftRef.current.get(o.id) ?? rectOf(o);
          const s = worldToScreen({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, c);
          const d = Math.hypot(sp.x - s.x, sp.y - s.y);
          if (d < best) {
            best = d;
            pole = o;
          }
        }
        if (pole) {
          const r = draftRef.current.get(pole.id) ?? rectOf(pole);
          pin = { poleId: pole.id, x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) };
          guidesRef.current = { v: [], h: [] };
        } else if (propsRef.current.snap) {
          // recht-snap: dicht bij horizontaal/verticaal wordt de lijn kaarsrecht
          const fixed = g.end === "a" ? pinPointOf(g.origin.b) : pinPointOf(g.origin.a);
          const dx = pin.x - fixed.x;
          const dy = pin.y - fixed.y;
          const dist = Math.hypot(dx, dy);
          let vGuide: SnapLine[] = [];
          let hGuide: SnapLine[] = [];
          if (dist > 2) {
            const deg = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
            const T = 4;
            if (deg < T) {
              // horizontaal: y gelijk aan het vaste uiteinde
              pin.y = Math.round(fixed.y);
              hGuide = [{ at: fixed.y, center: true, a: Math.min(fixed.x, pin.x), b: Math.max(fixed.x, pin.x) }];
            } else if (deg > 90 - T && deg < 90 + T) {
              // verticaal: x gelijk aan het vaste uiteinde
              pin.x = Math.round(fixed.x);
              vGuide = [{ at: fixed.x, center: true, a: Math.min(fixed.y, pin.y), b: Math.max(fixed.y, pin.y) }];
            }
          }
          guidesRef.current = { v: vGuide, h: hGuide };
        } else {
          guidesRef.current = { v: [], h: [] };
        }
        const next: GaasData = { ...g.origin, [g.end]: pin };
        gaasDraftRef.current.set(g.id, next);
      }
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
      const res = propsRef.current.snap
        ? snapRect(movedLead, others, SNAP_SCREEN / c.zoom)
        : { x: movedLead.x, y: movedLead.y, v: [], h: [] };
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
      emitLiveMoves();
      return;
    }
    if (g.k === "groupResize") {
      const wcur = screenToWorld(sp, c);
      const nr = resizeRect(g.union, g.dir, wcur);
      const sel = new Set(g.ids);
      const others = propsRef.current.elements
        .filter((el) => !sel.has(el.id))
        .map((el) => rOf(el));
      const sn = propsRef.current.snap
        ? snapResize(nr, g.dir, others, SNAP_SCREEN / c.zoom)
        : { r: nr, v: [], h: [] };
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
      emitLiveMoves();
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
      const res = propsRef.current.snap
        ? snapCropRect(moved, g.bed, others, SNAP_SCREEN / c.zoom)
        : { x: moved.x, y: moved.y, v: [], h: [] };
      // Containment holds with snapping off too: it is not an alignment concern.
      const fit = clampToBed(
        { x: Math.round(res.x), y: Math.round(res.y), w: g.origin.w, h: g.origin.h },
        g.bed
      );
      cropDraftRef.current.set(g.instanceId, fit);
      cropGuidesRef.current = { v: res.v, h: res.h };
      emitLiveCropMoves(g.eId, g.instanceId);
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
      const sn = propsRef.current.snap
        ? snapCropResize(nr, g.dir, g.bed, others, SNAP_SCREEN / c.zoom)
        : {
            r: (() => {
              const c = clampToBed(nr, g.bed);
              return { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.w), h: Math.round(c.h) };
            })(),
            v: [] as SnapLine[],
            h: [] as SnapLine[],
          };
      cropDraftRef.current.set(g.instanceId, sn.r);
      cropGuidesRef.current = { v: sn.v, h: sn.h };
      emitLiveCropMoves(g.eId, g.instanceId);
      return;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const id = e.pointerId;
    ptrsRef.current.delete(id);
    // Tik (geen sleep) op touch: de uitgestelde selectie alsnog uitvoeren.
    // Na slepen wordt pending genegeerd: de inspector opent alleen bij echt tikken.
    const down = downPosRef.current.get(id);
    downPosRef.current.delete(id);
    const pending = pendingSelectRef.current;
    pendingSelectRef.current = null;
    if (down && pending) {
      const up = screenToLocal(e);
      if (Math.hypot(up.x - down.x, up.y - down.y) <= 10) pending();
    }
    const g = gRef.current;
    if (g.k === "pinch") {
      // one finger still down -> keep panning with it; none -> end
      tapCropRef.current = null;
      if (ptrsRef.current.size === 1) {
        const [, pos] = [...ptrsRef.current.entries()][0];
        gRef.current = { k: "pan", sx: pos.x, sy: pos.y, lx: pos.x, ly: pos.y };
        wasEmptyClickRef.current = false;
      } else {
        gRef.current = { k: "none" };
        doBusy(false);
      }
      return;
    }
    doBusy(false);
    if (g.k === "drag") {
      // Tik (geen sleep) op een planting terwijl het bed al geselecteerd was:
      // kies dan alsnog het gewas; bij echt slepen versleepte het bed.
      const tap = tapCropRef.current;
      tapCropRef.current = null;
      if (tap && tap.eId === g.id && down) {
        const up = screenToLocal(e);
        if (Math.hypot(up.x - down.x, up.y - down.y) <= 10) {
          handlersRef.current.onSelectCrop(tap.instanceId);
          lastTapSelectRef.current = { instanceId: tap.instanceId, t: Date.now() };
          draftRef.current.delete(g.id);
          gaasDraftRef.current.delete(g.id);
          guidesRef.current = { v: [], h: [] };
          gRef.current = { k: "none" };
          if (hostRef.current) hostRef.current.style.cursor = "default";
          return;
        }
      }
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
    } else if (g.k === "gaasEnd") {
      const gd = gaasDraftRef.current.get(g.id);
      if (gd) handlersRef.current.onApplyChanges([{ id: g.id, gaas: gd }]);
      gaasDraftRef.current.delete(g.id);
      guidesRef.current = { v: [], h: [] };
    } else if (g.k === "marquee") {
      const p = propsRef.current;
      const a = screenToWorld(g.start, camRef.current);
      const b = screenToWorld(g.end, camRef.current);
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x);
      const h = Math.abs(b.y - a.y);
      // Ctrl/Cmd ingedrukt bij loslaten: gevonden elementen toevoegen aan de
      // selectie i.p.v. vervangen; een tik zonder sleep wist dan niets.
      const add = e.ctrlKey || e.metaKey;
      if (w > 2 && h > 2) {
        const found = p.elements
          .filter((el) => {
            // Gaas is a thin line: only grab it when the box actually crosses
            // the line, so a bed underneath doesn't get selected along with it.
            if (el.object === "gaas" && el.gaas) {
              const { a, b } = gaasEndsOf(el);
              return segIntersectsRect(a.x, a.y, b.x, b.y, x, y, w, h);
            }
            const r = rOf(el);
            return r.x + r.w >= x && r.x <= x + w && r.y + r.h >= y && r.y <= y + h;
          })
          .map((el) => el.id);
        if (add) {
          if (found.length > 0) handlersRef.current.onToggleSelect(found, "add");
        } else {
          handlersRef.current.onSelect(found);
        }
      } else if (!add) {
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
      // Tik (geen sleep) op een al geselecteerd gewas: deselecteren i.p.v.
      // een no-op commit — behalve bij een snelle tweede tik (dubbelklik):
      // die houdt het gewas juist geselecteerd.
      if (g.k === "cropDrag" && g.wasSelected) {
        const up = screenToLocal(e);
        if (down && Math.hypot(up.x - down.x, up.y - down.y) <= 10) {
          const m = lastTapSelectRef.current;
          if (m && m.instanceId === g.instanceId && Date.now() - m.t < 450) {
            lastTapSelectRef.current = null;
            handlersRef.current.onSelectCrop(g.instanceId);
          } else {
            handlersRef.current.onSelectCrop(null);
          }
          cropDraftRef.current.delete(g.instanceId);
          cropGuidesRef.current = { v: [], h: [] };
          guidesRef.current = { v: [], h: [] };
          gRef.current = { k: "none" };
          if (hostRef.current) hostRef.current.style.cursor = "default";
          return;
        }
      }
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
        // Vaste tussenafstand: na slepen/ resizen het aantal rijen/kolommen
        // herberekenen uit de nieuwe maat (groter vlak = meer rijen).
        const a = bed.crops.find((c) => c.instanceId === g.instanceId);
        const cat = propsRef.current.catalog.find((cr) => cr.id === a?.cropId);
        const f = fitCropCounts(
          ar.w,
          ar.h,
          a?.rowSpacing ?? cat?.rowSpacing ?? 0.3,
          a?.plantSpacing ?? cat?.plantSpacing ?? 0.2,
          a?.padding ?? 0.1
        );
        handlersRef.current.onUpdateCrop(g.eId, g.instanceId, {
          area: ar,
          rows: f.rows,
          cols: f.cols,
        });
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
    } else if (g.k === "cropFrame") {
      // stuk gewas: kleiner dan een kwart van het bed = klik, dus een gangbare
      // stukgrootte zetten; anders precies het getekende vierkant gebruiken.
      const bed = bedAt(g.start) ?? bedAt(g.end);
      if (bed) {
        let x = Math.min(g.start.x, g.end.x);
        let y = Math.min(g.start.y, g.end.y);
        let w = Math.abs(g.end.x - g.start.x);
        let h = Math.abs(g.end.y - g.start.y);
        const br = rOf(bed);
        if (w < 12 || h < 12) {
          w = Math.min(br.w * 0.45, 0.5 * PX_PER_M);
          h = Math.min(br.h * 0.45, 0.4 * PX_PER_M);
          x = Math.max(br.x, Math.min(br.x + br.w - w, x));
          y = Math.max(br.y, Math.min(br.y + br.h - h, y));
        }
        // binnen het bed klemmen
        const nx = Math.max(br.x, Math.min(br.x + br.w - w, x));
        const ny = Math.max(br.y, Math.min(br.y + br.h - h, y));
        w = Math.min(w, br.x + br.w - nx);
        h = Math.min(h, br.y + br.h - ny);
        if (w > MIN && h > MIN) {
          handlersRef.current.onAddCropAt(bed.id, nx, ny, w, h);
        }
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
    // Altijd opruimen, ongeacht welk gebaar: een live preview die blijft
    // staan is precies die zwevende kopie (bed/gaas/gewas) die je zag.
    if (previewSentRef.current) {
      previewSentRef.current = false;
      handlersRef.current.onLivePreview?.({ kind: "clear" });
    }
    // En nooit een draft achterlaten: die zou bij de volgende keer dat je
    // iets anders sleept als spook meegetekend worden.
    draftRef.current.clear();
    gaasDraftRef.current.clear();
    cropDraftRef.current.clear();
    guidesRef.current = { v: [], h: [] };
    cropGuidesRef.current = { v: [], h: [] };
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

    const accent = (th: "light" | "dark") => (th === "dark" ? "#6fd6a4" : "#1f7a4c");

    // Buffers op devicePixelRatio-grootte (max 3x); tekenen gebeurt in
    // CSS-pixels via setTransform, dus alle bestaande tekencode blijft gelijk.
    const applySize = () => {
      const { w, h } = hostSize.current;
      if (w === 0 || h === 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      dprRef.current = dpr;
      ov.width = Math.max(1, Math.round(w * dpr));
      ov.height = Math.max(1, Math.round(h * dpr));
      renderer.resize(w, h);
    };

    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      hostSize.current = { w: r.width, h: r.height };
      applySize();
      if (!fitted) {
        fitted = true;
        fitView();
        const pending = pendingFocusRef.current;
        if (pending && applyFocus(pending.x, pending.y)) {
          pendingFocusRef.current = null;
        }
      }
    });
    ro.observe(host_);
    // Eerste maat direct van de host (niet van het canvas: diens CSS-maat is
    // 100%, en de buffer-maat hebben we hier juist zelf in de hand).
    {
      const r0 = host_.getBoundingClientRect();
      hostSize.current = { w: r0.width, h: r0.height };
      applySize();
    }

    const draw = () => {
      const p = propsRef.current;
      const c = camRef.current;
      const { w, h } = hostSize.current;
      if (w === 0 || h === 0) return;

      // eerste frame met echte maat: de host mag nu zichtbaar infaden
      // (daarvoor was hij transparant, zodat er nooit een leeg canvas popt)
      if (!paintedRef.current) {
        paintedRef.current = true;
        handlersRef.current.onFirstPaint?.();
      }

      const items: DrawItem[] = [];
      for (const el of p.elements) {
        if (el.type === "object") continue; // objects are drawn in their own pass
        if (el.type === "veld") continue; // velden zijn alleen een omlijning (overlay hieronder)
        const r = rOf(el);
        items.push({ rect: r, color: el.color, selected: false });
      }
      renderer.setBackground(p.theme === "dark" ? "#13161b" : "#eef1f5");
      renderer.render(items, c);

      // DPR kan lopend veranderen (zoom, ander scherm): buffers bijwerken.
      // Tekenen in CSS-pixels; de transform schaalt naar device-pixels.
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      if (dpr !== dprRef.current) applySize();
      ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
      // Overlay elke frame wissen! Zonder dit blijft elke tekening staan en
      // krijg je sporen/kopieën van gaas, voorwerpen en gewassen tijdens het
      // slepen. De achtergrond zelf tekent WebGL (setBackground): die canvas
      // ligt onder dit overlay, dus hier wissen haalt de bedden niet weg.
      ctx.clearRect(0, 0, w, h);

      // Veld-omlijningen: lichte vulling + stippellijn in de eigen kleur, zodat
      // ze als kader herkenbaar zijn zonder bedden en paden te verbergen.
      // rOf volgt de sleep-positie, dus dit beweegt live mee tijdens het slepen.
      for (const el of p.elements) {
        if (el.type !== "veld") continue;
        const r = rOf(el);
        const p0 = worldToScreen({ x: r.x, y: r.y }, c);
        const p1 = worldToScreen({ x: r.x + r.w, y: r.y + r.h }, c);
        const bw = p1.x - p0.x;
        const bh = p1.y - p0.y;
        if (bw < 2 || bh < 2) continue;
        const isSel = p.selectedIds.includes(el.id);
        ctx.save();
        ctx.globalAlpha = 0.10;
        ctx.fillStyle = el.color;
        ctx.fillRect(p0.x, p0.y, bw, bh);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = el.color;
        ctx.lineWidth = isSel ? 2.5 : 1.5;
        ctx.setLineDash([8, 5]);
        ctx.strokeRect(p0.x, p0.y, bw, bh);
        ctx.restore();
      }

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
          // crop's row/plant spacing. Tijdens het resizen live het maximum
          // tonen dat past (vaste afstand), zodat je rijen er al tijdens het
          // slepen bij ziet komen; bij loslaten wordt de telling opgeslagen.
          const rowSpacingM = a.rowSpacing ?? crop?.rowSpacing ?? 0.3;
          const plantSpacingM = a.plantSpacing ?? crop?.plantSpacing ?? 0.2;
          const gest = gRef.current;
          const liveResize =
            gest.k === "cropResize" && gest.instanceId === a.instanceId;
          const { spots, size } = plantPositions(
            { x: r.x, y: r.y, w: r.w, h: r.h },
            liveResize ? 0 : a.rows,
            liveResize ? undefined : a.cols,
            rowSpacingM,
            plantSpacingM,
            a.padding ?? 0.1,
            PX_PER_M
          );
          if (spots.length > 0 && bw >= 16 && bh >= 16) {
            ctx.globalAlpha = p.selectedCropId && !isSel ? 0.45 : 1;
            ctx.fillStyle = col;
            ctx.font = `${size * c.zoom}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const iconSize = size * c.zoom;
            for (const s of spots) {
              const sp = worldToScreen({ x: s.x, y: s.y }, c);
              drawCropIcon(ctx, crop?.icon, crop?.name, sp.x, sp.y, iconSize);
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
      veldChipsRef.current = [];
      for (const el of p.elements) {
        // Gaas krijgt zijn kaartje niet op de bbox-hoek (daar verdwijnt hij
        // onder de lijn), maar zwevend naast het midden van de lijn — altijd
        // met de lengte erbij, ook bij een horizontale lijn.
        if (el.object === "gaas" && el.gaas) {
          const { a, b } = gaasEndsOf(el);
          const sA = worldToScreen(a, c);
          const sB = worldToScreen(b, c);
          const n = segNormal(sA.x, sA.y, sB.x, sB.y);
          const fsG = Math.max(9, Math.min(13, 12 * c.zoom));
          const sizeTxtG = `${fmtM(gaasLengthM(el))} m`;
          ctx.textBaseline = "top";
          ctx.font = `600 ${fsG}px Inter, system-ui, sans-serif`;
          const nameWG = ctx.measureText(el.label || "Gaas").width;
          const smallFsG = Math.max(8, Math.min(10, 9 * c.zoom));
          ctx.font = `600 ${smallFsG}px Inter, system-ui, sans-serif`;
          const sizeWG = ctx.measureText(sizeTxtG).width;
          const chipWG = Math.max(nameWG, sizeWG) + 9 * 2;
          const chipHG = fsG + smallFsG + 5 * 2 + 1;
          const cxG = Math.max(chipWG / 2 + 2, Math.min(w - chipWG / 2 - 2, (sA.x + sB.x) / 2 + n.x * 26));
          const cyG = Math.max(chipHG / 2 + 2, Math.min(h - chipHG / 2 - 2, (sA.y + sB.y) / 2 + n.y * 26));
          const xG = cxG - chipWG / 2;
          const yG = cyG - chipHG / 2;
          ctx.fillStyle = chipBg;
          ctx.strokeStyle = chipBorder;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(xG, yG, chipWG, chipHG, 7);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = chipName;
          ctx.font = `600 ${fsG}px Inter, system-ui, sans-serif`;
          ctx.fillText(el.label || "Gaas", xG + 9, yG + 5 + (fsG - 10) / 2);
          ctx.fillStyle = chipMeta;
          ctx.font = `600 ${smallFsG}px Inter, system-ui, sans-serif`;
          ctx.fillText(sizeTxtG, xG + 9, yG + 5 + fsG + (smallFsG - 8) / 2 + 1);
          continue;
        }
        // Veld: naam + maten staan BUITEN het kader (bovenaan), zodat de
        // binnenkant vrij blijft voor bedden en paden.
        if (el.type === "veld") {
          const r = rOf(el);
          const p0 = worldToScreen({ x: r.x, y: r.y }, c);
          const p1 = worldToScreen({ x: r.x + r.w, y: r.y + r.h }, c);
          const bw = p1.x - p0.x;
          if (bw < 46) continue;
          const fsV = Math.max(9, Math.min(13, 12 * c.zoom));
          const sizeTxtV = `${fmtM(el.widthM)} × ${fmtM(el.heightM)}`;
          ctx.textBaseline = "top";
          ctx.font = `600 ${fsV}px Inter, system-ui, sans-serif`;
          const nameWV = ctx.measureText(el.label || "Veld").width;
          const smallFsV = Math.max(8, Math.min(10, 9 * c.zoom));
          ctx.font = `600 ${smallFsV}px Inter, system-ui, sans-serif`;
          const sizeWV = ctx.measureText(sizeTxtV).width;
          const chipWV = Math.max(nameWV, sizeWV) + 9 * 2;
          const chipHV = fsV + smallFsV + 5 * 2 + 1;
          // boven de rand; past het daar niet, dan eronder; anders binnenin
          let yV = p0.y - chipHV - 6;
          if (yV < 2) yV = p1.y + 6;
          if (yV + chipHV > h - 2) yV = p0.y + 4;
          const xV = Math.max(2, Math.min(w - chipWV - 2, p0.x));
          ctx.fillStyle = chipBg;
          // onthouden voor de klik: een tik op dit kaartje selecteert het hele veld
          veldChipsRef.current.push({ id: el.id, x: xV, y: yV, w: Math.min(chipWV, w - xV - 2), h: chipHV });
          ctx.strokeStyle = chipBorder;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(xV, yV, Math.min(chipWV, w - xV - 2), chipHV, 7);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = chipName;
          ctx.font = `600 ${fsV}px Inter, system-ui, sans-serif`;
          ctx.fillText(el.label || "Veld", xV + 9, yV + 5 + (fsV - 10) / 2);
          ctx.fillStyle = chipMeta;
          ctx.font = `600 ${smallFsV}px Inter, system-ui, sans-serif`;
          ctx.fillText(sizeTxtV, xV + 9, yV + 5 + fsV + (smallFsV - 8) / 2 + 1);
          continue;
        }
        // Paden tonen geen naam en geen maten op het canvas: alleen tijdens
        // het resizen verschijnt de maat (zie het selectie-label hieronder).
        if (el.type === "path") continue;
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

      // selected size label (Figma-style, below the selection's bounding box).
      // A lone gaas line gets a length chip at its midpoint instead, so the
      // label doesn't suggest a bed-sized box is selected.
      if (p.selectedIds.length > 0) {
        const singleGaas =
          p.selectedIds.length === 1
            ? (() => {
                const el = p.elements.find((e) => e.id === p.selectedIds[0]);
                return el && el.object === "gaas" && el.gaas ? el : null;
              })()
            : null;
        if (singleGaas) {
          const { a, b } = gaasEndsOf(singleGaas);
          const sA = worldToScreen(a, c);
          const sB = worldToScreen(b, c);
          // Aan de andere kant van de lijn dan het naamskaartje, zodat ze
          // elkaar nooit overlappen en de lijn vrij blijft.
          const n = segNormal(sA.x, sA.y, sB.x, sB.y);
          const txt = `${fmtM(gaasLengthM(singleGaas))} m`;
          const fs = Math.max(10, Math.min(13, 11 * c.zoom));
          ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
          ctx.textBaseline = "top";
          const tw = ctx.measureText(txt).width + 16;
          const th = fs + 7;
          const cx = (sA.x + sB.x) / 2 - n.x * 26;
          const cy = (sA.y + sB.y) / 2 - n.y * 26;
          const x = Math.max(2, Math.min(w - tw - 2, cx - tw / 2));
          const y = Math.max(2, Math.min(h - th - 2, cy - th / 2));
          ctx.fillStyle = accent(p.theme);
          ctx.beginPath();
          ctx.roundRect(x, y, tw, th, 4);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.95)";
          ctx.textBaseline = "middle";
          ctx.fillText(txt, x + 8, y + th / 2 + 1);
          ctx.textBaseline = "top";
        } else {
          const r = unionOfSelected();
          // Paden tonen hun maat alleen tijdens het resizen; een los
          // geselecteerd pad blijft verder helemaal label-vrij.
          const selEls = p.selectedIds
            .map((id) => p.elements.find((e) => e.id === id))
            .filter((e): e is GardenElement => !!e);
          const onlyPaths = selEls.length > 0 && selEls.every((e) => e.type === "path");
          const resizing = gRef.current.k === "groupResize";
          if (r && (!onlyPaths || resizing)) {
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
      }

      // Live aanwezigheid: muis + selectie van de andere editors. Selecties
      // krijgen een gekleurde omlijning met naam, de muis een pijltje met naam.
      // Stilgevallen cursors (> 4 s niets gehoord) tekenen we niet meer.
      {
        const nowMs = Date.now();
        const remotes = p.liveCursors?.current;
        if (remotes) {
          for (const [uid, lc] of remotes) {
            if (!lc || uid === p.currentUserId) continue;
            if (nowMs - lc.at > 4000) continue;
            const col = userColor(uid);
            const sel = lc.selection ?? [];
            sel.forEach((id, si) => {
              const el = p.elements.find((e) => e.id === id);
              if (!el) return;
              const rr = rOf(el);
              const q0 = worldToScreen({ x: rr.x, y: rr.y }, c);
              const q1 = worldToScreen({ x: rr.x + rr.w, y: rr.y + rr.h }, c);
              ctx.save();
              ctx.strokeStyle = col;
              ctx.lineWidth = 2;
              ctx.setLineDash([6, 4]);
              ctx.strokeRect(q0.x, q0.y, q1.x - q0.x, q1.y - q0.y);
              ctx.restore();
              // naamkaartje bij het eerste geselecteerde element
              if (si === 0) {
                const fsN = Math.max(10, Math.min(12, 11 * c.zoom));
                ctx.font = `600 ${fsN}px Inter, system-ui, sans-serif`;
                ctx.textBaseline = "top";
                const nw = ctx.measureText(lc.username).width + 16;
                const nh = fsN + 7;
                const nx = Math.max(2, Math.min(w - nw - 2, q0.x));
                const ny = Math.max(2, q0.y - nh - 4);
                ctx.fillStyle = col;
                ctx.beginPath();
                ctx.roundRect(nx, ny, nw, nh, 4);
                ctx.fill();
                ctx.fillStyle = "rgba(255,255,255,0.95)";
                ctx.textBaseline = "middle";
                ctx.fillText(lc.username, nx + 8, ny + nh / 2 + 1);
                ctx.textBaseline = "top";
              }
            });
            if (lc.cursor) {
              const s = worldToScreen(lc.cursor, c);
              const sc = Math.max(0.8, Math.min(1.4, c.zoom));
              ctx.save();
              ctx.translate(s.x, s.y);
              ctx.scale(sc, sc);
              ctx.fillStyle = col;
              ctx.strokeStyle = "rgba(255,255,255,0.9)";
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(0, 15);
              ctx.lineTo(4.2, 11.2);
              ctx.lineTo(6.6, 16.4);
              ctx.lineTo(9, 15.2);
              ctx.lineTo(6.6, 10.2);
              ctx.lineTo(11, 10.2);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
              ctx.restore();
              const fsC = 11;
              ctx.font = `600 ${fsC}px Inter, system-ui, sans-serif`;
              ctx.textBaseline = "top";
              const cw = ctx.measureText(lc.username).width + 14;
              const chh = fsC + 7;
              ctx.fillStyle = col;
              ctx.beginPath();
              ctx.roundRect(s.x + 12, s.y + 14, cw, chh, 4);
              ctx.fill();
              ctx.fillStyle = "rgba(255,255,255,0.95)";
              ctx.fillText(lc.username, s.x + 12 + 7, s.y + 14 + 4);
            }
          }
        }
      }

      // snap guides — solid + dot for a centre alignment, dashed for edges
      const drawGuide = (line: SnapLine, axis: "v" | "h") => {
        ctx.lineWidth = line.center ? 1.6 : 1.2;
        ctx.strokeStyle = "#f24822";
        ctx.setLineDash(line.center ? [] : [5, 4]);
        if (axis === "v") {
          const sx = worldToScreen({ x: line.at, y: 0 }, c).x;
          const ay = worldToScreen({ x: 0, y: line.a }, c).y;
          const by = worldToScreen({ x: 0, y: line.b }, c).y;
          ctx.beginPath();
          ctx.moveTo(sx, ay);
          ctx.lineTo(sx, by);
          ctx.stroke();
          if (line.center) {
            ctx.beginPath();
            ctx.arc(sx, (ay + by) / 2, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = "#f24822";
            ctx.fill();
          }
        } else {
          const sy = worldToScreen({ x: 0, y: line.at }, c).y;
          const ax = worldToScreen({ x: line.a, y: 0 }, c).x;
          const bx = worldToScreen({ x: line.b, y: 0 }, c).x;
          ctx.beginPath();
          ctx.moveTo(ax, sy);
          ctx.lineTo(bx, sy);
          ctx.stroke();
          if (line.center) {
            ctx.beginPath();
            ctx.arc((ax + bx) / 2, sy, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = "#f24822";
            ctx.fill();
          }
        }
        ctx.setLineDash([]);
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

      // crop piece preview (drawing a new planting inside a bed): toont meteen de
      // planten die erin passen, met de icoontjes van het gekozen gewas.
      if (gRef.current.k === "cropFrame") {
        const g = gRef.current as { k: "cropFrame"; start: Pt; end: Pt };
        const bed = bedAt(g.start) ?? bedAt(g.end);
        if (bed) {
          const br = rOf(bed);
          let rx = Math.min(g.start.x, g.end.x);
          let ry = Math.min(g.start.y, g.end.y);
          let rw = Math.abs(g.end.x - g.start.x);
          let rh = Math.abs(g.end.y - g.start.y);
          if (rw < 12 || rh < 12) {
            rw = Math.min(br.w * 0.45, 0.5 * PX_PER_M);
            rh = Math.min(br.h * 0.45, 0.4 * PX_PER_M);
            rx = Math.max(br.x, Math.min(br.x + br.w - rw, rx));
            ry = Math.max(br.y, Math.min(br.y + br.h - rh, ry));
          }
          const nx = Math.max(br.x, Math.min(br.x + br.w - rw, rx));
          const ny = Math.max(br.y, Math.min(br.y + br.h - rh, ry));
          rw = Math.min(rw, br.x + br.w - nx);
          rh = Math.min(rh, br.y + br.h - ny);
          const s0 = worldToScreen({ x: nx, y: ny }, c);
          const s1 = worldToScreen({ x: nx + rw, y: ny + rh }, c);
          const pw = s1.x - s0.x;
          const ph = s1.y - s0.y;
          const crop = p.catalog.find((cr) => cr.id === p.activeCropId);
          const col = crop?.color ?? accent(p.theme);
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = col;
          ctx.fillRect(s0.x, s0.y, pw, ph);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 4]);
          ctx.strokeRect(s0.x, s0.y, pw, ph);
          ctx.setLineDash([]);
          // preview van de plant-icoontjes
          if (pw > 6 && ph > 6) {
            const rowSpacingM = crop?.rowSpacing ?? 0.3;
            const plantSpacingM = crop?.plantSpacing ?? 0.2;
            const { spots, size } = plantPositions(
              { x: nx, y: ny, w: rw, h: rh },
              0,
              undefined,
              rowSpacingM,
              plantSpacingM,
              0.1,
              PX_PER_M
            );
            if (spots.length > 0 && pw >= 16 && ph >= 16) {
              ctx.fillStyle = col;
              ctx.font = `${size * c.zoom}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              drawCropIcon(
                ctx,
                crop?.icon,
                crop?.name,
                s0.x + pw / 2,
                s0.y + ph / 2,
                size * c.zoom
              );
              ctx.textAlign = "left";
              ctx.textBaseline = "top";
            }
          }
          if (pw > MIN && ph > MIN) {
            const wM = Math.max(0.05, Math.round((rw / PX_PER_M) * 20) / 20);
            const hM = Math.max(0.05, Math.round((rh / PX_PER_M) * 20) / 20);
            const txt = `${fmtM(wM)} × ${fmtM(hM)}${crop ? ` · ${crop.name}` : ""}`;
            const fs = Math.max(10, Math.min(13, 11 * c.zoom));
            ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
            const tw = ctx.measureText(txt).width + 16;
            const th = fs + 7;
            // Label direct onder het getekende vlakje, binnen de canvas
            // geklemd (w/h zijn hier de canvas-afmetingen, niet de rechthoek).
            const lx = Math.max(2, Math.min(w - tw - 2, s0.x));
            const below = s0.y + ph + 8;
            const above = s0.y - th - 8;
            const ly = below + th <= h - 2 ? below : Math.max(2, above);
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.roundRect(lx, ly, tw, th, 4);
            ctx.fill();
            ctx.fillStyle = "hsla(0,0%,100%,0.95)";
            ctx.textBaseline = "middle";
            ctx.fillText(txt, lx + 8, ly + th / 2 + 1);
            ctx.textBaseline = "top";
          }
        }
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

      // remote live ghost: what another editor is creating right now
      const rp = p.livePreview;
      if (rp) {
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = "#9b5cf6";
        ctx.lineWidth = 2;
        if (rp.kind === "frame") {
          const p0 = worldToScreen({ x: rp.rect.x, y: rp.rect.y }, c);
          const p1 = worldToScreen({ x: rp.rect.x + rp.rect.w, y: rp.rect.y + rp.rect.h }, c);
          ctx.globalAlpha = 0.12;
          ctx.fillStyle = "#9b5cf6";
          ctx.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
          ctx.globalAlpha = 0.85;
          ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
        } else if (rp.kind === "gaas") {
          const a = worldToScreen(rp.a, c);
          const b = worldToScreen(rp.b, c);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.fillStyle = "#9b5cf6";
          ctx.fillRect(a.x - 3, a.y - 3, 6, 6);
          ctx.fillRect(b.x - 3, b.y - 3, 6, 6);
        }
        ctx.restore();
      }

      // selected outline + handles. A lone gaas line is highlighted along the
      // line itself (a bbox would sit on top of the bed underneath and look
      // like the bed is selected too); everything else keeps the union box.
      if (p.tool === "select" && p.selectedIds.length > 0) {
        const singleGaas =
          p.selectedIds.length === 1
            ? (() => {
                const el = p.elements.find((e) => e.id === p.selectedIds[0]);
                return el && el.object === "gaas" && el.gaas ? el : null;
              })()
            : null;
        if (singleGaas) {
          const { a, b } = gaasEndsOf(singleGaas);
          const sA = worldToScreen(a, c);
          const sB = worldToScreen(b, c);
          const col = accent(p.theme);
          // soft accent glow just wider than the mesh band, plus ring markers
          // on both endpoints — no box, so nothing underneath looks selected.
          const t2 = Math.max(1.5, ((singleGaas.widthM || 0.1) * PX_PER_M * c.zoom) / 2);
          ctx.save();
          ctx.lineCap = "round";
          ctx.strokeStyle = col;
          ctx.globalAlpha = 0.45;
          ctx.lineWidth = t2 * 2 + 6;
          ctx.beginPath();
          ctx.moveTo(sA.x, sA.y);
          ctx.lineTo(sB.x, sB.y);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = "rgba(255,255,255,0.95)";
          ctx.lineWidth = 2;
          for (const s of [sA, sB]) {
            ctx.beginPath();
            ctx.arc(s.x, s.y, t2 + 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();
        } else {
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
              ctx.setLineDash([]);
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
      const zoom = Math.max(0.1, Math.min(6, c.zoom * factor));
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
      onPointerUp={(e) => onPointerUp(e)}
      onPointerCancel={(e) => {
        // afgebroken gesture: nooit selecteren
        downPosRef.current.delete(e.pointerId);
        pendingSelectRef.current = null;
        tapCropRef.current = null;
        onPointerUp(e);
      }}
      onPointerLeave={() => {
        if (hostRef.current) hostRef.current.style.cursor = "default";
        // Muis weg van het canvas: cursor meteen verbergen bij de anderen.
        handlersRef.current.onLiveCursor?.(null, propsRef.current.selectedIds);
      }}
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", touchAction: "none" }}
    >
      {/* width/height 100% is verplicht: een canvas is een replaced element en
          neemt anders zijn intrinsieke maat (= het width-attribuut = CSS-maat x
          dpr). Dan zou het canvas op een telefoon dpr keer te groot zijn. */}
      <canvas ref={gpuRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
      <canvas ref={ovRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
      {(objectMenuOpen || menuClosing) && (
        <ObjectMenu
          closing={menuClosing}
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
  closing,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  onClose: () => void;
  onItemPointerDown: (def: GardenObjectDef, e: React.PointerEvent) => void;
  closing: boolean;
}) {
  const s = search.trim().toLowerCase();
  const filtered = GARDEN_OBJECTS.filter(
    (o) =>
      !s ||
      o.name.toLowerCase().includes(s) ||
      o.keywords.toLowerCase().includes(s)
  );

  const dragStartY = useRef(0);
  const dragOffsetRef = useRef(0);
  const [dragOffset, setDragOffsetState] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [grabbed, setGrabbed] = useState(false);
  const [dragClosing, setDragClosing] = useState(false);

  const setDragOffset = (v: number) => {
    dragOffsetRef.current = v;
    setDragOffsetState(v);
  };

  const onGripDown = (e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    dragOffsetRef.current = 0;
    setDragClosing(false);
    setGrabbed(true);
    setDragging(true);
    setDragOffsetState(0);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onGripMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const next = Math.max(0, e.clientY - dragStartY.current);
    dragOffsetRef.current = next;
    setDragOffsetState(next);
  };
  const endDrag = () => {
    if (!dragging) return;
    setDragging(false);
    if (dragOffsetRef.current > 90) {
      setDragClosing(true);
      setDragOffset(window.innerHeight);
      onClose();
    } else {
      setDragOffset(0);
    }
  };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div
      className={`sow-modal-overlay${closing || dragClosing ? " closing" : ""}${dragClosing ? " drag-closing" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="sow-modal obj-menu-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Voorwerpen"
        style={
          grabbed
            ? {
                transform: `translateY(${dragOffset}px)`,
                transition: dragging
                  ? "none"
                  : "transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
                animation: "none",
              }
            : undefined
        }
      >
        <div
          className="sow-modal-grip"
          aria-hidden="true"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        <div className="sow-modal-head">
          <h3>
            <i className="fa-solid fa-shapes" aria-hidden="true" /> Voorwerpen
          </h3>
          <button
            type="button"
            className="sow-modal-close"
            onClick={onClose}
            aria-label="Sluiten"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
        <input
          className="obj-menu-search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Zoek voorwerp…"
          aria-label="Zoek voorwerp"
        />
        <div className="sow-modal-body">
          <div className="obj-menu-grid">
            {filtered.map((def) => (
              <button
                key={def.key}
                type="button"
                className="obj-menu-item"
                onPointerDown={(e) => onItemPointerDown(def, e)}
              >
                <i className={def.icon} aria-hidden="true" />
                <span>{def.name}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="obj-menu-empty">Geen resultaten.</div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
