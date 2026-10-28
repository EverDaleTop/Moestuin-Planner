import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPopover } from "./useAnchoredPopover";

interface Props {
  username: string;
  onLogout: () => void;
  onOpenProfile: () => void;
}

/**
 * Gebruikersmenu (avatar-chip + dropdown met profiel en uitloggen). Eén component dat op
 * elke pagina exact dezelfde markup rendert, zodat het menu er overal
 * hetzelfde uitziet en zich hetzelfde gedraagt.
 */
export function UserMenu({ username, onLogout, onOpenProfile }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const hoverCloseTimer = useRef<number | null>(null);
  // Ook dit menu zweeft buiten de kopbalk: daar zit het dicht tegen de
  // rechterrand en de kopbalk heeft een backdrop-filter (die maakt
  // position: fixed viewport-relatief onmogelijk).
  const anchor = useAnchoredPopover(menuOpen, "right");
  const initial = (username.trim()[0] ?? "?").toUpperCase();

  // Vloeiend sluiten: eerst de sluit-animatie, dan pas unmounten.
  const requestCloseMenu = useCallback(() => {
    if (!menuOpen || menuClosing) return;
    setMenuClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setMenuOpen(false);
      setMenuClosing(false);
      closeTimer.current = null;
    }, 160);
  }, [menuOpen, menuClosing]);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (hoverCloseTimer.current !== null) {
      window.clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
    setMenuClosing(false);
  }, []);

  const openMenu = useCallback(() => {
    cancelClose();
    setMenuOpen(true);
  }, [cancelClose]);

  // Hover opent (desktop); even wegbewegen sluit pas na een korte
  // respijt, zodat je het menu nog kunt bereiken.
  const scheduleHoverClose = useCallback(() => {
    if (hoverCloseTimer.current !== null) return;
    hoverCloseTimer.current = window.setTimeout(() => {
      hoverCloseTimer.current = null;
      requestCloseMenu();
    }, 220);
  }, [requestCloseMenu]);

  const toggleMenu = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (menuOpen && !menuClosing) {
      requestCloseMenu();
      return;
    }
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setMenuClosing(false);
    setMenuOpen(true);
  };

  // Sluit het gebruikersmenu bij klikken elders of Escape. Het menu zelf zweeft
  // buiten de knop (portal), dus tel het mee anders sluit het al bij het
  // aanzetten van je vinger en werkt "Uitloggen" niet.
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e?: Event) => {
      const t = e?.target as Node | undefined;
      if (t && anchor.popRef.current?.contains(t)) return;
      requestCloseMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestCloseMenu();
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, requestCloseMenu]);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
      if (hoverCloseTimer.current !== null) window.clearTimeout(hoverCloseTimer.current);
    },
    []
  );

  return (
    <div
      className="user-menu"
      onMouseEnter={openMenu}
      onMouseLeave={scheduleHoverClose}
    >
      <button
        ref={anchor.triggerRef as never}
        className="gl-user-chip"
        onClick={toggleMenu}
        aria-haspopup="menu"
        aria-expanded={menuOpen && !menuClosing}
        title={username}
      >
        <span className="gl-avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="gl-username">{username}</span>
        <i
          className={`fa-solid fa-chevron-down gl-chip-chevron${menuOpen && !menuClosing ? " open" : ""}`}
          aria-hidden="true"
        />
      </button>
      {menuOpen &&
        createPortal(
          <div
            ref={anchor.popRef as never}
            className={`gl-menu gl-menu-fixed gl-menu-fade${menuClosing ? " closing" : ""}`}
            role="menu"
            aria-label="Accountmenu"
            onMouseEnter={cancelClose}
            onMouseLeave={() => requestCloseMenu()}
            style={{
              top: anchor.pos?.top ?? -9999,
              left: anchor.pos?.left ?? -9999,
              visibility: anchor.pos?.ready ? "visible" : "hidden",
            }}
          >
            <button
              className="gl-menu-head"
              onClick={() => {
                setMenuOpen(false);
                onOpenProfile();
              }}
              title="Open je profiel"
              aria-label={`Open profiel van ${username}`}
            >
              <span className="gl-avatar" aria-hidden="true">
                {initial}
              </span>
              <div className="gl-menu-head-text">
                <div className="gl-menu-name">{username}</div>
                <div className="gl-menu-sub">Bekijk profiel</div>
              </div>
              <i className="fa-solid fa-chevron-right gl-menu-head-go" aria-hidden="true" />
            </button>
            <button
              className="gl-menu-item gl-menu-danger"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onLogout();
              }}
            >
              <i className="fa-solid fa-right-from-bracket" aria-hidden="true" /> Uitloggen
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
