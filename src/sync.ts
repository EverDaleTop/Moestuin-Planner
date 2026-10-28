import type {
  Crop,
  CropAssignment,
  Expense,
  Garden,
  GardenElement,
  GardenTombstones,
  HarvestEntry,
  Income,
  ShoppingItem,
  SowingEntry,
  TodoItem,
} from "./types";

/**
 * Conflict-veilige synchronisatie.
 *
 * Het oude systeem stuurde bij elke wijziging de héle tuin op (PUT) en liet de
 * laatste schrijver winnen. Met twee schermen tegelijk betekende dat: wie het
 * laatst opsloeg, veegde het werk van de ander weg — of een binnenkomende
 * update overschreef een eigen wijziging die nog onderweg was ("terug naar
 * voor de edit").
 *
 * Dit systeem voegt per item samen in plaats van te vervangen:
 * - elk item draagt een `updatedAt`-stempel; nieuwer wint per item, dus een
 *   bewerking aan bed A wist nooit een bewerking aan bed B;
 * - verwijderde items krijgen een tombstone (id + moment); een delete die
 *   nieuwer is dan een bewerking wint, en andersom — maar een verwijderd item
 *   herrijst nooit zomaar, en een delete wist nooit andermans nieuwere werk.
 */

export function now(): number {
  return Date.now();
}

/** Vergelijken zonder dat de volgorde van sleutels uitmaakt. */
export function stableStringify(v: unknown): string {
  const sort = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(sort);
    if (x && typeof x === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(x as Record<string, unknown>).sort()) {
        out[k] = sort((x as Record<string, unknown>)[k]);
      }
      return out;
    }
    return x;
  };
  return JSON.stringify(sort(v));
}

export function emptyTombstones(): GardenTombstones {
  return {
    elements: {},
    crops: {},
    harvests: {},
    sowings: {},
    expenses: {},
    incomes: {},
    shopping: {},
    todos: {},
  };
}

function asMap(m?: Record<string, number>): Record<string, number> {
  return m ?? {};
}

export function normalizeTombstones(d?: GardenTombstones): GardenTombstones {
  return {
    elements: { ...asMap(d?.elements) },
    crops: { ...asMap(d?.crops) },
    harvests: { ...asMap(d?.harvests) },
    sowings: { ...asMap(d?.sowings) },
    expenses: { ...asMap(d?.expenses) },
    incomes: { ...asMap(d?.incomes) },
    shopping: { ...asMap(d?.shopping) },
    todos: { ...asMap(d?.todos) },
  };
}

function mergeTomb(
  a: Record<string, number>,
  b: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if ((out[k] ?? 0) < v) out[k] = v;
  }
  return out;
}

export function mergeTombstones(
  a?: GardenTombstones,
  b?: GardenTombstones
): GardenTombstones {
  const na = normalizeTombstones(a);
  const nb = normalizeTombstones(b);
  return {
    elements: mergeTomb(na.elements, nb.elements),
    crops: mergeTomb(na.crops, nb.crops),
    harvests: mergeTomb(na.harvests, nb.harvests),
    sowings: mergeTomb(na.sowings, nb.sowings),
    expenses: mergeTomb(na.expenses, nb.expenses),
    incomes: mergeTomb(na.incomes, nb.incomes),
    shopping: mergeTomb(na.shopping, nb.shopping),
    todos: mergeTomb(na.todos, nb.todos),
  };
}

function stampOf(x: { updatedAt?: number } | undefined): number {
  return x?.updatedAt ?? 0;
}

interface Keyed {
  updatedAt?: number;
}

/** Voeg twee lijsten samen op sleutel: nieuwer wint, tombstones respecteren. */
function mergeLists<T extends Keyed>(
  stored: T[],
  incoming: T[],
  key: (x: T) => string,
  tomb: Record<string, number>
): T[] {
  const sMap = new Map<string, T>();
  for (const x of stored) sMap.set(key(x), x);
  const iMap = new Map<string, T>();
  for (const x of incoming) iMap.set(key(x), x);
  const out: T[] = [];
  // volgorde van de bekende kant eerst (stabiel), daarna echt nieuwe items
  for (const x of stored) {
    const k = key(x);
    if (!iMap.has(k)) {
      if (stampOf(x) >= (tomb[k] ?? 0)) out.push(x);
      continue;
    }
    const y = iMap.get(k)!;
    const winner = stampOf(y) >= stampOf(x) ? y : x;
    if (stampOf(winner) >= (tomb[k] ?? 0)) out.push(winner);
  }
  for (const y of incoming) {
    const k = key(y);
    if (sMap.has(k)) continue;
    if (stampOf(y) >= (tomb[k] ?? 0)) out.push(y);
  }
  return out;
}

