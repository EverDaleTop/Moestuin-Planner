export interface CropIconDef {
  key: string;
  label: string;
  /** Flaticon UIcons-klasse (fi-rr-…), als die bestaat voor dit gewas. */
  fi?: string;
  /** Codepoint van het Flaticon-glyph, voor tekenen op de canvas. */
  char?: string;
  /** Emoji-terugval voor gewassen zonder Flaticon-icoon. */
  emoji: string;
}

/** Canvas-font voor Flaticon-glyphs (familienaam uit de UIcons-CSS). */
export const FLATICON_CANVAS_FONT = "uicons-regular-rounded";

/**
 * Gewas-icoontjes uit het gratis Flaticon UIcons-pack (attributie in de
 * IconPicker) — veel meer echte groentes dan emoji alleen heeft. Waar
 * Flaticon niets heeft (biet, blauwe bes, bloemkool, …) valt het terug op
 * emoji, zodat er nooit een leeg vakje staat.
 */
export const CROP_ICONS: CropIconDef[] = [
  { key: "carrot", label: "Wortel", fi: "fi-rr-carrot", char: "\uf37f", emoji: "🥕" },
  { key: "tomato", label: "Tomaat", fi: "fi-rr-tomato", char: "\ufdc5", emoji: "🍅" },
  { key: "potato", label: "Aardappel", fi: "fi-rr-potato", char: "\ufac7", emoji: "🥔" },
  { key: "cucumber", label: "Komkommer", fi: "fi-rr-cucumber", char: "\uf503", emoji: "🥒" },
  { key: "bell-pepper", label: "Paprika", fi: "fi-rr-pepper", char: "\ufa37", emoji: "🫑" },
  { key: "chili", label: "Peper (heet)", fi: "fi-rr-pepper-hot", char: "\ufa36", emoji: "🌶️" },
  { key: "jalapeno", label: "Jalapeño", emoji: "🌶️" },
  { key: "cayenne", label: "Cayennepeper", emoji: "🌶️" },
  { key: "adjuma", label: "Adjuma / Caribische peper", emoji: "🌶️" },
  { key: "habanero", label: "Habanero", emoji: "🌶️" },
  { key: "rawit", label: "Rawit / Lombok", emoji: "🌶️" },
  { key: "corn", label: "Maïs", fi: "fi-rr-corn", char: "\uf4df", emoji: "🌽" },
  { key: "eggplant", label: "Aubergine", fi: "fi-rr-aubergine", char: "\uf1d7", emoji: "🍆" },
  { key: "pumpkin", label: "Pompoen", fi: "fi-rr-pumpkin", char: "\ufae8", emoji: "🎃" },
  { key: "broccoli", label: "Broccoli", fi: "fi-rr-broccoli", char: "\uf2ef", emoji: "🥦" },
  { key: "leafy", label: "Bladgroente", fi: "fi-rr-leafy-green", char: "\uf88d", emoji: "🥬" },
  { key: "salad", label: "Sla", fi: "fi-rr-salad", char: "\ufb88", emoji: "🥗" },
  { key: "onion", label: "Ui", fi: "fi-rr-onion", char: "\uf9d4", emoji: "🧅" },
  { key: "garlic", label: "Knoflook", fi: "fi-rr-garlic", char: "\uf6e4", emoji: "🧄" },
  { key: "beans", label: "Bonen", emoji: "🫘" },
  { key: "peas", label: "Erwten", fi: "fi-rr-peapod", char: "\ufa18", emoji: "🫛" },
  { key: "beet", label: "Biet/knol", emoji: "🍠" },
  { key: "mushroom", label: "Paddenstoel", fi: "fi-rr-mushroom", char: "\uf993", emoji: "🍄" },
  { key: "peanut", label: "Noten", fi: "fi-rr-peanut", char: "\ufa16", emoji: "🥜" },
  { key: "sunflower", label: "Zonnebloem", emoji: "🌻" },
  { key: "seedling", label: "Kiemplant", fi: "fi-rr-seedling", char: "\ufbc2", emoji: "🌱" },
  { key: "herb", label: "Kruiden", emoji: "🌿" },
  { key: "wheat", label: "Graan", fi: "fi-rr-wheat", char: "\ufefc", emoji: "🌾" },
  { key: "strawberry", label: "Aardbei", fi: "fi-rr-strawberry", char: "\ufd04", emoji: "🍓" },
  { key: "blueberry", label: "Bessen", emoji: "🫐" },
  { key: "grapes", label: "Druiven", fi: "fi-rr-grape", char: "\uf711", emoji: "🍇" },
  { key: "melon", label: "Meloen", fi: "fi-rr-melon", char: "\uf91c", emoji: "🍈" },
  { key: "lemon", label: "Citroen", fi: "fi-rr-lemon", char: "\uf892", emoji: "🍋" },
  { key: "orange", label: "Sinaasappel", emoji: "🍊" },
  { key: "pear", label: "Peer", fi: "fi-rr-pear", char: "\ufa19", emoji: "🍐" },
  { key: "peach", label: "Perzik", fi: "fi-rr-peach", char: "\ufa15", emoji: "🍑" },
  { key: "cherry", label: "Kers", fi: "fi-rr-cherry", char: "\uf3ce", emoji: "🍒" },
  { key: "olive", label: "Olijf", fi: "fi-rr-olive", char: "\uf9cf", emoji: "🫒" },
  { key: "radish", label: "Radijs", fi: "fi-rr-radish", char: "\ufb08", emoji: "🌱" },
  { key: "avocado", label: "Avocado", fi: "fi-rr-avocado", char: "\uf1de", emoji: "🥑" },
  { key: "mango", label: "Mango", fi: "fi-rr-mango", char: "\uf8ec", emoji: "🥭" },
  { key: "pineapple", label: "Ananas", fi: "fi-rr-pineapple", char: "\ufa83", emoji: "🍍" },
  { key: "watermelon", label: "Watermeloen", fi: "fi-rr-watermelon", char: "\ufeeb", emoji: "🍉" },
  { key: "egg", label: "Ei", fi: "fi-rr-egg", char: "\uf5c4", emoji: "🥚" },
  { key: "coconut", label: "Kokos", fi: "fi-rr-coconut", char: "\uf481", emoji: "🥥" },
  { key: "apple", label: "Appel", fi: "fi-rr-apple-whole", char: "\uf168", emoji: "🍎" },
  { key: "kiwi", label: "Kiwi", fi: "fi-rr-kiwi-fruit", char: "\uf855", emoji: "🥝" },
  { key: "banana", label: "Banaan", fi: "fi-rr-banana", char: "\uf206", emoji: "🍌" },
  { key: "citrus", label: "Citrus", fi: "fi-rr-citrus", char: "\uf42e", emoji: "🍋" },
  { key: "leaf", label: "Blad", fi: "fi-rr-leaf", char: "\uf88c", emoji: "🍃" },
  { key: "rice", label: "Rijst", fi: "fi-rr-bowl-rice", char: "\uf2a3", emoji: "🍚" },
  { key: "spice", label: "Specerij", fi: "fi-rr-salt-pepper", char: "\ufb8a", emoji: "🧂" },
  { key: "tulip", label: "Tulp/bloem", fi: "fi-rr-flower-tulip", char: "\uf6aa", emoji: "🌷" },
  { key: "leaflettuce", label: "Kropsla", fi: "fi-rr-lettuce", char: "\uf899", emoji: "🥬" },
  { key: "citruspart", label: "Partje", fi: "fi-rr-citrus-slice", char: "\uf42d", emoji: "🍊" },
  { key: "grainjar", label: "Graanpot", fi: "fi-rr-jar-wheat", char: "\uf834", emoji: "🌾" },
  { key: "cabbage", label: "Witte kool", fi: "fi-rr-leafy-green", char: "\uf88d", emoji: "🥬" },
  { key: "endive", label: "Andijvie", fi: "fi-rr-leafy-green", char: "\uf88d", emoji: "🥬" },
  { key: "rucola", label: "Rucola", fi: "fi-rr-leafy-green", char: "\uf88d", emoji: "🥬" },
  { key: "kale", label: "Boerenkool", fi: "fi-rr-leafy-green", char: "\uf88d", emoji: "🥬" },
  { key: "leek", label: "Prei", fi: "fi-rr-onion", char: "\uf9d4", emoji: "🧅" },
  { key: "fennel", label: "Venkel", fi: "fi-rr-onion", char: "\uf9d4", emoji: "🧅" },
  { key: "parsnip", label: "Pastinaak", fi: "fi-rr-carrot", char: "\uf37f", emoji: "🥕" },
  { key: "salsify", label: "Schorseneer", fi: "fi-rr-carrot", char: "\uf37f", emoji: "🥕" },
  { key: "horseradish", label: "Mierikswortel", fi: "fi-rr-carrot", char: "\uf37f", emoji: "🥕" },
  { key: "turnip", label: "Raap/koolraap", fi: "fi-rr-radish", char: "\ufb08", emoji: "🥔" },
  { key: "celeriac", label: "Knolselderij", fi: "fi-rr-radish", char: "\ufb08", emoji: "🥔" },
  { key: "artichoke", label: "Artisjok", fi: "fi-rr-flower-tulip", char: "\uf6aa", emoji: "🌼" },
  { key: "asparagus", label: "Asperge", fi: "fi-rr-seedling", char: "\ufbc2", emoji: "🌱" },
  { key: "celery", label: "Bleekselderij", fi: "fi-rr-leaf", char: "\uf88c", emoji: "🌿" },
  { key: "plum", label: "Pruim", fi: "fi-rr-cherry", char: "\uf3ce", emoji: "🍒" },
  { key: "cauliflower", label: "Bloemkool", fi: "fi-rr-broccoli", char: "\uf2ef", emoji: "🥦" },
  { key: "sprout", label: "Spruitjes", fi: "fi-rr-leafy-green", char: "\uf88d", emoji: "🥬" },
  { key: "gherkin", label: "Augurk", fi: "fi-rr-cucumber", char: "\uf503", emoji: "🥒" },
  { key: "courgette", label: "Courgette", fi: "fi-rr-cucumber", char: "\uf503", emoji: "🥒" },
  { key: "spinach", label: "Spinazie", fi: "fi-rr-leafy-green", char: "\uf88d", emoji: "🥬" },
];
export const DEFAULT_CROP_ICON = "seedling";

