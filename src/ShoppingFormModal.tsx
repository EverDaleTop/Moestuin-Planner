import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ShoppingItem } from "./types";
import { api } from "./api";
import { EXPENSE_CATEGORIES } from "./expenseCategories";
import { CategoryDropdown } from "./CategoryDropdown";

function normalizeUrl(url: string): string {
  const t = url.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function NumField({
  value,
  onChange,
  min,
  step = 1,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  step?: number;
  placeholder?: string;
}) {
  const bump = (dir: number) => {
    const base = parseFloat(value);
    const current = Number.isFinite(base) ? base : 0;
    const decimals = (String(step).split(".")[1] ?? "").length;
    const factor = 10 ** decimals;
    const next = Math.round((current + dir * (step || 1)) * factor) / factor;
    onChange(String(next));
  };
  return (
    <div className="step-wrap">
      <button type="button" className="step-btn" onClick={() => bump(-1)} aria-label="Verlagen">
        <i className="fa-solid fa-minus" aria-hidden="true" />
      </button>
      <input
        className="pd-bare step-input"
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        step="any"
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" className="step-btn" onClick={() => bump(1)} aria-label="Verhogen">
        <i className="fa-solid fa-plus" aria-hidden="true" />
      </button>
    </div>
  );
}

interface Props {
  mounted: boolean;
  open: boolean;
  edit: ShoppingItem | null;
  onClose: () => void;
  onSave: (data: Omit<ShoppingItem, "id" | "createdAt" | "done">) => void;
}

export function ShoppingFormModal({ mounted, open, edit, onClose, onSave }: Props) {
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

  const reset = () => {
    setTitle("");
    setUrl("");
    setQuantity("");
    setPrice("");
    setNote("");
    setImageUrl("");
    setSource("");
    setCategory(EXPENSE_CATEGORIES[0].key);
    setFetching(false);
    setFetchMsg("");
  };

  useEffect(() => {
    if (!mounted || !open) return;
    // drag-status terugzetten: na een drag-close staat de sheet nog
    // weggeschoven; zonder reset opent hij onzichtbaar.
    dragOffsetRef.current = 0;
    setDragOffsetState(0);
    setDragging(false);
    setDragClosing(false);
    setGrabbed(false);
    if (edit) {
      setTitle(edit.title);
      setUrl(edit.url ?? "");
      setQuantity(edit.quantity ?? "");
      setPrice(edit.price !== undefined ? String(edit.price) : "");
      setNote(edit.note ?? "");
      setImageUrl(edit.imageUrl ?? "");
      setSource(edit.source ?? "");
      setCategory(edit.category ?? EXPENSE_CATEGORIES[0].key);
      setFetchMsg("");
    } else {
      reset();
    }
  }, [mounted, open, edit]);

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

  const canSave = title.trim().length > 0 || normalizeUrl(url).length > 0;

  const submit = () => {
    if (!canSave) return;
    const urlNorm = normalizeUrl(url);
    const priceNum = parseFloat(price);
    onSave({
      title: title.trim() || urlNorm.replace(/^https?:\/\//, "").slice(0, 60) || "Product",
      url: urlNorm || undefined,
      quantity: quantity.trim() || undefined,
      price: isNaN(priceNum) ? undefined : priceNum,
      note: note.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      source: source.trim() || undefined,
      category: category.trim() || undefined,
    });
  };

  // drag-to-close (mobiele bottom-sheet)
  const dragStartY = useRef(0);
  const dragOffsetRef = useRef(0);
  const [dragOffset, setDragOffsetState] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragClosing, setDragClosing] = useState(false);
  const [grabbed, setGrabbed] = useState(false);

  const setDragOffset = (v: number) => {
    dragOffsetRef.current = v;
    setDragOffsetState(v);
  };
  const onGripDown = (e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    dragOffsetRef.current = 0;
    setDragClosing(false);
    setGrabbed(true);
    setDragging(true);
    setDragOffsetState(0);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onGripMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const next = Math.max(0, e.clientY - dragStartY.current);
    dragOffsetRef.current = next;
    setDragOffsetState(next);
  };
  const endDrag = () => {
    if (!dragging) return;
    setDragging(false);
    if (dragOffsetRef.current > 90) {
      setDragClosing(true);
      setDragOffset(window.innerHeight);
      onClose();
    } else {
      setDragOffset(0);
    }
  };

  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`sow-modal-overlay${open ? "" : " closing"}${dragClosing ? " drag-closing" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`sow-modal crop-modal${dragging ? " dragging" : ""}${dragClosing ? " drag-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={edit ? "Product bewerken" : "Nieuw product"}
        style={
          grabbed
            ? {
                transform: `translateY(${dragOffset}px)`,
                transition: dragging
                  ? "none"
                  : "transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
                animation: "none",
              }
            : undefined
        }
      >
        <div
          className="sow-modal-grip"
          aria-hidden="true"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        <div className="sow-modal-head">
          <h3>
            <i className="fa-solid fa-cart-shopping" aria-hidden="true" /> {edit ? "Product bewerken" : "Nieuw product"}
          </h3>
          <button type="button" className="sow-modal-close" onClick={onClose} aria-label="Sluiten">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div className="sow-modal-body">
          <div className="shop-form-header">
            <span>Productlink</span>
          </div>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://winkel.nl/product…"
            inputMode="url"
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

          <div className="bood-form-grid">
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
              <NumField
                value={quantity}
                onChange={setQuantity}
                min="0"
                step={1}
                placeholder="0"
              />
            </div>
            <div className="shop-form-field">
              <label>Richtprijs (€)</label>
              <NumField
                value={price}
                onChange={setPrice}
                min="0"
                step={0.01}
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
        </div>

        <div className="crop-modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuleren
          </button>
          <button type="button" className="btn-primary" disabled={!canSave} onClick={submit}>
            <i className="fa-solid fa-check" />{" "}
            {edit ? "Wijziging opslaan" : "Toevoegen aan lijst"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
