import { useEffect, useMemo, useState } from "react";
import type { Garden, Crop } from "./types";
import type { PresenceMember } from "./realtime";
import { api, inviteUrl } from "./api";
import { ConfirmModal } from "./ConfirmModal";
import { CategoryDropdown } from "./CategoryDropdown";
import {
  checkSowReminders,
  getNotifyPrefs,
  permissionState,
  requestNotifyPermission,
  saveNotifyPrefs,
} from "./notifications";

interface Props {
  garden: Garden;
  catalog: Crop[];
  name: string;
  currentUserId: string;
  userNames: Record<string, string>;
  onlineMembers: PresenceMember[];
  isOwner: boolean;
  onNameChange: (name: string) => void;
  onGardenUpdated: (garden: Garden) => void;
  onUnshareMember: (userId: string) => Promise<void>;
  onDeleteGarden: () => void;
}

const REMINDER_DAY_OPTIONS = [
  { key: "0", label: "Op de dag zelf", icon: "fa-calendar-day", tone: "green" },
  { key: "3", label: "3 dagen vooraf", icon: "fa-calendar-day", tone: "green" },
  { key: "7", label: "7 dagen vooraf", icon: "fa-calendar-day", tone: "green" },
  { key: "14", label: "14 dagen vooraf", icon: "fa-calendar-day", tone: "green" },
];

/**
 * Tuininstellingen: naam, delen/toegang en leden beheren op één plek.
 */
