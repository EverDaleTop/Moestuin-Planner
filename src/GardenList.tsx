import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Garden, User } from "./types";
import type { Theme } from "./useTheme";
import { SidebarThemeRow, ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";
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
  onOpenProfile: () => void;
  loading?: boolean;
}

const CARD_ICONS = [
  "fa-carrot",
  "fa-leaf",
  "fa-seedling",
  "fa-apple-whole",
  "fa-wheat-awn",
  "fa-clover",
];

function cardIcon(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CARD_ICONS[h % CARD_ICONS.length];
}

function gardenStats(g: Garden): { beds: number; plants: number } {
  let plants = 0;
  for (const e of g.elements) plants += e.crops.length;
  const beds = g.elements.filter((e) => e.type === "bed" || e.type === "veld").length;
  return { beds, plants };
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
  onOpenProfile,
  loading = false,
}: Props) {
  const [name, setName] = useState("");
  const [query] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [shareFor, setShareFor] = useState<Garden | null>(null);
  const [shareClosing, setShareClosing] = useState(false);
  const shareTimer = useRef(0);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const firstName = user.username.split(" ")[0] || user.username;
  const initial = (user.username.trim()[0] ?? "?").toUpperCase();

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName("");
  };

  const openShare = (g: Garden) => {
    window.clearTimeout(shareTimer.current);
    setShareClosing(false);
    setShareFor(g);
    setCopied(false);
    setShareError(null);
  };

  const closeShare = () => {
    if (shareClosing) return;
    setShareClosing(true);
    shareTimer.current = window.setTimeout(() => {
      shareTimer.current = 0;
      setShareFor(null);
      setShareClosing(false);
    }, 180);
  };

  useEffect(() => {
    if (!shareFor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeShare();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  useEffect(() => () => window.clearTimeout(shareTimer.current), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

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

  const isOwner = useCallback((g: Garden) => g.ownerId === user.id, [user.id]);

  const visible = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return gardens;
    return gardens.filter((g) => g.name.toLowerCase().includes(s));
  }, [gardens, query]);

  const myGardens = useMemo(
    () => visible.filter((g) => isOwner(g)).sort((a, b) => b.createdAt - a.createdAt),
    [visible, isOwner]
  );
  const sharedGardens = useMemo(
    () => visible.filter((g) => !isOwner(g)).sort((a, b) => b.createdAt - a.createdAt),
    [visible, isOwner]
  );

  return (
    <>
      <header className="gl-header">
        <div className="gl-header-inner">
          <div className="gl-brand">
            <span className="gl-mark" aria-hidden="true">
              <i className="fa-solid fa-carrot" />
            </span>
            <h1>Pluktuintje</h1>
          </div>
          <div className="gl-account">
            <UserMenu username={user.username} onLogout={onLogout} onOpenProfile={onOpenProfile} />
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
          <button
            className="ge-nav-toggle"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Menu openen"
            aria-expanded={menuOpen}
          >
            <i className="fa-solid fa-bars ge-nav-icon ge-nav-icon-bars" aria-hidden="true" />
            <i className="fa-solid fa-xmark ge-nav-icon ge-nav-icon-close" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className={`ge-side-backdrop${menuOpen ? " open" : ""}`} onClick={() => setMenuOpen(false)} />
      <aside className={`ge-sidebar${menuOpen ? " open" : ""}`} aria-label="Menu">
        <div className="ge-side-head">
          <span className="ge-side-title">
            <i className="fa-solid fa-seedling" aria-hidden="true" /> Menu
          </span>
        </div>
        <nav className="ge-side-nav">
          <button
            className="ge-side-item"
            onClick={() => {
              setMenuOpen(false);
              onOpenProfile();
            }}
          >
            <span className="gl-avatar" aria-hidden="true">
              {initial}
            </span>
            <span className="ge-side-label">{user.username}</span>
          </button>
          <button
            className="ge-side-item"
            onClick={() => {
              setMenuOpen(false);
              onLogout();
            }}
          >
            <i className="fa-solid fa-right-from-bracket" aria-hidden="true" />
            <span className="ge-side-label">Uitloggen</span>
          </button>
          <SidebarThemeRow theme={theme} onToggle={onToggleTheme} />
        </nav>
      </aside>
      <div className="gl-wrap" aria-busy={loading || undefined}>
        <section className="gl-hero">
          <div className="gl-hero-text">
            <h2>
              Hoi {firstName} <i className="fa-solid fa-seedling gl-wave" aria-hidden="true" />
            </h2>
            <p>Kies een tuintje om verder te gaan, of begin een nieuwe.</p>
          </div>
          <form
            className="gl-hero-create"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              className="gl-hero-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Naam voor een nieuwe tuin…"
              aria-label="Naam van de nieuwe tuin"
            />
            <button type="submit" className="btn-primary gl-hero-btn" disabled={!name.trim()}>
              <i className="fa-solid fa-plus" aria-hidden="true" /> Nieuwe tuin
            </button>
          </form>
        </section>

        {gardens.length === 0 && (
          <div className="gl-empty">
            <span className="gl-empty-blob" aria-hidden="true">
              <i className="fa-solid fa-sprout" />
            </span>
            <h3>Nog geen tuintjes</h3>
            <p>
              Geef hierboven je eerste tuin een naam en druk op Nieuwe tuin. Of vraag
              iemand om een uitnodigingslink.
            </p>
          </div>
        )}

        {gardens.length > 0 && visible.length === 0 && (
          <div className="gl-empty">
            <span className="gl-empty-blob" aria-hidden="true">
              <i className="fa-solid fa-magnifying-glass" />
            </span>
            <h3>Niks gevonden</h3>
            <p>Geen tuinen gevonden voor “{query.trim()}”.</p>
          </div>
        )}

        {myGardens.length > 0 && (
          <section>
            <div className="gl-section">
              <h2>Mijn tuinen</h2>
              <span className="gl-count">
                {myGardens.length} {myGardens.length === 1 ? "tuin" : "tuinen"}
              </span>
            </div>
            <div className="gl-grid">
              {myGardens.map((g) => (
                <GardenCard
                  key={g.id}
                  garden={g}
                  owner
                  ownerName=""
                  confirmId={confirmId}
                  setConfirmId={setConfirmId}
                  onOpen={onOpen}
                  onDelete={onDelete}
                  onShare={openShare}
                />
              ))}
            </div>
          </section>
        )}

        {sharedGardens.length > 0 && (
          <section>
            <div className="gl-section">
              <h2>Gedeeld met mij</h2>
              <span className="gl-count">
                {sharedGardens.length} {sharedGardens.length === 1 ? "tuin" : "tuinen"}
              </span>
            </div>
            <div className="gl-grid">
              {sharedGardens.map((g) => (
                <GardenCard
                  key={g.id}
                  garden={g}
                  owner={false}
                  ownerName={userNames[g.ownerId] ?? "iemand"}
                  confirmId={confirmId}
                  setConfirmId={setConfirmId}
                  onOpen={onOpen}
                  onDelete={onDelete}
                  onShare={openShare}
                />
              ))}
            </div>
          </section>
        )}

        {shareFor && (
          <div className={`share-overlay${shareClosing ? " closing" : ""}`} onClick={closeShare}>
            <div
              className={`share-modal${shareClosing ? " closing" : ""}`}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={`Tuin delen: ${shareFor.name}`}
            >
              <div className="share-head">
                <div className="share-head-main">
                  <span className="share-tile" aria-hidden="true">
                    <i className="fa-solid fa-share-nodes" />
                  </span>
                  <div>
                    <h3>Deel tuin</h3>
                    <div className="share-garden">{shareFor.name}</div>
                  </div>
                </div>
                <button className="share-close" onClick={closeShare} aria-label="Sluiten">
                  <i className="fa-solid fa-xmark" />
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
                      <span className="share-avatar" aria-hidden="true">
                        {(userNames[uid] ?? "?").trim()[0]?.toUpperCase() ?? "?"}
                      </span>
                      <span className="share-username">{userNames[uid] ?? "…"}</span>
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
    </>
  );
}

function GardenCard({
  garden: g,
  owner,
  ownerName,
  confirmId,
  setConfirmId,
  onOpen,
  onDelete,
  onShare,
}: {
  garden: Garden;
  owner: boolean;
  ownerName: string;
  confirmId: string | null;
  setConfirmId: (id: string | null) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onShare: (g: Garden) => void;
}) {
  const { beds, plants } = gardenStats(g);
  const bits: string[] = [];
  if (beds > 0) bits.push(`${beds} ${beds === 1 ? "bed" : "bedden"}`);
  if (plants > 0) bits.push(`${plants} ${plants === 1 ? "plantje" : "plantjes"}`);
  const base = bits.length > 0 ? bits.join(" · ") : "Nog leeg";
  const sharedCount = g.sharedWith.length;

  return (
    <article
      className="gl-card"
      onClick={() => onOpen(g.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(g.id);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Open tuin ${g.name}`}
    >
      <div className="gl-card-top">
        <span className="gl-card-blob" aria-hidden="true">
          <i className={`fa-solid ${cardIcon(g.id)}`} />
        </span>
        {!owner && (
          <span className="gl-pill">
            <i className="fa-solid fa-user-group" aria-hidden="true" /> Van {ownerName}
          </span>
        )}
        {owner && sharedCount > 0 && (
          <span className="gl-pill">
            <i className="fa-solid fa-user-group" aria-hidden="true" /> {sharedCount}
          </span>
        )}
      </div>
      <div className="gl-card-title">{g.name}</div>
      <div className="gl-card-meta">{base}</div>
      <div className="gl-card-foot">
        <span className="gl-card-open">
          Open <i className="fa-solid fa-arrow-right" aria-hidden="true" />
        </span>
        <div className="gl-card-actions" onClick={(e) => e.stopPropagation()}>
          {owner && (
            <button
              className="gl-icon-btn"
              onClick={() => onShare(g)}
              title="Tuin delen"
              aria-label={`Tuin delen: ${g.name}`}
            >
              <i className="fa-solid fa-user-plus" />
            </button>
          )}
          {confirmId === g.id ? (
            <>
              <button
                className="gl-icon-btn gl-icon-btn-danger"
                onClick={() => {
                  onDelete(g.id);
                  setConfirmId(null);
                }}
                title="Ja, verwijderen"
                aria-label="Ja, verwijderen"
              >
                <i className="fa-solid fa-check" />
              </button>
              <button
                className="gl-icon-btn"
                onClick={() => setConfirmId(null)}
                title="Annuleren"
                aria-label="Annuleren"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </>
          ) : (
            owner && (
              <button
                className="gl-icon-btn gl-icon-btn-danger"
                onClick={() => setConfirmId(g.id)}
                title="Tuin verwijderen"
                aria-label={`Tuin verwijderen: ${g.name}`}
              >
                <i className="fa-solid fa-trash" />
              </button>
            )
          )}
        </div>
      </div>
    </article>
  );
}
