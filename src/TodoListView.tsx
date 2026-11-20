import { useEffect, useMemo, useState } from "react";
import type { Crop, GardenElement, TodoItem } from "./types";
import { useCollapseForm } from "./useCollapseForm";
import { SheetModal } from "./SheetModal";
import { CategoryDropdown } from "./CategoryDropdown";
import { inspectorElementInVeld } from "./Inspector";

interface Props {
  items: TodoItem[];
  elements: GardenElement[];
  catalog: Crop[];
  userNames: Record<string, string>;
  currentUserId?: string;
  onAdd: (entry: Omit<TodoItem, "id" | "createdAt" | "done" | "createdBy">) => void;
  onUpdate: (id: string, patch: Partial<TodoItem>) => void;
  onRemove: (id: string) => void;
  onLocateElement: (elementId: string) => void;
}

const PRIORITIES = [
  { key: "low", label: "Laag", icon: "fa-arrow-down" },
  { key: "normal", label: "Normaal", icon: "fa-minus" },
  { key: "high", label: "Hoog", icon: "fa-arrow-up" },
] as const;

type Priority = (typeof PRIORITIES)[number]["key"];

const PRIO_WEIGHT: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

const STATUS_OPTIONS = [
  { key: "all", label: "Alles", icon: "fa-layer-group", tone: "grey" as const },
  { key: "open", label: "Open", icon: "fa-circle-dot", tone: "green" as const },
  { key: "done", label: "Afgevinkt", icon: "fa-check", tone: "cyan" as const },
];

