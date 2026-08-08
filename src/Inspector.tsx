import { useMemo, useState } from "react";
import type { Crop, CropAssignment, GardenElement } from "./types";
import { fmtM } from "./storage";
import { cropIconClass } from "./cropIcons";
import { objectDef } from "./gardenObjects";

interface Props {
  element: GardenElement | null;
  catalog: Crop[];
  /** planted crop currently selected on the canvas (only when a bed holds it) */
  crop: CropAssignment | null;
  /** catalog entry for the selected crop */
  cropInfo: Crop | null;
  onUpdate: (patch: Partial<GardenElement>) => void;
  onRemove: () => void;
  onAddCrop: (cropId: string) => void;
  onUpdateCrop: (
    iId: string,
    patch: Partial<CropAssignment>
  ) => void;
  onRemoveCrop: (iId: string) => void;
  onDuplicateCrop: (iId: string) => void;
  onDeselectCrop: () => void;
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

/** One planted crop, shown both inside the "Gewassen beheren" popup and as the
 *  single-crop panel in the inspector. */
function CropRow({
  a,
  crop,
  bed,
  onUpdateCrop,
  onRemoveCrop,
}: {
  a: CropAssignment;
  crop: Crop | undefined;
  bed: GardenElement;
  onUpdateCrop: (iId: string, patch: Partial<CropAssignment>) => void;
  onRemoveCrop: (iId: string) => void;
}) {
  const areaW = a.area ? a.area.w : bed.widthM;
  const areaH = a.area ? a.area.h : bed.heightM;
  const rowSpacing = a.rowSpacing ?? crop?.rowSpacing ?? 0.3;
  const plantSpacing = a.plantSpacing ?? crop?.plantSpacing ?? 0.2;
  const effCols = a.cols ?? Math.max(1, Math.round(areaW / plantSpacing));
  const total = a.rows * effCols;

  return (
    <div className="crop-row">
      <div className="crop-row-actions">
        <button
          type="button"
          className="crop-row-remove"
          title="Gewas uit dit bed verwijderen"
          onClick={() => onRemoveCrop(a.instanceId)}
        >
          ✕
        </button>
      </div>
      <div className="crop-row-main">
        <div className="crop-row-title">
          <i
            className={`crop-icon ${cropIconClass(crop?.icon)}`}
            style={{ color: crop?.color ?? "#999" }}
          />
          <span>{crop?.name ?? a.cropId}</span>
        </div>
        <div className="crop-row-info">
          {fmtM(areaW)} × {fmtM(areaH)} · rij{" "}
          {Math.round(rowSpacing * 100) / 100} m · plant{" "}
          {Math.round(plantSpacing * 100) / 100} m · ±{total} planten
        </div>
        <div className="crop-row-controls">
          <Nudge
            label="Rijen"
            value={a.rows}
            onChange={(v) =>
              onUpdateCrop(a.instanceId, {
                rows: Math.max(1, Math.round(v)),
              })
            }
          />
          <Nudge
            label="Kolommen"
            value={effCols}
            onChange={(v) =>
              onUpdateCrop(a.instanceId, {
                cols: Math.max(1, Math.round(v)),
              })
            }
          />
          <Nudge
            label="Opruim (m)"
            value={a.padding ?? 0.1}
            min={0}
            step={0.05}
            suffix=" m"
            onChange={(v) =>
              onUpdateCrop(a.instanceId, { padding: v })
            }
          />
          <Nudge
            label="Rijafst. (m)"
            value={rowSpacing}
            step={0.05}
            suffix=" m"
            onChange={(v) =>
              onUpdateCrop(a.instanceId, { rowSpacing: v })
            }
          />
          <Nudge
            label="Plantafst. (m)"
            value={plantSpacing}
            step={0.05}
            suffix=" m"
            onChange={(v) =>
              onUpdateCrop(a.instanceId, { plantSpacing: v })
            }
          />
        </div>
      </div>
    </div>
  );
}

export function Inspector({
  element,
  catalog,
  crop,
  cropInfo,
  onUpdate,
  onRemove,
  onAddCrop,
  onUpdateCrop,
  onRemoveCrop,
  onDuplicateCrop,
  onDeselectCrop,
}: Props) {
  const [cropsOpen, setCropsOpen] = useState(false);

  const cropById = useMemo(() => {
    const m = new Map<string, Crop>();
    catalog.forEach((c) => m.set(c.id, c));
    return m;
  }, [catalog]);

  if (!element) {
    return (
      <aside className="insp insp-empty">
        <h3>Niks geselecteerd</h3>
        <p>
          Klik op een bed, pad of voorwerp op de tekening om het te bewerken, of
          voeg er hierboven een toe.
        </p>
      </aside>
    );
  }

  const elementKind =
    element.type === "bed"
      ? "Bed"
      : element.type === "object"
        ? element.object === "gaas"
          ? "Gaas"
          : (objectDef(element.object)?.name ?? "Voorwerp")
        : "Pad";

  // A child crop is selected: show that crop's settings instead of the bed's.
  if (crop) {
    return (
      <aside className="insp">
        <div className="insp-crop-head">
          <button
            type="button"
            className="btn-ghost insp-crop-back"
            onClick={onDeselectCrop}
          >
            ← Terug
          </button>
          <div className="insp-crop-title">
            <i
              className={`crop-icon ${cropIconClass(cropInfo?.icon)}`}
              style={{ color: cropInfo?.color ?? "#999" }}
            />
            <div>
              <div className="insp-kind">{cropInfo?.name ?? crop.cropId}</div>
              <div className="insp-size">in {element.label}</div>
            </div>
          </div>
        </div>

        <div className="insp-crop-body">
          <CropRow
            a={crop}
            crop={cropInfo ?? undefined}
            bed={element}
            onUpdateCrop={onUpdateCrop}
            onRemoveCrop={onRemoveCrop}
          />
        </div>

        <div className="insp-crop-actions">
          <button
            type="button"
            className="btn-ghost btn-block"
            onClick={() => onDuplicateCrop(crop.instanceId)}
          >
            Dupliceren
          </button>
          <button
            type="button"
            className="btn-danger btn-block"
            onClick={() => {
              onRemoveCrop(crop.instanceId);
              onDeselectCrop();
            }}
          >
            Gewas verwijderen
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="insp">
      <header className="insp-head">
        <span
          className="insp-dot"
          style={{ background: element.color }}
          title={element.color}
        />
        <div className="insp-title">
          <span className="insp-kind">{elementKind}</span>
          <span className="insp-size">
            {element.shape === "circle"
              ? `⌀ ${fmtM(element.widthM)} m`
              : `${fmtM(element.widthM)} × ${fmtM(element.heightM)} m`}
          </span>
        </div>
        <span className="insp-badge">
          {element.type === "bed" ? "bestand" : element.type === "object" ? "voorwerp" : "pad"}
        </span>
      </header>

      <label className="inp-field">
        <span>Naam</span>
        <input
          value={element.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
      </label>

      {element.object === "gaas" ? (
        <>
          <div className="inp-row">
            <NumField
              label="Netbreedte (m)"
              value={element.widthM}
              min={0.05}
              step={0.05}
              suffix="m"
              onChange={(v) => onUpdate({ widthM: Math.max(0.05, v) })}
            />
          </div>
          <p className="insp-hint">
            Loopt tussen twee palen (of vrije punten). Verplaats de palen om de
            lijn mee te verplaatsen.
          </p>
        </>
      ) : element.shape === "circle" ? (
        <div className="inp-row">
          <NumField
            label="Straal (m)"
            value={element.widthM / 2}
            min={0.1}
            step={0.05}
            suffix="m"
            onChange={(v) => {
              const r = Math.max(0.1, v);
              onUpdate({ widthM: r * 2, heightM: r * 2 });
            }}
          />
        </div>
      ) : (
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
      )}

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

          {element.crops.length === 0 ? (
            <p className="insp-hint">Nog geen gewassen in dit bed.</p>
          ) : (
            <div className="crop-chips">
              {element.crops.map((c) => {
                const crop = cropById.get(c.cropId);
                return (
                  <span key={c.instanceId} className="crop-chip">
                    <i
                      className={`crop-chip-icon ${cropIconClass(crop?.icon)}`}
                      style={{ color: crop?.color ?? "#999" }}
                    />
                  </span>
                );
              })}
            </div>
          )}

          <button
            type="button"
            className="crops-open"
            onClick={() => setCropsOpen(true)}
          >
            <span>Gewassen beheren</span>
            <span className="crops-open-count">{element.crops.length}</span>
          </button>
        </section>
      )}

      {cropsOpen && (
        <CropsModal
          bed={element}
          catalog={catalog}
          cropById={cropById}
          onClose={() => setCropsOpen(false)}
          onAddCrop={onAddCrop}
          onUpdateCrop={onUpdateCrop}
          onRemoveCrop={onRemoveCrop}
        />
      )}

      <button className="btn-danger btn-block" onClick={onRemove}>
        {element.type === "bed"
          ? "Bed verwijderen"
          : element.type === "object"
            ? `${elementKind} verwijderen`
            : "Pad verwijderen"}
      </button>
    </aside>
  );
}

function Nudge({
  label,
  value,
  min = 1,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  const round = (v: number) => Math.round(v * 100) / 100;
  return (
    <label className="nudge">
      <span className="nudge-label">{label}</span>
      <div className="nudge-controls">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, round(value - step)))}
        >
          −
        </button>
        <span className="nudge-value">
          {value}
          {suffix}
        </span>
        <button type="button" onClick={() => onChange(round(value + step))}>
          +
        </button>
      </div>
    </label>
  );
}

