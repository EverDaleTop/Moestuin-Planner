import { useEffect, useMemo, useState } from "react";
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
  seasonLabel,
  upcomingSowStarts,
  sameWindow,
  windowText,
  windowLine,
} from "./sowing";
import {
  getNotifyPrefs,
  saveNotifyPrefs,
  requestNotifyPermission,
  permissionState,
  checkSowReminders,
  type NotifyPrefs,
} from "./notifications";
import { useCollapseForm } from "./useCollapseForm";

interface Props {
  gardenId: string;
  catalog: Crop[];
  sowings: SowingEntry[];
  harvests: HarvestEntry[];
  /** gewas-ids die ergens in een bed geplant staan */
  plantedCropIds: Set<string>;
  onAddSowing: (entry: Omit<SowingEntry, "id">) => void;
  onUpdateSowing: (sId: string, patch: Partial<SowingEntry>) => void;
  onRemoveSowing: (sId: string) => void;
  /** spring naar de tuin en highlight waar dit gewas staat */
  onLocateCrop: (cropId: string) => void;
}

type Filter = "all" | "sow" | "harvest";

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Datum vandaag/dit jaar anders, zodat recente logs compact blijven. */
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

function fmtMonthDay(date: Date): string {
  return date.toLocaleDateString("nl-NL", { day: "numeric", month: "long" });
}

function inDaysLabel(days: number): string {
  if (days === 0) return "vandaag";
  if (days === 1) return "morgen";
  if (days < 14) return `over ${days} dagen`;
  if (days < 60) return `over ${Math.round(days / 7)} weken`;
  return `over ${Math.round(days / 30)} maanden`;
}

