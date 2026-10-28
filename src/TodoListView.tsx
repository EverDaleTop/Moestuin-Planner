import { useMemo, useState } from "react";
import type { GardenElement, TodoItem } from "./types";
import { useCollapseForm } from "./useCollapseForm";

interface Props {
  items: TodoItem[];
  elements: GardenElement[];
  userNames: Record<string, string>;
  onAdd: (entry: Omit<TodoItem, "id" | "createdAt" | "done" | "createdBy">) => void;
  onUpdate: (id: string, patch: Partial<TodoItem>) => void;
  onRemove: (id: string) => void;
}

const PRIORITIES = [
  { key: "low", label: "Laag", icon: "fa-arrow-down" },
  { key: "normal", label: "Normaal", icon: "fa-minus" },
  { key: "high", label: "Hoog", icon: "fa-arrow-up" },
] as const;

type Priority = (typeof PRIORITIES)[number]["key"];

const PRIO_WEIGHT: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

export function TodoListView({ items, elements, userNames, onAdd, onUpdate, onRemove }: Props) {
  const form = useCollapseForm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "done">("all");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [priority, setPriority] = useState<Priority>("normal");

  const fields = useMemo(
    () =>
      elements
        .filter((e) => e.type === "bed" || e.type === "veld")
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label, "nl")),
    [elements]
  );
  const fieldName = useMemo(() => new Map(fields.map((f) => [f.id, f.label])), [fields]);

  const openCount = items.filter((i) => !i.done).length;
  const doneCount = items.filter((i) => i.done).length;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = [...items];
    if (filter === "open") list = list.filter((i) => !i.done);
    if (filter === "done") list = list.filter((i) => i.done);
    if (s) {
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(s) ||
          (i.note ?? "").toLowerCase().includes(s) ||
          (i.elementIds ?? []).some((id) => (fieldName.get(id) ?? "").toLowerCase().includes(s))
      );
    }
    return list.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const pa = PRIO_WEIGHT[a.priority ?? "normal"];
      const pb = PRIO_WEIGHT[b.priority ?? "normal"];
      if (pa !== pb) return pa - pb;
      return b.createdAt - a.createdAt;
    });
  }, [items, q, filter, fieldName]);

  const resetForm = () => {
    setTitle("");
    setNote("");
    setPicked([]);
    setPriority("normal");
    setEditingId(null);
  };

  const startEdit = (item: TodoItem) => {
    setEditingId(item.id);
    setTitle(item.title);
    setNote(item.note ?? "");
    setPicked((item.elementIds ?? []).filter((id) => fieldName.has(id)));
    setPriority(item.priority ?? "normal");
    form.openForm();
  };

  const togglePicked = (id: string) => {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const canSave = title.trim().length > 0;

  const submit = () => {
    if (!canSave) return;
    const payload = {
      title: title.trim(),
      note: note.trim() || undefined,
      elementIds: picked.length > 0 ? [...picked] : undefined,
      priority,
    };
    if (editingId) {
      onUpdate(editingId, payload);
    } else {
      onAdd(payload);
    }
    resetForm();
    form.closeForm();
  };

  return (
    <div className="shop-page todo-page">
      <div className="shop-hero">
        <div className="shop-hero-text">
          <h2>
            <i className="fa-solid fa-list-check" /> Taken
          </h2>
          <p>Wat moet er in deze tuin gebeuren? Koppel een klus optioneel aan één of meer bedden of velden.</p>
        </div>
        <button
          className="btn-primary shop-add-btn"
          onClick={() => {
            if (form.open) {
              resetForm();
              form.closeForm();
            } else {
              resetForm();
              form.openForm();
            }
          }}
        >
          {form.open ? (
            <>
              <i className="fa-solid fa-xmark" /> Annuleren
            </>
          ) : (
            <>
              <i className="fa-solid fa-plus" /> Taak toevoegen
            </>
          )}
        </button>
      </div>

      <div className="shop-stats">
        <div className="shop-stat">
          <div className="shop-stat-icon shop-stat-icon-open">
            <i className="fa-solid fa-list-check" />
          </div>
          <div className="shop-stat-info">
            <span className="shop-stat-value">{openCount}</span>
            <span className="shop-stat-label">Open</span>
          </div>
        </div>
        <div className="shop-stat">
          <div className="shop-stat-icon shop-stat-icon-done">
            <i className="fa-solid fa-check" />
          </div>
          <div className="shop-stat-info">
            <span className="shop-stat-value">{doneCount}</span>
            <span className="shop-stat-label">Afgevinkt</span>
          </div>
        </div>
      </div>

      {form.mounted && (
        <div ref={form.formRef} className={`shop-form ${form.open ? "" : "shop-form-closing"}`}>
          <div className="shop-form-inner">
            <div className="shop-form-panel">
              <div className="shop-form-grid">
                <div className="shop-form-field shop-form-field-wide">
                  <label htmlFor="todo-title">Taak</label>
                  <input
                    id="todo-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    placeholder="Bijv. Bed 1 wieden"
                    autoFocus
                  />
                </div>
                <div className="shop-form-field shop-form-field-wide">
                  <label htmlFor="todo-note">Notitie (optioneel)</label>
                  <input
                    id="todo-note"
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Bijv. eerst compost halen"
                  />
                </div>
                <div className="shop-form-field shop-form-field-wide">
                  <label>Prioriteit</label>
                  <div className="todo-fields" role="group" aria-label="Prioriteit">
                    {PRIORITIES.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        className={`todo-field${priority === p.key ? " todo-field-active" : ""}`}
                        onClick={() => setPriority(p.key)}
                        aria-pressed={priority === p.key}
                      >
                        <i className={`fa-solid ${p.icon}`} />
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                {fields.length > 0 && (
                  <div className="shop-form-field shop-form-field-wide">
                    <label>Velden (optioneel)</label>
                    <div className="todo-fields">
                      {fields.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className={`todo-field${picked.includes(f.id) ? " todo-field-active" : ""}`}
                          onClick={() => togglePicked(f.id)}
                          aria-pressed={picked.includes(f.id)}
                        >
                          <i className={`fa-solid ${f.type === "bed" ? "fa-table-cells" : "fa-seedling"}`} />
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="shop-form-footer">
                <button className="btn-primary" onClick={submit} disabled={!canSave}>
                  <i className="fa-solid fa-check" /> {editingId ? "Wijziging opslaan" : "Toevoegen aan lijst"}
                </button>
                {editingId && (
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      resetForm();
                      form.closeForm();
                    }}
                  >
                    <i className="fa-solid fa-xmark" /> Annuleren
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="shop-toolbar">
        <div className="shop-search">
          <i className="fa-solid fa-magnifying-glass" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoek taak of veld…"
            aria-label="Zoek taak"
          />
        </div>
        <div className="shop-filters" role="group" aria-label="Filter">
          <button
            className={`shop-filter ${filter === "all" ? "shop-filter-active" : ""}`}
            onClick={() => setFilter("all")}
          >
            Alles
          </button>
          <button
            className={`shop-filter ${filter === "open" ? "shop-filter-active" : ""}`}
            onClick={() => setFilter("open")}
          >
            Open
          </button>
          <button
            className={`shop-filter ${filter === "done" ? "shop-filter-active" : ""}`}
            onClick={() => setFilter("done")}
          >
            Afgevinkt
          </button>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="shop-empty">
          <i className="fa-solid fa-list-check" />
          <p>Nog geen taken. Voeg hierboven toe wat er moet gebeuren in deze tuin.</p>
        </div>
      )}

      <div className="todo-list">
        {filtered.map((item, i) => {
          const linked = (item.elementIds ?? []).filter((id) => fieldName.has(id));
          const prio = PRIORITIES.find((p) => p.key === (item.priority ?? "normal")) ?? PRIORITIES[1];
          const author = item.createdBy ? userNames[item.createdBy] : undefined;
          const showMeta = prio.key === "high" || linked.length > 0 || author;
          return (
            <div
              key={item.id}
              style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
              className={`todo-card${item.done ? " todo-card-done" : ""}`}
            >  <button
                className={`shop-card-check${item.done ? " shop-card-check-done" : ""}`}
                onClick={() => onUpdate(item.id, { done: !item.done })}
                title={item.done ? "Terugzetten naar open" : "Afvinken"}
                aria-label={item.done ? "Terugzetten naar open" : "Afvinken"}
                aria-pressed={item.done}
              >
                <i className="fa-solid fa-check" />
              </button>
              <div className="todo-main">
                <div className="todo-title">{item.title}</div>
                {item.note && <div className="todo-note">{item.note}</div>}
                {showMeta && (
                  <div className="todo-meta">
                    {prio.key === "high" && (
                      <span className="todo-prio todo-prio-high">
                        <i className={`fa-solid ${prio.icon}`} /> {prio.label}
                      </span>
                    )}
                    {linked.map((id) => (
                      <span key={id} className="todo-chip">
                        <i className="fa-solid fa-location-dot" /> {fieldName.get(id)}
                      </span>
                    ))}
                    {author && <span className="todo-author">van {author}</span>}
                  </div>
                )}
              </div>
              <div className="todo-actions">
                <button className="shop-card-action" onClick={() => startEdit(item)} title="Bewerken">
                  <i className="fa-solid fa-pen" />
                </button>
                <button
                  className="shop-card-action shop-card-action-danger"
                  onClick={() => onRemove(item.id)}
                  title="Verwijderen"
                >
                  <i className="fa-solid fa-trash" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
