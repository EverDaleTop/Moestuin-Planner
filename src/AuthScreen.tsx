import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { User } from "./types";
import { api } from "./api";
import type { Theme } from "./useTheme";
import { ThemeToggle } from "./ThemeToggle";
import { LegalFooter } from "./LegalPage";
import { LogoMark } from "./Logo";
import { Navbar } from "./Navbar";
import { AuthToast } from "./AuthToast";

interface Props {
  theme: Theme;
  onToggleTheme: () => void;
  onAuthed: (user: User, token: string) => void;
}

const GOOGLE_SCRIPT_ID = "google-identity-services";

function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google-script laden mislukt.")), {
        once: true,
      });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = GOOGLE_SCRIPT_ID;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google-script laden mislukt."));
    document.head.appendChild(script);
  });
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
  const [googleReady, setGoogleReady] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const googleBtnRef = useRef<HTMLDivElement | null>(null);
  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();

  // Directe Google-login via Google Identity Services. Geen Supabase Auth meer:
  // de browser krijgt een Google ID-token en de backend verifieert die.
  useEffect(() => {
    if (!googleClientId) return;
    let cancelled = false;

    void (async () => {
      try {
        await loadGoogleIdentity();
        if (cancelled || !window.google?.accounts?.id || !googleBtnRef.current) return;
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          auto_select: false,
          cancel_on_tap_outside: true,
          callback: async (response) => {
            if (!response.credential) return;
            setError(null);
            setGoogleBusy(true);
            try {
              const res = await api.loginWithGoogle(response.credential);
              onAuthed(res.user, res.token);
            } catch (err: any) {
              setError(err.message ?? "Inloggen met Google mislukt.");
            } finally {
              setGoogleBusy(false);
            }
          },
        });
        googleBtnRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          logo_alignment: "left",
          locale: "nl",
          width: 320,
        });
        if (!cancelled) setGoogleReady(true);
      } catch (err: any) {
        if (!cancelled) {
          setGoogleError(err?.message ?? "Google-login kon niet geladen worden.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [googleClientId, onAuthed]);

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

            <div
              className={`btn-google-slot${googleReady ? " is-ready" : ""}${
                googleBusy ? " is-busy" : ""
              }`}
            >
              <div ref={googleBtnRef} className="btn-google-render" />
              {googleClientId && !googleReady && !googleError && (
                <span className="btn-google-loading">Google laden…</span>
              )}
              {googleBusy && <span className="btn-google-loading">Bezig met Google…</span>}
            </div>
            {!googleClientId && (
              <p className="insp-hint auth-hint">
                <i className="fa-solid fa-circle-info" aria-hidden /> Google-login is niet
                ingesteld. Zet <code>VITE_GOOGLE_CLIENT_ID</code> in je frontend-env.
              </p>
            )}
            {googleError && (
              <p className="insp-hint auth-hint">
                <i className="fa-solid fa-triangle-exclamation" aria-hidden /> {googleError}
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

              {createPortal(
                <div className="auth-toast-stack">
                  <AuthToast kind="error" message={error} onClose={() => setError(null)} />
                  <AuthToast kind="notice" message={notice} onClose={() => setNotice(null)} />
                </div>,
                document.body
              )}

              <button type="submit" className="btn-primary btn-block auth-submit" disabled={!canSubmit}>
                {busy ? (
                  <i className="fa-solid fa-circle-notch fa-spin" aria-label="Bezig" />
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
