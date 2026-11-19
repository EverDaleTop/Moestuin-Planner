import { useEffect, useMemo, useState } from "react";
import type { Expense, Income } from "./types";
import { SheetModal } from "./SheetModal";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, type ExpenseCategory } from "./expenseCategories";
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
  assigneeId?: string;
}

interface Props {
  mounted: boolean;
  open: boolean;
  edit: (Expense | Income) | null;
  mode: ExpenseMode;
  /** deelnemers van de tuin (eigenaar + gedeeld met) */
  members: { id: string; name: string }[];
  currentUserId?: string;
  onClose: () => void;
  onSave: (data: ExpenseFormData) => void;
}

export function ExpenseFormModal({ mounted, open, edit, mode, members, currentUserId, onClose, onSave }: Props) {
  const isUit = mode === "uit";
  const cats = isUit ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayStr());
  const [category, setCategory] = useState(cats[0].key);
  const [assigneeId, setAssigneeId] = useState("");

  const memberOptions = useMemo<ExpenseCategory[]>(
    () => [
      { key: "", label: "Niemand in het bijzonder", icon: "fa-user-group", tone: "grey" },
      ...members.map((m) => ({
        key: m.id,
        label: m.id === currentUserId ? `${m.name} (jij)` : m.name,
        icon: "fa-user",
        tone: "green",
      })),
    ],
    [members, currentUserId]
  );

  useEffect(() => {
    if (!mounted || !open) return;
    if (edit) {
      setDesc(edit.description);
      setAmount(String(edit.amount));
      setDate(edit.date);
      setCategory(edit.category ?? cats[0].key);
      setAssigneeId(
        edit.assigneeId && members.some((m) => m.id === edit.assigneeId) ? edit.assigneeId : ""
      );
    } else {
      setDesc("");
      setAmount("");
      setDate(todayStr());
      setCategory(cats[0].key);
      setAssigneeId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, open, edit, members]);

  const canSave = desc.trim().length > 0 && parseFloat(amount) > 0;

  const submit = () => {
    if (!canSave) return;
    onSave({
      description: desc.trim(),
      amount: parseFloat(amount),
      date,
      category,
      assigneeId: assigneeId || undefined,
    });
  };

  if (!mounted) return null;

  return (
    <SheetModal
      mounted={mounted}
      open={open}
      onClose={onClose}
      className="crop-modal"
      ariaLabel={edit ? (isUit ? "Uitgave bewerken" : "Inkomst bewerken") : isUit ? "Nieuwe uitgave" : "Nieuwe inkomst"}
      resetKey={edit}
    >
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
            <div className="shop-form-field">
              <CategoryDropdown
                id="exp-assignee"
                label="Voor wie?"
                categories={memberOptions}
                value={assigneeId}
                onChange={setAssigneeId}
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
    </SheetModal>
  );
}
