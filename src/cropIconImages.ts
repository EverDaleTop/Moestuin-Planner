/**
 * Gewas-icoontjes als afbeeldingen.
 *
 * Alle bestanden in `src/assets/crop-icons/` worden bij het bouwen automatisch
 * opgepakt: zet er een .webp/.png/.jpg/.svg neer met de naam van je gewas
 * (bijv. `pompoen.webp`) en hij staat meteen in het icoonraster. Draai
 * `npm run optimize:icons` om nieuwe afbeeldingen naar 128px WebP te verkleinen.
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

// Iconen alvast laden, zodat het canvas ze bij de eerste tekening al heeft
// en gewassen niet pas na een refresh binnenkomen.
if (typeof window !== "undefined") {
  for (const url of Object.values(CROP_ICON_IMAGES)) {
    const img = new Image();
    img.src = url;
  }
}

/** Alle gevonden afbeeldingen als losse opties: sleutel + url. */
export const ALL_CROP_ICON_IMAGES: { key: string; url: string }[] = Object.entries(
  CROP_ICON_IMAGES
).map(([key, url]) => ({ key, url }));

/** Standaardicoon voor een nieuw gewas: het eerste beschikbare bestand. */
export const DEFAULT_CROP_ICON_IMAGE = ALL_CROP_ICON_IMAGES[0]?.key ?? "";

/** Normaliseer een naam/bestandsnaam: "Rode kool" → "rodekool". */
const normalizeIconName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Zoekt bij een gewasnaam het icoonbestand dat er het beste bij past. De picker
 * toont alleen afbeeldingen, dus een suggestie moet altijd een bestaand bestand
 * zijn. Volgorde: exacte naam, bestandsnaam in de gewasnaam, gewasnaam in de
 * bestandsnaam (zodat "Sla" bij `kropsla.png` uitkomt).
 */
export function imageKeyForName(name?: string): string | undefined {
  const n = normalizeIconName(name ?? "");
  if (!n) return undefined;
  const keys = ALL_CROP_ICON_IMAGES.map((i) => i.key);
  return (
    keys.find((k) => normalizeIconName(k) === n) ??
    keys.find((k) => n.includes(normalizeIconName(k))) ??
    keys.find((k) => normalizeIconName(k).includes(n))
  );
}

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