export const ICON_KEYS = CROP_ICONS.map((i) => i.key);
export const ICON_LABELS: Record<string, string> = Object.fromEntries(
  CROP_ICONS.map((i) => [i.key, i.label])
);

const ICON_BY_KEY = new Map(CROP_ICONS.map((i) => [i.key, i.emoji]));

/** Oude FontAwesome-sleutels (opgeslagen in bestaande tuinen) → emoji. */
const LEGACY_ICON_EMOJI: Record<string, string> = {
  leaf: "🥬",
  sprout: "🌱",
  carrot: "🥕",
  "apple-whole": "🍅",
  "pepper-hot": "🌶️",
  "wheat-awn": "🌾",
  tree: "🥦",
  sun: "🌻",
  snowflake: "🥬",
  spa: "🧅",
  clover: "🍀",
  "hand-fist": "🫘",
  cannabis: "🌿",
};

/** Nederlandse gewasnaam → emoji, zodat oude tuinen meteen goed tonen
 *  (een boon was een hand, een tomaat een appel). Volgorde is belangrijk:
 *  specifiekere namen eerst (aardappel vóór appel, snijbiet vóór biet). */
const NAME_EMOJI: [RegExp, string][] = [
  [/wortel|peen|pastinaak/i, "🥕"],
  [/tomaat/i, "🍅"],
  [/aardappel|pieper|pootgoed/i, "🥔"],
  [/snijbiet|spinazie|paksoi/i, "🥬"],
  [/biet|kroot|knolselderij/i, "🍠"],
  [/sla|andijvie|rucola|eikenblad|veldsla/i, "🥗"],
  [/doperwt|erwt|peul|kapucijner/i, "🫛"],
  [/boon|bonen|soja|tuinboon|sperzie/i, "🫘"],
  [/bloemkool|broccoli|romanesco/i, "🥦"],
  [/spruit|kool|savooie|boerenkool/i, "🥬"],
  [/paprika/i, "🫑"],
  [/peper|chili|sambal|jalap/i, "🌶️"],
  [/komkommer|augurk|courgette/i, "🥒"],
  [/pompoen/i, "🎃"],
  [/mais/i, "🌽"],
  [/aubergine/i, "🍆"],
  [/meloen|watermeloen/i, "🍈"],
  [/knoflook/i, "🧄"],
  [/prei|bosui|sjalot|\buien?\b|\bui\b/i, "🧅"],
  [/champignon|paddenstoel|oesterzwam|shiitake/i, "🍄"],
  [/appel(?!moes)/i, "🍎"],
  [/peer|peren/i, "🍐"],
  [/tuinkers|waterkers|kerssla/i, "🌱"],
  [/kers(?!tomaat)/i, "🍒"],
  [/aardbei/i, "🍓"],
  [/framboos|braam|\bbes\b|bessen|aalbes|kruisbes|blauwe bes/i, "🫐"],
  [/druif|druiven/i, "🍇"],
  [/perzik|nectarine|abrikoos/i, "🍑"],
  [/citroen|limoen/i, "🍋"],
  [/sinaasappel/i, "🍊"],
  [/pinda|noten?|walnoot|hazelnoot|amandel/i, "🥜"],
  [/radijs/i, "🌱"],
  [/avocado/i, "🥑"],
  [/mango/i, "🥭"],
  [/ananas/i, "🍍"],
  [/watermeloen/i, "🍉"],
  [/\bei\b|eieren/i, "🥚"],
  [/kokos/i, "🥥"],
  [/appel/i, "🍎"],
  [/kiwi/i, "🥝"],
  [/zonnebloem/i, "🌻"],
  [/tarwe|rogge|gerst|haver|rijst|graan/i, "🌾"],
  [/basilicum|peterselie|bieslook|tijm|rozemarijn|munt|dille|koriander|oregano|kruid|selder/i, "🌿"],
  [/olijf/i, "🫒"],
];

