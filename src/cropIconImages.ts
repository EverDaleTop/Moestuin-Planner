/**
 * Gewas-icoontjes als afbeeldingen.
 *
 * Alle bestanden in `src/assets/crop-icons/` worden bij het bouwen automatisch
 * opgepakt: zet er zelf een .png/.jpg/.webp/.svg neer met de naam van je gewas
 * (bijv. `pompoen.png`) en hij staat meteen in het icoonraster. De bestanden die
 * `scripts/gen-crop-icons.mjs` maakt zijn per gewas een afbeelding van de
 * emoji, zodat de UI overal dezelfde icoontjes toont.
 */
import { migrateIconKey } from "./cropIcons";

const FILES = import.meta.glob("/src/assets/crop-icons/*.{svg,png,jpg,jpeg,webp,gif}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** Bestandsnaam (zonder map en extensie) → url van de afbeelding. */
export const CROP_ICON_IMAGES: Record<string, string> = Object.fromEntries(
  Object.entries(FILES).map(([path, url]) => {
    const name = path.split("/").pop() ?? path;
    const key = name.replace(/\.[^.]+$/, "");
    // `wortel-2.png` hoort bij het gewas `wortel` (handmatig toegevoegd).
    const base = key.replace(/-\d+$/, "");
    return [base, url];
  })
);

/** Alle gevonden afbeeldingen als losse opties: sleutel + url. */
export const ALL_CROP_ICON_IMAGES: { key: string; url: string }[] = Object.entries(
  CROP_ICON_IMAGES
).map(([key, url]) => ({ key, url }));

/** Afbeelding voor een icoon-sleutel (of undefined: dan tonen we de emoji). */
export function cropIconImage(iconKey?: string): string | undefined {
  // Oude tuinen bewaren nog Engelse sleutels: eerst vertalen naar de Nederlandse naam.
  const key = migrateIconKey(iconKey);
  if (!key) return undefined;
  // Keys kunnen zelf een emoji of een pad zijn; die hebben geen afbeelding.
  if (/\p{Extended_Pictographic}/u.test(key)) return undefined;
  return CROP_ICON_IMAGES[key];
}

/** Bestandsnaam → mooiere naam voor de tooltip: `pompoen` → `Pompoen`. */
export function iconLabelFromFile(key: string): string {
  const words = key.replace(/[-_]+/g, " ").trim();
  if (!words) return key;
  return words.charAt(0).toUpperCase() + words.slice(1);
}