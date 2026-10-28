import { useMemo, useState } from "react";
import type { Crop } from "./types";
import type { Theme } from "./useTheme";
import { ThemeToggle } from "./ThemeToggle";
import { CropGlyph } from "./CropIconPicker";
import { cropLabel } from "./cropIcons";
import { seasonLabel } from "./sowing";
import { useCollapseForm } from "./useCollapseForm";
import { CropFormModal } from "./CropFormModal";

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
  const [q, setQ] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editCrop, setEditCrop] = useState<Crop | null>(null);
  const sheet = useCollapseForm();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return catalog;
    return catalog.filter(
      (c) =>
        cropLabel(c).toLowerCase().includes(s) ||
        (c.sowWindow ?? "").toLowerCase().includes(s)
    );
  }, [catalog, q]);

  const openNew = () => {
    setEditCrop(null);
    sheet.openForm();
  };
  const openEdit = (crop: Crop) => {
    setEditCrop(crop);
    sheet.openForm();
  };
  const save = (data: Omit<Crop, "id">) => {
    if (editCrop) onUpdate(editCrop.id, data);
    else onAdd(data);
    sheet.closeForm();
  };

  return (
    <>
      <div className="pd-head">
        <div>
          <h1 className="cal-title">Gewassen</h1>
          <p className="pd-sub">Jouw gewassen, zaaiperiodes en oogstmomenten.</p>
        </div>
      </div>

      <div className="pd-toolbar">
        <input
          className="cal-search pd-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek gewas…"
          aria-label="Zoek gewas"
        />
        <button className="btn-primary" onClick={openNew}>
          <i className="fa-solid fa-plus" /> Nieuw gewas
        </button>
      </div>

      <CropFormModal
        mounted={sheet.mounted}
        open={sheet.open}
        crop={editCrop}
        onClose={sheet.closeForm}
        onSave={save}
      />

      <section className="cal-panel">
        <div className="cal-panel-head">
          <h3 className="cal-h">
            Gewassen
            <span className="cal-n">{filtered.length}</span>
          </h3>
        </div>
        <div className="pd-rows">
        {filtered.length === 0 && (
          <p className="gl-empty">
            Geen gewassen gevonden. Voeg een nieuw gewas toe om te beginnen.
          </p>
        )}
        {filtered.map((c) => (
          <article key={c.id} className="pd-card">
            <div className="pd-card-view">
              <span className="pd-card-icon">
                <CropGlyph
                  iconKey={c.icon}
                  cropName={c.name}
                  label={c.name}
                  className="crop-icon pd-icon"
                  color={c.color}
                />
              </span>
              <div className="pd-card-main">
                <div className="pd-card-title">{cropLabel(c)}</div>
                <div className="pd-card-meta">
                  rij {c.rowSpacing.toFixed(2)} m · plant {c.plantSpacing.toFixed(2)} m
                  {seasonLabel(c) ? ` · ${seasonLabel(c)}` : ""}
                </div>
              </div>
              <div className="pd-card-actions">
                <button
                  onClick={() => openEdit(c)}
                  title={`Bewerken: ${cropLabel(c)}`}
                  aria-label={`Bewerken: ${cropLabel(c)}`}
                >
                  <i className="fa-solid fa-pen" />
                </button>
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
                    <i className="fa-solid fa-trash" />
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
        </div>
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
    <div className="cal-page pd-page">
      <div className="pd-head">
        <div>
          <h1 className="cal-title">Gewassen</h1>
          <p className="pd-sub">Jouw gewassen, zaaiperiodes en oogstmomenten.</p>
        </div>
        <div className="pd-head-actions">
          <span className="pd-count-pill">{catalog.length} gewassen</span>
          <button className="btn-ghost" onClick={onBack}>
            <i className="fa-solid fa-arrow-left" /> Tuinen
          </button>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </div>

      <PlantCatalog
        catalog={catalog}
        onAdd={onAdd}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    </div>
  );
}
