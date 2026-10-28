import { useEffect, useState } from "react";
import type { User } from "./types";
import { api } from "./api";
import { getSupabase, isSupabaseConfigured } from "./lib/supabaseClient";
import type { Theme } from "./useTheme";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  theme: Theme;
  onToggleTheme: () => void;
  onAuthed: (user: User, token: string) => void;
}

function GoogleGLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.8-5 3.8-8.9z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.2 0-5.9-2.1-6.8-5l-.1.1-3.7 2.9v.1C3.3 21.3 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.6-2.8-.1.1C.5 8.6 0 10.2 0 12s.5 3.4 1.4 4.9l3.8-2.5z" />
      <path fill="#EA4335" d="M12 4.6c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.3 0 3.3 2.7 1.4 6.7l3.8 2.9c.9-2.9 3.6-5 6.8-5z" />
    </svg>
  );
}

export function AuthScreen({ theme, onToggleTheme, onAuthed }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  // Supabase OAuth-callback: na redirect zit er een sessie in de URL.
  // Wissel die meteen in voor een lokale app-sessie.
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let cancelled = false;
    sb.auth.getSession().then(async ({ data }) => {
      if (cancelled || !data.session?.access_token) return;
      try {
        setGoogleBusy(true);
        const res = await api.loginWithSupabase(data.session.access_token);
        onAuthed(res.user, res.token);
      } catch (err: any) {
        if (!cancelled) setError(err.message ?? "Supabase-login mislukt.");
      } finally {
        if (!cancelled) setGoogleBusy(false);
      }
    });
    const { data: sub } = sb.auth.onAuthStateChange(async (_event, session) => {
      if (cancelled || !session?.access_token) return;
      try {
        setGoogleBusy(true);
        const res = await api.loginWithSupabase(session.access_token);
        onAuthed(res.user, res.token);
      } catch (err: any) {
        if (!cancelled) setError(err.message ?? "Supabase-login mislukt.");
      } finally {
        if (!cancelled) setGoogleBusy(false);
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (busy) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res =
        mode === "login"
          ? await api.login(username, password, rememberMe)
          : await api.register(username, password);
      onAuthed(res.user, res.token);
    } catch (err: any) {
      setError(err.message ?? "Er ging iets mis.");
    } finally {
      setBusy(false);
    }
  };

  const loginWithSupabaseGoogle = async () => {
    const sb = getSupabase();
    if (!sb) {
      setNotice(
        "Google-login via Supabase is nog niet ingesteld. Zet VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY en schakel de Google-provider in (zie supabase/schema.sql)."
      );
      return;
    }
    setError(null);
    setGoogleBusy(true);
    try {
      const { error } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
      // Redirect volgt; de callback hierboven handelt de rest af.
    } catch (err: any) {
      setError(err.message ?? "Inloggen met Google mislukt.");
      setGoogleBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <header className="auth-topbar">
        <div className="auth-brand-mini">
          <span className="auth-logo-mini">
            <i className="fa-solid fa-carrot" aria-hidden />
          </span>
          <span>Pluktuintje</span>
        </div>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <main className="auth-layout">
        <div className="auth-split">
        {/* Linker hero-paneel */}
        <section className="auth-hero" aria-hidden={false}>
          <div className="auth-hero-inner">
            <div className="auth-hero-badge">
              <i className="fa-solid fa-seedling" aria-hidden /> Voor moestuinders
            </div>
            <h1>
              Plan je moestuin,
              <span className="auth-hero-accent"> oogst meer.</span>
            </h1>
            <p className="auth-hero-sub">
              Teken je bedden, plan je gewassen, houd zaai- en oogstdata bij en
              deel je tuin met anderen — alles op één plek.
            </p>
            <ul className="auth-hero-list">
              <li>
                <i className="fa-solid fa-check" aria-hidden /> Tuinen tekenen &amp; delen
              </li>
              <li>
                <i className="fa-solid fa-check" aria-hidden /> Zaai- &amp; oogstkalender
              </li>
              <li>
                <i className="fa-solid fa-check" aria-hidden /> Veilig opgeslagen in Supabase
              </li>
            </ul>
            <div className="auth-hero-crops" aria-hidden>
              <span>🥕</span>
              <span>🍅</span>
              <span>🥬</span>
              <span>🥔</span>
              <span>🌻</span>
            </div>
          </div>
        </section>

        {/* Rechter formulier-paneel */}
        <section className="auth-panel">
          <div className="auth-card-new">
            <div className="auth-card-head">
              <span className="auth-logo" aria-hidden="true">
                <i className="fa-solid fa-carrot" aria-hidden />
              </span>
              <div className="auth-head-text">
                <h2>{mode === "login" ? "Welkom terug" : "Maak je account"}</h2>
                <p className="auth-sub-new">
                  {mode === "login"
                    ? "Log in om verder te gaan met je tuinen."
                    : "Maak een account aan om te beginnen."}
                </p>
              </div>
            </div>

            {/* Google-login via Supabase */}
            <div className="auth-google-stack">
              <button
                type="button"
                className="btn-google"
                onClick={() => void loginWithSupabaseGoogle()}
                disabled={googleBusy}
              >
                <GoogleGLogo />
                {googleBusy ? "Bezig met Google…" : "Inloggen met Google"}
              </button>
              {!isSupabaseConfigured && (
                <p className="auth-hint">
                  <i className="fa-solid fa-circle-info" aria-hidden /> Google-login is nog niet
                  ingesteld. Voeg Supabase-keys toe — zie <code>.env.example</code>.
                </p>
              )}
            </div>

            <div className="auth-tabs-new" role="tablist" aria-label="Inloggen of registreren">
              <button
                role="tab"
                aria-selected={mode === "login"}
                className={`auth-tab-new ${mode === "login" ? "active" : ""}`}
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
              >
                Inloggen
              </button>
              <button
                role="tab"
                aria-selected={mode === "register"}
                className={`auth-tab-new ${mode === "register" ? "active" : ""}`}
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
              >
                Account aanmaken
              </button>
            </div>

            <form
              className="auth-form-new"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <label className="auth-field-new">
                <span>
                  <i className="fa-solid fa-user" aria-hidden /> Gebruikersnaam
                </span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  autoComplete="username"
                  placeholder="bijv. moestuin-fan"
                />
              </label>
              <label className="auth-field-new">
                <span>
                  <i className="fa-solid fa-lock" aria-hidden /> Wachtwoord
                </span>
                <span className="auth-password-wrap">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="auth-pass-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
                  >
                    <i className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`} aria-hidden />
                  </button>
                </span>
              </label>

              {mode === "login" && (
                <label className="auth-remember">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Onthoud mij</span>
                </label>
              )}
              {error && (
                <div className="auth-error-new" role="alert">
                  <i className="fa-solid fa-triangle-exclamation" aria-hidden /> {error}
                </div>
              )}
              {notice && (
                <div className="auth-notice" role="status">
                  <i className="fa-solid fa-circle-info" aria-hidden /> {notice}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary btn-block btn-auth-submit"
                disabled={busy || !username.trim() || !password}
              >
                {busy ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin" aria-hidden /> Even geduld…
                  </>
                ) : mode === "login" ? (
                  <>
                    <i className="fa-solid fa-right-to-bracket" aria-hidden /> Inloggen
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-user-plus" aria-hidden /> Account aanmaken
                  </>
                )}
              </button>
            </form>
          </div>
        </section>
        </div>
      </main>
    </div>
  );
}
