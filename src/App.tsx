import { useEffect, useState, useCallback, useRef } from "react";
import type { AppData, Crop, Garden, GardenElement, CropAssignment, HarvestEntry, Expense, GardenObjectKey, GaasData } from "./types";
import { loadData, saveData, id } from "./storage";
import { GardenList } from "./GardenList";
import { GardenEditor } from "./GardenEditor";
import { PlantDatabase } from "./PlantDatabase";
import { useTheme } from "./useTheme";
import { objectDef } from "./gardenObjects";
import "./App.css";

export default function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [screen, setScreen] = useState<"gardens" | "plants">("gardens");
  const [theme, toggleTheme] = useTheme();

  const undoStack = useRef<AppData[]>([]);
  const redoStack = useRef<AppData[]>([]);

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

  useEffect(() => {
    saveData(data);
  }, [data]);

  const garden = data.gardens.find((g) => g.id === activeId) ?? null;

  const updateGarden = useCallback((id: string, updater: (g: Garden) => Garden) => {
    mutate((d) => ({
      ...d,
      gardens: d.gardens.map((g) => (g.id === id ? updater(g) : g)),
    }));
  }, [mutate]);

  const addGarden = useCallback((name: string) => {
    const g: Garden = {
      id: id(),
      name,
      createdAt: Date.now(),
      elements: [],
      harvests: [],
      expenses: [],
    };
    mutate((d) => ({ ...d, gardens: [...d.gardens, g] }));
    setActiveId(g.id);
  }, [mutate]);

  const deleteGarden = useCallback((gId: string) => {
    mutate((d) => ({ ...d, gardens: d.gardens.filter((g) => g.id !== gId) }));
    setActiveId((a) => (a === gId ? null : a));
  }, [mutate]);

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

  // Add a special garden object (bench, fence, …) as a sibling of beds/paths.
  // `x`/`y` are the element's top-left corner in canvas px. Objects are named
  // without a number; the user can rename them in the inspector. A "gaas" is a
  // line element drawn with the gaas tool and carries its two anchors via `gaas`.
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
      // round objects (poles, tuns) are sized by their radius: a 2×radius footprint
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
          // when a bed's size changes, its plants scale proportionally
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

  // Remove several elements in one undoable step (e.g. deleting a selection).
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

  // Apply a batch of element size/position changes in ONE undoable step, so a
  // multi-element move or resize collapses to a single undo entry.
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

  const catalogByCrop = data.cropCatalog;

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
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpen={setActiveId}
        onAdd={addGarden}
        onDelete={deleteGarden}
        onPlants={() => setScreen("plants")}
      />
    );
  }

  return (
    <GardenEditor
      garden={garden}
      catalog={catalogByCrop}
      theme={theme}
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
    />
  );
}

const BED_COLOR = "#a17d5f";
const PATH_COLOR = "#d8cfc4";