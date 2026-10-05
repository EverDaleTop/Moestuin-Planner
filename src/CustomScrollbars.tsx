import { useCallback, useEffect, useRef, useState } from "react";

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
}

/** Alle elementen met een verticale scroll-container (ongeacht overflow). */
function collectCandidates(): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of document.querySelectorAll<HTMLElement>("body, body *")) {
    if (!el.isConnected) continue;
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
  const [bars, setBars] = useState<Bar[]>([]);
  const candidates = useRef<HTMLElement[]>([]);
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
      const thumbHeight = Math.max(
        MIN_THUMB,
        Math.min(r.height, (r.height * el.clientHeight) / el.scrollHeight),
      );
      next.push({
        id,
        top: r.top,
        height: r.height,
        right: Math.max(0, window.innerWidth - r.right),
        thumbHeight,
        thumbTop: (el.scrollTop / maxScroll) * (r.height - thumbHeight),
      });
    }
    byId.current = map;
    setBars(next);
  }, []);

  /** Duur: heropen de kandidatenlijst (mount, DOM-wijziging, resize). */
  const rescan = useCallback(() => {
    candidates.current = collectCandidates();
    update();
  }, [update]);

  useEffect(() => {
    rescan();

    // scroll-events bubbelen niet, maar een capture-listener op window vangt ze wel.
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", rescan);

    // een container die net gaat overlopen (openklappend formulier, geladen
    // afbeelding, enz.) geeft geen resize-event: deze vangen het wel.
    const onMotionEnd = () => update();
    document.addEventListener("transitionend", onMotionEnd, true);
    document.addEventListener("animationend", onMotionEnd, true);

    const beat = window.setInterval(update, TICK_MS);

    const mo = new MutationObserver(rescan);
    // Alleen childList: attributes zou mijn eigen inline styles terugvoeden
    // en zo een oneindige meet-lus veroorzaken.
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", rescan);
      document.removeEventListener("transitionend", onMotionEnd, true);
      document.removeEventListener("animationend", onMotionEnd, true);
      window.clearInterval(beat);
      mo.disconnect();
    };
  }, [rescan, update]);

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

  return (
    <>
      {bars.map((bar) => (
        <div
          key={bar.id}
          id={`mainScrollbar-${bar.id}`}
          className="main-scrollbar"
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
      ))}
    </>
  );
}