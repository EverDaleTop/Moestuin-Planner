import { useCallback, useEffect, useRef, useState } from "react";

/** moet overeenkomen met de duur van de .shop-form transition */
const DURATION = 320;

/**
 * Open/klap-in-uit voor het uitklapbare formulier.
 *
 * De hoogte-overgang zit in CSS (`grid-template-rows: 0fr <-> 1fr`). Om ook
 * bij het sluiten te animeren moet het element tijdens de overgang in de DOM
 * blijven: `mounted` stuurt het renderen aan, `open` de richting.
 */
export function useCollapseForm() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const openForm = useCallback(() => {
    clear();
    setOpen(true);
    setMounted(true);
  }, [clear]);

  const closeForm = useCallback(() => {
    clear();
    if (!open) return;
    setOpen(false);
    timer.current = window.setTimeout(() => {
      setMounted(false);
      timer.current = null;
    }, DURATION);
  }, [clear, open]);

  const toggleForm = useCallback(() => {
    if (open) closeForm();
    else openForm();
  }, [open, openForm, closeForm]);

  useEffect(() => clear, [clear]);

  return { mounted, open, openForm, closeForm, toggleForm };
}