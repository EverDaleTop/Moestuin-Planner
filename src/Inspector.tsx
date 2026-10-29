import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Crop, CropAssignment, GardenElement } from "./types";
import { fmtM, PX_PER_M } from "./storage";
import { cropLabel, fitCropCounts, cropAreaForCounts } from "./cropIcons";
import { CropGlyph } from "./CropIconPicker";
import { objectDef } from "./gardenObjects";

interface Props {
  locked?: boolean;
  overviewOpen?: boolean;
  selectedIds?: string[];
  onGoToCropList?: () => void;
  element: GardenElement | null;
  
  elements: GardenElement[];
  catalog: Crop[];
  
  crop: CropAssignment | null;
  
  cropInfo: Crop | null;
  onUpdate: (patch: Partial<GardenElement>) => void;
  onRemove: () => void;
  onSelectElement: (id: string) => void;
  onSelectCrop: (instanceId: string) => void;
  onBack?: () => void;
  onToggleSelectElement?: (id: string) => void;
  onAddCrop?: (cropId: string) => void;
  onUpdateCrop: (
    iId: string,
    patch: Partial<CropAssignment>
  ) => void;
  onRemoveCrop: (iId: string) => void;
  onDuplicateCrop: (iId: string) => void;
  onDeselectCrop: () => void;
  
  activeCropId: string | null;
  onSelectActiveCrop: (cropId: string) => void;
}

function elementBox(e: GardenElement): { x: number; y: number; w: number; h: number } {
  if (e.object === "gaas" && e.gaas) {
    const t = (e.widthM || 0.1) * PX_PER_M;
    const x1 = Math.min(e.gaas.a.x, e.gaas.b.x) - t;
    const y1 = Math.min(e.gaas.a.y, e.gaas.b.y) - t;
    return {
      x: x1,
      y: y1,
      w: Math.abs(e.gaas.b.x - e.gaas.a.x) + t * 2,
      h: Math.abs(e.gaas.b.y - e.gaas.a.y) + t * 2,
    };
  }
  return { x: e.x, y: e.y, w: e.widthM * PX_PER_M, h: e.heightM * PX_PER_M };
}

function elementInVeld(e: GardenElement, v: GardenElement): boolean {
  if (e.id === v.id) return false;
  const m = 4;
  const a = elementBox(e);
  const b = elementBox(v);
  return (
    a.x < b.x + b.w + m &&
    a.x + a.w > b.x - m &&
    a.y < b.y + b.h + m &&
    a.y + a.h > b.y - m
  );
}

export function inspectorElementInVeld(e: GardenElement, v: GardenElement): boolean {
  return elementInVeld(e, v)
}

function elementKindName(el: GardenElement): string {
  if (el.type === "bed") return "Bed";
  if (el.type === "path") return "Pad";
  if (el.type === "veld") return "Veld";
  if (el.object === "gaas") return "Gaas";
  return objectDef(el.object)?.name ?? "Voorwerp";
}

function elementIconClass(el: GardenElement): string {
  if (el.type === "bed") return "fa-solid fa-table-cells-large";
  if (el.type === "path") return "fa-solid fa-road";
  if (el.type === "veld") return "fa-solid fa-border-all";
  if (el.object === "gaas") return "fa-solid fa-table-cells";
  return objectDef(el.object)?.icon ?? "fa-solid fa-cube";
}

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
  const round = (v: number) => Math.round(v * 100) / 100;
  return (
    <div className="inp-field">
      <span>{label}</span>
      <div className="step-wrap">
        <button
          type="button"
          className="step-btn"
          onClick={() => onChange(round(Math.max(min, value - step)))}
          aria-label="Verlagen"
        >
          <i className="fa-solid fa-minus" />
        </button>
        <input
          className="pd-bare step-input"
          type="number"
          aria-label={label}
          value={Number.isFinite(value) ? round(value) : 0}
          min={min}
          step="any"
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
        <button
          type="button"
          className="step-btn"
          onClick={() => onChange(round(value + step))}
          aria-label="Verhogen"
        >
          <i className="fa-solid fa-plus" />
        </button>
        {suffix && <span className="step-suffix">{suffix}</span>}
      </div>
    </div>
  );
}

const COLOR_PRESETS = [
  "#1F4D3A",
  "#5FA55A",
  "#9DC08B",
  "#E9C46A",
  "#E76F51",
  "#C65D5D",
  "#7B8FD4",
  "#B088D0",
];

