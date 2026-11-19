import { useEffect, useRef, useState } from "react";
import { SheetModal } from "./SheetModal";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  /** label op de rode knop, standaard "Ja, verwijder" */
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Generieke verwijder-bevestiging. Zelfde modaal-systeem als de andere
 * formulieren (gecentreerd op desktop, bottom-sheet op mobiel).
 */
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Ja, verwijder",
  cancelLabel = "Annuleren",
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const confirmTimer = useRef<number | null>(null);

  // Houd de sheet gemount tijdens de sluit-animatie, net als de andere modals.
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    const timer = window.setTimeout(() => setMounted(false), 280);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  useEffect(() => () => {
    if (confirmTimer.current !== null) window.clearTimeout(confirmTimer.current);
  }, []);

  // Bevestigen: eerst de sheet netjes laten sluiten, daarna pas de actie.
  // Anders verdwijnt de popup direct zodra de actie de pagina laat navigeren.
  const confirmWithAnimation = () => {
    if (busy || closing) return;
    setClosing(true);
    confirmTimer.current = window.setTimeout(() => {
      confirmTimer.current = null;
      onConfirm();
    }, 250);
  };

  return (
    <SheetModal
      mounted={mounted}
      open={open}
      onClose={onCancel}
      closing={closing}
      className="crop-modal"
      role="alertdialog"
      ariaLabel={title}
      gripDisabled={busy || closing}
      escapeDisabled={busy || closing}
      closeOnBackdrop={!busy && !closing}
    >
        <div className="sow-modal-head">
          <h3>{title}</h3>
          <button
            type="button"
            className="sow-modal-close"
            onClick={onCancel}
            disabled={busy || closing}
            aria-label="Sluiten"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
        <div className="sow-modal-body">
          <p className="presence-confirm-text">{message}</p>
        </div>
        <div className="crop-modal-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={onCancel}
            disabled={busy || closing}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={confirmWithAnimation}
            disabled={busy || closing}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
    </SheetModal>
  );
}
