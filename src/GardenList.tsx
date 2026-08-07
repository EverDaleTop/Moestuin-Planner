import { useState } from "react";
import type { Garden } from "./types";
import type { Theme } from "./useTheme";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  gardens: Garden[];
  theme: Theme;
  onToggleTheme: () => void;
  onOpen: (id: string) => void;
  onAdd: (name: string) => void;
  onDelete: (id: string) => void;
}

export function GardenList({ gardens, theme, onToggleTheme, onOpen, onAdd, onDelete }: Props) {
  const [name, setName] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName("");
  };

  return (
    <div className="gl-wrap">
      <header className="gl-header">
        <div className="gl-header-top">
          <div>
            <h1>🥕 Moestuin Planner</h1>
            <p>Plan je moestuinen, bedden en paden in meters.</p>
          </div>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
      </header>

      <section className="gl-new">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Naam van de nieuwe tuin…"
          aria-label="Tuinnaam"
        />
        <button onClick={submit} disabled={!name.trim()}>
          Tuin toevoegen
        </button>
      </section>

      <section className="gl-list">
        {gardens.length === 0 && (
          <p className="gl-empty">
            Nog geen tuinen. Voeg je eerste tuin toe om te beginnen.
          </p>
        )}
        {gardens.map((g) => (
          <div key={g.id} className="gl-card" onClick={() => onOpen(g.id)}>
            <div className="gl-card-main">
              <div className="gl-card-title">{g.name}</div>
              <div className="gl-card-meta">
                {g.elements.filter((e) => e.type === "bed").length} bedden ·{" "}
                {g.elements.filter((e) => e.type === "path").length} paden ·{" "}
                {new Date(g.createdAt).toLocaleDateString("nl-NL")}
              </div>
            </div>
            <div className="gl-card-actions">
              {confirmId === g.id ? (
                <>
                  <span className="gl-confirm">Verwijderen?</span>
                  <button
                    className="btn-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(g.id);
                      setConfirmId(null);
                    }}
                  >
                    Ja
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmId(null);
                    }}
                  >
                    Nee
                  </button>
                </>
              ) : (
                <button
                  className="btn-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmId(g.id);
                  }}
                  title="Tuin verwijderen"
                >
                  🗑
                </button>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}