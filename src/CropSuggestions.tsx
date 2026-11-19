import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Crop } from "./types";
import { CropGlyph } from "./CropIconPicker";

interface Props {
  catalog: Crop[];
  /** gewassen die in een bed staan; die staan vooraan met een "in tuin"-label */
  plantedCropIds?: Set<string>;
  query: string;
  onPick: (name: string) => void;
  /** het element waaraan de lijst vastgeplakt wordt */
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  /** tijdens het vloeiend sluiten: speelt de sluit-animatie af */
  closing?: boolean;
}

/**
 * Gewassen-suggesties onder het gewasveld: de 3 beste matches,
 * met gewassen uit de tuin eerst. Iedere regel toont het icoontje.
 *
 * De lijst rendert via een portal op `body` met fixed positie: zo wordt hij
 * nooit afgekapt door de `overflow: hidden` van het uitklapformulier
 * (daar ging hij voorheen achter schuil zodra het veld laag op het scherm
 * stond — op telefoon bijna altijd).
 */
export function CropSuggestions({
  catalog,
  plantedCropIds,
  query,
  onPick,
  anchorRef,
  onClose,
  closing,
}: Props) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const popRef = useRef<HTMLDivElement | null>(null);

  const s = query.trim().toLowerCase();
  // Rangschik op relevantie: in de tuin eerst, dan "begint met",
  // dan vroegste match, dan alfabetisch. Bij typen tonen we de 3 beste.
  const ranked = catalog
    .map((c) => {
      const name = c.name.toLowerCase();
      const idx = s === "" ? 0 : name.indexOf(s);
      return { c, idx };
    })
    .filter((r) => s === "" || r.idx >= 0)
    .sort((a, b) => {
      const ap = plantedCropIds?.has(a.c.id) ? 0 : 1;
      const bp = plantedCropIds?.has(b.c.id) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      const aStarts = a.idx === 0 ? 0 : 1;
      const bStarts = b.idx === 0 ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      if (a.idx !== b.idx) return a.idx - b.idx;
      return a.c.name.localeCompare(b.c.name, "nl");
    })
    .map((r) => r.c);
  const limit = 3;
  const shown = ranked.slice(0, limit);
  // Tijdens het vloeiend sluiten (query < 2 letters) de laatste geldige
  // suggesties blijven tonen i.p.v. de 1-letter matches.
  const lastShownRef = useRef<Crop[]>([]);
  useEffect(() => {
    if (s.length >= 2) lastShownRef.current = shown;
  });
  const visible = s.length >= 2 ? shown : lastShownRef.current;

  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(r.width, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    // hoogte schatten: ~40px per rij, nooit hoger dan de lijst zelf
    const estH = Math.min(260, 44 + visible.length * 40);
    const below = r.bottom + 6;
    const top =
      below + estH <= window.innerHeight || r.top - 6 - estH < 8
        ? below
        : Math.max(8, r.top - 6 - estH);
    setPos({ top, left, width });
  }, [anchorRef, query, visible.length]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      onClose();
    };
    // Bij scrollen schuift het veld weg onder het fixed menu: sluiten.
    const onScroll = () => onClose();
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      className={`cropsug cropsug-portal${closing ? " closing" : ""}`}
      ref={popRef}
      style={{ top: pos.top, left: pos.left, width: pos.width || undefined }}
    >
      {visible.map((c) => (
        <CropRow
          key={c.id}
          crop={c}
          onPick={onPick}
          inGarden={plantedCropIds?.has(c.id) ?? false}
        />
      ))}
      {visible.length === 0 && <div className="cropsug-empty">Geen gewas gevonden.</div>}
    </div>,
    document.body
  );
}

function CropRow({
  crop,
  onPick,
  inGarden,
}: {
  crop: Crop;
  onPick: (name: string) => void;
  inGarden: boolean;
}) {
  return (
    <button type="button" className="cropsug-item" onClick={() => onPick(crop.name)}>
      <span className="cropsug-icon" aria-hidden="true">
        <CropGlyph iconKey={crop.icon} cropName={crop.name} />
      </span>
      <span className="cropsug-name">{crop.name}</span>
      {crop.variety && <span className="cropsug-variety">{crop.variety}</span>}
      {inGarden && <span className="cropsug-tag">in tuin</span>}
    </button>
  );
}