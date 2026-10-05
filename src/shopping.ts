import type { ShoppingItem } from "./types";

/**
 * Aantal is vrije tekst ("2x", "3 zakken", "2 × 5"). Het eerste getal
 * bepaalt het aantal; zonder getal telt het als 1.
 */
export function parseQty(quantity?: string): number {
  if (!quantity) return 1;
  const m = quantity.match(/\d+/);
  const n = m ? Number(m[0]) : NaN;
  return !isNaN(n) && n > 0 ? n : 1;
}

/** Lijntotaal = aantal × richtprijs. */
export function lineTotal(item: ShoppingItem): number {
  if (!item.price || item.price <= 0) return 0;
  return item.price * parseQty(item.quantity);
}