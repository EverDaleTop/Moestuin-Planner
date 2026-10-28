import { useEffect, useRef, useState } from "react";
import type { Crop, Garden } from "./types";
import type { PresenceMember } from "./realtime";
import { api, inviteUrl } from "./api";
import { SowNotifySettings } from "./SowNotifySettings";

interface Props {
  garden: Garden;
  catalog: Crop[];
  currentUserId: string;
  userNames: Record<string, string>;
  onlineMembers: PresenceMember[];
  isOwner: boolean;
  onGardenUpdated: (garden: Garden) => void;
  onUnshareMember: (userId: string) => Promise<void>;
  onDeleteGarden: () => void;
  onNameChange: (name: string) => void;
}

export function SettingsView({
  garden,
  catalog,
  currentUserId,
  userNames,
  onlineMembers,
  isOwner,
  onGardenUpdated,
  onUnshareMember,
  onDeleteGarden,
  onNameChange,
}: Props) {
  const [name, setName] = useState(garden.name);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (document.activeElement !== nameInputRef.current) setName(garden.name);
  }, [garden.id, garden.name]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [kicking, setKicking] = useState<string | null>(null);

  const onlineIds = new Set(onlineMembers.map((m) => m.userId));
  const link = inviteUrl(garden);
  const members = garden.sharedWith;
  const dirty = name.trim() !== "" && name.trim() !== garden.name;

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Kopiëren lukte niet. Selecteer de link en kopieer hem handmatig.");
    }
  };

  const regenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.regenerateInvite(garden.id);
      onGardenUpdated(updated);
      setCopied(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Nieuwe link maken lukte niet.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
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

  const kick = async (userId: string) => {
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

  const saveName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== garden.name) onNameChange(trimmed);
    else setName(garden.name);
  };

  const displayName = (userId: string) =>
    userId === currentUserId ? "Jij" : (userNames[userId] ?? "Onbekend");

  return (
    <div className="shop-page settings-page">
      <header className="st-head">
        <p className="st-eyebrow">Tuininstellingen</p>
        <div className="st-name-row">
          <input
            ref={nameInputRef}
            className="st-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
            maxLength={80}
            aria-label="Tuinnaam"
          />
          {dirty && (
            <button type="button" className="st-btn" onClick={saveName}>
              Opslaan
            </button>
          )}
        </div>
      </header>
      {error && <p className="st-error" role="alert">{error}</p>}

      <section className="st-section">
        <div className="st-side">
          <h3>Delen</h3>
        </div>
        <div className="st-main">
          {isOwner && (link ? (
            <>
              <div className="st-linkbox">
                <input value={link} readOnly onFocus={(e) => e.target.select()} aria-label="Uitnodigingslink" />
                <button type="button" className="st-btn st-small" onClick={copyLink} disabled={busy}>
                  <i className={`fa-solid ${copied ? "fa-check" : "fa-copy"}`} aria-hidden="true" />
                  <span>{copied ? "Gekopieerd" : "Kopieer"}</span>
                </button>
              </div>
              <div className="st-linkactions">
                <button
                  type="button"
                  className="st-quiet"
                  onClick={regenerate}
                  disabled={busy}
                  title="Maakt een nieuwe link; de oude stopt direct met werken"
                >
                  <i className="fa-solid fa-rotate" aria-hidden="true" />
                  <span>Nieuwe link</span>
                </button>
                <button
                  type="button"
                  className="st-quiet st-quiet-danger"
                  onClick={disable}
                  disabled={busy}
                  title="Schakelt uitnodigen uit; de huidige link stopt met werken"
                >
                  <i className="fa-solid fa-link-slash" aria-hidden="true" />
                  <span>Uitschakelen</span>
                </button>
              </div>
            </>
          ) : (
            <div className="st-linkoff">
              <p>Uitnodigen staat uit. Er is geen geldige link.</p>
              <button type="button" className="st-btn" onClick={regenerate} disabled={busy}>
                <i className="fa-solid fa-link" aria-hidden="true" />
                <span>Nieuwe uitnodigingslink maken</span>
              </button>
            </div>
          ))}
          <ul className="st-members">
            <li className="st-member">
              <span className="st-avatar" aria-hidden="true">
                {(userNames[garden.ownerId] ?? "?").slice(0, 1).toUpperCase()}
              </span>
              <span className="st-member-name">
                {garden.ownerId === currentUserId ? "Jij" : (userNames[garden.ownerId] ?? "Onbekend")}
              </span>
              <span className="st-tag">Eigenaar</span>
              {onlineIds.has(garden.ownerId) && <span className="st-dot" title="Online" />}
            </li>
            {members.map((userId) => (
              <li key={userId} className="st-member">
                <span className="st-avatar" aria-hidden="true">
                  {displayName(userId).slice(0, 1).toUpperCase()}
                </span>
                <span className="st-member-name">{displayName(userId)}</span>
                {onlineIds.has(userId) && <span className="st-dot" title="Online" />}
                {isOwner && (
                  <button
                    type="button"
                    className="st-kick"
                    disabled={kicking === userId}
                    onClick={() => kick(userId)}
                    title="Toegang intrekken"
                  >
                    {kicking === userId ? "…" : "Verwijder"}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {isOwner && members.length === 0 && (
            <p className="st-hint">Nog niemand uitgenodigd. Deel de link hierboven om iemand toe te voegen.</p>
          )}
        </div>
      </section>

      <SowNotifySettings gardenId={garden.id} catalog={catalog} />

      {isOwner && (
        <section className="st-section st-danger">
          <div className="st-side">
            <h3>Gevarenzone</h3>
          </div>
          <div className="st-main">
            {confirmDelete ? (
              <div className="st-confirm">
                <span>Tuin definitief verwijderen?</span>
                <div className="st-confirm-actions">
                  <button type="button" className="st-quiet" onClick={() => setConfirmDelete(false)}>Annuleren</button>
                  <button type="button" className="st-btn-danger" onClick={onDeleteGarden}>Ja, verwijder</button>
                </div>
              </div>
            ) : (
              <button type="button" className="st-btn-danger" onClick={() => setConfirmDelete(true)}>
                <i className="fa-solid fa-trash" aria-hidden="true" />
                <span>Tuin verwijderen</span>
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
