import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";

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
const EDGE = 10;

interface Bar {
  id: number;
  top: number;
  height: number;
  right: number;
  thumbHeight: number;
  thumbTop: number;
  inner: boolean;
  popup: boolean;
  sheet: boolean;
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
  const byId = useRef(new Map<number, HTMLElement>());
  const hosts = useRef(new Map<number, HTMLElement>());
  const anchors = useRef(new WeakMap<HTMLElement, HTMLElement>());
  const drag = useRef<{ el: HTMLElement; startY: number; startTop: number } | null>(null);

  const update = useCallback(() => {
    const next: Bar[] = [];
    const map = new Map<number, HTMLElement>();
    const hostMap = new Map<number, HTMLElement>();
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
      const host = popupEl ?? shell;
      if (!host && (inner || popup)) continue;
      const closing = el.closest(".sow-modal-overlay.closing") !== null;
      if (closing) continue;
      const id = idOf(el);
      map.set(id, el);

      if (host === el) {
        const grip = el.querySelector(".insp-grip") as HTMLElement | null;
        const gripH = grip && grip.offsetHeight > 0 ? grip.offsetHeight : 0;
        const trackTop = EDGE + gripH;
        const trackH = Math.max(MIN_THUMB, el.clientHeight - trackTop - EDGE);
        const thumbHeight = Math.max(
          MIN_THUMB,
          Math.min(trackH, (trackH * el.clientHeight) / el.scrollHeight),
        );
        hostMap.set(id, el);
        const padRight = parseFloat(getComputedStyle(el).paddingRight) || 0;
        next.push({
          id,
          top: EDGE + gripH,
          height: trackH,
          right: 4 - padRight,
          thumbHeight,
          thumbTop: (el.scrollTop / maxScroll) * (trackH - thumbHeight),
          inner,
          popup,
          sheet: true,
        });
        continue;
      }

      if (host) {
        hostMap.set(id, host);
        let top = EDGE;
        let left = 0;
        let n: HTMLElement | null = el;
        while (n && n !== host) {
          top += n.offsetTop;
          left += n.offsetLeft;
          n = n.offsetParent as HTMLElement | null;
        }
        const trackH = Math.max(MIN_THUMB, el.offsetHeight - EDGE * 2);
        const thumbHeight = Math.max(
          MIN_THUMB,
          Math.min(trackH, (trackH * el.clientHeight) / el.scrollHeight),
        );
        next.push({
          id,
          top,
          height: trackH,
          right: Math.max(0, host.clientWidth - (left + el.offsetWidth)) + EDGE,
          thumbHeight,
          thumbTop: (el.scrollTop / maxScroll) * (trackH - thumbHeight),
          inner,
          popup,
          sheet: false,
        });
        continue;
      }

      const trackH = r.height - 24;
      const thumbHeight = Math.max(
        MIN_THUMB,
        Math.min(trackH, (trackH * el.clientHeight) / el.scrollHeight),
      );
      next.push({
        id,
        top: r.top + 12,
        height: trackH,
        right: Math.max(0, window.innerWidth - r.right) + 4,
        thumbHeight,
        thumbTop: (el.scrollTop / maxScroll) * (trackH - thumbHeight),
        inner,
        popup,
        sheet: false,
      });
    }
    byId.current = map;
    hosts.current = hostMap;
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
    rescanPending.current = false;
    rescan();
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
    const shell = d.el.closest(".sow-modal, .insp, .catdd-pop") as HTMLElement | null;
    const trackH = shell
      ? Math.max(MIN_THUMB, d.el.offsetHeight - EDGE * 2)
      : d.el.getBoundingClientRect().height - 24;
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
            className={`main-scrollbar${bar.inner ? " inner" : ""}${bar.popup ? " popup" : ""}${bar.sheet ? " sheet" : ""}`}
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
        const host = hosts.current.get(bar.id);
        if (host) {
          if (bar.sheet) {
            let anchor = anchors.current.get(host);
            if (!anchor) {
              anchor = document.createElement("div");
              anchor.className = "scrollbar-anchor";
              host.prepend(anchor);
              anchors.current.set(host, anchor);
            }
            return createPortal(node, anchor);
          }
          return createPortal(node, host);
        }
        return node;
      })}
    </>
  );
}