/**
 * Nederlandse (ras)namen → icoon-key. Voor soorten waar Flaticon geen eigen
 * icoon heeft, wijst dit naar het dichtstbijzijnde icoon (witte kool →
 * bladgroente, pastinaak → wortel). Specifiek vóór algemeen zetten.
 */
const NAME_KEY: [RegExp, string][] = [
  [/paprika/i, "bell-pepper"],
  [/jalap/i, "jalapeno"],
  [/cayenne/i, "cayenne"],
  [/adjuma|madame jeanette|caribische peper/i, "adjuma"],
  [/habanero/i, "habanero"],
  [/rawit|lombok|tabasco/i, "rawit"],
  [/peper|chili|sambal/i, "chili"],
  [/ijsbergsla|eikenbladsla|kropsla|bindsla|little gem|lollo/i, "leaflettuce"],
  [/rucola|veldsla|eikenblad/i, "leafy"],
  [/andijvie/i, "endive"],
  [/augurk/i, "gherkin"],
  [/courgette/i, "courgette"],
  [/pruim/i, "plum"],
  [/bloemkool/i, "cauliflower"],
  [/prei/i, "leek"],
  [/spinazie/i, "spinach"],
  [/spruitjes|spruitkool/i, "sprout"],
  [/artisjok/i, "artichoke"],
  [/asperge/i, "asparagus"],
  [/boerenkool/i, "kale"],
  [/bleekselderij/i, "celery"],
  [/pastinaak/i, "parsnip"],
  [/knolselderij/i, "celeriac"],
  [/schorseneer/i, "salsify"],
  [/mierikswortel/i, "horseradish"],
  [/koolrabi/i, "turnip"],
  [/rammenas/i, "radish"],
  [/raap|meiraap|knolraap|koolraap/i, "turnip"],
  [/venkel/i, "fennel"],
  [/witte kool|spitskool|savooie|rode kool/i, "cabbage"],
  [/tauge|microgroente/i, "seedling"],
  [/biet|kroot/i, "turnip"],
  [/banaan/i, "banana"],
  [/basilicum|peterselie|bieslook|tijm|rozemarijn|munt|dille|koriander|oregano|bonenkruid|kervel|salie/i, "leaf"],
];

