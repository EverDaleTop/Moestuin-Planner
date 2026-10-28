import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Crop } from "./types";
import { CropSelect } from "./Inspector";

interface Props {
  mounted: boolean;
  open: boolean;
  catalog: Crop[];
  pickCrop: string;
  pickDate: string;
  pickNote: string;
  onPickCrop: (id: string) => void;
  onPickDate: (date: string) => void;
  onPickNote: (note: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

/**
 * Zaaien loggen: gecentreerde modaal op desktop, bottom-sheet-popup op mobiel.
 * Alleen presentatie — state en opslaan blijven in CalendarView.
 */
export function SowLogModal({
  mounted,
  open,
  catalog,
  pickCrop,
  pickDate,
  pickNote,
  onPickCrop,
  onPickDate,
  onPickNote,
  onSubmit,
  onClose,
}: Props) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragStartY = useRef(0);
  const dragOffsetRef = useRef(0);
  const [dragOffset, setDragOffsetState] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragClosing, setDragClosing] = useState(false);
  /** true zodra de gebruiker de sheet heeft vastgepakt: blokkeert de
   *  openings-animatie, zodat terugveren niet opnieuw infade't. */
  const [grabbed, setGrabbed] = useState(false);

  const setDragOffset = (v: number) => {
    dragOffsetRef.current = v;
    setDragOffsetState(v);
  };

  // reset bij (her)openen
  useEffect(() => {
    if (mounted && open) {
      setDragClosing(false);
      setGrabbed(false);
      dragOffsetRef.current = 0;
      setDragOffsetState(0);
      setDragging(false);
    }
  }, [mounted, open]);

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
      // door laten glijden naar beneden i.p.v. eerst terug te springen
      setDragClosing(true);
      setDragOffset(window.innerHeight);
      onClose();
    } else {
      setDragOffset(0);
    }
  };
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`sow-modal-overlay${open ? "" : " closing"}${dragClosing ? " drag-closing" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        className={`sow-modal${dragging ? " dragging" : ""}${dragClosing ? " drag-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Zaaien loggen"
        style={
          grabbed
            ? {
                transform: `translateY(${dragOffset}px)`,
                transition: dragging
                  ? "none"
                  : dragClosing
                    ? "transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)"
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
            <i className="fa-solid fa-seedling" aria-hidden="true" /> Zaaien loggen
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
        <div className="sow-modal-body">
          <div className="shop-form-grid">
            <div className="shop-form-field">
              <label>Gewas</label>
              <CropSelect
                value={pickCrop || catalog[0]?.id || ""}
                catalog={catalog}
                onChange={onPickCrop}
              />
            </div>
            <div className="shop-form-field">
              <label>Datum</label>
              <input
                type="date"
                value={pickDate}
                onChange={(e) => onPickDate(e.target.value)}
              />
            </div>
          </div>
          <div className="shop-form-field">
            <label>Notitie (optioneel)</label>
            <input
              value={pickNote}
              onChange={(e) => onPickNote(e.target.value)}
              placeholder="bijv. binnenshuis voorzaaien"
            />
          </div>
          <div className="shop-form-footer">
            <button
              className="btn-primary"
              onClick={onSubmit}
              disabled={!pickDate || catalog.length === 0}
            >
              <i className="fa-solid fa-check" /> Opslaan
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
