import { useMemo, useState } from "react";
import type { ShoppingItem } from "./types";
import { api } from "./api";
import { useCollapseForm } from "./useCollapseForm";
import { lineTotal, parseQty } from "./shopping";
import { EXPENSE_CATEGORIES, categoryByKey } from "./expenseCategories";

interface Props {
  items: ShoppingItem[];
  onAdd: (entry: Omit<ShoppingItem, "id" | "createdAt" | "done">) => void;
  onUpdate: (id: string, patch: Partial<ShoppingItem>) => void;
  onRemove: (id: string) => void;
  /** Afvinken zet het product ook als uitgave op de Uitgaven-pagina. */
  onToggleDone?: (item: ShoppingItem, done: boolean) => void;
}

function fmtEuro(v: number): string {
  return `€${v.toFixed(2)}`;
}

function normalizeUrl(url: string): string {
  const t = url.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export function ShoppingListView({ items, onAdd, onUpdate, onRemove, onToggleDone }: Props) {
  const form = useCollapseForm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "done">("all");

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [source, setSource] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0].key);
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState("");

  const toggleDone = (item: ShoppingItem) => {
    const next = !item.done;
    onUpdate(item.id, { done: next });
    onToggleDone?.(item, next);
  };

  const fetchFromUrl = async () => {
    const u = normalizeUrl(url);
    if (!u) {
      setFetchMsg("Plak eerst een productlink.");
      return;
    }
    setFetching(true);
    setFetchMsg("");
    try {
      const info = await api.previewLink(u);
      let filled = 0;
      if (info.title && !title.trim()) { setTitle(info.title); filled++; }
      if (info.price !== undefined && !price) { setPrice(String(info.price)); filled++; }
      if (info.description && !note.trim()) { setNote(info.description); filled++; }
      if (info.image) { setImageUrl(info.image); filled++; }
      if (info.source) { setSource(info.source); filled++; }
      setFetchMsg(
        filled > 0
          ? "Productinfo opgehaald — controleer en pas aan waar nodig."
          : "Link bereikt, maar er stond geen titel/prijs/afbeelding in. Vul handmatig aan."
      );
    } catch (e: any) {
      setFetchMsg(e?.message ?? "Ophalen mislukt. Vul handmatig aan.");
    } finally {
      setFetching(false);
    }
  };

  const openCount = items.filter((i) => !i.done).length;
  const doneCount = items.filter((i) => i.done).length;
  // meegerekend met aantal: 3 zakken van €4,50 = €13,50
  const totalOpen = items.filter((i) => !i.done).reduce((s, i) => s + lineTotal(i), 0);

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
          (i.url ?? "").toLowerCase().includes(s)
      );
    }
    return list.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return b.createdAt - a.createdAt;
    });
  }, [items, q, filter]);

  const resetForm = () => {
    setTitle("");
    setUrl("");
    setQuantity("");
    setPrice("");
    setNote("");
    setImageUrl("");
    setSource("");
    setCategory(EXPENSE_CATEGORIES[0].key);
    setFetchMsg("");
    setEditingId(null);
  };

  const startEdit = (item: ShoppingItem) => {
    setEditingId(item.id);
    setTitle(item.title);
    setUrl(item.url ?? "");
    setQuantity(item.quantity ?? "");
    setPrice(item.price !== undefined ? String(item.price) : "");
    setNote(item.note ?? "");
    setImageUrl(item.imageUrl ?? "");
    setSource(item.source ?? "");
    setCategory(item.category ?? EXPENSE_CATEGORIES[0].key);
    setFetchMsg("");
    form.openForm();
  };

  const canSave = title.trim().length > 0 || normalizeUrl(url).length > 0;

  const submit = () => {
    if (!canSave) return;
    const urlNorm = normalizeUrl(url);
    const priceNum = parseFloat(price);
    const payload = {
      title: title.trim() || urlNorm.replace(/^https?:\/\//, "").slice(0, 60) || "Product",
      url: urlNorm || undefined,
      quantity: quantity.trim() || undefined,
      price: isNaN(priceNum) ? undefined : priceNum,
      note: note.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      source: source.trim() || undefined,
      category: category.trim() || undefined,
    };
    if (editingId) {
      onUpdate(editingId, payload);
    } else {
      onAdd(payload);
    }
    resetForm();
    form.closeForm();
  };

  const clearDone = () => {
    items.filter((i) => i.done).forEach((i) => onRemove(i.id));
  };

  return (
    <div className="shop-page">
      <div className="shop-hero">
        <div className="shop-hero-text">
          <h2>
            <i className="fa-solid fa-cart-shopping" /> Boodschappenlijst
          </h2>
          <p>Plak een productlink en haal titel, prijs en afbeelding automatisch op.</p>
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
              <i className="fa-solid fa-plus" /> Product toevoegen
            </>
          )}
        </button>
      </div>

      <div className="shop-stats">
        <div className="shop-stat">
          <div className="shop-stat-icon shop-stat-icon-open">
            <i className="fa-solid fa-cart-shopping" />
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
        <div className="shop-stat">
          <div className="shop-stat-icon shop-stat-icon-total">
            <i className="fa-solid fa-coins" />
          </div>
          <div className="shop-stat-info">
            <span className="shop-stat-value">{fmtEuro(totalOpen)}</span>
            <span className="shop-stat-label">Verwacht totaal</span>
          </div>
        </div>
      </div>

      {form.mounted && (
        <div className={`shop-form ${form.open ? "" : "shop-form-closing"}`}>
          <div className="shop-form-inner">
            <div className="shop-form-panel">
            <div className="shop-form-header">
              <i className="fa-solid fa-link" />
              <span>Productlink</span>
            </div>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://winkel.nl/product…"
              inputMode="url"
              autoFocus
              className="shop-form-url"
            />
            <div className="shop-form-actions">
              <button className="btn-primary" onClick={fetchFromUrl} disabled={fetching || !url.trim()} type="button">
                <i className={`fa-solid ${fetching ? "fa-spinner fa-spin" : "fa-wand-magic-sparkles"}`} />{" "}
                {fetching ? "Ophalen…" : "Haal info op van link"}
              </button>
              {fetchMsg && <span className="shop-fetch-msg">{fetchMsg}</span>}
            </div>

            {imageUrl && (
              <div className="shop-form-preview">
                <img src={imageUrl} alt="" className="shop-form-thumb" onError={() => setImageUrl("")} />
                <div className="shop-form-preview-info">
                  <span className="shop-form-preview-label">Afbeelding (automatisch)</span>
                  <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
                </div>
              </div>
            )}

            <div className="shop-form-grid">
              <div className="shop-form-field">
                <label>Productnaam</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Wordt gevuld via de link…"
                />
              </div>
              <div className="shop-form-field">
                <label>Aantal</label>
                <input
                  type="text"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Bijv. 2x of 3 zakken"
                />
              </div>
              <div className="shop-form-field">
                <label>Richtprijs (€)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="shop-form-field">
                <label>Notitie (optioneel)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Bijv. ras, maat, alternatief…"
                />
              </div>
              <div className="shop-form-field">
                <label>Categorie *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="shop-form-cats">
              {EXPENSE_CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className={`exp-chip exp-chip-${c.tone} ${category === c.key ? "exp-chip-active" : ""}`}
                  onClick={() => setCategory(c.key)}
                  aria-pressed={category === c.key}>
                  <i className={`fa-solid ${c.icon}`} />
                  {c.label}
                </button>
              ))}
            </div>

          <div className="shop-form-footer">
              <button className="btn-primary" onClick={submit} disabled={!canSave}>
                <i className="fa-solid fa-check" />{" "}
                {editingId ? "Wijziging opslaan" : "Toevoegen aan lijst"}
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
            placeholder="Zoek product…"
            aria-label="Zoek product"
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
          <i className="fa-solid fa-cart-shopping" />
          <p>
            Nog niets op de lijst. Voeg hierboven een product toe, plak er een linkje bij en vink af wat je al
            hebt.
          </p>
        </div>
      )}

      <div className="shop-grid">
        {filtered.map((item) => (
          <div
            key={item.id}
            className={`shop-card ${item.done ? "shop-card-done" : ""}`}
          >
            <div
              className={`shop-card-image ${item.imageUrl ? "" : "shop-card-image-empty"}`}
            >
              {item.imageUrl ? (
                <img src={item.imageUrl} alt="" loading="lazy" />
              ) : (
                <div className="shop-card-image-placeholder">
                  <i className="fa-solid fa-cart-shopping" />
                </div>
              )}
              {item.source && <span className="shop-card-source">{item.source}</span>}
            </div>
            <div className="shop-card-body">
              <div className="shop-card-title">
                {item.url ? (
                  <a
                    href={normalizeUrl(item.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={item.url}
                  >
                    {item.title}
                    <i className="fa-solid fa-up-right-from-square shop-card-ext" />
                  </a>
                ) : (
                  item.title
                )}
              </div>
              <div className="shop-card-meta">
                {item.category && (
                  <span
                    className={`shop-card-cat shop-card-cat-${categoryByKey(item.category).tone}`}
                    title={`Categorie: ${categoryByKey(item.category).label}`}>
                    <i className={`fa-solid ${categoryByKey(item.category).icon}`} />
                    {categoryByKey(item.category).label}
                  </span>
                )}
                {item.quantity && (
                  <span className="shop-card-qty" title={`Aantal: ${item.quantity}`}>
                    <i className="fa-solid fa-layer-group" />
                    {item.quantity}
                  </span>
                )}
                {item.price !== undefined && item.price > 0 && (
                  <span className="shop-card-price">
                    {fmtEuro(item.price)}
                    {parseQty(item.quantity) > 1 && (
                      <span className="shop-card-each"> / stuk</span>
                    )}
                  </span>
                )}
                {lineTotal(item) > 0 && parseQty(item.quantity) > 1 && (
                  <span className="shop-card-total" title="Aantal × prijs">
                    {fmtEuro(lineTotal(item))}
                  </span>
                )}
                {item.note && <span className="shop-card-note">{item.note}</span>}
              </div>
            </div>
            <div className="shop-card-actions">
              <button
                className={`shop-card-check ${item.done ? "shop-card-check-done" : ""}`}
                onClick={() => toggleDone(item)}
                title={
                  item.done
                    ? "Terugzetten naar open — uitgave wordt verwijderd"
                    : "Afvinken — komt op de Uitgaven-pagina"
                }
                aria-label={item.done ? "Terugzetten naar open" : "Afvinken"}
                aria-pressed={item.done}
              >
                <i className="fa-solid fa-check" />
              </button>
              {item.url && (
                <a
                  className="shop-card-action"
                  href={normalizeUrl(item.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open productlink"
                >
                  <i className="fa-solid fa-up-right-from-square" />
                </a>
              )}
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
        ))}
      </div>

      {doneCount > 0 && (
        <button className="shop-clear-done" onClick={clearDone}>
          <i className="fa-solid fa-trash" /> Afgevinkte items verwijderen ({doneCount})
        </button>
      )}
    </div>
  );
}