function iconKeyForCropName(name?: string): string | undefined {
  if (!name) return undefined;
  for (const [re, key] of NAME_KEY) {
    if (re.test(name)) return key;
  }
  return undefined;
}

function emojiForCropName(name?: string): string | undefined {
  if (!name) return undefined;
  for (const [re, emoji] of NAME_EMOJI) {
    if (re.test(name)) return emoji;
  }
  return undefined;
}

/**
 * Stelt een icoon voor op basis van de gewasnaam. Geeft de key uit de
 * curated lijst terug als de emoji daarin voorkomt, anders de rauwe emoji
 * zelf (die `cropEmoji` ook direct begrijpt). Handig bij het aanmaken van
 * een gewas dat niet in de vaste lijst staat.
 */
export function suggestCropIcon(name?: string): { key: string; emoji: string } | undefined {
  const key = iconKeyForCropName(name);
  if (key) {
    const def = CROP_ICONS.find((i) => i.key === key);
    if (def) return { key: def.key, emoji: def.emoji };
  }
  const emoji = emojiForCropName(name);
  if (!emoji) return undefined;
  const known = CROP_ICONS.find((i) => i.emoji === emoji);
  return known ? { key: known.key, emoji: known.emoji } : { key: emoji, emoji };
}

/** True als de waarde (een deel van) een emoji bevat — voor het vrije veld. */
export function containsEmoji(value: string): boolean {
  return /\p{Extended_Pictographic}/u.test(value);
}

