import { useEffect, useRef, useState } from "react";
import type { User } from "./types";
import type { Theme } from "./useTheme";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";
import { api } from "./api";

interface Props {
  user: User;
  theme: Theme;
  onToggleTheme: () => void;
  onBack: () => void;
  onLogout: () => void;
  onOpenProfile: () => void;
  onProfileUpdated: (user: User) => void;
}

export function ProfilePage({ user, theme, onToggleTheme, onBack, onLogout, onOpenProfile, onProfileUpdated }: Props) {
  const [name, setName] = useState(user.username);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  // Na een succesvolle hernoeming komt de nieuwe naam via props binnen:
  // neem die over, behalve terwijl je er zelf in typt.
  useEffect(() => {
    if (document.activeElement !== nameInputRef.current) setName(user.username);
  }, [user.username]);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameOk, setNameOk] = useState(false);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [passBusy, setPassBusy] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passOk, setPassOk] = useState(false);

  const initial = (user.username.trim()[0] ?? "?").toUpperCase();
  const memberSince = new Date(user.createdAt).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === user.username || nameBusy) return;
    setNameBusy(true);
    setNameError(null);
    setNameOk(false);
    try {
      const res = await api.updateUsername(trimmed);
      onProfileUpdated(res.user);
      setNameOk(true);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Naam wijzigen mislukt.");
    } finally {
      setNameBusy(false);
    }
  };

  const savePassword = async () => {
    if (passBusy) return;
    if (next !== confirm) {
      setPassError("Nieuwe wachtwoorden komen niet overeen.");
      return;
    }
    setPassBusy(true);
    setPassError(null);
    setPassOk(false);
    try {
      await api.updatePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setPassOk(true);
    } catch (err) {
      setPassError(err instanceof Error ? err.message : "Wachtwoord wijzigen mislukt.");
    } finally {
      setPassBusy(false);
    }
  };

  return (
    <>
      <header className="gl-header">
        <div className="gl-header-inner">
          <div className="gl-brand">
            <button className="gl-back-btn" onClick={onBack} aria-label="Terug naar tuinen">
              <i className="fa-solid fa-arrow-left" />
            </button>
            <span className="gl-mark" aria-hidden="true">
              <i className="fa-solid fa-carrot" />
            </span>
            <h1>Pluktuintje</h1>
          </div>
          <div className="gl-account">
            <UserMenu username={user.username} onLogout={onLogout} onOpenProfile={onOpenProfile} />
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </div>
        </div>
      </header>
      <div className="gl-wrap pf-wrap">
        <h2 className="gl-section pf-page-title">
          <i className="fa-solid fa-circle-user" /> Profiel
        </h2>
        <section className="pf-card">
          <div className="pf-identity">
            <span className="pf-avatar" aria-hidden="true">
              {initial}
            </span>
            <div>
              <div className="pf-name">{user.username}</div>
              <div className="pf-sub">Lid sinds {memberSince}</div>
            </div>
          </div>
          <label className="pf-label" htmlFor="pf-name">
            Profielnaam
          </label>
          <div className="pf-row">
            <input
              id="pf-name"
              ref={nameInputRef}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameOk(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && void saveName()}
              placeholder="Kies een naam"
              aria-label="Profielnaam"
              maxLength={40}
              autoComplete="username"
            />
            <button
              className="btn-primary"
              onClick={() => void saveName()}
              disabled={nameBusy || !name.trim() || name.trim() === user.username}
            >
              {nameBusy ? "Opslaan…" : "Opslaan"}
            </button>
          </div>
          <p className="pf-hint">Alleen letters, cijfers, _ - . Minimaal 2 tekens.</p>
          {nameError && <div className="auth-error">{nameError}</div>}
          {nameOk && <div className="pf-ok">Naam opgeslagen.</div>}
        </section>

        <section className="pf-card">
          <h2 className="pf-title">
            <i className="fa-solid fa-key" /> Wachtwoord
          </h2>
          {user.hasPassword === false ? (
            <p className="pf-sub">
              Je logt in via Google; dit account heeft geen wachtwoord om te wijzigen.
            </p>
          ) : (
            <>
              <label className="pf-label" htmlFor="pf-current">
                Huidig wachtwoord
              </label>
              <div className="pf-passwrap">
                <input
                  id="pf-current"
                  type={showPasswords ? "text" : "password"}
                  value={current}
                  onChange={(e) => {
                    setCurrent(e.target.value);
                    setPassOk(false);
                  }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="pf-eye"
                  onClick={() => setShowPasswords((s) => !s)}
                  aria-label={showPasswords ? "Wachtwoorden verbergen" : "Wachtwoorden tonen"}
                  aria-pressed={showPasswords}
                >
                  <i className={`fa-solid ${showPasswords ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true" />
                </button>
              </div>
              <div className="pf-grid">
                <div>
                  <label className="pf-label" htmlFor="pf-next">
                    Nieuw wachtwoord
                  </label>
                  <div className="pf-passwrap">
                    <input
                      id="pf-next"
                      type={showPasswords ? "text" : "password"}
                      value={next}
                      onChange={(e) => {
                        setNext(e.target.value);
                        setPassOk(false);
                      }}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="pf-eye"
                      onClick={() => setShowPasswords((s) => !s)}
                      aria-label={showPasswords ? "Wachtwoorden verbergen" : "Wachtwoorden tonen"}
                      aria-pressed={showPasswords}
                    >
                      <i className={`fa-solid ${showPasswords ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="pf-label" htmlFor="pf-confirm">
                    Herhaal nieuw wachtwoord
                  </label>
                  <div className="pf-passwrap">
                    <input
                      id="pf-confirm"
                      type={showPasswords ? "text" : "password"}
                      value={confirm}
                      onChange={(e) => {
                        setConfirm(e.target.value);
                        setPassOk(false);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && void savePassword()}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="pf-eye"
                      onClick={() => setShowPasswords((s) => !s)}
                      aria-label={showPasswords ? "Wachtwoorden verbergen" : "Wachtwoorden tonen"}
                      aria-pressed={showPasswords}
                    >
                      <i className={`fa-solid ${showPasswords ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="pf-actions">
                <button
                  className="btn-primary"
                  onClick={() => void savePassword()}
                  disabled={passBusy || !current || !next || !confirm}
                >
                  {passBusy ? "Opslaan…" : "Wachtwoord wijzigen"}
                </button>
              </div>
              {passError && <div className="auth-error">{passError}</div>}
              {passOk && <div className="pf-ok">Wachtwoord gewijzigd.</div>}
            </>
          )}
        </section>

        <section className="pf-card">
          <h2 className="pf-title">
            <i className="fa-solid fa-circle-user" /> Account
          </h2>
          <button className="pf-logout" onClick={onLogout}>
            <i className="fa-solid fa-right-from-bracket" /> Uitloggen
          </button>
        </section>
      </div>
    </>
  );
}
