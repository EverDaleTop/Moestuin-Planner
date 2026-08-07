import { useMemo, useState } from "react";
import type { Crop, GardenElement } from "./types";
import { fmtM } from "./storage";

interface Props {
  element: GardenElement | null;
  catalog: Crop[];
  onUpdate: (patch: Partial<GardenElement>) => void;
  onRemove: () => void;
  onAddCrop: (cropId: string) => void;
  onUpdateCrop: (
    iId: string,
    patch: Partial<GardenElement["crops"][number]>
  ) => void;
  onRemoveCrop: (iId: string) => void;
  onAddCropToCatalog: (crop: Omit<Crop, "id">) => void;
}

function NumField({
  label,
  value,
  onChange,
  min = 0,
  step = 0.1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="inp-field">
      <span>{label}</span>
      <div className="inp-num">
        <input
          type="number"
          value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
          min={min}
          step={step}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
        {suffix && <span className="inp-suffix">{suffix}</span>}
      </div>
    </label>
  );
}

export function Inspector({
  element,
  catalog,
  onUpdate,
  onRemove,
  onAddCrop,
  onUpdateCrop,
  onRemoveCrop,
  onAddCropToCatalog,
}: Props) {
  const [newCropId, setNewCropId] = useState("");
  const [showCatalogForm, setShowCatalogForm] = useState(false);

  const [cfName, setCfName] = useState("");
  const [cfRow, setCfRow] = useState(0.3);
  const [cfPlant, setCfPlant] = useState(0.2);
  const [cfColor, setCfColor] = useState("#7c9a6d");

  const cropById = useMemo(() => {
    const m = new Map<string, Crop>();
    catalog.forEach((c) => m.set(c.id, c));
    return m;
  }, [catalog]);

  const catalogOptions = useMemo(
    () => catalog.filter((c) => !element || !element.crops.some((x) => x.cropId === c.id)),
    [catalog, element]
  );

  const addCatalogCrop = () => {
    if (!cfName.trim()) return;
    onAddCropToCatalog({
      name: cfName.trim(),
      rowSpacing: cfRow,
      plantSpacing: cfPlant,
      color: cfColor,
    });
    setCfName("");
    setShowCatalogForm(false);
  };

  if (!element) {
    return (
      <aside className="insp insp-empty">
        <h3>Niks geselecteerd</h3>
        <p>
          Klik op een bed of pad op de tekening om het te bewerken, of voeg er
          hierboven een toe.
        </p>
      </aside>
    );
  }

  return (
    <aside className="insp">
      <h3>
        {element.type === "bed" ? "Bed" : "Pad"} · {fmtM(element.widthM)} ×{" "}
        {fmtM(element.heightM)}
      </h3>

      <label className="inp-field">
        <span>Naam</span>
        <input
          value={element.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
      </label>

      <div className="inp-row">
        <NumField
          label="Breedte (m)"
          value={element.widthM}
          step={0.1}
          suffix="m"
          onChange={(v) => onUpdate({ widthM: v })}
        />
        <NumField
          label="Lengte (m)"
          value={element.heightM}
          step={0.1}
          suffix="m"
          onChange={(v) => onUpdate({ heightM: v })}
        />
      </div>

      <label className="inp-field inp-color">
        <span>Kleur</span>
        <input
          type="color"
          value={element.color}
          onChange={(e) => onUpdate({ color: e.target.value })}
        />
      </label>

      {element.type === "bed" && (
        <section className="insp-crops">
          <h4>Gewassen</h4>

          {element.crops.length === 0 && (
            <p className="insp-hint">Nog geen gewassen in dit bed.</p>
          )}

          <ul className="crop-list">
            {element.crops.map((c) => {
              const crop = cropById.get(c.cropId);
              const perRow = Math.max(
                1,
                Math.floor(
                  element.widthM / (c.plantSpacing ?? crop?.plantSpacing ?? 0.2)
                )
              );
              const total = c.rows * perRow;
              return (
                <li key={c.instanceId} className="crop-item">
                  <span
                    className="crop-dot"
                    style={{ background: crop?.color ?? "#999" }}
                  />
                  <div className="crop-info">
                    <div className="crop-name">{crop?.name ?? "Onbekend"}</div>
                    <div className="crop-controls">
                      <NumField
                        label="Rijen"
                        value={c.rows}
                        step={1}
                        onChange={(v) =>
                          onUpdateCrop(c.instanceId, {
                            rows: Math.max(1, Math.round(v)),
                          })
                        }
                      />
                      <NumField
                        label="Tussenr. (m)"
                        value={c.rowSpacing ?? 0}
                        step={0.05}
                        suffix="m"
                        onChange={(v) =>
                          onUpdateCrop(c.instanceId, { rowSpacing: v })
                        }
                      />
                      <span className="crop-plants" title={`± ${total} planten`}>
                        ±{total}
                      </span>
                    </div>
                  </div>
                  <button
                    className="crop-remove"
                    title="Verwijder gewas"
                    onClick={() => onRemoveCrop(c.instanceId)}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="crop-add">
            <select
              value={newCropId}
              onChange={(e) => setNewCropId(e.target.value)}
              aria-label="Kies gewas"
            >
              <option value="">Kies een gewas…</option>
              {catalogOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              disabled={!newCropId}
              onClick={() => {
                onAddCrop(newCropId);
                setNewCropId("");
              }}
            >
              Toevoegen
            </button>
          </div>
        </section>
      )}

      <button className="btn-danger btn-block" onClick={onRemove}>
        {element.type === "bed" ? "Bed" : "Pad"} verwijderen
      </button>

      <section className="catalog">
        <h4>Beheer gewassen</h4>
        <button
          className="btn-ghost"
          onClick={() => setShowCatalogForm((s) => !s)}
        >
          {showCatalogForm ? "Sluiten" : "+ Nieuwe groente toevoegen"}
        </button>
        {showCatalogForm && (
          <div className="catalog-form">
            <label className="inp-field">
              <span>Naam</span>
              <input
                value={cfName}
                onChange={(e) => setCfName(e.target.value)}
              />
            </label>
            <div className="inp-row">
              <NumField label="Rijafstand (m)" value={cfRow} onChange={setCfRow} suffix="m" />
              <NumField label="Plantafstand (m)" value={cfPlant} onChange={setCfPlant} suffix="m" />
            </div>
            <label className="inp-field inp-color">
              <span>Kleur</span>
              <input
                type="color"
                value={cfColor}
                onChange={(e) => setCfColor(e.target.value)}
              />
            </label>
            <button
              disabled={!cfName.trim()}
              onClick={addCatalogCrop}
              className="btn-block"
            >
              Opslaan
            </button>
          </div>
        )}
        <ul className="catalog-list">
          {catalog.map((c) => (
            <li key={c.id}>
              <span className="crop-dot" style={{ background: c.color }} />
              <span className="catalog-name">{c.name}</span>
              <span className="catalog-meta">
                {c.rowSpacing.toFixed(2)} / {c.plantSpacing.toFixed(2)} m
              </span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}