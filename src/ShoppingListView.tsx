import { useMemo, useState } from "react";
import type { ShoppingItem } from "./types";

interface Props {
  items: ShoppingItem[];
  onAdd: (entry: Omit<ShoppingItem, "id" | "createdAt" | "done">) => void;
  onUpdate: (id: string, patch: Partial<ShoppingItem>) => void;
  onRemove: (id: string) => void;
}

function todayPrice(v?: number): string {
  if (v === undefined || v === null) return "";
  return String(v);
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

export function ShoppingListView({ items, onAdd, onUpdate, onRemove }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "done">("all");

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");

  const openCount = items.filter((i) => !i.done).length;
  const doneCount = items.filter((i) => i.done).length;
  const totalOpen = items
    .filter((i) => !i.done)
    .reduce((s, i) => s + (i.price ?? 0), 0);

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
    // open eerst, daarna nieuwste eerst
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
    setEditingId(null);
  };

  const startEdit = (item: ShoppingItem) => {
    setEditingId(item.id);
    setTitle(item.title);
    setUrl(item.url ?? "");
    setQuantity(item.quantity ?? "");
    setPrice(todayPrice(item.price));
    setNote(item.note ?? "");
    setShowForm(true);
  };

  const canSave = title.trim().length > 0;

  const submit = () => {
    if (!canSave) return;
    const urlNorm = normalizeUrl(url);
    const priceNum = parseFloat(price);
    const payload = {
      title: title.trim(),
      url: urlNorm || undefined,
      quantity: quantity.trim() || undefined,
      price: isNaN(priceNum) ? undefined : priceNum,
      note: note.trim() || undefined,
    };
    if (editingId) {
      onUpdate(editingId, payload);
    } else {
      onAdd(payload);
    }
    resetForm();
    setShowForm(false);
  };

  const clearDone = () => {
    items.filter((i) => i.done).forEach((i) => onRemove(i.id));
  };

  return (
    <div className="he-wrap">
      <div className="he-summary shop-summary">
        <div className="he-card">
          <div className="he-card-label">
            <i className="fa-solid fa-cart-shopping" /> Open
          </div>
          <div className="he-card-value">{openCount}</div>
        </div>
        <div className="he-card he-card-green">
          <div className="he-card-label">
            <i className="fa-solid fa-check" /> Afgevinkt
          </div>
          <div className="he-card-value">{doneCount}</div>
        </div>
        <div className="he-card">
          <div className="he-card-label">
            <i className="fa-solid fa-coins" /> Verwacht totaal
          </div>
          <div className="he-card-value">{fmtEuro(totalOpen)}</div>
        </div>
      </div>

      <div className="he-section">
        <div className="he-section-header">
          <h3>
            <i className="fa-solid fa-cart-shopping" /> Boodschappenlijst
          </h3>
          <button
            className="btn-primary"
            onClick={() => {
              if (showForm) {
                resetForm();
                setShowForm(false);
              } else {
                resetForm();
                setShowForm(true);
              }
            }}
          >
            {showForm ? (
              <>
                <i className="fa-solid fa-xmark" /> Annuleren
              </>
            ) : (
              <>
                <i className="fa-solid fa-plus" /> Product
              </>
            )}
          </button>
        </div>

        {showForm && (
          <div className="he-form">
            <div className="he-form-row">
              <div className="inp-field">
                <span>Product *</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Bijv. Biologische tomatenzaden"
                  autoFocus
                />
              </div>
              <div className="inp-field">
                <span>Aantal</span>
                <input
                  type="text"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Bijv. 2x of 3 zakken"
                />
              </div>
            </div>
            <div className="he-form-row">
              <div className="inp-field">
                <span>
                  <i className="fa-solid fa-link" /> Productlink
                </span>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://winkel.nl/product…"
                  inputMode="url"
                />
              </div>
              <div className="inp-field">
                <span>Richtprijs (€)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="he-form-row">
              <div className="inp-field">
                <span>Notitie (optioneel)</span>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Bijv. ras, maat, alternatief…"
                />
              </div>
            </div>
            <div className="he-form-row">
              <button className="btn-primary" onClick={submit} disabled={!canSave}>
                <i className="fa-solid fa-check" />{" "}
                {editingId ? "Wijziging opslaan" : "Toevoegen"}
              </button>
              {editingId && (
                <button
                  className="btn-ghost"
                  onClick={() => {
                    resetForm();
                    setShowForm(false);
                  }}
                >
                  <i className="fa-solid fa-xmark" /> Annuleren
                </button>
              )}
            </div>
          </div>
        )}

        <div className="pd-toolbar shop-toolbar">
          <input
            className="pd-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoek product…"
            aria-label="Zoek product"
          />
          <div className="shop-filters" role="group" aria-label="Filter">
            <button
              className={`nav-tab ${filter === "all" ? "nav-active" : ""}`}
              onClick={() => setFilter("all")}
            >
              Alles
            </button>
            <button
              className={`nav-tab ${filter === "open" ? "nav-active" : ""}`}
              onClick={() => setFilter("open")}
            >
              Open
            </button>
            <button
              className={`nav-tab ${filter === "done" ? "nav-active" : ""}`}
              onClick={() => setFilter("done")}
            >
              Afgevinkt
            </button>
          </div>
        </div>

        {filtered.length === 0 && (
          <div className="he-empty">
            <i className="fa-solid fa-cart-shopping" /> Nog niets op de lijst. Voeg
            hierboven een product toe, plak er een linkje bij en vink af wat je al
            hebt.
          </div>
        )}

        <div className="he-list">
          {filtered.map((item) => (
            <div key={item.id} className={`he-row shop-row ${item.done ? "shop-done" : ""}`}>
              <button
                className={`shop-check ${item.done ? "shop-check-done" : ""}`}
                onClick={() => onUpdate(item.id, { done: !item.done })}
                title={item.done ? "Terugzetten naar open" : "Afvinken"}
                aria-label={item.done ? "Terugzetten" : "Afvinken"}
              >
                {item.done && <i className="fa-solid fa-check" />}
              </button>
              <div className="he-row-main">
                <div className="he-row-title">
                  {item.url ? (
                    <a
                      href={normalizeUrl(item.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shop-link"
                      title={item.url}
                    >
                      {item.title}{" "}
                      <i className="fa-solid fa-up-right-from-square shop-ext" />
                    </a>
                  ) : (
                    item.title
                  )}
                  {item.quantity && (
                    <span className="he-bio-badge shop-qty">{item.quantity}</span>
                  )}
                </div>
                <div className="he-row-meta">
                  {item.price !== undefined && item.price > 0 && (
                    <span className="shop-price">{fmtEuro(item.price)}</span>
                  )}
                  {item.note && <span> · {item.note}</span>}
                  {item.url && (
                    <span className="shop-url"> · {item.url.replace(/^https?:\/\//, "").slice(0, 40)}</span>
                  )}
                </div>
              </div>
              <div className="he-row-actions">
                {item.url && (
                  <a
                    className="he-row-btn shop-open"
                    href={normalizeUrl(item.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open productlink"
                  >
                    <i className="fa-solid fa-up-right-from-square" />
                  </a>
                )}
                <button
                  className="he-row-btn"
                  onClick={() => startEdit(item)}
                  title="Bewerken"
                >
                  <i className="fa-solid fa-pen" />
                </button>
                <button
                  className="he-row-btn he-row-btn-danger"
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
          <button className="share-regenerate" onClick={clearDone}>
            <i className="fa-solid fa-trash" /> Afgevinkte items verwijderen ({doneCount})
          </button>
        )}
      </div>
    </div>
  );
}