function ColorField({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  const current = value.toLowerCase();
  return (
    <div className="inp-field">
      <span>Kleur</span>
      <div className="color-row">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            className={`color-dot${current === c.toLowerCase() ? " is-active" : ""}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
            aria-label={`Kleur ${c}`}
            aria-pressed={current === c.toLowerCase()}
          />
        ))}
        <label
          className="color-custom"
          style={{ background: value }}
          title="Eigen kleur kiezen"
        >
          <input
            className="pd-bare"
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label="Eigen kleur kiezen"
          />
          <i className="fa-solid fa-plus" aria-hidden="true" />
        </label>
      </div>
    </div>
  );
}

export function CropSelect({
  value,
  catalog,
  onChange,
}: {
  value: string;
  catalog: Crop[];
  onChange: (newId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const [above, setAbove] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  const current = catalog.find((c) => c.id === value);

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.clearTimeout(closeTimer.current ?? undefined);
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      closeTimer.current = null;
      const t = triggerRef.current;
      if (t && document.activeElement === t) t.blur();
    }, 200);
  };

  const measure = () => {
    const el = triggerRef.current;
    if (!el) return;
    const GAP = 6;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 220);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const estH = Math.min(76 + catalog.length * 41, 360, window.innerHeight * 0.6);
    const flip = r.bottom + GAP + estH > window.innerHeight && r.top - GAP - estH >= 0;
    setAbove(flip);
    setPos({ top: flip ? Math.max(8, r.top - GAP - estH) : r.bottom + GAP, left, width });
  };

  useLayoutEffect(() => {
    if (open) measure();
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: PointerEvent) => {
      const t = e.target as Node;
      const pop = document.getElementById("cropselect-portal");
      if (
        triggerRef.current && !triggerRef.current.contains(t) &&
        (!pop || !pop.contains(t))
      ) {
        requestClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    const onScroll = () => measure();
    document.addEventListener("pointerdown", onDocDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onDocDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
    
  }, [open ]);

  const q = query.trim().toLowerCase();
  const options = q.length === 0
    ? catalog
    : catalog.filter((c) => c.name.toLowerCase().includes(q));

  const openNow = () => {
    window.clearTimeout(closeTimer.current ?? undefined);
    closeTimer.current = null;
    setClosing(false);
    setQuery("");
    setOpen(true);
  };
  const closeIfOutside = (e: React.MouseEvent) => {
    const next = e.relatedTarget as Node | null;
    const pop = document.getElementById("cropselect-portal");
    if (next instanceof Node && (triggerRef.current?.contains(next) || pop?.contains(next))) return;
    window.clearTimeout(closeTimer.current ?? undefined);
    closeTimer.current = window.setTimeout(() => requestClose(), 150);
  };

  return (
    <div
      className="catdd cal-scope-dropdown crop-select"
      ref={rootRef}
      onMouseEnter={openNow}
      onMouseLeave={closeIfOutside}
    >
      <button
        type="button"
        ref={triggerRef}
        className="catdd-trigger cal-scope-trigger"
        onClick={() => {
          if (open && !closing) {
            requestClose();
            return;
          }
          setClosing(false);
          setQuery("");
          setOpen(true);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Ander gewas kiezen"
      >
        <CropGlyph iconKey={current?.icon} cropName={current?.name} />
        <span className="catdd-current">
                  {current ? cropLabel(current) : value}
                </span>
        <i className={`fa-solid fa-chevron-down catdd-caret${open && !closing ? " open" : ""}`} aria-hidden="true" />
      </button>
      {(open || closing) &&
        createPortal(
          <div
            id="cropselect-portal"
            className={`catdd-pop catdd-pop-portal scopedd-pop${closing ? " closing" : ""}${above ? " catdd-pop-above" : ""}`}
            role="listbox"
            aria-label="Gewas kiezen"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            onMouseEnter={() => {
              window.clearTimeout(closeTimer.current ?? undefined);
              closeTimer.current = null;
              setClosing(false);
              setOpen(true);
            }}
            onMouseLeave={closeIfOutside}
          >
            {catalog.length > 6 && (
              <input
                className="crop-select-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Zoek gewas…"
                aria-label="Zoek gewas"
              />
            )}
            <div className="scopedd-list">
            {options.map((c) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={c.id === value}
                className={c.id === value ? "catdd-item is-active" : "catdd-item"}
                onClick={() => {
                  onChange(c.id);
                  requestClose();
                }}
              >
                  <CropGlyph iconKey={c.icon} cropName={c.name} />
                <span className="catdd-name">{cropLabel(c)}</span>
                {c.id === value && <i className="fa-solid fa-check catdd-check" />}
              </button>
            ))}
            {options.length === 0 && (
              <div className="cp-empty">Geen resultaten.</div>
            )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

function CropRow({
  a,
  crop,
  bed,
  catalog,
  onUpdateCrop,
  onDuplicateCrop,
}: {
  a: CropAssignment;
  crop: Crop | undefined;
  bed: GardenElement;
  catalog: Crop[];
  onUpdateCrop: (iId: string, patch: Partial<CropAssignment>) => void;
  onDuplicateCrop?: (iId: string) => void;
}) {
  const area = a.area ?? { x: 0, y: 0, w: bed.widthM, h: bed.heightM };
  const areaW = area.w;
  const areaH = area.h;
  const rowSpacing = a.rowSpacing ?? crop?.rowSpacing ?? 0.3;
  const plantSpacing = a.plantSpacing ?? crop?.plantSpacing ?? 0.2;
  const padding = a.padding ?? 0.1;
  
  
  const fit = fitCropCounts(areaW, areaH, rowSpacing, plantSpacing, padding);
  const dispRows = fit.rows;
  const dispCols = fit.cols;
  const total = dispRows * dispCols;
  const r2 = (v: number) => Math.round(v * 100) / 100;

  
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

  
  const setRows = (req: number) => {
    const r = Math.max(1, Math.round(req));
    const need = cropAreaForCounts(r, dispCols, rowSpacing, plantSpacing, padding);
    const nh = Math.max(0.1, Math.min(need.h, bed.heightM));
    const ny = Math.max(0, Math.min(area.y, bed.heightM - nh));
    const nx = Math.max(0, Math.min(area.x, bed.widthM - areaW));
    applyArea(nx, ny, areaW, nh);
  };

  
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
      
      rowSpacing: nrs,
      plantSpacing: nps,
      rows: f.rows,
      cols: f.cols,
    });
  };

  return (
    <div className="crop-card-view">
      <div className="crop-card-head">
        <CropSelect value={a.cropId} catalog={catalog} onChange={switchCrop} />
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
  onSelectCrop,
  onBack,
  onUpdateCrop,
  onRemoveCrop,
  onDuplicateCrop,
  onDeselectCrop,
  activeCropId,
}: Props) {
  const [sheetShut, setSheetShut] = useState(false);
  const dragStartY = useRef(0);
  const dragOffsetRef = useRef(0);
  const [dragOffset, setDragOffsetState] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setSheetShut(false);
    dragOffsetRef.current = 0;
    setDragOffsetState(0);
    setDragging(false);
  }, [element?.id, activeCropId]);

  const setDragOffset = (v: number) => {
    dragOffsetRef.current = v;
    setDragOffsetState(v);
  };

  const onGripDown = (e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    dragOffsetRef.current = 0;
    setDragging(true);
    setDragOffsetState(0);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onGripMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const delta = e.clientY - dragStartY.current;
    const next = sheetShut ? Math.min(0, delta) : Math.max(0, delta);
    dragOffsetRef.current = next;
    setDragOffsetState(next);
  };
  const endGripDrag = () => {
    if (!dragging) return;
    setDragging(false);
    const off = dragOffsetRef.current;
    if (Math.abs(off) < 10) {
      setSheetShut(false);
      setDragOffset(0);
      return;
    }
    if (!sheetShut && off > 90) {
      setSheetShut(true);
      setDragOffset(0);
      return;
    }
    if (sheetShut && off < -60) {
      setSheetShut(false);
      setDragOffset(0);
      return;
    }
    setDragOffset(0);
  };
  const sheetStyle =
    dragging || dragOffset !== 0
      ? {
          transform: sheetShut
            ? `translateY(calc(100% - 34px + ${dragOffset}px))`
            : `translateY(${dragOffset}px)`,
          transition: dragging ? "none" : undefined,
        }
      : undefined;

  const cropById = useMemo(() => {
    const m = new Map<string, Crop>();
    catalog.forEach((c) => m.set(c.id, c));
    return m;
  }, [catalog]);

  if (!element) {
    const parents = elements.filter((e) => {
      const velden = elements.filter((v) => v.type === "veld" && v.id !== e.id);
      return !velden.some((v) => elementInVeld(e, v));
    });
    return (
      <aside
        className={`insp${sheetShut ? " sheet-shut" : ""}`}
        style={sheetStyle}
      >
        <div
          className="insp-grip"
          aria-hidden="true"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={endGripDrag}
          onPointerCancel={endGripDrag}
        />
        <div className="insp-view" key="lijst">
        <h4 className="insp-list-title">Elementen ({parents.length})</h4>
        <ElementList elements={parents} activeId={null} onSelect={onSelectElement} />
        {parents.length > 0 && (
          <p className="insp-hint insp-list-hint">
            Klik een element aan om het te bewerken.
          </p>
        )}
        </div>
      </aside>
    );
  }

  const elementKind =
    element.type === "bed"
      ? "Bed"
      : element.type === "veld"
        ? "Veld"
        : element.type === "object"
          ? element.object === "gaas"
            ? "Gaas"
            : (objectDef(element.object)?.name ?? "Voorwerp")
          : "Pad";

  
  if (crop) {
    return (
      <aside
        className={`insp${sheetShut ? " sheet-shut" : ""}`}
        style={sheetStyle}
      >
        <div
          className="insp-grip"
          aria-hidden="true"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={endGripDrag}
          onPointerCancel={endGripDrag}
        />
        <div className="insp-view" key={crop.instanceId}>
        <header className="insp-head">
          <button
            type="button"
            className="btn-ghost insp-back"
            onClick={onDeselectCrop}
            aria-label="Terug naar element"
            title="Terug"
          >
            <i className="fa-solid fa-arrow-left" />
          </button>
          <span
            className="insp-dot insp-dot-crop"
            title={cropInfo ? cropLabel(cropInfo) : undefined}
          >
            <CropGlyph
              iconKey={cropInfo?.icon}
              cropName={cropInfo ? cropLabel(cropInfo) : undefined}
            />
          </span>
          <div className="insp-title">
            <span className="insp-kind">{cropInfo ? cropLabel(cropInfo) : "Gewas"}</span>
            <span className="insp-size">in {element.label}</span>
          </div>
          <button
            type="button"
            className="btn-ghost insp-back insp-remove"
            onClick={() => {
              onRemoveCrop(crop.instanceId);
              onDeselectCrop();
            }}
            aria-label="Gewas verwijderen"
            title="Verwijderen"
          >
            <i className="fa-solid fa-trash" />
          </button>
        </header>

        <div className="insp-crop-body">
          <CropRow
            a={crop}
            crop={cropInfo ?? undefined}
            bed={element}
            catalog={catalog}
            onUpdateCrop={onUpdateCrop}
            onDuplicateCrop={onDuplicateCrop}
          />
        </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`insp${sheetShut ? " sheet-shut" : ""}`}
      style={sheetStyle}
    >
      <div
        className="insp-grip"
        aria-hidden="true"
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={endGripDrag}
        onPointerCancel={endGripDrag}
      />
      <div className="insp-view" key={element.id}>
      <header className="insp-head">
        {onBack && (
          <button
            type="button"
            className="btn-ghost insp-back"
            onClick={onBack}
            aria-label="Terug naar elementen"
            title="Terug"
          >
            <i className="fa-solid fa-arrow-left" />
          </button>
        )}
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
        <button
          type="button"
          className="btn-ghost insp-back insp-remove"
          onClick={onRemove}
          aria-label="Verwijderen"
          title="Verwijderen"
        >
          <i className="fa-solid fa-trash" />
        </button>
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
            onChange={(v) => onUpdate({ widthM: v })}
          />
          <NumField
            label="Lengte (m)"
            value={element.heightM}
            step={0.1}
            onChange={(v) => onUpdate({ heightM: v })}
          />
        </div>
      )}

      <ColorField
        value={element.color}
        onChange={(c) => onUpdate({ color: c })}
      />

      {element.type === "bed" && (
        <section className="insp-crops">
          <span className="icon-picker-label">Gewassen</span>
          {element.crops.length === 0 ? (
            <p className="insp-hint">Nog geen gewassen in dit bed.</p>
          ) : (
            <div className="icon-picker-grid insp-crop-grid">
              {element.crops.map((c) => {
                const crop = cropById.get(c.cropId);
                return (
                  <button
                    key={c.instanceId}
                    type="button"
                    title={crop ? cropLabel(crop) : "Gewas"}
                    aria-label={crop ? cropLabel(crop) : "Gewas"}
                    className="icon-opt"
                    onClick={() => onSelectCrop(c.instanceId)}
                  >
                    <CropGlyph
                      iconKey={crop?.icon}
                      cropName={crop?.name}
                      color={crop?.color}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="insp-all">
        <h4>
          {element?.type === "veld"
            ? `Elementen in ${element.label} (${elements.filter((e) => elementInVeld(e, element)).length})`
            : `Alle elementen (${elements.length})`}
        </h4>
        <ElementList
          elements={
            element?.type === "veld"
              ? elements.filter((e) => elementInVeld(e, element))
              : elements.filter((e) => {
                  
                  const velden = elements.filter((v) => v.type === "veld" && v.id !== e.id);
                  return !velden.some((v) => elementInVeld(e, v));
                })
          }
          activeId={element.id}
          onSelect={onSelectElement}
        />
      </section>
      </div>
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