function mergeElementLists(
  stored: GardenElement[],
  incoming: GardenElement[],
  tombElements: Record<string, number>,
  tombCrops: Record<string, number>
): GardenElement[] {
  const sMap = new Map(stored.map((e) => [e.id, e]));
  const iMap = new Map(incoming.map((e) => [e.id, e]));
  const out: GardenElement[] = [];
  const mergeOne = (s: GardenElement, i: GardenElement): GardenElement => {
    const winner = stampOf(i) >= stampOf(s) ? i : s;
    const crops = mergeLists(
      s.crops ?? [],
      i.crops ?? [],
      (c: CropAssignment) => c.instanceId,
      tombCrops
    );
    return { ...winner, crops };
  };
  for (const s of stored) {
    const i = iMap.get(s.id);
    if (!i) {
      if (stampOf(s) >= (tombElements[s.id] ?? 0)) out.push(s);
      continue;
    }
    const merged = mergeOne(s, i);
    if (stampOf(merged) >= (tombElements[s.id] ?? 0)) out.push(merged);
  }
  for (const i of incoming) {
    if (sMap.has(i.id)) continue;
    if (stampOf(i) >= (tombElements[i.id] ?? 0)) {
      // vers element van de andere kant: gewassen filteren op crop-tombstones
      const crops = (i.crops ?? []).filter(
        (c) => stampOf(c) >= (tombCrops[c.instanceId] ?? 0)
      );
      out.push(crops.length === (i.crops ?? []).length ? i : { ...i, crops });
    }
  }
  return out;
}

export function normalizeCrop(c: Crop): Crop {
  return { ...c, updatedAt: c.updatedAt ?? 0 };
}

export function normalizeGarden(g: Garden): Garden {
  return {
    ...g,
    updatedAt: g.updatedAt ?? 0,
    elements: (g.elements ?? []).map((e) => ({
      ...e,
      updatedAt: e.updatedAt ?? 0,
      crops: (e.crops ?? []).map((c) => ({ ...c, updatedAt: c.updatedAt ?? 0 })),
    })),
    harvests: (g.harvests ?? []).map((h) => ({ ...h, updatedAt: h.updatedAt ?? 0 })),
    sowings: (g.sowings ?? []).map((s) => ({ ...s, updatedAt: s.updatedAt ?? 0 })),
    expenses: (g.expenses ?? []).map((e) => ({ ...e, updatedAt: e.updatedAt ?? 0 })),
    incomes: (g.incomes ?? []).map((i) => ({ ...i, updatedAt: i.updatedAt ?? 0 })),
    shopping: (g.shopping ?? []).map((s) => ({ ...s, updatedAt: s.updatedAt ?? 0 })),
    todos: (g.todos ?? []).map((t) => ({ ...t, updatedAt: t.updatedAt ?? 0 })),
    sharedWith: g.sharedWith ?? [],
    inviteToken: g.inviteToken ?? "",
    deleted: normalizeTombstones(g.deleted),
  };
}

/**
 * Voeg twee tuinversies samen. Inhoud per item (nieuwer wint), meta
 * (eigenaar/deling/uitnodiging) van `metaSource`. Idempotent: mergen met
 * dezelfde stand verandert niets meer, dus sync-loops doven vanzelf uit.
 */
export function mergeGarden(
  a: Garden,
  b: Garden,
  metaSource: "a" | "b" = "b"
): Garden {
  const sa = normalizeGarden(a);
  const sb = normalizeGarden(b);
  const tomb = mergeTombstones(sa.deleted, sb.deleted);
  const meta = metaSource === "a" ? sa : sb;
  // tuinnaam: nieuwste bewerking wint
  const name = stampOf(sb) >= stampOf(sa) ? sb.name : sa.name;
  return {
    ...meta,
    name,
    updatedAt: Math.max(stampOf(sa), stampOf(sb)),
    createdAt: sa.createdAt,
    elements: mergeElementLists(sa.elements, sb.elements, tomb.elements, tomb.crops),
    harvests: mergeLists(sa.harvests, sb.harvests, (h: HarvestEntry) => h.id, tomb.harvests),
    sowings: mergeLists(sa.sowings, sb.sowings, (s: SowingEntry) => s.id, tomb.sowings),
    expenses: mergeLists(sa.expenses, sb.expenses, (e: Expense) => e.id, tomb.expenses),
    incomes: mergeLists(sa.incomes, sb.incomes, (i: Income) => i.id, tomb.incomes),
    shopping: mergeLists(sa.shopping, sb.shopping, (s: ShoppingItem) => s.id, tomb.shopping),
    todos: mergeLists(sa.todos, sb.todos, (t: TodoItem) => t.id, tomb.todos),
    deleted: tomb,
  };
}

