import { CROP_ICONS } from "./cropIcons";

interface Props {
  value: string;
  onChange: (key: string) => void;
  color?: string;
}

/** Flat-coloured icon picker: a small grid of glyphs to associate with a crop. */
export function IconPicker({ value, onChange, color = "#7c9a6d" }: Props) {
  return (
    <div className="icon-picker" role="group" aria-label="Icoon">
      <span className="icon-picker-label">Icoon</span>
      <div className="icon-picker-grid">
        {CROP_ICONS.map((i) => (
          <button
            type="button"
            key={i.key}
            title={i.label}
            aria-label={i.label}
            aria-pressed={i.key === value}
            className={i.key === value ? "icon-opt icon-opt-active" : "icon-opt"}
            onClick={() => onChange(i.key)}
          >
            <i className={i.cls} style={{ color }} />
          </button>
        ))}
      </div>
    </div>
  );
}