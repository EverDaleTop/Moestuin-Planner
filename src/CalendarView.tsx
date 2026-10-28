import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Crop, HarvestEntry, SowingEntry } from "./types";
import { cropLabel } from "./cropIcons";
import { CropGlyph } from "./CropIconPicker";
import {
  MONTHS_SHORT,
  MONTHS_LONG,
  sowWindowOf,
  harvestWindowOf,
  monthInWindow,
  sowableInMonth,
  sameWindow,
  windowText,
  windowLine,
} from "./sowing";
import { useCollapseForm } from "./useCollapseForm";
import { SowLogModal } from "./SowLogModal";

interface Props {
  catalog: Crop[];
  sowings: SowingEntry[];
  harvests: HarvestEntry[];
  
  plantedCropIds: Set<string>;
  
  veldScopes?: { id: string; name: string; cropIds: string[] }[];
  onAddSowing: (entry: Omit<SowingEntry, "id">) => void;
  onUpdateSowing: (sId: string, patch: Partial<SowingEntry>) => void;
  onRemoveSowing: (sId: string) => void;
  
  onLocateCrop: (cropId: string) => void;
  
  unresolvedPlantings?: number;
  
  onLogHarvest: (cropId: string) => void;
}


const VELD_PREFIX = "veld:";


function ScopeDropdown({
  value,
  plantedCount,
  catalogCount,
  velds,
  onChange,
}: {
  value: string;
  plantedCount: number;
  catalogCount: number;
  velds: { id: string; name: string; cropIds: string[] }[];
  onChange: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeTimer = useRef<number | null>(null);

  const options = [
    {
      key: "planted",
      label: `In tuin (${plantedCount})`,
      title: "Alleen gewassen die in de tuin staan",
    },
    ...velds.map((v) => ({
      key: `${VELD_PREFIX}${v.id}`,
      label: `${v.name} (${v.cropIds.length})`,
      title: `Alleen gewassen in ${v.name}`,
    })),
    {
      key: "catalog",
      label: `Alle gewassen (${catalogCount})`,
      title: "Alle aangemaakte gewassen met een zaaiperiode",
    },
  ];
  const current = options.find((o) => o.key === value) ?? options[0];

  const measure = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 210);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 4, left, width });
  };

  useLayoutEffect(() => {
    if (open) measure();
  }, [open ]);

  
  
  const openNow = () => {
    window.clearTimeout(closeTimer.current ?? undefined);
    closeTimer.current = null;
    setClosing(false);
    setOpen(true);
  };
  const closeIfOutside = (e: React.MouseEvent) => {
    const next = e.relatedTarget as Node | null;
    const pop = document.getElementById("scopedd-portal");
    if (next && (triggerRef.current?.contains(next) || pop?.contains(next))) return;
    window.clearTimeout(closeTimer.current ?? undefined);
    closeTimer.current = window.setTimeout(() => requestClose(), 150);
  };
  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.clearTimeout(closeTimer.current ?? undefined);
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      closeTimer.current = null;
      const t = triggerRef.current;
      if (t && document.activeElement === t) t.blur();
    }, 200);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        const pop = document.getElementById("scopedd-portal");
        if (!pop || !pop.contains(e.target as Node)) requestClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    const onScroll = () => requestClose();
    window.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
    
  }, [open ]);

  return (
    <div
      className="catdd cal-scope-dropdown"
      onMouseEnter={openNow}
      onMouseLeave={closeIfOutside}
    >
      <button
        type="button"
        ref={triggerRef}
        className="catdd-trigger cal-scope-trigger"
        aria-haspopup="listbox"
        aria-expanded={open || closing}
        aria-label="Welke gewassen tonen"
        title={current.title}
        onClick={() => openNow()}
      >
        <span className="catdd-current">{current.label}</span>
        <i className={`fa-solid fa-chevron-down catdd-caret${open && !closing ? " open" : ""}`} aria-hidden="true" />
      </button>
      {(open || closing) &&
        createPortal(
          <ul
            id="scopedd-portal"
            className={`catdd-pop catdd-pop-portal scopedd-pop${closing ? " closing" : ""}`}
            role="listbox"
            onMouseLeave={closeIfOutside}
            onMouseEnter={() => {
              window.clearTimeout(closeTimer.current ?? undefined);
              closeTimer.current = null;
              setClosing(false);
              setOpen(true);
            }}
            aria-label="Welke gewassen tonen"
            style={{ top: pos.top, left: pos.left, width: Math.max(220, pos.width) }}
          >
            {options.map((o) => (
              <li key={o.key} role="option" aria-selected={o.key === value}>
                <button
                  type="button"
                  className={`catdd-item${o.key === value ? " is-active" : ""}`}
                  title={o.title}
                  onClick={() => {
                    onChange(o.key);
                    requestClose();
                  }}
                >
                  <span className="catdd-name">{o.label}</span>
                  {o.key === value && (
                    <i className="fa-solid fa-check catdd-check" aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}


function fmtDayShort(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const thisYear = new Date().getFullYear();
  return new Date(y, m - 1, d).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    ...(y === thisYear ? {} : { year: "numeric" }),
  });
}

export function CalendarView({
  catalog,
  sowings,
  harvests,
  plantedCropIds,
  veldScopes,
  onAddSowing,
  onUpdateSowing,
  onRemoveSowing,
  onLocateCrop,
  unresolvedPlantings = 0,
  onLogHarvest: _onLogHarvest,
}: Props) {
  const [q, setQ] = useState("");
  const [scopeKey, setScopeKey] = useState<string>("planted");
  

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editDateId, setEditDateId] = useState<string | null>(null);
  const form = useCollapseForm();
  const [pickCrop, setPickCrop] = useState("");
  const [pickDate, setPickDate] = useState(todayLocal);
  const [pickNote, setPickNote] = useState("");

  const now = useMemo(() => new Date(), []);
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  
  const day = now.getDate();

  const sowNow = useMemo(() => sowableInMonth(catalog, month), [catalog, month]);
  
  
  
  
  const sownKeys = useMemo(() => {
    const set = new Set<string>();
    for (const s of sowings) {
      if (s.cropId) set.add(s.cropId);
      const n = s.cropName.trim().toLowerCase();
      if (n) set.add(`naam:${n}`);
    }
    return set;
  }, [sowings]);
  
  const plantedKeys = useMemo(() => {
    const set = new Set<string>(plantedCropIds);
    for (const c of catalog) {
      if (plantedCropIds.has(c.id)) {
        const n = c.name.trim().toLowerCase();
        if (n) set.add(`naam:${n}`);
      }
    }
    return set;
  }, [plantedCropIds, catalog]);
  const isPlanted = (c: Crop) =>
    plantedKeys.has(c.id) ||
    plantedKeys.has(`naam:${c.name.trim().toLowerCase()}`);
  const harvestOnly = useMemo(
    () =>
      catalog.filter((c) => {
        const h = harvestWindowOf(c);
        if (h === null || !monthInWindow(month, h.start, h.end)) return false;
        if (sowWindowOf(c) && monthInWindow(month, sowWindowOf(c)!.start, sowWindowOf(c)!.end)) return false;
        return (
          isPlanted(c) ||
          sownKeys.has(c.id) ||
          sownKeys.has(`naam:${c.name.trim().toLowerCase()}`)
        );
      }),
    
    [catalog, month, sownKeys, plantedKeys]
  );

  const withWindow = useMemo(
    () => catalog.filter((c) => sowWindowOf(c) !== null),
    [catalog]
  );

  
  const plantedAll = useMemo(() => {
    const withW: Crop[] = [];
    const withoutW: Crop[] = [];
    for (const c of catalog) {
      if (!isPlanted(c)) continue;
      (sowWindowOf(c) ? withW : withoutW).push(c);
    }
    return [...withW, ...withoutW];
    
  }, [catalog, plantedKeys]);

  
  const veldScope = useMemo(
    () =>
      scopeKey.startsWith(VELD_PREFIX)
        ? (veldScopes.find((v) => `${VELD_PREFIX}${v.id}` === scopeKey) ?? null)
        : null,
    [veldScopes, scopeKey]
  );
  const veldKeys = useMemo(() => {
    if (!veldScope) return null;
    const set = new Set<string>(veldScope.cropIds);
    for (const c of catalog) {
      if (veldScope.cropIds.includes(c.id)) {
        const n = c.name.trim().toLowerCase();
        if (n) set.add(`naam:${n}`);
      }
    }
    return set;
  }, [veldScope, catalog]);
  const scoped = useMemo(() => {
    if (scopeKey === "catalog") return withWindow;
    if (!veldScope || !veldKeys) return plantedAll;
    return plantedAll.filter(
      (c) => veldKeys.has(c.id) || veldKeys.has(`naam:${c.name.trim().toLowerCase()}`)
    );
  }, [plantedAll, withWindow, scopeKey, veldScope, veldKeys]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return scoped;
    return scoped.filter((c) => c.name.toLowerCase().includes(s));
  }, [scoped, q]);

  
  const marks = useMemo(() => {
    const sown = new Map<string, number>();
    const harvested = new Map<string, number>();
    for (const s of sowings) {
      const m = Number(s.date.slice(5, 7));
      if (!m) continue;
      const keys = s.cropId
        ? [s.cropId, s.cropName.trim().toLowerCase()]
        : [s.cropName.trim().toLowerCase()];
      for (const k of keys) sown.set(`${k}:${m}`, (sown.get(`${k}:${m}`) ?? 0) + 1);
    }
    for (const h of harvests) {
      const m = Number(h.date.slice(5, 7));
      if (!m) continue;
      const base = (h.cropName ?? "").trim().toLowerCase();
      const keys = h.cropId ? [h.cropId, base] : [base];
      for (const k of keys) {
        if (k) harvested.set(`${k}:${m}`, (harvested.get(`${k}:${m}`) ?? 0) + 1);
      }
    }
    return { sown, harvested };
  }, [sowings, harvests]);

  const countFor = (crop: Crop, m: number, src: Map<string, number>): number => {
    let n = 0;
    for (const k of [crop.id, crop.name.trim().toLowerCase()]) {
      n += src.get(`${k}:${m}`) ?? 0;
    }
    return n;
  };

  
  const toneOf = (c: Crop, m: number) => {
    const sow = sowWindowOf(c);
    const harv = harvestWindowOf(c);
    const inSow = sow !== null && monthInWindow(m, sow.start, sow.end);
    const inHarv = harv !== null && monthInWindow(m, harv.start, harv.end);
    const both = inSow && inHarv;
    const cls = [
      both ? (sameWindow(sow, harv) ? "cal-cell-cycle" : "cal-cell-both") : "",
      !both && inSow ? "cal-cell-sow" : "",
      !both && inHarv ? "cal-cell-harv" : "",
    ].filter(Boolean);
    return { inSow, inHarv, both, cls };
  };

  
  const hlCls = "";

  const sortedSowings = useMemo(
    () => sowings.slice().sort((a, b) => b.date.localeCompare(a.date)),
    [sowings]
  );

  const startAdd = (cropId: string) => {
    setPickCrop(cropId);
    setPickDate(todayLocal());
    setPickNote("");
    form.openForm();
  };

  const submitAdd = () => {
    const crop = catalog.find((c) => c.id === pickCrop) ?? catalog[0];
    if (!crop || !pickDate) return;
    onAddSowing({
      cropId: crop.id,
      cropName: cropLabel(crop),
      date: pickDate,
      note: pickNote.trim() || undefined,
    });
    setPickNote("");
    form.closeForm();
  };

  return (
    <div className="cal-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="cal-title">Zaaikalender</h1>
          <p style={{ margin: "6px 0 0", color: "var(--ink-soft)", fontSize: 16 }}>Zaai- en oogstmomenten voor jouw tuin.</p>
        </div>
        <span style={{ background: "var(--surface)", borderRadius: 99, padding: "10px 18px", fontWeight: 700, fontSize: 14 }}>{day} {MONTHS_LONG[month - 1]} {year}</span>
      </div>

      <div className="cal-cards">
        <div style={{ background: "var(--primary)", color: "var(--bg)", borderRadius: 28, padding: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--harvest)" }}>Deze maand</div>
          <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: 64, lineHeight: 1, marginTop: 14 }}>{harvestOnly.length}</div>
          <div style={{ fontSize: 16, marginTop: 4 }}>gewassen te oogsten</div>
          <p style={{ fontSize: 14, margin: "16px 0 0", opacity: .85, lineHeight: 1.5 }}>
            {sowNow.length === 0 ? "Geen actief zaaivenster. Stel zaaiperiodes in via Gewassen." : "Actief zaaivenster deze maand."}
          </p>
        </div>
        <div style={{ background: "var(--surface)", borderRadius: 28, padding: 28 }}>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>Te oogsten</div>
          <div className="cal-harvest-grid">
            {harvestOnly.map((c) => {
              const h = harvestWindowOf(c);
              return (
                <div key={c.id} style={{ background: "var(--bg)", borderRadius: 18, padding: "14px 16px" }}>
                  <b>{cropLabel(c)}</b>
                  <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>{h ? windowText(h) : ""}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {}
      <section className="cal-panel">

        {scopeKey === "planted" && unresolvedPlantings > 0 && (
          <p className="insp-hint">
            Er {unresolvedPlantings === 1 ? "staat 1 stuk" : `staan ${unresolvedPlantings} stukken`} op
            de canvas waarvan het gewas niet meer in de database staat. Plant{" "}
            {unresolvedPlantings === 1 ? "het" : "ze"} opnieuw vanuit de gewassenlijst.
          </p>
        )}

        {filtered.length === 0 ? (
          <p className="insp-hint">
            {withWindow.length === 0
              ? "Nog geen zaaiperiodes ingesteld. Stel ze in via Gewassen → Bewerken."
              : scopeKey === "planted" && scoped.length === 0
                ? "Nog niets in de tuin geplant. Kies “Alle gewassen” om alles te zien."
                : "Geen gewassen gevonden."}
          </p>
        ) : (
          <>
          <div className="cal-year-card">
            <div className="cal-scroll-inner">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
                <div style={{ fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 800, fontSize: 24 }}>Jaaroverzicht <span style={{ color: "var(--ink-soft)", fontWeight: 700 }}>{year}</span></div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <ScopeDropdown
                    value={scopeKey}
                    plantedCount={plantedAll.length}
                    catalogCount={withWindow.length}
                    velds={veldScopes ?? []}
                    onChange={setScopeKey}
                  />
                  <input
                    className="cal-search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Zoek gewas…"
                    aria-label="Zoek gewas"
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 13, fontWeight: 700, alignItems: "center", marginBottom: 16 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 4, background: "var(--sow)" }}></span>zaaien</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 4, background: "var(--harvest)" }}></span>oogsten</span>
              </div>
              <div className="cal-month-head">
                <div></div>
                {MONTHS_SHORT.map((m, i) => (
                  <div key={m} className="mh">
                    <span className={i + 1 === month ? "mh-active" : undefined}>
                      <span className="mh-full">{m.toUpperCase()}</span>
                      <span className="mh-abbr">{m.slice(0, 2).toUpperCase()}</span>
                    </span>
                  </div>
                ))}
              </div>
              {filtered.map((c) => {
                const sw = sowWindowOf(c);
                const hw = harvestWindowOf(c);
                return (
                  <div key={c.id} className="row">
                    <span className="nm">
                      <button type="button" onClick={() => startAdd(c.id)} title={`${cropLabel(c)}`} className="nm-name">
                        <CropGlyph iconKey={c.icon} cropName={c.name} label={c.name} />
                        {c.name}
                      </button>
                      {isPlanted(c) && (
                        <button type="button" className="nm-goto" title={`Toon ${cropLabel(c)} in tuin`} aria-label={`Toon ${cropLabel(c)} in tuin`} onClick={() => onLocateCrop(c.id)}>
                          <i className="fa-solid fa-location-crosshairs" aria-hidden="true" />
                        </button>
                      )}
                    </span>
                    <div className="cal-bars">
                      {sw && (
                        <div className="z" title={`Zaaien: ${windowText(sw)}`} style={{ gridColumn: `${sw.start} / ${sw.end + 1}` }} />
                      )}
                      {hw && (
                        <div className="o" title={`Oogsten: ${windowText(hw)}`} style={{ gridColumn: `${hw.start} / ${hw.end + 1}` }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </>
        )}
      </section>

      {}
      <section className="cal-panel">
        <div className="cal-panel-head">
          <h3 className="cal-h">
            Gezaaid
            <span className="cal-n">{sowings.length}</span>
          </h3>
          <button className="btn-primary" onClick={form.toggleForm}>
            {form.open ? (
              <>
                <i className="fa-solid fa-xmark" /> Sluiten
              </>
            ) : (
              <>
                <i className="fa-solid fa-plus" /> Loggen
              </>
            )}
          </button>
        </div>

        <SowLogModal
          mounted={form.mounted}
          open={form.open}
          catalog={catalog}
          pickCrop={pickCrop}
          pickDate={pickDate}
          pickNote={pickNote}
          onPickCrop={setPickCrop}
          onPickDate={setPickDate}
          onPickNote={setPickNote}
          onSubmit={submitAdd}
          onClose={form.closeForm}
        />

        {sortedSowings.length === 0 ? (
          <p className="insp-hint">
            Nog niets gelogd. Klik op een gewas hierboven of op “Loggen”.
          </p>
        ) : (
          <div className="pd-list">
            {sortedSowings.map((s) => {
              const crop =
                catalog.find((c) => c.id === s.cropId) ??
                catalog.find(
                  (c) => c.name.trim().toLowerCase() === s.cropName.trim().toLowerCase()
                );
              return (
                <div key={s.id} className="cal-log">
                  <CropGlyph
                    iconKey={crop?.icon}
                    cropName={s.cropName}
                    label={s.cropName}
                    color={crop?.color}
                    className="crop-icon pd-icon"
                  />
                  <div className="pd-card-main">
                    <div className="pd-card-title">{s.cropName}</div>
                    <div className="pd-card-meta">
                      <span className="cal-log-date">
                        <i className="fa-solid fa-calendar-day" />
                        {fmtDayShort(s.date)}
                      </span>
                      {s.note && <span className="cal-log-note">{s.note}</span>}
                    </div>
                  </div>
                  <div className="cal-log-actions">
                    {editDateId === s.id ? (
                      <input
                        type="date"
                        className="cal-date-edit"
                        value={s.date}
                        autoFocus
                        onChange={(e) =>
                          e.target.value && onUpdateSowing(s.id, { date: e.target.value })
                        }
                        onBlur={() => setEditDateId(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Escape") setEditDateId(null);
                        }}
                        aria-label="Zaadatum aanpassen"
                      />
                    ) : (
                      <button
                        className="cal-log-edit"
                        onClick={() => setEditDateId(s.id)}
                        title="Zaadatum aanpassen"
                        aria-label="Zaadatum aanpassen"
                      >
                        <i className="fa-solid fa-pen" />
                      </button>
                    )}
                    {confirmId === s.id ? (
                      <>
                        <span className="gl-confirm">Wissen?</span>
                        <button
                          className="btn-danger cal-log-confirm"
                          onClick={() => {
                            onRemoveSowing(s.id);
                            setConfirmId(null);
                          }}
                        >
                          Ja
                        </button>
                        <button className="cal-log-confirm" onClick={() => setConfirmId(null)}>
                          Nee
                        </button>
                      </>
                    ) : (
                      <button
                        className="cal-log-edit cal-log-del"
                        onClick={() => setConfirmId(s.id)}
                        title="Zaailog verwijderen"
                        aria-label="Zaailog verwijderen"
                      >
                        <i className="fa-solid fa-trash" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

