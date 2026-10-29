import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ExpenseCategory } from "./expenseCategories";

interface Props {
  categories: ExpenseCategory[];
  value: string;
  onChange: (key: string) => void;
  label?: string;
  id?: string;
  noIcons?: boolean;
}

/**
 * Nette dropdown voor categorieën: trigger in input-stijl met icoon + vinkje,
 * menu met alle categorieën (icoon in toon-kleur, check bij actief).
 * Het menu rendert via een portal op `body`, zodat het nooit wordt
 * afgeknipt door de `overflow: hidden` van het collapse-paneel.
 */
export function CategoryDropdown({ categories, value, onChange, label, id, noIcons }: Props) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const [above, setAbove] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const measure = () => {
    const el = triggerRef.current;
    if (!el) return;
    const GAP = 6;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 200);
    // clampen met de menubreedte, zodat het menu nooit buiten beeld steekt
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    // geschatte menuhoogte: padding + items, gemaximeerd zoals de CSS (320px / 60dvh)
    const estMenuH = Math.min(12 + categories.length * 41, 320, window.innerHeight * 0.6);
    // past het omlaag niet maar omhoog wel, dan boven de trigger uitklappen
    const flip = r.bottom + GAP + estMenuH > window.innerHeight && r.top - GAP - estMenuH >= 0;
    setAbove(flip);
    setPos({ top: flip ? Math.max(8, r.top - GAP - estMenuH) : r.bottom + GAP, left, width });
  };

  useLayoutEffect(() => {
    if (open) measure();
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    const requestClose = () => {
      if (closing) return;
      setClosing(true);
      closeTimer.current = window.setTimeout(() => {
        setOpen(false);
        setClosing(false);
        closeTimer.current = null;
      }, 150);
    };
    const onDown = (e: PointerEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        const pop = document.getElementById("catdd-portal");
        if (!pop || !pop.contains(e.target as Node)) requestClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    // Bij scrollen/resizen schuift de trigger weg onder het fixed menu:
    // dan het menu sluiten, dat voelt het meest natuurlijk.
    const onScroll = (e: Event) => {
      const pop = document.getElementById("catdd-portal");
      const t = e.target as Node | null;
      if (pop && t && pop.contains(t)) return;
      requestClose();
    };
    window.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, closing ]);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    []
  );

  const current = categories.find((c) => c.key === value) ?? categories[0];

  return (
    <div className="catdd">
      {label && (
        <span className="catdd-label" id={id ? `${id}-label` : undefined}>
          {label}
        </span>
      )}
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className="catdd-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={id && label ? `${id}-label ${id}` : undefined}
        onClick={() => {
          if (open && !closing) {
            if (closeTimer.current !== null) {
              window.clearTimeout(closeTimer.current);
              closeTimer.current = null;
            }
            setClosing(true);
            closeTimer.current = window.setTimeout(() => {
              setOpen(false);
              setClosing(false);
              closeTimer.current = null;
            }, 150);
            return;
          }
          if (closeTimer.current !== null) {
            window.clearTimeout(closeTimer.current);
            closeTimer.current = null;
          }
          setClosing(false);
          setOpen(true);
        }}
      >
        {!noIcons && (
          <span className={`catdd-icon catdd-tone-${current.tone}`} aria-hidden="true">
            <i className={`fa-solid ${current.icon}`} />
          </span>
        )}
        <span className="catdd-current">{current.label}</span>
        <i className={`fa-solid fa-chevron-down catdd-caret${open ? " open" : ""}`} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <ul
            id="catdd-portal"
            className={`catdd-pop catdd-pop-portal${closing ? " closing" : ""}${above ? " catdd-pop-above" : ""}`}
            role="listbox"
            aria-label={label ?? "Categorie"}
            style={{ top: pos.top, left: pos.left, width: Math.max(pos.width, 200) }}
          >
            {categories.map((c) => (
              <li key={c.key} role="option" aria-selected={c.key === value}>
                <button
                  type="button"
                  className={`catdd-item${c.key === value ? " is-active" : ""}`}
                  onClick={() => {
                    onChange(c.key);
                    if (closeTimer.current !== null) {
                      window.clearTimeout(closeTimer.current);
                      closeTimer.current = null;
                    }
                    setClosing(true);
                    closeTimer.current = window.setTimeout(() => {
                      setOpen(false);
                      setClosing(false);
                      closeTimer.current = null;
                    }, 150);
                  }}
                >
                  {noIcons ? null : (
                    <span className={`catdd-icon catdd-tone-${c.tone}`} aria-hidden="true">
                      <i className={`fa-solid ${c.icon}`} />
                    </span>
                  )}
                  <span className="catdd-name">{c.label}</span>
                  {c.key === value && (
                    <i className="fa-solid fa-check catdd-check" aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}
