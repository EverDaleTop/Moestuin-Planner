import type { Crop } from "./types";
import { CropSelect } from "./Inspector";
import { SheetModal } from "./SheetModal";

interface Props {
  mounted: boolean;
  open: boolean;
  catalog: Crop[];
  pickCrop: string;
  pickDate: string;
  pickNote: string;
  onPickCrop: (id: string) => void;
  onPickDate: (date: string) => void;
  onPickNote: (note: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

/**
 * Zaaien loggen: gecentreerde modaal op desktop, bottom-sheet-popup op mobiel.
 * Alleen presentatie — state en opslaan blijven in CalendarView.
 */
export function SowLogModal({
  mounted,
  open,
  catalog,
  pickCrop,
  pickDate,
  pickNote,
  onPickCrop,
  onPickDate,
  onPickNote,
  onSubmit,
  onClose,
}: Props) {
  if (!mounted) return null;

  return (
    <SheetModal
      mounted={mounted}
      open={open}
      onClose={onClose}
      ariaLabel="Zaaien loggen"
    >
        <div className="sow-modal-head">
          <h3>
            <i className="fa-solid fa-seedling" aria-hidden="true" /> Zaaien loggen
          </h3>
          <button
            type="button"
            className="sow-modal-close"
            onClick={onClose}
            aria-label="Sluiten"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
        <div className="sow-modal-body">
          <div className="shop-form-grid">
            <div className="shop-form-field">
              <label>Gewas</label>
              <CropSelect
                value={pickCrop || catalog[0]?.id || ""}
                catalog={catalog}
                onChange={onPickCrop}
              />
            </div>
            <div className="shop-form-field">
              <label>Datum</label>
              <input
                type="date"
                value={pickDate}
                onChange={(e) => onPickDate(e.target.value)}
              />
            </div>
          </div>
          <div className="shop-form-field">
            <label>Notitie (optioneel)</label>
            <input
              value={pickNote}
              onChange={(e) => onPickNote(e.target.value)}
              placeholder="bijv. binnenshuis voorzaaien"
            />
          </div>
          <div className="shop-form-footer">
            <button
              className="btn-primary"
              onClick={onSubmit}
              disabled={!pickDate || catalog.length === 0}
            >
              <i className="fa-solid fa-check" /> Opslaan
            </button>
          </div>
        </div>
    </SheetModal>
  );
}
