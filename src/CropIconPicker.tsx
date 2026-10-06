import { CROP_ICONS, suggestCropIcon, cropGlyph } from "./cropIcons";

/**
 * Eén gewas-icoon voor in de UI: altijd emoji (gekleurd, overal zichtbaar).
 * Dezelfde bron als de canvas-tekening, dus altijd gelijk.
 */
export function CropGlyph({
  iconKey,
  cropName,
  className = "crop-icon",
  label,
}: {
  iconKey?: string;
  cropName?: string;
  className?: string;
  label?: string;
  /** genegeerd: emoji zijn van zichzelf al gekleurd (achterwaarts compatibel) */
  color?: string;
}) {
  const g = cropGlyph(iconKey, cropName);
  return (
    <span
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      {g.emoji}
    </span>
  );
}

interface Props {
  value: string;
  onChange: (key: string) => void;
  color?: string;
  /** naam van het gewas, voor een automatische suggestie */
  cropName?: string;
}

/** Gewas-icoontjes (Flaticon, met emoji-terugval) om aan een gewas te koppelen. */
export function IconPicker({ value, onChange, cropName, color }: Props) {
  const suggestion =
    cropName && cropName.trim() ? suggestCropIcon(cropName) : undefined;
  const showSuggestion =
    suggestion && suggestion.key !== value && suggestion.emoji !== value;

  return (
    <div className="icon-picker" role="group" aria-label="Icoon">
      <span className="icon-picker-label">Icoon</span>
      {showSuggestion && (
        <button
          type="button"
          className="icon-suggest"
          onClick={() => onChange(suggestion.key)}
          title={`Stel ${suggestion.emoji} in voor "${cropName?.trim()}"`}
        >
          <CropGlyph iconKey={suggestion.key} color={color} />
          <span>Voorgesteld voor “{cropName?.trim()}” — klik om te gebruiken</span>
        </button>
      )}
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
            <span className="crop-icon" role="img" aria-hidden="true">
              {i.emoji}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}