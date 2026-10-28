import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Crop } from "./types";
import { IconPicker } from "./CropIconPicker";
import { DEFAULT_CROP_ICON, suggestCropIcon } from "./cropIcons";
import { MONTHS_SHORT, sowWindowText } from "./sowing";
import { api } from "./api";

const BLANK: Omit<Crop, "id"> = {
  name: "",
  variety: "",
  color: "#7c9a6d",
  rowSpacing: 0.3,
  plantSpacing: 0.2,
  daysToHarvest: 70,
  sowWindow: "",
  sowStart: undefined,
  sowEnd: undefined,
  harvestStart: undefined,
  harvestEnd: undefined,
  icon: DEFAULT_CROP_ICON,
};

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const round = (v: number) => Math.round(v * 100) / 100;
  return (
    <div className="shop-form-field">
      <label>{label}</label>
      <div className="step-wrap">
        <button
          type="button"
          className="step-btn"
          onClick={() => onChange(round(value - 0.05))}
          aria-label={`${label} verlagen`}
        >
          <i className="fa-solid fa-minus" aria-hidden="true" />
        </button>
        <input
          className="pd-bare step-input"
          type="number"
          value={Math.round(value * 100) / 100}
          min={0}
          step={0.05}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          aria-label={`${label} in meters`}
        />
        <span className="step-suffix">m</span>
        <button
          type="button"
          className="step-btn"
          onClick={() => onChange(round(value + 0.05))}
          aria-label={`${label} verhogen`}
        >
          <i className="fa-solid fa-plus" aria-hidden="true" />
        </button>
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
    <div className="shop-form-field crop-modal-full">
      <label>Kleur</label>
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

function MonthRangeField({
  prefix,
  start,
  end,
  onChange,
}: {
  prefix: string;
  start?: number;
  end?: number;
  onChange: (start: number | undefined, end: number | undefined) => void;
}) {
  const num = (v: string) => {
    if (v === "") return undefined;
    const n = Math.round(Number(v));
    return n >= 1 && n <= 12 ? n : undefined;
  };
  return (
    <div className="shop-form-field">
      <label>{prefix}</label>
      <div className="month-range">
        <input
          className="pd-bare"
          type="number"
          min={1}
          max={12}
          inputMode="numeric"
          value={start ?? ""}
          placeholder="1"
          onChange={(e) => onChange(num(e.target.value), end)}
          aria-label={`${prefix} vanaf maandnummer`}
        />
        <span className="month-range-sep" aria-hidden="true">
          t/m
        </span>
        <input
          className="pd-bare"
          type="number"
          min={1}
          max={12}
          inputMode="numeric"
          value={end ?? ""}
          placeholder="12"
          onChange={(e) => onChange(start, num(e.target.value))}
          aria-label={`${prefix} tot maandnummer`}
        />
      </div>
    </div>
  );
}

function SeedUrlImport({
  onImport,
}: {
  onImport: (patch: Partial<Omit<Crop, "id">>) => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string[] | null>(null);

  const run = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setErr(null);
    setDone(null);
    try {
      const found = await api.lookupSeed(url.trim());
      const months =
        found.sowStart && found.sowEnd
          ? `${MONTHS_SHORT[found.sowStart - 1]}–${MONTHS_SHORT[found.sowEnd - 1]}`
          : undefined;
      const harvestMonths =
        found.harvestStart && found.harvestEnd
          ? `${MONTHS_SHORT[found.harvestStart - 1]}–${MONTHS_SHORT[found.harvestEnd - 1]}`
          : undefined;
      onImport({
        name: found.cropName,
        variety: found.variety ?? "",
        icon: suggestCropIcon(found.cropName)?.key ?? BLANK.icon,
        sowStart: found.sowStart,
        sowEnd: found.sowEnd,
        sowWindow: sowWindowText(found.sowStart, found.sowEnd) ?? "",
        harvestStart: found.harvestStart,
        harvestEnd: found.harvestEnd,
        rowSpacing: found.rowSpacingM ?? BLANK.rowSpacing,
        plantSpacing: found.plantSpacingM ?? BLANK.plantSpacing,
      });

      const got: string[] = [];
      if (found.variety) got.push(`ras ${found.variety}`);
      if (months) got.push(`zaai ${months}`);
      if (harvestMonths) got.push(`oogst ${harvestMonths}`);
      if (found.plantSpacingM) got.push(`plant ${found.plantSpacingM} m`);
      if (found.rowSpacingM) {
        got.push(
          found.rowSpacingDerived
            ? `rij ${found.rowSpacingM} m (afgeleid)`
            : `rij ${found.rowSpacingM} m`
        );
      }
      setDone(got.length > 0 ? got : ["alleen de naam — vul de rest zelf aan"]);
      setUrl("");
    } catch (e: any) {
      setErr(e?.message ?? "Ophalen mislukt. Vul de velden zelf aan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pd-seedurl">
      <div className="pd-seedurl-row">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void run()}
          placeholder="Link van de zaadpagina"
        />
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !url.trim()}
          onClick={() => void run()}
        >
          {busy ? (
            <i className="fa-solid fa-spinner fa-spin" />
          ) : (
            <i className="fa-solid fa-download" />
          )}
          {busy ? "Bezig" : "Ophalen"}
        </button>
      </div>
      {err && <p className="pd-seedurl-msg is-err">{err}</p>}
      {done && (
        <div className="pd-seedurl-msg is-ok">
          {done.map((d) => (
            <span key={d} className="pd-seedurl-tag">
              {d}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function CropFormModal({
  mounted,
  open,
  crop,
  onClose,
  onSave,
}: {
  mounted: boolean;
  open: boolean;
  crop: Crop | null;
  onClose: () => void;
  onSave: (data: Omit<Crop, "id">) => void;
}) {
  const [form, setForm] = useState<Omit<Crop, "id">>(BLANK);
  const dragStartY = useRef(0);
  const dragOffsetRef = useRef(0);
  const [dragOffset, setDragOffsetState] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragClosing, setDragClosing] = useState(false);
  const [grabbed, setGrabbed] = useState(false);

  const setDragOffset = (v: number) => {
    dragOffsetRef.current = v;
    setDragOffsetState(v);
  };

  useEffect(() => {
    if (!mounted || !open) return;
    setForm(crop ? { ...BLANK, ...crop } : BLANK);
    setDragClosing(false);
    setGrabbed(false);
    dragOffsetRef.current = 0;
    setDragOffsetState(0);
    setDragging(false);
  }, [mounted, open, crop]);

  const onGripDown = (e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    dragOffsetRef.current = 0;
    setDragClosing(false);
    setGrabbed(true);
    setDragging(true);
    setDragOffsetState(0);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onGripMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const next = Math.max(0, e.clientY - dragStartY.current);
    dragOffsetRef.current = next;
    setDragOffsetState(next);
  };
  const endDrag = () => {
    if (!dragging) return;
    setDragging(false);
    if (dragOffsetRef.current > 90) {
      setDragClosing(true);
      setDragOffset(window.innerHeight);
      onClose();
    } else {
      setDragOffset(0);
    }
  };

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  const canSave = form.name.trim().length > 0;
  const save = () => {
    if (!canSave) return;
    onSave({ ...form, name: form.name.trim(), variety: form.variety?.trim() || undefined });
  };

  return createPortal(
    <div
      className={`sow-modal-overlay${open ? "" : " closing"}${dragClosing ? " drag-closing" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`sow-modal crop-modal${dragging ? " dragging" : ""}${dragClosing ? " drag-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={crop ? "Gewas bewerken" : "Nieuw gewas"}
        style={
          grabbed
            ? {
                transform: `translateY(${dragOffset}px)`,
                transition: dragging
                  ? "none"
                  : dragClosing
                    ? "transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)"
                    : "transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
                animation: "none",
              }
            : undefined
        }
      >
        <div
          className="sow-modal-grip"
          aria-hidden="true"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        <div className="sow-modal-head">
          <h3>
            <i className={`fa-solid ${crop ? "fa-pen" : "fa-seedling"}`} aria-hidden="true" />
            {crop ? "Gewas bewerken" : "Nieuw gewas"}
          </h3>
          <button
            type="button"
            className="sow-modal-close"
            onClick={onClose}
            aria-label="Sluiten"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div className="sow-modal-body">
          <div className="shop-form-grid crop-modal-grid">
          <div className="shop-form-field">
            <label>Naam</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="bijv. Pompoen"
            />
          </div>
          <div className="shop-form-field">
            <label>Ras / variëteit (optioneel)</label>
            <input
              value={form.variety ?? ""}
              onChange={(e) => setForm({ ...form, variety: e.target.value })}
              placeholder="bijv. Sparta"
            />
          </div>

          <div className="crop-modal-full">
            <div className="shop-form-field">
              <label>Zaadpagina (optioneel)</label>
              <SeedUrlImport onImport={(patch) => setForm({ ...form, ...patch })} />
            </div>
          </div>

          <div className="crop-modal-pair">
            <NumField
              label="Rijafstand"
              value={form.rowSpacing}
              onChange={(v) => setForm({ ...form, rowSpacing: v })}
            />
            <NumField
              label="Plantafstand"
              value={form.plantSpacing}
              onChange={(v) => setForm({ ...form, plantSpacing: v })}
            />
          </div>

          <ColorField
            value={form.color}
            onChange={(color) => setForm({ ...form, color })}
          />
          <div className="crop-modal-full">
            <IconPicker
              value={form.icon}
              color={form.color}
              cropName={form.name}
              onChange={(icon) => setForm({ ...form, icon })}
            />
          </div>

          <div className="crop-modal-pair">
            <MonthRangeField
              prefix="Zaaien"
              start={form.sowStart}
              end={form.sowEnd}
              onChange={(sowStart, sowEnd) =>
                setForm({
                  ...form,
                  sowStart,
                  sowEnd,
                  sowWindow: sowWindowText(sowStart, sowEnd) ?? "",
                })
              }
            />
            <MonthRangeField
              prefix="Oogsten"
              start={form.harvestStart}
              end={form.harvestEnd}
              onChange={(harvestStart, harvestEnd) =>
                setForm({ ...form, harvestStart, harvestEnd })
              }
            />
          </div>
          </div>
        </div>

        <div className="crop-modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuleren
          </button>
          <button type="button" className="btn-primary" disabled={!canSave} onClick={save}>
            <i className="fa-solid fa-check" /> Opslaan
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
