import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const IDS = new WeakMap<Element, number>();
let nextId = 1;

function idOf(el: Element): number {
  let id = IDS.get(el);
  if (id === undefined) {
    id = nextId++;
    IDS.set(el, id);
  }
  return id;
}

const MIN_THUMB = 32;
const TICK_MS = 200;

interface Bar {
  id: number;
  top: number;
  height: number;
  right: number;
  thumbHeight: number;
  thumbTop: number;
  inner: boolean;
  popup: boolean;
}

function collectCandidates(pageMode: boolean): HTMLElement[] {
  const out: HTMLElement[] = [];
  const selector = pageMode
    ? "body, body *"
    : ".sow-modal, .sow-modal *, .insp, .insp *, .catdd-pop, .catdd-pop *";
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    if (!el.isConnected) continue;
    if (pageMode && (el === document.body || el === document.documentElement)) continue;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") continue;
    if (!/(auto|scroll|overlay)/.test(s.overflowY)) continue;
    const r = el.getBoundingClientRect();
    if (r.height <= 0 || r.width <= 0) continue;
    out.push(el);
  }
  return out;
}

export function CustomScrollbars() {
  const [pageMode, setPageMode] = useState(
    () =>
      !(window.matchMedia?.("(pointer: coarse), (max-width: 900px)").matches ?? false)
  );
  const [bars, setBars] = useState<Bar[]>([]);
  const candidates = useRef<HTMLElement[]>([]);
  const lastKey = useRef("");
  const prevBars = useRef(new Map<number, Bar>());
  const byId = useRef(new Map<number, HTMLElement>());
  const drag = useRef<{ el: HTMLElement; startY: number; startTop: number } | null>(null);

  const update = useCallback(() => {
    const next: Bar[] = [];
    const map = new Map<number, HTMLElement>();
    const prev = prevBars.current;
    for (const el of candidates.current) {
      if (!el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (r.height <= 0 || r.width <= 0) continue;
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (maxScroll <= 1) continue;
      const shell = el.closest(".sow-modal, .insp") as HTMLElement | null;
      const inner = shell !== null;
      const popupEl = el.closest(".catdd-pop") as HTMLElement | null;
      const popup = popupEl !== null;
      const id = idOf(el);
      map.set(id, el);

      const closing = el.closest(".sow-modal-overlay.closing") !== null;
      const animating =
        !closing &&
        ((shell?.getAnimations().some((a) => a.playState === "running") ?? false) ||
          (inner && shell !== null && getComputedStyle(shell).transform !== "none"));

      if (animating && prev.has(id)) {
        next.push(prev.get(id) as Bar);
        continue;
      }

      const trackH = inner ? r.height - 24 : r.height;
      const thumbHeight = Math.max(
        MIN_THUMB,
        Math.min(trackH, (trackH * el.clientHeight) / el.scrollHeight),
      );
      const popupRect = popupEl?.getBoundingClientRect();
      next.push({
        id,
        top: popup && popupRect ? r.top - popupRect.top : r.top + (inner ? 12 : 0),
        height: popup ? r.height : trackH,
        right: popup ? 4 : Math.max(0, window.innerWidth - r.right) + 4,
        thumbHeight,
        thumbTop: (el.scrollTop / maxScroll) * (trackH - thumbHeight),
        inner,
        popup,
      });
    }
    byId.current = map;
    prevBars.current = new Map(next.map((b) => [b.id, b]));
    const key = next
      .map(
        (b) =>
          `${b.id}:${Math.round(b.top)}:${Math.round(b.height)}:${Math.round(b.thumbHeight)}:${Math.round(b.thumbTop)}`,
      )
      .join("|");
    if (key === lastKey.current) return;
    lastKey.current = key;
    setBars(next);
  }, []);

  const rafPending = useRef(false);
  const scheduleUpdate = useCallback(() => {
    if (rafPending.current) return;
    rafPending.current = true;
    requestAnimationFrame(() => {
      rafPending.current = false;
      update();
    });
  }, [update]);

  const rescan = useCallback(() => {
    candidates.current = collectCandidates(pageMode);
    update();
  }, [pageMode, update]);

  const rescanPending = useRef(false);
  const scheduleRescan = useCallback(() => {
    if (rescanPending.current) return;
    rescanPending.current = true;
    requestAnimationFrame(() => {
      rescanPending.current = false;
      rescan();
    });
  }, [rescan]);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse), (max-width: 900px)");
    const sync = () => setPageMode(!mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    lastKey.current = "";
    rescan();

    window.addEventListener("scroll", scheduleUpdate, true);
    window.addEventListener("resize", scheduleRescan);

    const onMotionEnd = () => scheduleUpdate();
    document.addEventListener("transitionend", onMotionEnd, true);
    document.addEventListener("animationend", onMotionEnd, true);

    const beat = window.setInterval(pageMode ? update : scheduleUpdate, TICK_MS);

    const mo = new MutationObserver(scheduleRescan);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.removeEventListener("resize", rescan);
      document.removeEventListener("transitionend", onMotionEnd, true);
      document.removeEventListener("animationend", onMotionEnd, true);
      window.clearInterval(beat);
      mo.disconnect();
    };
  }, [pageMode, rescan, scheduleRescan, scheduleUpdate, update]);

  const onMove = useCallback((e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const maxScroll = d.el.scrollHeight - d.el.clientHeight;
    if (maxScroll <= 0) return;
    const r = d.el.getBoundingClientRect();
    const trackH = r.height - 24;
    const thumbHeight = Math.max(
      MIN_THUMB,
      Math.min(trackH, (trackH * d.el.clientHeight) / d.el.scrollHeight),
    );
    const travel = trackH - thumbHeight;
    if (travel <= 0) return;
    d.el.scrollTop = d.startTop + ((e.clientY - d.startY) / travel) * maxScroll;
  }, []);

  const onUp = useCallback(() => {
    drag.current = null;
    document.body.style.removeProperty("user-select");
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [onMove, onUp]);

  if (!bars.length) return null;

  return (
    <>
      {bars.map((bar) => {
        const node = (
          <div
            key={bar.id}
            id={`mainScrollbar-${bar.id}`}
            className={`main-scrollbar${bar.inner ? " inner" : ""}${bar.popup ? " popup" : ""}`}
            style={{ top: bar.top, height: bar.height, right: bar.right }}
            aria-hidden="true"
          >
            <div
              id={`mainScrollbarThumb-${bar.id}`}
              className="main-scrollbar-thumb"
              style={{ height: bar.thumbHeight, transform: `translateY(${bar.thumbTop}px)` }}
              onPointerDown={(e) => {
                const el = byId.current.get(bar.id);
                if (!el) return;
                e.preventDefault();
                drag.current = { el, startY: e.clientY, startTop: el.scrollTop };
                document.body.style.userSelect = "none";
              }}
            />
          </div>
        );
        if (bar.popup) {
          const el = byId.current.get(bar.id);
          const host = el?.closest(".catdd-pop") as HTMLElement | null;
          if (!host) return null;
          return createPortal(node, host);
        }
        return node;
      })}
    </>
  );
}
