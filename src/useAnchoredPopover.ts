import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface PopoverPos {
  top: number;
  left: number;
  minWidth: number;
  ready: boolean;
}

/**
 * Anker een popup aan een knop, maar render hem buiten de DOM van de knop.
 *
 * Waarom: in de mobiele kopbalk zitten de tabbladen in een horizontale
 * scrollstrip (`overflow-x: auto`) en staan de meldings- en profielknop vlak
 * bij de rechterrand. Een `position: absolute` menu wordt dan óf geknipt door
 * de scrollstrip, óf schuift het uit beeld. Met een portal + `position: fixed`
 * en viewport-clamping is dat opgelost, ongeacht de context.
 */
export function useAnchoredPopover(
  open: boolean,
  align: "left" | "right" | "center" = "left"
) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const popRef = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState<PopoverPos | null>(null);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const pop = popRef.current;
    if (!trigger || !pop) return;
    const r = trigger.getBoundingClientRect();
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const margin = 8;

    let left =
      align === "right"
        ? r.right - pw
        : align === "center"
          ? r.left + r.width / 2 - pw / 2
          : r.left;
    // Past het niet links van de knop, dan toch proberen; en als het ook daar
    // niet past, vasthangen aan de schermrand.
    left = Math.max(margin, Math.min(left, window.innerWidth - pw - margin));
    if (left + pw > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - pw - margin);
    }

    let top = r.bottom + 8;
    if (top + ph > window.innerHeight - margin) {
      const above = r.top - 8 - ph;
      top = above > margin ? above : Math.max(margin, window.innerHeight - ph - margin);
    }

    setPos({ top, left, minWidth: Math.round(r.width), ready: true });
  }, [align]);

  // Eerst meten en plaatsen voordat de browser tekent: anders flitst het menu
  // even op de verkeerde plek.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onChange = () => place();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [open, place]);

  return { triggerRef, popRef, pos };
}