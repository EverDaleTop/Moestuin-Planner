import { useMemo, useState } from "react";
import type { ShoppingItem } from "./types";
import { api } from "./api";
import { useCollapseForm } from "./useCollapseForm";
import { lineTotal, parseQty } from "./shopping";
import { EXPENSE_CATEGORIES, categoryByKey } from "./expenseCategories";
import { CategoryDropdown } from "./CategoryDropdown";

interface Props {
  items: ShoppingItem[];
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

export function ShoppingListView({ items, onAdd, onUpdate, onRemove, onToggleDone }: Props) {
  const form = useCollapseForm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "done">("all");
  const [catFilter, setCatFilter] = useState("");

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

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = [...items];
    if (filter === "open") list = list.filter((i) => !i.done);
    if (filter === "done") list = list.filter((i) => i.done);
    if (catFilter) list = list.filter((i) => i.category && categoryByKey(i.category).key === catFilter);
    if (s) {
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(s) ||
          (i.note ?? "").toLowerCase().includes(s) ||
          (i.url ?? "").toLowerCase().includes(s)
      );
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }, [items, q, filter, catFilter]);

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

  /** Klik op de kaart: open de productlink, of bewerken als er geen link is. */
  const openCard = (item: ShoppingItem) => {
    if (item.url) {
      window.open(normalizeUrl(item.url), "_blank", "noopener,noreferrer");
    } else {
      startEdit(item);
    }
  };

  return (
    <div className="shop-page bood-page">
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
        <div ref={form.formRef} className={`shop-form ${form.open ? "" : "shop-form-closing"}`}>
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
              <div className="shop-form-field shop-form-field-wide">
                <CategoryDropdown
                  id="shop-cat"
                  label="Categorie"
                  noIcons
                  categories={EXPENSE_CATEGORIES}
                  value={category}
                  onChange={setCategory}
                />
              </div>
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
        {usedCats.length > 0 && (
          <div className="bood-catfilter">
            <CategoryDropdown
              id="bood-catfilter"
              label="Filter op categorie"
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
            label="Filter op status"
            noIcons
            categories={statusOptions}
            value={filter}
            onChange={(key) => setFilter(key as "all" | "open" | "done")}
          />
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

      {/* key op de filter: bij een filterwissel her-mounten de kaarten, zodat
          ze netjes in-faden (stagger) i.p.v. ineens te verspringen. */}
      <div className="shop-grid" key={`${filter}-${catFilter}`}>
        {filtered.map((item, i) => (
          <div
            key={item.id}
            style={{ animationDelay: `${Math.min(i, 11) * 35}ms` }}
            className={`shop-card ${item.done ? "shop-card-done" : ""}`}
            onClick={() => openCard(item)}
            role={item.url ? "link" : "button"}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") openCard(item);
            }}
            aria-label={`${item.title} openen`}
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
                  onClick={() => onRemove(item.id)}
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
              {item.note && <div className="shop-card-note">{item.note}</div>}
              <div className="shop-card-foot">
                <div className="shop-card-prices">
                  {(() => {
                    const qtyN = parseQty(item.quantity);
                    const price = item.price ?? 0;
                    const hasPrice = price > 0;
                    if (hasPrice && qtyN > 1) {
                      return (
                        <>
                          <span className="shop-card-price">{fmtEuro(lineTotal(item))}</span>
                          <span className="shop-card-sub">
                            {item.quantity} × {fmtEuro(price)}
                          </span>
                        </>
                      );
                    }
                    return (
                      <>
                        {hasPrice && (
                          <span className="shop-card-price">{fmtEuro(price)}</span>
                        )}
                        {item.quantity && (
                          <span className="shop-card-sub">
                            {item.quantity}
                            {hasPrice ? "" : " nodig"}
                          </span>
                        )}
                      </>
                    );
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
                      onClick={() => onRemove(item.id)}
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

      {doneCount > 0 && (
        <button className="shop-clear-done" onClick={clearDone}>
          <i className="fa-solid fa-trash" /> Afgevinkte items verwijderen ({doneCount})
        </button>
      )}
    </div>
  );
}