/** Voeg twee gewasstukjes-lijsten samen (voor live sleep-updates). */
export function mergeCropAssignments(
  local: CropAssignment[],
  incoming: CropAssignment[],
  tombCrops: Record<string, number>
): CropAssignment[] {
  return mergeLists(local, incoming, (c) => c.instanceId, tombCrops);
}

export function mergeCatalog(
  stored: Crop[],
  incoming: Crop[],
  tombStored: Record<string, number>,
  tombIncoming: Record<string, number>
): { list: Crop[]; tomb: Record<string, number> } {
  const tomb = mergeTomb(tombStored, tombIncoming);
  const list = mergeLists(
    stored.map(normalizeCrop),
    incoming.map(normalizeCrop),
    (c) => c.id,
    tomb
  );
  return { list, tomb };
}

/**
 * Na ongedaan maken (undo) kan een herrezen item een nieuwere tombstone op de
 * server hebben. Die undo is een bewuste actie van de gebruiker en moet winnen:
 * ruim zulke tombstones op en stempel de herrezen items vers.
 */
export function reviveDeleted(restored: Garden, base: Garden | undefined): Garden {
  const at = now();
  const tomb = normalizeTombstones(restored.deleted);
  const scrub = (
    ids: Set<string>,
    map: Record<string, number>
  ): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(map)) {
      if (!ids.has(k)) out[k] = v;
    }
    return out;
  };
  const elIds = new Set(restored.elements.map((e) => e.id));
  const cropIds = new Set<string>();
  for (const e of restored.elements) {
    for (const c of e.crops ?? []) cropIds.add(c.instanceId);
  }
  tomb.elements = scrub(elIds, tomb.elements);
  tomb.crops = scrub(cropIds, tomb.crops);
  tomb.harvests = scrub(new Set(restored.harvests.map((h) => h.id)), tomb.harvests);
  tomb.sowings = scrub(new Set(restored.sowings.map((s) => s.id)), tomb.sowings);
  tomb.expenses = scrub(new Set(restored.expenses.map((e) => e.id)), tomb.expenses);
  tomb.incomes = scrub(new Set(restored.incomes.map((i) => i.id)), tomb.incomes);
  tomb.shopping = scrub(new Set(restored.shopping.map((s) => s.id)), tomb.shopping);
  tomb.todos = scrub(new Set(restored.todos.map((t) => t.id)), tomb.todos);

  const bump = <T extends { id: string; updatedAt?: number }>(
    items: T[],
    baseItems: T[] | undefined
  ): T[] => {
    const bMap = new Map((baseItems ?? []).map((x) => [x.id, x]));
    return items.map((x) => {
      const b = bMap.get(x.id);
      // herrezen (zat niet in de serverstand) of nieuwer dan de tombstone: vers stempelen
      if (!b) return { ...x, updatedAt: at };
      return x;
    });
  };
  const bumpCrops = (els: GardenElement[], baseEls: GardenElement[] | undefined) => {
    const bMap = new Map((baseEls ?? []).map((e) => [e.id, e]));
    return els.map((e) => {
      const b = bMap.get(e.id);
      if (!b) {
        return {
          ...e,
          updatedAt: at,
          crops: (e.crops ?? []).map((c) => ({ ...c, updatedAt: at })),
        };
      }
      const bc = new Map((b.crops ?? []).map((c) => [c.instanceId, c]));
      return {
        ...e,
        crops: (e.crops ?? []).map((c) => (bc.has(c.instanceId) ? c : { ...c, updatedAt: at })),
      };
    });
  };
  return {
    ...restored,
    updatedAt: at,
    elements: bumpCrops(restored.elements, base?.elements),
    harvests: bump(restored.harvests, base?.harvests),
    sowings: bump(restored.sowings, base?.sowings),
    expenses: bump(restored.expenses, base?.expenses),
    incomes: bump(restored.incomes, base?.incomes),
    shopping: bump(restored.shopping, base?.shopping),
    todos: bump(restored.todos, base?.todos),
    deleted: tomb,
  };
}
