import { useEffect, useState, useCallback, useRef } from "react";
import type { AppData, Crop, Garden, GardenElement, CropAssignment, HarvestEntry, SowingEntry, Expense, Income, ShoppingItem, TodoItem, GardenObjectKey, GaasData, User } from "./types";
import { id, findFreeCropArea, roundM, PX_PER_M } from "./storage";
import {
  mergeCatalog,
  mergeCropAssignments,
  mergeGarden,
  normalizeCrop,
  normalizeGarden,
  normalizeTombstones,
  reviveDeleted,
  stableStringify,
  now as syncNow,
} from "./sync";
import { fitCropCounts } from "./cropIcons";
import { api, getToken, setToken, onUnauthorized, type MeResponse } from "./api";
import { realtime, type LiveCursor, type LiveUpdate, type LiveStatus, type PreviewPayload, type PresenceMember } from "./realtime";
import { GardenList } from "./GardenList";
import { ProfilePage } from "./ProfilePage";
import { GardenEditor } from "./GardenEditor";
import { AuthScreen } from "./AuthScreen";
import { InviteScreen } from "./InviteScreen";
import { useTheme } from "./useTheme";
import { getSupabase } from "./lib/supabaseClient";
import { objectDef } from "./gardenObjects";
import { lineTotal } from "./shopping";
import { guessCategory } from "./expenseCategories";
import "./App.css";

interface InviteTarget {
  gardenId: string;
  token: string;
}

const GARDENS_CACHE_KEY = "mp_gardens_cache_v1";

interface GardensCache {
  user: User;
  userNames: Record<string, string>;
  gardens: Garden[];
  cropCatalog: Crop[];
}

function readGardensCache(): GardensCache | null {
  try {
    const raw = localStorage.getItem(GARDENS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GardensCache>;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.user || typeof parsed.user.id !== "string") return null;
    if (!Array.isArray(parsed.gardens)) return null;
    return {
      user: parsed.user as User,
      userNames:
        parsed.userNames && typeof parsed.userNames === "object" ? parsed.userNames : {},
      gardens: parsed.gardens as Garden[],
      cropCatalog: Array.isArray(parsed.cropCatalog) ? (parsed.cropCatalog as Crop[]) : [],
    };
  } catch {
    return null;
  }
}

function writeGardensCache(snap: GardensCache): void {
  try {
    localStorage.setItem(GARDENS_CACHE_KEY, JSON.stringify(snap));
  } catch {
    try {
      const light: GardensCache = {
        ...snap,
        gardens: snap.gardens.map((g) => ({
          ...g,
          elements: [],
          harvests: [],
          sowings: [],
          expenses: [],
          incomes: [],
          shopping: [],
          todos: [],
        })),
      };
      localStorage.setItem(GARDENS_CACHE_KEY, JSON.stringify(light));
    } catch {
    }
  }
}

function clearGardensCache(): void {
  try {
    localStorage.removeItem(GARDENS_CACHE_KEY);
  } catch {
  }
}

const LAST_GARDEN_KEY = "mp_last_garden";
const CATALOG_DELETED_KEY = "mp_catalog_deleted";