export function CalendarView({
  gardenId,
  catalog,
  sowings,
  harvests,
  plantedCropIds,
  onAddSowing,
  onUpdateSowing,
  onRemoveSowing,
  onLocateCrop,
}: Props) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editDateId, setEditDateId] = useState<string | null>(null);
  const form = useCollapseForm();
  const [pickCrop, setPickCrop] = useState("");
  const [pickDate, setPickDate] = useState(todayLocal);
  const [pickNote, setPickNote] = useState("");

  const [prefs, setPrefs] = useState<NotifyPrefs>(() => getNotifyPrefs(gardenId));
  const [perm, setPerm] = useState(() => permissionState());
  const [permHint, setPermHint] = useState(false);

  const now = useMemo(() => new Date(), []);
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  useEffect(() => {
    checkSowReminders(gardenId, catalog, new Date());
    const t = window.setInterval(
      () => checkSowReminders(gardenId, catalog, new Date()),
      3600 * 1000
    );
    return () => window.clearInterval(t);
  }, [gardenId, catalog]);

  const upcoming = useMemo(
    () => upcomingSowStarts(catalog, new Date(), prefs.daysBefore),
    [catalog, prefs.daysBefore]
  );
  const sowNow = useMemo(() => sowableInMonth(catalog, month), [catalog, month]);
  // Gewassen die je nu zowel kunt zaaien als oogsten staan niet dubbel:
  // die komen alleen in "Nu zaaien" te staan, met "zaai én oogst" erbij.
  const harvestOnly = useMemo(
    () =>
      catalog.filter((c) => {
        const h = harvestWindowOf(c);
        if (h === null || !monthInWindow(month, h.start, h.end)) return false;
        return !sowWindowOf(c) || !monthInWindow(month, sowWindowOf(c)!.start, sowWindowOf(c)!.end);
      }),
    [catalog, month]
  );

  const withWindow = useMemo(
    () => catalog.filter((c) => sowWindowOf(c) !== null),
    [catalog]
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = withWindow;
    if (filter === "sow") list = list.filter((c) => sowWindowOf(c)!.start === month);
    if (filter === "harvest") {
      list = list.filter((c) => {
        const h = harvestWindowOf(c);
        return h !== null && monthInWindow(month, h.start, h.end);
      });
    }
    if (!s) return list;
    return list.filter((c) => c.name.toLowerCase().includes(s));
  }, [withWindow, q, filter, month]);

  /** marks per crop+month: sowings and harvests */
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

  const savePrefs = (next: NotifyPrefs) => {
    setPrefs(next);
    saveNotifyPrefs(gardenId, next);
  };

  const enableNotifications = async () => {
    const ok = await requestNotifyPermission();
    setPerm(permissionState());
    if (ok) {
      savePrefs({ ...prefs, enabled: true });
      setPermHint(false);
      checkSowReminders(gardenId, catalog, new Date());
    } else {
      setPermHint(true);
    }
  };

  const sendTest = () => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      new Notification("Moestuin-meldingen aan", {
        body: "Je krijgt nu een seintie als een zaaivenster nadert.",
      });
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="shop-page cal-page">
      {/* Hero + huidige maand */}
      <div className="shop-hero">
        <div className="shop-hero-text">
          <h2>
            <i className="fa-solid fa-calendar-days" /> Zaaikalender
          </h2>
          <p>
            Wat je nu kunt zaaien, wanneer je kunt oogsten en wat je al hebt
            gezaaid.
          </p>
        </div>
        <div className="cal-hero-actions">
          <div className="cal-now-badge">
            <span className="cal-now-num">{month}</span>
            <span className="cal-now-txt">
              <strong>{MONTHS_LONG[month - 1]}</strong>
              <span>{year}</span>
            </span>
          </div>
          <button
            className={`cal-bell${prefs.enabled ? " cal-bell-on" : ""}`}
            onClick={() => {
              if (prefs.enabled) savePrefs({ ...prefs, enabled: false });
              else void enableNotifications();
            }}
            title={prefs.enabled ? "Meldingen uitzetten" : "Meldingen aanzetten"}
            aria-pressed={prefs.enabled}
          >
            <i className={`fa-solid ${prefs.enabled ? "fa-bell" : "fa-bell-slash"}`} />
          </button>
        </div>
      </div>

      {/* Deze maand: zaaien + oogsten */}
      <div className="cal-now-grid">
        <section className="cal-panel">
          <h3 className="cal-h">
            <i className="fa-solid fa-seedling" /> Nu zaaien
            <span className="cal-n">{sowNow.length}</span>
          </h3>
          {sowNow.length === 0 ? (
            <p className="insp-hint">
              Deze maand geen actief zaaivenster. Stel zaaiperiodes in via Gewassen →
              Bewerken.
            </p>
          ) : (
            <div className="cal-chips">
              {sowNow.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="cal-chip"
                  onClick={() => startAdd(c.id)}
title={`${cropLabel(c)} als gezaaid loggen`}
                  >
                    <CropGlyph iconKey={c.icon} cropName={c.name} color={c.color} />
                    <span className="cal-chip-txt">
                      <span className="cal-chip-name">{cropLabel(c)}</span>
                      <span className="cal-chip-sub">{seasonLabel(c)}</span>
                  </span>
                  <i className="fa-solid fa-plus cal-chip-add" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="cal-panel">
          <h3 className="cal-h">
            <i className="fa-solid fa-basket-shopping" /> Te oogsten
            <span className="cal-n">{harvestOnly.length}</span>
          </h3>
          {harvestOnly.length === 0 ? (
            <p className="insp-hint">
              Deze maand geen verwachte oogst. Kijk in het jaaroverzicht wat wanneer
              klaar is.
            </p>
          ) : (
            <div className="cal-chips">
              {harvestOnly.map((c) => {
                const h = harvestWindowOf(c)!;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="cal-chip cal-chip-harvest"
                    onClick={() => startAdd(c.id)}
                    title={`${cropLabel(c)} als gezaaid loggen`}
                  >
                    <CropGlyph iconKey={c.icon} cropName={c.name} color={c.color} />
                    <span className="cal-chip-txt">
                      <span className="cal-chip-name">{cropLabel(c)}</span>
                      <span className="cal-chip-sub">
                        {windowText(h)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Jaaroverzicht */}
      <section className="cal-panel">
        <div className="cal-panel-head">
          <h3 className="cal-h">
            <i className="fa-solid fa-table-cells" /> Jaaroverzicht {year}
          </h3>
          <div className="cal-tools">
            <div className="cal-seg" role="group" aria-label="Filter maand">
              {(
                [
                  ["all", "Alles"],
                  ["sow", "Zaaien"],
                  ["harvest", "Oogsten"],
                ] as [Filter, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={filter === key ? "cal-seg-btn on" : "cal-seg-btn"}
                  onClick={() => setFilter(key)}
                  aria-pressed={filter === key}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              className="pd-search cal-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Zoek gewas…"
            />
          </div>
        </div>

        <div className="cal-legend">
          <span className="cal-lg">
            <span className="cal-lg-sw cal-lg-sow" /> zaaien
          </span>
          <span className="cal-lg">
            <span className="cal-lg-sw cal-lg-harv" /> oogsten
          </span>
          <span className="cal-lg">
            <span className="cal-lg-sw cal-lg-both" /> zaaien én oogsten
          </span>
          <span className="cal-lg">
            <span className="cal-lg-sw cal-lg-now" /> deze maand
          </span>
          <span className="cal-lg">🌱 gezaaid</span>
          <span className="cal-lg">🧺 geoogst</span>
        </div>

        {filtered.length === 0 ? (
          <p className="insp-hint">
            {withWindow.length === 0
              ? "Nog geen zaaiperiodes ingesteld. Stel ze in via Gewassen → Bewerken."
              : "Geen gewassen gevonden."}
          </p>
        ) : (
          <div className="cal-table-wrap">
            <table className="cal-table">
              <thead>
                <tr>
                  <th className="cal-crop-col">Gewas</th>
                  {MONTHS_SHORT.map((m, i) => (
                    <th key={m} className={i + 1 === month ? "cal-th-now" : ""}>
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, idx) => {
                  const sow = sowWindowOf(c)!;
                  const harv = harvestWindowOf(c);
                  // Zaaien en oogsten in dezelfde maanden is één doorlopend
                  // seizoen: dan één cel en één vermelding, geen dubbele.
                  const cycle = sameWindow(sow, harv);
                  return (
                    <tr
                      key={c.id}
                      className="cal-row"
                      style={{ animationDelay: `${Math.min(idx, 9) * 0.03}s` }}
                    >
                      <td className="cal-crop-col">
                        <div className="cal-crop-cell">
                          <button
                            type="button"
                            className="cal-crop-btn"
                            onClick={() => startAdd(c.id)}
                            title={`${cropLabel(c)} — ${windowLine(c) ?? ""} (klik om zaaien te loggen)`}
                          >
                            <CropGlyph iconKey={c.icon} cropName={c.name} color={c.color} className="cal-crop-emoji" />
                            <span className="cal-crop-name">{c.name}</span>
                          </button>
                          {plantedCropIds.has(c.id) && (
                            <button
                              type="button"
                              className="cal-locate-btn"
                              onClick={() => onLocateCrop(c.id)}
                              title={`${cropLabel(c)} tonen in de tuin`}
                              aria-label={`${cropLabel(c)} tonen in de tuin`}
                            >
                              <i className="fa-solid fa-crosshairs" />
                            </button>
                          )}
                        </div>
                      </td>
                      {MONTHS_SHORT.map((_, i) => {
                        const m = i + 1;
                        const inSow = monthInWindow(m, sow.start, sow.end);
                        const inHarv =
                          harv !== null && monthInWindow(m, harv.start, harv.end);
                        const isNow = m === month;
                        const sown = countFor(c, m, marks.sown);
                        const harvested = countFor(c, m, marks.harvested);
                        const both = inSow && inHarv;
                        const title = [
                          cropLabel(c),
                          MONTHS_LONG[m - 1],
                          both
                            ? "zaaien én oogsten"
                            : inSow
                              ? "zaaien"
                              : inHarv
                                ? "oogsten"
                                : "",
                          sown > 0 ? `${sown}× gezaaid` : "",
                          harvested > 0 ? `${harvested}× geoogst` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ");
                        return (
                          <td
                            key={m}
                            className={[
                              "cal-cell",
                              both ? (cycle ? "cal-cell-cycle" : "cal-cell-both") : "",
                              !both && inSow ? "cal-cell-sow" : "",
                              !both && inHarv ? "cal-cell-harv" : "",
                              isNow ? "cal-cell-now" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            title={title}
                          >
                            {sown > 0 && (
                              <span className="cal-mark" aria-label={`${sown} keer gezaaid`}>
                                🌱
                              </span>
                            )}
                            {harvested > 0 && (
                              <span className="cal-mark" aria-label={`${harvested} keer geoogst`}>
                                🧺
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Gezaaid loggen */}
      <section className="cal-panel">
        <div className="cal-panel-head">
          <h3 className="cal-h">
            <i className="fa-solid fa-clipboard-check" /> Gezaaid
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

        {form.mounted && (
          <div className={`shop-form ${form.open ? "" : "shop-form-closing"}`}>
            <div className="shop-form-inner">
              <div className="shop-form-panel">
                <div className="shop-form-header">
                  <i className="fa-solid fa-seedling" />
                  <span>Zaaien gelogd</span>
                </div>
                <div className="shop-form-grid">
                  <div className="shop-form-field">
                    <label>Gewas</label>
                    <select
                      value={pickCrop || catalog[0]?.id || ""}
                      onChange={(e) => setPickCrop(e.target.value)}
                    >
                      {catalog.map((c) => (
                        <option key={c.id} value={c.id}>
                          {cropLabel(c)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="shop-form-field">
                    <label>Datum</label>
                    <input
                      type="date"
                      value={pickDate}
                      onChange={(e) => setPickDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="shop-form-field">
                  <label>Notitie (optioneel)</label>
                  <input
                    value={pickNote}
                    onChange={(e) => setPickNote(e.target.value)}
                    placeholder="bijv. binnenshuis voorzaaien"
                  />
                </div>
                <div className="shop-form-footer">
                  <button
                    className="btn-primary"
                    onClick={submitAdd}
                    disabled={!pickDate || catalog.length === 0}
                  >
                    <i className="fa-solid fa-check" /> Opslaan
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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

      {/* Meldingen */}
      <section className="cal-panel">
        <h3 className="cal-h">
          <i className={`fa-solid ${prefs.enabled ? "fa-bell" : "fa-bell-slash"}`} /> Meldingen
        </h3>
        <div className="cal-notify">
          <label className="cal-toggle">
            <input
              type="checkbox"
              checked={prefs.enabled}
              onChange={() => {
                if (prefs.enabled) savePrefs({ ...prefs, enabled: false });
                else void enableNotifications();
              }}
            />
            <span>Waarschuw me als een zaaivenster nadert</span>
          </label>
          <label className="cal-days">
            <span>Dagen vooraf</span>
            <input
              type="number"
              min={0}
              max={60}
              value={prefs.daysBefore}
              onChange={(e) => {
                const v = Math.max(
                  0,
                  Math.min(60, Math.round(Number(e.target.value) || 0))
                );
                savePrefs({ ...prefs, daysBefore: v });
              }}
            />
          </label>
          {prefs.enabled && (
            <button className="btn-ghost" onClick={sendTest}>
              <i className="fa-solid fa-vial" /> Testmelding
            </button>
          )}
        </div>
        {permHint && (
          <p className="insp-hint">
            Meldingen zijn geblokkeerd. Sta ze toe via het slotje in de adresbalk en
            probeer opnieuw.
          </p>
        )}
        {perm === "unsupported" && (
          <p className="insp-hint">Deze browser ondersteunt geen meldingen.</p>
        )}
        {upcoming.length === 0 ? (
          <p className="insp-hint">
            Geen zaaivensters in de komende {prefs.daysBefore} dagen.
          </p>
        ) : (
          <div className="pd-list">
            {upcoming.map((u) => (
              <div key={u.key} className="pd-card cal-log">
                <CropGlyph
                  iconKey={u.crop.icon}
                  cropName={u.crop.name}
                  label={u.crop.name}
                  color={u.crop.color}
                  className="crop-icon pd-icon"
                />
                <div className="pd-card-main">
                  <div className="pd-card-title">{u.crop.name}</div>
                  <div className="pd-card-meta">
                    zaaien vanaf {fmtMonthDay(u.date)} · {inDaysLabel(u.daysUntil)}
                  </div>
                </div>
                <div className="pd-card-actions">
                  <button onClick={() => startAdd(u.crop.id)}>
                    <i className="fa-solid fa-seedling" /> Loggen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}