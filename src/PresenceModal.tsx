import { useCallback, useEffect, useRef, useState } from "react";
import type { PresenceMember } from "./realtime";

interface Props {
  gardenName: string;
  /** live online leden (inclusief jezelf) */
  members: PresenceMember[];
  ownerId: string;
  sharedWith: string[];
  userNames: Record<string, string>;
  currentUserId: string;
  isOwner: boolean;
  onClose: () => void;
  onKick: (userId: string) => Promise<void>;
}

const CLOSE_MS = 170;

function displayName(userId: string, userNames: Record<string, string>): string {
  return userNames[userId] ?? `Gebruiker ${userId.slice(0, 6)}`;
}

/** Stabiele avatar-kleur per gebruiker. */
function avatarHue(userId: string): number {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) % 360;
  return h;
}

function initial(name: string): string {
  return (name.trim().charAt(0) || "?").toUpperCase();
}

export function PresenceModal({
  gardenName,
  members,
  ownerId,
  sharedWith,
  userNames,
  currentUserId,
  isOwner,
  onClose,
  onKick,
}: Props) {
  const [closing, setClosing] = useState(false);
  const [confirmKick, setConfirmKick] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeTimer = useRef<number | null>(null);
  // ref zodat de keydown-listener niet opnieuw hoeft te worden geregistreerd
  const closingRef = useRef(false);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, CLOSE_MS);
  }, [onClose]);

  // Alleen eenmalig opruimen bij unmount; de timer zelf mag niet door een
  // dependency-change worden gewist, anders sluit de modal nooit.
  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const onlineIds = new Set(members.map((m) => m.userId));
  const offlineIds = [ownerId, ...sharedWith].filter(
    (uid, i, arr) => !onlineIds.has(uid) && arr.indexOf(uid) === i
  );

  const doKick = async (userId: string) => {
    setBusyId(userId);
    setError(null);
    try {
      await onKick(userId);
      setConfirmKick(null);
    } catch {
      setError("Verwijderen lukte niet. Probeer het opnieuw.");
    } finally {
      setBusyId(null);
    }
  };

  const row = (userId: string, username: string, online: boolean) => {
    const isSelf = userId === currentUserId;
    const isGardenOwner = userId === ownerId;
    const canKick = isOwner && !isSelf;
    const confirming = confirmKick === userId;
    const hue = avatarHue(userId);

    return (
      <li key={userId} className={`presence-member ${online ? "" : "presence-offline"}`}>
        <span
          className="presence-avatar"
          style={{ background: `linear-gradient(140deg, hsl(${hue} 58% 52%), hsl(${hue} 58% 40%))` }}
          aria-hidden="true"
        >
          {initial(username)}
        </span>

        <span className="presence-main">
          <span className="presence-name">
            {username}
            {isSelf && <span className="presence-tag">jij</span>}
            {isGardenOwner && (
              <span className="presence-tag presence-tag-owner">
                <i className="fa-solid fa-crown" /> eigenaar
              </span>
            )}
          </span>
          <span className="presence-status">
            <i className={`fa-solid ${online ? "fa-circle" : "fa-circle-xmark"}`} />
            {online ? "online" : "offline"}
          </span>
        </span>

        {canKick && !confirming && (
          <button
            className="presence-kick"
            onClick={() => {
              setConfirmKick(userId);
              setError(null);
            }}
            title={`Toegang intrekken voor ${username}`}
            aria-label={`Toegang intrekken voor ${username}`}
          >
            <i className="fa-solid fa-user-minus" />
          </button>
        )}

        {canKick && confirming && (
          <span className="presence-confirm">
            <span className="presence-confirm-text">Verwijder?</span>
            <button
              className="presence-yes"
              disabled={busyId === userId}
              onClick={() => void doKick(userId)}
            >
              {busyId === userId ? <i className="fa-solid fa-spinner fa-spin" /> : "Ja"}
            </button>
            <button
              className="presence-no"
              disabled={busyId === userId}
              onClick={() => setConfirmKick(null)}
            >
              Nee
            </button>
          </span>
        )}
      </li>
    );
  };

  return (
    <div
      className={`presence-overlay ${closing ? "presence-closing" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="presence-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Wie is er online"
      >
        <div className="presence-head">
          <div className="presence-head-text">
            <h3>
              <i className="fa-solid fa-users" /> Wie werkt mee?
            </h3>
            <p className="presence-sub">
              {gardenName} · {members.length} {members.length === 1 ? "persoon" : "personen"} online
            </p>
          </div>
          <button className="presence-close" onClick={close} aria-label="Sluiten" title="Sluiten">
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="presence-body">
          <p className="presence-section">
            <i className="fa-solid fa-signal" /> Online
          </p>
          {members.length === 0 ? (
            <p className="presence-empty">Iemand anders is nu aan het werk.</p>
          ) : (
            <ul className="presence-list">{members.map((m) => row(m.userId, m.username, true))}</ul>
          )}

          {offlineIds.length > 0 && (
            <>
              <p className="presence-section">
                <i className="fa-solid fa-user-clock" /> Heeft toegang, niet online
              </p>
              <ul className="presence-list">
                {offlineIds.map((uid) => row(uid, displayName(uid, userNames), false))}
              </ul>
            </>
          )}
        </div>

        {error && <p className="presence-error">{error}</p>}
      </div>
    </div>
  );
}
