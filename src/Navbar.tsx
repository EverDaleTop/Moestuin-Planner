import type { ReactNode } from "react";

interface NavbarProps {
  brand: ReactNode;
  center?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * Eén gedeelde navbar voor alle pagina's. Buitenkant, hoogte, padding,
 * afronding en uitlijning zitten hier; pagina's vullen alleen brand,
 * middenstuk (optioneel) en acties in.
 */
export function Navbar({ brand, center, actions, className }: NavbarProps) {
  return (
    <header className={`app-navbar${className ? ` ${className}` : ""}`}>
      <div className="app-navbar-inner">
        <div className="app-navbar-brand">{brand}</div>
        <div className="app-navbar-center">{center}</div>
        <div className="app-navbar-actions">{actions}</div>
      </div>
    </header>
  );
}
