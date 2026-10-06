/**
 * Zadenpagina → gewasvelden.
 *
 * Strategie: lees eerst de productspecificaties van de pagina zelf
 * (label/waarde-paren zoals "Plantennaam: Spruitkool" en
 * "Plantafstand (cm): 70"). Dat is de betrouwbare bron. De producttitel en de
 * tekst over zaaien zijn alleen terugval.
 */

export interface SeedLookup {
  /** gewasnaam zoals de pagina hem noemt */
  cropName: string;
  /** ras/cultivar, indien op de pagina genoemd */
  variety?: string;
  /** zaaimaanden 1–12 */
  sowStart?: number;
  sowEnd?: number;
  /** oogstmaanden 1–12 */
  harvestStart?: number;
  harvestEnd?: number;
  rowSpacingM?: number;
  plantSpacingM?: number;
  /** true als de rijafstand niet op de pagina stond en uit de plantafstand is
   *  afgeleid (vierkants raster) */
  rowSpacingDerived?: boolean;
  notes?: string;
  image?: string;
  price?: number;
  url: string;
  source: string;
  /** welke velden de pagina daadwerkelijk zelf vermeldde */
  found: string[];
}

interface Spec {
  label: string;
  value: string;
}

const MONTHS: Record<string, number> = {
  januari: 1, jan: 1, january: 1,
  februari: 2, feb: 2, february: 2,
  maart: 3, mrt: 3, march: 3,
  april: 4, apr: 4,
  mei: 5, may: 5,
  juni: 6, jun: 6, june: 6,
  juli: 7, jul: 7, july: 7,
  augustus: 8, aug: 8, august: 8,
  september: 9, sep: 9,
  oktober: 10, okt: 10, october: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const MONTH_RE =
  /januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mrt|apr|jun|jul|aug|sep|okt|nov|dec/gi;

/** Alle maanden in een tekst, in volgorde, zonder direct herhaalde. */
function monthsIn(text: string): number[] {
  const out: number[] = [];
  MONTH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MONTH_RE.exec(text)) !== null) {
    const v = MONTHS[m[0].toLowerCase()];
    if (v && out[out.length - 1] !== v) out.push(v);
  }
  return out;
}

/**
 * Een specificatiewaarde → maandvenster. Ondersteunt losse maanden ("juni"),
 * lijsten ("maart, april"), bereiken ("februari t/m april") en numerieke
 * maanden ("3-6", "3 t/m 6").
 */
function windowFrom(text: string): { start: number; end: number } | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  // numeriek: 3-6 / 3 t/m 6 / 3,4,5
  const numeric = trimmed.match(/(\d{1,2})\s*(?:t\/m|-|–|—|,|\s)\s*(\d{1,2})/);
  if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    if (a >= 1 && a <= 12 && b >= 1 && b <= 12) return { start: a, end: b };
  }
  const singleNum = trimmed.match(/^\s*(\d{1,2})\s*$/);
  if (singleNum) {
    const a = Number(singleNum[1]);
    if (a >= 1 && a <= 12) return { start: a, end: a };
  }

  const found = monthsIn(trimmed);
  if (found.length === 0) return undefined;
  return { start: found[0], end: found[found.length - 1] };
}

/** Eenheid uit het label halen, bv. "Plantafstand (cm)". */
function unitFromLabel(label: string): "mm" | "cm" | "m" | undefined {
  const m = label.match(/\((mm|cm|m)\)/i) ?? label.match(/\b(mm|cm|m)\b/i);
  const u = m?.[1]?.toLowerCase();
  return u === "mm" || u === "cm" || u === "m" ? u : undefined;
}

/** Waarde naar meters; de eenheid mag uit de waarde óf uit het label komen. */
function toMetres(spec: Spec): number | undefined {
  const withUnit = spec.value.match(/(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b/i);
  if (withUnit) {
    const n = Number(withUnit[1].replace(",", "."));
    const unit = withUnit[2].toLowerCase();
    const out = unit === "mm" ? n / 1000 : unit === "cm" ? n / 100 : n;
    return saneMetres(out);
  }
  // alleen een getal: eenheid uit het label, anders niets doen
  const bare = spec.value.match(/^\s*(\d+(?:[.,]\d+)?)\s*$/);
  const hint = unitFromLabel(spec.label);
  if (bare && hint) {
    const n = Number(bare[1].replace(",", "."));
    const out = hint === "mm" ? n / 1000 : hint === "cm" ? n / 100 : n;
    return saneMetres(out);
  }
  return undefined;
}

/** Onzinnige waarden (typefouten op de pagina) weglaten. */
function saneMetres(v: number): number | undefined {
  if (!isFinite(v) || v <= 0) return undefined;
  return v > 0.01 && v < 10 ? Math.round(v * 100) / 100 : undefined;
}

/** Eerste spec waarvan het label aan het patroon voldoet. */
function findSpec(specs: Spec[], re: RegExp): Spec | undefined {
  return specs.find((s) => re.test(s.label));
}

/** Titel opsplitsen in naam + ras; alleen terugval. */
function splitTitle(title: string): { name: string; variety?: string } {
  let t = title.trim();
  const quoted = t.match(/["“”'‘’]([^"“”'‘’]{2,40})["“”'‘’]/);
  const paren = t.match(/\(([^)]{2,60})\)/);
  const variety = quoted?.[1] ?? paren?.[1];
  t = t.replace(/\([^)]*\)/g, " ").replace(/["“”'‘’][^"“”'‘’]{2,40}["“”'‘’]/g, " ");
  t = t.replace(/\s*[|,-]\s*(intratuin|gamma|buzzy|coolblue|bol\.com|webshop)\b.*$/i, " ");
  const name = (t.split(",")[0] || t).replace(/\s+/g, " ").trim();
  return { name: name.slice(0, 60), variety: variety?.replace(/\s+/g, " ").trim() };
}

