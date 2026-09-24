import type { Theme } from "./useTheme";

export function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: Theme;
  onToggle: () => void;
}) {
  return (
    <button
      className="theme-toggle"
      onClick={onToggle}
      title={theme === "dark" ? "Lichte modus" : "Donkere modus"}
      aria-label={theme === "dark" ? "Schakel naar lichte modus" : "Schakel naar donkere modus"}
    >
      {theme === "dark" ? (
        <i className="fa-solid fa-sun" aria-hidden />
      ) : (
        <i className="fa-solid fa-moon" aria-hidden />
      )}
    </button>
  );
}