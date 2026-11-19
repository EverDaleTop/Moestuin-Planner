import { useEffect } from "react";
import type { PresenceMember } from "./realtime";
import { SheetModal } from "./SheetModal";

interface ModalProps {
  mounted: boolean;
  open: boolean;
  /** live online leden (inclusief jezelf) */
  members: PresenceMember[];
  ownerId: string;
  sharedWith: string[];
  userNames: Record<string, string>;
  currentUserId: string;
  isOwner: boolean;
  onClose: () => void;
  onKickRequest: (userId: string, username: string) => void;
}

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

/**
 * Wie werkt mee: zelfde modaal-systeem als de andere formulieren
 * (gecentreerde modaal op desktop, bottom-sheet-popup op mobiel).
 * Alleen presentatie — state en openen/sluiten blijven in GardenEditor.
 */
export function PresenceModal({
  mounted,
  open,
  members,
  ownerId,
  sharedWith,
  userNames,
  currentUserId,
  isOwner,
  onClose,
  onKickRequest,
}: ModalProps) {
  useEffect(() => {
    if (!mounted) return;
    // De navbar ligt boven de modal-overlay; een klik daarop moet de modal
    // alsnog sluiten. Klikken binnen de sheet negeren we.
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest(".presence-sheet, .ge-presence")) return;
      onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [mounted, onClose]);

  const onlineIds = new Set(members.map((m) => m.userId));
  const offlineIds = [ownerId, ...sharedWith].filter(
    (uid, i, arr) => !onlineIds.has(uid) && arr.indexOf(uid) === i
  );

  const row = (userId: string, username: string, online: boolean) => {
    const isSelf = userId === currentUserId;
    const isGardenOwner = userId === ownerId;
    const canKick = isOwner && !isSelf;
    const hue = avatarHue(userId);

    return (
      <li key={userId} className={`presence-member ${online ? "" : "presence-offline"}`}>
        <span
          className={`presence-avatar ${online ? "is-online" : "is-offline"}`}
          style={{ background: `linear-gradient(140deg, hsl(${hue} 58% 52%), hsl(${hue} 58% 40%))` }}
          aria-hidden="true"
        >
          {initial(username)}
        </span>

        <span className="presence-main">
          <span className="presence-name">
            {username}
            {isSelf && <span className="presence-tag presence-tag-self">jij</span>}
            {isGardenOwner && (
              <span className="presence-tag presence-tag-owner">
                <i className="fa-solid fa-crown" /> eigenaar
              </span>
            )}
          </span>
        </span>

        {canKick && (
          <button
            type="button"
            className="presence-kick"
            onClick={() => onKickRequest(userId, username)}
            title={`Toegang intrekken voor ${username}`}
            aria-label={`Toegang intrekken voor ${username}`}
          >
            <i className="fa-solid fa-user-minus" />
          </button>
        )}
      </li>
    );
  };

  if (!mounted) return null;

  return (
    <SheetModal
      mounted={mounted}
      open={open}
      onClose={onClose}
      className="presence-sheet"
      ariaLabel="Wie is er online"
    >
        <div className="sow-modal-head">
          <h3>
            <i className="fa-solid fa-users" aria-hidden="true" /> Wie werkt mee?{" "}
            <span className="cal-n">{members.length}</span>
          </h3>
          <button
            type="button"
            className="sow-modal-close"
            onClick={onClose}
            aria-label="Sluiten"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
        <div className="sow-modal-body">
          <p className="presence-section">
            <span className="presence-sec-dot" aria-hidden="true" />
            Online <span className="cal-n">{members.length}</span>
          </p>
          {members.length === 0 ? (
            <p className="presence-empty">
              <i className="fa-solid fa-users-slash" aria-hidden="true" />
              Er is nu niemand anders online.
            </p>
          ) : (
            <ul className="presence-list">{members.map((m) => row(m.userId, m.username, true))}</ul>
          )}

          {offlineIds.length > 0 && (
            <>
              <p className="presence-section">
                <span className="presence-sec-dot is-off" aria-hidden="true" />
                Niet online <span className="cal-n">{offlineIds.length}</span>
              </p>
              <ul className="presence-list">
                {offlineIds.map((uid) => row(uid, displayName(uid, userNames), false))}
              </ul>
            </>
          )}
        </div>
    </SheetModal>
  );
}

interface ConfirmProps {
  mounted: boolean;
  open: boolean;
  gardenName: string;
  username: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Losse bevestigings-popup voor het intrekken van toegang. */
export function PresenceKickConfirm({
  mounted,
  open,
  gardenName,
  username,
  busy,
  error,
  onCancel,
  onConfirm,
}: ConfirmProps) {
  if (!mounted) return null;

  return (
    <SheetModal
      mounted={mounted}
      open={open}
      onClose={onCancel}
      overlayClassName="presence-confirm-overlay"
      className="presence-confirm-sheet"
      role="alertdialog"
      ariaLabel="Toegang intrekken"
      gripDisabled={busy}
      escapeDisabled={busy}
      closeOnBackdrop={!busy}
    >
        <div className="sow-modal-head">
          <h3>
            Toegang intrekken?
          </h3>
          <button
            type="button"
            className="sow-modal-close"
            onClick={onCancel}
            disabled={busy}
            aria-label="Sluiten"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
        <div className="sow-modal-body">
          <p className="presence-confirm-text">
            Weet je zeker dat je <strong>{username}</strong> de toegang tot{" "}
            <strong>{gardenName}</strong> wilt intrekken?
          </p>
          {error && (
            <div className="presence-error" role="alert">
              <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" /> {error}
            </div>
          )}
        </div>
        <div className="crop-modal-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Annuleren
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? (
              <>
                <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> Bezig…
              </>
            ) : (
              "Ja, intrekken"
            )}
          </button>
        </div>
    </SheetModal>
  );
}
