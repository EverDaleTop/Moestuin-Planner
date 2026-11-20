import { useEffect, useState } from "react";
import type { User } from "./types";
import { api } from "./api";
import { getSupabase, isSupabaseConfigured } from "./lib/supabaseClient";
import type { Theme } from "./useTheme";
import { ThemeToggle } from "./ThemeToggle";
import { LegalFooter } from "./LegalPage";
import { LogoMark } from "./Logo";
import { Navbar } from "./Navbar";

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

const FEATURES = [
  {
    icon: "fa-solid fa-draw-polygon",
    tint: "sow",
    title: "Teken je tuin",
    text: "Bedden, paden en vakken in een paar klikken op de canvas.",
  },
  {
    icon: "fa-solid fa-calendar-days",
    tint: "harvest",
    title: "Zaai & oogst op tijd",
    text: "Kalender met zaaivensters, meldingen en taken per gewas.",
  },
  {
    icon: "fa-solid fa-users",
    tint: "info",
    title: "Deel & werk samen",
    text: "Nodig anderen uit met een link en tuinier live samen.",
  },
];

function passwordStrength(p: string): { level: "empty" | "weak" | "medium" | "strong"; label: string; tip: string } {
  if (!p) return { level: "empty", label: "Minimaal 6 tekens", tip: "" };
  if (p.length < 6) {
    return { level: "weak", label: "Zwak", tip: `Nog ${6 - p.length} teken${6 - p.length === 1 ? "" : "s"}` };
  }
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  let score = 1;
  if (p.length >= 8) score = 2;
  if (p.length >= 12 || (p.length >= 10 && classes >= 3) || (p.length >= 8 && classes >= 4)) score = 3;
  if (score === 3) return { level: "strong", label: "Sterk", tip: "Goed wachtwoord" };
  if (score === 2) return { level: "medium", label: "Redelijk", tip: "Voeg hoofdletters, cijfers of symbolen toe" };
  return { level: "weak", label: "Zwak", tip: "Maak het langer en varieer tekens" };
}

