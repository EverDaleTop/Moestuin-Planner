import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Open/klap-in-uit voor het uitklapbare formulier.
 *
 * De hoogte-overgang zit in CSS (`grid-template-rows: 0fr <-> 1fr`). Om ook
 * bij het sluiten te animeren moet het element tijdens de overgang in de DOM
 * blijven: `mounted` stuurt het renderen aan, `open` de richting.
 *
 * Het unmounten gebeurt exact op `transitionend` van de grid-rij (met een
 * ruime fallback-timer). Een vaste timer alleen is te onnauwkeurig: JS +
 * React-commit komen altijd wat later binnen dan de CSS-transitie, waardoor
 * het element soms verdween terwijl de laatste pixels nog animeerden —
 * een zichtbaar sprongetje aan het einde van het dichtklappen.
 */
export function useCollapseForm() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  /** hangt aan het .shop-form-element; nodig voor het transitionend-moment */
  const formRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | null>(null);
  const stopListening = useRef<(() => void) | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (stopListening.current) {
      stopListening.current();
      stopListening.current = null;
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
    const el = formRef.current;
    if (!el) {
      timer.current = window.setTimeout(() => {
        setMounted(false);
        timer.current = null;
      }, 400);
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (stopListening.current) {
        stopListening.current();
        stopListening.current = null;
      }
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      setMounted(false);
    };
    const onEnd = (e: TransitionEvent) => {
      // alleen de rij-transitie van het formulier zelf telt; kinder-
      // transities (fade van het paneel) bubbelen hier ook doorheen.
      // En als intussen weer geopend is, is de closing-klasse al weg.
      if (e.target !== el) return;
      if (e.propertyName !== "grid-template-rows") return;
      if (!el.classList.contains("shop-form-closing")) return;
      finish();
    };
    el.addEventListener("transitionend", onEnd);
    stopListening.current = () => el.removeEventListener("transitionend", onEnd);
    // fallback voor als de transitie nooit eindigt (verborgen tab o.i.d.)
    timer.current = window.setTimeout(finish, 600);
  }, [clear, open]);

  const toggleForm = useCallback(() => {
    if (open) closeForm();
    else openForm();
  }, [open, openForm, closeForm]);

  useEffect(() => clear, [clear]);

  return { mounted, open, openForm, closeForm, toggleForm, formRef };
}
