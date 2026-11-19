import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Crop, HarvestEntry } from "./types";
import { SheetModal } from "./SheetModal";
import { CropSuggestions } from "./CropSuggestions";
import { api } from "./api";

function NumField({
  id,
  value,
  onChange,
  min,
  step = 1,
  placeholder,
}: {
  id?: string;
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
        id={id}
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

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtEuro(v: number): string {
  return `€${v.toFixed(2).replace(".", ",")}`;
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

function cropKey(name: string): string {
  return name.trim().toLowerCase();
}

function resolveCropName(h: HarvestEntry, byId: Map<string, Crop>): string {
  const own = h.cropName?.trim();
  if (own) return own;
  if (h.cropId) {
    const c = byId.get(h.cropId);
    if (c) return c.name;
  }
  return "Gewas";
}

export function HarvestFormModal({
  mounted,
  open,
  edit,
  catalog,
  plantedCropIds,
  prefill,
  onClose,
  onSave,
}: {
  mounted: boolean;
  open: boolean;
  edit: HarvestEntry | null;
  catalog: Crop[];
  plantedCropIds?: Set<string>;
  prefill?: { name: string; nonce: number } | null;
  onClose: () => void;
  onSave: (data: Omit<HarvestEntry, "id">) => void;
}) {
  const catalogById = useMemo(
    () => new Map(catalog.map((c) => [c.id, c] as const)),
    [catalog]
  );
  const catalogByName = useMemo(() => {
    const m = new Map<string, Crop>();
    for (const c of catalog) if (c.name) m.set(cropKey(c.name), c);
    return m;
  }, [catalog]);

  const [cropName, setCropName] = useState("");
  const [cropOpen, setCropOpen] = useState(false);
  const [cropClosing, setCropClosing] = useState(false);
  const cropCloseTimer = useRef<number | null>(null);
  const cropAnchorRef = useRef<HTMLDivElement | null>(null);
  const [qty, setQty] = useState("1");
  const [date, setDate] = useState(todayStr());
  const [price, setPrice] = useState("");
  const [priceTouched, setPriceTouched] = useState(false);
  const [bio, setBio] = useState(false);

  const [refUrl, setRefUrl] = useState("");
  const [refWeightKg, setRefWeightKg] = useState("");
  const [refStorePrice, setRefStorePrice] = useState<number | undefined>(undefined);
  const [, setRefTitle] = useState("");
  const [, setRefImage] = useState<string | undefined>(undefined);
  const [refBusy, setRefBusy] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setCropName("");
    if (cropCloseTimer.current !== null) {
      window.clearTimeout(cropCloseTimer.current);
      cropCloseTimer.current = null;
    }
    setCropClosing(false);
    setQty("1");
    setDate(todayStr());
    setPrice("");
    setPriceTouched(false);
    setBio(false);
    setRefUrl("");
    setRefWeightKg("");
    setRefStorePrice(undefined);
    setRefTitle("");
    setRefImage(undefined);
    setRefError(null);
    setCropOpen(false);
  }, []);

  // Vloeiend sluiten van de gewas-suggesties: eerst de sluit-animatie,
  // dan pas unmounten (zelfde patroon als de andere dropdowns).
  const cancelCropClose = useCallback(() => {
    if (cropCloseTimer.current !== null) {
      window.clearTimeout(cropCloseTimer.current);
      cropCloseTimer.current = null;
    }
    setCropClosing(false);
  }, []);

  const openCropSuggest = useCallback(() => {
    cancelCropClose();
    setCropOpen(true);
  }, [cancelCropClose]);

  const requestCropClose = useCallback(() => {
    if (!cropOpen || cropClosing) return;
    setCropClosing(true);
    cropCloseTimer.current = window.setTimeout(() => {
      setCropOpen(false);
      setCropClosing(false);
      cropCloseTimer.current = null;
    }, 150);
  }, [cropOpen, cropClosing]);

  useEffect(
    () => () => {
      if (cropCloseTimer.current !== null) window.clearTimeout(cropCloseTimer.current);
    },
    []
  );

  const handleCropChange = (v: string) => {
    setCropName(v);
    // Onder de 2 letters: vloeiend sluiten i.p.v. instant unmounten.
    if (v.trim().length >= 2) openCropSuggest();
    else requestCropClose();
  };

  const handleCropFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.currentTarget.value.trim().length >= 2) openCropSuggest();
  };

  const loadEdit = (h: HarvestEntry) => {
    setCropName(resolveCropName(h, catalogById));
    setQty(String(h.quantity));
    setDate(h.date);
    setPrice(h.pricePerKg > 0 ? String(h.pricePerKg) : "");
    setPriceTouched(h.pricePerKg > 0);
    setBio(h.isOrganic);
    setRefUrl(h.productUrl ?? "");
    setRefWeightKg(h.storeWeightKg ? String(h.storeWeightKg) : "");
    setRefStorePrice(h.storePrice);
    setRefTitle("");
    setRefImage(undefined);
    setRefError(null);
    if (cropCloseTimer.current !== null) {
      window.clearTimeout(cropCloseTimer.current);
      cropCloseTimer.current = null;
    }
    setCropClosing(false);
    setCropOpen(false);
  };

  useEffect(() => {
    if (!mounted || !open) return;
    if (edit) loadEdit(edit);
    else {
      reset();
      if (prefill?.name) {
        setCropName(prefill.name);
        setCropOpen(false);
      }
    }
  }, [mounted, open, edit, prefill]);

  const totalKg = parseFloat(qty) || 0;
  const draftPrice = parseFloat(price) || 0;
  const draftWeight = parseFloat(refWeightKg.replace(",", ".")) || 0;
  const draftPerKg =
    refStorePrice !== undefined && draftWeight > 0 ? refStorePrice / draftWeight : null;
  const draftSaving = draftPerKg !== null && draftPrice > 0 ? totalKg * draftPrice : null;
  const draftSuspicious = draftPerKg !== null && (draftPerKg > 25 || draftPerKg < 0.4);

  const applyStorePrice = (storePrice: number | undefined, weightKg: number) => {
    if (priceTouched) return;
    if (storePrice === undefined || !(weightKg > 0)) return;
    setPrice(String(round2(storePrice / weightKg)));
  };

  const fetchReference = async () => {
    if (!refUrl.trim()) {
      setRefError("Plak eerst een productlink.");
      return;
    }
    if (!(draftWeight > 0)) {
      setRefError("Vul het gewicht van de verpakking in, bijv. 1 voor 1 kg of 0.5 voor 500 g.");
      return;
    }
    setRefBusy(true);
    setRefError(null);
    try {
      const info = await api.previewLink(refUrl.trim());
      setRefTitle(info.title ?? "");
      setRefImage(info.image);
      setRefStorePrice(info.price);
      if (info.price === undefined) {
        setRefError("Prijs niet op de pagina gevonden — vul de prijs zelf in.");
      } else {
        applyStorePrice(info.price, draftWeight);
      }
    } catch (e: any) {
      setRefError(e?.message ?? "Ophalen lukte niet. Vul de prijs zelf in.");
    } finally {
      setRefBusy(false);
    }
  };

  const canSave = cropName.trim() !== "" && parseFloat(qty) > 0;

  const submit = () => {
    if (!canSave) return;
    const weight = parseFloat(refWeightKg.replace(",", ".")) || 0;
    const typed = cropName.trim();
    const matched = catalogByName.get(cropKey(typed));
    const payload: Omit<HarvestEntry, "id"> = {
      cropName: typed,
      cropId: matched?.id,
      quantity: parseFloat(qty),
      date,
      pricePerKg: parseFloat(price) || 0,
      isOrganic: bio,
      productUrl: refUrl.trim() || undefined,
      storePrice: refStorePrice,
      storeWeightKg: weight > 0 ? weight : undefined,
    };
    onSave(payload);
    reset();
  };

  if (!mounted) return null;

  return (
    <SheetModal
      mounted={mounted}
      open={open}
      onClose={onClose}
      className="crop-modal"
      ariaLabel={edit ? "Oogst bewerken" : "Nieuwe oogst"}
      resetKey={edit}
    >
        <div className="sow-modal-head">
          <h3>
            <i className="fa-solid fa-carrot" aria-hidden="true" /> {edit ? "Oogst bewerken" : "Nieuwe oogst"}
          </h3>
          <button type="button" className="sow-modal-close" onClick={onClose} aria-label="Sluiten">
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div className="sow-modal-body">
          <div className="shop-form-grid shop-form-grid-3 crop-modal-grid">
            <div className="shop-form-field shop-form-field-crop">
              <label htmlFor="harvest-crop">Gewas *</label>
              <div className="crop-input" ref={cropAnchorRef}>
                <input
                  id="harvest-crop"
                  type="text"
                  value={cropName}
                  onChange={(e) => handleCropChange(e.target.value)}
                  onFocus={handleCropFocus}
                  placeholder="Bijv. Tomaat, Courgette…"
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={cropOpen}
                  aria-autocomplete="list"
                />
              </div>
              {catalog.length > 0 && (cropOpen || cropClosing) && (
                <CropSuggestions
                  catalog={catalog}
                  plantedCropIds={plantedCropIds}
                  anchorRef={cropAnchorRef}
                  query={cropName}
                  closing={cropClosing}
                  onPick={(name) => {
                    setCropName(name);
                    requestCropClose();
                  }}
                  onClose={requestCropClose}
                />
              )}
            </div>
            <div className="shop-form-field">
              <label>Hoeveelheid (kg) *</label>
              <NumField
                value={qty}
                onChange={setQty}
                min="0.1"
                step={0.1}
              />
            </div>
            <div className="shop-form-field">
              <label>Datum</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="shop-form-field">
              <label htmlFor="harvest-price">
                Prijs per kg (€)
                {!priceTouched && draftPerKg !== null && (
                  <span className="shop-form-hint-inline">uit de productlink</span>
                )}
              </label>
              <NumField
                id="harvest-price"
                value={price}
                onChange={(v) => {
                  setPrice(v);
                  setPriceTouched(true);
                }}
                min="0"
                step={0.01}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="ref-compare">
            <div className="ref-compare-head">
              <i className="fa-solid fa-cart-shopping" />
              <span>Hoeveel bespaart dit?</span>
              <span className="ref-compare-optional">optioneel</span>
            </div>
            <div className="ref-row">
              <div className="ref-field ref-field-url">
                <label htmlFor="ref-url">Productlink</label>
                <input
                  id="ref-url"
                  type="url"
                  value={refUrl}
                  onChange={(e) => setRefUrl(e.target.value)}
                  placeholder="https://www.albertheijn.nl/product/…"
                  inputMode="url"
                />
              </div>
              <div className="ref-field">
                <label htmlFor="ref-weight">Verpakking (kg)</label>
                <NumField
                  id="ref-weight"
                  value={refWeightKg}
                  onChange={(v) => {
                    setRefWeightKg(v);
                    applyStorePrice(refStorePrice, parseFloat(v.replace(",", ".")) || 0);
                  }}
                  step={0.1}
                  placeholder="1"
                />
              </div>
              <button
                className="btn-primary ref-fetch"
                onClick={() => void fetchReference()}
                disabled={refBusy}
                type="button"
              >
                <i className={`fa-solid ${refBusy ? "fa-spinner fa-spin" : "fa-wand-magic-sparkles"}`} />{" "}
                {refBusy ? "Ophalen…" : "Bereken"}
              </button>
            </div>

            {refError && <p className="ref-error">{refError}</p>}

            {refUrl.trim() !== "" && (
              <div className="ref-product">
                <div className="ref-product-fields">
                  <label className="ref-mini">
                    <span>Winkelprijs (€)</span>
                    <NumField
                      value={refStorePrice !== undefined ? String(refStorePrice) : ""}
                      onChange={(v) => {
                        const n = parseFloat(v) || 0;
                        setRefStorePrice(n);
                        applyStorePrice(n, draftWeight);
                      }}
                      min="0"
                      step={0.01}
                    />
                  </label>
                  {draftSaving !== null && (
                    <span className="ref-readout ref-plus">
                      <span className="ref-readout-label">Bespaard</span>
                      <strong className="ref-readout-value">+{fmtEuro(draftSaving)}</strong>
                    </span>
                  )}
                </div>
              </div>
            )}

            {draftSuspicious && (
              <p className="ref-warn">
                <i className="fa-solid fa-triangle-exclamation" />
                Deze prijs per kilo ({fmtEuro(draftPerKg!)}) ziet er onwaarschijnlijk uit.
                Controleer of het gewicht klopt.
              </p>
            )}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={bio}
            className="he-bio-toggle he-bio-switch"
            onClick={() => setBio((b) => !b)}
          >
            <span>Biologisch</span>
            <span className="theme-switch-track" aria-hidden="true">
              <span className="theme-switch-knob">
                <i className={bio ? "fa-solid fa-check" : "fa-solid fa-xmark"} aria-hidden="true" />
              </span>
            </span>
          </button>
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