export function AuthScreen({ theme, onToggleTheme, onAuthed }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  // Supabase OAuth-callback: na redirect zit er een sessie in de URL.
  // Wissel die meteen in voor een lokale app-sessie.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    void (async () => {
      const sb = await getSupabase();
      if (!sb || cancelled) return;
      const { data } = await sb.auth.getSession();
      if (cancelled) return;
      if (data.session?.access_token) {
        try {
          setGoogleBusy(true);
          const res = await api.loginWithSupabase(data.session.access_token);
          onAuthed(res.user, res.token);
        } catch (err: any) {
          if (!cancelled) setError(err.message ?? "Supabase-login mislukt.");
        } finally {
          if (!cancelled) setGoogleBusy(false);
        }
      }
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
      unsubscribe = () => sub.subscription.unsubscribe();
      if (cancelled) unsubscribe();
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
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

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const loginWithSupabaseGoogle = async () => {
    const sb = await getSupabase();
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

  const canSubmit = !busy && username.trim().length > 0 && password.length > 0;
  const strength = passwordStrength(password);

  return (
    <div className="auth-shell">
      <Navbar
        className="navbar-auth"
        brand={
          <div className="gl-brand">
            <LogoMark className="gl-mark" />
            <h1>oogstplan</h1>
          </div>
        }
        actions={<ThemeToggle theme={theme} onToggle={onToggleTheme} />}
      />

      <main className="auth-wrap">
        <div className="auth-grid">
          <section className="auth-intro">
            <h2 className="auth-title">
              Plan je moestuin,
              <br />
              oogst meer.
            </h2>
            <p className="auth-sub">
              Teken bedden, plan gewassen en houd zaai-, oogst- en taken bij — alles op één plek,
              samen met je mede-tuiniers.
            </p>
            <ul className="auth-feats">
              {FEATURES.map((f) => (
                <li key={f.title} className="auth-feat">
                  <span className={`auth-feat-ic is-${f.tint}`} aria-hidden="true">
                    <i className={f.icon} />
                  </span>
                  <span className="auth-feat-tx">
                    <strong>{f.title}</strong>
                    <span>{f.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="cal-panel auth-card" aria-label="Inloggen of account aanmaken">
            <div className="auth-card-top">
              <LogoMark className="auth-card-mark" size={48} />
              <div>
                <h3>{mode === "login" ? "Welkom terug" : "Maak je account"}</h3>
                <p>
                  {mode === "login"
                    ? "Log in om verder te gaan met je tuinen."
                    : "Kies een gebruikersnaam en wachtwoord om te starten."}
                </p>
              </div>
            </div>

            <div className="auth-tabs" role="tablist" aria-label="Inloggen of registreren">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                className={`auth-tab${mode === "login" ? " is-active" : ""}`}
                onClick={() => switchMode("login")}
              >
                <i className="fa-solid fa-right-to-bracket" aria-hidden />
                Inloggen
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "register"}
                className={`auth-tab${mode === "register" ? " is-active" : ""}`}
                onClick={() => switchMode("register")}
              >
                <i className="fa-solid fa-user-plus" aria-hidden />
                Aanmelden
              </button>
            </div>

            <button
              type="button"
              className="btn-google"
              onClick={() => void loginWithSupabaseGoogle()}
              disabled={googleBusy}
            >
              <GoogleGLogo />
              {googleBusy ? "Bezig met Google…" : "Verder met Google"}
            </button>
            {!isSupabaseConfigured && (
              <p className="insp-hint auth-hint">
                <i className="fa-solid fa-circle-info" aria-hidden /> Google-login is nog niet
                ingesteld. Voeg Supabase-keys toe — zie <code>.env.example</code>.
              </p>
            )}

            <div className="auth-divider" aria-hidden="true">
              <span>of met e-mail</span>
            </div>

            <form
              className="auth-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <div className="shop-form-field">
                <label htmlFor="auth-username">Gebruikersnaam</label>
                <span className="auth-input-ic">
                  <i className="fa-solid fa-user" aria-hidden />
                  <input
                    id="auth-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    placeholder="bijv. moestuin-fan"
                  />
                </span>
              </div>
              <div className="shop-form-field">
                <label htmlFor="auth-password">Wachtwoord</label>
                <span className="auth-input-ic has-toggle">
                  <i className="fa-solid fa-lock" aria-hidden />
                  <input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    placeholder={mode === "login" ? "Je wachtwoord" : "Minimaal 6 tekens"}
                  />
                  <button
                    type="button"
                    className="auth-pass-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
                  >
                    <i
                      className={`fa-solid ${showPassword ? "fa-eye-slash" : "fa-eye"}`}
                      aria-hidden
                    />
                  </button>
                </span>
              </div>

              {mode === "login" ? (
                <label className="auth-remember">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Onthoud mij op dit apparaat</span>
                </label>
              ) : (
                <div className={`auth-strength is-${strength.level}`} aria-live="polite">
                  <div className="auth-strength-bars" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="auth-strength-info">
                    <span className="auth-strength-label">{strength.label}</span>
                    {strength.tip && <span className="auth-strength-tip">{strength.tip}</span>}
                  </div>
                </div>
              )}

              {error && (
                <div className="auth-toast auth-toast-error" role="alert" aria-live="assertive">
                  <i className="fa-solid fa-triangle-exclamation" aria-hidden />
                  <span>{error}</span>
                  <button
                    type="button"
                    className="auth-toast-close"
                    onClick={() => setError(null)}
                    aria-label="Melding sluiten"
                  >
                    <i className="fa-solid fa-xmark" aria-hidden />
                  </button>
                </div>
              )}
              {notice && (
                <div className="auth-toast auth-toast-notice" role="status" aria-live="polite">
                  <i className="fa-solid fa-circle-info" aria-hidden />
                  <span>{notice}</span>
                  <button
                    type="button"
                    className="auth-toast-close"
                    onClick={() => setNotice(null)}
                    aria-label="Melding sluiten"
                  >
                    <i className="fa-solid fa-xmark" aria-hidden />
                  </button>
                </div>
              )}

              <button type="submit" className="btn-primary btn-block auth-submit" disabled={!canSubmit}>
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

              <p className="auth-switch">
                {mode === "login" ? (
                  <>
                    Nog geen account?{" "}
                    <button type="button" onClick={() => switchMode("register")}>
                      Maak er een aan
                    </button>
                  </>
                ) : (
                  <>
                    Al een account?{" "}
                    <button type="button" onClick={() => switchMode("login")}>
                      Log in
                    </button>
                  </>
                )}
              </p>
            </form>
          </section>
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}
