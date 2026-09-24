import { useMemo, useState } from "react";
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
}: Props) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
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

  const visible = useMemo(() => {
    const s = query.trim().toLowerCase();
    if (!s) return gardens;
    return gardens.filter((g) => g.name.toLowerCase().includes(s));
  }, [gardens, query]);

  const myGardens = useMemo(
    () => visible.filter((g) => isOwner(g)).sort((a, b) => b.createdAt - a.createdAt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, user.id]
  );
  const sharedGardens = useMemo(
    () => visible.filter((g) => !isOwner(g)).sort((a, b) => b.createdAt - a.createdAt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, user.id]
  );

  return (
    <div className="gl-wrap">
      <header className="gl-header">
        <div className="gl-brand">
          <span className="gl-mark">
            <i className="fa-solid fa-carrot" />
          </span>
          <h1>Moestuin Planner</h1>
        </div>
        <div className="gl-account">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <button className="btn-ghost" onClick={onLogout} title="Uitloggen">
            {user.username} <i className="fa-solid fa-right-from-bracket" />
          </button>
        </div>
      </header>

      <section className="gl-new">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Naam van de nieuwe tuin…"
          aria-label="Tuinnaam"
        />
        <button className="btn-primary" onClick={submit} disabled={!name.trim()}>
          <i className="fa-solid fa-plus" /> Toevoegen
        </button>
      </section>

      {gardens.length > 0 && (
        <div className="gl-search">
          <i className="fa-solid fa-magnifying-glass" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek een tuin…"
            aria-label="Zoek een tuin"
          />
          {query && (
            <button
              className="gl-search-clear"
              onClick={() => setQuery("")}
              aria-label="Zoekopdracht wissen"
            >
              <i className="fa-solid fa-xmark" />
            </button>
          )}
        </div>
      )}

      {gardens.length === 0 ? (
        <p className="gl-empty">
          Nog geen tuinen. Voeg hierboven je eerste tuin toe, of vraag iemand om
          je een uitnodigingslink te sturen.
        </p>
      ) : (
        visible.length === 0 && (
          <p className="gl-empty">Geen tuinen gevonden voor “{query.trim()}”.</p>
        )
      )}

      {myGardens.length > 0 && (
        <section>
          <h2 className="gl-section">
            Mijn tuinen <span className="gl-section-count">{myGardens.length}</span>
          </h2>
          <div className="gl-group">
            {myGardens.map((g) => (
              <GardenRow
                key={g.id}
                garden={g}
                userNames={userNames}
                owner
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
          <h2 className="gl-section">
            Gedeeld met mij <span className="gl-section-count">{sharedGardens.length}</span>
          </h2>
          <div className="gl-group">
            {sharedGardens.map((g) => (
              <GardenRow
                key={g.id}
                garden={g}
                userNames={userNames}
                owner={false}
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
        <div className="share-overlay" onClick={() => setShareFor(null)}>
          <div className="share-modal" onClick={(e) => e.stopPropagation()}>
            <div className="share-head">
              <h3>Deel tuin</h3>
              <button className="crops-close" onClick={() => setShareFor(null)} aria-label="Sluiten">
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

function GardenRow({
  garden: g,
  userNames,
  owner,
  confirmId,
  setConfirmId,
  onOpen,
  onDelete,
  onShare,
}: {
  garden: Garden;
  userNames: Record<string, string>;
  owner: boolean;
  confirmId: string | null;
  setConfirmId: (id: string | null) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onShare: (g: Garden) => void;
}) {
  const beds = g.elements.filter((e) => e.type === "bed").length;
  const paths = g.elements.filter((e) => e.type === "path").length;

  return (
    <div className="gl-row" onClick={() => onOpen(g.id)}>
      <div className="gl-row-main">
        <div className="gl-row-title">{g.name}</div>
        <div className="gl-row-meta">
          {beds} {beds === 1 ? "bed" : "bedden"} · {paths}{" "}
          {paths === 1 ? "pad" : "paden"} ·{" "}
          {new Date(g.createdAt).toLocaleDateString("nl-NL")}
          {" · "}
          {owner ? (
            g.sharedWith.length > 0 ? (
              <span>
                Gedeeld met {g.sharedWith.map((uid) => userNames[uid] ?? "?").join(", ")}
              </span>
            ) : (
              <span>Niet gedeeld</span>
            )
          ) : (
            <span>Van {userNames[g.ownerId] ?? "iemand"}</span>
          )}
        </div>
      </div>
      <div className="gl-row-actions">
        {owner && (
          <button
            className="gl-icon-btn"
            onClick={(e) => {
              e.stopPropagation();
              onShare(g);
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
              className="gl-icon-btn gl-icon-btn-danger"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(g.id);
                setConfirmId(null);
              }}
              title="Ja, verwijderen"
            >
              <i className="fa-solid fa-check" />
            </button>
            <button
              className="gl-icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmId(null);
              }}
              title="Annuleren"
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </>
        ) : (
          owner && (
            <button
              className="gl-icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmId(g.id);
              }}
              title="Tuin verwijderen"
            >
              <i className="fa-solid fa-trash" />
            </button>
          )
        )}
        <i className="fa-solid fa-chevron-right gl-row-chevron" />
      </div>
    </div>
  );
}
