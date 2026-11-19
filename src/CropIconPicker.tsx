import { ICON_LABELS, suggestCropIcon, cropEmoji } from "./cropIcons";
import {
  ALL_CROP_ICON_IMAGES,
  cropIconImage,
  iconLabelFromFile,
  imageKeyForName,
} from "./cropIconImages";

/**
 * Eén gewas-icoon voor in de UI: de afbeelding uit
 * `src/assets/crop-icons/` als die er is, anders de emoji. Dezelfde bron als
 * de canvas-tekening, dus altijd gelijk.
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
  /** genegeerd: emoji en afbeeldingen zijn van zichzelf al gekleurd */
  color?: string;
}) {
  const src = cropIconImage(iconKey);
  const emoji = cropEmoji(iconKey, cropName);
  return (
    <span
      className={`${className} crop-icon-img`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      {src ? (
        <img src={src} alt="" aria-hidden="true" draggable={false} />
      ) : (
        emoji
      )}
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

/** Gewas-icoontjes: alleen de afbeeldingen uit `src/assets/crop-icons/`. */
export function IconPicker({ value, onChange, cropName, color }: Props) {
  const name = cropName?.trim() ?? "";
  const semantic = name ? suggestCropIcon(name)?.key : undefined;
  const suggestedKey =
    (semantic && cropIconImage(semantic) ? semantic : undefined) ??
    (name ? imageKeyForName(name) : undefined);
  const showSuggestion = suggestedKey && suggestedKey !== value;
  const suggestedLabel = suggestedKey
    ? (ICON_LABELS[suggestedKey] ?? iconLabelFromFile(suggestedKey))
    : "";

  // Raster: uitsluitend de afbeeldingsbestanden, op naam gesorteerd. De
  // ingebouwde (emoji-)set doet hier niet meer mee.
  const options = ALL_CROP_ICON_IMAGES.map((i) => ({
    key: i.key,
    label: ICON_LABELS[i.key] ?? iconLabelFromFile(i.key),
    url: i.url,
  })).sort((a, b) => a.label.localeCompare(b.label, "nl"));

  return (
    <div className="icon-picker" role="group" aria-label="Icoon">
      <span className="icon-picker-label">Icoon</span>
      {showSuggestion && (
        <button
          type="button"
          className="icon-suggest"
          onClick={() => onChange(suggestedKey!)}
          title={`Gebruik ${suggestedLabel} voor “${name}”`}
        >
          <CropGlyph iconKey={suggestedKey} color={color} />
          <span>Voorgesteld voor “{name}” — klik om te gebruiken</span>
        </button>
      )}
      <div className="icon-picker-grid">
        {options.map((o) => {
          const isActive = o.key === value;
          return (
            <button
              type="button"
              key={o.key}
              aria-label={o.label}
              aria-pressed={isActive}
              title={o.label}
              className={isActive ? "icon-opt icon-opt-active" : "icon-opt"}
              onClick={() => onChange(o.key)}
            >
              <span className="crop-icon" role="img" aria-hidden="true">
                <img src={o.url} alt="" aria-hidden="true" draggable={false} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}