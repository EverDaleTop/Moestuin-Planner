import { useEffect, useMemo, useRef, useState } from "react";
import type { Crop, CropAssignment, GardenElement } from "./types";
import { fmtM } from "./storage";
import { cropLabel, fitCropCounts, cropAreaForCounts } from "./cropIcons";
import { CropGlyph } from "./CropIconPicker";
import { objectDef } from "./gardenObjects";

interface Props {
  element: GardenElement | null;
  /** alle elementen in de tuin, voor het overzicht in de sidebar */
  elements: GardenElement[];
  catalog: Crop[];
  /** planted crop currently selected on the canvas (only when a bed holds it) */
  crop: CropAssignment | null;
  /** catalog entry for the selected crop */
  cropInfo: Crop | null;
  onUpdate: (patch: Partial<GardenElement>) => void;
  onRemove: () => void;
  onSelectElement: (id: string) => void;
  onAddCrop: (cropId: string) => void;
  onUpdateCrop: (
    iId: string,
    patch: Partial<CropAssignment>
  ) => void;
  onRemoveCrop: (iId: string) => void;
  onDuplicateCrop: (iId: string) => void;
  onDeselectCrop: () => void;
  /** gewas dat het gewas-gereedschap gebruikt */
  activeCropId: string | null;
  onSelectActiveCrop: (cropId: string) => void;
}

/** Soortnaam voor in de sidebar-lijst. */
function elementKindName(el: GardenElement): string {
  if (el.type === "bed") return "Bed";
  if (el.type === "path") return "Pad";
  if (el.object === "gaas") return "Gaas";
  return objectDef(el.object)?.name ?? "Voorwerp";
}

/** FontAwesome-icoon voor in de sidebar-lijst. */
function elementIconClass(el: GardenElement): string {
  if (el.type === "bed") return "fa-solid fa-table-cells-large";
  if (el.type === "path") return "fa-solid fa-road";
  if (el.object === "gaas") return "fa-solid fa-table-cells";
  return objectDef(el.object)?.icon ?? "fa-solid fa-cube";
}