/** Pakt de eerste emoji uit een string (voor plakken met spaties/tekst). */
export function firstEmoji(value: string): string | undefined {
  const m = value.match(/\p{Extended_Pictographic}(\u200d\p{Extended_Pictographic}|\uFE0F)*/u);
  return m ? m[0] : undefined;
}

/** "Sla · Sparta" — the way a crop is shown with its variety. */
export function cropLabel(crop: { name: string; variety?: string }): string {
  return crop.variety ? `${crop.name} · ${crop.variety}` : crop.name;
}

/**
 * Emoji voor een gewas. Expliciet gekozen (nieuwe) icoontjes winnen altijd;
 * alleen bij oude FontAwesome-sleutels of onbekende waarden wordt naar de
 * gewasnaam gekeken, zodat bestaande tuinen meteen echte icoontjes tonen.
 */
export function cropEmoji(iconKey?: string, cropName?: string): string {
  if (iconKey) {
    const direct = ICON_BY_KEY.get(iconKey);
    if (direct) return direct;
    if (/\p{Extended_Pictographic}/u.test(iconKey)) return iconKey;
  }
  const keyByName = iconKeyForCropName(cropName);
  if (keyByName) {
    const def = CROP_ICONS.find((i) => i.key === keyByName);
    if (def) return def.emoji;
  }
  const byName = emojiForCropName(cropName);
  if (byName) return byName;
  if (iconKey) {
    const legacy = LEGACY_ICON_EMOJI[iconKey];
    if (legacy) return legacy;
  }
  return "🌱";
}

export type CropGlyph = { kind: "emoji"; emoji: string };

/**
 * Icoon voor UI én canvas: altijd emoji (gekleurd, overal zichtbaar).
 * Werkt ook met rauwe emoji als key en met oude FontAwesome-sleutels.
 */
export function cropGlyph(iconKey?: string, cropName?: string): CropGlyph {
  return { kind: "emoji", emoji: cropEmoji(iconKey, cropName) };
}

export interface PlantSpot {
  x: number;
  y: number;
}

