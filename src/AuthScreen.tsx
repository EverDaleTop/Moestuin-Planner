import { useState } from "react";
import type { User } from "./types";
import { api } from "./api";
import type { Theme } from "./useTheme";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  theme: Theme;
  onToggleTheme: () => void;
  onAuthed: (user: User, token: string) => void;
}

export function AuthScreen({ theme, onToggleTheme, onAuthed }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res =
        mode === "login"
          ? await api.login(username, password)
          : await api.register(username, password);
      onAuthed(res.user, res.token);
    } catch (err: any) {
      setError(err.message ?? "Er ging iets mis.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <header className="auth-top">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>
      <div className="auth-card">
        <h1>🥕 Moestuin Planner</h1>
        <p className="auth-sub">
          Maak een account aan om je tuinen op te slaan en te delen met anderen.
        </p>

        <div className="auth-tabs">
          <button
            className={`nav-tab ${mode === "login" ? "nav-active" : ""}`}
            onClick={() => setMode("login")}
          >
            Inloggen
          </button>
          <button
            className={`nav-tab ${mode === "register" ? "nav-active" : ""}`}
            onClick={() => setMode("register")}
          >
            Account aanmaken
          </button>
        </div>

        <form
          className="auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="auth-field">
            <span>Gebruikersnaam</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              placeholder="je gebruikersnaam"
            />
          </label>
          <label className="auth-field">
            <span>Wachtwoord</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="••••••••"
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn-primary btn-block" disabled={busy || !username.trim() || !password}>
            {busy
              ? "Even geduld…"
              : mode === "login"
                ? "Inloggen"
                : "Account aanmaken"}
          </button>
        </form>
      </div>
    </div>
  );
}