function CropsModal({
  bed,
  catalog,
  cropById,
  onClose,
  onAddCrop,
  onUpdateCrop,
  onRemoveCrop,
}: {
  bed: GardenElement;
  catalog: Crop[];
  cropById: Map<string, Crop>;
  onClose: () => void;
  onAddCrop: (cropId: string) => void;
  onUpdateCrop: (
    iId: string,
    patch: Partial<CropAssignment>
  ) => void;
  onRemoveCrop: (iId: string) => void;
}) {
  const [addQ, setAddQ] = useState("");
  const query = addQ.trim().toLowerCase();
  const counts = new Map<string, number>();
  for (const a of bed.crops) counts.set(a.cropId, (counts.get(a.cropId) ?? 0) + 1);
  const added =
    query.length === 0
      ? catalog
      : catalog.filter((c) => c.name.toLowerCase().includes(query));

  return (
    <div
      className="crops-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="crops-modal" onClick={(e) => e.stopPropagation()}>
        <header className="crops-modal-head">
          <div>
            <h3>Gewassen</h3>
            <p className="crops-modal-sub">
              {bed.label} · {bed.crops.length}{" "}
              {bed.crops.length === 1 ? "gewas" : "gewassen"}
            </p>
          </div>
          <button
            type="button"
            className="crops-close"
            onClick={onClose}
            aria-label="Sluiten"
          >
            ✕
          </button>
        </header>

        <div className="crops-active">
          {bed.crops.length === 0 && (
            <p className="insp-hint">
              Nog geen gewassen. Voeg hieronder een toe.
            </p>
          )}
          {bed.crops.map((a) => (
            <CropRow
              key={a.instanceId}
              a={a}
              crop={cropById.get(a.cropId)}
              bed={bed}
              onUpdateCrop={onUpdateCrop}
              onRemoveCrop={onRemoveCrop}
            />
          ))}
        </div>

        <div className="crops-add">
          <h4>Gewas toevoegen</h4>
          <input
            className="cp-search"
            value={addQ}
            onChange={(e) => setAddQ(e.target.value)}
            placeholder="Zoek gewas…"
          />
          <div className="crops-add-list">
            {added.map((c) => {
              const n = counts.get(c.id) ?? 0;
              return (
                <button
                  type="button"
                  key={c.id}
                  className="crops-add-item"
                  onClick={() => onAddCrop(c.id)}
                >
                  <i
                    className={`crop-icon ${cropIconClass(c.icon)}`}
                    style={{ color: c.color }}
                  />
                  <span className="crops-add-name">{c.name}</span>
                  {n > 0 && (
                    <span className="crops-add-count" title={`Al ${n}× in dit bed`}>
                      {n}×
                    </span>
                  )}
                  <span className="crops-add-plus">+</span>
                </button>
              );
            })}
            {added.length === 0 && (
              <div className="cp-empty">Geen resultaten.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}