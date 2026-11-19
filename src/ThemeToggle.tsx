import type { Theme } from "./useTheme";

export function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: Theme;
  onToggle: () => void;
}) {
  const dark = theme === "dark";
  return (
    <button
      className={`theme-toggle${dark ? " is-dark" : ""}`}
      onClick={onToggle}
      title={dark ? "Lichte modus" : "Donkere modus"}
      aria-label={dark ? "Schakel naar lichte modus" : "Schakel naar donkere modus"}
      aria-pressed={dark}
    >
      <span className="theme-toggle-icon theme-toggle-sun" aria-hidden>
        <i className="fa-solid fa-sun" />
      </span>
      <span className="theme-toggle-icon theme-toggle-moon" aria-hidden>
        <i className="fa-solid fa-moon" />
      </span>
      <span className="theme-toggle-knob" aria-hidden />
    </button>
  );
}

export function SidebarThemeRow({
  theme,
  onToggle,
}: {
  theme: Theme;
  onToggle: () => void;
}) {
  const dark = theme === "dark";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      className="ge-side-theme"
      onClick={onToggle}
      aria-label="Donkere modus"
    >
      <span className="ge-side-theme-label">
        <i className="fa-solid fa-circle-half-stroke" aria-hidden="true" />
        Donkere modus
      </span>
      <span className="theme-switch-track" aria-hidden="true">
        <span className="theme-switch-knob">
          <i className={dark ? "fa-solid fa-moon" : "fa-solid fa-sun"} aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}