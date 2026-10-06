import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Crop } from "./types";
import type { Theme } from "./useTheme";
import { ThemeToggle } from "./ThemeToggle";
import { IconPicker, CropGlyph } from "./CropIconPicker";
import { DEFAULT_CROP_ICON, suggestCropIcon } from "./cropIcons";
import { useCollapseForm } from "./useCollapseForm";
import { MONTHS_LONG, MONTHS_SHORT, seasonLabel, sowWindowText } from "./sowing";
import { parseSowWindow } from "./storage";
import { api } from "./api";
import { cropLabel } from "./cropIcons";

function NumField({
  label,
  value,
  onChange,
  suffix = "m",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <label className="inp-field pd-field">
      <span>{label}</span>
      <div className="inp-num">
        <input
          type="number"
          value={Math.round(value * 100) / 100}
          min={0}
          step={0.05}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
        <span className="inp-suffix">{suffix}</span>
      </div>
    </label>
  );
}

const BLANK = {
  name: "",
  variety: "",
  color: "#7c9a6d",
  rowSpacing: 0.3,
  plantSpacing: 0.2,
  daysToHarvest: 70,
  sowWindow: "",
  sowStart: undefined as number | undefined,
  sowEnd: undefined as number | undefined,
  harvestStart: undefined as number | undefined,
  harvestEnd: undefined as number | undefined,
  icon: DEFAULT_CROP_ICON,
};

/**
 * Plak een zaad-/productpagina en haal daaruit naam, ras, zaaimaanden en
 * afstanden. De server leest de pagina; wat eruit komt kun je gewoon
 * overschrijven voordat je opslaat.
 */
function SeedUrlImport({
  onImport,
}: {
  onImport: (patch: Partial<typeof BLANK>) => void;
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
      setDone(
        got.length > 0
          ? got
          : ["alleen de naam — vul de rest zelf aan"]
      );
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
            <i className="fa-solid fa-arrow-down-from-bracket" />
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

/** Maandpaar (Van/Tot). `prefix` bepaalt het label, bv. "Zaaien"/"Oogsten". */
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
  const opt = (v: string) => (v === "" ? undefined : Number(v));
  const months = (
    <>
      <option value="">—</option>
      {MONTHS_LONG.map((m, i) => (
        <option key={m} value={i + 1}>
          {m}
        </option>
      ))}
    </>
  );
  return (
    <div className="inp-row">
      <label className="inp-field pd-field">
        <span>{prefix} vanaf</span>
        <select value={start ?? ""} onChange={(e) => onChange(opt(e.target.value), end)}>
          {months}
        </select>
      </label>
      <label className="inp-field pd-field">
        <span>{prefix} tot</span>
        <select value={end ?? ""} onChange={(e) => onChange(start, opt(e.target.value))}>
          {months}
        </select>
      </label>
    </div>
  );
}

/** The shared crop-catalog content (search, add form, list). Used both by the
 *  full-screen PlantDatabase page and the editor's "Gewassen" tab. */
export function PlantCatalog({
  catalog,
  onAdd,
  onUpdate,
  onDelete,
}: {
  catalog: Crop[];
  onAdd: (crop: Omit<Crop, "id">) => void;
  onUpdate: (cropId: string, patch: Partial<Crop>) => void;
  onDelete: (cropId: string) => void;
}) {
  const [form, setForm] = useState(BLANK);
  const collapse = useCollapseForm();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return catalog;
    return catalog.filter(
      (c) =>
        cropLabel(c).toLowerCase().includes(s) ||
        (c.sowWindow ?? "").toLowerCase().includes(s)
    );
  }, [catalog, q]);

  const canSave = form.name.trim().length > 0;

  const submit = () => {
    if (!canSave) return;
    onAdd({ ...form, name: form.name.trim() });
    setForm(BLANK);
    collapse.closeForm();
  };

  return (
    <>
      <div className="pd-toolbar">
        <input
          className="pd-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek gewas…"
        />
        <button
          className="btn-primary"
          onClick={collapse.toggleForm}
        >
          {collapse.open ? (
            <>
              <i className="fa-solid fa-xmark" /> Sluiten
            </>
          ) : (
            <>
              <i className="fa-solid fa-plus" /> Nieuw gewas
            </>
          )}
        </button>
      </div>

      {collapse.mounted && (
        <div className={`shop-form ${collapse.open ? "" : "shop-form-closing"}`}>
          <div className="shop-form-inner">
        <section className="pd-form">
          <label className="inp-field">
            <span>Naam</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="bijv. Pompoen"
              autoFocus
            />
          </label>
          <label className="inp-field">
            <span>Ras / variëteit (optioneel)</span>
            <input
              value={form.variety ?? ""}
              onChange={(e) => setForm({ ...form, variety: e.target.value })}
              placeholder="bijv. Sparta"
            />
          </label>
          <SeedUrlImport onImport={(patch) => setForm({ ...form, ...patch })} />
          <div className="inp-row">
            <NumField label="Rijafstand" value={form.rowSpacing} onChange={(v) => setForm({ ...form, rowSpacing: v })} />
            <NumField label="Plantafstand" value={form.plantSpacing} onChange={(v) => setForm({ ...form, plantSpacing: v })} />
          </div>
          <label className="inp-field inp-color">
            <span>Kleur</span>
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
          </label>
          <IconPicker
            value={form.icon}
            color={form.color}
            cropName={form.name}
            onChange={(icon) => setForm({ ...form, icon })}
          />
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
          <button disabled={!canSave} className="btn-block" onClick={submit}>
            <i className="fa-solid fa-check" /> Opslaan
          </button>
        </section>
          </div>
        </div>
      )}

      <section className="pd-list">
        {filtered.length === 0 && (
          <p className="gl-empty">
            Geen gewassen gevonden. Voeg een nieuw gewas toe om te beginnen.
          </p>
        )}
        {filtered.map((c) => (
          <PdCard
            key={c.id}
            crop={c}
            editing={editingId === c.id}
            confirming={confirmId === c.id}
            onEdit={() => setEditingId(c.id)}
            onConfirmDelete={() => setConfirmId(c.id)}
            onCancelConfirm={() => setConfirmId(null)}
            onDelete={() => {
              onDelete(c.id);
              setConfirmId(null);
            }}
            onSaveEdit={(patch) => {
              onUpdate(c.id, patch);
              setEditingId(null);
            }}
            onCancelEdit={() => setEditingId(null)}
          />
        ))}
      </section>
    </>
  );
}

