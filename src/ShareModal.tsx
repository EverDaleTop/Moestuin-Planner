import type { Garden } from "./types";
import { inviteUrl } from "./api";
import { SheetModal } from "./SheetModal";

interface Props {
  mounted: boolean;
  open: boolean;
  garden: Garden;
  copied: boolean;
  error: string | null;
  userNames: Record<string, string>;
  onCopy: () => void;
  onRegenerate: () => void;
  onRemoveMember: (userId: string) => void;
  onClose: () => void;
}

/**
 * Tuin delen: gecentreerde modaal op desktop, bottom-sheet-popup op mobiel.
 * Zelfde modal-systeem als de andere formulieren (portal, Escape, drag-to-close).
 * Alleen presentatie — de API-acties blijven in GardenList.
 */
export function ShareModal({
  mounted,
  open,
  garden,
  copied,
  error,
  userNames,
  onCopy,
  onRegenerate,
  onRemoveMember,
  onClose,
}: Props) {
  if (!mounted) return null;

  return (
    <SheetModal
      mounted={mounted}
      open={open}
      onClose={onClose}
      ariaLabel={`Tuin delen: ${garden.name}`}
    >
        <div className="sow-modal-head">
          <div className="share-head-main">
            <span className="share-tile" aria-hidden="true">
              <i className="fa-solid fa-share-nodes" />
            </span>
            <div>
              <h3>Deel tuin</h3>
              <div className="share-garden">{garden.name}</div>
            </div>
          </div>
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
          <p className="share-sub">
            Stuur deze link naar iemand. Zodra die persoon de link opent en een
            account heeft (of aanmaakt), kan hij of zij meteen meewerken.
          </p>

          <div className="share-link-row">
            <input
              className="share-search"
              value={inviteUrl(garden)}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Uitnodigingslink"
            />
            <button className="btn-primary" onClick={onCopy}>
              <i className="fa-solid fa-link" /> {copied ? "Gekopieerd!" : "Kopieer"}
            </button>
          </div>
          <button className="share-regenerate" onClick={onRegenerate}>
            <i className="fa-solid fa-arrows-rotate" /> Nieuwe link maken
          </button>
          {error && <div className="auth-error">{error}</div>}

          <h4 className="share-title">Heeft toegang ({garden.sharedWith.length})</h4>
          {garden.sharedWith.length === 0 ? (
            <p className="share-empty">Nog niemand.</p>
          ) : (
            <ul className="share-list">
              {garden.sharedWith.map((uid) => (
                <li key={uid} className="share-item">
                  <span className="share-avatar" aria-hidden="true">
                    {(userNames[uid] ?? "?").trim()[0]?.toUpperCase() ?? "?"}
                  </span>
                  <span className="share-username">{userNames[uid] ?? "…"}</span>
                  <button
                    className="he-row-btn he-row-btn-danger"
                    onClick={() => onRemoveMember(uid)}
                    title="Toegang intrekken"
                  >
                    <i className="fa-solid fa-xmark" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
    </SheetModal>
  );
}
