import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/**
 * Eén gedeelde bottom-sheet/modaal-wrapper voor alle popups behalve de
 * elementen-popup op de tuinpagina (die blijft bewust als greep in beeld).
 *
 * Gedrag op mobiel:
 * - tik op de greep: sheet helemaal sluiten;
 * - omlaag slepen: sheet helemaal sluiten;
 * - klik naast de sheet: sluiten.
 *
 * Op desktop is de greep verborgen en werkt de popup zoals voorheen.
 */
interface SheetModalProps {
  /** Blijft true tijdens de sluit-animatie; daarna unmount de parent. */
  mounted: boolean;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Extra class op de sheet, bv. "crop-modal". */
  className?: string;
  /** Extra class op de overlay, bv. "presence-confirm-overlay". */
  overlayClassName?: string;
  role?: "dialog" | "alertdialog";
  ariaLabel?: string;
  /** Reset de sheet als dit verandert, bv. het bewerkte item. */
  resetKey?: unknown;
  /** Sluit-animatie van buitenaf (voor popups die zichzelf conditioneel renderen). */
  closing?: boolean;
  /** Greep tijdelijk niet bedienbaar, bv. terwijl er opgeslagen wordt. */
  gripDisabled?: boolean;
  /** Escape tijdelijk negeren, bv. terwijl er opgeslagen wordt. */
  escapeDisabled?: boolean;
  /** Sluiten bij klik op de achtergrond (standaard true). */
  closeOnBackdrop?: boolean;
  /** Achtergrond scroll-lock (standaard true). */
  lockScroll?: boolean;
}

export function SheetModal({
  mounted,
  open,
  onClose,
  children,
  className,
  overlayClassName,
  role = "dialog",
  ariaLabel,
  resetKey,
  closing = false,
  gripDisabled = false,
  escapeDisabled = false,
  closeOnBackdrop = true,
  lockScroll = true,
}: SheetModalProps) {
  const dragStartY = useRef(0);
  const dragOffsetRef = useRef(0);
  const overlayDownRef = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [grabbed, setGrabbed] = useState(false);
  const [dragClosing, setDragClosing] = useState(false);
  const [touched, setTouched] = useState(false);

  const setDragOffsetValue = (v: number) => {
    dragOffsetRef.current = v;
    setDragOffset(v);
  };

  // Bij (her)openen alles terugzetten.
  useEffect(() => {
    if (!mounted || !open) return;
    dragOffsetRef.current = 0;
    setDragOffset(0);
    setDragging(false);
    setDragClosing(false);
    setGrabbed(false);
    setTouched(false);
  }, [mounted, open, resetKey]);

  const onGripDown = (e: React.PointerEvent) => {
    if (gripDisabled) return;
    dragStartY.current = e.clientY;
    dragOffsetRef.current = 0;
    setDragClosing(false);
    setTouched(true);
    setGrabbed(true);
    setDragging(true);
    setDragOffset(0);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onGripMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const next = Math.max(0, e.clientY - dragStartY.current);
    dragOffsetRef.current = next;
    setDragOffset(next);
  };
  const endDrag = () => {
    if (!dragging) return;
    setDragging(false);
    if (dragOffsetRef.current > 90 || dragOffsetRef.current <= 4) {
      // Omlaag slepen of gewoon op de greep tikken: helemaal sluiten.
      // De greep blijft "vast" zodat de sheet vanaf de huidige sleepstand
      // naar beneden animeert i.p.v. eerst terug te springen naar open.
      setDragClosing(true);
      setDragOffsetValue(window.innerHeight);
      onClose();
    } else {
      // Niet ver genoeg: terugveren. `touched` houdt de openings-animatie uit,
      // zodat de opacity niet opnieuw gaat faden.
      setGrabbed(false);
      setDragOffsetValue(0);
    }
  };

  // Scroll-lock zolang de sheet open is.
  useEffect(() => {
    if (!mounted || !lockScroll) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted, lockScroll]);

  // Escape sluit de sheet.
  useEffect(() => {
    if (!mounted || escapeDisabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mounted, escapeDisabled, onClose]);

  if (!mounted) return null;

  const overlayClass = [
    "sow-modal-overlay",
    overlayClassName,
    closing || !open || dragClosing ? "closing" : "",
    dragClosing ? "drag-closing" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const sheetClass = [
    "sow-modal",
    className,
    dragging ? "dragging" : "",
    dragClosing ? "drag-closing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div
      className={overlayClass}
      onMouseDown={(e) => {
        overlayDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (
          closeOnBackdrop &&
          e.target === e.currentTarget &&
          overlayDownRef.current
        ) {
          onClose();
        }
        overlayDownRef.current = false;
      }}
    >
      <div
        className={sheetClass}
        role={role}
        aria-modal="true"
        aria-label={ariaLabel}
        style={
          grabbed
            ? {
                transform: `translateY(${dragOffset}px)`,
                transition: dragging
                  ? "none"
                  : "transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
                animation: "none",
              }
            : touched
              ? { animation: "none" }
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
        {children}
      </div>
    </div>,
    document.body
  );
}
