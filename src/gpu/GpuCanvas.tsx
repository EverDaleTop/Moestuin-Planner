import { useCallback, useEffect, useRef } from "react";
import { GpuRenderer, type DrawItem } from "./Renderer";
import type { EditorTool, ElementType, GardenElement } from "../types";
import { PX_PER_M, fmtM } from "../storage";

interface ElementUpdate {
  id: string;
  x?: number;
  y?: number;
  widthM?: number;
  heightM?: number;
}

interface Props {
  elements: GardenElement[];
  tool: EditorTool;
  frameType: ElementType;
  selectedIds: string[];
  theme: "light" | "dark";
  onSelect: (ids: string[]) => void;
  onApplyChanges: (updates: ElementUpdate[]) => void;
  onAddFrame: (type: ElementType, x: number, y: number, wM: number, hM: number) => string;
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
interface Guides {
  v: number[];
  h: number[];
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
  | { k: "frame"; start: Pt; end: Pt };

function rectOf(el: GardenElement): R {
  return { x: el.x, y: el.y, w: el.widthM * PX_PER_M, h: el.heightM * PX_PER_M };
}



function snapRect(moved: R, others: R[]): { x: number; y: number; v: number[]; h: number[] } {
  let x = moved.x;
  let y = moved.y;
  let vLine: number | null = null;
  let hLine: number | null = null;
  let bestDx = SNAP;
  let bestDy = SNAP;
  for (const o of others) {
    for (const cand of [
      o.x,
      o.x + o.w - moved.w,
      o.x + o.w,
      o.x - moved.w,
      o.x + (o.w - moved.w) / 2,
    ]) {
      const d = Math.abs(cand - x);
      if (d < bestDx) { bestDx = d; x = cand; vLine = cand; }
    }
    for (const cand of [
      o.y,
      o.y + o.h - moved.h,
      o.y + o.h,
      o.y - moved.h,
      o.y + (o.h - moved.h) / 2,
    ]) {
      const d = Math.abs(cand - y);
      if (d < bestDy) { bestDy = d; y = cand; hLine = cand; }
    }
  }
  return { x, y, v: vLine === null ? [] : [vLine], h: hLine === null ? [] : [hLine] };
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

/** Snap the resize so the dragged edge(s) align with other elements' edges within SNAP. */
function snapResize(rect: R, dir: Dir, anchor: R, others: R[]): { r: R; v: number[]; h: number[] } {
  let { x, y, w, h } = rect;
  const vGuides: number[] = [];
  const hGuides: number[] = [];
  const cX: number[] = [];
  const cY: number[] = [];
  for (const o of others) {
    cX.push(o.x, o.x + o.w);
    cY.push(o.y, o.y + o.h);
  }
  const fixedRight = anchor.x + anchor.w;
  const fixedBottom = anchor.y + anchor.h;

  if (dir.includes("e")) {
    const target = x + w;
    let best = SNAP, snapped: number | null = null;
    for (const cand of cX) { const d = Math.abs(cand - target); if (d < best) { best = d; snapped = cand; } }
    if (snapped !== null) { w = Math.max(MIN, snapped - x); vGuides.push(x + w); }
  }
  if (dir.includes("w")) {
    const target = x;
    let best = SNAP, snapped: number | null = null;
    for (const cand of cX) { const d = Math.abs(cand - target); if (d < best) { best = d; snapped = cand; } }
    if (snapped !== null) { x = Math.min(snapped, fixedRight - MIN); w = fixedRight - x; vGuides.push(x); }
  }
  if (dir.includes("s")) {
    const target = y + h;
    let best = SNAP, snapped: number | null = null;
    for (const cand of cY) { const d = Math.abs(cand - target); if (d < best) { best = d; snapped = cand; } }
    if (snapped !== null) { h = Math.max(MIN, snapped - y); hGuides.push(y + h); }
  }
  if (dir.includes("n")) {
    const target = y;
    let best = SNAP, snapped: number | null = null;
    for (const cand of cY) { const d = Math.abs(cand - target); if (d < best) { best = d; snapped = cand; } }
    if (snapped !== null) { y = Math.min(snapped, fixedBottom - MIN); h = fixedBottom - y; hGuides.push(y); }
  }
  return { r: { x, y, w, h }, v: vGuides, h: hGuides };
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
  tool,
  frameType,
  selectedIds,
  theme,
  onSelect,
  onApplyChanges,
  onAddFrame,
  onBusyChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gpuRef = useRef<HTMLCanvasElement | null>(null);
  const ovRef = useRef<HTMLCanvasElement | null>(null);

  const propsRef = useRef({ elements, tool, frameType, selectedIds, theme });
  propsRef.current = { elements, tool, frameType, selectedIds, theme };
  const handlersRef = useRef({ onSelect, onApplyChanges, onAddFrame, onBusyChange });
  handlersRef.current = { onSelect, onApplyChanges, onAddFrame, onBusyChange };

  const camRef = useRef<Cam>({ x: 0, y: 0, zoom: 1 });
  const draftRef = useRef<Map<string, R>>(new Map());
  const guidesRef = useRef<Guides>({ v: [], h: [] });
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
      const c = camRef.current;
      const p = propsRef.current;
      let cur = "default";
      if (p.tool === "move" || spaceRef.current) {
        cur = spaceRef.current ? "grabbing" : "grab";
      } else if (p.tool === "select") {
        const dir = hitHandle(sp, c);
        if (dir) cur = dirCursor(dir);
        else if (hitItem(screenToWorld(sp, c))) cur = "move";
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
      const res = snapRect(moved, others);
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
      const res = snapRect(movedLead, others);
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
        if (r) updates.push({
          id,
          x: Math.round(r.x),
          y: Math.round(r.y),
          widthM: r.w / PX_PER_M,
          heightM: r.h / PX_PER_M,
        });
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
      }
    } else if (g.k === "pan") {
      if (wasEmptyClickRef.current) handlersRef.current.onSelect([]);
      wasEmptyClickRef.current = false;
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

      // snap guides
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#f24822";
      for (const vx of guidesRef.current.v) {
        const sx = worldToScreen({ x: vx, y: 0 }, c).x;
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, h);
        ctx.stroke();
      }
      for (const hy of guidesRef.current.h) {
        const sy = worldToScreen({ x: 0, y: hy }, c).y;
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(w, sy);
        ctx.stroke();
      }
      ctx.setLineDash([]);

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

      // frame preview
      if (gRef.current.k === "frame") {
        const g = gRef.current as { k: "frame"; start: Pt; end: Pt };
        const end = g.end;
        const p0 = worldToScreen(g.start, c);
        const p1 = worldToScreen(end, c);
        const x = Math.min(p0.x, p1.x);
        const y = Math.min(p0.y, p1.y);
        ctx.strokeStyle = "#0d99ff";
        ctx.lineWidth = 1.5;
        ctx.fillStyle = "rgba(13,153,255,0.12)";
        ctx.fillRect(x, y, Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y));
        ctx.strokeRect(x, y, Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y));
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
