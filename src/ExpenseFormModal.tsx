import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Expense, Income } from "./types";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "./expenseCategories";
import { CategoryDropdown } from "./CategoryDropdown";
import { DateField } from "./DateField";

export type ExpenseMode = "uit" | "in";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
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

export interface ExpenseFormData {
  description: string;
  amount: number;
  date: string;
  category: string;
}

interface Props {
  mounted: boolean;
  open: boolean;
  edit: (Expense | Income) | null;
  mode: ExpenseMode;
  onClose: () => void;
  onSave: (data: ExpenseFormData) => void;
}

export function ExpenseFormModal({ mounted, open, edit, mode, onClose, onSave }: Props) {
  const isUit = mode === "uit";
  const cats = isUit ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [category, setCategory] = useState(cats[0].key);

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
      setDesc(edit.description);
      setAmount(String(edit.amount));
      setDate(edit.date);
      setCategory(edit.category ?? cats[0].key);
    } else {
      setDesc("");
      setAmount("");
      setDate(todayStr());
      setCategory(cats[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, open, edit]);

  const canSave = desc.trim().length > 0 && parseFloat(amount) > 0;

  const submit = () => {
    if (!canSave) return;
    onSave({
      description: desc.trim(),
      amount: parseFloat(amount),
      date,
      category,
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
        aria-label={edit ? (isUit ? "Uitgave bewerken" : "Inkomst bewerken") : isUit ? "Nieuwe uitgave" : "Nieuwe inkomst"}
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
            <i className={`fa-solid ${isUit ? "fa-receipt" : "fa-sack-dollar"}`} aria-hidden="true" />{" "}
            {edit ? (isUit ? "Uitgave bewerken" : "Inkomst bewerken") : isUit ? "Nieuwe uitgave" : "Nieuwe inkomst"}
          </h3>
          <button type="button" className="sow-modal-close" onClick={onClose} aria-label="Sluiten">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div className="sow-modal-body">
          <div className="bood-form-grid">
            <div className="shop-form-field shop-form-field-wide">
              <label>Omschrijving *</label>
              <input
                type="text"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder={isUit ? "Bijv. Biologische tomatenzaden" : "Bijv. Tomaten verkocht"}
              />
            </div>
            <div className="shop-form-field">
              <label>Bedrag (€) *</label>
              <NumField value={amount} onChange={setAmount} min="0.01" step={0.01} placeholder="0.00" />
            </div>
            <div className="shop-form-field">
              <label>Datum</label>
              <DateField value={date} onChange={setDate} />
            </div>
            <div className="shop-form-field">
              <CategoryDropdown
                id="exp-cat"
                label="Categorie"
                noIcons
                categories={cats}
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
            <i className="fa-solid fa-check" /> {edit ? "Wijziging opslaan" : "Toevoegen"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