function loadCatalogDeleted(): Record<string, number> {
  try {
    const raw = localStorage.getItem(CATALOG_DELETED_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveCatalogDeleted(deleted: Record<string, number>): void {
  try {
    localStorage.setItem(CATALOG_DELETED_KEY, JSON.stringify(deleted));
  } catch {
    // privaatmodus o.i.d.: gewoon niet onthouden
  }
}

function readLastGarden(): string | null {
  try {
    return localStorage.getItem(LAST_GARDEN_KEY);
  } catch {
    return null;
  }
}

function writeLastGarden(gardenId: string | null): void {
  try {
    if (gardenId) localStorage.setItem(LAST_GARDEN_KEY, gardenId);
    else localStorage.removeItem(LAST_GARDEN_KEY);
  } catch {
    // privaatmodus o.i.d.: gewoon niet onthouden
  }
}

function parseInvite(): InviteTarget | null {
  const m = /^\/invite\/([^/]+)\/([^/]+)\/?$/.exec(window.location.pathname);
  return m ? { gardenId: m[1], token: m[2] } : null;
}

export default function App() {
  const [initialCache] = useState<GardensCache | null>(() => readGardensCache());
  const [booted, setBooted] = useState(() => initialCache !== null);
  const [listLoading, setListLoading] = useState(() => {
    try {
      return !!getToken();
    } catch {
      return false;
    }
  });
  const prevActiveRef = useRef<string | null | undefined>(undefined);
  const [user, setUser] = useState<User | null>(() => initialCache?.user ?? null);
  const [data, setData] = useState<AppData>(() =>
    initialCache
      ? { gardens: initialCache.gardens, cropCatalog: initialCache.cropCatalog }
      : { gardens: [], cropCatalog: [] }
  );
  const [userNames, setUserNames] = useState<Record<string, string>>(
    () => initialCache?.userNames ?? {}
  );
  const [activeId, setActiveId] = useState<string | null>(() => readLastGarden());
  /** Profielpagina open (werkt vanaf lijst én editor; terugkeer herstelt de vorige plek). */
  const [profileOpen, setProfileOpen] = useState(false);
  const [presence, setPresence] = useState(0);
  const [presenceMembers, setPresenceMembers] = useState<PresenceMember[]>([]);
  const [livePreview, setLivePreview] = useState<{ gardenId: string; preview: PreviewPayload } | null>(null);
  /** Live muizen + selecties van andere editors (transient; tekent het canvas zelf). */
  const liveCursorsRef = useRef(new Map<string, LiveCursor>());
  /** throttle + selectiewijziging-detectie voor het versturen van de eigen cursor */
  const cursorThrottleRef = useRef(0);
  const cursorSelectionRef = useRef("");
  const [liveStatus, setLiveStatus] = useState<LiveStatus>("offline");
  const [invite, setInvite] = useState<InviteTarget | null>(() => parseInvite());
  const [theme, toggleTheme] = useTheme();

  const undoStack = useRef<AppData[]>([]);
  const redoStack = useRef<AppData[]>([]);

  /** Laatst bekende serverstand per tuin: alles wat hiervan afwijkt wordt (opnieuw) omhoog gestuurd. */
  const baseRef = useRef<Map<string, Garden>>(new Map());
  /** Laatst bekende serverstand van de catalogus. */
  const baseCatalogRef = useRef<Crop[]>([]);
  /** tombstones van verwijderde catalogusgewassen */
  const catalogDeletedRef = useRef<Record<string, number>>(loadCatalogDeleted());
  /** actieve tuin, ook leesbaar vanuit het realtime-effect */
  const activeGardenRef = useRef<string | null>(null);
  /** spiegel van `data`, voor de async push-logica */
  const dataRef = useRef(data);
  dataRef.current = data;
  /** debounce-timers en lopende pushes: nooit twee PUTs voor dezelfde tuin tegelijk */
  const pushTimerRef = useRef(new Map<string, number>());
  const pushingRef = useRef(new Set<string>());
  const catalogTimerRef = useRef(0);
  const catalogPushingRef = useRef(false);
  const lastMoveRef = useRef(0);
  /** eigen throttle voor previews, zodat die de sleep niet verdringen */
  const lastPreviewRef = useRef(0);
  /** nog te versturen sleep-stand (trailing edge van de throttle) */
  const pendingMoveRef = useRef(new Map<string, LiveUpdate[]>());
  const moveTimerRef = useRef(0);
  /** timer die een vastgebleven live-preview opruimt */
  const previewTimerRef = useRef(0);

  // Every data mutation goes through `mutate`, which snapshots the previous
  // state onto the undo stack (and clears redo, since the history forks).
  // Remote updates bypassen dit: die zijn geen eigen wijziging en horen niet
  // in de undo-geschiedenis thuis.
  const mutate = useCallback((updater: (d: AppData) => AppData) => {
    setData((prev) => {
      undoStack.current.push(prev);
      if (undoStack.current.length > 100) undoStack.current.shift();
      redoStack.current = [];
      return updater(prev);
    });
  }, []);

  const undo = useCallback(() => {
    const cur = dataRef.current;
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(cur);
    // Een undo is een bewuste actie en moet winnen van tombstones: ruim de
    // tombstones op van alles wat hiermee herrijst en stempel vers.
    const tomb = { ...catalogDeletedRef.current };
    const ids = new Set(prev.cropCatalog.map((c) => c.id));
    const resurrected = new Set(Object.keys(tomb).filter((id) => ids.has(id)));
    if (resurrected.size > 0) {
      for (const id of resurrected) delete tomb[id];
      catalogDeletedRef.current = tomb;
      saveCatalogDeleted(tomb);
    }
    const gardens = prev.gardens.map((g) => reviveDeleted(g, baseRef.current.get(g.id)));
    const cropCatalog =
      resurrected.size > 0
        ? prev.cropCatalog.map((c) => (resurrected.has(c.id) ? { ...c, updatedAt: syncNow() } : c))
        : prev.cropCatalog;
    setData({ gardens, cropCatalog });
  }, []);

  const redo = useCallback(() => {
    const cur = dataRef.current;
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(cur);
    const tomb = { ...catalogDeletedRef.current };
    const ids = new Set(next.cropCatalog.map((c) => c.id));
    const resurrected = new Set(Object.keys(tomb).filter((id) => ids.has(id)));
    if (resurrected.size > 0) {
      for (const id of resurrected) delete tomb[id];
      catalogDeletedRef.current = tomb;
      saveCatalogDeleted(tomb);
    }
    const gardens = next.gardens.map((g) => reviveDeleted(g, baseRef.current.get(g.id)));
    const cropCatalog =
      resurrected.size > 0
        ? next.cropCatalog.map((c) => (resurrected.has(c.id) ? { ...c, updatedAt: syncNow() } : c))
        : next.cropCatalog;
    setData({ gardens, cropCatalog });
  }, []);

  // ----- authentication / boot -----
  const loadList = useCallback(async () => {
    try {
      const res: MeResponse = await api.me();
      setUser(res.user);
      setUserNames(res.userNames);
      const fetched = res.gardens.map((g) =>
        normalizeGarden({ ...g, shopping: (g as Garden).shopping ?? [], sowings: (g as Garden).sowings ?? [] })
      );
      const fetchedCatalog = res.cropCatalog.map(normalizeCrop);
      // Lokaal werk dat nog onderweg is nooit weggooien: voeg samen met de
      // serverstand. Zonder lokale wijzigingen is dit een rechte overname.
      const localGardens = dataRef.current.gardens;
      const localCatalog = dataRef.current.cropCatalog;
      const gardens = fetched.map((g) => {
        const local = localGardens.find((x) => x.id === g.id);
        return local ? mergeGarden(local, g, "b") : g;
      });
      for (const local of localGardens) {
        if (!gardens.some((g) => g.id === local.id)) gardens.push(local);
      }
      // Catalogus: verwijderingen van anderen leren (niet laten herrijzen),
      // eigen nieuwere bewerkingen behouden.
      const tomb = { ...catalogDeletedRef.current };
      for (const b of baseCatalogRef.current) {
        if (!fetchedCatalog.some((c) => c.id === b.id) && tomb[b.id] === undefined) {
          tomb[b.id] = syncNow();
        }
      }
      catalogDeletedRef.current = tomb;
      saveCatalogDeleted(tomb);
      const { list: catalog } = mergeCatalog(fetchedCatalog, localCatalog.map(normalizeCrop), {}, tomb);
      for (const g of fetched) baseRef.current.set(g.id, g);
      baseCatalogRef.current = fetchedCatalog;
      setData({ gardens, cropCatalog: catalog });
      writeGardensCache({ user: res.user, userNames: res.userNames, gardens, cropCatalog: catalog });
    } catch {
    }
  }, []);

  const reloadList = useCallback(async () => {
    setListLoading(true);
    try {
      await loadList();
    } finally {
      setListLoading(false);
    }
  }, [loadList]);

  useEffect(() => {
    const off = onUnauthorized(() => {
      setUser(null);
      realtime.disconnect();
      setData({ gardens: [], cropCatalog: [] });
      setUserNames({});
      clearGardensCache();
    });
    if (!getToken()) {
      setBooted(true);
      return off;
    }
    if (initialCache) {
      for (const g of initialCache.gardens) baseRef.current.set(g.id, g);
      baseCatalogRef.current = initialCache.cropCatalog;
    }
    void reloadList()
      .catch(() => setUser(null))
      .finally(() => setBooted(true));
    return off;
  }, [reloadList, initialCache]);

  const handleAuthed = useCallback((u: User, token: string) => {
    setToken(token);
    setUser(u);
    setData({ gardens: [], cropCatalog: [] });
    void reloadList();
  }, [reloadList]);

  const logout = useCallback(async () => {
    await api.logout();
    try {
      await getSupabase()?.auth.signOut();
    } catch {
    }
    realtime.disconnect();
    setUser(null);
    setActiveId(null);
    setProfileOpen(false);
    setData({ gardens: [], cropCatalog: [] });
    setUserNames({});
    clearGardensCache();
  }, []);

  const handleProfileUpdated = useCallback((u: User) => {
    setUser(u);
    setUserNames((prev) => ({ ...prev, [u.id]: u.username }));
    realtime.reconnect();
  }, []);

  useEffect(() => {
    if (!user) return;
    const t = window.setTimeout(() => {
      writeGardensCache({ user, userNames, gardens: data.gardens, cropCatalog: data.cropCatalog });
    }, 600);
    return () => window.clearTimeout(t);
  }, [user, userNames, data]);

  // ----- push-engine: eigen wijzigingen naar de server -----
  // Eén debounce per tuin, nooit twee PUTs tegelijk. Samen met de merge op de
  // server kan een eigen wijziging nooit meer andermans werk overschrijven en
  // kan een binnenkomende wijziging nooit meer eigen werk terugdraaien: wat
  // afwijkt van de serverstand wordt net zo lang opnieuw omhoog gestuurd tot
  // de server het bevestigd heeft.
  const pushGarden = useCallback(async (gardenId: string) => {
    if (pushingRef.current.has(gardenId)) return;
    const cur = dataRef.current.gardens.find((g) => g.id === gardenId);
    if (!cur) return;
    const base = baseRef.current.get(gardenId);
    if (base && stableStringify(cur) === stableStringify(base)) return;
    pushingRef.current.add(gardenId);
    try {
      const saved = await api.putGarden(cur);
      const norm = normalizeGarden(saved);
      baseRef.current.set(norm.id, norm);
      setData((prev) => {
        const local = prev.gardens.find((g) => g.id === norm.id);
        if (!local) return prev;
        // Tijdens de vlucht alweer bewerkt? Dan wint dat nieuwere werk mee.
        const adopted = mergeGarden(norm, normalizeGarden(local), "a");
        if (stableStringify(adopted) === stableStringify(local)) return prev;
        return {
          ...prev,
          gardens: prev.gardens.map((g) => (g.id === norm.id ? adopted : g)),
        };
      });
    } catch {
      // mislukt (offline o.i.d.): het sync-effect hieronder probeert het later opnieuw
    } finally {
      pushingRef.current.delete(gardenId);
    }
  }, []);

  const schedulePushGarden = useCallback(
    (gardenId: string, delay = 350) => {
      const t = pushTimerRef.current.get(gardenId);
      if (t) window.clearTimeout(t);
      pushTimerRef.current.set(
        gardenId,
        window.setTimeout(() => {
          pushTimerRef.current.delete(gardenId);
          void pushGarden(gardenId);
        }, delay)
      );
    },
    [pushGarden]
  );

  const pushCatalog = useCallback(async () => {
    if (catalogPushingRef.current) return;
    const cur = dataRef.current.cropCatalog;
    if (cur.length === 0) return;
    if (stableStringify(cur.map(normalizeCrop)) === stableStringify(baseCatalogRef.current)) return;
    catalogPushingRef.current = true;
    try {
      const res = await api.putCatalog(cur, catalogDeletedRef.current);
      const serverList = res.cropCatalog.map(normalizeCrop);
      // Verwijderingen van anderen leren: wat in de vorige serverstand zat en
      // nu weg is (zonder dat wij het deden) alsnog als verwijderd markeren,
      // zodat het nooit meer herrijst.
      const tomb = { ...catalogDeletedRef.current };
      for (const b of baseCatalogRef.current) {
        if (!serverList.some((c) => c.id === b.id) && tomb[b.id] === undefined) {
          tomb[b.id] = syncNow();
        }
      }
      catalogDeletedRef.current = tomb;
      saveCatalogDeleted(tomb);
      baseCatalogRef.current = serverList;
      setData((prev) => {
        const { list: merged } = mergeCatalog(
          serverList,
          prev.cropCatalog.map(normalizeCrop),
          {},
          tomb
        );
        if (stableStringify(merged) === stableStringify(prev.cropCatalog)) return prev;
        return { ...prev, cropCatalog: merged };
      });
    } catch {
      // later opnieuw via het sync-effect
    } finally {
      catalogPushingRef.current = false;
    }
  }, []);

  const schedulePushCatalog = useCallback(
    (delay = 350) => {
      window.clearTimeout(catalogTimerRef.current);
      catalogTimerRef.current = window.setTimeout(() => {
        catalogTimerRef.current = 0;
        void pushCatalog();
      }, delay);
    },
    [pushCatalog]
  );

  // ----- realtime (WebSocket) -----
  useEffect(() => {
    if (!user) return;
    realtime.connect();
    // De opruiming hieronder verbreekt de verbinding; bij een nieuwe ronde
    // (bijv. StrictMode of een rerender van dit effect) wist die ook de tuin.
    // Zonder dit blijft de socket open maar zit hij nergens in, en blijft het
    // bolletje eeuwig op "verbinden".
    realtime.setGarden(activeGardenRef.current);
    const stopWatchVisibility = realtime.watchVisibility();
    const stopStatus = realtime.onStatus(setLiveStatus);
    // Diagnose in de browserconsole: __mpLive()
    (window as unknown as { __mpLive?: () => unknown }).__mpLive = () => realtime.debug();
    (window as unknown as { __mpCursors?: () => unknown }).__mpCursors = () =>
      [...liveCursorsRef.current.values()];
    const off = realtime.onMessage((msg) => {
      if (msg.type === "garden") {
        const incoming = normalizeGarden({
          ...msg.garden,
          shopping: (msg.garden as Garden).shopping ?? [],
          sowings: (msg.garden as Garden).sowings ?? [],
        });
        // Serverstand bijwerken; wijkt ons lokale werk daarvan af, dan stuurt
        // het sync-effect dat vanzelf na (nooit andersom terugdraaien).
        baseRef.current.set(incoming.id, incoming);
        setLivePreview((cur) => (cur?.gardenId === incoming.id ? null : cur));
        setData((prev) => {
          const local = prev.gardens.find((g) => g.id === incoming.id);
          if (!local) return { ...prev, gardens: [...prev.gardens, incoming] };
          // Per item samenvoegen: nieuwer wint, deletes via tombstones. Ons
          // eigen nieuwere werk overleeft dit altijd.
          const merged = mergeGarden(local, incoming, "b");
          if (stableStringify(merged) === stableStringify(local)) return prev;
          return {
            ...prev,
            gardens: prev.gardens.map((g) => (g.id === incoming.id ? merged : g)),
          };
        });
      } else if (msg.type === "move") {
        const updates = msg.updates as LiveUpdate[];
        setData((prev) => {
          const g = prev.gardens.find((x) => x.id === msg.gardenId);
          if (!g) return prev;
          const base = baseRef.current.get(msg.gardenId);
          const baseById = new Map((base ?? g).elements.map((e) => [e.id, e]));
          const tombCrops = g.deleted?.crops ?? {};
          const byId = new Map(updates.map((u) => [u.id, u]));
          let changed = false;
          const elements = g.elements.map((e) => {
            const u = byId.get(e.id);
            if (!u) return e;
            const b = baseById.get(e.id);
            // Dit element lokaal bewerkt sinds de serverstand? Dan wint het
            // eigen werk en negeren we de sleep van de ander voor dit element.
            if (b && (e.updatedAt ?? 0) > (b.updatedAt ?? 0)) return e;
            changed = true;
            const next: GardenElement = { ...e };
            if (u.x !== undefined) next.x = u.x;
            if (u.y !== undefined) next.y = u.y;
            if (u.widthM !== undefined) next.widthM = u.widthM;
            if (u.heightM !== undefined) next.heightM = u.heightM;
            if (u.crops && next.type === "bed") {
              next.crops = mergeCropAssignments(
                e.crops ?? [],
                u.crops.map((c) => ({ ...c, updatedAt: 0 })),
                tombCrops
              );
            }
            return next;
          });
          if (!changed) return prev;
          const nextG: Garden = { ...g, elements };
          // Transient: meeschuiven met de basis zodat het sync-effect hier
          // geen PUT voor start; een echte eigen bewerking pusht het vanzelf mee.
          baseRef.current.set(msg.gardenId, normalizeGarden(nextG));
          return { ...prev, gardens: prev.gardens.map((x) => (x.id === msg.gardenId ? nextG : x)) };
        });
      } else if (msg.type === "preview") {
        if (msg.preview.kind === "clear") {
          window.clearTimeout(previewTimerRef.current);
          setLivePreview(null);
        } else {
          setLivePreview({ gardenId: msg.gardenId, preview: msg.preview });
          // vangnet: een preview die blijft hangen (tab op de achtergrond,
          // verbinding die net wegvalt) zelf opruimen i.p.v. permanent te
          // blijven staan als losse kopie.
          window.clearTimeout(previewTimerRef.current);
          previewTimerRef.current = window.setTimeout(() => setLivePreview(null), 4000);
        }
      } else if (msg.type === "cursor") {
        if (msg.userId !== user.id) {
          liveCursorsRef.current.set(msg.userId, {
            userId: msg.userId,
            username: msg.username,
            cursor: msg.cursor,
            selection: msg.selection ?? [],
            at: Date.now(),
          });
        }
      } else if (msg.type === "presence") {
        setPresence(msg.count);
        setPresenceMembers(msg.members ?? []);
        // Cursors van vertrokken editors meteen opruimen (verlies valt ook
        // weg via de 4s-verval in de tekenlus).
        const ids = new Set((msg.members ?? []).map((m) => m.userId));
        for (const uid of [...liveCursorsRef.current.keys()]) {
          if (!ids.has(uid)) liveCursorsRef.current.delete(uid);
        }
      } else if (msg.type === "kicked") {
        // toegang ingetrokken terwijl je meekeek: terug naar de lijst.
        // Het herladen regelt het terugkeer-effect hieronder.
        setActiveId((a) => (a === msg.gardenId ? null : a));
        setPresence(0);
        setPresenceMembers([]);
      }
    });
    return () => {
      off();
      stopWatchVisibility();
      stopStatus();
      realtime.disconnect();
    };
  }, [user, loadList]);

  useEffect(() => {
    activeGardenRef.current = activeId;
    realtime.setGarden(activeId);
    if (activeId === null) {
      setPresence(0);
      setPresenceMembers([]);
    }
    // Ander canvas = andere muizen: oude cursors horen hier niet.
    liveCursorsRef.current.clear();
  }, [activeId]);

  // Onthoud de geopende tuin, en vergeet hem zodra je teruggaat naar de lijst.
  useEffect(() => {
    writeLastGarden(activeId);
  }, [activeId]);

  // Een herstelde tuin die niet (meer) in je account zit mag niet blijven hangen.
  // `booted` zorgt dat dit pas ná het laden van de tuinlijst gechecked wordt.
  useEffect(() => {
    if (!booted || !activeId) return;
    if (!data.gardens.some((g) => g.id === activeId)) setActiveId(null);
  }, [booted, data.gardens, activeId]);

  // Re-fetch the list when returning to it, so newly shared gardens (and name
  // changes from others) appear. Alleen bij een echte terugkeer (editor ->
  // lijst): niet op de eerste mount, want de boot-load heeft de lijst dan
  // net al opgehaald.
  useEffect(() => {
    const prev = prevActiveRef.current;
    prevActiveRef.current = activeId;
    if (!user || !booted || activeId !== null) return;
    if (prev === undefined || prev === null) return;
    void reloadList();
  }, [user, booted, activeId, reloadList]);

  // ----- sync local edits to the server -----
  // Alles wat afwijkt van de laatst bekende serverstand wordt (met vertraging
  // en één tegelijk) omhoog gestuurd. Binnenkomende wijzigingen draaien eigen
  // werk nooit terug: die zijn al samengevoegd vóórdat dit effect kijkt, dus
  // wat hier nog afwijkt is per definitie eigen nieuwer werk.
  useEffect(() => {
    for (const g of data.gardens) {
      if (pushingRef.current.has(g.id)) continue;
      const base = baseRef.current.get(g.id);
      if (!base) {
        baseRef.current.set(g.id, normalizeGarden(g));
        continue;
      }
      if (stableStringify(normalizeGarden(g)) !== stableStringify(base)) {
        schedulePushGarden(g.id);
      }
    }
    // Een lege catalogus is nog nooit geladen; die mag niet naar de server,
    // anders wist het opgeslagen gewassenassortiment bij het opstarten.
    if (data.cropCatalog.length > 0) {
      if (
        stableStringify(data.cropCatalog.map(normalizeCrop)) !==
          stableStringify(baseCatalogRef.current) &&
        !catalogPushingRef.current
      ) {
        schedulePushCatalog();
      }
    }
  }, [data, schedulePushGarden, schedulePushCatalog]);

  const sendLiveMove = useCallback((gId: string, updates: LiveUpdate[]) => {
    const now = Date.now();
    const since = now - lastMoveRef.current;
    if (since < 60) {
      // Trailing: de laatste stand mag nooit verdwijnen, anders ziet de andere
      // editor de eindpositie pas na een refresh. Bewaar hem en stuur hem zodra
      // het throttle-venster voorbij is.
      pendingMoveRef.current.set(gId, updates);
      if (!moveTimerRef.current) {
        moveTimerRef.current = window.setTimeout(() => {
          moveTimerRef.current = 0;
          lastMoveRef.current = Date.now();
          const pending = pendingMoveRef.current;
          pendingMoveRef.current = new Map();
          for (const [id, ups] of pending) realtime.sendMove(id, ups);
        }, 60 - since);
      }
      return;
    }
    lastMoveRef.current = now;
    // openstaande trailing update meteen mee, dan is één bericht genoeg
    const pending = pendingMoveRef.current;
    pendingMoveRef.current = new Map();
    for (const [id, ups] of pending) realtime.sendMove(id, ups);
    realtime.sendMove(gId, updates);
  }, []);

  const sendLivePreview = useCallback((gId: string, preview: PreviewPayload) => {
    // Een clear nooit weglaten: als die door de rate-limit zou vallen blijft
    // het preview-frame van de laatste sleep bij de andere editors staan
    // (zwevende kopieën van bed/gaas/gewas die niet meer verdwijnen).
    if (preview.kind !== "clear") {
      const now = Date.now();
      // eigen throttle: previews mogen niet met de sleep-berichten concurreren
      if (now - lastPreviewRef.current < 60) return;
      lastPreviewRef.current = now;
    }
    realtime.sendPreview(gId, preview);
  }, []);

  /**
   * Eigen muis + selectie live delen (max ~12/s; een selectiewissel gaat altijd
   * direct mee, ook zonder muisbeweging). De ontvangende kant tekent dit op
   * het canvas: je ziet wie waar is en wat hij geselecteerd heeft.
   */
  const sendLiveCursor = useCallback((cursor: { x: number; y: number } | null, selection: string[]) => {
    const gId = activeGardenRef.current;
    if (!gId) return;
    const now = Date.now();
    const key = stableStringify(selection);
    const selectionChanged = key !== cursorSelectionRef.current;
    if (cursor && !selectionChanged && now - cursorThrottleRef.current < 80) return;
    cursorThrottleRef.current = now;
    cursorSelectionRef.current = key;
    realtime.sendCursor(gId, cursor, selection.slice(0, 100));
  }, []);

  const garden = data.gardens.find((g) => g.id === activeId) ?? null;

  const updateGarden = useCallback((gardenId: string, updater: (g: Garden) => Garden) => {
    mutate((d) => ({
      ...d,
      gardens: d.gardens.map((g) => (g.id === gardenId ? updater(g) : g)),
    }));
  }, [mutate]);

  const addGarden = useCallback(async (name: string) => {
    try {
      const g = await api.createGarden(name);
      const norm = normalizeGarden(g);
      baseRef.current.set(norm.id, norm);
      setData((prev) => ({ ...prev, gardens: [...prev.gardens, norm] }));
      setActiveId(norm.id);
    } catch {
      // keep UI quiet; the list refresh picks up server state
    }
  }, []);

  const deleteGarden = useCallback((gId: string) => {
    api.deleteGarden(gId).catch(() => {});
    baseRef.current.delete(gId);
    const t = pushTimerRef.current.get(gId);
    if (t) {
      window.clearTimeout(t);
      pushTimerRef.current.delete(gId);
    }
    mutate((d) => ({ ...d, gardens: d.gardens.filter((g) => g.id !== gId) }));
    setActiveId((a) => (a === gId ? null : a));
  }, [mutate]);

  const unshareGarden = useCallback(async (gardenId: string, userId: string) => {
    try {
      const g = await api.unshare(gardenId, userId);
      const norm = normalizeGarden(g);
      baseRef.current.set(norm.id, norm);
      setData((prev) => ({
        ...prev,
        gardens: prev.gardens.map((x) => (x.id === norm.id ? mergeGarden(x, norm, "b") : x)),
      }));
    } catch {
      // ignore
    }
  }, []);

  const onGardenUpdated = useCallback((g: Garden) => {
    const norm = normalizeGarden(g);
    baseRef.current.set(norm.id, norm);
    setData((prev) => ({
      ...prev,
      gardens: prev.gardens.some((x) => x.id === norm.id)
        ? prev.gardens.map((x) => (x.id === norm.id ? mergeGarden(x, norm, "b") : x))
        : [...prev.gardens, norm],
    }));
  }, []);

  /** Join via invite link, then open the garden and clean the URL. */
  const handleInviteJoined = useCallback(
    (g: Garden) => {
      setInvite(null);
      window.history.replaceState({}, "", "/");
      const norm = normalizeGarden(g);
      baseRef.current.set(norm.id, norm);
      setData((prev) => {
        const exists = prev.gardens.some((x) => x.id === norm.id);
        return {
          ...prev,
          gardens: exists
            ? prev.gardens.map((x) => (x.id === norm.id ? mergeGarden(x, norm, "b") : x))
            : [...prev.gardens, norm],
        };
      });
      setActiveId(norm.id);
    },
    []
  );

  const addElementAt = useCallback(
    (gId: string, type: "bed" | "path" | "veld", x: number, y: number, widthM: number, heightM: number) => {
      const count = data.gardens.find((g) => g.id === gId)?.elements.filter(
        (e) => e.type === type
      ).length ?? 0;
      const at = syncNow();
      const el: GardenElement = {
        id: id(),
        type,
        label: type === "bed" ? `Bed ${count + 1}` : type === "veld" ? `Veld ${count + 1}` : `Pad ${count + 1}`,
        x,
        y,
        widthM: Math.max(0.1, widthM),
        heightM: Math.max(0.1, heightM),
        color: type === "bed" ? BED_COLOR : type === "veld" ? VELD_COLOR : PATH_COLOR,
        crops: [],
        updatedAt: at,
      };
      updateGarden(gId, (g) => ({ ...g, elements: [...g.elements, el] }));
      return el.id;
    },
    [data.gardens, updateGarden]
  );

  const addObject = useCallback(
    (
      gId: string,
      object: GardenObjectKey,
      x: number,
      y: number,
      gaas?: GaasData
    ): string => {
      const at = syncNow();
      const elBase: GardenElement = {
        id: id(),
        type: "object",
        object,
        label: "",
        x: Math.round(x),
        y: Math.round(y),
        widthM: 0.1,
        heightM: 0.1,
        color: "#666666",
        crops: [],
        updatedAt: at,
      };
      if (object === "gaas" && gaas) {
        const el: GardenElement = {
          ...elBase,
          label: "Gaas",
          widthM: 0.1,
          heightM: 0.1,
          color: "#4f9a6a",
          gaas,
        };
        updateGarden(gId, (g) => ({ ...g, elements: [...g.elements, el] }));
        return el.id;
      }
      const def = objectDef(object);
      if (!def) return "";
      const size = def.radiusM ? def.radiusM * 2 : def.widthM;
      const el: GardenElement = {
        ...elBase,
        label: def.name,
        widthM: def.shape === "circle" ? size : def.widthM,
        heightM: def.shape === "circle" ? size : def.heightM,
        shape: def.shape,
        color: def.color,
      };
      updateGarden(gId, (g) => ({ ...g, elements: [...g.elements, el] }));
      return el.id;
    },
    [data.gardens, updateGarden]
  );

  const updateElement = useCallback(
    (gId: string, eId: string, patch: Partial<GardenElement>) => {
      const at = syncNow();
      updateGarden(gId, (g) => ({
        ...g,
        elements: g.elements.map((e) => {
          if (e.id !== eId) return e;
          let next: Partial<GardenElement> = { ...patch };
          if (
            e.type === "bed" &&
            e.crops.length > 0 &&
            (patch.widthM !== undefined || patch.heightM !== undefined)
          ) {
            const ow = e.widthM || 1;
            const oh = e.heightM || 1;
            const nw = patch.widthM ?? e.widthM;
            const nh = patch.heightM ?? e.heightM;
            next.crops = e.crops.map((c) => {
              if (!c.area) return { ...c, updatedAt: at };
              return {
                ...c,
                updatedAt: at,
                area: {
                  x: c.area.x * (nw / ow),
                  y: c.area.y * (nh / oh),
                  w: c.area.w * (nw / ow),
                  h: c.area.h * (nh / oh),
                },
              };
            });
          }
          return { ...e, ...next, updatedAt: at };
        }),
      }));
    },
    [updateGarden]
  );

  /** Verwijder elementen, met tombstone zodat de delete overal doorkomt en
   *  nooit meer herrijst — maar andermans nieuwere werk blijft winnen. */
  const markDeletedElements = (g: Garden, ids: string[]): Garden => {
    const at = syncNow();
    const set = new Set(ids);
    const tomb = normalizeTombstones(g.deleted);
    for (const id of set) tomb.elements[id] = at;
    return {
      ...g,
      elements: g.elements.filter((e) => !set.has(e.id)),
      deleted: tomb,
    };
  };

  const removeElement = useCallback(
    (gId: string, eId: string) => {
      updateGarden(gId, (g) => markDeletedElements(g, [eId]));
    },
    [updateGarden]
  );

  const removeElements = useCallback(
    (gId: string, ids: string[]) => {
      mutate((d) => ({
        ...d,
        gardens: d.gardens.map((g) =>
          g.id === gId ? markDeletedElements(g, ids) : g
        ),
      }));
    },
    [mutate]
  );

  const applyElements = useCallback(
    (
      gId: string,
      updates: {
        id: string;
        x?: number;
        y?: number;
        widthM?: number;
        heightM?: number;
        crops?: CropAssignment[];
        gaas?: GaasData;
      }[]
    ) => {
      if (updates.length === 0) return;
      const at = syncNow();
      mutate((d) => ({
        ...d,
        gardens: d.gardens.map((g) => {
          if (g.id !== gId) return g;
          const byId = new Map(updates.map((u) => [u.id, u]));
          return {
            ...g,
            elements: g.elements.map((e) => {
              const u = byId.get(e.id);
              if (!u) return e;
              const next: Partial<GardenElement> = {};
              if (u.x !== undefined) next.x = u.x;
              if (u.y !== undefined) next.y = u.y;
              if (u.widthM !== undefined) next.widthM = u.widthM;
              if (u.heightM !== undefined) next.heightM = u.heightM;
              if (u.crops !== undefined) {
                next.crops = u.crops.map((c) => ({ ...c, updatedAt: at }));
              }
              if (u.gaas !== undefined) next.gaas = u.gaas;
              return { ...e, ...next, updatedAt: at };
            }),
          };
        }),
      }));
    },
    [mutate]
  );

  const duplicateElements = useCallback(
    (gId: string, ids: string[]) => {
      const at = syncNow();
      const srcs =
        data.gardens
          .find((g) => g.id === gId)
          ?.elements.filter((e) => ids.includes(e.id)) ?? [];
      const copies: GardenElement[] = srcs.map((src) => ({
        ...src,
        id: id(),
        x: src.x + 30,
        y: src.y + 30,
        updatedAt: at,
        crops: src.crops.map((c) => ({ ...c, instanceId: id(), updatedAt: at })),
      }));
      updateGarden(gId, (g) => ({
        ...g,
        elements: [...g.elements, ...copies],
      }));
      return copies.map((c) => c.id);
    },
    [data.gardens, updateGarden]
  );

  /** Voegt een stuk gewas toe. Zonder `at` wordt automatisch het eerste vrije
   *  plekje in het bed gezocht; met `at` (in meters, bed-relatief) wordt het
   *  stuk daar geplaatst. */
  const addCropAt = useCallback(
    (
      gId: string,
      eId: string,
      cropId: string,
      at?: { x: number; y: number; w: number; h: number }
    ) => {
      const crop = data.cropCatalog.find((c) => c.id === cropId);
      if (!crop) return;
      const bed = data.gardens
        .find((g) => g.id === gId)
        ?.elements.find((e) => e.id === eId);
      if (!bed || bed.type !== "bed") return;

      const bedW = bed.widthM;
      const bedH = bed.heightM;
      const taken = bed.crops.map((c) => c.area).filter(Boolean) as {
        x: number;
        y: number;
        w: number;
        h: number;
      }[];

      let area: { x: number; y: number; w: number; h: number };
      if (at) {
        // binnen het bed klemmen en op 5 cm afronden
        const w = roundM(Math.max(0.1, Math.min(at.w, bedW)));
        const h = roundM(Math.max(0.1, Math.min(at.h, bedH)));
        const x = roundM(Math.max(0, Math.min(at.x, bedW - w)));
        const y = roundM(Math.max(0, Math.min(at.y, bedH - h)));
        area = { x, y, w, h };
      } else {
        area = findFreeCropArea(bedW, bedH, taken);
      }

      // Aantal bij vaste tussenafstand uit de maat afleiden (groter = meer).
      const fit = fitCropCounts(area.w, area.h, crop.rowSpacing, crop.plantSpacing, 0.1);
      const assignment: CropAssignment = {
        instanceId: id(),
        cropId,
        rows: fit.rows,
        cols: fit.cols,
        rowSpacing: crop.rowSpacing,
        plantSpacing: crop.plantSpacing,
        padding: 0.1,
        area,
        updatedAt: syncNow(),
      };
      updateGarden(gId, (g) => ({
        ...g,
        elements: g.elements.map((e) =>
          e.id === eId ? { ...e, crops: [...e.crops, assignment] } : e
        ),
      }));
      return assignment.instanceId;
    },
    [data.cropCatalog, data.gardens, updateGarden]
  );

  const updateCrop = useCallback(
    (gId: string, eId: string, instanceId: string, patch: Partial<CropAssignment>) => {
      const at = syncNow();
      updateGarden(gId, (g) => ({
        ...g,
        elements: g.elements.map((e) =>
          e.id === eId
            ? {
                ...e,
                crops: e.crops.map((c) =>
                  c.instanceId === instanceId ? { ...c, ...patch, updatedAt: at } : c
                ),
              }
            : e
        ),
      }));
    },
    [updateGarden]
  );

  const removeCrop = useCallback(
    (gId: string, eId: string, instanceId: string) => {
      const at = syncNow();
      updateGarden(gId, (g) => ({
        ...g,
        elements: g.elements.map((e) =>
          e.id === eId
            ? { ...e, crops: e.crops.filter((c) => c.instanceId !== instanceId) }
            : e
        ),
        deleted: { ...normalizeTombstones(g.deleted), crops: { ...g.deleted?.crops, [instanceId]: at } },
      }));
    },
    [updateGarden]
  );

  const duplicateCrop = useCallback(
    (gId: string, eId: string, instanceId: string): string | null => {
      const bed = data.gardens
        .find((g) => g.id === gId)
        ?.elements.find((e) => e.id === eId);
      const src = bed?.crops.find((c) => c.instanceId === instanceId);
      if (!src) return null;
      const copy: CropAssignment = {
        ...src,
        instanceId: id(),
        updatedAt: syncNow(),
        area: src.area
          ? { ...src.area, x: src.area.x + 0.1, y: src.area.y + 0.1 }
          : undefined,
      };
      updateGarden(gId, (g) => ({
        ...g,
        elements: g.elements.map((e) =>
          e.id === eId ? { ...e, crops: [...e.crops, copy] } : e
        ),
      }));
      return copy.instanceId;
    },
    [data.gardens, updateGarden]
  );

  const addCropToCatalog = useCallback((crop: Omit<Crop, "id">) => {
    const full: Crop = { ...crop, id: id(), updatedAt: syncNow() };
    mutate((d) => ({ ...d, cropCatalog: [...d.cropCatalog, full] }));
  }, [mutate]);

  const updateCropInCatalog = useCallback(
    (cropId: string, patch: Partial<Crop>) => {
      const at = syncNow();
      mutate((d) => ({
        ...d,
        cropCatalog: d.cropCatalog.map((c) =>
          c.id === cropId ? { ...c, ...patch, updatedAt: at } : c
        ),
      }));
    },
    [mutate]
  );

  const removeCropFromCatalog = useCallback(
    (cropId: string) => {
      const tomb = { ...catalogDeletedRef.current, [cropId]: syncNow() };
      catalogDeletedRef.current = tomb;
      saveCatalogDeleted(tomb);
      mutate((d) => ({
        ...d,
        cropCatalog: d.cropCatalog.filter((c) => c.id !== cropId),
      }));
    },
    [mutate]
  );

  const addHarvest = useCallback(
    (gId: string, entry: Omit<HarvestEntry, "id">) => {
      const full: HarvestEntry = { ...entry, id: id(), updatedAt: syncNow() };
      updateGarden(gId, (g) => ({ ...g, harvests: [...g.harvests, full] }));
    },
    [updateGarden]
  );

  const updateHarvest = useCallback(
    (gId: string, hId: string, patch: Partial<HarvestEntry>) => {
      const at = syncNow();
      updateGarden(gId, (g) => ({
        ...g,
        harvests: g.harvests.map((h) => (h.id === hId ? { ...h, ...patch, updatedAt: at } : h)),
      }));
    },
    [updateGarden]
  );

  const removeHarvest = useCallback(
    (gId: string, hId: string) => {
      const at = syncNow();
      updateGarden(gId, (g) => ({
        ...g,
        harvests: g.harvests.filter((h) => h.id !== hId),
        deleted: { ...normalizeTombstones(g.deleted), harvests: { ...g.deleted?.harvests, [hId]: at } },
      }));
    },
    [updateGarden]
  );

  const addSowing = useCallback(
    (gId: string, entry: Omit<SowingEntry, "id">) => {
      const full: SowingEntry = { ...entry, id: id(), updatedAt: syncNow() };
      updateGarden(gId, (g) => ({ ...g, sowings: [...(g.sowings ?? []), full] }));
    },
    [updateGarden]
  );

  const updateSowing = useCallback(
    (gId: string, sId: string, patch: Partial<SowingEntry>) => {
      const at = syncNow();
      updateGarden(gId, (g) => ({
        ...g,
        sowings: (g.sowings ?? []).map((s) => (s.id === sId ? { ...s, ...patch, updatedAt: at } : s)),
      }));
    },
    [updateGarden]
  );

  const removeSowing = useCallback(
    (gId: string, sId: string) => {
      const at = syncNow();
      updateGarden(gId, (g) => ({
        ...g,
        sowings: (g.sowings ?? []).filter((s) => s.id !== sId),
        deleted: { ...normalizeTombstones(g.deleted), sowings: { ...g.deleted?.sowings, [sId]: at } },
      }));
    },
    [updateGarden]
  );

  const addExpense = useCallback(
    (gId: string, entry: Omit<Expense, "id">) => {
      const full: Expense = { ...entry, id: id(), updatedAt: syncNow() };
      updateGarden(gId, (g) => ({ ...g, expenses: [...g.expenses, full] }));
    },
    [updateGarden]
  );

  const updateExpense = useCallback(
    (gId: string, eId: string, patch: Partial<Expense>) => {
      const at = syncNow();
      updateGarden(gId, (g) => ({
        ...g,
        expenses: g.expenses.map((e) => (e.id === eId ? { ...e, ...patch, updatedAt: at } : e)),
      }));
    },
    [updateGarden]
  );

  const removeExpense = useCallback(
    (gId: string, eId: string) => {
      const at = syncNow();
      updateGarden(gId, (g) => ({
        ...g,
        expenses: g.expenses.filter((e) => e.id !== eId),
        deleted: { ...normalizeTombstones(g.deleted), expenses: { ...g.deleted?.expenses, [eId]: at } },
      }));
    },
    [updateGarden]
  );

  const addIncome = useCallback(
    (gId: string, entry: Omit<Income, "id">) => {
      const full: Income = { ...entry, id: id(), updatedAt: syncNow() };
      updateGarden(gId, (g) => ({ ...g, incomes: [...(g.incomes ?? []), full] }));
    },
    [updateGarden]
  );

  const updateIncome = useCallback(
    (gId: string, iId: string, patch: Partial<Income>) => {
      const at = syncNow();
      updateGarden(gId, (g) => ({
        ...g,
        incomes: (g.incomes ?? []).map((i) => (i.id === iId ? { ...i, ...patch, updatedAt: at } : i)),
      }));
    },
    [updateGarden]
  );

  const removeIncome = useCallback(
    (gId: string, iId: string) => {
      const at = syncNow();
      updateGarden(gId, (g) => ({
        ...g,
        incomes: (g.incomes ?? []).filter((i) => i.id !== iId),
        deleted: { ...normalizeTombstones(g.deleted), incomes: { ...g.deleted?.incomes, [iId]: at } },
      }));
    },
    [updateGarden]
  );

  /** gewas dat met het gewas-gereedschap in bedden getekend wordt */
  const [activeCropId, setActiveCropId] = useState<string | null>(null);
  useEffect(() => {
    if (!activeCropId && data.cropCatalog.length > 0) {
      setActiveCropId(data.cropCatalog[0].id);
    }
  }, [activeCropId, data.cropCatalog]);

  const addShopping = useCallback(
    (gId: string, entry: Omit<ShoppingItem, "id" | "createdAt" | "done">) => {
      const at = syncNow();
      const full: ShoppingItem = { ...entry, id: id(), createdAt: at, done: false, updatedAt: at };
      updateGarden(gId, (g) => ({ ...g, shopping: [...(g.shopping ?? []), full] }));
    },
    [updateGarden]
  );

  const updateShopping = useCallback(
    (gId: string, itemId: string, patch: Partial<ShoppingItem>) => {
      const at = syncNow();
      updateGarden(gId, (g) => ({
        ...g,
        shopping: (g.shopping ?? []).map((s) => (s.id === itemId ? { ...s, ...patch, updatedAt: at } : s)),
      }));
    },
    [updateGarden]
  );

const removeShopping = useCallback(
    (gId: string, itemId: string) => {
      const at = syncNow();
      updateGarden(gId, (g) => ({
        ...g,
        shopping: (g.shopping ?? []).filter((s) => s.id !== itemId),
        deleted: { ...normalizeTombstones(g.deleted), shopping: { ...g.deleted?.shopping, [itemId]: at } },
      }));
    },
    [updateGarden],
  );

  const addTodo = useCallback(
    (gId: string, entry: Omit<TodoItem, "id" | "createdAt" | "done" | "createdBy">) => {
      const at = syncNow();
      const full: TodoItem = { ...entry, id: id(), createdAt: at, done: false, createdBy: user?.id, updatedAt: at };
      updateGarden(gId, (g) => ({ ...g, todos: [...(g.todos ?? []), full] }));
    },
    [updateGarden, user]
  );

  const updateTodo = useCallback(
    (gId: string, todoId: string, patch: Partial<TodoItem>) => {
      const at = syncNow();
      updateGarden(gId, (g) => ({
        ...g,
        todos: (g.todos ?? []).map((t) => (t.id === todoId ? { ...t, ...patch, updatedAt: at } : t)),
      }));
    },
    [updateGarden]
  );

  const removeTodo = useCallback(
    (gId: string, todoId: string) => {
      const at = syncNow();
      updateGarden(gId, (g) => ({
        ...g,
        todos: (g.todos ?? []).filter((t) => t.id !== todoId),
        deleted: { ...normalizeTombstones(g.deleted), todos: { ...g.deleted?.todos, [todoId]: at } },
      }));
    },
    [updateGarden]
  );

  /**
   * Afvinken op de boodschappenlijst boekt het product meteen als uitgave.
   * terugzetten haalt die uitgave er weer uit, zodat er geen dubbelingen
   * of weesuitgaven ontstaan.
   */
  const toggleShoppingDone = useCallback(
    (gId: string, item: ShoppingItem, done: boolean) => {
      if (done) {
        const amount = lineTotal(item);
        if (amount <= 0) return;
        addExpense(gId, {
          description: item.title,
          amount,
          date: new Date().toISOString().slice(0, 10),
          shoppingItemId: item.id,
          category: guessCategory(item.title),
        });
        return;
      }
      const garden = data.gardens.find((g) => g.id === gId);
      for (const e of garden?.expenses ?? []) {
        if (e.shoppingItemId === item.id) removeExpense(gId, e.id);
      }
    },
    [addExpense, data.gardens, removeExpense],
  );

  if (!booted) {
    if (user) {
      return (
        <GardenList
          gardens={data.gardens}
          user={user}
          userNames={userNames}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpen={setActiveId}
          onAdd={addGarden}
          onDelete={deleteGarden}
          onUnshare={unshareGarden}
          onGardenUpdated={onGardenUpdated}
          onLogout={logout}
          onOpenProfile={() => setProfileOpen(true)}
          loading
        />
      );
    }
    return (
      <div className="gl-boot" aria-label="Bezig met laden">
        <span className="gl-boot-blob" aria-hidden="true">
          <i className="fa-solid fa-seedling" />
        </span>
        <p>Even geduld, je tuintjes komen eraan…</p>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen theme={theme} onToggleTheme={toggleTheme} onAuthed={handleAuthed} />;
  }

  if (invite) {
    return (
      <InviteScreen
        gardenId={invite.gardenId}
        token={invite.token}
        onJoined={handleInviteJoined}
        onCancel={() => {
          setInvite(null);
          window.history.replaceState({}, "", "/");
        }}
      />
    );
  }

  if (profileOpen) {
    return (
      <ProfilePage
        user={user}
        theme={theme}
        onToggleTheme={toggleTheme}
        onBack={() => setProfileOpen(false)}
        onLogout={logout}
        onOpenProfile={() => setProfileOpen(true)}
        onProfileUpdated={handleProfileUpdated}
      />
    );
  }

  if (!garden) {
    return (
      <GardenList
        gardens={data.gardens}
        user={user}
        userNames={userNames}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpen={setActiveId}
        onAdd={addGarden}
        onDelete={deleteGarden}
        onUnshare={unshareGarden}
        onGardenUpdated={onGardenUpdated}
        onLogout={logout}
        onOpenProfile={() => setProfileOpen(true)}
        loading={listLoading}
      />
    );
  }

  return (
    <GardenEditor
      garden={garden}
      catalog={data.cropCatalog}
      theme={theme}
      onToggleTheme={toggleTheme}
      presence={presence}
      presenceMembers={presenceMembers}
      liveStatus={liveStatus}
      onReconnect={() => realtime.reconnect()}
      currentUserId={user.id}
      userNames={userNames}
      username={user.username}
      onLogout={logout}
      onOpenProfile={() => setProfileOpen(true)}
      onUnshareMember={(userId) => unshareGarden(garden.id, userId)}
      onGardenUpdated={onGardenUpdated}
      onDeleteGarden={() => deleteGarden(garden.id)}
      onToggleTheme={toggleTheme}
      onNameChange={(name) => updateGarden(garden.id, (g) => ({ ...g, name, updatedAt: syncNow() }))}
      onBack={() => setActiveId(null)}
      onAddFrame={(type, x, y, w, h) => addElementAt(garden.id, type, x, y, w, h)}
      onAddObject={(key, x, y, gaas) => addObject(garden.id, key, x, y, gaas)}
      onUpdateElement={(eId, patch) => updateElement(garden.id, eId, patch)}
      onRemoveElement={(eId) => removeElement(garden.id, eId)}
      onRemoveElements={(ids) => removeElements(garden.id, ids)}
      onApplyElements={(updates) => applyElements(garden.id, updates)}
      onDuplicateElements={(ids) => duplicateElements(garden.id, ids)}
      onUpdateCrop={(eId, iId, patch) => updateCrop(garden.id, eId, iId, patch)}
      onRemoveCrop={(eId, iId) => removeCrop(garden.id, eId, iId)}
      onDuplicateCrop={(eId, iId) => duplicateCrop(garden.id, eId, iId)}
      onAddCropToCatalog={addCropToCatalog}
      onUpdateCropInCatalog={updateCropInCatalog}
      onRemoveCropFromCatalog={removeCropFromCatalog}
      onAddHarvest={(entry) => addHarvest(garden.id, entry)}
      onUpdateHarvest={(hId, patch) => updateHarvest(garden.id, hId, patch)}
      onRemoveHarvest={(hId) => removeHarvest(garden.id, hId)}
      onAddSowing={(entry) => addSowing(garden.id, entry)}
      onUpdateSowing={(sId, patch) => updateSowing(garden.id, sId, patch)}
      onRemoveSowing={(sId) => removeSowing(garden.id, sId)}
      onAddExpense={(entry) => addExpense(garden.id, entry)}
      onUpdateExpense={(eId, patch) => updateExpense(garden.id, eId, patch)}
      onRemoveExpense={(eId) => removeExpense(garden.id, eId)}
      onAddIncome={(entry) => addIncome(garden.id, entry)}
      onUpdateIncome={(iId, patch) => updateIncome(garden.id, iId, patch)}
      onRemoveIncome={(iId) => removeIncome(garden.id, iId)}
      onAddCropAt={(eId, wx, wy, w, h) => {
        const bed = garden.elements.find((e) => e.id === eId);
        if (!bed) return undefined;
        const cropId = activeCropId ?? data.cropCatalog[0]?.id;
        if (!cropId) return undefined;
        return addCropAt(garden.id, eId, cropId, {
          x: (wx - bed.x) / PX_PER_M,
          y: (wy - bed.y) / PX_PER_M,
          w: w / PX_PER_M,
          h: h / PX_PER_M,
        });
      }}
      activeCropId={activeCropId}
      onSelectActiveCrop={setActiveCropId}
      onAddShopping={(entry) => addShopping(garden.id, entry)}
      onUpdateShopping={(itemId, patch) => updateShopping(garden.id, itemId, patch)}
      onRemoveShopping={(itemId) => removeShopping(garden.id, itemId)}
      onAddTodo={(entry) => addTodo(garden.id, entry)}
      onUpdateTodo={(todoId, patch) => updateTodo(garden.id, todoId, patch)}
      onRemoveTodo={(todoId) => removeTodo(garden.id, todoId)}
      onToggleShoppingDone={(item, done) => toggleShoppingDone(garden.id, item, done)}
      onUndo={undo}
      onRedo={redo}
      onLiveMove={(updates) => sendLiveMove(garden.id, updates)}
      onLivePreview={(preview) => sendLivePreview(garden.id, preview)}
      livePreview={livePreview?.gardenId === garden.id ? livePreview.preview : null}
      onLiveCursor={sendLiveCursor}
      liveCursors={liveCursorsRef}
    />
  );
}

const BED_COLOR = "#a17d5f";
const PATH_COLOR = "#d8cfc4";
/** omlijning van een veld: zichtbaar maar rustig, de vulling tekent het canvas zelf licht */
const VELD_COLOR = "#7d8aa1";
