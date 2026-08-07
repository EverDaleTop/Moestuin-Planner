import { useMemo, useState } from "react";
import type { Crop } from "./types";
import type { Theme } from "./useTheme";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  catalog: Crop[];
  gardenCount: number;
  theme: Theme;
  onToggleTheme: () => void;
  onBack: () => void;
  onAdd: (crop: Omit<Crop, "id">) => void;
  onUpdate: (cropId: string, patch: Partial<Crop>) => void;
  onDelete: (cropId: string) => void;
}

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
  color: "#7c9a6d",
  rowSpacing: 0.3,
  plantSpacing: 0.2,
  sowWindow: "",
};

export function PlantDatabase({
  catalog,
  gardenCount,
  theme,
  onToggleTheme,
  onBack,
  onAdd,
  onUpdate,
  onDelete,
}: Props) {
  const [form, setForm] = useState(BLANK);
  const [showForm, setShowForm] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return catalog;
    return catalog.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        (c.sowWindow ?? "").toLowerCase().includes(s)
    );
  }, [catalog, q]);

  const canSave = form.name.trim().length > 0;

  const submit = () => {
    if (!canSave) return;
    onAdd({ ...form, name: form.name.trim() });
    setForm(BLANK);
    setShowForm(false);
  };

  return (
    <div className="gl-wrap">
      <header className="gl-header">
        <div className="gl-header-top">
          <div>
            <button className="btn-ghost pd-back" onClick={onBack}>
              ← Tuinen
            </button>
            <h1>🌱 Gewassen</h1>
            <p>
              Gedeelde plantendatabase · beschikbaar in al je{" "}
              <strong>{gardenCount}</strong> tuin{gardenCount === 1 ? "" : "en"}.
            </p>
          </div>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
        <nav className="gl-nav">
          <button className="nav-tab" onClick={onBack}>Tuinen</button>
          <button className="nav-tab nav-active" disabled>Gewassen</button>
        </nav>
      </header>

      <div className="pd-toolbar">
        <input
          className="pd-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek gewas…"
        />
        <button
          className="btn-primary"
          onClick={() => setShowForm((s) => !s)}
        >
          {showForm ? "Sluiten" : "+ Nieuw gewas"}
        </button>
      </div>

      {showForm && (
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
          <label className="inp-field">
            <span>Zaaivenster (optioneel)</span>
            <input
              value={form.sowWindow ?? ""}
              onChange={(e) => setForm({ ...form, sowWindow: e.target.value })}
              placeholder="bijv. mrt–jun"
            />
          </label>
          <button disabled={!canSave} className="btn-block" onClick={submit}>
            Opslaan
          </button>
        </section>
      )}

      <section className="pd-list">
        {filtered.length === 0 && (
          <p className="gl-empty">
            Geen gewassen gevonden. Voeg een nieuw gewas toe om te beginnen.
          </p>
        )}
        {filtered.map((c) => {
          const editing = editingId === c.id;
          return (
            <div key={c.id} className="pd-card">
              {editing ? (
                <EditRow
                  crop={c}
                  onSave={(patch) => {
                    onUpdate(c.id, patch);
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  <span className="crop-dot pd-dot" style={{ background: c.color }} />
                  <div className="pd-card-main">
                    <div className="pd-card-title">{c.name}</div>
                    <div className="pd-card-meta">
                      rij {c.rowSpacing.toFixed(2)} m · plant {c.plantSpacing.toFixed(2)} m
                      {c.sowWindow ? ` · zaai ${c.sowWindow}` : ""}
                    </div>
                  </div>
                  <div className="pd-card-actions">
                    <button onClick={() => setEditingId(c.id)}>Bewerken</button>
                    {confirmId === c.id ? (
                      <>
                        <span className="gl-confirm">Verwijderen?</span>
                        <button
                          className="btn-danger"
                          onClick={() => {
                            onDelete(c.id);
                            setConfirmId(null);
                          }}
                        >
                          Ja
                        </button>
                        <button onClick={() => setConfirmId(null)}>Nee</button>
                      </>
                    ) : (
                      <button
                        className="btn-danger"
                        onClick={() => setConfirmId(c.id)}
                        title="Gewas verwijderen"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </section>
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
  const [color, setColor] = useState(crop.color);
  const [row, setRow] = useState(crop.rowSpacing);
  const [plant, setPlant] = useState(crop.plantSpacing);
  const [sow, setSow] = useState(crop.sowWindow ?? "");

  return (
    <div className="pd-edit">
      <label className="inp-field">
        <span>Naam</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="inp-row">
        <NumField label="Rijafstand" value={row} onChange={setRow} />
        <NumField label="Plantafstand" value={plant} onChange={setPlant} />
      </div>
      <label className="inp-field inp-color">
        <span>Kleur</span>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </label>
      <label className="inp-field">
        <span>Zaaperiode</span>
        <input value={sow} onChange={(e) => setSow(e.target.value)} />
      </label>
      <div className="pd-edit-actions">
        <button
          disabled={!name.trim()}
          onClick={() => onSave({ name: name.trim(), color, rowSpacing: row, plantSpacing: plant, sowWindow: sow.trim() || undefined })}
        >
          Opslaan
        </button>
        <button onClick={onCancel}>Annuleren</button>
      </div>
    </div>
  );
}