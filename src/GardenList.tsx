import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Garden, User } from "./types";
import type { Theme } from "./useTheme";
import { SidebarThemeRow, ThemeToggle } from "./ThemeToggle";
import { ConfirmModal } from "./ConfirmModal";
import { UserMenu } from "./UserMenu";
import { LogoMark } from "./Logo";
import { Navbar } from "./Navbar";
import { LegalFooter } from "./LegalPage";
import { ShareModal } from "./ShareModal";
import { useCollapseForm } from "./useCollapseForm";
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
  const [pendingUnshare, setPendingUnshare] = useState<string | null>(null);
  const [shareFor, setShareFor] = useState<Garden | null>(null);
  const shareSheet = useCollapseForm();
  const navToggleRef = useRef<HTMLButtonElement | null>(null);
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
    setCopied(false);
    setShareError(null);
    setShareFor(g);
    shareSheet.openForm();
  };

  const closeShare = () => {
    shareSheet.closeForm();
  };

  // Pas opruimen als de sluit-animatie klaar is.
  useEffect(() => {
    if (shareSheet.mounted) return;
    setShareFor(null);
    setCopied(false);
    setShareError(null);
  }, [shareSheet.mounted]);

  // Zodra de sidebar dichtgaat, haal focus van de hamburgerknop af,
  // zodat die niet geselecteerd blijft staan tot de volgende tik elders.
  const wasMenuOpen = useRef(false);
  useEffect(() => {
    if (wasMenuOpen.current && !menuOpen) navToggleRef.current?.blur();
    wasMenuOpen.current = menuOpen;
  }, [menuOpen]);

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
  const confirmGarden = confirmId ? (gardens.find((g) => g.id === confirmId) ?? null) : null;

  return (
    <>
      <Navbar
        className="navbar-list"
        brand={
          <div className="gl-brand">
            <LogoMark className="gl-mark" />
            <h1>oogstplan</h1>
          </div>
        }
        actions={
          <>
            <div className="gl-account">
              <UserMenu username={user.username} onLogout={onLogout} onOpenProfile={onOpenProfile} />
              <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </div>
            <button
              ref={navToggleRef}
              className="ge-nav-toggle"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Menu openen"
              aria-expanded={menuOpen}
            >
              <i className="fa-solid fa-bars ge-nav-icon ge-nav-icon-bars" aria-hidden="true" />
              <i className="fa-solid fa-xmark ge-nav-icon ge-nav-icon-close" aria-hidden="true" />
            </button>
          </>
        }
      />
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
        <div className="gl-content">
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
                  setConfirmId={setConfirmId}
                  onOpen={onOpen}
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
                  setConfirmId={setConfirmId}
                  onOpen={onOpen}
                  onShare={openShare}
                />
              ))}
            </div>
          </section>
        )}

        {shareFor && (
          <ShareModal
            mounted={shareSheet.mounted}
            open={shareSheet.open}
            garden={shareFor}
            copied={copied}
            error={shareError}
            userNames={userNames}
            onCopy={() => void copyLink()}
            onRegenerate={() => void regenerate()}
            onRemoveMember={setPendingUnshare}
            onClose={closeShare}
          />
        )}
        </div>
        <LegalFooter />
      </div>
      <ConfirmModal
        open={confirmGarden !== null}
        title="Tuin verwijderen?"
        message={
          confirmGarden ? (
            <>
              Weet je zeker dat je <strong>{confirmGarden.name}</strong> definitief wilt verwijderen? Dit
              kan niet ongedaan worden gemaakt.
            </>
          ) : (
            ""
          )
        }
        onCancel={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmGarden) onDelete(confirmGarden.id);
          setConfirmId(null);
        }}
      />
      <ConfirmModal
        open={pendingUnshare !== null}
        title="Toegang intrekken?"
        message={
          <>
            Weet je zeker dat je <strong>{pendingUnshare ? (userNames[pendingUnshare] ?? "…") : "…"}</strong>{" "}
            de toegang tot <strong>{shareFor?.name ?? "deze tuin"}</strong> wilt intrekken?
          </>
        }
        confirmLabel="Ja, intrekken"
        onCancel={() => setPendingUnshare(null)}
        onConfirm={() => {
          const uid = pendingUnshare;
          setPendingUnshare(null);
          if (uid) void removeMember(uid);
        }}
      />
    </>
  );
}

function GardenCard({
  garden: g,
  owner,
  ownerName,
  setConfirmId,
  onOpen,
  onShare,
}: {
  garden: Garden;
  owner: boolean;
  ownerName: string;
  setConfirmId: (id: string | null) => void;
  onOpen: (id: string) => void;
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
          {owner && (
            <button
              className="gl-icon-btn gl-icon-btn-danger"
              onClick={() => setConfirmId(g.id)}
              title="Tuin verwijderen"
              aria-label={`Tuin verwijderen: ${g.name}`}
            >
              <i className="fa-solid fa-trash" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