/** Ras uit de Latijnse naam halen: Brassica oleracea 'Groninger Westland'. */
function varietyFromLatin(value: string): string | undefined {
  const quoted = value.match(/["“”'‘’]([^"“”'‘’]{2,40})["“”'‘’]/);
  if (quoted) return quoted[1].replace(/\s+/g, " ").trim();
  // zonder aanhalingstekens: het laatste woord is meestal het ras
  const words = value.split(/\s+/).filter(Boolean);
  return words.length > 1 ? words[words.length - 1] : undefined;
}

export function interpretSeedPage(page: {
  title?: string;
  description?: string;
  image?: string;
  price?: number;
  specs?: Spec[];
  growText?: string;
  url: string;
  source: string;
}): SeedLookup {
  const specs = page.specs ?? [];
  const found: string[] = [];

  // ---- naam ----
  // "Plantennaam" is het gewas zelf; de titel bevat winkel merkreeksen.
  const nameSpec = findSpec(specs, /^(plantennaam|gewasnaam|productnaam|naam|crop name|name)$/i);
  const titleParts = splitTitle(page.title ?? "");
  const cropName =
    nameSpec?.value.trim() || titleParts.name || "Gewas";
  if (cropName) found.push("naam");

  // ---- ras ----
  const latinSpec = findSpec(specs, /latijnse\s*(planten)?naam|botanische\s*naam|cultivar|^ras$/i);
  const variety = latinSpec
    ? varietyFromLatin(latinSpec.value) ?? titleParts.variety
    : titleParts.variety;
  if (variety) found.push("ras");

  // ---- vensters: specs eerst, dan de zaaitekst ----
  const growText = page.growText ?? page.description ?? "";
  const sowSpec = findSpec(
    specs,
    /^(planttijd|zaaitijd|zaaiperiode|zaaien|zaai\s*maanden|zaaiperiode\s*\(maanden\)|sow(ing)?(\s*period)?)$/i
  );
  const harvSpec = findSpec(
    specs,
    /^(oogsttijd|oogstperiode|oogsten|oogst\s*maanden|harvest(ing)?(\s*period)?)$/i
  );

  const sow = sowSpec ? windowFrom(sowSpec.value) : windowFrom(growText);
  if (sow) found.push("zaaivenster");
  const harv = harvSpec ? windowFrom(harvSpec.value) : undefined;
  if (harv) found.push("oogstvenster");

  // ---- afstanden ----
  const rowSpec = findSpec(specs, /rijafstand|row\s*spacing/i);
  const plantSpec = findSpec(specs, /plantafstand|plant\s*spacing/i);

  const rowSpacingM = rowSpec
    ? toMetres(rowSpec)
    : toMetres({
        label: "rijafstand (cm)",
        value: (growText.match(/rijafstand[^0-9]{0,15}(\d+\s*(?:mm|cm|m))/i) ?? [])[1] ?? "",
      });
  if (rowSpacingM) found.push("rijafstand");

  const plantSpacingM = plantSpec
    ? toMetres(plantSpec)
    : toMetres({
        label: "plantafstand (cm)",
        value: (growText.match(/plantafstand[^0-9]{0,15}(\d+\s*(?:mm|cm|m))/i) ?? [])[1] ?? "",
      });
  if (plantSpacingM) found.push("plantafstand");

  // Veel pakketten noemen alleen de plantafstand. Met een vierkants raster is
  // de rijafstand dan gelijk aan de plantafstand; die gok is transparant
  // gemarkeerd zodat je hem kunt corrigeren.
  const rowDerived = !rowSpacingM && !!plantSpacingM;
  if (rowDerived) {
    found.push("rijafstand (afgeleid)");
    return {
      cropName,
      variety,
      sowStart: sow?.start,
      sowEnd: sow?.end,
      harvestStart: harv?.start,
      harvestEnd: harv?.end,
      rowSpacingM: plantSpacingM,
      plantSpacingM,
      rowSpacingDerived: true,
      notes: page.description?.slice(0, 300),
      image: page.image,
      price: page.price,
      url: page.url,
      source: page.source,
      found,
    };
  }

  return {
    cropName,
    variety,
    sowStart: sow?.start,
    sowEnd: sow?.end,
    harvestStart: harv?.start,
    harvestEnd: harv?.end,
    rowSpacingM,
    plantSpacingM,
    notes: page.description?.slice(0, 300),
    image: page.image,
    price: page.price,
    url: page.url,
    source: page.source,
    found,
  };
}