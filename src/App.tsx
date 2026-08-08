import { useEffect, useState, useCallback, useRef } from "react";
import type { AppData, Crop, Garden, GardenElement, CropAssignment, HarvestEntry, Expense, GardenObjectKey, GaasData, User } from "./types";
import { id } from "./storage";
import { api, getToken, setToken, onUnauthorized, type MeResponse } from "./api";
import { realtime, type LiveUpdate } from "./realtime";
import { GardenList } from "./GardenList";
import { GardenEditor } from "./GardenEditor";
import { PlantDatabase } from "./PlantDatabase";
import { AuthScreen } from "./AuthScreen";
import { InviteScreen } from "./InviteScreen";
import { useTheme } from "./useTheme";
import { objectDef } from "./gardenObjects";
import "./App.css";

interface InviteTarget {
  gardenId: string;
  token: string;
}

function parseInvite(): InviteTarget | null {
  const m = /^\/invite\/([^/]+)\/([^/]+)\/?$/.exec(window.location.pathname);
  return m ? { gardenId: m[1], token: m[2] } : null;
}

export default function App() {
  const [booted, setBooted] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<AppData>({ gardens: [], cropCatalog: [] });
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [screen, setScreen] = useState<"gardens" | "plants">("gardens");
  const [presence, setPresence] = useState(0);
  const [invite, setInvite] = useState<InviteTarget | null>(() => parseInvite());
  const [theme, toggleTheme] = useTheme();

  const undoStack = useRef<AppData[]>([]);
  const redoStack = useRef<AppData[]>([]);

  // Last state pushed to the server per garden, so the sync effect below can
  // tell local edits (push) apart from remote changes (don't echo back).
  const lastSentRef = useRef<Map<string, string>>(new Map());
  const lastSentCatalogRef = useRef<string>("");
  const lastMoveRef = useRef(0);

  // Every data mutation goes through `mutate`, which snapshots the previous
  // state onto the undo stack (and clears redo, since the history forks).
  const mutate = useCallback((updater: (d: AppData) => AppData) => {
    setData((prev) => {
      undoStack.current.push(prev);
      if (undoStack.current.length > 100) undoStack.current.shift();
      redoStack.current = [];
      return updater(prev);
    });
  }, []);

  const undo = useCallback(() => {
    setData((cur) => {
      const prev = undoStack.current.pop();
      if (!prev) return cur;
      redoStack.current.push(cur);
      return prev;
    });
  }, []);

  const redo = useCallback(() => {
    setData((cur) => {
      const next = redoStack.current.pop();
      if (!next) return cur;
      undoStack.current.push(cur);
      return next;
    });
  }, []);

  // ----- authentication / boot -----
  const loadList = useCallback(async () => {
    try {
      const res: MeResponse = await api.me();
      setUserNames(res.userNames);
      setData({ gardens: res.gardens, cropCatalog: res.cropCatalog });
      lastSentCatalogRef.current = JSON.stringify(res.cropCatalog);
      const map = new Map<string, string>();
      for (const g of res.gardens) map.set(g.id, JSON.stringify(g));
      lastSentRef.current = map;
    } catch {
      // token was cleared by the api layer
    }
  }, []);

  useEffect(() => {
    const off = onUnauthorized(() => {
      setUser(null);
      realtime.disconnect();
      setData({ gardens: [], cropCatalog: [] });
    });
    if (!getToken()) {
      setBooted(true);
      return off;
    }
    void api
      .me()
      .then((res) => {
        setUser(res.user);
        setUserNames(res.userNames);
        setData({ gardens: res.gardens, cropCatalog: res.cropCatalog });
        lastSentCatalogRef.current = JSON.stringify(res.cropCatalog);
        const map = new Map<string, string>();
        for (const g of res.gardens) map.set(g.id, JSON.stringify(g));
        lastSentRef.current = map;
      })
      .catch(() => setUser(null))
      .finally(() => setBooted(true));
    return off;
  }, []);

  const handleAuthed = useCallback((u: User, token: string) => {
    setToken(token);
    setUser(u);
    setData({ gardens: [], cropCatalog: [] });
    void loadList();
  }, [loadList]);

  const logout = useCallback(async () => {
    await api.logout();
    realtime.disconnect();
    setUser(null);
    setActiveId(null);
    setData({ gardens: [], cropCatalog: [] });
  }, []);

  // ----- realtime (WebSocket) -----
  useEffect(() => {
    if (!user) return;
    realtime.connect();
    const off = realtime.onMessage((msg) => {
      if (msg.type === "garden") {
        lastSentRef.current.set(msg.garden.id, JSON.stringify(msg.garden));
        setData((prev) => {
          const exists = prev.gardens.some((g) => g.id === msg.garden.id);
          return {
            ...prev,
            gardens: exists
              ? prev.gardens.map((g) => (g.id === msg.garden.id ? msg.garden : g))
              : [...prev.gardens, msg.garden],
          };
        });
      } else if (msg.type === "move") {
        const updates = msg.updates as LiveUpdate[];
        setData((prev) => {
          const g = prev.gardens.find((x) => x.id === msg.gardenId);
          if (!g) return prev;
          const byId = new Map(updates.map((u) => [u.id, u]));
          const nextG: Garden = {
            ...g,
            elements: g.elements.map((e) => {
              const u = byId.get(e.id);
              if (!u) return e;
              const next: GardenElement = { ...e };
              if (u.x !== undefined) next.x = u.x;
              if (u.y !== undefined) next.y = u.y;
              if (u.widthM !== undefined) next.widthM = u.widthM;
              if (u.heightM !== undefined) next.heightM = u.heightM;
              return next;
            }),
          };
          // transient drag positions: don't echo them back to the server
          lastSentRef.current.set(msg.gardenId, JSON.stringify(nextG));
          return { ...prev, gardens: prev.gardens.map((x) => (x.id === msg.gardenId ? nextG : x)) };
        });
      } else if (msg.type === "presence") {
        setPresence(msg.count);
      }
    });
    return () => {
      off();
      realtime.disconnect();
    };
  }, [user]);

  useEffect(() => {
    realtime.setGarden(activeId);
  }, [activeId]);

  // Re-fetch the list when returning to it, so newly shared gardens (and name
  // changes from others) appear.
  useEffect(() => {
    if (!user || activeId !== null) return;
    void loadList();
  }, [user, activeId, loadList]);

  // ----- sync local edits to the server (push only what changed) -----
  useEffect(() => {
    for (const g of data.gardens) {
      const key = JSON.stringify(g);
      if (lastSentRef.current.get(g.id) === key) continue;
      lastSentRef.current.set(g.id, key);
      api.putGarden(g).catch(() => {});
    }
    const catKey = JSON.stringify(data.cropCatalog);
    if (lastSentCatalogRef.current !== catKey) {
      lastSentCatalogRef.current = catKey;
      api.putCatalog(data.cropCatalog).catch(() => {});
    }
  }, [data]);

  const sendLiveMove = useCallback((gId: string, updates: LiveUpdate[]) => {
    const now = Date.now();
    if (now - lastMoveRef.current < 60) return;
    lastMoveRef.current = now;
    realtime.sendMove(gId, updates);
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
      lastSentRef.current.set(g.id, JSON.stringify(g));
      setData((prev) => ({ ...prev, gardens: [...prev.gardens, g] }));
      setActiveId(g.id);
    } catch {
      // keep UI quiet; the list refresh picks up server state
    }
  }, []);

  const deleteGarden = useCallback((gId: string) => {
    api.deleteGarden(gId).catch(() => {});
    mutate((d) => ({ ...d, gardens: d.gardens.filter((g) => g.id !== gId) }));
    setActiveId((a) => (a === gId ? null : a));
  }, [mutate]);

  const unshareGarden = useCallback(async (gardenId: string, userId: string) => {
    try {
      const g = await api.unshare(gardenId, userId);
      lastSentRef.current.set(g.id, JSON.stringify(g));
      setData((prev) => ({
        ...prev,
        gardens: prev.gardens.map((x) => (x.id === g.id ? g : x)),
      }));
    } catch {
      // ignore
    }
  }, []);

  /** Replace a garden in the local state after a server-side change. */
  const onGardenUpdated = useCallback((g: Garden) => {
    lastSentRef.current.set(g.id, JSON.stringify(g));
    setData((prev) => ({
      ...prev,
      gardens: prev.gardens.map((x) => (x.id === g.id ? g : x)),
    }));
  }, []);

  /** Join via invite link, then open the garden and clean the URL. */
  const handleInviteJoined = useCallback(
    (g: Garden) => {
      setInvite(null);
      window.history.replaceState({}, "", "/");
      lastSentRef.current.set(g.id, JSON.stringify(g));
      setData((prev) => {
        const exists = prev.gardens.some((x) => x.id === g.id);
        return {
          ...prev,
          gardens: exists ? prev.gardens.map((x) => (x.id === g.id ? g : x)) : [...prev.gardens, g],
        };
      });
      setActiveId(g.id);
    },
    []
  );

  const addElementAt = useCallback(
    (gId: string, type: "bed" | "path", x: number, y: number, widthM: number, heightM: number) => {
      const count = data.gardens.find((g) => g.id === gId)?.elements.filter(
        (e) => e.type === type
      ).length ?? 0;
      const el: GardenElement = {
        id: id(),
        type,
        label: type === "bed" ? `Bed ${count + 1}` : `Pad ${count + 1}`,
        x,
        y,
        widthM: Math.max(0.1, widthM),
        heightM: Math.max(0.1, heightM),
        color: type === "bed" ? BED_COLOR : PATH_COLOR,
        crops: [],
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
              if (!c.area) return c;
              return {
                ...c,
                area: {
                  x: c.area.x * (nw / ow),
                  y: c.area.y * (nh / oh),
                  w: c.area.w * (nw / ow),
                  h: c.area.h * (nh / oh),
                },
              };
            });
          }
          return { ...e, ...next };
        }),
      }));
    },
    [updateGarden]
  );

  const removeElement = useCallback(
    (gId: string, eId: string) => {
      updateGarden(gId, (g) => ({
        ...g,
        elements: g.elements.filter((e) => e.id !== eId),
      }));
    },
    [updateGarden]
  );

  const removeElements = useCallback(
    (gId: string, ids: string[]) => {
      const set = new Set(ids);
      mutate((d) => ({
        ...d,
        gardens: d.gardens.map((g) =>
          g.id === gId ? { ...g, elements: g.elements.filter((e) => !set.has(e.id)) } : g
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
              if (u.crops !== undefined) next.crops = u.crops;
              if (u.gaas !== undefined) next.gaas = u.gaas;
              return { ...e, ...next };
            }),
          };
        }),
      }));
    },
    [mutate]
  );

  const duplicateElements = useCallback(
    (gId: string, ids: string[]) => {
      const srcs =
        data.gardens
          .find((g) => g.id === gId)
          ?.elements.filter((e) => ids.includes(e.id)) ?? [];
      const copies: GardenElement[] = srcs.map((src) => ({
        ...src,
        id: id(),
        x: src.x + 30,
        y: src.y + 30,
        crops: src.crops.map((c) => ({ ...c, instanceId: id() })),
      }));
      updateGarden(gId, (g) => ({
        ...g,
        elements: [...g.elements, ...copies],
      }));
      return copies.map((c) => c.id);
    },
    [data.gardens, updateGarden]
  );

  const addCrop = useCallback(
    (gId: string, eId: string, cropId: string) => {
      const crop = data.cropCatalog.find((c) => c.id === cropId);
      if (!crop) return;
      const bed = data.gardens
        .find((g) => g.id === gId)
        ?.elements.find((e) => e.id === eId);
      const bedW = bed?.widthM ?? 1;
      const bedH = bed?.heightM ?? 1;
      const count = bed?.crops.length ?? 0;
      const bandH = Math.max(0.1, bedH / (count + 1));
      const area = {
        x: 0,
        y: Math.max(0, Math.min(count * bandH, bedH - bandH)),
        w: bedW,
        h: bandH,
      };
      const assignment: CropAssignment = {
        instanceId: id(),
        cropId,
        rows: 1,
        rowSpacing: crop.rowSpacing,
        plantSpacing: crop.plantSpacing,
        area,
      };
      updateGarden(gId, (g) => ({
        ...g,
        elements: g.elements.map((e) =>
          e.id === eId ? { ...e, crops: [...e.crops, assignment] } : e
        ),
      }));
    },
    [data.cropCatalog, data.gardens, updateGarden]
  );

  const updateCrop = useCallback(
    (gId: string, eId: string, instanceId: string, patch: Partial<CropAssignment>) => {
      updateGarden(gId, (g) => ({
        ...g,
        elements: g.elements.map((e) =>
          e.id === eId
            ? {
                ...e,
                crops: e.crops.map((c) =>
                  c.instanceId === instanceId ? { ...c, ...patch } : c
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
      updateGarden(gId, (g) => ({
        ...g,
        elements: g.elements.map((e) =>
          e.id === eId
            ? { ...e, crops: e.crops.filter((c) => c.instanceId !== instanceId) }
            : e
        ),
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
    const full: Crop = { ...crop, id: id() };
    mutate((d) => ({ ...d, cropCatalog: [...d.cropCatalog, full] }));
  }, [mutate]);

  const updateCropInCatalog = useCallback(
    (cropId: string, patch: Partial<Crop>) => {
      mutate((d) => ({
        ...d,
        cropCatalog: d.cropCatalog.map((c) =>
          c.id === cropId ? { ...c, ...patch } : c
        ),
      }));
    },
    [mutate]
  );

  const removeCropFromCatalog = useCallback(
    (cropId: string) => {
      mutate((d) => ({
        ...d,
        cropCatalog: d.cropCatalog.filter((c) => c.id !== cropId),
      }));
    },
    [mutate]
  );

  const addHarvest = useCallback(
    (gId: string, entry: Omit<HarvestEntry, "id">) => {
      const full: HarvestEntry = { ...entry, id: id() };
      updateGarden(gId, (g) => ({ ...g, harvests: [...g.harvests, full] }));
    },
    [updateGarden]
  );

  const updateHarvest = useCallback(
    (gId: string, hId: string, patch: Partial<HarvestEntry>) => {
      updateGarden(gId, (g) => ({
        ...g,
        harvests: g.harvests.map((h) => (h.id === hId ? { ...h, ...patch } : h)),
      }));
    },
    [updateGarden]
  );

  const removeHarvest = useCallback(
    (gId: string, hId: string) => {
      updateGarden(gId, (g) => ({
        ...g,
        harvests: g.harvests.filter((h) => h.id !== hId),
      }));
    },
    [updateGarden]
  );

  const addExpense = useCallback(
    (gId: string, entry: Omit<Expense, "id">) => {
      const full: Expense = { ...entry, id: id() };
      updateGarden(gId, (g) => ({ ...g, expenses: [...g.expenses, full] }));
    },
    [updateGarden]
  );

  const updateExpense = useCallback(
    (gId: string, eId: string, patch: Partial<Expense>) => {
      updateGarden(gId, (g) => ({
        ...g,
        expenses: g.expenses.map((e) => (e.id === eId ? { ...e, ...patch } : e)),
      }));
    },
    [updateGarden]
  );

  const removeExpense = useCallback(
    (gId: string, eId: string) => {
      updateGarden(gId, (g) => ({
        ...g,
        expenses: g.expenses.filter((e) => e.id !== eId),
      }));
    },
    [updateGarden]
  );

  if (!booted) {
    return <div className="auth-wrap"><div className="auth-card">Bezig met laden…</div></div>;
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

  if (!garden) {
    if (screen === "plants") {
      return (
        <PlantDatabase
          catalog={data.cropCatalog}
          gardenCount={data.gardens.length}
          theme={theme}
          onToggleTheme={toggleTheme}
          onBack={() => setScreen("gardens")}
          onAdd={addCropToCatalog}
          onUpdate={updateCropInCatalog}
          onDelete={removeCropFromCatalog}
        />
      );
    }
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
        onPlants={() => setScreen("plants")}
      />
    );
  }

  return (
    <GardenEditor
      garden={garden}
      catalog={data.cropCatalog}
      theme={theme}
      presence={presence}
      onToggleTheme={toggleTheme}
      onNameChange={(name) => updateGarden(garden.id, (g) => ({ ...g, name }))}
      onBack={() => setActiveId(null)}
      onAddFrame={(type, x, y, w, h) => addElementAt(garden.id, type, x, y, w, h)}
      onAddObject={(key, x, y, gaas) => addObject(garden.id, key, x, y, gaas)}
      onUpdateElement={(eId, patch) => updateElement(garden.id, eId, patch)}
      onRemoveElement={(eId) => removeElement(garden.id, eId)}
      onRemoveElements={(ids) => removeElements(garden.id, ids)}
      onApplyElements={(updates) => applyElements(garden.id, updates)}
      onDuplicateElements={(ids) => duplicateElements(garden.id, ids)}
      onAddCrop={(eId, cropId) => addCrop(garden.id, eId, cropId)}
      onUpdateCrop={(eId, iId, patch) => updateCrop(garden.id, eId, iId, patch)}
      onRemoveCrop={(eId, iId) => removeCrop(garden.id, eId, iId)}
      onDuplicateCrop={(eId, iId) => duplicateCrop(garden.id, eId, iId)}
      onAddCropToCatalog={addCropToCatalog}
      onUpdateCropInCatalog={updateCropInCatalog}
      onRemoveCropFromCatalog={removeCropFromCatalog}
      onAddHarvest={(entry) => addHarvest(garden.id, entry)}
      onUpdateHarvest={(hId, patch) => updateHarvest(garden.id, hId, patch)}
      onRemoveHarvest={(hId) => removeHarvest(garden.id, hId)}
      onAddExpense={(entry) => addExpense(garden.id, entry)}
      onUpdateExpense={(eId, patch) => updateExpense(garden.id, eId, patch)}
      onRemoveExpense={(eId) => removeExpense(garden.id, eId)}
      onUndo={undo}
      onRedo={redo}
      onLiveMove={(updates) => sendLiveMove(garden.id, updates)}
    />
  );
}

const BED_COLOR = "#a17d5f";
const PATH_COLOR = "#d8cfc4";