export function PlantDatabase({
  catalog,
  theme,
  onToggleTheme,
  onBack,
  onAdd,
  onUpdate,
  onDelete,
}: {
  catalog: Crop[];
  theme: Theme;
  onToggleTheme: () => void;
  onBack: () => void;
  onAdd: (crop: Omit<Crop, "id">) => void;
  onUpdate: (cropId: string, patch: Partial<Crop>) => void;
  onDelete: (cropId: string) => void;
}) {
  return (
    <div className="gl-wrap">
      <header className="gl-header">
        <div className="gl-brand">
          <span className="gl-mark">
            <i className="fa-solid fa-seedling" />
          </span>
          <h1>Gewassen</h1>
        </div>
        <div className="gl-account">
          <button className="btn-ghost" onClick={onBack}>
            <i className="fa-solid fa-arrow-left" /> Tuinen
          </button>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </header>

      <PlantCatalog
        catalog={catalog}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    </div>
  );
}

/**
 * Eén gewaskaart: overzicht en bewerkformulier wisselen met een vloeiende
 * hoogte-animatie, beide kanten op. De hoogte wordt gemeten (voor/na) en
 * expliciet geanimeerd, zodat het nooit instant verspringt — ook niet bij
 * snel achter elkaar klikken.
 */
function PdCard({
  crop: c,
  editing,
  confirming,
  onEdit,
  onConfirmDelete,
  onCancelConfirm,
  onDelete,
  onSaveEdit,
  onCancelEdit,
}: {
  crop: Crop;
  editing: boolean;
  confirming: boolean;
  onEdit: () => void;
  onConfirmDelete: () => void;
  onCancelConfirm: () => void;
  onDelete: () => void;
  onSaveEdit: (patch: Partial<Crop>) => void;
  onCancelEdit: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Hoogte van de vorige render. Wordt bijgehouden buiten de meting om,
  // want zodra dit effect draait staat de nieuwe inhoud al in de DOM en is
  // de oude hoogte niet meer te meten.
  const prevH = useRef<number | null>(null);
  // Alleen waar als er op dit moment een hoogte-animatie loopt.
  const animating = useRef(false);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // Natuurlijke hoogte van de nieuwe inhoud (oude inline styles eerst weg).
    el.style.height = "";
    el.style.transition = "";
    const to = el.offsetHeight;
    const from = prevH.current;
    prevH.current = to;
    if (from == null) return; // eerste render: alleen meten
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (Math.abs(from - to) < 2) return;
    animating.current = true;
    el.style.height = `${from}px`;
    el.style.overflow = "hidden";
    // reflow forceren zodat de transitie vanaf `from` vertrekt
    void el.offsetHeight;
    el.style.transition = "height 0.3s cubic-bezier(0.22, 1, 0.36, 1)";
    el.style.height = `${to}px`;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      animating.current = false;
      el.style.height = "";
      el.style.transition = "";
      el.style.overflow = "";
    };
    el.addEventListener("transitionend", finish);
    const timer = window.setTimeout(finish, 400);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener("transitionend", finish);
      // Alleen de zichtbare tussenstand bewaren als er echt nog een
      // animatie liep. Anders zou de oude hoogte overschreven worden met
      // de nieuwe en valt er niets meer te animeren (sluiten snapte).
      if (animating.current) {
        prevH.current = el.getBoundingClientRect().height;
      }
    };
  }, [editing, confirming]);

  return (
    <div className="pd-card">
      <div ref={wrapRef}>
        {editing ? (
          <EditRow
            crop={c}
            onSave={onSaveEdit}
            onCancel={onCancelEdit}
          />
        ) : (
          <div className="pd-card-view">
            <CropGlyph
              iconKey={c.icon}
              cropName={c.name}
              label={c.name}
              className="crop-icon pd-icon"
              color={c.color}
            />
            <div className="pd-card-main">
              <div className="pd-card-title">{cropLabel(c)}</div>
                    <div className="pd-card-meta">
                      rij {c.rowSpacing.toFixed(2)} m · plant {c.plantSpacing.toFixed(2)} m
                      {seasonLabel(c) ? ` · ${seasonLabel(c)}` : ""}
                    </div>
            </div>
            <div className="pd-card-actions">
              <button onClick={onEdit}><i className="fa-solid fa-pen" /> Bewerken</button>
              {confirming ? (
                <>
                  <span className="gl-confirm">Verwijderen?</span>
                  <button
                    className="btn-danger"
                    onClick={onDelete}
                  >
                    Ja
                  </button>
                  <button onClick={onCancelConfirm}>Nee</button>
                </>
              ) : (
                <button
                  className="btn-danger"
                  onClick={onConfirmDelete}
                  title="Gewas verwijderen"
                >
                  <i className="fa-solid fa-trash" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EditRow({
  crop,
  onSave,
  onCancel,
}: {
  crop: Crop;
  onSave: (patch: Partial<Crop>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(crop.name);
  const [variety, setVariety] = useState(crop.variety ?? "");
  const [color, setColor] = useState(crop.color);
  const [row, setRow] = useState(crop.rowSpacing);
  const [plant, setPlant] = useState(crop.plantSpacing);
  const parsed = parseSowWindow(crop.sowWindow);
  const [sowStart, setSowStart] = useState<number | undefined>(
    crop.sowStart ?? parsed?.start
  );
  const [sowEnd, setSowEnd] = useState<number | undefined>(
    crop.sowEnd ?? parsed?.end
  );
  const [harvestStart, setHarvestStart] = useState<number | undefined>(
    crop.harvestStart
  );
  const [harvestEnd, setHarvestEnd] = useState<number | undefined>(crop.harvestEnd);
  const [icon, setIcon] = useState(crop.icon ?? DEFAULT_CROP_ICON);

  return (
    <div className="pd-edit">
      <label className="inp-field">
        <span>Naam</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="inp-field">
        <span>Ras / variëteit</span>
        <input
          value={variety}
          onChange={(e) => setVariety(e.target.value)}
          placeholder="bijv. Sparta"
        />
      </label>
      <div className="inp-row">
        <NumField label="Rijafstand" value={row} onChange={setRow} />
        <NumField label="Plantafstand" value={plant} onChange={setPlant} />
      </div>
      <label className="inp-field inp-color">
        <span>Kleur</span>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </label>
      <IconPicker value={icon} color={color} cropName={name} onChange={setIcon} />
      <MonthRangeField
        prefix="Zaaien"
        start={sowStart}
        end={sowEnd}
        onChange={(s, e) => {
          setSowStart(s);
          setSowEnd(e);
        }}
      />
      <MonthRangeField
        prefix="Oogsten"
        start={harvestStart}
        end={harvestEnd}
        onChange={(s, e) => {
          setHarvestStart(s);
          setHarvestEnd(e);
        }}
      />
      <div className="pd-edit-actions">
        <button
          disabled={!name.trim()}
          onClick={() =>
            onSave({
              name: name.trim(),
              variety: variety.trim() || undefined,
              color,
              rowSpacing: row,
              plantSpacing: plant,
              sowWindow: sowWindowText(sowStart, sowEnd),
              sowStart,
              sowEnd,
              harvestStart,
              harvestEnd,
              icon,
            })
          }
        >
          <i className="fa-solid fa-check" /> Opslaan
        </button>
        <button onClick={onCancel}><i className="fa-solid fa-xmark" /> Annuleren</button>
      </div>
    </div>
  );
}