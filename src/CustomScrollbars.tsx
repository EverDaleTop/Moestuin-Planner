import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Custom scrollbar: verbergt de native scrollbars en tekent zelf een thumb
 * naast elk scrollbaar element. De thumb is een gewone div, dus volledig
 * te stileren via CSS (geen ::-webkit-* nodig).
 *
 * Er worden twee lijsten bijgehouden:
 *  - candidates: alles met overflow-y auto/scroll (of het nu overloopt of niet)
 *  - bars:       alleen de subset die daadwerkelijk overloopt en zichtbaar is
 *
 * De scan voor candidates is duur en gebeurt alleen bij mount, DOM-wijziging
 * of resize. De thumb-meting is goedkoop en loopt continu mee.
 *
 * Let op: een scrollcontainer die van "past" naar "overloopt" gaat (bijv. een
 * formulier dat openklapt) triggert geen scroll- of resize-event, want de
 * eigen box van de container verandert niet. Daarom een korte hartslag plus
 * luisteren naar transitionend/animationend.
 */

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

/** Minimale thumbhoogte zodat hij altijd greepbaar blijft. */
const MIN_THUMB = 32;
/** Hartslag om nieuwe scrollbare content op te merken. */
const TICK_MS = 200;

interface Bar {
  id: number;
  top: number;
  height: number;
  right: number;
  thumbHeight: number;
  thumbTop: number;
  inner: boolean;
  innerTop: number;
}

/** Alle elementen met een verticale scroll-container (ongeacht overflow). */
function collectCandidates(pageMode: boolean): HTMLElement[] {
  const out: HTMLElement[] = [];
  const selector = pageMode
    ? "body, body *"
    : ".sow-modal, .sow-modal *, .insp, .insp *";
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
  /** id -> element, voor het slepen van de thumb */
  const byId = useRef(new Map<number, HTMLElement>());
  const drag = useRef<{ el: HTMLElement; startY: number; startTop: number } | null>(null);

  /** Goedkoop: alleen de thumb-metingen voor de kandidaten die overloopen. */
  const update = useCallback(() => {
    const next: Bar[] = [];
    const map = new Map<number, HTMLElement>();
    for (const el of candidates.current) {
      if (!el.isConnected) continue;
      const r = el.getBoundingClientRect();
      if (r.height <= 0 || r.width <= 0) continue;
      const maxScroll = el.scrollHeight - el.clientHeight;
      // niet overvol -> geen balk
      if (maxScroll <= 1) continue;
      const id = idOf(el);
      map.set(id, el);
      const shell = el.closest(".sow-modal, .insp") as HTMLElement | null;
      const inner = shell !== null;
      const trackH = inner ? r.height - 24 : r.height;
      const thumbHeight = Math.max(
        MIN_THUMB,
        Math.min(trackH, (trackH * el.clientHeight) / el.scrollHeight),
      );
      let relTop = 0;
      if (inner && shell && shell !== el) {
        let n: HTMLElement | null = el;
        while (n && n !== shell) {
          relTop += n.offsetTop;
          n = n.offsetParent as HTMLElement | null;
        }
      }
      next.push({
        id,
        top: r.top,
        height: trackH,
        right: Math.max(0, window.innerWidth - r.right) + 4,
        thumbHeight,
        thumbTop: (el.scrollTop / maxScroll) * (trackH - thumbHeight),
        inner,
        innerTop: inner ? relTop + el.scrollTop + 12 : 0,
      });
    }
    byId.current = map;
    const key = next
      .map(
        (b) =>
          `${b.id}:${Math.round(b.top)}:${Math.round(b.height)}:${Math.round(b.innerTop)}:${Math.round(b.thumbHeight)}:${Math.round(b.thumbTop)}`,
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

  /** Duur: heropen de kandidatenlijst (mount, DOM-wijziging, resize). */
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

    // scroll-events bubbelen niet, maar een capture-listener op window vangt ze wel.
    window.addEventListener("scroll", scheduleUpdate, true);
    window.addEventListener("resize", scheduleRescan);

    // een container die net gaat overlopen (openklappend formulier, geladen
    // afbeelding, enz.) geeft geen resize-event: deze vangen het wel.
    const onMotionEnd = () => scheduleUpdate();
    document.addEventListener("transitionend", onMotionEnd, true);
    document.addEventListener("animationend", onMotionEnd, true);

    const beat = window.setInterval(pageMode ? update : scheduleUpdate, TICK_MS);

    const mo = new MutationObserver(scheduleRescan);
    // Alleen childList: attributes zou mijn eigen inline styles terugvoeden
    // en zo een oneindige meet-lus veroorzaken.
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
    // verhouding tussen thumb-pixels en scroll-pixels, zodat de thumb niet
    // "te snel" schuift ten opzichte van de muis
    const thumbHeight = Math.max(
      MIN_THUMB,
      Math.min(r.height, (r.height * d.el.clientHeight) / d.el.scrollHeight),
    );
    const travel = r.height - thumbHeight;
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
            className={bar.inner ? "main-scrollbar inner" : "main-scrollbar"}
            style={
              bar.inner
                ? { top: bar.innerTop, height: bar.height, right: 4 }
                : { top: bar.top, height: bar.height, right: bar.right }
            }
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
        if (bar.inner) {
          const el = byId.current.get(bar.id);
          if (!el) return null;
          return createPortal(node, el);
        }
        return node;
      })}
    </>
  );
}