import { useEffect, useRef, useState } from "react";
import type { User } from "./types";
import type { Theme } from "./useTheme";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";
import { Navbar } from "./Navbar";
import { LogoMark } from "./Logo";
import { ConfirmModal } from "./ConfirmModal";
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
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passBusy, setPassBusy] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passOk, setPassOk] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");

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

  const deleteAccount = async () => {
    if (deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteAccount(user.hasPassword === false ? undefined : deletePassword);
      onLogout();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Account verwijderen mislukt.");
      setDeleteOpen(false);
      setDeleteBusy(false);
    }
  };

  return (
    <div className="ge-wrap">
      <Navbar
        className="navbar-profile"
        brand={
          <div className="ge-brand">
            <button
              className="ge-back"
              onClick={onBack}
              title="Terug naar tuinen"
              aria-label="Terug naar tuinen"
            >
              <i className="fa-solid fa-arrow-left" aria-hidden="true" />
            </button>
            <LogoMark className="gl-mark" />
            <span className="ge-brand-title">Profiel</span>
          </div>
        }
        actions={
          <>
            <UserMenu username={user.username} onLogout={onLogout} onOpenProfile={onOpenProfile} />
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          </>
        }
      />
      <div className="pf-page">
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
          {nameOk && (
            <div className="pf-ok" role="status" aria-live="polite">
              Naam opgeslagen.
            </div>
          )}
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
                  type={showCurrent ? "text" : "password"}
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
                  onClick={() => setShowCurrent((s) => !s)}
                  aria-label={showCurrent ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
                  aria-pressed={showCurrent}
                >
                  <i className={`fa-solid ${showCurrent ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true" />
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
                      type={showNext ? "text" : "password"}
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
                      onClick={() => setShowNext((s) => !s)}
                      aria-label={showNext ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
                      aria-pressed={showNext}
                    >
                      <i className={`fa-solid ${showNext ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true" />
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
                      type={showConfirm ? "text" : "password"}
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
                      onClick={() => setShowConfirm((s) => !s)}
                      aria-label={showConfirm ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
                      aria-pressed={showConfirm}
                    >
                      <i className={`fa-solid ${showConfirm ? "fa-eye-slash" : "fa-eye"}`} aria-hidden="true" />
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
              {passOk && (
                <div className="pf-ok" role="status" aria-live="polite">
                  Wachtwoord gewijzigd.
                </div>
              )}
            </>
          )}
        </section>

        <section className="pf-card">
          <h2 className="pf-title">
            <i className="fa-solid fa-circle-user" /> Account
          </h2>
          <div className="pf-account-actions">
            <button className="pf-logout" onClick={onLogout}>
              <i className="fa-solid fa-right-from-bracket" /> Uitloggen
            </button>
          </div>
        </section>

        <section className="pf-card pf-danger">
          <h2 className="pf-title">
            <i className="fa-solid fa-triangle-exclamation" /> Gevarenzone
          </h2>
          <div className="pf-danger-row">
            <div className="pf-danger-text">
              <strong>Account verwijderen</strong>
              <p>
                Je account en alle tuinen waarvan jij eigenaar bent worden definitief
                verwijderd. Dit kan niet ongedaan worden gemaakt.
              </p>
            </div>
            <button
              type="button"
              className="pf-danger-btn"
              onClick={() => setDeleteOpen(true)}
              disabled={user.hasPassword !== false && !deletePassword}
            >
              <i className="fa-solid fa-trash" aria-hidden="true" />
              Account verwijderen
            </button>
          </div>
          {user.hasPassword !== false && (
            <label className="pf-reauth">
              <span>Bevestig met je wachtwoord</span>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Je huidige wachtwoord"
              />
            </label>
          )}
          {deleteError && (
            <div className="auth-error" role="alert">
              {deleteError}
            </div>
          )}
        </section>

        <ConfirmModal
          open={deleteOpen}
          title="Account verwijderen?"
          message={
            <>
              Weet je zeker dat je <strong>{user.username}</strong> definitief wilt
              verwijderen? Je account en je eigen tuinen verdwijnen. Dit kan niet
              ongedaan worden gemaakt.
            </>
          }
          confirmLabel="Ja, verwijderen"
          busy={deleteBusy}
          onCancel={() => !deleteBusy && setDeleteOpen(false)}
          onConfirm={() => void deleteAccount()}
        />
      </div>
    </div>
  );
}
