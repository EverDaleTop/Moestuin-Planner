import { CROP_ICONS, suggestCropIcon, cropEmoji } from "./cropIcons";
import { ALL_CROP_ICON_IMAGES, cropIconImage, iconLabelFromFile } from "./cropIconImages";

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

/** Gewas-icoontjes (afbeeldingen, met emoji-terugval) om aan een gewas te koppelen. */
export function IconPicker({ value, onChange, cropName, color }: Props) {
  const suggestion =
    cropName && cropName.trim() ? suggestCropIcon(cropName) : undefined;
  const showSuggestion =
    suggestion && suggestion.key !== value && suggestion.emoji !== value;

  // Raster: eerst de curated icoontjes (met hun afbeelding), daarna de
  // afbeeldingen die iemand zelf in de map heeft gezet. Een bestand dat bij een
  // curated icoon hoort staat daar al, dus die slaan we hier over.
  const curatedKeys = new Set(CROP_ICONS.map((i) => i.key));
  const options = [
    ...CROP_ICONS.map((i) => ({
      key: i.key,
      label: i.label,
      emoji: i.emoji,
      url: cropIconImage(i.key),
    })),
    ...ALL_CROP_ICON_IMAGES.filter((i) => !curatedKeys.has(i.key)).map((i) => ({
      key: i.key,
      label: iconLabelFromFile(i.key),
      emoji: "🌱",
      url: i.url,
    })),
  ];

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
        {options.map((o) => {
          const isActive = o.key === value;
          return (
            <button
              type="button"
              key={o.key}
              title={o.label}
              aria-label={o.label}
              aria-pressed={isActive}
              className={isActive ? "icon-opt icon-opt-active" : "icon-opt"}
              onClick={() => onChange(o.key)}
            >
              <span className="crop-icon" role="img" aria-hidden="true">
                {o.url ? <img src={o.url} alt="" aria-hidden="true" draggable={false} /> : o.emoji}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}