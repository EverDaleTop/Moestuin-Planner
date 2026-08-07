import { useEffect, useState, useCallback, useRef } from "react";
import type { AppData, Crop, Garden, GardenElement, CropAssignment } from "./types";
import { loadData, saveData, id } from "./storage";
import { GardenList } from "./GardenList";
import { GardenEditor } from "./GardenEditor";
import { useTheme } from "./useTheme";
import "./App.css";

export default function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [activeId, setActiveId] = useState<string | null>(null);
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

  const updateElement = useCallback(
    (gId: string, eId: string, patch: Partial<GardenElement>) => {
      updateGarden(gId, (g) => ({
        ...g,
        elements: g.elements.map((e) => (e.id === eId ? { ...e, ...patch } : e)),
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
    (gId: string, updates: { id: string; x?: number; y?: number; widthM?: number; heightM?: number }[]) => {
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
      const assignment: CropAssignment = {
        instanceId: id(),
        cropId,
        rows: 1,
        rowSpacing: crop.rowSpacing,
        plantSpacing: crop.plantSpacing,
      };
      updateGarden(gId, (g) => ({
        ...g,
        elements: g.elements.map((e) =>
          e.id === eId ? { ...e, crops: [...e.crops, assignment] } : e
        ),
      }));
    },
    [data.cropCatalog, updateGarden]
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

  const addCropToCatalog = useCallback((crop: Omit<Crop, "id">) => {
    const full: Crop = { ...crop, id: id() };
    mutate((d) => ({ ...d, cropCatalog: [...d.cropCatalog, full] }));
  }, [mutate]);

  const catalogByCrop = data.cropCatalog;

  if (!garden) {
    return (
      <GardenList
        gardens={data.gardens}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpen={setActiveId}
        onAdd={addGarden}
        onDelete={deleteGarden}
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
      onUpdateElement={(eId, patch) => updateElement(garden.id, eId, patch)}
      onRemoveElement={(eId) => removeElement(garden.id, eId)}
      onRemoveElements={(ids) => removeElements(garden.id, ids)}
      onApplyElements={(updates) => applyElements(garden.id, updates)}
      onDuplicateElements={(ids) => duplicateElements(garden.id, ids)}
      onAddCrop={(eId, cropId) => addCrop(garden.id, eId, cropId)}
      onUpdateCrop={(eId, iId, patch) => updateCrop(garden.id, eId, iId, patch)}
      onRemoveCrop={(eId, iId) => removeCrop(garden.id, eId, iId)}
      onAddCropToCatalog={addCropToCatalog}
      onUndo={undo}
      onRedo={redo}
    />
  );
}

const BED_COLOR = "#a17d5f";
const PATH_COLOR = "#d8cfc4";