export function TodoListView({
  items,
  elements,
  catalog,
  userNames,
  currentUserId,
  onAdd,
  onUpdate,
  onRemove,
  onLocateElement,
}: Props) {
  const sheet = useCollapseForm();
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
  const elementById = useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements]);
  const cropNameById = useMemo(() => new Map(catalog.map((c) => [c.id, c.name])), [catalog]);

  const openCount = items.filter((i) => !i.done).length;
  const doneCount = items.filter((i) => i.done).length;
  const highCount = items.filter((i) => !i.done && (i.priority ?? "normal") === "high").length;

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

  // Velden pas leegmaken als de sheet echt dicht is, zodat de sluit-animatie
  // niet met een leeg formulier te zien is.
  useEffect(() => {
    if (!sheet.mounted) resetForm();
  }, [sheet.mounted]);

  const openNew = () => {
    resetForm();
    sheet.openForm();
  };

  const startEdit = (item: TodoItem) => {
    setEditingId(item.id);
    setTitle(item.title);
    setNote(item.note ?? "");
    setPicked((item.elementIds ?? []).filter((id) => fieldName.has(id)));
    setPriority(item.priority ?? "normal");
    sheet.openForm();
  };

  const closeForm = () => {
    sheet.closeForm();
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
    if (editingId) onUpdate(editingId, payload);
    else onAdd(payload);
    closeForm();
  };

  return (
    <div className="oogst-wrap todo-page">
      <div className="oogst-head">
        <div>
          <h1 className="oogst-title">Taken</h1>
          <p className="oogst-sub">
            Wat moet er in deze tuin gebeuren? Koppel een klus optioneel aan een bed of veld.
          </p>
        </div>
        <button className="oogst-add" onClick={openNew}>
          + Taak toevoegen
        </button>
      </div>

      <div className="oogst-stats">
        <div className="oogst-stat oogst-stat-hero">
          <div className="oogst-stat-label">Open</div>
          <div className="oogst-stat-value">{openCount}</div>
        </div>
        <div className="oogst-stat">
          <div className="oogst-stat-label">Hoge prioriteit</div>
          <div className="oogst-stat-value">{highCount}</div>
        </div>
        <div className="oogst-stat">
          <div className="oogst-stat-label">Afgevinkt</div>
          <div className="oogst-stat-value">{doneCount}</div>
        </div>
      </div>

      <SheetModal
        mounted={sheet.mounted}
        open={sheet.open}
        onClose={closeForm}
        className="crop-modal"
        ariaLabel={editingId ? "Taak bewerken" : "Nieuwe taak"}
        resetKey={editingId}
      >
        <div className="sow-modal-head">
          <h3>
            <i className="fa-solid fa-list-check" aria-hidden="true" />{" "}
            {editingId ? "Taak bewerken" : "Nieuwe taak"}
          </h3>
          <button type="button" className="sow-modal-close" onClick={closeForm} aria-label="Sluiten">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div className="sow-modal-body">
          <div className="bood-form-grid">
            <div className="shop-form-field shop-form-field-wide">
              <label htmlFor="todo-title">Taak</label>
              <input
                id="todo-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Bijv. Bed 1 wieden"
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
                    <i className={`fa-solid ${p.icon}`} /> {p.label}
                  </button>
                ))}
              </div>
            </div>
            {fields.length > 0 && (
              <div className="shop-form-field shop-form-field-wide">
                <label>Bedden en velden (optioneel)</label>
                <div className="todo-fields">
                  {fields.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={`todo-field${picked.includes(f.id) ? " todo-field-active" : ""}`}
                      onClick={() => togglePicked(f.id)}
                      aria-pressed={picked.includes(f.id)}
                    >
                      <i
                        className={`fa-solid ${f.type === "bed" ? "fa-table-cells" : "fa-seedling"}`}
                      />{" "}
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="crop-modal-actions">
          <button type="button" className="btn-ghost" onClick={closeForm}>
            Annuleren
          </button>
          <button type="button" className="btn-primary" disabled={!canSave} onClick={submit}>
            <i className="fa-solid fa-check" />{" "}
            {editingId ? "Wijziging opslaan" : "Toevoegen aan lijst"}
          </button>
        </div>
      </SheetModal>

      <div className="bood-toolbar">
        <label className="oogst-search-label bood-search">
          <i className="fa-solid fa-magnifying-glass" />
          <input
            className="oogst-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoek taak of bed…"
            aria-label="Zoek taak"
          />
        </label>
        <div className="bood-filters">
          <div className="bood-statusfilter">
            <CategoryDropdown
              id="todo-status"
              noIcons
              categories={STATUS_OPTIONS}
              value={filter}
              onChange={(key) => setFilter(key as "all" | "open" | "done")}
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="oogst-card oogst-empty">
          <i className="fa-solid fa-list-check" />
          <p>
            Nog geen taken. Voeg hierboven toe wat er moet gebeuren in deze tuin.
          </p>
        </div>
      )}

      <div className="todo-list" key={filter}>
        {filtered.map((item, i) => {
          const linked = (item.elementIds ?? []).filter((id) => fieldName.has(id));
          const prio = PRIORITIES.find((p) => p.key === (item.priority ?? "normal")) ?? PRIORITIES[1];
          const author = item.createdBy ? userNames[item.createdBy] : undefined;
          return (
            <article
              key={item.id}
              style={{ animationDelay: `${Math.min(i, 11) * 30}ms` }}
              className={`todo-card todo-card-${prio.key}${item.done ? " is-done" : ""}`}
            >
              <button
                type="button"
                className={`todo-check${item.done ? " is-done" : ""}`}
                onClick={() => onUpdate(item.id, { done: !item.done })}
                title={item.done ? "Terugzetten naar open" : "Afvinken"}
                aria-label={item.done ? "Terugzetten naar open" : "Afvinken"}
                aria-pressed={item.done}
              >
                <i className="fa-solid fa-check" aria-hidden="true" />
              </button>

              <div className="todo-card-main">
                <h3 className="todo-card-title">{item.title}</h3>
                {item.note && <p className="todo-card-note">{item.note}</p>}
                {(linked.length > 0 || author) && (
                  <div className="todo-card-meta">
                    {linked.map((id) => {
                      const el = elementById.get(id);
                      const label = fieldName.get(id) ?? "";
                      const kind = el?.type === "veld" ? "Veld" : "Bed";
                      const parentVeld =
                        el && el.type === "bed"
                          ? elements.find(
                              (v) =>
                                v.type === "veld" &&
                                v.id !== el.id &&
                                inspectorElementInVeld(el, v)
                            )
                          : undefined;
                      const cropNames = Array.from(
                        new Set(
                          (el?.crops ?? [])
                            .map((c) => cropNameById.get(c.cropId))
                            .filter((name): name is string => !!name)
                        )
                      );
                      const shownCrops = cropNames.filter(
                        (name) => name.toLowerCase() !== label.toLowerCase()
                      );
                      return (
                        <button
                          key={id}
                          type="button"
                          className="todo-place"
                          onClick={() => onLocateElement(id)}
                          aria-label={`Ga naar ${kind.toLowerCase()} ${label}${
                            parentVeld ? ` in veld ${parentVeld.label}` : ""
                          }${cropNames.length > 0 ? `, gewas ${cropNames.join(", ")}` : ""}`}
                          title={`Ga naar ${kind.toLowerCase()} ${label}${
                            parentVeld ? ` in veld ${parentVeld.label}` : ""
                          }${cropNames.length > 0 ? ` (${cropNames.join(", ")})` : ""} in de tuin`}
                        >
                          <i
                            className={`fa-solid ${
                              el?.type === "veld" ? "fa-border-all" : "fa-location-dot"
                            } todo-place-pin`}
                            aria-hidden="true"
                          />
                          <span className="todo-place-name">{label}</span>
                          {parentVeld && (
                            <span className="todo-place-field">in {parentVeld.label}</span>
                          )}
                          {shownCrops.length > 0 && (
                            <span className="todo-place-crop">
                              <i className="fa-solid fa-seedling" aria-hidden="true" />
                              {shownCrops.join(", ")}
                            </span>
                          )}
                          <i className="fa-solid fa-chevron-right todo-place-go" aria-hidden="true" />
                        </button>
                      );
                    })}
                    {author && (
                      <span
                        className={`shop-card-assignee${
                          item.createdBy === currentUserId ? " is-self" : ""
                        }`}
                        title={
                          item.createdBy === currentUserId
                            ? `Door jou (${author})`
                            : `Aangemaakt door ${author}`
                        }
                      >
                        <span className="shop-card-assignee-avatar" aria-hidden="true">
                          {(author.trim()[0] ?? "?").toUpperCase()}
                        </span>
                        <span className="shop-card-assignee-name">
                          <span className="shop-card-assignee-label">van</span>
                          <strong>
                            {item.createdBy === currentUserId ? "jou" : author}
                          </strong>
                        </span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="todo-card-side">
                <span className={`todo-prio todo-prio-${prio.key}`}>
                  <i className={`fa-solid ${prio.icon}`} aria-hidden="true" /> {prio.label}
                </span>
                <div className="todo-card-actions">
                  <button
                    type="button"
                    className="todo-card-action"
                    onClick={() => startEdit(item)}
                    title="Bewerken"
                    aria-label="Taak bewerken"
                  >
                    <i className="fa-solid fa-pen" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="todo-card-action todo-card-action-danger"
                    onClick={() => onRemove(item.id)}
                    title="Verwijderen"
                    aria-label="Taak verwijderen"
                  >
                    <i className="fa-solid fa-trash" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
