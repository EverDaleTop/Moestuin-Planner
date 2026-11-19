import { useMemo, useState } from "react";
import type { ShoppingItem } from "./types";
import { useCollapseForm } from "./useCollapseForm";
import { lineTotal, parseQty } from "./shopping";
import { EXPENSE_CATEGORIES, categoryByKey } from "./expenseCategories";
import { CategoryDropdown } from "./CategoryDropdown";
import { ShoppingFormModal, type ShopMember } from "./ShoppingFormModal";
import { ConfirmModal } from "./ConfirmModal";

interface Props {
  items: ShoppingItem[];
  /** deelnemers van de tuin (eigenaar + gedeeld met) */
  members: ShopMember[];
  currentUserId?: string;
  onAdd: (entry: Omit<ShoppingItem, "id" | "createdAt" | "done">) => void;
  onUpdate: (id: string, patch: Partial<ShoppingItem>) => void;
  onRemove: (id: string) => void;
  /** Afvinken zet het product ook als uitgave op de Uitgaven-pagina. */
  onToggleDone?: (item: ShoppingItem, done: boolean) => void;
}

function fmtEuro(v: number): string {
  return `€${v.toFixed(2).replace(".", ",")}`;
}

function normalizeUrl(url: string): string {
  const t = url.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export function ShoppingListView({ items, members, currentUserId, onAdd, onUpdate, onRemove, onToggleDone }: Props) {
  const sheet = useCollapseForm();
  const [editEntry, setEditEntry] = useState<ShoppingItem | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "done">("all");
  const [catFilter, setCatFilter] = useState("");
  const [memberFilter, setMemberFilter] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ShoppingItem | null>(null);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);
  const assigneeName = (item: ShoppingItem) =>
    item.assigneeId ? (memberById.get(item.assigneeId) ?? null) : null;

  const toggleDone = (item: ShoppingItem) => {
    const next = !item.done;
    onUpdate(item.id, { done: next });
    onToggleDone?.(item, next);
  };

  const openCount = items.filter((i) => !i.done).length;
  const doneCount = items.filter((i) => i.done).length;
  // meegerekend met aantal: 3 zakken van €4,50 = €13,50
  const totalOpen = items.filter((i) => !i.done).reduce((s, i) => s + lineTotal(i), 0);

  const usedCats = useMemo(() => {
    const keys = new Set(items.map((i) => (i.category ? categoryByKey(i.category).key : "")));
    keys.delete("");
    return EXPENSE_CATEGORIES.filter((c) => keys.has(c.key));
  }, [items]);
  const filterCats = useMemo(
    () => [{ key: "", label: "Alle categorieën", icon: "fa-layer-group", tone: "grey" }, ...usedCats],
    [usedCats]
  );
  const statusOptions = useMemo(
    () => [
      { key: "all", label: "Alles", icon: "fa-layer-group", tone: "grey" },
      { key: "open", label: "Open", icon: "fa-circle-dot", tone: "green" },
      { key: "done", label: "Afgevinkt", icon: "fa-check", tone: "cyan" },
    ],
    []
  );
  const memberOptions = useMemo(
    () => [
      { key: "", label: "Iedereen", icon: "fa-user-group", tone: "grey" },
      ...members.map((m) => ({
        key: m.id,
        label: m.id === currentUserId ? `${m.name} (jij)` : m.name,
        icon: "fa-user",
        tone: "green",
      })),
    ],
    [members, currentUserId]
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = [...items];
    if (filter === "open") list = list.filter((i) => !i.done);
    if (filter === "done") list = list.filter((i) => i.done);
    if (catFilter) list = list.filter((i) => i.category && categoryByKey(i.category).key === catFilter);
    if (memberFilter) list = list.filter((i) => i.assigneeId === memberFilter);
    if (s) {
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(s) ||
          (i.note ?? "").toLowerCase().includes(s) ||
          (i.url ?? "").toLowerCase().includes(s) ||
          (memberById.get(i.assigneeId ?? "") ?? "").toLowerCase().includes(s)
      );
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }, [items, q, filter, catFilter, memberFilter, memberById]);

  const openNew = () => {
    setEditEntry(null);
    sheet.openForm();
  };
  const startEdit = (item: ShoppingItem) => {
    setEditEntry(item);
    sheet.openForm();
  };
  const closeForm = () => {
    setEditEntry(null);
    sheet.closeForm();
  };
  const saveForm = (data: Omit<ShoppingItem, "id" | "createdAt" | "done">) => {
    if (editEntry) onUpdate(editEntry.id, data);
    else onAdd(data);
    closeForm();
  };

  /** Productkaart: klik opent de productpagina (als die er is). */
  const openProduct = (item: ShoppingItem) => {
    if (!item.url) return;
    window.open(normalizeUrl(item.url), "_blank", "noopener,noreferrer");
  };

  /** Bewerken gaat via de expliciete potloodknop op de kaart. */
  return (
    <div className="oogst-wrap bood-page">
      <div className="oogst-head">
        <div>
          <h1 className="oogst-title">Boodschappen</h1>
          <p className="oogst-sub">Plak een productlink en haal titel, prijs en afbeelding automatisch op.</p>
        </div>
        <button className="oogst-add" onClick={openNew}>
          + Product toevoegen
        </button>
      </div>

      <div className="oogst-stats">
        <div className="oogst-stat oogst-stat-hero">
          <div className="oogst-stat-label">Open</div>
          <div className="oogst-stat-value">{openCount}</div>
        </div>
        <div className="oogst-stat">
          <div className="oogst-stat-label">Afgevinkt</div>
          <div className="oogst-stat-value">{doneCount}</div>
        </div>
        <div className="oogst-stat">
          <div className="oogst-stat-label">Verwacht totaal</div>
          <div className="oogst-stat-value">{fmtEuro(totalOpen)}</div>
        </div>
      </div>

      <ShoppingFormModal
        mounted={sheet.mounted}
        open={sheet.open}
        edit={editEntry}
        members={members}
        currentUserId={currentUserId}
        onClose={closeForm}
        onSave={saveForm}
      />

      <div className="bood-toolbar">
        <label className="oogst-search-label bood-search">
          <i className="fa-solid fa-magnifying-glass" />
          <input
            className="oogst-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoek product…"
            aria-label="Zoek product"
          />
        </label>
        <div className="bood-filters">
        {usedCats.length > 0 && (
          <div className="bood-catfilter">
            <CategoryDropdown
              id="bood-catfilter"
              noIcons
              categories={filterCats}
              value={catFilter}
              onChange={setCatFilter}
            />
          </div>
        )}
        <div className="bood-statusfilter">
          <CategoryDropdown
            id="bood-statusfilter"
            noIcons
            categories={statusOptions}
            value={filter}
            onChange={(key) => setFilter(key as "all" | "open" | "done")}
          />
        </div>
        {members.length > 1 && (
        <div className="bood-statusfilter">
          <CategoryDropdown
            id="bood-memberfilter"
            noIcons
            categories={memberOptions}
            value={memberFilter}
            onChange={setMemberFilter}
          />
        </div>
        )}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="oogst-card oogst-empty">
          <i className="fa-solid fa-cart-shopping" />
          <p>
            Nog niets op de lijst. Voeg hierboven een product toe, plak er een linkje bij en vink af wat je al
            hebt.
          </p>
        </div>
      )}

      {/* key op de filter: bij een filterwissel her-mounten de kaarten, zodat
          ze netjes in-faden (stagger) i.p.v. ineens te verspringen. */}
      <div className="shop-grid" key={`${filter}-${catFilter}-${memberFilter}`}>
        {filtered.map((item, i) => (
          <div
            key={item.id}
            style={{ animationDelay: `${Math.min(i, 11) * 35}ms` }}
            className={`shop-card ${item.done ? "shop-card-done" : ""}${item.url ? " shop-card-clickable" : ""}`}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a, button, input")) return;
              openProduct(item);
            }}
            role={item.url ? "link" : undefined}
            tabIndex={item.url ? 0 : undefined}
            onKeyDown={(e) => {
              if (item.url && e.key === "Enter") openProduct(item);
            }}
            aria-label={item.url ? `${item.title} openen bij de winkel` : undefined}
          >
            {item.imageUrl && (
            <div className="shop-card-media">
              <img src={item.imageUrl} alt="" loading="lazy" />
              {item.source && <span className="shop-card-source">{item.source}</span>}
              <div className="shop-card-tools" onClick={(e) => e.stopPropagation()}>
                {item.url && (
                  <a
                    className="shop-card-tool"
                    href={normalizeUrl(item.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open productlink"
                  >
                    <i className="fa-solid fa-up-right-from-square" />
                  </a>
                )}
                <button className="shop-card-tool" onClick={() => startEdit(item)} title="Bewerken">
                  <i className="fa-solid fa-pen" />
                </button>
                <button
                  className="shop-card-tool shop-card-tool-danger"
                  onClick={() => setPendingDelete(item)}
                  title="Verwijderen"
                >
                  <i className="fa-solid fa-trash" />
                </button>
              </div>
            </div>
            )}
            <div className="shop-card-body">
              {item.category && (
                <span
                  className={`shop-card-eyebrow shop-card-cat-${categoryByKey(item.category).tone}`}
                >
                  <i className={`fa-solid ${categoryByKey(item.category).icon}`} />
                  {categoryByKey(item.category).label}
                </span>
              )}
              <div className="shop-card-title">
                {item.url ? (
                  <a
                    href={normalizeUrl(item.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={item.url}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {item.title}
                  </a>
                ) : (
                  item.title
                )}
              </div>
              {(() => {
                const name = assigneeName(item);
                const self = item.assigneeId === currentUserId;
                if (!name) return null;
                return (
                  <div className="shop-card-meta">
                    <span
                      className={`shop-card-assignee${self ? " is-self" : ""}`}
                      title={self ? `Voor jou (${name})` : `Voor ${name}`}
                    >
                      <span className="shop-card-assignee-avatar" aria-hidden="true">
                        {(name.trim()[0] ?? "?").toUpperCase()}
                      </span>
                      <span className="shop-card-assignee-name">
                        <span className="shop-card-assignee-label">Voor</span>
                        <strong>{self ? "jou" : name}</strong>
                      </span>
                    </span>
                  </div>
                );
              })()}
              {item.note && <div className="shop-card-note">{item.note}</div>}
              <div className="shop-card-foot">
                <div className="shop-card-prices">
                  {(() => {
                    const qtyN = parseQty(item.quantity);
                    const price = item.price ?? 0;
                    const hasPrice = price > 0;
                    if (hasPrice) {
                      return (
                        <>
                          <span className="shop-card-price">{fmtEuro(lineTotal(item))}</span>
                          {qtyN >= 1 && (
                            <span className="shop-card-sub">
                              {item.quantity} × {fmtEuro(price)}
                            </span>
                          )}
                        </>
                      );
                    }
                    return null;
                  })()}
                </div>
                {!item.imageUrl && (
                  <span className="shop-card-minitools" onClick={(e) => e.stopPropagation()}>
                    {item.url && (
                      <a
                        className="shop-card-minitool"
                        href={normalizeUrl(item.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open productlink"
                      >
                        <i className="fa-solid fa-up-right-from-square" />
                      </a>
                    )}
                    <button className="shop-card-minitool" onClick={() => startEdit(item)} title="Bewerken">
                      <i className="fa-solid fa-pen" />
                    </button>
                    <button
                      className="shop-card-minitool shop-card-minitool-danger"
                      onClick={() => setPendingDelete(item)}
                      title="Verwijderen"
                    >
                      <i className="fa-solid fa-trash" />
                    </button>
                  </span>
                )}
                <button
                  className={`shop-card-check${item.done ? " shop-card-check-done" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDone(item);
                  }}
                  title={
                    item.done
                      ? "Terugzetten naar open — uitgave wordt verwijderd"
                      : "Afvinken — komt op de Uitgaven-pagina"
                  }
                  aria-pressed={item.done}
                  aria-label={item.done ? "Terugzetten naar open" : "Afvinken"}
                >
                  <i className="fa-solid fa-check" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <ConfirmModal
        open={pendingDelete !== null}
        title="Product verwijderen?"
        message={
          pendingDelete ? (
            <>
              Weet je zeker dat je <strong>{pendingDelete.title}</strong> van de boodschappenlijst wilt
              verwijderen? Dit kan niet ongedaan worden gemaakt.
            </>
          ) : (
            ""
          )
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) onRemove(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