/** Compacte klikbare lijst van alle elementen in de tuin. */
function ElementList({
  elements,
  activeId,
  onSelect,
}: {
  elements: GardenElement[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (elements.length === 0) {
    return <p className="insp-hint">Nog geen elementen. Teken hierboven een bed of pad.</p>;
  }
  return (
    <div className="insp-list" role="listbox" aria-label="Alle elementen">
      {elements.map((el) => (
        <button
          key={el.id}
          type="button"
          role="option"
          aria-selected={el.id === activeId}
          className={el.id === activeId ? "insp-row insp-row-active" : "insp-row"}
          onClick={() => onSelect(el.id)}
          title={`${el.label || elementKindName(el)} selecteren`}
        >
          <span className="insp-row-icon" style={{ background: `${el.color}1f`, color: el.color }}>
            <i className={elementIconClass(el)} />
          </span>
          <span className="insp-row-main">
            <span className="insp-row-title">{el.label || elementKindName(el)}</span>
            <span className="insp-row-meta">
              {elementKindName(el)}
              {el.type === "bed" && el.crops.length > 0 && ` · ${el.crops.length} ${el.crops.length === 1 ? "gewas" : "gewassen"}`}
            </span>
          </span>
          <i className="fa-solid fa-chevron-right insp-row-chevron" />
        </button>
      ))}
    </div>
  );
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

/** Custom dropdown om het gewas van een stuk te veranderen, met icoontje
 *  en kleur per optie (een native <select> kan geen icons tonen). */
function CropSelect({
  value,
  catalog,
  onChange,
}: {
  value: string;
  catalog: Crop[];
  onChange: (newId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = catalog.find((c) => c.id === value);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  const q = query.trim().toLowerCase();
  const options = q.length === 0
    ? catalog
    : catalog.filter((c) => c.name.toLowerCase().includes(q));

  return (
    <div className="crop-select" ref={rootRef}>
      <button
        type="button"
        className="crop-select-btn"
        onClick={() => {
          setQuery("");
          setOpen((o) => !o);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Ander gewas kiezen"
      >
        <CropGlyph iconKey={current?.icon} cropName={current?.name} color={current?.color} />
        <span className="crop-select-name">
                  {current ? cropLabel(current) : value}
                </span>
        <i className={`fa-solid fa-chevron-down crop-select-caret${open ? " open" : ""}`} />
      </button>
      {open && (
        <div className="crop-select-pop" role="listbox" aria-label="Gewas kiezen">
          {catalog.length > 6 && (
            <input
              className="crop-select-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Zoek gewas…"
              autoFocus
            />
          )}
          <div className="crop-select-list">
            {options.map((c) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={c.id === value}
                className={c.id === value ? "crop-select-item selected" : "crop-select-item"}
                onClick={() => {
                  setOpen(false);
                  onChange(c.id);
                }}
              >
                  <CropGlyph iconKey={c.icon} cropName={c.name} color={c.color} />
                <span className="crop-select-name">{cropLabel(c)}</span>
                {c.id === value && <i className="fa-solid fa-check crop-select-check" />}
              </button>
            ))}
            {options.length === 0 && (
              <div className="cp-empty">Geen resultaten.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Eén stuk gewas: overzichtelijke kaart met samenvatting, gegroepeerde
 *  instellingen en acties. Wordt zowel in de "Gewassen beheren" popup als in
 *  het enkele-gewas paneel gebruikt. */
function CropRow({
  a,
  crop,
  bed,
  catalog,
  onUpdateCrop,
  onRemoveCrop,
  onDuplicateCrop,
}: {
  a: CropAssignment;
  crop: Crop | undefined;
  bed: GardenElement;
  catalog: Crop[];
  onUpdateCrop: (iId: string, patch: Partial<CropAssignment>) => void;
  onRemoveCrop: (iId: string) => void;
  onDuplicateCrop?: (iId: string) => void;
}) {
  const area = a.area ?? { x: 0, y: 0, w: bed.widthM, h: bed.heightM };
  const areaW = area.w;
  const areaH = area.h;
  const rowSpacing = a.rowSpacing ?? crop?.rowSpacing ?? 0.3;
  const plantSpacing = a.plantSpacing ?? crop?.plantSpacing ?? 0.2;
  const padding = a.padding ?? 0.1;
  // De tussenafstand is heilig: rijen/kolommen volgen uit maat + afstand.
  // Groter vlak = meer rijen, nooit dichter op elkaar.
  const fit = fitCropCounts(areaW, areaH, rowSpacing, plantSpacing, padding);
  const dispRows = fit.rows;
  const dispCols = fit.cols;
  const total = dispRows * dispCols;
  const r2 = (v: number) => Math.round(v * 100) / 100;

  /** Vlak opslaan en rijen/kolommen erbij herberekenen (vaste afstand). */
  const applyArea = (
    nx: number,
    ny: number,
    nw: number,
    nh: number,
    rs = rowSpacing,
    ps = plantSpacing,
    pad = padding
  ) => {
    const f = fitCropCounts(nw, nh, rs, ps, pad);
    onUpdateCrop(a.instanceId, {
      area: { x: r2(nx), y: r2(ny), w: r2(nw), h: r2(nh) },
      rows: f.rows,
      cols: f.cols,
    });
  };

  const setSize = (w: number | undefined, h: number | undefined) => {
    const nw = Math.max(0.1, Math.min(w ?? areaW, bed.widthM));
    const nh = Math.max(0.1, Math.min(h ?? areaH, bed.heightM));
    const nx = Math.max(0, Math.min(area.x, bed.widthM - nw));
    const ny = Math.max(0, Math.min(area.y, bed.heightM - nh));
    applyArea(nx, ny, nw, nh);
  };

  /** Meer/minder rijen = het vlak hoger/lager maken met één rijafstand. */
  const setRows = (req: number) => {
    const r = Math.max(1, Math.round(req));
    const need = cropAreaForCounts(r, dispCols, rowSpacing, plantSpacing, padding);
    const nh = Math.max(0.1, Math.min(need.h, bed.heightM));
    const ny = Math.max(0, Math.min(area.y, bed.heightM - nh));
    const nx = Math.max(0, Math.min(area.x, bed.widthM - areaW));
    applyArea(nx, ny, areaW, nh);
  };

  /** Meer/minder kolommen = het vlak breder/smaler maken met één plantafstand. */
  const setCols = (req: number) => {
    const c = Math.max(1, Math.round(req));
    const need = cropAreaForCounts(dispRows, c, rowSpacing, plantSpacing, padding);
    const nw = Math.max(0.1, Math.min(need.w, bed.widthM));
    const nx = Math.max(0, Math.min(area.x, bed.widthM - nw));
    const ny = Math.max(0, Math.min(area.y, bed.heightM - areaH));
    applyArea(nx, ny, nw, areaH);
  };

  const setSpacings = (rs?: number, ps?: number, pad?: number) => {
    const nrs = rs ?? rowSpacing;
    const nps = ps ?? plantSpacing;
    const npad = pad ?? padding;
    const f = fitCropCounts(areaW, areaH, nrs, nps, npad);
    onUpdateCrop(a.instanceId, {
      rowSpacing: nrs,
      plantSpacing: nps,
      padding: npad,
      rows: f.rows,
      cols: f.cols,
    });
  };

  const switchCrop = (newId: string) => {
    if (!newId || newId === a.cropId) return;
    const next = catalog.find((c) => c.id === newId);
    const nrs = next?.rowSpacing ?? rowSpacing;
    const nps = next?.plantSpacing ?? plantSpacing;
    const f = fitCropCounts(areaW, areaH, nrs, nps, padding);
    onUpdateCrop(a.instanceId, {
      cropId: newId,
      // neem de afstanden van het nieuwe gewas over, tel opnieuw bij vaste afstand
      rowSpacing: nrs,
      plantSpacing: nps,
      rows: f.rows,
      cols: f.cols,
    });
  };

  return (
    <div className="crop-card">
      <div className="crop-card-head">
        <CropSelect value={a.cropId} catalog={catalog} onChange={switchCrop} />
        <button
          type="button"
          className="crop-row-remove"
          title="Gewas uit dit bed verwijderen"
          onClick={() => onRemoveCrop(a.instanceId)}
        >
          <i className="fa-solid fa-trash" />
        </button>
      </div>

      <dl className="crop-stats">
        <div className="crop-stat">
          <dt>Grootte</dt>
          <dd>
            {fmtM(areaW)} × {fmtM(areaH)}
          </dd>
        </div>
        <div className="crop-stat">
          <dt>Indeling</dt>
          <dd>
            {dispRows} × {dispCols}
          </dd>
        </div>
        <div className="crop-stat">
          <dt>Planten</dt>
          <dd>±{total}</dd>
        </div>
        <div className="crop-stat">
          <dt>Rij / plant</dt>
          <dd>
            {Math.round(rowSpacing * 100) / 100} / {Math.round(plantSpacing * 100) / 100} m
          </dd>
        </div>
      </dl>

      <div className="crop-sec">
        <h5><i className="fa-solid fa-ruler-combined" /> Afmeting</h5>
        <div className="crop-grid">
          <Nudge
            label="Breedte"
            value={Math.round(areaW * 100) / 100}
            min={0.1}
            step={0.1}
            suffix=" m"
            onChange={(v) => setSize(v, undefined)}
          />
          <Nudge
            label="Lengte"
            value={Math.round(areaH * 100) / 100}
            min={0.1}
            step={0.1}
            suffix=" m"
            onChange={(v) => setSize(undefined, v)}
          />
        </div>
      </div>

      <div className="crop-sec">
        <h5><i className="fa-solid fa-table-cells" /> Indeling</h5>
        <div className="crop-grid">
          <Nudge
            label="Rijen"
            value={dispRows}
            onChange={(v) => setRows(v)}
          />
          <Nudge
            label="Kolommen"
            value={dispCols}
            onChange={(v) => setCols(v)}
          />
        </div>
      </div>

      <div className="crop-sec">
        <h5><i className="fa-solid fa-arrows-left-right" /> Afstanden</h5>
        <div className="crop-grid crop-grid-3">
          <Nudge
            label="Rijafstand"
            value={Math.round(rowSpacing * 100) / 100}
            min={0.05}
            step={0.05}
            suffix=" m"
            onChange={(v) => setSpacings(Math.max(0.01, v), undefined, undefined)}
          />
          <Nudge
            label="Plantafstand"
            value={Math.round(plantSpacing * 100) / 100}
            min={0.01}
            step={0.05}
            suffix=" m"
            onChange={(v) => setSpacings(undefined, Math.max(0.01, v), undefined)}
          />
          <Nudge
            label="Marge"
            value={Math.round(padding * 100) / 100}
            min={0}
            step={0.05}
            suffix=" m"
            onChange={(v) => setSpacings(undefined, undefined, Math.max(0, v))}
          />
        </div>
      </div>

      {onDuplicateCrop && (
        <div className="crop-card-foot">
          <button
            type="button"
            className="btn-ghost btn-block"
            onClick={() => onDuplicateCrop(a.instanceId)}
          >
            <i className="fa-solid fa-copy" /> Dupliceren
          </button>
        </div>
      )}
    </div>
  );
}

export function Inspector({
  element,
  elements,
  catalog,
  crop,
  cropInfo,
  onUpdate,
  onRemove,
  onSelectElement,
  onAddCrop,
  onUpdateCrop,
  onRemoveCrop,
  onDuplicateCrop,
  onDeselectCrop,
  activeCropId,
  onSelectActiveCrop,
}: Props) {
  const [cropsOpen, setCropsOpen] = useState(false);

  const cropById = useMemo(() => {
    const m = new Map<string, Crop>();
    catalog.forEach((c) => m.set(c.id, c));
    return m;
  }, [catalog]);

  if (!element) {
    return (
      <aside className="insp">
        <h4 className="insp-list-title">Elementen ({elements.length})</h4>
        <ElementList elements={elements} activeId={null} onSelect={onSelectElement} />
        {elements.length > 0 && (
          <p className="insp-hint insp-list-hint">
            Klik een element aan om het te bewerken.
          </p>
        )}
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
            <i className="fa-solid fa-arrow-left" /> Terug
          </button>
          <div className="insp-size">Gewas in {element.label}</div>
        </div>

        <div className="insp-crop-body">
          <CropRow
            a={crop}
            crop={cropInfo ?? undefined}
            bed={element}
            catalog={catalog}
            onUpdateCrop={onUpdateCrop}
            onRemoveCrop={(iId) => {
              onRemoveCrop(iId);
              onDeselectCrop();
            }}
            onDuplicateCrop={onDuplicateCrop}
          />
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

          {/* Kies welk gewas je tekent; elk stuk toont daarna het icoontje. */}
          <div className="insp-pick-crop">
            <span className="icon-picker-label">Gewas om te tekenen</span>
            <div className="crop-picker-grid">
              {catalog.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  title={c.name}
                  aria-label={c.name}
                  aria-pressed={c.id === activeCropId}
                  className={
                    c.id === activeCropId ? "icon-opt icon-opt-active" : "icon-opt"
                  }
                  onClick={() => onSelectActiveCrop(c.id)}
                >
                  <CropGlyph iconKey={c.icon} cropName={c.name} label={c.name} color={c.color} />
                </button>
              ))}
            </div>
          </div>
          {catalog.length === 0 && (
            <p className="insp-hint">Voeg eerst een gewas toe aan je database.</p>
          )}

          {element.crops.length === 0 ? (
            <p className="insp-hint">
              Nog geen gewassen. Kies hierboven een gewas en sleep in het bed om
              een stuk te tekenen.
            </p>
          ) : (
            <div className="crop-chips">
              {element.crops.map((c) => {
                const crop = cropById.get(c.cropId);
                return (
                  <span key={c.instanceId} className="crop-chip">
                    <CropGlyph
                      iconKey={crop?.icon}
                      cropName={crop?.name}
                      className="crop-chip-icon"
                      color={crop?.color}
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
            <span><i className="fa-solid fa-seedling" /> Gewassen beheren</span>
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
          onDuplicateCrop={onDuplicateCrop}
        />
      )}

      <button className="btn-danger btn-block" onClick={onRemove}>
        <i className="fa-solid fa-trash" />{" "}
        {element.type === "bed"
          ? "Bed verwijderen"
          : element.type === "object"
            ? `${elementKind} verwijderen`
            : "Pad verwijderen"}
      </button>

      <section className="insp-all">
        <h4>Alle elementen ({elements.length})</h4>
        <ElementList elements={elements} activeId={element.id} onSelect={onSelectElement} />
      </section>
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
          aria-label="Verlagen"
        >
          <i className="fa-solid fa-minus" />
        </button>
        <span className="nudge-value">
          {value}
          {suffix}
        </span>
        <button type="button" onClick={() => onChange(round(value + step))} aria-label="Verhogen">
          <i className="fa-solid fa-plus" />
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
  onDuplicateCrop,
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
  onDuplicateCrop: (iId: string) => void;
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
            <i className="fa-solid fa-xmark" />
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
              catalog={catalog}
              onUpdateCrop={onUpdateCrop}
              onRemoveCrop={onRemoveCrop}
              onDuplicateCrop={onDuplicateCrop}
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
                <CropGlyph iconKey={c.icon} cropName={c.name} color={c.color} />
                  <span className="crops-add-name">{cropLabel(c)}</span>
                  {n > 0 && (
                    <span className="crops-add-count" title={`Al ${n}× in dit bed`}>
                      {n}×
                    </span>
                  )}
                  <span className="crops-add-plus"><i className="fa-solid fa-plus" /></span>
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