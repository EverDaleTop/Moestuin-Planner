import { useState } from "react";
import type { Garden, User } from "./types";
import type { Theme } from "./useTheme";
import { ThemeToggle } from "./ThemeToggle";
import { api, inviteUrl } from "./api";

interface Props {
  gardens: Garden[];
  user: User;
  userNames: Record<string, string>;
  theme: Theme;
  onToggleTheme: () => void;
  onOpen: (id: string) => void;
  onAdd: (name: string) => void;
  onDelete: (id: string) => void;
  onUnshare: (gardenId: string, userId: string) => Promise<void>;
  onGardenUpdated: (garden: Garden) => void;
  onLogout: () => void;
  onPlants: () => void;
}

export function GardenList({
  gardens,
  user,
  userNames,
  theme,
  onToggleTheme,
  onOpen,
  onAdd,
  onDelete,
  onUnshare,
  onGardenUpdated,
  onLogout,
  onPlants,
}: Props) {
  const [name, setName] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [shareFor, setShareFor] = useState<Garden | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName("");
  };

  const openShare = (g: Garden) => {
    setShareFor(g);
    setCopied(false);
    setShareError(null);
  };

  const copyLink = async () => {
    if (!shareFor) return;
    try {
      await navigator.clipboard.writeText(inviteUrl(shareFor));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setShareError("Kopiëren lukte niet. Selecteer de link en kopieer hem handmatig.");
    }
  };

  const regenerate = async () => {
    if (!shareFor) return;
    setShareError(null);
    try {
      const updated = await api.regenerateInvite(shareFor.id);
      setShareFor(updated);
      onGardenUpdated(updated);
      setCopied(false);
    } catch (err: any) {
      setShareError(err.message ?? "Nieuwe link maken lukte niet.");
    }
  };

  const removeMember = async (userId: string) => {
    if (!shareFor) return;
    setShareError(null);
    try {
      await onUnshare(shareFor.id, userId);
      const updated = {
        ...shareFor,
        sharedWith: shareFor.sharedWith.filter((uid) => uid !== userId),
      };
      setShareFor(updated);
    } catch {
      setShareError("Toegang intrekken lukte niet.");
    }
  };

  const isOwner = (g: Garden) => g.ownerId === user.id;

  return (
    <div className="gl-wrap">
      <header className="gl-header">
        <div className="gl-header-top">
          <div>
            <h1>🥕 Moestuin Planner</h1>
            <p>Plan je moestuinen, bedden en paden in meters.</p>
          </div>
          <div className="gl-account">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <button className="btn-ghost" onClick={onLogout} title="Uitloggen">
              {user.username} <i className="fa-solid fa-right-from-bracket" />
            </button>
          </div>
        </div>
        <nav className="gl-nav">
          <button className="nav-tab nav-active" disabled>Tuinen</button>
          <button className="nav-tab" onClick={onPlants}>Gewassen</button>
        </nav>
      </header>

      <section className="gl-new">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Naam van de nieuwe tuin…"
          aria-label="Tuinnaam"
        />
        <button onClick={submit} disabled={!name.trim()}>
          Tuin toevoegen
        </button>
      </section>

      <section className="gl-list">
        {gardens.length === 0 && (
          <p className="gl-empty">
            Nog geen tuinen. Voeg je eerste tuin toe om te beginnen, of vraag iemand
            om je een uitnodigingslink te sturen.
          </p>
        )}
        {gardens.map((g) => (
          <div key={g.id} className="gl-card" onClick={() => onOpen(g.id)}>
            <div className="gl-card-main">
              <div className="gl-card-title">{g.name}</div>
              <div className="gl-card-meta">
                {g.elements.filter((e) => e.type === "bed").length} bedden ·{" "}
                {g.elements.filter((e) => e.type === "path").length} paden ·{" "}
                {new Date(g.createdAt).toLocaleDateString("nl-NL")}
                <br />
                {isOwner(g) ? (
                  g.sharedWith.length > 0 ? (
                    <span>
                      Gedeeld met{" "}
                      {g.sharedWith
                        .map((uid) => userNames[uid] ?? "?")
                        .join(", ")}
                    </span>
                  ) : (
                    <span>Nog niet gedeeld</span>
                  )
                ) : (
                  <span>Van {userNames[g.ownerId] ?? "iemand"}</span>
                )}
              </div>
            </div>
            <div className="gl-card-actions">
              {isOwner(g) && (
                <button
                  className="btn-share"
                  onClick={(e) => {
                    e.stopPropagation();
                    openShare(g);
                  }}
                  title="Tuin delen"
                >
                  <i className="fa-solid fa-user-plus" />
                </button>
              )}
              {confirmId === g.id ? (
                <>
                  <span className="gl-confirm">Verwijderen?</span>
                  <button
                    className="btn-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(g.id);
                      setConfirmId(null);
                    }}
                  >
                    Ja
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmId(null);
                    }}
                  >
                    Nee
                  </button>
                </>
              ) : (
                <button
                  className="btn-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmId(g.id);
                  }}
                  title="Tuin verwijderen"
                >
                  🗑
                </button>
              )}
            </div>
          </div>
        ))}
      </section>

      {shareFor && (
        <div className="share-overlay" onClick={() => setShareFor(null)}>
          <div className="share-modal" onClick={(e) => e.stopPropagation()}>
            <div className="share-head">
              <h3>Deel tuin</h3>
              <button className="crops-close" onClick={() => setShareFor(null)}>
                ×
              </button>
            </div>
            <p className="share-sub">
              Stuur deze link naar iemand. Zodra die persoon de link opent en een
              account heeft (of aanmaakt), kan hij of zij meteen meewerken.
            </p>

            <div className="share-link-row">
              <input
                className="share-search"
                value={inviteUrl(shareFor)}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Uitnodigingslink"
              />
              <button className="btn-primary" onClick={() => void copyLink()}>
                <i className="fa-solid fa-link" /> {copied ? "Gekopieerd!" : "Kopieer"}
              </button>
            </div>
            <button className="share-regenerate" onClick={() => void regenerate()}>
              <i className="fa-solid fa-arrows-rotate" /> Nieuwe link maken
            </button>
            {shareError && <div className="auth-error">{shareError}</div>}

            <h4 className="share-title">Heeft toegang ({shareFor.sharedWith.length})</h4>
            {shareFor.sharedWith.length === 0 ? (
              <p className="share-empty">Nog niemand.</p>
            ) : (
              <ul className="share-list">
                {shareFor.sharedWith.map((uid) => (
                  <li key={uid} className="share-item">
                    <span>{userNames[uid] ?? "…"}</span>
                    <button
                      className="he-row-btn he-row-btn-danger"
                      onClick={() => void removeMember(uid)}
                      title="Toegang intrekken"
                    >
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
