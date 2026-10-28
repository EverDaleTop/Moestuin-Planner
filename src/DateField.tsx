import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface DateFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}

/** "2026-03-14" -> "14 maart 2026" */
function humanDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const MONTHS = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];
const WEEKDAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"];

/**
 * Zelfgebouwde datumkiezer: een knop die de huidige datum toont en een popup met
 * een maandraster. De native picker en de native velden worden helemaal
 * verborgen, dus de browser stijl komt er niet meer in.
 */
export function DateField({ id, value, onChange }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  // Start op de maand van de huidige waarde (of vandaag).
  const initial = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? { y: Number(value.slice(0, 4)), m: Number(value.slice(5, 7)) - 1 }
    : (() => {
        const now = new Date();
        return { y: now.getFullYear(), m: now.getMonth() };
      })();
  const [cursor, setCursor] = useState(initial);

  // Popup-breedte staat vast op 280px: daarmee clampen (niet met de
  // triggerbreedte) en omhoog flippen als er onder geen ruimte is.
  const POP_W = 280;
  const POP_H = 340;
  useLayoutEffect(() => {
    if (!open) return;
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // niet te dicht tegen de rand van het scherm
    const left = Math.max(8, Math.min(r.left, window.innerWidth - POP_W - 8));
    const below = r.bottom + 6;
    const top =
      below + POP_H <= window.innerHeight || r.top - 6 - POP_H < 8
        ? below
        : Math.max(8, r.top - 6 - POP_H);
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const first = new Date(cursor.y, cursor.m, 1);
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const today = new Date();
  const todayISO = toISO(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div className="datepick">
      <button
        type="button"
        id={id}
        ref={btnRef}
        className="datepick-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{value ? humanDate(value) : "Kies een datum"}</span>
        <i
          className={`fa-solid fa-calendar-day${open ? " open" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            className="datepick-pop"
            role="dialog"
            aria-label="Kies een datum"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="datepick-head">
              <button
                type="button"
                onClick={() => setCursor((c) => shift(c, -1))}
                aria-label="Vorige maand"
              >
                <i className="fa-solid fa-chevron-left" aria-hidden="true" />
              </button>
              <span>
                {MONTHS[cursor.m]} {cursor.y}
              </span>
              <button
                type="button"
                onClick={() => setCursor((c) => shift(c, 1))}
                aria-label="Volgende maand"
              >
                <i className="fa-solid fa-chevron-right" aria-hidden="true" />
              </button>
            </div>
            <div className="datepick-grid datepick-week">
              {WEEKDAYS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="datepick-grid">
              {Array.from({ length: first.getDay() === 0 ? 6 : first.getDay() - 1 }).map(
                (_, i) => (
                  <span key={`pad-${i}`} className="datepick-pad" />
                )
              )}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const iso = toISO(cursor.y, cursor.m, day);
                const selected = iso === value;
                const isToday = iso === todayISO;
                return (
                  <button
                    key={iso}
                    type="button"
                    className={`datepick-day${selected ? " is-selected" : ""}${
                      isToday ? " is-today" : ""
                    }`}
                    onClick={() => {
                      onChange(iso);
                      setOpen(false);
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="datepick-today"
              onClick={() => {
                onChange(todayISO);
                setOpen(false);
              }}
            >
              Vandaag
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}

function shift(c: { y: number; m: number }, dir: 1 | -1) {
  const d = new Date(c.y, c.m + dir, 1);
  return { y: d.getFullYear(), m: d.getMonth() };
}