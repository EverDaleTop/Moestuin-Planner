import { useState } from "react";
import type { Crop } from "./types";
import { CropGlyph } from "./CropIconPicker";
import { upcomingSowStarts } from "./sowing";
import {
  getNotifyPrefs,
  saveNotifyPrefs,
  requestNotifyPermission,
  permissionState,
  type NotifyPrefs,
} from "./notifications";

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

/** Zaai-meldingen: hoort bij Instellingen, niet als eigen kaart op de kalender. */
export function SowNotifySettings({
  gardenId,
  catalog,
}: {
  gardenId: string;
  catalog: Crop[];
}) {
  const [prefs, setPrefs] = useState<NotifyPrefs>(() => getNotifyPrefs(gardenId));
  const [permHint, setPermHint] = useState(false);
  const perm = permissionState();
  const upcoming = upcomingSowStarts(catalog, new Date(), prefs.daysBefore);

  const savePrefs = (next: NotifyPrefs) => {
    setPrefs(next);
    saveNotifyPrefs(gardenId, next);
  };

  const enableNotifications = async () => {
    const ok = await requestNotifyPermission();
    if (ok) {
      savePrefs({ ...prefs, enabled: true });
      setPermHint(false);
    } else {
      setPermHint(true);
    }
  };

  return (
    <section className="st-section">
      <div className="st-side">
        <h3>Zaai-meldingen</h3>
      </div>
      <div className="st-main">
        <div className="st-switchrow">
          <button
            type="button"
            role="switch"
            aria-checked={prefs.enabled}
            aria-label="Zaai-meldingen aan of uit"
            className={`cal-switch${prefs.enabled ? " on" : ""}`}
            onClick={() => {
              if (prefs.enabled) savePrefs({ ...prefs, enabled: false });
              else void enableNotifications();
            }}
          >
            <span className="cal-switch-knob" />
          </button>
          <span className="st-switchtext">Meldingen</span>
          <span className="st-stepper">
            <button
              type="button"
              aria-label="Minder dagen vooraf"
              disabled={prefs.daysBefore <= 0}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                savePrefs({ ...prefs, daysBefore: Math.max(0, prefs.daysBefore - 1) })
              }
            >
              <i className="fa-solid fa-minus" />
            </button>
            <span className="st-stepval">{prefs.daysBefore}d vooraf</span>
            <button
              type="button"
              aria-label="Meer dagen vooraf"
              disabled={prefs.daysBefore >= 60}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() =>
                savePrefs({
                  ...prefs,
                  daysBefore: Math.min(60, prefs.daysBefore + 1),
                })
              }
            >
              <i className="fa-solid fa-plus" />
            </button>
          </span>
        </div>
        {permHint && (
          <p className="st-hint">
            Meldingen zijn geblokkeerd. Sta ze toe via het slotje in de adresbalk en
            probeer opnieuw.
          </p>
        )}
        {perm === "unsupported" && (
          <p className="st-hint">Deze browser ondersteunt geen meldingen.</p>
        )}
        {upcoming.length === 0 ? (
          <p className="st-hint">
            Geen zaaivensters in de komende {prefs.daysBefore} dagen.
          </p>
        ) : (
          <ul className="st-upcoming">
            {upcoming.map((u) => (
              <li key={u.key} className="st-sow">
                <CropGlyph
                  iconKey={u.crop.icon}
                  cropName={u.crop.name}
                  label={u.crop.name}
                  color={u.crop.color}
                  className="crop-icon st-sow-icon"
                />
                <span className="st-sow-name">{u.crop.name}</span>
                <span className="st-sow-when">
                  vanaf {fmtMonthDay(u.date)} · {inDaysLabel(u.daysUntil)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
