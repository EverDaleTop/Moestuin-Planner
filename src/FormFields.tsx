import { useRef } from "react";

interface DateFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  step?: string;
  min?: string;
}

/** Datumveld met eigen kalender-icoon; de native picker-icoon is verborgen. */
export function DateField({ id, value, onChange, step, min }: DateFieldProps) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <div className="date-input">
      <i className="fa-solid fa-calendar-day" aria-hidden="true" />
      <input
        id={id}
        ref={ref}
        type="date"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        onClick={() => {
          // open de native picker via de API, met fallback voor Safari
          const el = ref.current as (HTMLInputElement & { showPicker?: () => void }) | null;
          if (el?.showPicker) {
            try {
              el.showPicker();
            } catch {
              /* browser blokkeert showPicker zonder gebruikersactie */
            }
          }
        }}
      />
    </div>
  );
}

interface NumFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: string;
  step?: number;
  /** toon de kleine pijltjes rechts */
  stepper?: boolean;
}

/** Getalveld, optioneel met kleine, subtiele pijltjes rechts. */
export function NumField({
  id,
  value,
  onChange,
  placeholder,
  min,
  step = 1,
  stepper = false,
}: NumFieldProps) {
  const ref = useRef<HTMLInputElement | null>(null);

  const bump = (dir: 1 | -1) => {
    const base = parseFloat(value);
    const current = Number.isFinite(base) ? base : 0;
    const decimals = (String(step).split(".")[1] ?? "").length;
    const factor = 10 ** decimals;
    const next = Math.round((current + dir * step) * factor) / factor;
    onChange(String(next));
    ref.current?.focus();
  };

  return (
    <div className="num-input">
      <input
        id={id}
        ref={ref}
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        step="any"
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {stepper && (
        <span className="num-step">
          <button type="button" onClick={() => bump(1)} aria-label="Verhogen" tabIndex={-1}>
            <i className="fa-solid fa-chevron-up" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => bump(-1)} aria-label="Verlagen" tabIndex={-1}>
            <i className="fa-solid fa-chevron-down" aria-hidden="true" />
          </button>
        </span>
      )}
    </div>
  );
}