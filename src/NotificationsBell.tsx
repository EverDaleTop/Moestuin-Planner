import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPopover } from "./useAnchoredPopover";

export type NotificationTab = "kalender" | "oogst" | "boodschappen" | "taken";

interface Props {
  sowable: number;
  harvestable: number;
  openShopping: number;
  openTodos: number;
  onGo: (tab: NotificationTab) => void;
}

interface Item {
  key: string;
  icon: string;
  text: string;
  tab: NotificationTab;
}

/**
 * Bel-icoon in de navbar dat alle meldingen bundelt (te zaaien, te oogsten,
 * openstaande boodschappen). Klikken op een melding navigeert naar de
 * bijbehorende tab. Dropdowns elders in de navbar blijven bewust schoon.
 */
export function NotificationsBell({ sowable, harvestable, openShopping, openTodos, onGo }: Props) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Menu zit vlak bij de rechterrand en is breder dan de ruimte daar: zweef
  // het daarom buiten de kopbalk en clamp het aan het scherm.
  const anchor = useAnchoredPopover(open, "center");

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const closeMenu = () => {
    if (closing) return;
    setClosing(true);
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      closeTimer.current = null;
    }, 150);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (
        rootRef.current &&
        !rootRef.current.contains(t) &&
        !anchor.popRef.current?.contains(t)
      ) {
        closeMenu();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    []
  );

  const items: Item[] = [];
  if (harvestable > 0) {
    items.push({
      key: "harvest",
      icon: "fa-basket-shopping",
      text: `${harvestable} ${harvestable === 1 ? "gewas" : "gewassen"} te oogsten`,
      tab: "oogst",
    });
  }
  if (sowable > 0) {
    items.push({
      key: "sow",
      icon: "fa-seedling",
      text: `${sowable} nu te zaaien`,
      tab: "kalender",
    });
  }
  if (openShopping > 0) {
    items.push({
      key: "shopping",
      icon: "fa-cart-shopping",
      text: `${openShopping} openstaande boodschappen`,
      tab: "boodschappen",
    });
  }
  if (openTodos > 0) {
    items.push({
      key: "todos",
      icon: "fa-list-check",
      text: `${openTodos} openstaande ${openTodos === 1 ? "taak" : "taken"}`,
      tab: "taken",
    });
  }
  const total = harvestable + sowable + openShopping + openTodos;

  return (
    <div className="ge-bell-wrap" ref={rootRef}>
      <button
        ref={anchor.triggerRef as never}
        className="ge-bell"
        onClick={() => {
          if (open && !closing) {
            closeMenu();
            return;
          }
          cancelClose();
          setClosing(false);
          setOpen(true);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={total > 0 ? `${total} meldingen` : "Geen nieuwe meldingen"}
        aria-label="Meldingen"
      >
        <i className="fa-solid fa-bell" aria-hidden="true" />
        {total > 0 && (
          <span className="ge-bell-badge" aria-hidden="true">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>
      {open &&
        createPortal(
          <div
            ref={anchor.popRef as never}
            className={`gl-menu gl-menu-fixed gl-menu-fade${closing ? " closing" : ""}`}
            role="menu"
            aria-label="Meldingen"
            style={{
              top: anchor.pos?.top ?? -9999,
              left: anchor.pos?.left ?? -9999,
              visibility: anchor.pos?.ready ? "visible" : "hidden",
            }}
          >
          {items.length === 0 ? (
            <div className="ge-bell-empty">Geen nieuwe meldingen.</div>
          ) : (
            items.map((i) => (
              <button
                key={i.key}
                type="button"
                role="menuitem"
                className="gl-menu-item"
                onClick={() => {
                  onGo(i.tab);
                  closeMenu();
                }}
              >
                <i className={`fa-solid ${i.icon}`} aria-hidden="true" />
                <span className="gl-menu-name">{i.text}</span>
                <i className="fa-solid fa-chevron-right gl-bell-go" aria-hidden="true" />
              </button>
            ))
          )}
          </div>,
          document.body
        )}
    </div>
  );
}