/**
 * Hoeveel rijen/kolommen er met vaste tussenafstand in een vlak passen.
 * Alles in meters. De afstand is heilig: er wordt nooit dichter op elkaar
 * geplant, een groter vlak levert simpelweg meer rijen/kolommen op.
 * Raster: (aantal - 1) × afstand moet binnen het vlak minus marge passen.
 */
export function fitCropCounts(
  areaW: number,
  areaH: number,
  rowSpacingM: number,
  plantSpacingM: number,
  paddingM: number
): { rows: number; cols: number } {
  const rs = Math.max(0.01, rowSpacingM || 0.3);
  const ps = Math.max(0.01, plantSpacingM || 0.2);
  const pad = Math.max(0, paddingM ?? 0.1);
  const innerW = Math.max(0, areaW - pad * 2);
  const innerH = Math.max(0, areaH - pad * 2);
  return {
    cols: Math.max(1, Math.floor(innerW / ps + 1e-9) + 1),
    rows: Math.max(1, Math.floor(innerH / rs + 1e-9) + 1),
  };
}

/**
 * Hoe groot een vlak minimaal moet zijn voor een aantal rijen/kolommen met
 * vaste tussenafstand (meters, incl. marge aan beide zijden).
 */
export function cropAreaForCounts(
  rows: number,
  cols: number,
  rowSpacingM: number,
  plantSpacingM: number,
  paddingM: number
): { w: number; h: number } {
  const rs = Math.max(0.01, rowSpacingM || 0.3);
  const ps = Math.max(0.01, plantSpacingM || 0.2);
  const pad = Math.max(0, paddingM ?? 0.1);
  return {
    w: Math.max(0.1, pad * 2 + Math.max(0, Math.round(cols) - 1) * ps),
    h: Math.max(0.1, pad * 2 + Math.max(0, Math.round(rows) - 1) * rs),
  };
}

/**
 * Compute the plant spot centres (in world px) inside a planting's area in a
 * grid (rows × columns) with EXACTE tussenafstand: de rij-/plantafstand wordt
 * nooit verkleind om te passen. `rows`/`cols` zijn een wens; past die niet,
 * dan worden er minder getekend (nooit dichter op elkaar). `padding` insets
 * the grid from the area edges (metres). Returns the spots and the icon
 * draw size.
 */
export function plantPositions(
  area: { x: number; y: number; w: number; h: number },
  rows: number,
  cols: number | undefined,
  rowSpacingM: number,
  plantSpacingM: number,
  paddingM: number,
  pxPerM: number
): { spots: PlantSpot[]; size: number } {
  const pad = (paddingM || 0) * pxPerM;
  const inner = {
    x: area.x + pad,
    y: area.y + pad,
    w: Math.max(0, area.w - pad * 2),
    h: Math.max(0, area.h - pad * 2),
  };
  const sx = Math.max(pxPerM * 0.03, (plantSpacingM || 0.1) * pxPerM);
  const sy = Math.max(pxPerM * 0.03, (rowSpacingM || 0.1) * pxPerM);

  // Maximaal passend bij exacte afstand; een expliciete wens wordt nooit
  // naar boven afgerond of dichter op elkaar gepropt.
  const maxCols = Math.max(1, Math.floor(inner.w / sx + 1e-9) + 1);
  const maxRows = Math.max(1, Math.floor(inner.h / sy + 1e-9) + 1);
  const colCount = cols && cols > 0 ? Math.max(1, Math.min(Math.round(cols), maxCols)) : maxCols;
  const rowCount = rows && rows > 0 ? Math.max(1, Math.min(Math.round(rows), maxRows)) : maxRows;

  const gridW = (colCount - 1) * sx;
  const gridH = (rowCount - 1) * sy;
  const x0 = inner.x + (inner.w - gridW) / 2;
  const y0 = inner.y + (inner.h - gridH) / 2;

  const spots: PlantSpot[] = [];
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      spots.push({ x: x0 + c * sx, y: y0 + r * sy });
    }
  }
  const size = Math.max(3.5, Math.min(14, Math.min(sx, sy) * 0.42));
  return { spots, size };
}