export function GardenSettings({
  garden,
  catalog,
  name,
  currentUserId,
  userNames,
  onlineMembers,
  isOwner,
  onNameChange,
  onGardenUpdated,
  onUnshareMember,
  onDeleteGarden,
}: Props) {
  const [draftName, setDraftName] = useState(name);
  const [shared, setShared] = useState<"idle" | "shared" | "copied">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kicking, setKicking] = useState<string | null>(null);
  const [newMember, setNewMember] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [prefs, setPrefs] = useState(() => getNotifyPrefs(garden.id));
  const [permission, setPermission] = useState(() => permissionState());

  useEffect(() => {
    setPrefs(getNotifyPrefs(garden.id));
    setPermission(permissionState());
  }, [garden.id]);

  const savePrefs = (next: typeof prefs) => {
    setPrefs(next);
    saveNotifyPrefs(garden.id, next);
  };

  const toggleReminders = async () => {
    if (prefs.enabled) {
      savePrefs({ ...prefs, enabled: false });
      return;
    }
    const ok = await requestNotifyPermission();
    setPermission(permissionState());
    if (ok) savePrefs({ ...prefs, enabled: true });
  };

  const [reminders, setReminders] = useState<
    ReturnType<typeof checkSowReminders>
  >([]);

  useEffect(() => {
    setReminders(checkSowReminders(garden.id, catalog));
  }, [garden.id, catalog, prefs]);
  useEffect(() => {
    setDraftName(name);
  }, [garden.id, name]);

  const dirty = draftName.trim().length > 0 && draftName.trim() !== name;

  const saveName = () => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      setDraftName(name);
      return;
    }
    if (trimmed !== name) onNameChange(trimmed);
    setDraftName(trimmed);
  };

  const link = inviteUrl(garden);
  const onlineIds = useMemo(
    () => new Set(onlineMembers.map((m) => m.userId)),
    [onlineMembers],
  );

  const memberIds = useMemo(() => {
    const ids = [garden.ownerId, ...garden.sharedWith];
    return ids.filter((id, i) => ids.indexOf(id) === i);
  }, [garden.ownerId, garden.sharedWith]);

  const displayName = (userId: string) =>
    userId === currentUserId ? "Jij" : (userNames[userId] ?? "Onbekend");

  const shareLink = async () => {
    if (!link) return;
    setError(null);
    const shareData = {
      title: `Deel ${garden.name}`,
      text: `Doe mee met ${garden.name} op oogstplan.`,
      url: link,
    };
    // Native deelvenster van het apparaat (mobiel/ondersteunde browsers).
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setShared("shared");
        window.setTimeout(() => setShared("idle"), 1500);
        return;
      } catch (err: unknown) {
        // Gebruiker heeft het deelvenster geannuleerd: geen fout tonen.
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }
    // Fallback voor browsers/apparaten zonder Web Share: link kopiëren.
    try {
      await navigator.clipboard.writeText(link);
      setShared("copied");
      window.setTimeout(() => setShared("idle"), 1500);
    } catch {
      setError("Delen lukte niet. Selecteer de link en kopieer hem handmatig.");
    }
  };

  const regenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.regenerateInvite(garden.id);
      onGardenUpdated(updated);
      setShared("idle");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Nieuwe link maken lukte niet.");
    } finally {
      setBusy(false);
    }
  };

  const disableInvite = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.disableInvite(garden.id);
      onGardenUpdated(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Link uitschakelen lukte niet.");
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (userId: string) => {
    setKicking(userId);
    setError(null);
    try {
      await onUnshareMember(userId);
    } catch {
      setError("Toegang intrekken lukte niet.");
    } finally {
      setKicking(null);
    }
  };

  const addMember = async () => {
    const username = newMember.trim();
    if (!username || addingMember) return;
    setAddingMember(true);
    setError(null);
    try {
      const updated = await api.share(garden.id, username);
      onGardenUpdated(updated);
      setNewMember("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Lid toevoegen lukte niet.");
    } finally {
      setAddingMember(false);
    }
  };

  const transferGarden = async () => {
    if (!transferTarget || transferBusy) return;
    setTransferBusy(true);
    setError(null);
    try {
      const updated = await api.transferGarden(garden.id, transferTarget);
      onGardenUpdated(updated);
      setTransferTarget(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Eigenaar overdragen lukte niet.");
    } finally {
      setTransferBusy(false);
    }
  };

  return (
    <div className="gs-page">
      <header className="gs-hero">
        <h2>
          <i className="fa-solid fa-gear" aria-hidden="true" /> Instellingen
        </h2>
        <p>Beheer de naam van je tuin, de toegang en wie er meewerken.</p>
      </header>

      {error && (
        <p className="gs-error" role="alert">
          {error}
        </p>
      )}

      <section className="gs-card">
        <h3>
          <i className="fa-solid fa-pen" aria-hidden="true" /> Tuinnaam
        </h3>
        <div className="gs-name-row">
          <input
            className="gs-name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
            maxLength={80}
            aria-label="Tuinnaam"
            placeholder="Naam van je tuin"
          />
          {dirty && (
            <button type="button" className="btn-primary" onClick={saveName}>
              Opslaan
            </button>
          )}
        </div>
      </section>

      <section className="gs-card">
        <h3>
          <i className="fa-solid fa-user-group" aria-hidden="true" /> Delen en leden
        </h3>

        {isOwner && (
          <div className="gs-share">
            {link ? (
              <>
                <div className="gs-linkbox">
                  <input
                    className="gs-linkinput"
                    value={link}
                    readOnly
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label="Uitnodigingslink"
                  />
                  <button
                    type="button"
                    className="gs-btn"
                    onClick={shareLink}
                    disabled={busy}
                    title="Deel de uitnodigingslink"
                  >
                    <i
                      className={`fa-solid ${
                        shared === "copied"
                          ? "fa-check"
                          : "fa-share-nodes"
                      }`}
                      aria-hidden="true"
                    />
                    <span>
                      {shared === "shared"
                        ? "Gedeeld"
                        : shared === "copied"
                          ? "Gekopieerd"
                          : "Delen"}
                    </span>
                  </button>
                </div>
                <div className="gs-link-actions">
                  <button
                    type="button"
                    className="gs-quiet"
                    onClick={regenerate}
                    disabled={busy}
                    title="Maakt een nieuwe link; de oude stopt direct met werken"
                  >
                    <i className="fa-solid fa-rotate" aria-hidden="true" />
                    <span>Nieuwe link</span>
                  </button>
                  <button
                    type="button"
                    className="gs-quiet gs-quiet-danger"
                    onClick={disableInvite}
                    disabled={busy}
                    title="Schakelt uitnodigen uit; de huidige link stopt met werken"
                  >
                    <i className="fa-solid fa-link-slash" aria-hidden="true" />
                    <span>Uitschakelen</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="gs-linkoff">
                <p>Uitnodigen staat uit. Er is geen geldige link.</p>
                <button type="button" className="gs-btn" onClick={regenerate} disabled={busy}>
                  <i className="fa-solid fa-link" aria-hidden="true" />
                  <span>Nieuwe uitnodigingslink maken</span>
                </button>
              </div>
            )}
          </div>
        )}

        {isOwner && (
          <div className="gs-add-member">
            <input
              className="gs-member-input"
              value={newMember}
              onChange={(e) => setNewMember(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void addMember()}
              placeholder="Gebruikersnaam toevoegen"
              aria-label="Gebruikersnaam toevoegen"
            />
            <button
              type="button"
              className="gs-btn"
              onClick={() => void addMember()}
              disabled={addingMember || !newMember.trim()}
            >
              <i className="fa-solid fa-user-plus" aria-hidden="true" />
              <span>{addingMember ? "Toevoegen…" : "Toevoegen"}</span>
            </button>
          </div>
        )}

        <ul className="gs-members">
          {memberIds.map((userId) => (
            <li key={userId} className="gs-member">
              <span className="gs-avatar-wrap">
                <span className="gs-avatar" aria-hidden="true">
                  {displayName(userId).slice(0, 1).toUpperCase()}
                </span>
                <span
                  className={`gs-dot${onlineIds.has(userId) ? " is-online" : ""}`}
                  title={onlineIds.has(userId) ? "Online" : "Offline"}
                  aria-label={onlineIds.has(userId) ? "Online" : "Offline"}
                />
              </span>
              <span className="gs-member-name">{displayName(userId)}</span>
              {userId === garden.ownerId && <span className="gs-tag">Eigenaar</span>}
              {userId === currentUserId && userId !== garden.ownerId && (
                <span className="gs-tag">Jij</span>
              )}
              {isOwner && userId !== garden.ownerId && (
                <button
                  type="button"
                  className="gs-member-transfer"
                  onClick={() => setTransferTarget(userId)}
                  title="Maak eigenaar"
                  aria-label={`Maak ${displayName(userId)} eigenaar`}
                >
                  <i className="fa-solid fa-crown" aria-hidden="true" />
                </button>
              )}
              {isOwner && userId !== garden.ownerId && (
                <button
                  type="button"
                  className="gs-member-remove"
                  onClick={() => removeMember(userId)}
                  disabled={kicking === userId}
                  title="Toegang intrekken"
                  aria-label={`Toegang intrekken voor ${displayName(userId)}`}
                >
                  {kicking === userId ? (
                    <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
                  ) : (
                    <i className="fa-solid fa-user-minus" aria-hidden="true" />
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>

        {isOwner && garden.sharedWith.length === 0 && (
          <p className="gs-hint">
            Nog niemand toegevoegd. Deel de link hierboven om iemand toegang te geven.
          </p>
        )}
      </section>

      <section className="gs-card">
        <h3>
          <i className="fa-solid fa-bell" aria-hidden="true" /> Herinneringen
        </h3>
        <div className="gs-reminder-row">
          <div>
            <strong>Zaaien herinneren</strong>
            <p>Ontvang een melding als het zaaivenster van een gewas begint.</p>
          </div>
          <div className="gs-reminder-controls">
            <CategoryDropdown
              id="gs-reminder-days"
              categories={REMINDER_DAY_OPTIONS}
              value={String(prefs.daysBefore)}
              onChange={(key) => savePrefs({ ...prefs, daysBefore: Number(key) })}
            />
            <button
              type="button"
              role="switch"
              aria-checked={prefs.enabled}
              className={`gs-toggle${prefs.enabled ? " is-on" : ""}`}
              onClick={() => void toggleReminders()}
              aria-label="Zaaien herinneringen"
            >
              <span className="gs-toggle-knob" aria-hidden="true" />
            </button>
          </div>
        </div>

        {permission === "denied" && (
          <p className="gs-hint">
            Browsermeldingen zijn geblokkeerd. Sta ze toe in je browserinstellingen.
          </p>
        )}

        {reminders.length > 0 && (
          <ul className="gs-reminders">
            {reminders.slice(0, 4).map((r) => (
              <li key={r.key}>
                <i className="fa-solid fa-seedling" aria-hidden="true" />
                <span>{r.crop.name}</span>
                <time dateTime={r.date.toISOString().slice(0, 10)}>
                  {r.date.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOwner && (
        <section className="gs-card gs-danger">
          <h3>
            <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> Gevarenzone
          </h3>
          <div className="gs-danger-row">
            <div>
              <strong>Tuin verwijderen</strong>
              <p>De tuin en alle bijbehorende gegevens worden definitief verwijderd.</p>
            </div>
            <button
              type="button"
              className="gs-danger-btn"
              onClick={() => setConfirmDelete(true)}
            >
              <i className="fa-solid fa-trash" aria-hidden="true" />
              <span>Tuin verwijderen</span>
            </button>
          </div>
        </section>
      )}

      <ConfirmModal
        open={confirmDelete}
        title="Tuin verwijderen?"
        message={
          <>
            Weet je zeker dat je <strong>{garden.name}</strong> wilt verwijderen? Alle
            bedden, gewassen, oogsten en uitgaven van deze tuin verdwijnen. Dit kan
            niet ongedaan worden gemaakt.
          </>
        }
        confirmLabel="Ja, verwijderen"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          onDeleteGarden();
        }}
      />

      <ConfirmModal
        open={transferTarget !== null}
        title="Eigenaar overdragen?"
        message={
          <>
            Weet je zeker dat je <strong>{transferTarget ? displayName(transferTarget) : ""}</strong>{" "}
            eigenaar wilt maken van <strong>{garden.name}</strong>? Jij blijft lid van de
            tuin, maar kunt daarna geen leden meer beheren.
          </>
        }
        confirmLabel="Ja, overdragen"
        busy={transferBusy}
        onCancel={() => !transferBusy && setTransferTarget(null)}
        onConfirm={() => void transferGarden()}
      />
    </div>
  );
}
