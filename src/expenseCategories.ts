/** Categorieën voor uitgaven. Vastgesteld per uitgave, niet geraden. */
export interface ExpenseCategory {
  key: string;
  label: string;
  icon: string;
  /** kleur-tokens voor het icoontje in de lijst */
  tone: string;
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { key: 'zaad', label: 'Zaden & planten', icon: 'fa-seedling', tone: 'green' },
  { key: 'grond', label: 'Grond & bemesting', icon: 'fa-mountain-sun', tone: 'brown' },
  { key: 'gereedschap', label: 'Tuingereedschap', icon: 'fa-screwdriver-wrench', tone: 'blue' },
  { key: 'materiaal', label: 'Potten & materiaal', icon: 'fa-hammer', tone: 'orange' },
  { key: 'water', label: 'Water & irrigatie', icon: 'fa-droplet', tone: 'cyan' },
  { key: 'overig', label: 'Overig', icon: 'fa-receipt', tone: 'grey' },
];

const FALLBACK: ExpenseCategory = EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];

/** Categorieën voor inkomsten (verkoop uit de tuin). Zelfde vorm als uitgaven,
 *  zodat icoontjes, badges en donut-segmenten hergebruikt worden. */
export const INCOME_CATEGORIES: ExpenseCategory[] = [
  { key: 'oogst', label: 'Oogstverkoop', icon: 'fa-basket-shopping', tone: 'green' },
  { key: 'plantjes', label: 'Stekjes & plantjes', icon: 'fa-seedling', tone: 'cyan' },
  { key: 'klus', label: 'Klussen & diensten', icon: 'fa-handshake', tone: 'blue' },
  { key: 'overig-inkomen', label: 'Overig', icon: 'fa-coins', tone: 'grey' },
];

const INCOME_FALLBACK: ExpenseCategory =
  INCOME_CATEGORIES[INCOME_CATEGORIES.length - 1];

export function incomeCategoryByKey(key?: string): ExpenseCategory {
  return INCOME_CATEGORIES.find((c) => c.key === key) ?? INCOME_FALLBACK;
}

/** Categorie van een inkomst: zelf vastgelegd, anders Overig. */
export function resolveIncomeCategory(category?: string): ExpenseCategory {
  return category ? incomeCategoryByKey(category) : INCOME_FALLBACK;
}

export function categoryByKey(key?: string): ExpenseCategory {
  return EXPENSE_CATEGORIES.find((c) => c.key === key) ?? FALLBACK;
}

/**
 * Beste gok op basis van tekst. Wordt alleen gebruikt als een uitgave nog geen
 * categorie heeft (bijv. oude data, of een boodschap die je afvinkt).
 */
const GUESSES: { key: string; test: RegExp }[] = [
  { key: 'zaad', test: /\b(zaden?|zaad|kiemen?|stek|uitzaai|bloem|bomen?|planten?)\b/i },
  { key: 'grond', test: /\b(grond|aarde|mulch|compost|mest|bemesting|voeding|substraat|turf)\b/i },
  { key: 'gereedschap', test: /\b(gereedschap|schaar|spade|hark|mes|zaag|schoen|tang|handschoen)\b/i },
  { key: 'materiaal', test: /\b(pot|potten|bak|kuip|container|trellis|steun|plank|hout|schroef|ijzer|draad)\b/i },
  { key: 'water', test: /\b(water|slang|gieter|irrigatie|regenvat|sproeier)\b/i },
];

export function guessCategory(text: string): string {
  for (const g of GUESSES) {
    if (g.test.test(text)) return g.key;
  }
  return FALLBACK.key;
}

/** Categorie van een uitgave: zelf vastgelegd, anders geraden. */
export function resolveCategory(description: string, category?: string): ExpenseCategory {
  return category ? categoryByKey(category) : categoryByKey(guessCategory(description));
}